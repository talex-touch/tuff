use std::collections::{BTreeMap, HashMap, VecDeque};
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};
use tokio::sync::{Notify, mpsc};

use crate::error::ProtocolError;
use crate::model::{
    AttachmentDescriptor, CancelReason, CancellationMode, CapabilityDescriptor, CapabilityState,
    Control, OperationDescriptor, OperationMode, ProtocolLimits, ProtocolVersion, RunMeta,
};
use crate::stream::StreamCreditState;
use crate::{CancellationToken, PROTOCOL_MAJOR, PROTOCOL_MINOR, validate_control, validate_packet};

pub type OperationFuture =
    Pin<Box<dyn Future<Output = Result<OperationOutput, ProtocolError>> + Send + 'static>>;

type UnaryHandler = Arc<
    dyn Fn(OperationContext, Value, Vec<InputAttachment>) -> OperationFuture
        + Send
        + Sync
        + 'static,
>;
type StreamHandler = Arc<
    dyn Fn(StreamContext, Value, Vec<InputAttachment>) -> OperationFuture + Send + Sync + 'static,
>;

#[derive(Debug, Clone)]
pub struct InputAttachment {
    pub descriptor: AttachmentDescriptor,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct OutputAttachment {
    pub id: String,
    pub data: Vec<u8>,
    pub media_type: Option<String>,
    pub purpose: Option<String>,
}

impl OutputAttachment {
    pub fn binary(id: impl Into<String>, data: Vec<u8>) -> Self {
        Self {
            id: id.into(),
            data,
            media_type: Some("application/octet-stream".to_string()),
            purpose: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct OperationOutput {
    pub payload: Value,
    pub attachments: Vec<OutputAttachment>,
    pub counters: BTreeMap<String, u64>,
}

impl OperationOutput {
    pub fn new(payload: Value) -> Self {
        Self {
            payload,
            attachments: Vec::new(),
            counters: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct OperationContext {
    pub request_id: String,
    pub cancellation: CancellationToken,
    pub deadline_unix_ms: Option<u64>,
}

impl OperationContext {
    pub fn ensure_active(&self) -> Result<(), ProtocolError> {
        match self.cancellation.reason() {
            Some(CancelReason::Deadline) => Err(ProtocolError::deadline_exceeded()),
            Some(_) => Err(ProtocolError::cancelled()),
            None => Ok(()),
        }
    }
}

#[derive(Debug)]
pub struct BinaryPacket {
    pub control: Control,
    pub attachments: Vec<Vec<u8>>,
}

#[derive(Debug)]
pub struct StreamMessage {
    pub control: Control,
    pub attachments: Vec<Vec<u8>>,
}

#[derive(Debug)]
pub struct OpenedStream {
    pub stream_id: String,
    pub accepted: BinaryPacket,
    pub receiver: mpsc::Receiver<StreamMessage>,
}

#[derive(Clone)]
pub struct StreamContext {
    stream_id: String,
    credit: StreamCreditState,
    sender: mpsc::Sender<StreamMessage>,
}

impl StreamContext {
    pub fn stream_id(&self) -> &str {
        &self.stream_id
    }

    pub fn cancellation(&self) -> CancellationToken {
        self.credit.cancellation()
    }

    pub async fn emit(&self, output: OperationOutput) -> Result<u64, ProtocolError> {
        let sequence = self.credit.reserve_data_sequence().await?;
        let (descriptors, attachments) = output_attachments(output.attachments)?;
        let control = Control::StreamData {
            protocol: protocol_version(),
            stream_id: self.stream_id.clone(),
            sequence,
            payload: output.payload,
            attachments: descriptors,
            meta: if output.counters.is_empty() {
                None
            } else {
                Some(json!({ "counters": output.counters }))
            },
        };
        self.sender
            .send(StreamMessage {
                control,
                attachments,
            })
            .await
            .map_err(|_| ProtocolError::cancelled())?;
        Ok(sequence)
    }
}

struct CapabilityEntry {
    descriptor: CapabilityDescriptor,
    unary: HashMap<String, UnaryHandler>,
    streams: HashMap<String, StreamHandler>,
}

#[derive(Default)]
pub struct CapabilityRegistry {
    capabilities: HashMap<String, CapabilityEntry>,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_capability(
        &mut self,
        descriptor: CapabilityDescriptor,
    ) -> Result<(), ProtocolError> {
        if self.capabilities.contains_key(&descriptor.id) {
            return Err(ProtocolError::capability_conflict());
        }
        self.capabilities.insert(
            descriptor.id.clone(),
            CapabilityEntry {
                descriptor,
                unary: HashMap::new(),
                streams: HashMap::new(),
            },
        );
        Ok(())
    }

    pub fn register_unary<F, Fut>(
        &mut self,
        capability_id: &str,
        operation: &str,
        handler: F,
    ) -> Result<(), ProtocolError>
    where
        F: Fn(OperationContext, Value, Vec<InputAttachment>) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<OperationOutput, ProtocolError>> + Send + 'static,
    {
        let entry = self
            .capabilities
            .get_mut(capability_id)
            .ok_or_else(ProtocolError::capability_not_found)?;
        ensure_operation(&entry.descriptor, operation, OperationMode::Unary)?;
        if entry.unary.contains_key(operation) {
            return Err(ProtocolError::capability_conflict());
        }
        entry.unary.insert(
            operation.to_string(),
            Arc::new(move |context, payload, attachments| {
                Box::pin(handler(context, payload, attachments))
            }),
        );
        Ok(())
    }

    pub fn register_stream<F, Fut>(
        &mut self,
        capability_id: &str,
        operation: &str,
        handler: F,
    ) -> Result<(), ProtocolError>
    where
        F: Fn(StreamContext, Value, Vec<InputAttachment>) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<OperationOutput, ProtocolError>> + Send + 'static,
    {
        let entry = self
            .capabilities
            .get_mut(capability_id)
            .ok_or_else(ProtocolError::capability_not_found)?;
        ensure_operation(&entry.descriptor, operation, OperationMode::Stream)?;
        if entry.streams.contains_key(operation) {
            return Err(ProtocolError::capability_conflict());
        }
        entry.streams.insert(
            operation.to_string(),
            Arc::new(move |context, payload, attachments| {
                Box::pin(handler(context, payload, attachments))
            }),
        );
        Ok(())
    }

    pub fn descriptors(&self) -> Vec<CapabilityDescriptor> {
        let mut descriptors: Vec<_> = self
            .capabilities
            .values()
            .map(|entry| entry.descriptor.clone())
            .collect();
        descriptors.sort_by(|left, right| left.id.cmp(&right.id));
        descriptors
    }
}

struct InFlightRequest {
    cancellation: CancellationToken,
}

struct OpenStreamState {
    credit: StreamCreditState,
}

const MAX_COMPLETED_STREAMS: usize = 256;

#[derive(Default)]
struct CompletedStreams {
    states: HashMap<String, StreamCreditState>,
    order: VecDeque<String>,
}

impl CompletedStreams {
    fn insert(&mut self, stream_id: String, credit: StreamCreditState) {
        if self.states.contains_key(&stream_id) {
            self.order.retain(|existing| existing != &stream_id);
        }
        self.states.insert(stream_id.clone(), credit);
        self.order.push_back(stream_id);
        while self.order.len() > MAX_COMPLETED_STREAMS {
            if let Some(expired) = self.order.pop_front() {
                self.states.remove(&expired);
            }
        }
    }

    fn get(&self, stream_id: &str) -> Option<StreamCreditState> {
        self.states.get(stream_id).cloned()
    }

    fn contains_key(&self, stream_id: &str) -> bool {
        self.states.contains_key(stream_id)
    }
}

pub struct NativeRuntime {
    registry: RwLock<CapabilityRegistry>,
    limits: ProtocolLimits,
    disposed: AtomicBool,
    requests: Mutex<HashMap<String, InFlightRequest>>,
    streams: Mutex<HashMap<String, OpenStreamState>>,
    completed_streams: Mutex<CompletedStreams>,
    idle_notify: Notify,
}

impl NativeRuntime {
    pub fn new(registry: CapabilityRegistry, limits: ProtocolLimits) -> Arc<Self> {
        Arc::new(Self {
            registry: RwLock::new(registry),
            limits,
            disposed: AtomicBool::new(false),
            requests: Mutex::new(HashMap::new()),
            streams: Mutex::new(HashMap::new()),
            completed_streams: Mutex::new(CompletedStreams::default()),
            idle_notify: Notify::new(),
        })
    }

    pub fn limits(&self) -> &ProtocolLimits {
        &self.limits
    }

    pub fn descriptors(&self) -> Vec<CapabilityDescriptor> {
        read(&self.registry).descriptors()
    }

    pub fn health_payload(&self) -> Value {
        json!({
            "disposed": self.disposed.load(Ordering::Acquire),
            "inFlightUnary": lock(&self.requests).len(),
            "openStreams": lock(&self.streams).len(),
            "capabilities": self.descriptors(),
        })
    }

    pub async fn invoke(
        self: &Arc<Self>,
        control: Control,
        attachments: Vec<Vec<u8>>,
    ) -> Result<BinaryPacket, ProtocolError> {
        validate_control(&control)?;
        validate_packet(&control, &attachments)?;
        let RequestParts {
            request_id,
            capability,
            operation,
            deadline_unix_ms,
            payload,
            descriptors,
        } = request_parts(control)?;
        let started = Instant::now();

        if capability == "native.runtime" && operation == "health" {
            return success_response(
                request_id,
                OperationOutput::new(self.health_payload()),
                started,
                None,
                CancellationMode::Cooperative,
            );
        }
        if self.disposed.load(Ordering::Acquire) {
            return Ok(error_response(
                request_id,
                ProtocolError::transport_disposed(),
                started,
            ));
        }

        let (descriptor, handler) = match self.resolve_unary(&capability, &operation) {
            Ok(resolved) => resolved,
            Err(error) => return Ok(error_response(request_id, error, started)),
        };
        let cancellation = CancellationToken::new();
        {
            let mut requests = lock(&self.requests);
            if requests.len() >= self.limits.max_in_flight_unary as usize {
                return Ok(error_response(
                    request_id,
                    ProtocolError::native_busy(),
                    started,
                ));
            }
            if requests.contains_key(&request_id) {
                return Ok(error_response(
                    request_id,
                    ProtocolError::duplicate_request_id(),
                    started,
                ));
            }
            requests.insert(
                request_id.clone(),
                InFlightRequest {
                    cancellation: cancellation.clone(),
                },
            );
        }

        let context = OperationContext {
            request_id: request_id.clone(),
            cancellation: cancellation.clone(),
            deadline_unix_ms,
        };
        let inputs = input_attachments(descriptors, attachments);
        let operation_future = handler(context, payload, inputs);
        tokio::pin!(operation_future);

        let result = if let Some(duration) = deadline_duration(deadline_unix_ms) {
            if duration.is_zero() {
                cancellation.cancel(CancelReason::Deadline);
                Err(ProtocolError::deadline_exceeded())
            } else {
                tokio::select! {
                    result = &mut operation_future => result,
                    reason = cancellation.cancelled() => Err(error_for_cancel(reason)),
                    _ = tokio::time::sleep(duration) => {
                        cancellation.cancel(CancelReason::Deadline);
                        Err(ProtocolError::deadline_exceeded())
                    }
                }
            }
        } else {
            tokio::select! {
                result = &mut operation_future => result,
                reason = cancellation.cancelled() => Err(error_for_cancel(reason)),
            }
        };

        lock(&self.requests).remove(&request_id);
        self.notify_if_idle();
        Ok(match result {
            Ok(output) => success_response(
                request_id,
                output,
                started,
                descriptor.engine.clone(),
                operation_cancellation(&descriptor, &operation),
            )?,
            Err(error) => error_response(request_id, error, started),
        })
    }

    pub fn open_stream(
        self: &Arc<Self>,
        control: Control,
        attachments: Vec<Vec<u8>>,
    ) -> Result<OpenedStream, ProtocolError> {
        validate_control(&control)?;
        validate_packet(&control, &attachments)?;
        let RequestParts {
            request_id,
            capability,
            operation,
            deadline_unix_ms,
            payload,
            descriptors,
        } = request_parts(control)?;
        if self.disposed.load(Ordering::Acquire) {
            return Err(ProtocolError::transport_disposed());
        }
        let (descriptor, handler) = self.resolve_stream(&capability, &operation)?;
        let (stream_id, initial_window, input) = stream_open_parts(payload)?;
        let effective_window = initial_window.min(self.limits.max_stream_window);
        let credit = StreamCreditState::new(effective_window)?;
        {
            let mut streams = lock(&self.streams);
            if streams.len() >= self.limits.max_open_streams as usize {
                return Err(ProtocolError::native_busy());
            }
            if streams.contains_key(&stream_id)
                || lock(&self.completed_streams).contains_key(&stream_id)
            {
                return Err(ProtocolError::duplicate_request_id());
            }
            streams.insert(
                stream_id.clone(),
                OpenStreamState {
                    credit: credit.clone(),
                },
            );
        }

        let accepted_output = OperationOutput::new(json!({
            "streamId": stream_id,
            "effectiveWindow": effective_window,
            "cancellation": operation_cancellation(&descriptor, &operation),
        }));
        let accepted = success_response(
            request_id,
            accepted_output,
            Instant::now(),
            descriptor.engine.clone(),
            operation_cancellation(&descriptor, &operation),
        )?;
        let (sender, receiver) = mpsc::channel(crate::HARD_MAX_STREAM_WINDOW as usize + 1);
        let context = StreamContext {
            stream_id: stream_id.clone(),
            credit: credit.clone(),
            sender: sender.clone(),
        };
        let inputs = input_attachments(descriptors, attachments);
        let runtime = Arc::clone(self);
        let task_stream_id = stream_id.clone();
        tokio::spawn(async move {
            let operation_future = handler(context.clone(), input, inputs);
            let stream_cancellation = credit.cancellation();
            tokio::pin!(operation_future);
            let result = if let Some(duration) = deadline_duration(deadline_unix_ms) {
                if duration.is_zero() {
                    credit.cancel(CancelReason::Deadline);
                    Err(ProtocolError::deadline_exceeded())
                } else {
                    tokio::select! {
                        result = &mut operation_future => result,
                        reason = stream_cancellation.cancelled() => Err(error_for_cancel(reason)),
                        _ = tokio::time::sleep(duration) => {
                            credit.cancel(CancelReason::Deadline);
                            Err(ProtocolError::deadline_exceeded())
                        }
                    }
                }
            } else {
                tokio::select! {
                    result = &mut operation_future => result,
                    reason = stream_cancellation.cancelled() => Err(error_for_cancel(reason)),
                }
            };

            if let Ok(sequence) = credit.reserve_terminal_sequence() {
                let terminal = terminal_message(&task_stream_id, sequence, result);
                let _ = sender.send(terminal).await;
            }
            let mut streams = lock(&runtime.streams);
            if let Some(completed) = streams.remove(&task_stream_id) {
                lock(&runtime.completed_streams).insert(task_stream_id.clone(), completed.credit);
            }
            drop(streams);
            runtime.notify_if_idle();
        });

        Ok(OpenedStream {
            stream_id,
            accepted,
            receiver,
        })
    }

    pub fn acknowledge_stream(
        &self,
        stream_id: &str,
        ack_sequence: u64,
    ) -> Result<u64, ProtocolError> {
        let credit = lock(&self.streams)
            .get(stream_id)
            .map(|stream| stream.credit.clone())
            .or_else(|| lock(&self.completed_streams).get(stream_id))
            .ok_or_else(ProtocolError::stream_not_found)?;
        credit.acknowledge(ack_sequence)
    }

    pub fn fault_stream(&self, stream_id: &str) -> Result<bool, ProtocolError> {
        let streams = lock(&self.streams);
        let stream = streams
            .get(stream_id)
            .ok_or_else(ProtocolError::stream_not_found)?;
        Ok(stream.credit.mark_backpressure_fault())
    }

    pub fn cancel_request(&self, request_id: &str, reason: CancelReason) -> bool {
        lock(&self.requests)
            .get(request_id)
            .is_some_and(|request| request.cancellation.cancel(reason))
    }

    pub fn cancel_stream(&self, stream_id: &str, reason: CancelReason) -> bool {
        lock(&self.streams)
            .get(stream_id)
            .is_some_and(|stream| stream.credit.cancel(reason))
    }

    pub fn begin_dispose(&self) -> bool {
        if self
            .disposed
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return false;
        }
        for request in lock(&self.requests).values() {
            request.cancellation.cancel(CancelReason::Dispose);
        }
        for stream in lock(&self.streams).values() {
            stream.credit.cancel(CancelReason::Dispose);
        }
        true
    }

    pub async fn finish_dispose(&self) -> Result<(), ProtocolError> {
        self.begin_dispose();
        let timeout = Duration::from_millis(u64::from(self.limits.dispose_grace_ms));
        let wait = async {
            loop {
                let notified = self.idle_notify.notified();
                if lock(&self.requests).is_empty() && lock(&self.streams).is_empty() {
                    return;
                }
                notified.await;
            }
        };
        tokio::time::timeout(timeout, wait)
            .await
            .map_err(|_| ProtocolError::dispose_timeout())?;
        let mut completed = lock(&self.completed_streams);
        completed.states.clear();
        completed.order.clear();
        Ok(())
    }

    fn resolve_unary(
        &self,
        capability: &str,
        operation: &str,
    ) -> Result<(CapabilityDescriptor, UnaryHandler), ProtocolError> {
        let registry = read(&self.registry);
        let entry = registry
            .capabilities
            .get(capability)
            .ok_or_else(ProtocolError::capability_not_found)?;
        ensure_routable(&entry.descriptor)?;
        let handler = entry
            .unary
            .get(operation)
            .cloned()
            .ok_or_else(ProtocolError::operation_not_found)?;
        Ok((entry.descriptor.clone(), handler))
    }

    fn resolve_stream(
        &self,
        capability: &str,
        operation: &str,
    ) -> Result<(CapabilityDescriptor, StreamHandler), ProtocolError> {
        let registry = read(&self.registry);
        let entry = registry
            .capabilities
            .get(capability)
            .ok_or_else(ProtocolError::capability_not_found)?;
        ensure_routable(&entry.descriptor)?;
        let handler = entry
            .streams
            .get(operation)
            .cloned()
            .ok_or_else(ProtocolError::operation_not_found)?;
        Ok((entry.descriptor.clone(), handler))
    }

    fn notify_if_idle(&self) {
        if lock(&self.requests).is_empty() && lock(&self.streams).is_empty() {
            self.idle_notify.notify_waiters();
        }
    }
}

struct RequestParts {
    request_id: String,
    capability: String,
    operation: String,
    deadline_unix_ms: Option<u64>,
    payload: Value,
    descriptors: Vec<AttachmentDescriptor>,
}

fn request_parts(control: Control) -> Result<RequestParts, ProtocolError> {
    let Control::Request {
        request_id,
        capability,
        operation,
        deadline_unix_ms,
        payload,
        attachments,
        ..
    } = control
    else {
        return Err(ProtocolError::invalid_envelope());
    };
    Ok(RequestParts {
        request_id,
        capability,
        operation,
        deadline_unix_ms,
        payload,
        descriptors: attachments,
    })
}

fn stream_open_parts(payload: Value) -> Result<(String, u32, Value), ProtocolError> {
    let Value::Object(mut payload) = payload else {
        return Err(ProtocolError::invalid_argument());
    };
    let stream_id = payload
        .remove("streamId")
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .ok_or_else(ProtocolError::invalid_argument)?;
    let initial_window = payload
        .remove("initialWindow")
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(ProtocolError::invalid_argument)?;
    let input = payload.remove("input").unwrap_or(Value::Null);
    Ok((stream_id, initial_window, input))
}

fn ensure_operation(
    descriptor: &CapabilityDescriptor,
    operation: &str,
    mode: OperationMode,
) -> Result<(), ProtocolError> {
    let matches = descriptor
        .operations
        .iter()
        .any(|candidate| candidate.name == operation && candidate.mode == mode);
    if matches {
        Ok(())
    } else {
        Err(ProtocolError::operation_not_found())
    }
}

fn ensure_routable(descriptor: &CapabilityDescriptor) -> Result<(), ProtocolError> {
    match descriptor.state {
        CapabilityState::Available | CapabilityState::Degraded => Ok(()),
        CapabilityState::Unavailable => Err(ProtocolError::native_unavailable()),
    }
}

fn operation_cancellation(descriptor: &CapabilityDescriptor, operation: &str) -> CancellationMode {
    descriptor
        .operations
        .iter()
        .find(|candidate| candidate.name == operation)
        .map_or(CancellationMode::None, |candidate| candidate.cancellation)
}

fn input_attachments(
    descriptors: Vec<AttachmentDescriptor>,
    attachments: Vec<Vec<u8>>,
) -> Vec<InputAttachment> {
    descriptors
        .into_iter()
        .zip(attachments)
        .map(|(descriptor, data)| InputAttachment { descriptor, data })
        .collect()
}

fn output_attachments(
    outputs: Vec<OutputAttachment>,
) -> Result<(Vec<AttachmentDescriptor>, Vec<Vec<u8>>), ProtocolError> {
    let mut descriptors = Vec::with_capacity(outputs.len());
    let mut attachments = Vec::with_capacity(outputs.len());
    for (index, output) in outputs.into_iter().enumerate() {
        descriptors.push(AttachmentDescriptor {
            id: output.id,
            index: u32::try_from(index).map_err(|_| ProtocolError::attachment_limit_exceeded())?,
            byte_length: output.data.len() as u64,
            media_type: output.media_type,
            purpose: output.purpose,
        });
        attachments.push(output.data);
    }
    let control = Control::StreamEnd {
        protocol: protocol_version(),
        stream_id: "validation".to_string(),
        sequence: 1,
        payload: None,
        attachments: descriptors.clone(),
    };
    validate_packet(&control, &attachments)?;
    Ok((descriptors, attachments))
}

fn success_response(
    request_id: String,
    output: OperationOutput,
    started: Instant,
    engine: Option<String>,
    cancellation: CancellationMode,
) -> Result<BinaryPacket, ProtocolError> {
    let (descriptors, attachments) = output_attachments(output.attachments)?;
    let control = Control::Response {
        protocol: protocol_version(),
        request_id,
        ok: true,
        payload: Some(output.payload),
        error: None,
        attachments: descriptors,
        meta: RunMeta {
            duration_ms: elapsed_ms(started),
            engine,
            degraded: None,
            cancellation: Some(cancellation),
            counters: output.counters,
        },
    };
    validate_control(&control)?;
    Ok(BinaryPacket {
        control,
        attachments,
    })
}

pub fn error_response(request_id: String, error: ProtocolError, started: Instant) -> BinaryPacket {
    BinaryPacket {
        control: Control::Response {
            protocol: protocol_version(),
            request_id,
            ok: false,
            payload: None,
            error: Some(error),
            attachments: Vec::new(),
            meta: RunMeta {
                duration_ms: elapsed_ms(started),
                ..RunMeta::default()
            },
        },
        attachments: Vec::new(),
    }
}

fn terminal_message(
    stream_id: &str,
    sequence: u64,
    result: Result<OperationOutput, ProtocolError>,
) -> StreamMessage {
    match result {
        Ok(output) => match output_attachments(output.attachments) {
            Ok((descriptors, attachments)) => StreamMessage {
                control: Control::StreamEnd {
                    protocol: protocol_version(),
                    stream_id: stream_id.to_string(),
                    sequence,
                    payload: Some(output.payload),
                    attachments: descriptors,
                },
                attachments,
            },
            Err(error) => stream_error(stream_id, sequence, error),
        },
        Err(error) => stream_error(stream_id, sequence, error),
    }
}

fn stream_error(stream_id: &str, sequence: u64, error: ProtocolError) -> StreamMessage {
    StreamMessage {
        control: Control::StreamError {
            protocol: protocol_version(),
            stream_id: stream_id.to_string(),
            sequence,
            error,
            attachments: Vec::new(),
        },
        attachments: Vec::new(),
    }
}

fn deadline_duration(deadline_unix_ms: Option<u64>) -> Option<Duration> {
    let deadline = deadline_unix_ms?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Some(Duration::from_millis(deadline.saturating_sub(now)))
}

fn error_for_cancel(reason: CancelReason) -> ProtocolError {
    match reason {
        CancelReason::Deadline => ProtocolError::deadline_exceeded(),
        CancelReason::Caller | CancelReason::ConsumerClosed | CancelReason::Dispose => {
            ProtocolError::cancelled()
        }
    }
}

fn protocol_version() -> ProtocolVersion {
    ProtocolVersion {
        major: PROTOCOL_MAJOR,
        minor: PROTOCOL_MINOR,
    }
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn read<T>(lock: &RwLock<T>) -> RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[allow(dead_code)]
fn write<T>(lock: &RwLock<T>) -> RwLockWriteGuard<'_, T> {
    lock.write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn operation_descriptor(
    name: impl Into<String>,
    mode: OperationMode,
    cancellation: CancellationMode,
    accepts_attachments: bool,
    emits_attachments: bool,
) -> OperationDescriptor {
    OperationDescriptor {
        name: name.into(),
        mode,
        cancellation,
        accepts_attachments,
        emits_attachments,
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use serde_json::json;

    use super::*;

    fn descriptor(state: CapabilityState) -> CapabilityDescriptor {
        CapabilityDescriptor {
            id: "fixture.echo".to_string(),
            version: "1.0.0".to_string(),
            engine: Some("fixture".to_string()),
            state,
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
                    "count",
                    OperationMode::Stream,
                    CancellationMode::Cooperative,
                    false,
                    false,
                ),
                operation_descriptor(
                    "delay",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    false,
                    false,
                ),
            ],
        }
    }

    fn request(
        request_id: &str,
        operation: &str,
        payload: Value,
        deadline_unix_ms: Option<u64>,
        attachments: Vec<AttachmentDescriptor>,
    ) -> Control {
        Control::Request {
            protocol: protocol_version(),
            request_id: request_id.to_string(),
            capability: "fixture.echo".to_string(),
            operation: operation.to_string(),
            deadline_unix_ms,
            payload,
            attachments,
        }
    }

    fn registry() -> CapabilityRegistry {
        let mut registry = CapabilityRegistry::new();
        registry
            .register_capability(descriptor(CapabilityState::Available))
            .expect("capability");
        registry
            .register_unary(
                "fixture.echo",
                "echo",
                |_context, payload, attachments| async move {
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
            .expect("echo");
        registry
            .register_unary(
                "fixture.echo",
                "delay",
                |context, _payload, _attachments| async move {
                    context.cancellation.cancelled().await;
                    context.ensure_active()?;
                    Ok(OperationOutput::new(Value::Null))
                },
            )
            .expect("delay");
        registry
            .register_stream(
                "fixture.echo",
                "count",
                |context, payload, _attachments| async move {
                    let count = payload.get("count").and_then(Value::as_u64).unwrap_or(0);
                    for value in 1..=count {
                        context
                            .emit(OperationOutput::new(json!({ "value": value })))
                            .await?;
                    }
                    Ok(OperationOutput::new(json!({ "emitted": count })))
                },
            )
            .expect("count");
        registry
    }

    #[test]
    fn duplicate_capability_and_operation_registration_fail() {
        let mut registry = CapabilityRegistry::new();
        registry
            .register_capability(descriptor(CapabilityState::Available))
            .expect("first");
        assert_eq!(
            registry
                .register_capability(descriptor(CapabilityState::Available))
                .expect_err("duplicate")
                .code,
            "CAPABILITY_CONFLICT",
        );
    }

    #[tokio::test]
    async fn unary_registry_round_trips_owned_attachments() {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        let descriptors = vec![AttachmentDescriptor {
            id: "input".to_string(),
            index: 0,
            byte_length: 4,
            media_type: Some("application/octet-stream".to_string()),
            purpose: Some("fixture".to_string()),
        }];
        let packet = runtime
            .invoke(
                request(
                    "request-1",
                    "echo",
                    json!({ "ok": true }),
                    None,
                    descriptors,
                ),
                vec![b"test".to_vec()],
            )
            .await
            .expect("invoke");
        assert_eq!(packet.attachments, vec![b"test".to_vec()]);
        let Control::Response {
            ok,
            payload,
            attachments,
            ..
        } = packet.control
        else {
            panic!("expected response");
        };
        assert!(ok);
        assert_eq!(payload, Some(json!({ "ok": true })));
        assert_eq!(attachments[0].byte_length, 4);
    }

    #[tokio::test]
    async fn unknown_operation_and_unavailable_capability_are_structured_errors() {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        let packet = runtime
            .invoke(
                request("request-2", "missing", Value::Null, None, Vec::new()),
                Vec::new(),
            )
            .await
            .expect("response");
        assert_eq!(
            response_error_code(&packet.control),
            Some("OPERATION_NOT_FOUND")
        );

        let mut unavailable = CapabilityRegistry::new();
        unavailable
            .register_capability(descriptor(CapabilityState::Unavailable))
            .expect("capability");
        let runtime = NativeRuntime::new(unavailable, ProtocolLimits::default());
        let packet = runtime
            .invoke(
                request("request-3", "echo", Value::Null, None, Vec::new()),
                Vec::new(),
            )
            .await
            .expect("response");
        assert_eq!(
            response_error_code(&packet.control),
            Some("NATIVE_UNAVAILABLE")
        );
    }

    #[tokio::test]
    async fn deadline_claims_terminal_before_cooperative_cancel_completion() {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        let deadline = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_millis() as u64
            + 20;
        let packet = runtime
            .invoke(
                request(
                    "request-4",
                    "delay",
                    Value::Null,
                    Some(deadline),
                    Vec::new(),
                ),
                Vec::new(),
            )
            .await
            .expect("response");
        assert_eq!(
            response_error_code(&packet.control),
            Some("DEADLINE_EXCEEDED")
        );
    }

    #[tokio::test]
    async fn stream_is_credit_bounded_and_ends_once() {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        let mut opened = runtime
            .open_stream(
                request(
                    "request-5",
                    "count",
                    json!({
                        "streamId": "stream-1",
                        "initialWindow": 1,
                        "input": { "count": 2 },
                    }),
                    None,
                    Vec::new(),
                ),
                Vec::new(),
            )
            .expect("open");

        let first = opened.receiver.recv().await.expect("first frame");
        assert!(matches!(
            first.control,
            Control::StreamData { sequence: 1, .. }
        ));
        assert!(
            tokio::time::timeout(Duration::from_millis(20), opened.receiver.recv())
                .await
                .is_err()
        );
        assert_eq!(runtime.acknowledge_stream("stream-1", 1).expect("ack"), 1);

        let second = opened.receiver.recv().await.expect("second frame");
        assert!(matches!(
            second.control,
            Control::StreamData { sequence: 2, .. }
        ));
        let terminal = opened.receiver.recv().await.expect("terminal");
        assert!(matches!(
            terminal.control,
            Control::StreamEnd { sequence: 3, .. }
        ));
        assert!(opened.receiver.recv().await.is_none());
        assert_eq!(
            runtime
                .acknowledge_stream("stream-1", 2)
                .expect("terminal-race ack"),
            1
        );
        assert_eq!(
            runtime
                .acknowledge_stream("stream-1", 2)
                .expect("duplicate terminal-race ack"),
            0
        );
        assert_eq!(
            runtime
                .acknowledge_stream("stream-1", 1)
                .expect_err("regressive terminal-race ack")
                .code,
            "NATIVE_PROTOCOL_VIOLATION"
        );
        assert_eq!(
            runtime
                .acknowledge_stream("stream-1", 3)
                .expect_err("ahead terminal-race ack")
                .code,
            "NATIVE_PROTOCOL_VIOLATION"
        );
        assert_eq!(
            runtime
                .acknowledge_stream("missing-stream", 1)
                .expect_err("unknown stream")
                .code,
            "STREAM_NOT_FOUND"
        );
    }

    #[tokio::test]
    async fn stream_cancel_wakes_blocked_producer_and_emits_cancelled_terminal() {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        let mut opened = runtime
            .open_stream(
                request(
                    "request-6",
                    "count",
                    json!({
                        "streamId": "stream-2",
                        "initialWindow": 1,
                        "input": { "count": 5 },
                    }),
                    None,
                    Vec::new(),
                ),
                Vec::new(),
            )
            .expect("open");
        opened.receiver.recv().await.expect("first frame");
        assert!(runtime.cancel_stream("stream-2", CancelReason::Caller));
        let terminal = opened.receiver.recv().await.expect("terminal");
        let Control::StreamError { error, .. } = terminal.control else {
            panic!("expected stream error");
        };
        assert_eq!(error.code, "CANCELLED");
    }

    #[tokio::test]
    async fn dispose_is_idempotent_and_rejects_new_work() {
        let runtime = NativeRuntime::new(registry(), ProtocolLimits::default());
        assert!(runtime.begin_dispose());
        assert!(!runtime.begin_dispose());
        runtime.finish_dispose().await.expect("dispose");
        let packet = runtime
            .invoke(
                request("request-7", "echo", Value::Null, None, Vec::new()),
                Vec::new(),
            )
            .await
            .expect("response");
        assert_eq!(
            response_error_code(&packet.control),
            Some("TRANSPORT_DISPOSED")
        );
    }

    fn response_error_code(control: &Control) -> Option<&str> {
        let Control::Response { error, .. } = control else {
            return None;
        };
        error.as_ref().map(|error| error.code.as_str())
    }
}
