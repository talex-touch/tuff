use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, TrySendError, sync_channel};
use std::sync::{Arc, Weak};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use image::{ImageFormat, RgbaImage};
use tokio::sync::{Notify, oneshot};
use tuff_native_core::{CancelReason, CancellationToken, ProtocolError};

use super::system::{
    MacCaptureConfiguration, MacCapturedImage, MacCgWindowMetadata, MacShareableContent,
    MacStreamOptions, MacSystemDisplay, MacSystemError, MacSystemErrorKind, MacSystemWindow,
    StaticCaptureApi, bgra_rows_to_rgba, desktop_independent_window_filter,
    display_filter_excluding_applications, display_filter_excluding_windows, request_capture_image,
    request_shareable_content,
};
use crate::backend::{
    BackendCapture, BackendFrame, BackendFrameSource, BackendFuture, LatestFrameSlot,
};
use crate::error::ScreenshotError;
use crate::geometry::DisplayGeometry;
use crate::limits::ScreenshotLimits;
use crate::model::{
    AccessibilityFallback, AccessibilityStatus, CaptureInput, CaptureOutputScale, CaptureTarget,
    ContentSnapshot, CoordinateSpace, CursorPolicy, DescriptorId, DisplayDescriptor, FramesInput,
    GlobalDipRect, HitTestCandidate, HitTestGranularity, HitTestInput, HitTestResult, Rotation,
    UiElementDescriptor, WindowDescriptorKind, WindowOwnerDescriptor, WindowSnapshotDescriptor,
};
use crate::region_plan::{RegionDisplay, RegionOutputScale, RegionPlan, RegionPlanLimits};
use crate::window_candidates::{
    CgWindowMetadata, SelfWindowPolicy, ShareableWindow, WindowDescriptor, WindowHitTestOptions,
    WindowKind, WindowOwner, WindowSelectionPolicy, WindowSharing, build_window_descriptors,
    hit_test_windows,
};

const ACTOR_QUEUE_CAPACITY: usize = 16;
const SYSTEM_CALLBACK_TIMEOUT: Duration = Duration::from_secs(5);
const CALLBACK_POLL: Duration = Duration::from_millis(20);
const WINDOW_MINIMUM_SIZE: f64 = 2.0;
const SYSTEM_BUNDLE_IDS: &[&str] = &[
    "com.apple.controlcenter",
    "com.apple.dock",
    "com.apple.notificationcenterui",
    "com.apple.WindowManager",
];

#[derive(Clone)]
pub struct MacScreenActor {
    inner: Arc<ActorInner>,
}

struct ActorInner {
    sender: SyncSender<Command>,
    closed: AtomicBool,
}

enum Command {
    Refresh {
        input: crate::model::RefreshInput,
        cancellation: CancellationToken,
        response: oneshot::Sender<Result<ContentSnapshot, ProtocolError>>,
    },
    HitTest {
        input: HitTestInput,
        cancellation: CancellationToken,
        response: oneshot::Sender<Result<HitTestResult, ProtocolError>>,
    },
    Capture {
        input: CaptureInput,
        cancellation: CancellationToken,
        response: oneshot::Sender<Result<BackendCapture, ProtocolError>>,
    },
    StartFrames {
        input: FramesInput,
        cancellation: CancellationToken,
        response: oneshot::Sender<Result<Arc<dyn BackendFrameSource>, ProtocolError>>,
    },
    StopFrames {
        stream_id: u64,
        control: Arc<FrameControl>,
    },
    Shutdown,
}

struct ActorState {
    limits: ScreenshotLimits,
    static_capture_api: StaticCaptureApi,
    generation_counter: u64,
    stream_counter: u64,
    streams: HashMap<u64, ActorStreamSession>,
    current: Option<GenerationState>,
}

struct GenerationState {
    generation: DescriptorId,
    snapshot: ContentSnapshot,
    displays: Vec<MacSystemDisplay>,
    region_displays: Vec<RegionDisplay>,
    windows: Vec<WindowDescriptor>,
    system_windows: Vec<MacSystemWindow>,
}

enum ActorStreamSession {
    System(super::system::MacStreamSession),
    #[cfg(test)]
    Fake {
        stopped: Arc<AtomicBool>,
    },
}

impl ActorStreamSession {
    fn stop<F>(&self, completion: F)
    where
        F: FnOnce(Result<(), MacSystemError>) + Send + 'static,
    {
        match self {
            Self::System(session) => session.stop(completion),
            #[cfg(test)]
            Self::Fake { stopped } => {
                stopped.store(true, Ordering::Release);
                completion(Ok(()));
            }
        }
    }
}

struct FrameControl {
    slot: LatestFrameSlot,
    stopped: AtomicBool,
    stop_requested: AtomicBool,
    stop_notify: Notify,
}

struct MacFrameSource {
    stream_id: u64,
    actor: Arc<ActorInner>,
    control: Arc<FrameControl>,
}

impl BackendFrameSource for MacFrameSource {
    fn next_frame(&self, cancellation: CancellationToken) -> BackendFuture<Option<BackendFrame>> {
        self.control.slot.next_frame(cancellation)
    }

    fn request_stop(&self) {
        if self.control.stop_requested.swap(true, Ordering::AcqRel) {
            return;
        }
        self.control.slot.request_stop();
        let command = Command::StopFrames {
            stream_id: self.stream_id,
            control: Arc::clone(&self.control),
        };
        if self.actor.sender.try_send(command).is_err() {
            self.control.stopped.store(true, Ordering::Release);
            self.control.stop_notify.notify_waiters();
        }
    }

    fn stop(&self) -> BackendFuture<()> {
        self.request_stop();
        let control = Arc::clone(&self.control);
        Box::pin(async move {
            while !control.stopped.load(Ordering::Acquire) {
                control.stop_notify.notified().await;
            }
            Ok(())
        })
    }
}

impl MacScreenActor {
    pub fn new(
        limits: ScreenshotLimits,
        static_capture_api: StaticCaptureApi,
    ) -> Result<Self, ProtocolError> {
        let (sender, receiver) = sync_channel(ACTOR_QUEUE_CAPACITY);
        let inner = Arc::new(ActorInner {
            sender,
            closed: AtomicBool::new(false),
        });
        let actor_inner = Arc::downgrade(&inner);
        thread::Builder::new()
            .name(format!("tuff-macos-screen-{}", std::process::id()))
            .spawn(move || actor_main(receiver, limits, static_capture_api, actor_inner))
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        Ok(Self { inner })
    }

