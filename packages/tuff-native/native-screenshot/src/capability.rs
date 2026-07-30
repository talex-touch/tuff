use std::collections::BTreeMap;
use std::sync::Arc;

use serde::Serialize;
use serde_json::{Value, json};
use tuff_native_core::{
    CancelReason, CancellationMode, CancellationToken, CapabilityDescriptor, CapabilityRegistry,
    InputAttachment, MAX_ATTACHMENT_COUNT, MAX_SAFE_SEQUENCE, OperationContext, OperationMode,
    OperationOutput, OutputAttachment, ProtocolError, StreamContext, operation_descriptor,
};

use crate::backend::{BackendCapture, BackendFrame, BackendFrameSource, ScreenshotBackend};
use crate::compose::{ComposedCapture, compose_region};
use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{
    FramesInput, PixelSize, ScreenshotProbeResult, ScreenshotRequest, decode_screenshot_request,
};
use crate::region_plan::{AttachmentChunkLimits, plan_attachment_chunks};

pub const SCREENSHOT_CAPABILITY_ID: &str = "screenshot.capture";
pub const SCREENSHOT_CAPABILITY_VERSION: &str = "1.1.0";

pub struct ScreenshotCapability {
    backend: Arc<dyn ScreenshotBackend>,
    limits: ScreenshotLimits,
}

impl ScreenshotCapability {
    pub fn new(backend: Arc<dyn ScreenshotBackend>, limits: ScreenshotLimits) -> Self {
        Self { backend, limits }
    }

    fn features(&self) -> Vec<String> {
        let mut features = self.backend.support().features().to_vec();
        if !features.iter().any(|feature| feature == "frozen-compose") {
            features.push("frozen-compose".to_string());
        }
        features
    }

    pub fn descriptor(&self) -> CapabilityDescriptor {
        let support = self.backend.support();
        CapabilityDescriptor {
            id: SCREENSHOT_CAPABILITY_ID.to_string(),
            version: SCREENSHOT_CAPABILITY_VERSION.to_string(),
            engine: support.engine().map(ToOwned::to_owned),
            state: support.state(),
            reason: support.reason().map(ToOwned::to_owned),
            features: self.features(),
            operations: vec![
                operation_descriptor(
                    "probe",
                    OperationMode::Unary,
                    CancellationMode::None,
                    false,
                    false,
                ),
                operation_descriptor(
                    "refresh",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    false,
                    false,
                ),
                operation_descriptor(
                    "hit_test",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    false,
                    false,
                ),
                operation_descriptor(
                    "capture",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    false,
                    true,
                ),
                operation_descriptor(
                    "compose",
                    OperationMode::Unary,
                    CancellationMode::Cooperative,
                    true,
                    true,
                ),
                operation_descriptor(
                    "frames",
                    OperationMode::Stream,
                    CancellationMode::Cooperative,
                    false,
                    true,
                ),
            ],
        }
    }

    pub async fn invoke_unary(
        &self,
        operation: &str,
        payload: Value,
        attachments: Vec<InputAttachment>,
        cancellation: CancellationToken,
    ) -> Result<OperationOutput, ProtocolError> {
        ensure_active(&cancellation)?;
        if operation == "compose" {
            return compose_output(
                compose_region(payload, attachments, self.limits)?,
                self.limits,
            );
        }
        let request =
            decode_screenshot_request(operation, payload, attachments.len(), &self.limits)?;
        match request {
            ScreenshotRequest::Probe => {
                let probe = self.backend.probe(cancellation).await?;
                let support = self.backend.support();
                serialize_output(ScreenshotProbeResult {
                    platform: probe.platform,
                    engine: support.engine().unwrap_or("unsupported").to_string(),
                    os_version: probe.os_version,
                    screen_recording: probe.screen_recording,
                    accessibility: probe.accessibility,
                    features: self.features(),
                    limits: self.limits.public(),
                })
            }
            ScreenshotRequest::Refresh(input) => {
                serialize_output(self.backend.refresh(input, cancellation).await?)
            }
            ScreenshotRequest::HitTest(input) => {
                serialize_output(self.backend.hit_test(input, cancellation).await?)
            }
            ScreenshotRequest::Capture(input) => capture_output(
                self.backend.capture(input, cancellation).await?,
                self.limits,
            ),
            ScreenshotRequest::Frames(_) => Err(ProtocolError::operation_not_found()),
        }
    }

