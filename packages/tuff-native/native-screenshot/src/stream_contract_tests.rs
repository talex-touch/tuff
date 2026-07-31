use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};
use tuff_native_core::{
    AttachmentDescriptor, CancelReason, CancellationToken, CapabilityRegistry, Control,
    NativeRuntime, PROTOCOL_MAJOR, PROTOCOL_MINOR, ProtocolLimits, ProtocolVersion, StreamMessage,
};

use crate::backend::{
    BackendCapture, BackendFrame, BackendFrameSource, BackendFuture, BackendSupport,
    LatestFrameSlot, ScreenshotBackend,
};
use crate::capability::ScreenshotCapability;
use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{AccessibilityStatus, AxisScale, CaptureInput, GlobalDipRect};

#[derive(Clone)]
struct StaticBackend {
    bytes: Vec<u8>,
}

impl ScreenshotBackend for StaticBackend {
    fn support(&self) -> BackendSupport {
        BackendSupport::macos(AccessibilityStatus::Granted)
    }

    fn capture(
        &self,
        input: CaptureInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<BackendCapture> {
        let bytes = self.bytes.clone();
        Box::pin(async move {
            Ok(BackendCapture {
                generation: input.target.generation().clone(),
                target_kind: "display".to_string(),
                width: 2,
                height: 1,
                output_scale: AxisScale::new(2.0, 2.0).unwrap(),
                global_rect: GlobalDipRect::new(0.0, 0.0, 1.0, 0.5).unwrap(),
                png_bytes: bytes,
            })
        })
    }
}

#[derive(Clone)]
struct FrameBackend {
    slot: Arc<LatestFrameSlot>,
}

impl ScreenshotBackend for FrameBackend {
    fn support(&self) -> BackendSupport {
        BackendSupport::macos(AccessibilityStatus::Granted)
    }