    pub async fn refresh(
        &self,
        input: crate::model::RefreshInput,
        cancellation: CancellationToken,
    ) -> Result<ContentSnapshot, ProtocolError> {
        let (response, receiver) = oneshot::channel();
        self.submit(Command::Refresh {
            input,
            cancellation: cancellation.clone(),
            response,
        })?;
        await_response(receiver, cancellation).await
    }

    pub async fn hit_test(
        &self,
        input: HitTestInput,
        cancellation: CancellationToken,
    ) -> Result<HitTestResult, ProtocolError> {
        let (response, receiver) = oneshot::channel();
        self.submit(Command::HitTest {
            input,
            cancellation: cancellation.clone(),
            response,
        })?;
        await_response(receiver, cancellation).await
    }

    pub async fn capture(
        &self,
        input: CaptureInput,
        cancellation: CancellationToken,
    ) -> Result<BackendCapture, ProtocolError> {
        let (response, receiver) = oneshot::channel();
        self.submit(Command::Capture {
            input,
            cancellation: cancellation.clone(),
            response,
        })?;
        await_response(receiver, cancellation).await
    }

    pub async fn frames(
        &self,
        input: FramesInput,
        cancellation: CancellationToken,
    ) -> Result<Arc<dyn BackendFrameSource>, ProtocolError> {
        let (response, receiver) = oneshot::channel();
        self.submit(Command::StartFrames {
            input,
            cancellation: cancellation.clone(),
            response,
        })?;
        await_response(receiver, cancellation).await
    }

    fn submit(&self, command: Command) -> Result<(), ProtocolError> {
        if self.inner.closed.load(Ordering::Acquire) {
            return Err(ScreenshotError::BackendFailed.to_protocol_error());
        }
        match self.inner.sender.try_send(command) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => Err(ScreenshotError::BackendBusy.to_protocol_error()),
            Err(TrySendError::Disconnected(_)) => {
                self.inner.closed.store(true, Ordering::Release);
                Err(ScreenshotError::BackendFailed.to_protocol_error())
            }
        }
    }
}

impl Drop for ActorInner {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::Release);
        let _ = self.sender.try_send(Command::Shutdown);
    }
}

async fn await_response<T>(
    receiver: oneshot::Receiver<Result<T, ProtocolError>>,
    cancellation: CancellationToken,
) -> Result<T, ProtocolError> {
    tokio::select! {
        result = receiver => result
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
        reason = cancellation.cancelled() => Err(cancellation_error(reason)),
    }
}

fn actor_main(
    receiver: Receiver<Command>,
    limits: ScreenshotLimits,
    static_capture_api: StaticCaptureApi,
    actor_inner: Weak<ActorInner>,
) {
    let mut state = ActorState {
        limits,
        static_capture_api,
        generation_counter: 0,
        stream_counter: 0,
        streams: HashMap::new(),
        current: None,
    };
    run_actor_loop(receiver, &mut state, actor_inner);
}

fn run_actor_loop(
    receiver: Receiver<Command>,
    state: &mut ActorState,
    actor_inner: Weak<ActorInner>,
) {
    while let Ok(command) = receiver.recv() {
        match command {
            Command::Refresh {
                input,
                cancellation,
                response,
            } => {
                let result = state.refresh(input, &cancellation);
                let _ = response.send(result);
            }
            Command::HitTest {
                input,
                cancellation,
                response,
            } => {
                let result = state.hit_test(input, &cancellation);
                let _ = response.send(result);
            }
            Command::Capture {
                input,
                cancellation,
                response,
            } => {
                let result = state.capture(input, &cancellation);
                let _ = response.send(result);
            }
            Command::StartFrames {
                input,
                cancellation,
                response,
            } => {
                let result = actor_inner
                    .upgrade()
                    .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())
                    .and_then(|inner| state.start_frames(input, &cancellation, inner));
                let _ = response.send(result);
            }
            Command::StopFrames { stream_id, control } => {
                state.stop_frames(stream_id, &control);
            }
            Command::Shutdown => break,
        }
    }
    state.stop_all_frames();
}

impl ActorState {
    fn refresh(
        &mut self,
        input: crate::model::RefreshInput,
        cancellation: &CancellationToken,
    ) -> Result<ContentSnapshot, ProtocolError> {
        ensure_active(cancellation)?;
        let content = wait_for_content(cancellation)?;
        ensure_active(cancellation)?;
        let generation_number = self
            .generation_counter
            .checked_add(1)
            .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())?;
        let generation = descriptor(format!("generation:mac:{generation_number}"))?;
        let system_displays = content.displays().map_err(map_system_error)?;
        if system_displays.is_empty() || system_displays.len() > self.limits.max_displays() {
            return Err(ScreenshotError::BackendFailed.to_protocol_error());
        }

        let mut display_descriptors = Vec::with_capacity(system_displays.len());
        let mut region_displays = Vec::with_capacity(system_displays.len());
        for display in &system_displays {
            let sck_frame = global_rect(display.sck_frame)?;
            let cg_frame = global_rect(display.cg_frame)?;
            if !coherent_rect(sck_frame, cg_frame) {
                return Err(ScreenshotError::TopologyChanged.to_protocol_error());
            }
            let rotation = normalize_rotation(display.rotation_degrees)?;
            let mode_size = crate::model::PixelSize::new(display.pixel_width, display.pixel_height)
                .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
            let geometry = DisplayGeometry::from_mode(sck_frame, mode_size, rotation)
                .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
            let id = descriptor(format!(
                "display:mac:{generation_number}:{}",
                display.native_id
            ))?;
            region_displays.push(RegionDisplay::new(id.clone(), geometry.clone()));
            display_descriptors.push(DisplayDescriptor {
                id,
                native_id: display.native_id.to_string(),
                name: format!("Display {}", display.native_id),
                global_frame: sck_frame,
                pixel_size: geometry.oriented_pixel_size(),
                scale: geometry.scale(),
                rotation,
                is_primary: display.is_primary,
            });
        }

