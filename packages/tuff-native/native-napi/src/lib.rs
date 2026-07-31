use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use napi::bindgen_prelude::{Buffer, Function, PromiseRaw};
use napi::threadsafe_function::{ThreadsafeCallContext, ThreadsafeFunctionCallMode};
use napi::{Env, Error, Result, Status};
use napi_derive::napi;
use tuff_native_core::{
    BinaryPacket, CancelTargetType, Control, NativeRuntime, ProtocolError, RuntimeDescriptor,
    StreamMessage, decode_control, encode_control, negotiate_version,
};

pub const ADAPTER_VERSION: &str = env!("CARGO_PKG_VERSION");
const TSFN_QUEUE_CAPACITY: usize = tuff_native_core::HARD_MAX_STREAM_WINDOW as usize + 1;

#[napi(object)]
pub struct NapiPacket {
    pub control: String,
    pub attachments: Vec<Buffer>,
}

pub struct NapiRuntimeAdapter {
    runtime: Arc<NativeRuntime>,
    descriptor: RuntimeDescriptor,
    cleanup_registered: AtomicBool,
    callbacks_alive: Arc<AtomicBool>,
}

impl NapiRuntimeAdapter {
    pub fn new(runtime: Arc<NativeRuntime>, descriptor: RuntimeDescriptor) -> Self {
        Self {
            runtime,
            descriptor,
            cleanup_registered: AtomicBool::new(false),
            callbacks_alive: Arc::new(AtomicBool::new(true)),
        }
    }

    pub fn handshake(&self, env: &Env, encoded: String) -> Result<String> {
        self.ensure_cleanup(env)?;
        let hello = decode_control(&encoded).map_err(to_napi_error)?;
        let Control::ClientHello {
            protocol,
            requested_features,
            ..
        } = hello
        else {
            return Err(to_napi_error(ProtocolError::invalid_envelope()));
        };
        let carrier_features = vec!["attachments".to_string(), "stream-credit-v1".to_string()];
        let selected = negotiate_version(protocol, &requested_features, &carrier_features)
            .map_err(to_napi_error)?;
        let response = Control::ServerHello {
            protocol: selected,
            runtime: self.descriptor.clone(),
            carrier_features,
            limits: self.runtime.limits().clone(),
            capabilities: self.runtime.descriptors(),
        };
        encode_control(&response).map_err(to_napi_error)
    }