    pub async fn invoke_stream(
        &self,
        context: StreamContext,
        payload: Value,
        input_attachment_count: usize,
    ) -> Result<OperationOutput, ProtocolError> {
        let cancellation = context.cancellation();
        ensure_active(&cancellation)?;
        let request =
            decode_screenshot_request("frames", payload, input_attachment_count, &self.limits)?;
        let ScreenshotRequest::Frames(input) = request else {
            return Err(ProtocolError::operation_not_found());
        };
        let source = self
            .backend
            .frames(input.clone(), cancellation.clone())
            .await?;
        let mut guard = FrameSourceGuard::new(Arc::clone(&source));
        let stream_result = run_frame_stream(&context, &source, &input, self.limits).await;
        source.request_stop();
        let stop_result = source.stop().await;
        guard.disarm();

        match stream_result {
            Err(error) => Err(error),
            Ok(output) => {
                stop_result?;
                Ok(output)
            }
        }
    }

    pub fn register_handlers(
        self: &Arc<Self>,
        registry: &mut CapabilityRegistry,
    ) -> Result<(), ProtocolError> {
        registry.register_capability(self.descriptor())?;
        for operation in ["probe", "refresh", "hit_test", "capture", "compose"] {
            let capability = Arc::clone(self);
            registry.register_unary(
                SCREENSHOT_CAPABILITY_ID,
                operation,
                move |context: OperationContext, payload, attachments: Vec<InputAttachment>| {
                    let capability = Arc::clone(&capability);
                    async move {
                        capability
                            .invoke_unary(operation, payload, attachments, context.cancellation)
                            .await
                    }
                },
            )?;
        }
        let capability = Arc::clone(self);
        registry.register_stream(
            SCREENSHOT_CAPABILITY_ID,
            "frames",
            move |context, payload, attachments: Vec<InputAttachment>| {
                let capability = Arc::clone(&capability);
                async move {
                    capability
                        .invoke_stream(context, payload, attachments.len())
                        .await
                }
            },
        )?;
        Ok(())
    }
}

async fn run_frame_stream(
    context: &StreamContext,
    source: &Arc<dyn BackendFrameSource>,
    input: &FramesInput,
    limits: ScreenshotLimits,
) -> Result<OperationOutput, ProtocolError> {
    let mut emitted_frames = 0_u64;
    let mut dropped_source_frames = 0_u64;
    loop {
        let Some(frame) = source.next_frame(context.cancellation()).await? else {
            break;
        };
        dropped_source_frames = dropped_source_frames.max(frame.dropped_source_frames);
        context
            .emit(frame_output(frame, input.max_frame_bytes, limits)?)
            .await?;
        emitted_frames = emitted_frames.saturating_add(1);
    }
    Ok(OperationOutput::new(json!({
        "emittedFrames": emitted_frames,
        "droppedSourceFrames": dropped_source_frames,
    })))
}