        let system_windows = content
            .windows(input.include_window_titles)
            .map_err(map_system_error)?;
        if system_windows.len() > self.limits.max_shareable_windows() {
            return Err(ScreenshotError::BackendFailed.to_protocol_error());
        }
        let cg_windows = content.cg_window_metadata().map_err(map_system_error)?;
        let self_native_ids = self.resolve_self_window_ids(&input.self_context.native_window_ids);
        let self_process_ids = with_required_process_id(
            input.self_context.process_ids,
            std::process::id(),
            self.limits.max_self_process_ids() as usize,
        );
        let self_policy = SelfWindowPolicy::new(
            self_process_ids,
            input.self_context.bundle_ids,
            self_native_ids,
        )
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        let selection_policy = WindowSelectionPolicy::new(
            WINDOW_MINIMUM_SIZE,
            self_policy,
            SYSTEM_BUNDLE_IDS
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        )
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        let shareable_windows = system_windows
            .iter()
            .filter_map(|window| shareable_window(window, generation_number).ok())
            .collect::<Vec<_>>();
        let cg_windows = cg_windows
            .iter()
            .filter_map(|window| cg_window(window).ok())
            .collect::<Vec<_>>();
        let windows = build_window_descriptors(
            shareable_windows,
            cg_windows,
            &region_displays,
            &selection_policy,
        );
        let snapshot_windows = windows.iter().map(snapshot_window).collect::<Vec<_>>();
        ensure_active(cancellation)?;
        let snapshot = ContentSnapshot {
            generation: generation.clone(),
            coordinate_space: CoordinateSpace::GlobalDipV1,
            captured_at_unix_ms: unix_time_ms()?,
            displays: display_descriptors,
            windows: snapshot_windows,
            accessibility: if super::system::permission_probe().accessibility {
                AccessibilityStatus::Granted
            } else {
                AccessibilityStatus::Denied
            },
        };
        let next = GenerationState {
            generation,
            snapshot,
            displays: system_displays,
            region_displays,
            windows,
            system_windows,
        };
        self.commit_generation(generation_number, next, cancellation)
    }

    fn commit_generation(
        &mut self,
        generation_number: u64,
        next: GenerationState,
        cancellation: &CancellationToken,
    ) -> Result<ContentSnapshot, ProtocolError> {
        ensure_active(cancellation)?;
        let snapshot = next.snapshot.clone();
        self.generation_counter = generation_number;
        self.current = Some(next);
        Ok(snapshot)
    }

    fn hit_test(
        &self,
        input: HitTestInput,
        cancellation: &CancellationToken,
    ) -> Result<HitTestResult, ProtocolError> {
        ensure_active(cancellation)?;
        let current = self
            .current
            .as_ref()
            .ok_or_else(|| ScreenshotError::StaleGeneration.to_protocol_error())?;
        if current.generation != input.generation {
            return Err(ScreenshotError::StaleGeneration.to_protocol_error());
        }
        let windows = hit_test_windows(
            &current.windows,
            input.point,
            WindowHitTestOptions::new(input.include_panels, input.max_candidates),
        );
        let candidates = windows
            .iter()
            .map(|window| HitTestCandidate {
                window: snapshot_window(window),
                element: None::<UiElementDescriptor>,
            })
            .collect();
        let accessibility_fallback = match input.granularity {
            HitTestGranularity::Window => None,
            HitTestGranularity::UiElement
                if current.snapshot.accessibility == AccessibilityStatus::Denied =>
            {
                Some(AccessibilityFallback::PermissionDenied)
            }
            HitTestGranularity::UiElement => Some(AccessibilityFallback::Unsupported),
        };
        ensure_active(cancellation)?;
        Ok(HitTestResult {
            generation: current.generation.clone(),
            point: input.point,
            candidates,
            accessibility_fallback,
        })
    }

    fn capture(
        &self,
        input: CaptureInput,
        cancellation: &CancellationToken,
    ) -> Result<BackendCapture, ProtocolError> {
        ensure_active(cancellation)?;
        if !super::system::permission_probe().screen_recording {
            return Err(ScreenshotError::PermissionDenied.to_protocol_error());
        }
        let current = self
            .current
            .as_ref()
            .ok_or_else(|| ScreenshotError::StaleGeneration.to_protocol_error())?;
        if current.generation != *input.target.generation() {
            return Err(ScreenshotError::StaleGeneration.to_protocol_error());
        }
        let shows_cursor = input.cursor == CursorPolicy::System;
        let (target_kind, global_rect, output_scale, image) = match &input.target {
            CaptureTarget::Display { display_id, .. } => {
                let descriptor = current
                    .snapshot
                    .displays
                    .iter()
                    .find(|display| &display.id == display_id)
                    .ok_or_else(|| ScreenshotError::DisplayNotFound.to_protocol_error())?;
                let display = current
                    .displays
                    .iter()
                    .find(|display| display.native_id.to_string() == descriptor.native_id)
                    .ok_or_else(|| ScreenshotError::DisplayNotFound.to_protocol_error())?;
                let scale = resolve_capture_scale(input.output.scale, descriptor.scale)?;
                let (width, height) =
                    output_dimensions(descriptor.global_frame, scale, self.limits)?;
                let filter =
                    display_filter(current, display, input.include_self_window_id.as_ref());
                let configuration = MacCaptureConfiguration::new(width, height, None, shows_cursor)
                    .map_err(map_system_error)?;
                let image = capture_static_image(
                    self.static_capture_api,
                    &filter,
                    &configuration,
                    self.limits,
                    cancellation,
                )?;
                ("display", descriptor.global_frame, scale, image)
            }
            CaptureTarget::Window { window_id, .. } => {
                let descriptor = current
                    .windows
                    .iter()
                    .find(|window| window.id() == window_id)
                    .ok_or_else(|| ScreenshotError::WindowNotFound.to_protocol_error())?;
                if !descriptor.capturable()
                    || (descriptor.is_self()
                        && input.include_self_window_id.as_ref() != Some(window_id))
                {
                    return Err(ScreenshotError::WindowNotFound.to_protocol_error());
                }
                let window = current
                    .system_windows
                    .iter()
                    .find(|window| window.native_id == descriptor.native_id())
                    .ok_or_else(|| ScreenshotError::WindowNotFound.to_protocol_error())?;
                let native_scale = descriptor.maximum_scale().unwrap_or(
                    crate::model::AxisScale::new(1.0, 1.0)
                        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                );
                let scale = resolve_capture_scale(input.output.scale, native_scale)?;
                let (width, height) =
                    output_dimensions(descriptor.global_frame(), scale, self.limits)?;
                let filter = desktop_independent_window_filter(window);
                let configuration = MacCaptureConfiguration::new(width, height, None, shows_cursor)
                    .map_err(map_system_error)?;
                let image = capture_static_image(
                    self.static_capture_api,
                    &filter,
                    &configuration,
                    self.limits,
                    cancellation,
                )?;
                ("window", descriptor.global_frame(), scale, image)
            }
            CaptureTarget::Region { rect, .. } => {
                let requested_scale = match input.output.scale {
                    CaptureOutputScale::NativeMax => RegionOutputScale::NativeMax,
                    CaptureOutputScale::Explicit(scale) => RegionOutputScale::Explicit(scale),
                };
                let plan = RegionPlan::build(
                    *rect,
                    current.region_displays.clone(),
                    requested_scale,
                    RegionPlanLimits::new(
                        self.limits.max_static_output_pixels(),
                        self.limits.max_static_working_set_bytes(),
                    )
                    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                )
                .map_err(|_| ScreenshotError::InvalidRegion.to_protocol_error())?;
                let output_size = plan.output_size();
                let output_bytes = usize::try_from(
                    output_size
                        .pixel_count()
                        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
                        .checked_mul(4)
                        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?,
                )
                .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
                let mut rgba = vec![0_u8; output_bytes];
                for segment in plan.segments() {
                    ensure_active(cancellation)?;
                    let display_descriptor = current
                        .snapshot
                        .displays
                        .iter()
                        .find(|display| &display.id == segment.display_id())
                        .ok_or_else(|| ScreenshotError::TopologyChanged.to_protocol_error())?;
                    let display = current
                        .displays
                        .iter()
                        .find(|display| {
                            display.native_id.to_string() == display_descriptor.native_id
                        })
                        .ok_or_else(|| ScreenshotError::TopologyChanged.to_protocol_error())?;
                    let destination = segment.destination();
                    let source = segment.source_points();
                    let source_rect = objc2_core_foundation::CGRect::new(
                        objc2_core_foundation::CGPoint::new(source.x(), source.y()),
                        objc2_core_foundation::CGSize::new(source.width(), source.height()),
                    );
                    let filter =
                        display_filter(current, display, input.include_self_window_id.as_ref());
                    let configuration = MacCaptureConfiguration::new(
                        destination.width(),
                        destination.height(),
                        Some(source_rect),
                        shows_cursor,
                    )
                    .map_err(map_system_error)?;
                    let part = capture_static_image(
                        self.static_capture_api,
                        &filter,
                        &configuration,
                        self.limits,
                        cancellation,
                    )?;
                    if part.width != destination.width() || part.height != destination.height() {
                        return Err(ScreenshotError::TopologyChanged.to_protocol_error());
                    }
                    composite_rgba(&mut rgba, output_size.width(), &part, destination)?;
                }
                (
                    "region",
                    *rect,
                    plan.output_scale(),
                    MacCapturedImage {
                        width: output_size.width(),
                        height: output_size.height(),
                        rgba_bytes: rgba,
                    },
                )
            }
            CaptureTarget::UiElement { .. } => {
                return Err(ScreenshotError::Unsupported.to_protocol_error());
            }
        };
        ensure_active(cancellation)?;
        if image.width == 0 || image.height == 0 {
            return Err(ScreenshotError::FrameUnavailable.to_protocol_error());
        }
        let png_bytes = encode_png(&image)?;
        Ok(BackendCapture {
            generation: current.generation.clone(),
            target_kind: target_kind.to_string(),
            width: image.width,
            height: image.height,
            output_scale,
            global_rect,
            png_bytes,
        })
    }

    fn start_frames(
        &mut self,
        input: FramesInput,
        cancellation: &CancellationToken,
        actor: Arc<ActorInner>,
    ) -> Result<Arc<dyn BackendFrameSource>, ProtocolError> {
        ensure_active(cancellation)?;
        if !super::system::permission_probe().screen_recording {
            return Err(ScreenshotError::PermissionDenied.to_protocol_error());
        }
        let current = self
            .current
            .as_ref()
            .ok_or_else(|| ScreenshotError::StaleGeneration.to_protocol_error())?;
        if current.generation != *input.target.generation() {
            return Err(ScreenshotError::StaleGeneration.to_protocol_error());
        }
        let shows_cursor = input.cursor == CursorPolicy::System;
        let (filter, configuration, global_rect) = match &input.target {
            CaptureTarget::Display { display_id, .. } => {
                let descriptor = current
                    .snapshot
                    .displays
                    .iter()
                    .find(|display| &display.id == display_id)
                    .ok_or_else(|| ScreenshotError::DisplayNotFound.to_protocol_error())?;
                let display = current
                    .displays
                    .iter()
                    .find(|display| display.native_id.to_string() == descriptor.native_id)
                    .ok_or_else(|| ScreenshotError::DisplayNotFound.to_protocol_error())?;
                let filter =
                    display_filter(current, display, input.include_self_window_id.as_ref());
                let configuration = MacCaptureConfiguration::new(
                    descriptor.pixel_size.width(),
                    descriptor.pixel_size.height(),
                    None,
                    shows_cursor,
                )
                .map_err(map_system_error)?;
                (filter, configuration, descriptor.global_frame)
            }
            CaptureTarget::Window { window_id, .. } => {
                let descriptor = current
                    .windows
                    .iter()
                    .find(|window| window.id() == window_id)
                    .ok_or_else(|| ScreenshotError::WindowNotFound.to_protocol_error())?;
                if !descriptor.capturable()
                    || (descriptor.is_self()
                        && input.include_self_window_id.as_ref() != Some(window_id))
                {
                    return Err(ScreenshotError::WindowNotFound.to_protocol_error());
                }
                let window = current
                    .system_windows
                    .iter()
                    .find(|window| window.native_id == descriptor.native_id())
                    .ok_or_else(|| ScreenshotError::WindowNotFound.to_protocol_error())?;
                let scale = descriptor.maximum_scale().unwrap_or(
                    crate::model::AxisScale::new(1.0, 1.0)
                        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                );
                let (width, height) =
                    output_dimensions(descriptor.global_frame(), scale, self.limits)?;
                let configuration = MacCaptureConfiguration::new(width, height, None, shows_cursor)
                    .map_err(map_system_error)?;
                (
                    desktop_independent_window_filter(window),
                    configuration,
                    descriptor.global_frame(),
                )
            }
            CaptureTarget::Region { rect, .. } => {
                let region_display = current
                    .region_displays
                    .iter()
                    .find(|display| display.geometry().global_frame().contains_rect(*rect))
                    .ok_or_else(|| ScreenshotError::Unsupported.to_protocol_error())?;
                let descriptor = current
                    .snapshot
                    .displays
                    .iter()
                    .find(|display| display.id == *region_display.id())
                    .ok_or_else(|| ScreenshotError::TopologyChanged.to_protocol_error())?;
                let display = current
                    .displays
                    .iter()
                    .find(|display| display.native_id.to_string() == descriptor.native_id)
                    .ok_or_else(|| ScreenshotError::TopologyChanged.to_protocol_error())?;
                let local = region_display
                    .geometry()
                    .global_to_local_points(*rect)
                    .map_err(|_| ScreenshotError::InvalidRegion.to_protocol_error())?;
                let (width, height) =
                    output_dimensions(*rect, region_display.geometry().scale(), self.limits)?;
                let source_rect = objc2_core_foundation::CGRect::new(
                    objc2_core_foundation::CGPoint::new(local.x(), local.y()),
                    objc2_core_foundation::CGSize::new(local.width(), local.height()),
                );
                let configuration =
                    MacCaptureConfiguration::new(width, height, Some(source_rect), shows_cursor)
                        .map_err(map_system_error)?;
                (
                    display_filter(current, display, input.include_self_window_id.as_ref()),
                    configuration,
                    *rect,
                )
            }
            CaptureTarget::UiElement { .. } => {
                return Err(ScreenshotError::Unsupported.to_protocol_error());
            }
        };

        let stream_id = self
            .stream_counter
            .checked_add(1)
            .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())?;
        let control = Arc::new(FrameControl {
            slot: LatestFrameSlot::new(),
            stopped: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
            stop_notify: Notify::new(),
        });
        let frame_control = Arc::clone(&control);
        let error_control = Arc::clone(&control);
        let (started_sender, started_receiver) = sync_channel(1);
        let max_frame_bytes = usize::try_from(input.max_frame_bytes)
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        let session = super::system::start_stream(
            &filter,
            &configuration,
            MacStreamOptions {
                frames_per_second: input.frames_per_second,
                queue_depth: self.limits.min_native_queue_depth(),
                max_frame_bytes,
            },
            move |result| {
                let _ = started_sender.try_send(result);
            },
            move |frame| {
                if frame_control.stop_requested.load(Ordering::Acquire) {
                    return;
                }
                match unix_time_ms() {
                    Ok(timestamp_unix_ms) => {
                        frame_control.slot.publish(BackendFrame {
                            width: frame.width,
                            height: frame.height,
                            stride: frame.stride,
                            global_rect,
                            timestamp_unix_ms,
                            dropped_source_frames: 0,
                            bgra_bytes: frame.bgra_bytes,
                        });
                    }
                    Err(error) => frame_control.slot.fail(error),
                }
            },
            move |error| {
                error_control.slot.fail(map_system_error(error));
            },
        )
        .map_err(map_system_error)?;
        wait_for_start(started_receiver, cancellation)?;
        ensure_active(cancellation)?;
        self.stream_counter = stream_id;
        self.streams
            .insert(stream_id, ActorStreamSession::System(session));
        Ok(Arc::new(MacFrameSource {
            stream_id,
            actor,
            control,
        }))
    }

    fn stop_frames(&mut self, stream_id: u64, control: &Arc<FrameControl>) {
        if let Some(session) = self.streams.remove(&stream_id) {
            let (sender, receiver) = sync_channel(1);
            session.stop(move |result| {
                let _ = sender.try_send(result);
            });
            let _ = receiver.recv_timeout(SYSTEM_CALLBACK_TIMEOUT);
        }
        control.slot.request_stop();
        control.stopped.store(true, Ordering::Release);
        control.stop_notify.notify_waiters();
    }

    fn stop_all_frames(&mut self) {
        let sessions = self
            .streams
            .drain()
            .map(|(_, session)| session)
            .collect::<Vec<_>>();
        for session in sessions {
            let (sender, receiver) = sync_channel(1);
            session.stop(move |result| {
                let _ = sender.try_send(result);
            });
            let _ = receiver.recv_timeout(SYSTEM_CALLBACK_TIMEOUT);
        }
    }

    fn resolve_self_window_ids(&self, ids: &[DescriptorId]) -> Vec<u32> {
        let mut resolved = ids
            .iter()
            .filter_map(parse_native_window_id)
            .collect::<HashSet<_>>();
        let requested = ids.iter().collect::<HashSet<_>>();
        if let Some(current) = self.current.as_ref() {
            resolved.extend(
                current
                    .windows
                    .iter()
                    .filter(|window| requested.contains(window.id()))
                    .map(WindowDescriptor::native_id),
            );
        }
        let mut resolved = resolved.into_iter().collect::<Vec<_>>();
        resolved.sort_unstable();
        resolved
    }
}