    pub fn invoke<'env>(
        &self,
        env: &'env Env,
        encoded: String,
        attachments: Vec<Buffer>,
    ) -> Result<PromiseRaw<'env, NapiPacket>> {
        self.ensure_cleanup(env)?;
        let owned_attachments = copy_attachments(attachments);
        let runtime = Arc::clone(&self.runtime);
        env.spawn_future(async move {
            let control = decode_control(&encoded).map_err(to_napi_error)?;
            let packet = runtime
                .invoke(control, owned_attachments)
                .await
                .map_err(to_napi_error)?;
            packet_to_napi(packet)
        })
    }

    pub fn open_stream(
        &self,
        env: &Env,
        encoded: String,
        attachments: Vec<Buffer>,
        on_frame: Function<'_, NapiPacket, ()>,
    ) -> Result<NapiPacket> {
        self.ensure_cleanup(env)?;
        let owned_attachments = copy_attachments(attachments);
        let control = decode_control(&encoded).map_err(to_napi_error)?;
        let runtime = Arc::clone(&self.runtime);
        let mut opened = napi::bindgen_prelude::within_runtime_if_available(|| {
            runtime.open_stream(control, owned_attachments)
        })
        .map_err(to_napi_error)?;
        let stream_id = opened.stream_id.clone();
        let accepted = packet_to_napi(opened.accepted)?;
        let callbacks_alive = Arc::clone(&self.callbacks_alive);
        let callback = on_frame
            .build_threadsafe_function::<NapiPacket>()
            .max_queue_size::<TSFN_QUEUE_CAPACITY>()
            .build_callback(|context: ThreadsafeCallContext<NapiPacket>| Ok(context.value))?;

        napi::bindgen_prelude::spawn(async move {
            while let Some(message) = opened.receiver.recv().await {
                if !callbacks_alive.load(Ordering::Acquire) {
                    runtime.cancel_stream(&stream_id, tuff_native_core::CancelReason::Dispose);
                    break;
                }
                let terminal = is_terminal(&message);
                let packet = match stream_message_to_napi(message) {
                    Ok(packet) => packet,
                    Err(_) => {
                        runtime.fault_stream(&stream_id).ok();
                        break;
                    }
                };
                match callback.call(packet, ThreadsafeFunctionCallMode::NonBlocking) {
                    Status::Ok => {
                        if terminal {
                            break;
                        }
                    }
                    Status::QueueFull => {
                        runtime.fault_stream(&stream_id).ok();
                        break;
                    }
                    Status::Closing => {
                        runtime.cancel_stream(&stream_id, tuff_native_core::CancelReason::Dispose);
                        break;
                    }
                    _ => {
                        runtime.fault_stream(&stream_id).ok();
                        break;
                    }
                }
            }
        });
        Ok(accepted)
    }

    pub fn acknowledge(&self, env: &Env, encoded: String) -> Result<()> {
        self.ensure_cleanup(env)?;
        let control = decode_control(&encoded).map_err(to_napi_error)?;
        let Control::StreamAck {
            stream_id,
            ack_sequence,
            ..
        } = control
        else {
            return Err(to_napi_error(ProtocolError::invalid_envelope()));
        };
        self.runtime
            .acknowledge_stream(&stream_id, ack_sequence)
            .map(|_| ())
            .map_err(to_napi_error)
    }

    pub fn cancel(&self, env: &Env, encoded: String) -> Result<()> {
        self.ensure_cleanup(env)?;
        let control = decode_control(&encoded).map_err(to_napi_error)?;
        let Control::Cancel { target, reason, .. } = control else {
            return Err(to_napi_error(ProtocolError::invalid_envelope()));
        };
        match target.target_type {
            CancelTargetType::Request => {
                self.runtime.cancel_request(&target.id, reason);
            }
            CancelTargetType::Stream => {
                self.runtime.cancel_stream(&target.id, reason);
            }
        }
        Ok(())
    }

    pub fn dispose<'env>(&self, env: &'env Env) -> Result<PromiseRaw<'env, ()>> {
        self.ensure_cleanup(env)?;
        self.callbacks_alive.store(false, Ordering::Release);
        self.runtime.begin_dispose();
        let runtime = Arc::clone(&self.runtime);
        env.spawn_future(async move { runtime.finish_dispose().await.map_err(to_napi_error) })
    }

    fn ensure_cleanup(&self, env: &Env) -> Result<()> {
        if self
            .cleanup_registered
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Ok(());
        }
        let runtime = Arc::clone(&self.runtime);
        let callbacks_alive = Arc::clone(&self.callbacks_alive);
        if let Err(error) = env.add_env_cleanup_hook((runtime, callbacks_alive), |state| {
            state.1.store(false, Ordering::Release);
            state.0.begin_dispose();
        }) {
            self.cleanup_registered.store(false, Ordering::Release);
            return Err(error);
        }
        Ok(())
    }
}

fn copy_attachments(attachments: Vec<Buffer>) -> Vec<Vec<u8>> {
    attachments
        .into_iter()
        .map(|attachment| attachment.as_ref().to_vec())
        .collect()
}

fn packet_to_napi(packet: BinaryPacket) -> Result<NapiPacket> {
    Ok(NapiPacket {
        control: encode_control(&packet.control).map_err(to_napi_error)?,
        attachments: packet.attachments.into_iter().map(Buffer::from).collect(),
    })
}

fn stream_message_to_napi(message: StreamMessage) -> Result<NapiPacket> {
    Ok(NapiPacket {
        control: encode_control(&message.control).map_err(to_napi_error)?,
        attachments: message.attachments.into_iter().map(Buffer::from).collect(),
    })
}

fn is_terminal(message: &StreamMessage) -> bool {
    matches!(
        message.control,
        Control::StreamEnd { .. } | Control::StreamError { .. }
    )
}

fn to_napi_error(error: ProtocolError) -> Error {
    let status = if error.code == "NATIVE_BACKPRESSURE_BROKEN" {
        Status::QueueFull
    } else {
        Status::GenericFailure
    };
    Error::new(status, format!("{}: {}", error.code, error.message))
}