    fn frames(
        &self,
        _input: crate::model::FramesInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<Arc<dyn BackendFrameSource>> {
        let source: Arc<dyn BackendFrameSource> = self.slot.clone();
        Box::pin(async move { Ok(source) })
    }
}

fn protocol_version() -> ProtocolVersion {
    ProtocolVersion {
        major: PROTOCOL_MAJOR,
        minor: PROTOCOL_MINOR,
    }
}

fn request(request_id: &str, operation: &str, payload: Value) -> Control {
    Control::Request {
        protocol: protocol_version(),
        request_id: request_id.to_string(),
        capability: "screenshot.capture".to_string(),
        operation: operation.to_string(),
        deadline_unix_ms: None,
        payload,
        attachments: Vec::new(),
    }
}

fn capture_payload() -> Value {
    json!({
        "target": {
            "kind": "display",
            "generation": "generation:1",
            "displayId": "display:1"
        },
        "cursor": "hidden",
        "output": { "format": "png", "scale": "native-max" }
    })
}

fn frames_payload(max_frame_bytes: u64) -> Value {
    json!({
        "target": {
            "kind": "window",
            "generation": "generation:1",
            "windowId": "window:1"
        },
        "cursor": "hidden",
        "framesPerSecond": 30,
        "pixelFormat": "bgra8-premultiplied",
        "maxFrameBytes": max_frame_bytes
    })
}

fn stream_request(stream_id: &str, initial_window: u32, input: Value) -> Control {
    request(
        &format!("request:{stream_id}"),
        "frames",
        json!({
            "streamId": stream_id,
            "initialWindow": initial_window,
            "input": input
        }),
    )
}

fn stream_request_with_deadline(
    stream_id: &str,
    initial_window: u32,
    input: Value,
    deadline_unix_ms: u64,
) -> Control {
    let mut request = stream_request(stream_id, initial_window, input);
    let Control::Request {
        deadline_unix_ms: deadline,
        ..
    } = &mut request
    else {
        unreachable!();
    };
    *deadline = Some(deadline_unix_ms);
    request
}

fn runtime<B>(backend: Arc<B>, limits: ScreenshotLimits) -> Arc<NativeRuntime>
where
    B: ScreenshotBackend + 'static,
{
    let capability = Arc::new(ScreenshotCapability::new(backend, limits));
    let mut registry = CapabilityRegistry::new();
    capability.register_handlers(&mut registry).unwrap();
    NativeRuntime::new(registry, ProtocolLimits::default())
}

async fn receive(receiver: &mut tokio::sync::mpsc::Receiver<StreamMessage>) -> StreamMessage {
    tokio::time::timeout(Duration::from_secs(1), receiver.recv())
        .await
        .expect("stream message timeout")
        .expect("stream message")
}

async fn wait_for_consumer(slot: &LatestFrameSlot) {
    for _ in 0..100 {
        if slot.consumer_started() {
            return;
        }
        tokio::task::yield_now().await;
    }
    panic!("frame source consumer did not start");
}

fn attachment_lengths(descriptors: &[AttachmentDescriptor]) -> Vec<u64> {
    descriptors
        .iter()
        .map(|descriptor| descriptor.byte_length)
        .collect()
}

fn frame(value: u8) -> BackendFrame {
    BackendFrame {
        width: 2,
        height: 1,
        stride: 8,
        global_rect: GlobalDipRect::new(0.0, 0.0, 2.0, 1.0).unwrap(),
        timestamp_unix_ms: u64::from(value),
        dropped_source_frames: 0,
        bgra_bytes: vec![value; 8],
    }
}

#[tokio::test]
async fn registry_capture_correlates_single_part_png_attachment() {
    let runtime = runtime(
        Arc::new(StaticBackend {
            bytes: vec![1, 2, 3],
        }),
        ScreenshotLimits::default(),
    );
    let packet = runtime
        .invoke(
            request("request:capture-single", "capture", capture_payload()),
            Vec::new(),
        )
        .await
        .unwrap();
    let Control::Response {
        ok,
        payload: Some(payload),
        attachments,
        ..
    } = packet.control
    else {
        panic!("expected capture response");
    };

    assert!(ok);
    assert_eq!(attachment_lengths(&attachments), vec![3]);
    assert_eq!(packet.attachments, vec![vec![1, 2, 3]]);
    assert_eq!(payload["imageParts"].as_array().unwrap().len(), 1);
    assert_eq!(payload["imageParts"][0]["attachmentId"], "image:0");
}

#[tokio::test]
async fn registry_capture_correlates_multi_part_png_attachments() {
    let limits = ScreenshotLimits::default().with_attachment_part_bytes_for_test(2);
    let runtime = runtime(
        Arc::new(StaticBackend {
            bytes: vec![1, 2, 3, 4, 5],
        }),
        limits,
    );
    let packet = runtime
        .invoke(
            request("request:capture", "capture", capture_payload()),
            Vec::new(),
        )
        .await
        .unwrap();
    let Control::Response {
        ok,
        payload: Some(payload),
        attachments,
        ..
    } = packet.control
    else {
        panic!("expected capture response");
    };

    assert!(ok);
    assert_eq!(attachment_lengths(&attachments), vec![2, 2, 1]);
    assert_eq!(packet.attachments, vec![vec![1, 2], vec![3, 4], vec![5]]);
    assert_eq!(payload["byteLength"], 5);
    assert_eq!(payload["imageParts"][0]["offset"], 0);
    assert_eq!(payload["imageParts"][1]["offset"], 2);
    assert_eq!(payload["imageParts"][2]["offset"], 4);
}

#[tokio::test]
async fn frames_are_credit_bounded_latest_slot_replaces_and_terminal_is_single() {
    let limits = ScreenshotLimits::default().with_attachment_part_bytes_for_test(4);
    let slot = Arc::new(LatestFrameSlot::new());
    let runtime = runtime(Arc::new(FrameBackend { slot: slot.clone() }), limits);
    let mut opened = runtime
        .open_stream(
            stream_request("stream:frames", 1, frames_payload(1024)),
            Vec::new(),
        )
        .unwrap();

    assert!(slot.publish(frame(1)));
    let first = receive(&mut opened.receiver).await;
    let Control::StreamData {
        sequence,
        attachments,
        ..
    } = &first.control
    else {
        panic!("expected first frame");
    };
    assert_eq!(*sequence, 1);
    assert_eq!(attachment_lengths(attachments), vec![4, 4]);
    assert_eq!(first.attachments, vec![vec![1; 4], vec![1; 4]]);

    assert!(slot.publish(frame(2)));
    tokio::task::yield_now().await;
    assert!(slot.publish(frame(3)));
    assert!(slot.publish(frame(4)));
    tokio::task::yield_now().await;
    assert!(
        opened.receiver.try_recv().is_err(),
        "credit zero must stall publication"
    );

    runtime.acknowledge_stream("stream:frames", 1).unwrap();
    let second = receive(&mut opened.receiver).await;
    assert!(matches!(
        second.control,
        Control::StreamData { sequence: 2, .. }
    ));
    assert_eq!(second.attachments, vec![vec![2; 4], vec![2; 4]]);

    slot.close();
    runtime.acknowledge_stream("stream:frames", 2).unwrap();
    let latest = receive(&mut opened.receiver).await;
    let Control::StreamData {
        sequence, payload, ..
    } = latest.control
    else {
        panic!("expected latest frame");
    };
    assert_eq!(sequence, 3);
    assert_eq!(latest.attachments, vec![vec![4; 4], vec![4; 4]]);
    assert!(payload["droppedSourceFrames"].as_u64().unwrap() >= 1);

    let terminal = receive(&mut opened.receiver).await;
    assert!(matches!(
        terminal.control,
        Control::StreamEnd { sequence: 4, .. }
    ));
    assert!(opened.receiver.recv().await.is_none());
    assert!(slot.stop_requested());
}

#[tokio::test]
async fn source_error_oversized_frame_and_cancel_each_emit_one_error_terminal() {
    let source_error_slot = Arc::new(LatestFrameSlot::new());
    let source_error_runtime = runtime(
        Arc::new(FrameBackend {
            slot: source_error_slot.clone(),
        }),
        ScreenshotLimits::default(),
    );
    let mut source_error_stream = source_error_runtime
        .open_stream(
            stream_request("stream:source-error", 1, frames_payload(1024)),
            Vec::new(),
        )
        .unwrap();
    source_error_slot.fail(ScreenshotError::BackendFailed.to_protocol_error());
    let terminal = receive(&mut source_error_stream.receiver).await;
    let Control::StreamError { error, .. } = terminal.control else {
        panic!("expected source error terminal");
    };
    assert_eq!(error.code, "SCREENSHOT_BACKEND_FAILED");
    assert!(source_error_stream.receiver.recv().await.is_none());

    let oversized_slot = Arc::new(LatestFrameSlot::new());
    let oversized_runtime = runtime(
        Arc::new(FrameBackend {
            slot: oversized_slot.clone(),
        }),
        ScreenshotLimits::default(),
    );
    let mut oversized_stream = oversized_runtime
        .open_stream(
            stream_request("stream:oversized", 1, frames_payload(4)),
            Vec::new(),
        )
        .unwrap();
    assert!(oversized_slot.publish(frame(5)));
    let terminal = receive(&mut oversized_stream.receiver).await;
    let Control::StreamError { error, .. } = terminal.control else {
        panic!("expected oversized terminal");
    };
    assert_eq!(error.code, "SCREENSHOT_OUTPUT_TOO_LARGE");
    assert!(oversized_stream.receiver.recv().await.is_none());

    let cancel_slot = Arc::new(LatestFrameSlot::new());
    let cancel_runtime = runtime(
        Arc::new(FrameBackend {
            slot: cancel_slot.clone(),
        }),
        ScreenshotLimits::default(),
    );
    let mut cancel_stream = cancel_runtime
        .open_stream(
            stream_request("stream:cancel", 1, frames_payload(1024)),
            Vec::new(),
        )
        .unwrap();
    wait_for_consumer(&cancel_slot).await;
    assert!(cancel_runtime.cancel_stream("stream:cancel", CancelReason::Caller));
    let terminal = receive(&mut cancel_stream.receiver).await;
    let Control::StreamError { error, .. } = terminal.control else {
        panic!("expected cancellation terminal");
    };
    assert_eq!(error.code, "CANCELLED");
    assert!(cancel_stream.receiver.recv().await.is_none());
    assert!(
        !cancel_slot.publish(frame(6)),
        "callback after terminal must be suppressed"
    );
    assert!(cancel_slot.stop_requested());
}

#[tokio::test]
async fn deadline_and_dispose_stop_the_source_and_close_with_one_terminal() {
    let deadline_slot = Arc::new(LatestFrameSlot::new());
    let deadline_runtime = runtime(
        Arc::new(FrameBackend {
            slot: deadline_slot.clone(),
        }),
        ScreenshotLimits::default(),
    );
    let deadline_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 50;
    let mut deadline_stream = deadline_runtime
        .open_stream(
            stream_request_with_deadline(
                "stream:deadline",
                1,
                frames_payload(1024),
                deadline_unix_ms,
            ),
            Vec::new(),
        )
        .unwrap();
    wait_for_consumer(&deadline_slot).await;
    let terminal = receive(&mut deadline_stream.receiver).await;
    let Control::StreamError { error, .. } = terminal.control else {
        panic!("expected deadline terminal");
    };
    assert_eq!(error.code, "DEADLINE_EXCEEDED");
    assert!(deadline_stream.receiver.recv().await.is_none());
    assert!(deadline_slot.stop_requested());

    let dispose_slot = Arc::new(LatestFrameSlot::new());
    let dispose_runtime = runtime(
        Arc::new(FrameBackend {
            slot: dispose_slot.clone(),
        }),
        ScreenshotLimits::default(),
    );
    let mut dispose_stream = dispose_runtime
        .open_stream(
            stream_request("stream:dispose", 1, frames_payload(1024)),
            Vec::new(),
        )
        .unwrap();
    wait_for_consumer(&dispose_slot).await;
    dispose_runtime.finish_dispose().await.unwrap();
    let terminal = receive(&mut dispose_stream.receiver).await;
    let Control::StreamError { error, .. } = terminal.control else {
        panic!("expected dispose terminal");
    };
    assert_eq!(error.code, "CANCELLED");
    assert!(dispose_stream.receiver.recv().await.is_none());
    assert!(dispose_slot.stop_requested());
}

#[test]
fn latest_slot_replacement_is_bounded_before_a_consumer_starts() {
    let slot = LatestFrameSlot::new();
    for value in 1..=100_u8 {
        assert!(slot.publish(frame(value)));
    }
    assert_eq!(slot.pending_frame_count(), 1);
    assert_eq!(slot.replaced_frame_count(), 99);
}