type ShareableContentCompletion =
    Box<dyn FnOnce(Result<MacShareableContent, MacSystemError>) + Send>;

fn with_required_process_id(mut process_ids: Vec<u32>, required: u32, limit: usize) -> Vec<u32> {
    process_ids.retain(|process_id| *process_id > 0 && *process_id != required);
    process_ids.truncate(limit.saturating_sub(1));
    process_ids.insert(0, required);
    process_ids
}

fn parse_native_window_id(id: &DescriptorId) -> Option<u32> {
    id.as_str().parse::<u32>().ok().filter(|value| *value > 0)
}

fn wait_for_content(
    cancellation: &CancellationToken,
) -> Result<MacShareableContent, ProtocolError> {
    wait_for_content_with_request(cancellation, SYSTEM_CALLBACK_TIMEOUT, |completion| {
        request_shareable_content(completion);
    })
}

fn wait_for_content_with_request<F>(
    cancellation: &CancellationToken,
    timeout: Duration,
    request: F,
) -> Result<MacShareableContent, ProtocolError>
where
    F: FnOnce(ShareableContentCompletion),
{
    let (sender, receiver) = sync_channel(1);
    request(Box::new(move |result| {
        let _ = sender.try_send(result);
    }));
    let started = std::time::Instant::now();
    loop {
        ensure_active(cancellation)?;
        let remaining = timeout.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Err(ScreenshotError::BackendFailed.to_protocol_error());
        }
        match receiver.recv_timeout(remaining.min(CALLBACK_POLL)) {
            Ok(result) => return result.map_err(map_system_error),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err(ScreenshotError::BackendFailed.to_protocol_error());
            }
        }
    }
}

