use std::collections::VecDeque;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use image::{ImageFormat, Rgba, RgbaImage};
use tuff_native_core::{CancelReason, CancellationToken, ProtocolError};

use crate::backend::{
    BackendCapture, BackendFrame, BackendFrameSource, BackendFuture, BackendProbe, BackendSupport,
    ScreenshotBackend,
};
use crate::error::ScreenshotError;
use crate::model::{
    AccessibilityStatus, AxisScale, CaptureInput, CaptureTarget, ContentSnapshot, CoordinateSpace,
    DescriptorId, DisplayDescriptor, FramesInput, GlobalDipRect, HitTestInput, HitTestResult,
    PermissionStatus, PixelSize, RefreshInput, Rotation,
};

pub struct DeterministicBackend {
    counter: AtomicU64,
    current_generation: Mutex<Option<DescriptorId>>,
}

impl DeterministicBackend {
    pub fn new() -> Self {
        Self {
            counter: AtomicU64::new(0),
            current_generation: Mutex::new(None),
        }
    }

    fn ensure_generation(&self, generation: &DescriptorId) -> Result<(), ProtocolError> {
        if lock(&self.current_generation).as_ref() == Some(generation) {
            Ok(())
        } else {
            Err(ScreenshotError::StaleGeneration.to_protocol_error())
        }
    }
}

impl Default for DeterministicBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl ScreenshotBackend for DeterministicBackend {
    fn support(&self) -> BackendSupport {
        BackendSupport::deterministic_test()
    }

    fn probe(&self, _cancellation: CancellationToken) -> BackendFuture<BackendProbe> {
        Box::pin(async {
            Ok(BackendProbe {
                platform: std::env::consts::OS.to_string(),
                os_version: None,
                screen_recording: PermissionStatus::Granted,
                accessibility: AccessibilityStatus::Granted,
            })
        })
    }

    fn refresh(
        &self,
        _input: RefreshInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<ContentSnapshot> {
        let generation_number = self.counter.fetch_add(1, Ordering::AcqRel) + 1;
        let generation = DescriptorId::new(format!("generation:test:{generation_number}"))
            .expect("test generation id");
        *lock(&self.current_generation) = Some(generation.clone());
        Box::pin(async move {
            Ok(ContentSnapshot {
                generation,
                coordinate_space: CoordinateSpace::GlobalDipV1,
                captured_at_unix_ms: generation_number,
                displays: vec![DisplayDescriptor {
                    id: DescriptorId::new("display:test:1").expect("test display id"),
                    native_id: "1".to_string(),
                    name: "Deterministic Display".to_string(),
                    global_frame: GlobalDipRect::new(0.0, 0.0, 2.0, 1.0)
                        .expect("test display frame"),
                    pixel_size: PixelSize::new(4, 2).expect("test pixel size"),
                    scale: AxisScale::new(2.0, 2.0).expect("test scale"),
                    rotation: Rotation::Degrees0,
                    is_primary: true,
                }],
                windows: Vec::new(),
                accessibility: AccessibilityStatus::Granted,
            })
        })
    }

    fn hit_test(
        &self,
        input: HitTestInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<HitTestResult> {
        let result = self
            .ensure_generation(&input.generation)
            .map(|()| HitTestResult {
                generation: input.generation,
                point: input.point,
                candidates: Vec::new(),
                accessibility_fallback: None,
            });
        Box::pin(async move { result })
    }

    fn capture(
        &self,
        input: CaptureInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<BackendCapture> {
        let result = self
            .ensure_generation(input.target.generation())
            .and_then(|()| {
                Ok(BackendCapture {
                    generation: input.target.generation().clone(),
                    target_kind: target_kind(&input.target).to_string(),
                    width: 1,
                    height: 1,
                    output_scale: AxisScale::new(1.0, 1.0)
                        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                    global_rect: GlobalDipRect::new(0.0, 0.0, 1.0, 1.0)
                        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                    png_bytes: deterministic_png()?,
                })
            });
        Box::pin(async move { result })
    }

    fn frames(
        &self,
        input: FramesInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<Arc<dyn BackendFrameSource>> {
        let result = self.ensure_generation(input.target.generation()).map(|()| {
            let fail_after_first = input.frames_per_second == 13;
            let frame_count = if fail_after_first { 1 } else { 3 };
            let frames = (1..=frame_count)
                .map(|value| BackendFrame {
                    width: 2,
                    height: 1,
                    stride: 8,
                    global_rect: GlobalDipRect::new(0.0, 0.0, 2.0, 1.0).expect("test frame rect"),
                    timestamp_unix_ms: u64::from(value),
                    dropped_source_frames: 0,
                    bgra_bytes: vec![value; 8],
                })
                .collect::<VecDeque<_>>();
            Arc::new(DeterministicFrameSource {
                frames: Mutex::new(frames),
                terminal_error: Mutex::new(
                    fail_after_first.then(|| ScreenshotError::BackendFailed.to_protocol_error()),
                ),
                stop_requested: AtomicBool::new(false),
            }) as Arc<dyn BackendFrameSource>
        });
        Box::pin(async move { result })
    }
}

struct DeterministicFrameSource {
    frames: Mutex<VecDeque<BackendFrame>>,
    terminal_error: Mutex<Option<ProtocolError>>,
    stop_requested: AtomicBool,
}

impl BackendFrameSource for DeterministicFrameSource {
    fn next_frame(&self, cancellation: CancellationToken) -> BackendFuture<Option<BackendFrame>> {
        let result = match cancellation.reason() {
            Some(CancelReason::Deadline) => Err(ProtocolError::deadline_exceeded()),
            Some(_) => Err(ProtocolError::cancelled()),
            None if self.stop_requested.load(Ordering::Acquire) => Ok(None),
            None => match lock(&self.frames).pop_front() {
                Some(frame) => Ok(Some(frame)),
                None => match lock(&self.terminal_error).take() {
                    Some(error) => Err(error),
                    None => Ok(None),
                },
            },
        };
        Box::pin(async move { result })
    }

    fn request_stop(&self) {
        self.stop_requested.store(true, Ordering::Release);
    }

    fn stop(&self) -> BackendFuture<()> {
        self.request_stop();
        Box::pin(async { Ok(()) })
    }
}

fn target_kind(target: &CaptureTarget) -> &'static str {
    match target {
        CaptureTarget::Display { .. } => "display",
        CaptureTarget::Window { .. } => "window",
        CaptureTarget::Region { .. } => "region",
        CaptureTarget::UiElement { .. } => "ui-element",
    }
}

fn deterministic_png() -> Result<Vec<u8>, ProtocolError> {
    let image = RgbaImage::from_pixel(1, 1, Rgba([0x11, 0x22, 0x33, 0xff]));
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    Ok(bytes)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