fn capture_output(
    capture: BackendCapture,
    limits: ScreenshotLimits,
) -> Result<OperationOutput, ProtocolError> {
    if capture.width == 0 || capture.height == 0 || capture.png_bytes.is_empty() {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    let pixel_size = PixelSize::new(capture.width, capture.height)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    if pixel_size
        .pixel_count()
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
        > limits.max_static_output_pixels()
    {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }
    if !matches!(
        capture.target_kind.as_str(),
        "display" | "window" | "region" | "ui-element"
    ) {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    let total_bytes = u64::try_from(capture.png_bytes.len())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let split = split_attachments(
        &capture.png_bytes,
        "image",
        "image/png",
        "screenshot-image",
        limits,
    )?;
    Ok(OperationOutput {
        payload: json!({
            "generation": capture.generation,
            "targetKind": capture.target_kind,
            "mimeType": "image/png",
            "width": capture.width,
            "height": capture.height,
            "outputScale": capture.output_scale,
            "globalRect": capture.global_rect,
            "byteLength": total_bytes,
            "imageParts": split.parts,
        }),
        attachments: split.attachments,
        counters: BTreeMap::new(),
    })
}

fn compose_output(
    capture: ComposedCapture,
    limits: ScreenshotLimits,
) -> Result<OperationOutput, ProtocolError> {
    if capture.width == 0 || capture.height == 0 || capture.png_bytes.is_empty() {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    let pixel_size = PixelSize::new(capture.width, capture.height)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    if pixel_size
        .pixel_count()
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
        > limits.max_static_output_pixels()
    {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }
    let total_bytes = u64::try_from(capture.png_bytes.len())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let split = split_attachments(
        &capture.png_bytes,
        "image",
        "image/png",
        "screenshot-image",
        limits,
    )?;
    Ok(OperationOutput {
        payload: json!({
            "generation": capture.generation,
            "targetKind": "region",
            "mimeType": "image/png",
            "width": capture.width,
            "height": capture.height,
            "outputScale": capture.output_scale,
            "globalRect": capture.global_rect,
            "byteLength": total_bytes,
            "imageParts": split.parts,
        }),
        attachments: split.attachments,
        counters: BTreeMap::new(),
    })
}

fn frame_output(
    frame: BackendFrame,
    requested_max_frame_bytes: u64,
    limits: ScreenshotLimits,
) -> Result<OperationOutput, ProtocolError> {
    let minimum_stride = frame
        .width
        .checked_mul(4)
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let expected_bytes = u64::from(frame.stride)
        .checked_mul(u64::from(frame.height))
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let actual_bytes = u64::try_from(frame.bgra_bytes.len())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    if frame.width == 0
        || frame.height == 0
        || frame.stride < minimum_stride
        || actual_bytes != expected_bytes
    {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    if actual_bytes > requested_max_frame_bytes
        || actual_bytes > limits.max_stream_frame_bytes()
        || frame.timestamp_unix_ms > MAX_SAFE_SEQUENCE
        || frame.dropped_source_frames > MAX_SAFE_SEQUENCE
    {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }
    let split = split_attachments(
        &frame.bgra_bytes,
        "frame",
        "application/octet-stream",
        "screenshot-frame",
        limits,
    )?;
    let mut counters = BTreeMap::new();
    counters.insert(
        "dropped-source-frames".to_string(),
        frame.dropped_source_frames,
    );
    Ok(OperationOutput {
        payload: json!({
            "width": frame.width,
            "height": frame.height,
            "stride": frame.stride,
            "pixelFormat": "bgra8-premultiplied",
            "globalRect": frame.global_rect,
            "timestampUnixMs": frame.timestamp_unix_ms,
            "droppedSourceFrames": frame.dropped_source_frames,
            "frameParts": split.parts,
        }),
        attachments: split.attachments,
        counters,
    })
}

struct SplitAttachments {
    parts: Vec<Value>,
    attachments: Vec<OutputAttachment>,
}

fn split_attachments(
    bytes: &[u8],
    id_prefix: &str,
    media_type: &str,
    purpose: &str,
    limits: ScreenshotLimits,
) -> Result<SplitAttachments, ProtocolError> {
    let total_bytes = u64::try_from(bytes.len())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let chunk_limits = AttachmentChunkLimits::new(
        limits.max_attachment_part_bytes(),
        MAX_ATTACHMENT_COUNT,
        limits.max_packet_attachment_bytes(),
    )
    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    let chunks = plan_attachment_chunks(total_bytes, chunk_limits)
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let mut parts = Vec::with_capacity(chunks.len());
    let mut attachments = Vec::with_capacity(chunks.len());
    for (index, chunk) in chunks.into_iter().enumerate() {
        let id = format!("{id_prefix}:{index}");
        let start = usize::try_from(chunk.offset())
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        let byte_length = usize::try_from(chunk.byte_length())
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        let end = start
            .checked_add(byte_length)
            .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        let data = bytes
            .get(start..end)
            .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())?
            .to_vec();
        parts.push(json!({
            "attachmentId": id,
            "offset": chunk.offset(),
            "byteLength": chunk.byte_length(),
        }));
        attachments.push(OutputAttachment {
            id,
            data,
            media_type: Some(media_type.to_string()),
            purpose: Some(purpose.to_string()),
        });
    }
    Ok(SplitAttachments { parts, attachments })
}

fn serialize_output<T>(value: T) -> Result<OperationOutput, ProtocolError>
where
    T: Serialize,
{
    serde_json::to_value(value)
        .map(OperationOutput::new)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn ensure_active(cancellation: &CancellationToken) -> Result<(), ProtocolError> {
    match cancellation.reason() {
        Some(CancelReason::Deadline) => Err(ProtocolError::deadline_exceeded()),
        Some(_) => Err(ProtocolError::cancelled()),
        None => Ok(()),
    }
}

struct FrameSourceGuard {
    source: Arc<dyn BackendFrameSource>,
    armed: bool,
}

impl FrameSourceGuard {
    fn new(source: Arc<dyn BackendFrameSource>) -> Self {
        Self {
            source,
            armed: true,
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for FrameSourceGuard {
    fn drop(&mut self) {
        if self.armed {
            self.source.request_stop();
        }
    }
}