fn wait_for_start(
    receiver: Receiver<Result<(), MacSystemError>>,
    cancellation: &CancellationToken,
) -> Result<(), ProtocolError> {
    let started = std::time::Instant::now();
    loop {
        ensure_active(cancellation)?;
        let remaining = SYSTEM_CALLBACK_TIMEOUT.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Err(ScreenshotError::FrameUnavailable.to_protocol_error());
        }
        match receiver.recv_timeout(remaining.min(CALLBACK_POLL)) {
            Ok(result) => return result.map_err(map_system_error),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err(ScreenshotError::BackendFailed.to_protocol_error());
            }
        }
    }
}

fn capture_static_image(
    api: StaticCaptureApi,
    filter: &super::system::MacContentFilter,
    configuration: &MacCaptureConfiguration,
    limits: ScreenshotLimits,
    cancellation: &CancellationToken,
) -> Result<MacCapturedImage, ProtocolError> {
    match api {
        StaticCaptureApi::ScreenshotManager => {
            wait_for_image(filter, configuration, limits, cancellation)
        }
        StaticCaptureApi::ShortLivedStream => {
            capture_first_stream_frame(filter, configuration, limits, cancellation)
        }
        StaticCaptureApi::Unsupported => Err(ScreenshotError::Unsupported.to_protocol_error()),
    }
}

