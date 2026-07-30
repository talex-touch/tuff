use std::sync::OnceLock;
use std::time::Duration;

use napi::bindgen_prelude::{Buffer, Function, PromiseRaw};
use napi::{Env, Result};
use napi_derive::napi;
use serde_json::{Value, json};
use tuff_native_core::{
    CancellationMode, CapabilityDescriptor, CapabilityRegistry, CapabilityState, ErrorCategory,
    NativeRuntime, OperationMode, OperationOutput, OutputAttachment, ProtocolError, ProtocolLimits,
    RuntimeDescriptor, operation_descriptor,
};
use tuff_native_napi::{NapiPacket, NapiRuntimeAdapter};

static ADAPTER: OnceLock<NapiRuntimeAdapter> = OnceLock::new();

fn adapter() -> &'static NapiRuntimeAdapter {
    ADAPTER.get_or_init(|| {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        NapiRuntimeAdapter::new(
            runtime,
            RuntimeDescriptor {
                addon_id: "fixture-native-protocol".to_string(),
                addon_version: env!("CARGO_PKG_VERSION").to_string(),
                target: format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                platform: std::env::consts::OS.to_string(),
                arch: std::env::consts::ARCH.to_string(),
                build_profile: if cfg!(debug_assertions) {
                    "debug".to_string()
                } else {
                    "release".to_string()
                },
            },
        )
    })
}

fn registry() -> CapabilityRegistry {
    let mut registry = CapabilityRegistry::new();
    registry
        .register_capability(CapabilityDescriptor {
            id: "fixture.echo".to_string(),
            version: "1.0.0".to_string(),
            engine: Some("fixture".to_string()),
            state: CapabilityState::Available,
            reason: None,
            features: vec!["buffer-round-trip".to_string()],
            operations: vec![
                operation_descriptor(
                    "echo",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    true,
                    true,
                ),
                operation_descriptor(
                    "delay",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    false,
                    false,
                ),
                operation_descriptor(
                    "fail",
                    OperationMode::Unary,
                    CancellationMode::None,
                    false,
                    false,
                ),
            ],
        })
        .expect("fixture echo capability must register");
    registry
        .register_capability(CapabilityDescriptor {
            id: "fixture.counter".to_string(),
            version: "1.0.0".to_string(),
            engine: Some("fixture".to_string()),
            state: CapabilityState::Available,
            reason: None,
            features: vec!["reliable-stream".to_string()],
            operations: vec![operation_descriptor(
                "count",
                OperationMode::Stream,
                CancellationMode::Cooperative,
                false,
                false,
            )],
        })
        .expect("fixture counter capability must register");

    registry
        .register_unary(
            "fixture.echo",
            "echo",
            |_context, payload, attachments| async move {
                tokio::time::sleep(Duration::from_millis(15)).await;
                let mut output = OperationOutput::new(payload);
                output.attachments = attachments
                    .into_iter()
                    .map(|attachment| OutputAttachment {
                        id: "output".to_string(),
                        data: attachment.data,
                        media_type: attachment.descriptor.media_type,
                        purpose: attachment.descriptor.purpose,
                    })
                    .collect();
                Ok(output)
            },
        )
        .expect("fixture echo operation must register");
    registry
        .register_unary(
            "fixture.echo",
            "delay",
            |_context, payload, _attachments| async move {
                let delay_ms = payload
                    .get("delayMs")
                    .and_then(Value::as_u64)
                    .unwrap_or(100);
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                Ok(OperationOutput::new(json!({ "delayedMs": delay_ms })))
            },
        )
        .expect("fixture delay operation must register");
    registry
        .register_unary(
            "fixture.echo",
            "fail",
            |_context, _payload, _attachments| async move {
                Err(ProtocolError::new(
                    "FIXTURE_FAILED",
                    ErrorCategory::Internal,
                    "Fixture operation failed",
                    false,
                ))
            },
        )
        .expect("fixture fail operation must register");
    registry
        .register_stream(
            "fixture.counter",
            "count",
            |context, payload, _attachments| async move {
                let count = payload.get("count").and_then(Value::as_u64).unwrap_or(0);
                let delay_ms = payload.get("delayMs").and_then(Value::as_u64).unwrap_or(0);
                let fail_at = payload.get("failAt").and_then(Value::as_u64);
                for value in 1..=count {
                    if fail_at == Some(value) {
                        return Err(ProtocolError::new(
                            "FIXTURE_STREAM_FAILED",
                            ErrorCategory::Internal,
                            "Fixture stream failed",
                            false,
                        ));
                    }
                    if delay_ms > 0 {
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    }
                    context
                        .emit(OperationOutput::new(json!({ "value": value })))
                        .await?;
                }
                Ok(OperationOutput::new(json!({ "emitted": count })))
            },
        )
        .expect("fixture counter operation must register");
    registry
}

#[napi(js_name = "nativeProtocolV1Handshake")]
pub fn native_protocol_v1_handshake(env: Env, control: String) -> Result<String> {
    adapter().handshake(&env, control)
}

#[napi(js_name = "nativeProtocolV1Invoke")]
pub fn native_protocol_v1_invoke<'env>(
    env: &'env Env,
    control: String,
    attachments: Vec<Buffer>,
) -> Result<PromiseRaw<'env, NapiPacket>> {
    adapter().invoke(env, control, attachments)
}

#[napi(js_name = "nativeProtocolV1OpenStream")]
pub fn native_protocol_v1_open_stream(
    env: Env,
    control: String,
    attachments: Vec<Buffer>,
    on_frame: Function<'_, NapiPacket, ()>,
) -> Result<NapiPacket> {
    adapter().open_stream(&env, control, attachments, on_frame)
}

#[napi(js_name = "nativeProtocolV1Ack")]
pub fn native_protocol_v1_ack(env: Env, control: String) -> Result<()> {
    adapter().acknowledge(&env, control)
}

#[napi(js_name = "nativeProtocolV1Cancel")]
pub fn native_protocol_v1_cancel(env: Env, control: String) -> Result<()> {
    adapter().cancel(&env, control)
}

#[napi(js_name = "nativeProtocolV1Dispose")]
pub fn native_protocol_v1_dispose<'env>(env: &'env Env) -> Result<PromiseRaw<'env, ()>> {
    adapter().dispose(env)
}
