use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::Notify;
use tuff_native_core::{CancelReason, CancellationToken, CapabilityState, ProtocolError};

use crate::error::ScreenshotError;
use crate::model::{
    AccessibilityStatus, AxisScale, CaptureInput, ContentSnapshot, DescriptorId, FramesInput,
    GlobalDipRect, HitTestInput, HitTestResult, OsVersion, PermissionStatus, RefreshInput,
};

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(feature = "protocol-test-backend")]
pub mod test_backend;
pub mod unavailable;
pub mod xcap;

pub type BackendFuture<T> =
    Pin<Box<dyn Future<Output = Result<T, ProtocolError>> + Send + 'static>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendPlatform {
    Macos,
    Windows,
    Linux,
    Other(String),
}

impl BackendPlatform {
    pub fn name(&self) -> &str {
        match self {
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Other(platform) => platform,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendSupport {
    platform: BackendPlatform,
    engine: Option<String>,
    state: CapabilityState,
    reason: Option<String>,
    features: Vec<String>,
    accessibility: AccessibilityStatus,
}

impl BackendSupport {
    pub fn macos(accessibility: AccessibilityStatus) -> Self {
        Self::macos_with_ui_elements(accessibility, true)
    }

    pub fn macos_without_ui_elements(accessibility: AccessibilityStatus) -> Self {
        Self::macos_with_ui_elements(accessibility, false)
    }

    fn macos_with_ui_elements(
        accessibility: AccessibilityStatus,
        ui_elements_implemented: bool,
    ) -> Self {
        let mut features = vec![
            "display".to_string(),
            "region".to_string(),
            "window".to_string(),
            "window-hit-test".to_string(),
        ];
        if ui_elements_implemented && accessibility == AccessibilityStatus::Granted {
            features.push("ui-element-hit-test".to_string());
        }
        features.extend([
            "cross-display-region".to_string(),
            "cursor-system".to_string(),
            "self-exclusion".to_string(),
            "frames".to_string(),
        ]);
        Self {
            platform: BackendPlatform::Macos,
            engine: Some("screen-capture-kit".to_string()),
            state: CapabilityState::Available,
            reason: None,
            features,
            accessibility,
        }
    }

    #[cfg(feature = "protocol-test-backend")]
    pub fn deterministic_test() -> Self {
        let mut support = Self::macos(AccessibilityStatus::Granted);
        support.engine = Some("deterministic-test".to_string());
        support
    }

    pub fn xcap(platform: BackendPlatform) -> Self {
        Self {
            platform,
            engine: Some("xcap".to_string()),
            state: CapabilityState::Degraded,
            reason: Some("basic-backend-only".to_string()),
            features: vec!["display".to_string(), "region".to_string()],
            accessibility: AccessibilityStatus::Unsupported,
        }
    }

    pub fn unsupported(platform: impl Into<String>) -> Self {
        Self {
            platform: BackendPlatform::Other(platform.into()),
            engine: None,
            state: CapabilityState::Unavailable,
            reason: Some("unsupported-os".to_string()),
            features: Vec::new(),
            accessibility: AccessibilityStatus::Unsupported,
        }
    }

    pub fn unavailable(platform: BackendPlatform, engine: Option<&str>, reason: &str) -> Self {
        Self {
            platform,
            engine: engine.map(ToOwned::to_owned),
            state: CapabilityState::Unavailable,
            reason: Some(reason.to_string()),
            features: Vec::new(),
            accessibility: AccessibilityStatus::Unsupported,
        }
    }

    pub fn disabled(platform: BackendPlatform) -> Self {
        let (engine, accessibility) = match platform {
            BackendPlatform::Macos => (
                Some("screen-capture-kit".to_string()),
                AccessibilityStatus::Unknown,
            ),
            BackendPlatform::Windows | BackendPlatform::Linux => {
                (Some("xcap".to_string()), AccessibilityStatus::Unsupported)
            }
            BackendPlatform::Other(_) => (None, AccessibilityStatus::Unsupported),
        };
        Self {
            platform,
            engine,
            state: CapabilityState::Unavailable,
            reason: Some("disabled-by-env".to_string()),
            features: Vec::new(),
            accessibility,
        }
    }

    pub fn platform(&self) -> &BackendPlatform {
        &self.platform
    }

    pub fn platform_name(&self) -> &str {
        self.platform.name()
    }

    pub fn engine(&self) -> Option<&str> {
        self.engine.as_deref()
    }

    pub const fn state(&self) -> CapabilityState {
        self.state
    }

    pub fn reason(&self) -> Option<&str> {
        self.reason.as_deref()
    }

    pub fn features(&self) -> &[String] {
        &self.features
    }

    pub const fn accessibility(&self) -> AccessibilityStatus {
        self.accessibility
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendProbe {
    pub platform: String,
    pub os_version: Option<OsVersion>,
    pub screen_recording: PermissionStatus,
    pub accessibility: AccessibilityStatus,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BackendCapture {
    pub generation: DescriptorId,
    pub target_kind: String,
    pub width: u32,
    pub height: u32,
    pub output_scale: AxisScale,
    pub global_rect: GlobalDipRect,
    pub png_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BackendFrame {
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub global_rect: GlobalDipRect,
    pub timestamp_unix_ms: u64,
    pub dropped_source_frames: u64,
    pub bgra_bytes: Vec<u8>,
}

pub trait BackendFrameSource: Send + Sync {
    fn next_frame(&self, cancellation: CancellationToken) -> BackendFuture<Option<BackendFrame>>;
    fn request_stop(&self);
    fn stop(&self) -> BackendFuture<()>;
}

#[derive(Clone)]
pub struct LatestFrameSlot {
    inner: Arc<LatestFrameSlotInner>,
}

struct LatestFrameSlotInner {
    state: Mutex<LatestFrameState>,
    notify: Notify,
    consumer_started: AtomicBool,
    stop_requested: AtomicBool,
}

#[derive(Default)]
struct LatestFrameState {
    pending: Option<BackendFrame>,
    terminal_error: Option<ProtocolError>,
    closed: bool,
    replaced_frames: u64,
}

impl LatestFrameSlot {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(LatestFrameSlotInner {
                state: Mutex::new(LatestFrameState::default()),
                notify: Notify::new(),
                consumer_started: AtomicBool::new(false),
                stop_requested: AtomicBool::new(false),
            }),
        }
    }

    pub fn publish(&self, frame: BackendFrame) -> bool {
        let mut state = lock(&self.inner.state);
        if state.closed || state.terminal_error.is_some() {
            return false;
        }
        if state.pending.replace(frame).is_some() {
            state.replaced_frames = state.replaced_frames.saturating_add(1);
        }
        drop(state);
        self.inner.notify.notify_one();
        true
    }

    pub fn close(&self) {
        let mut state = lock(&self.inner.state);
        state.closed = true;
        drop(state);
        self.inner.notify.notify_waiters();
    }

    pub fn fail(&self, error: ProtocolError) {
        let mut state = lock(&self.inner.state);
        if state.closed || state.terminal_error.is_some() {
            return;
        }
        state.pending = None;
        state.terminal_error = Some(error);
        state.closed = true;
        drop(state);
        self.inner.notify.notify_waiters();
    }

    pub fn stop_requested(&self) -> bool {
        self.inner.stop_requested.load(Ordering::Acquire)
    }

    pub fn consumer_started(&self) -> bool {
        self.inner.consumer_started.load(Ordering::Acquire)
    }

    pub fn pending_frame_count(&self) -> usize {
        usize::from(lock(&self.inner.state).pending.is_some())
    }

    pub fn replaced_frame_count(&self) -> u64 {
        lock(&self.inner.state).replaced_frames
    }
}

impl Default for LatestFrameSlot {
    fn default() -> Self {
        Self::new()
    }
}

impl BackendFrameSource for LatestFrameSlot {
    fn next_frame(&self, cancellation: CancellationToken) -> BackendFuture<Option<BackendFrame>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            inner.consumer_started.store(true, Ordering::Release);
            loop {
                if let Some(reason) = cancellation.reason() {
                    return Err(cancellation_error(reason));
                }
                let notified = inner.notify.notified();
                {
                    let mut state = lock(&inner.state);
                    if let Some(error) = state.terminal_error.take() {
                        return Err(error);
                    }
                    if let Some(mut frame) = state.pending.take() {
                        frame.dropped_source_frames = frame
                            .dropped_source_frames
                            .saturating_add(state.replaced_frames);
                        return Ok(Some(frame));
                    }
                    if state.closed {
                        return Ok(None);
                    }
                }
                tokio::select! {
                    _ = notified => {}
                    reason = cancellation.cancelled() => return Err(cancellation_error(reason)),
                }
            }
        })
    }

    fn request_stop(&self) {
        self.inner.stop_requested.store(true, Ordering::Release);
        self.close();
    }

    fn stop(&self) -> BackendFuture<()> {
        let slot = self.clone();
        Box::pin(async move {
            slot.request_stop();
            Ok(())
        })
    }
}

pub trait ScreenshotBackend: Send + Sync {
    fn support(&self) -> BackendSupport;

    fn probe(&self, _cancellation: CancellationToken) -> BackendFuture<BackendProbe> {
        unsupported_future()
    }

    fn refresh(
        &self,
        _input: RefreshInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<ContentSnapshot> {
        unsupported_future()
    }

    fn hit_test(
        &self,
        _input: HitTestInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<HitTestResult> {
        unsupported_future()
    }

    fn capture(
        &self,
        _input: CaptureInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<BackendCapture> {
        unsupported_future()
    }

    fn frames(
        &self,
        _input: FramesInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<Arc<dyn BackendFrameSource>> {
        unsupported_future()
    }
}

pub fn platform_backend(limits: crate::limits::ScreenshotLimits) -> Arc<dyn ScreenshotBackend> {
    if std::env::var_os("TUFF_DISABLE_NATIVE_SCREENSHOT").as_deref()
        == Some(std::ffi::OsStr::new("1"))
    {
        return Arc::new(unavailable::UnavailableBackend::current());
    }
    #[cfg(target_os = "macos")]
    {
        match macos::implementation::MacBackend::new(limits) {
            Ok(backend) => Arc::new(backend),
            Err(_) => Arc::new(unavailable::UnavailableBackend::macos_initialization_failed()),
        }
    }
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        let platform = if cfg!(target_os = "windows") {
            BackendPlatform::Windows
        } else {
            BackendPlatform::Linux
        };
        match xcap::PlatformXcapSource::new() {
            Ok(source) => Arc::new(xcap::XcapBackend::new(source, platform, limits)),
            Err(reason) => Arc::new(unavailable::UnavailableBackend::xcap_initialization_failed(
                platform, reason,
            )),
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = limits;
        Arc::new(unavailable::UnavailableBackend::current())
    }
}

fn cancellation_error(reason: CancelReason) -> ProtocolError {
    match reason {
        CancelReason::Deadline => ProtocolError::deadline_exceeded(),
        CancelReason::Caller | CancelReason::ConsumerClosed | CancelReason::Dispose => {
            ProtocolError::cancelled()
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn unsupported_future<T>() -> BackendFuture<T> {
    Box::pin(async { Err(ScreenshotError::Unsupported.to_protocol_error()) })
}