fn capture_first_stream_frame(
    filter: &super::system::MacContentFilter,
    configuration: &MacCaptureConfiguration,
    limits: ScreenshotLimits,
    cancellation: &CancellationToken,
) -> Result<MacCapturedImage, ProtocolError> {
    let max_bytes = usize::try_from(limits.max_static_working_set_bytes())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let (started_sender, started_receiver) = sync_channel(1);
    let (frame_sender, frame_receiver) = sync_channel(1);
    let error_sender = frame_sender.clone();
    let session = super::system::start_stream(
        filter,
        configuration,
        MacStreamOptions {
            frames_per_second: 1,
            queue_depth: limits.min_native_queue_depth(),
            max_frame_bytes: max_bytes,
        },
        move |result| {
            let _ = started_sender.try_send(result);
        },
        move |frame| {
            let _ = frame_sender.try_send(Ok(frame));
        },
        move |error| {
            let _ = error_sender.try_send(Err(error));
        },
    )
    .map_err(map_system_error)?;
    wait_for_start(started_receiver, cancellation)?;
    let frame = wait_for_stream_frame(frame_receiver, cancellation)?;
    let (stop_sender, stop_receiver) = sync_channel(1);
    session.stop(move |result| {
        let _ = stop_sender.try_send(result);
    });
    let stop = stop_receiver
        .recv_timeout(SYSTEM_CALLBACK_TIMEOUT)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    stop.map_err(map_system_error)?;
    let rgba_bytes = bgra_rows_to_rgba(
        &frame.bgra_bytes,
        usize::try_from(frame.width)
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?,
        usize::try_from(frame.height)
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?,
        usize::try_from(frame.stride)
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?,
        max_bytes,
    )
    .map_err(map_system_error)?;
    Ok(MacCapturedImage {
        width: frame.width,
        height: frame.height,
        rgba_bytes,
    })
}

fn wait_for_stream_frame(
    receiver: Receiver<Result<super::system::MacStreamFrame, MacSystemError>>,
    cancellation: &CancellationToken,
) -> Result<super::system::MacStreamFrame, ProtocolError> {
    let started = std::time::Instant::now();
    loop {
        ensure_active(cancellation)?;
        let remaining = SYSTEM_CALLBACK_TIMEOUT.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Err(ScreenshotError::FrameUnavailable.to_protocol_error());
        }
        match receiver.recv_timeout(remaining.min(CALLBACK_POLL)) {
            Ok(result) => return result.map_err(map_system_error),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err(ScreenshotError::BackendFailed.to_protocol_error());
            }
        }
    }
}

fn wait_for_image(
    filter: &super::system::MacContentFilter,
    configuration: &MacCaptureConfiguration,
    limits: ScreenshotLimits,
    cancellation: &CancellationToken,
) -> Result<MacCapturedImage, ProtocolError> {
    let max_bytes = usize::try_from(limits.max_static_working_set_bytes())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let (sender, receiver) = sync_channel(1);
    request_capture_image(filter, configuration, max_bytes, move |result| {
        let _ = sender.try_send(result);
    });
    let started = std::time::Instant::now();
    loop {
        ensure_active(cancellation)?;
        let remaining = SYSTEM_CALLBACK_TIMEOUT.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Err(ScreenshotError::FrameUnavailable.to_protocol_error());
        }
        match receiver.recv_timeout(remaining.min(CALLBACK_POLL)) {
            Ok(result) => return result.map_err(map_system_error),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err(ScreenshotError::BackendFailed.to_protocol_error());
            }
        }
    }
}

fn display_filter(
    current: &GenerationState,
    display: &MacSystemDisplay,
    include_self_window_id: Option<&DescriptorId>,
) -> super::system::MacContentFilter {
    let self_native_ids = current
        .windows
        .iter()
        .filter(|window| window.is_self())
        .map(WindowDescriptor::native_id)
        .collect::<HashSet<_>>();
    let excluded = current
        .system_windows
        .iter()
        .filter(|window| self_native_ids.contains(&window.native_id))
        .collect::<Vec<_>>();
    if excluded.is_empty() {
        return display_filter_excluding_windows(display, &[]);
    }
    let excepted_native_id = include_self_window_id.and_then(|id| {
        current
            .windows
            .iter()
            .find(|window| window.id() == id && window.is_self())
            .map(WindowDescriptor::native_id)
    });
    let excepted = current
        .system_windows
        .iter()
        .filter(|window| Some(window.native_id) == excepted_native_id)
        .collect::<Vec<_>>();
    display_filter_excluding_applications(display, &excluded, &excepted)
}

fn resolve_capture_scale(
    requested: CaptureOutputScale,
    native: crate::model::AxisScale,
) -> Result<crate::model::AxisScale, ProtocolError> {
    match requested {
        CaptureOutputScale::NativeMax => Ok(native),
        CaptureOutputScale::Explicit(scale) => crate::model::AxisScale::new(scale, scale)
            .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error()),
    }
}

fn output_dimensions(
    rect: GlobalDipRect,
    scale: crate::model::AxisScale,
    limits: ScreenshotLimits,
) -> Result<(u32, u32), ProtocolError> {
    let width = crate::geometry::nearest_to_u32(rect.width() * scale.x())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let height = crate::geometry::nearest_to_u32(rect.height() * scale.y())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let bytes = pixels
        .checked_mul(4)
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    if pixels > limits.max_static_output_pixels() || bytes > limits.max_static_working_set_bytes() {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }
    Ok((width, height))
}

fn composite_rgba(
    output: &mut [u8],
    output_width: u32,
    source: &MacCapturedImage,
    destination: crate::model::OutputPixelRect,
) -> Result<(), ProtocolError> {
    let output_stride = usize::try_from(output_width)
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
        .checked_mul(4)
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let source_stride = usize::try_from(source.width)
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
        .checked_mul(4)
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let destination_x = usize::try_from(destination.x())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
        .checked_mul(4)
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let destination_y = usize::try_from(destination.y())
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let rows = usize::try_from(source.height)
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    if source.rgba_bytes.len()
        != source_stride
            .checked_mul(rows)
            .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?
    {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    for row in 0..rows {
        let output_start = destination_y
            .checked_add(row)
            .and_then(|value| value.checked_mul(output_stride))
            .and_then(|value| value.checked_add(destination_x))
            .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        let output_end = output_start
            .checked_add(source_stride)
            .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        let source_start = row * source_stride;
        let destination_row = output
            .get_mut(output_start..output_end)
            .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())?;
        destination_row
            .copy_from_slice(&source.rgba_bytes[source_start..source_start + source_stride]);
    }
    Ok(())
}

fn encode_png(image: &MacCapturedImage) -> Result<Vec<u8>, ProtocolError> {
    let rgba = RgbaImage::from_raw(image.width, image.height, image.rgba_bytes.clone())
        .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())?;
    let mut png = Vec::new();
    rgba.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    Ok(png)
}

fn shareable_window(
    window: &MacSystemWindow,
    generation_number: u64,
) -> Result<ShareableWindow, ProtocolError> {
    ShareableWindow::new(
        descriptor(format!(
            "window:mac:{generation_number}:{}",
            window.native_id
        ))?,
        window.native_id,
        WindowOwner::new(
            window.process_id,
            window.bundle_id.clone(),
            window.application_name.clone(),
        )
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
        window.title.clone(),
        global_rect(window.frame)?,
        window.layer,
        window.on_screen,
        Some(window.active),
        true,
    )
    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn cg_window(window: &MacCgWindowMetadata) -> Result<CgWindowMetadata, ProtocolError> {
    let sharing = match window.sharing_state {
        0 => WindowSharing::None,
        1 => WindowSharing::ReadOnly,
        2 => WindowSharing::ReadWrite,
        _ => WindowSharing::None,
    };
    CgWindowMetadata::new(
        window.native_id,
        window.process_id,
        global_rect(window.frame)?,
        window.layer,
        window.alpha,
        sharing,
        window.on_screen,
    )
    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn snapshot_window(window: &WindowDescriptor) -> WindowSnapshotDescriptor {
    WindowSnapshotDescriptor {
        id: window.id().clone(),
        native_id: window.native_id().to_string(),
        owner: WindowOwnerDescriptor {
            process_id: window.owner().process_id(),
            bundle_id: window.owner().bundle_id().map(ToOwned::to_owned),
            application_name: window.owner().application_name().map(ToOwned::to_owned),
        },
        title: window.title().map(ToOwned::to_owned),
        global_frame: window.global_frame(),
        layer: window.layer(),
        z_index: window.z_index(),
        kind: match window.kind() {
            WindowKind::Normal => WindowDescriptorKind::Normal,
            WindowKind::Panel => WindowDescriptorKind::Panel,
            WindowKind::Transient => WindowDescriptorKind::Transient,
            WindowKind::System => WindowDescriptorKind::System,
            WindowKind::Unknown => WindowDescriptorKind::Unknown,
        },
        on_screen: window.on_screen(),
        active: window.active(),
        capturable: window.capturable(),
        minimized: window.minimized(),
        covered_display_ids: window.covered_display_ids().to_vec(),
        is_self: window.is_self(),
    }
}

fn global_rect(rect: objc2_core_foundation::CGRect) -> Result<GlobalDipRect, ProtocolError> {
    GlobalDipRect::new(
        rect.origin.x,
        rect.origin.y,
        rect.size.width,
        rect.size.height,
    )
    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn coherent_rect(left: GlobalDipRect, right: GlobalDipRect) -> bool {
    const EPSILON: f64 = 0.5;
    (left.x() - right.x()).abs() <= EPSILON
        && (left.y() - right.y()).abs() <= EPSILON
        && (left.width() - right.width()).abs() <= EPSILON
        && (left.height() - right.height()).abs() <= EPSILON
}

fn normalize_rotation(value: f64) -> Result<Rotation, ProtocolError> {
    if !value.is_finite() {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    let normalized = value.rem_euclid(360.0).round();
    if (normalized - value.rem_euclid(360.0)).abs() > 0.01 {
        return Err(ScreenshotError::BackendFailed.to_protocol_error());
    }
    Rotation::try_from(normalized as u16)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn descriptor(value: String) -> Result<DescriptorId, ProtocolError> {
    DescriptorId::new(value).map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn unix_time_ms() -> Result<u64, ProtocolError> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?
        .as_millis();
    u64::try_from(millis).map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
}

fn ensure_active(cancellation: &CancellationToken) -> Result<(), ProtocolError> {
    cancellation
        .reason()
        .map_or(Ok(()), |reason| Err(cancellation_error(reason)))
}

fn cancellation_error(reason: CancelReason) -> ProtocolError {
    match reason {
        CancelReason::Deadline => ProtocolError::deadline_exceeded(),
        CancelReason::Caller | CancelReason::ConsumerClosed | CancelReason::Dispose => {
            ProtocolError::cancelled()
        }
    }
}

fn map_system_error(error: MacSystemError) -> ProtocolError {
    match error.kind {
        MacSystemErrorKind::PermissionDenied => ScreenshotError::PermissionDenied,
        MacSystemErrorKind::NoCaptureSource => ScreenshotError::FrameUnavailable,
        MacSystemErrorKind::InvalidSystemData | MacSystemErrorKind::SystemFailure => {
            ScreenshotError::BackendFailed
        }
    }
    .to_protocol_error()
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::model::{RefreshInput, SelfCaptureContext};

    fn refresh_command(marker: bool) -> Command {
        let (response, _receiver) = oneshot::channel();
        Command::Refresh {
            input: RefreshInput {
                include_window_titles: marker,
                self_context: SelfCaptureContext {
                    process_ids: Vec::new(),
                    bundle_ids: Vec::new(),
                    native_window_ids: Vec::new(),
                },
            },
            cancellation: CancellationToken::new(),
            response,
        }
    }

    fn test_actor_state() -> ActorState {
        ActorState {
            limits: ScreenshotLimits::default(),
            static_capture_api: StaticCaptureApi::Unsupported,
            generation_counter: 0,
            stream_counter: 0,
            streams: HashMap::new(),
            current: None,
        }
    }

    fn generation_state(id: &str) -> GenerationState {
        let generation = DescriptorId::new(id).unwrap();
        GenerationState {
            snapshot: ContentSnapshot {
                generation: generation.clone(),
                coordinate_space: CoordinateSpace::GlobalDipV1,
                captured_at_unix_ms: 1,
                displays: Vec::new(),
                windows: Vec::new(),
                accessibility: AccessibilityStatus::Denied,
            },
            generation,
            displays: Vec::new(),
            region_displays: Vec::new(),
            windows: Vec::new(),
            system_windows: Vec::new(),
        }
    }

    #[test]
    fn cancelled_refresh_never_swaps_the_committed_generation() {
        let mut state = test_actor_state();
        state.generation_counter = 1;
        state.current = Some(generation_state("generation:mac:1"));
        let cancellation = CancellationToken::new();
        cancellation.cancel(CancelReason::Caller);

        let error =
            match state.commit_generation(2, generation_state("generation:mac:2"), &cancellation) {
                Err(error) => error,
                Ok(_) => panic!("cancelled generation commit unexpectedly succeeded"),
            };

        assert_eq!(error.code, "CANCELLED");
        assert_eq!(state.generation_counter, 1);
        assert_eq!(
            state.current.as_ref().unwrap().generation.as_str(),
            "generation:mac:1"
        );
    }

    #[test]
    fn actor_disconnect_stops_every_retained_stream_session() {
        let stopped = Arc::new(AtomicBool::new(false));
        let mut state = test_actor_state();
        state.streams.insert(
            1,
            ActorStreamSession::Fake {
                stopped: Arc::clone(&stopped),
            },
        );
        let (sender, receiver) = sync_channel(1);
        drop(sender);

        run_actor_loop(receiver, &mut state, Weak::new());

        assert!(stopped.load(Ordering::Acquire));
        assert!(state.streams.is_empty());
    }

    #[test]
    fn actor_mailbox_is_fifo_bounded_and_closed_state_fails_fast() {
        let (sender, receiver) = sync_channel(ACTOR_QUEUE_CAPACITY);
        let actor = MacScreenActor {
            inner: Arc::new(ActorInner {
                sender,
                closed: AtomicBool::new(false),
            }),
        };

        for index in 0..ACTOR_QUEUE_CAPACITY {
            actor.submit(refresh_command(index % 2 == 0)).unwrap();
        }
        let full = actor.submit(refresh_command(false)).unwrap_err();
        assert_eq!(full.code, "SCREENSHOT_BACKEND_BUSY");

        for index in 0..ACTOR_QUEUE_CAPACITY {
            let command = receiver.recv().unwrap();
            let Command::Refresh { input, .. } = command else {
                panic!("unexpected actor command");
            };
            assert_eq!(input.include_window_titles, index % 2 == 0);
        }

        actor.inner.closed.store(true, Ordering::Release);
        let closed = actor.submit(refresh_command(false)).unwrap_err();
        assert_eq!(closed.code, "SCREENSHOT_BACKEND_FAILED");
        drop(receiver);
    }

    #[test]
    fn shareable_content_wait_honors_timeout_and_cancellation() {
        let pending = Arc::new(Mutex::new(None::<ShareableContentCompletion>));
        let timeout_slot = Arc::clone(&pending);
        let timeout = match wait_for_content_with_request(
            &CancellationToken::new(),
            Duration::from_millis(5),
            move |completion| {
                *timeout_slot.lock().unwrap() = Some(completion);
            },
        ) {
            Err(error) => error,
            Ok(_) => panic!("shareable content wait unexpectedly succeeded"),
        };
        assert_eq!(timeout.code, "SCREENSHOT_BACKEND_FAILED");

        let cancellation = CancellationToken::new();
        cancellation.cancel(CancelReason::Caller);
        let cancelled_slot = Arc::clone(&pending);
        let cancelled = match wait_for_content_with_request(
            &cancellation,
            Duration::from_secs(1),
            move |completion| {
                *cancelled_slot.lock().unwrap() = Some(completion);
            },
        ) {
            Err(error) => error,
            Ok(_) => panic!("cancelled shareable content wait unexpectedly succeeded"),
        };
        assert_eq!(cancelled.code, "CANCELLED");
    }

    #[test]
    fn current_process_id_is_always_first_deduplicated_and_bounded() {
        assert_eq!(
            with_required_process_id(vec![42, 7, 42], 42, 3),
            vec![42, 7]
        );
        assert_eq!(
            with_required_process_id(vec![1, 2, 3, 4], 42, 3),
            vec![42, 1, 2]
        );
    }

    #[test]
    fn raw_browser_window_ids_are_bounded_native_ids_not_descriptor_guesses() {
        let valid = DescriptorId::new("7001").unwrap();
        let zero = DescriptorId::new("0").unwrap();
        let descriptor_id = DescriptorId::new("window:mac:1:7001").unwrap();

        assert_eq!(parse_native_window_id(&valid), Some(7001));
        assert_eq!(parse_native_window_id(&zero), None);
        assert_eq!(parse_native_window_id(&descriptor_id), None);
    }
}
