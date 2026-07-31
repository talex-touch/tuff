use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use image::{ImageFormat, RgbaImage};
use tuff_native_core::{CancellationToken, ProtocolError};

use super::{
    BackendCapture, BackendFuture, BackendPlatform, BackendProbe, BackendSupport,
    ScreenshotBackend, cancellation_error,
};
use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{
    AccessibilityStatus, AxisScale, CaptureInput, CaptureOutputScale, CaptureTarget,
    ContentSnapshot, CoordinateSpace, CursorPolicy, DescriptorId, DisplayDescriptor, GlobalDipRect,
    PermissionStatus, PixelSize, RefreshInput, Rotation,
};

pub trait XcapSource: Send + Sync + 'static {
    fn list_displays(&self) -> Result<Vec<XcapDisplay>, ScreenshotError>;
    fn capture_display(&self, native_id: &str) -> Result<RgbaImage, ScreenshotError>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct XcapDisplay {
    pub native_id: String,
    pub name: String,
    pub global_x: f64,
    pub global_y: f64,
    pub dip_width: f64,
    pub dip_height: f64,
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation_degrees: u16,
    pub is_primary: bool,
}

pub struct XcapBackend<S: XcapSource> {
    inner: Arc<XcapBackendInner<S>>,
}

struct XcapBackendInner<S: XcapSource> {
    source: Arc<S>,
    platform: BackendPlatform,
    limits: ScreenshotLimits,
    generation_counter: AtomicU64,
    state: Mutex<XcapState>,
}

#[derive(Default)]
struct XcapState {
    generation: Option<DescriptorId>,
    displays: HashMap<DescriptorId, StoredDisplay>,
}

#[derive(Clone)]
struct StoredDisplay {
    descriptor: DisplayDescriptor,
}

impl<S: XcapSource> Clone for XcapBackend<S> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl<S: XcapSource> XcapBackend<S> {
    pub fn new(source: S, platform: BackendPlatform, limits: ScreenshotLimits) -> Self {
        Self {
            inner: Arc::new(XcapBackendInner {
                source: Arc::new(source),
                platform,
                limits,
                generation_counter: AtomicU64::new(0),
                state: Mutex::new(XcapState::default()),
            }),
        }
    }

    fn refresh_sync(&self) -> Result<ContentSnapshot, ProtocolError> {
        let source_displays = self
            .inner
            .source
            .list_displays()
            .map_err(ScreenshotError::to_protocol_error)?;
        if source_displays.is_empty() {
            return Err(ScreenshotError::DisplayNotFound.to_protocol_error());
        }
        if source_displays.len() > self.inner.limits.max_displays() {
            return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
        }
        let generation_number = self
            .inner
            .generation_counter
            .fetch_add(1, Ordering::AcqRel)
            .checked_add(1)
            .ok_or_else(|| ScreenshotError::BackendFailed.to_protocol_error())?;
        let generation = DescriptorId::new(format!("generation:xcap:{generation_number}"))
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        let mut native_ids = HashSet::new();
        let mut descriptors = Vec::with_capacity(source_displays.len());
        let mut stored = HashMap::with_capacity(source_displays.len());
        for (index, display) in source_displays.into_iter().enumerate() {
            if display.native_id.is_empty() || !native_ids.insert(display.native_id.clone()) {
                return Err(ScreenshotError::BackendFailed.to_protocol_error());
            }
            let descriptor = descriptor_from_source(&generation, index, display)?;
            stored.insert(
                descriptor.id.clone(),
                StoredDisplay {
                    descriptor: descriptor.clone(),
                },
            );
            descriptors.push(descriptor);
        }
        let snapshot = ContentSnapshot {
            generation: generation.clone(),
            coordinate_space: CoordinateSpace::GlobalDipV1,
            captured_at_unix_ms: unix_time_ms(),
            displays: descriptors,
            windows: Vec::new(),
            accessibility: AccessibilityStatus::Unsupported,
        };
        let mut state = lock(&self.inner.state);
        state.generation = Some(generation);
        state.displays = stored;
        Ok(snapshot)
    }

    fn capture_sync(&self, input: CaptureInput) -> Result<BackendCapture, ProtocolError> {
        if input.cursor != CursorPolicy::Hidden || input.include_self_window_id.is_some() {
            return Err(ScreenshotError::Unsupported.to_protocol_error());
        }
        if !matches!(input.output.scale, CaptureOutputScale::NativeMax) {
            return Err(ScreenshotError::Unsupported.to_protocol_error());
        }
        let generation = input.target.generation().clone();
        let (display, global_rect, crop) = {
            let state = lock(&self.inner.state);
            if state.generation.as_ref() != Some(&generation) {
                return Err(ScreenshotError::StaleGeneration.to_protocol_error());
            }
            match input.target {
                CaptureTarget::Display { display_id, .. } => {
                    let display = state
                        .displays
                        .get(&display_id)
                        .cloned()
                        .ok_or_else(|| ScreenshotError::DisplayNotFound.to_protocol_error())?;
                    let rect = display.descriptor.global_frame;
                    (display, rect, None)
                }
                CaptureTarget::Region { rect, .. } => {
                    let matches = state
                        .displays
                        .values()
                        .filter(|display| contains_rect(display.descriptor.global_frame, rect))
                        .cloned()
                        .collect::<Vec<_>>();
                    if matches.len() != 1 {
                        return Err(ScreenshotError::InvalidRegion.to_protocol_error());
                    }
                    let display = matches.into_iter().next().expect("one matched display");
                    let crop = pixel_crop(&display.descriptor, rect)?;
                    (display, rect, Some(crop))
                }
                CaptureTarget::Window { .. } | CaptureTarget::UiElement { .. } => {
                    return Err(ScreenshotError::Unsupported.to_protocol_error());
                }
            }
        };
        let image = self
            .inner
            .source
            .capture_display(&display.descriptor.native_id)
            .map_err(ScreenshotError::to_protocol_error)?;
        if image.width() != display.descriptor.pixel_size.width()
            || image.height() != display.descriptor.pixel_size.height()
        {
            return Err(ScreenshotError::TopologyChanged.to_protocol_error());
        }
        let image = match crop {
            Some((x, y, width, height)) => {
                image::imageops::crop_imm(&image, x, y, width, height).to_image()
            }
            None => image,
        };
        validate_image_budget(image.width(), image.height(), self.inner.limits)?;
        let mut png_bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        Ok(BackendCapture {
            generation,
            target_kind: if crop.is_some() { "region" } else { "display" }.to_string(),
            width: image.width(),
            height: image.height(),
            output_scale: display.descriptor.scale,
            global_rect,
            png_bytes,
        })
    }
}

impl<S: XcapSource> ScreenshotBackend for XcapBackend<S> {
    fn support(&self) -> BackendSupport {
        BackendSupport::xcap(self.inner.platform.clone())
    }

    fn probe(&self, cancellation: CancellationToken) -> BackendFuture<BackendProbe> {
        let platform = self.inner.platform.name().to_string();
        Box::pin(async move {
            if let Some(reason) = cancellation.reason() {
                return Err(cancellation_error(reason));
            }
            Ok(BackendProbe {
                platform,
                os_version: None,
                screen_recording: PermissionStatus::NotRequired,
                accessibility: AccessibilityStatus::Unsupported,
            })
        })
    }

    fn refresh(
        &self,
        _input: RefreshInput,
        cancellation: CancellationToken,
    ) -> BackendFuture<ContentSnapshot> {
        let backend = self.clone();
        Box::pin(async move {
            if let Some(reason) = cancellation.reason() {
                return Err(cancellation_error(reason));
            }
            let task = tokio::task::spawn_blocking(move || backend.refresh_sync());
            tokio::select! {
                result = task => result
                    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                reason = cancellation.cancelled() => Err(cancellation_error(reason)),
            }
        })
    }

    fn capture(
        &self,
        input: CaptureInput,
        cancellation: CancellationToken,
    ) -> BackendFuture<BackendCapture> {
        let backend = self.clone();
        Box::pin(async move {
            if let Some(reason) = cancellation.reason() {
                return Err(cancellation_error(reason));
            }
            let task = tokio::task::spawn_blocking(move || backend.capture_sync(input));
            tokio::select! {
                result = task => result
                    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
                reason = cancellation.cancelled() => Err(cancellation_error(reason)),
            }
        })
    }
}

fn descriptor_from_source(
    generation: &DescriptorId,
    index: usize,
    display: XcapDisplay,
) -> Result<DisplayDescriptor, ProtocolError> {
    let global_frame = GlobalDipRect::new(
        display.global_x,
        display.global_y,
        display.dip_width,
        display.dip_height,
    )
    .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    let pixel_size = PixelSize::new(display.pixel_width, display.pixel_height)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    let scale = AxisScale::new(display.scale_x, display.scale_y)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    let rotation = Rotation::try_from(display.rotation_degrees)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    let id = DescriptorId::new(format!("display:xcap:{}:{index}", generation.as_str()))
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    let name = if display.name.trim().is_empty() {
        format!("Display {}", index + 1)
    } else {
        display.name.chars().take(256).collect()
    };
    Ok(DisplayDescriptor {
        id,
        native_id: display.native_id,
        name,
        global_frame,
        pixel_size,
        scale,
        rotation,
        is_primary: display.is_primary,
    })
}

fn pixel_crop(
    display: &DisplayDescriptor,
    region: GlobalDipRect,
) -> Result<(u32, u32, u32, u32), ProtocolError> {
    let min_x = ((region.x() - display.global_frame.x()) * display.scale.x()).floor();
    let min_y = ((region.y() - display.global_frame.y()) * display.scale.y()).floor();
    let max_x = ((region.right() - display.global_frame.x()) * display.scale.x()).ceil();
    let max_y = ((region.bottom() - display.global_frame.y()) * display.scale.y()).ceil();
    if !min_x.is_finite()
        || !min_y.is_finite()
        || !max_x.is_finite()
        || !max_y.is_finite()
        || min_x < 0.0
        || min_y < 0.0
        || max_x > f64::from(display.pixel_size.width())
        || max_y > f64::from(display.pixel_size.height())
        || max_x <= min_x
        || max_y <= min_y
    {
        return Err(ScreenshotError::InvalidRegion.to_protocol_error());
    }
    let x = min_x as u32;
    let y = min_y as u32;
    let max_x = max_x as u32;
    let max_y = max_y as u32;
    Ok((x, y, max_x - x, max_y - y))
}

fn contains_rect(container: GlobalDipRect, content: GlobalDipRect) -> bool {
    content.x() >= container.x()
        && content.y() >= container.y()
        && content.right() <= container.right()
        && content.bottom() <= container.bottom()
}

fn validate_image_budget(
    width: u32,
    height: u32,
    limits: ScreenshotLimits,
) -> Result<(), ProtocolError> {
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    let working_bytes = pixels
        .checked_mul(4)
        .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    if pixels > limits.max_static_output_pixels()
        || working_bytes > limits.max_static_working_set_bytes()
    {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }
    Ok(())
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
pub struct PlatformXcapSource;

#[cfg(any(target_os = "windows", target_os = "linux"))]
impl PlatformXcapSource {
    pub fn new() -> Result<Self, &'static str> {
        #[cfg(target_os = "linux")]
        if let Some(reason) = linux_xcap_unavailable_reason(
            std::env::var_os("XDG_SESSION_TYPE").as_deref(),
            std::env::var_os("WAYLAND_DISPLAY").as_deref(),
            std::env::var_os("DISPLAY").as_deref(),
        ) {
            return Err(reason);
        }
        Ok(Self)
    }
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
impl XcapSource for PlatformXcapSource {
    fn list_displays(&self) -> Result<Vec<XcapDisplay>, ScreenshotError> {
        ::xcap::Monitor::all()
            .map_err(|_| ScreenshotError::BackendFailed)?
            .into_iter()
            .map(|monitor| platform_display(&monitor))
            .collect()
    }

    fn capture_display(&self, native_id: &str) -> Result<RgbaImage, ScreenshotError> {
        let monitors = ::xcap::Monitor::all().map_err(|_| ScreenshotError::BackendFailed)?;
        for monitor in monitors {
            let id = monitor
                .id()
                .map_err(|_| ScreenshotError::BackendFailed)?
                .to_string();
            if id == native_id {
                return monitor
                    .capture_image()
                    .map_err(|_| ScreenshotError::BackendFailed);
            }
        }
        Err(ScreenshotError::TopologyChanged)
    }
}

#[cfg(target_os = "windows")]
fn platform_display(monitor: &::xcap::Monitor) -> Result<XcapDisplay, ScreenshotError> {
    let scale = finite_scale(monitor.scale_factor().unwrap_or(1.0));
    let pixel_width = monitor
        .width()
        .map_err(|_| ScreenshotError::BackendFailed)?;
    let pixel_height = monitor
        .height()
        .map_err(|_| ScreenshotError::BackendFailed)?;
    Ok(XcapDisplay {
        native_id: monitor
            .id()
            .map_err(|_| ScreenshotError::BackendFailed)?
            .to_string(),
        name: monitor.name().unwrap_or_default(),
        global_x: f64::from(monitor.x().unwrap_or(0)),
        global_y: f64::from(monitor.y().unwrap_or(0)),
        dip_width: f64::from(pixel_width) / scale,
        dip_height: f64::from(pixel_height) / scale,
        pixel_width,
        pixel_height,
        scale_x: scale,
        scale_y: scale,
        rotation_degrees: normalized_rotation(monitor.rotation().unwrap_or(0.0)),
        is_primary: monitor.is_primary().unwrap_or(false),
    })
}

#[cfg(target_os = "linux")]
fn platform_display(monitor: &::xcap::Monitor) -> Result<XcapDisplay, ScreenshotError> {
    let scale = finite_scale(monitor.scale_factor().unwrap_or(1.0));
    let dip_width = monitor
        .width()
        .map_err(|_| ScreenshotError::BackendFailed)?;
    let dip_height = monitor
        .height()
        .map_err(|_| ScreenshotError::BackendFailed)?;
    let pixel_width = (f64::from(dip_width) * scale).round();
    let pixel_height = (f64::from(dip_height) * scale).round();
    if pixel_width <= 0.0
        || pixel_height <= 0.0
        || pixel_width > f64::from(u32::MAX)
        || pixel_height > f64::from(u32::MAX)
    {
        return Err(ScreenshotError::BackendFailed);
    }
    Ok(XcapDisplay {
        native_id: monitor
            .id()
            .map_err(|_| ScreenshotError::BackendFailed)?
            .to_string(),
        name: monitor.name().unwrap_or_default(),
        global_x: f64::from(monitor.x().unwrap_or(0)),
        global_y: f64::from(monitor.y().unwrap_or(0)),
        dip_width: f64::from(dip_width),
        dip_height: f64::from(dip_height),
        pixel_width: pixel_width as u32,
        pixel_height: pixel_height as u32,
        scale_x: scale,
        scale_y: scale,
        rotation_degrees: normalized_rotation(monitor.rotation().unwrap_or(0.0)),
        is_primary: monitor.is_primary().unwrap_or(false),
    })
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn finite_scale(scale: f32) -> f64 {
    let scale = f64::from(scale);
    if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    }
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn normalized_rotation(rotation: f32) -> u16 {
    match rotation.round() as i32 {
        90 => 90,
        180 => 180,
        270 => 270,
        _ => 0,
    }
}

#[cfg(any(target_os = "linux", test))]
fn linux_xcap_unavailable_reason(
    session_type: Option<&std::ffi::OsStr>,
    wayland_display: Option<&std::ffi::OsStr>,
    x11_display: Option<&std::ffi::OsStr>,
) -> Option<&'static str> {
    let wayland = session_type
        .is_some_and(|value| value.to_string_lossy().eq_ignore_ascii_case("wayland"))
        || wayland_display.is_some_and(|value| !value.is_empty());
    if wayland {
        return Some("wayland-unsupported");
    }
    if x11_display.is_none_or(|value| value.is_empty()) {
        return Some("display-server-unavailable");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    use image::{Rgba, RgbaImage};
    use tuff_native_core::{CancelReason, CancellationToken};

    use crate::model::{
        CaptureFormat, CaptureOutputOptions, FramePixelFormat, FramesInput, HitTestGranularity,
        HitTestInput,
    };

    struct FakeSource {
        displays: Mutex<Vec<XcapDisplay>>,
    }

    impl FakeSource {
        fn standard() -> Self {
            Self {
                displays: Mutex::new(vec![
                    XcapDisplay {
                        native_id: "left".to_string(),
                        name: "Left".to_string(),
                        global_x: -2.0,
                        global_y: 0.0,
                        dip_width: 2.0,
                        dip_height: 2.0,
                        pixel_width: 2,
                        pixel_height: 2,
                        scale_x: 1.0,
                        scale_y: 1.0,
                        rotation_degrees: 0,
                        is_primary: false,
                    },
                    XcapDisplay {
                        native_id: "primary".to_string(),
                        name: "Primary".to_string(),
                        global_x: 0.0,
                        global_y: 0.0,
                        dip_width: 2.0,
                        dip_height: 2.0,
                        pixel_width: 4,
                        pixel_height: 4,
                        scale_x: 2.0,
                        scale_y: 2.0,
                        rotation_degrees: 0,
                        is_primary: true,
                    },
                ]),
            }
        }
    }

    impl XcapSource for FakeSource {
        fn list_displays(&self) -> Result<Vec<XcapDisplay>, ScreenshotError> {
            Ok(lock(&self.displays).clone())
        }

        fn capture_display(&self, native_id: &str) -> Result<RgbaImage, ScreenshotError> {
            let display = lock(&self.displays)
                .iter()
                .find(|display| display.native_id == native_id)
                .cloned()
                .ok_or(ScreenshotError::TopologyChanged)?;
            Ok(RgbaImage::from_pixel(
                display.pixel_width,
                display.pixel_height,
                Rgba([0x11, 0x22, 0x33, 0xff]),
            ))
        }
    }

    fn token() -> CancellationToken {
        CancellationToken::new()
    }

    fn refresh_input() -> RefreshInput {
        RefreshInput {
            include_window_titles: false,
            self_context: crate::model::SelfCaptureContext {
                process_ids: Vec::new(),
                bundle_ids: Vec::new(),
                native_window_ids: Vec::new(),
            },
        }
    }

    fn capture_input(target: CaptureTarget) -> CaptureInput {
        CaptureInput {
            target,
            cursor: CursorPolicy::Hidden,
            include_self_window_id: None,
            output: CaptureOutputOptions {
                format: CaptureFormat::Png,
                scale: CaptureOutputScale::NativeMax,
            },
        }
    }

    #[test]
    fn unsupported_linux_sessions_are_rejected_before_basic_capture_is_advertised() {
        use std::ffi::OsStr;

        assert_eq!(
            linux_xcap_unavailable_reason(Some(OsStr::new("wayland")), None, None),
            Some("wayland-unsupported")
        );
        assert_eq!(
            linux_xcap_unavailable_reason(
                None,
                Some(OsStr::new("wayland-0")),
                Some(OsStr::new(":0"))
            ),
            Some("wayland-unsupported")
        );
        assert_eq!(
            linux_xcap_unavailable_reason(Some(OsStr::new("x11")), None, None),
            Some("display-server-unavailable")
        );
        assert_eq!(
            linux_xcap_unavailable_reason(None, Some(OsStr::new("")), Some(OsStr::new(":0"))),
            None
        );
    }

    #[tokio::test]
    async fn refresh_preserves_negative_origins_and_local_first_scales() {
        let backend = XcapBackend::new(
            FakeSource::standard(),
            BackendPlatform::Windows,
            ScreenshotLimits::default(),
        );
        let snapshot = backend.refresh(refresh_input(), token()).await.unwrap();
        assert_eq!(snapshot.coordinate_space, CoordinateSpace::GlobalDipV1);
        assert_eq!(snapshot.displays[0].global_frame.x(), -2.0);
        assert_eq!(snapshot.displays[0].pixel_size.width(), 2);
        assert_eq!(snapshot.displays[1].global_frame.x(), 0.0);
        assert_eq!(snapshot.displays[1].global_frame.width(), 2.0);
        assert_eq!(snapshot.displays[1].pixel_size.width(), 4);
        assert!(snapshot.windows.is_empty());
        let support = backend.support();
        assert_eq!(support.features(), &["display", "region"]);
        assert_eq!(support.reason(), Some("basic-backend-only"));
    }

    #[tokio::test]
    async fn display_and_single_display_region_capture_emit_png() {
        let backend = XcapBackend::new(
            FakeSource::standard(),
            BackendPlatform::Linux,
            ScreenshotLimits::default(),
        );
        let snapshot = backend.refresh(refresh_input(), token()).await.unwrap();
        let primary = snapshot.displays[1].clone();
        let display = backend
            .capture(
                capture_input(CaptureTarget::Display {
                    generation: snapshot.generation.clone(),
                    display_id: primary.id.clone(),
                }),
                token(),
            )
            .await
            .unwrap();
        assert_eq!((display.width, display.height), (4, 4));
        assert_eq!(&display.png_bytes[..4], &[0x89, 0x50, 0x4e, 0x47]);

        let region = backend
            .capture(
                capture_input(CaptureTarget::Region {
                    generation: snapshot.generation,
                    rect: GlobalDipRect::new(0.5, 0.5, 1.0, 1.0).unwrap(),
                }),
                token(),
            )
            .await
            .unwrap();
        assert_eq!((region.width, region.height), (2, 2));
        assert_eq!(region.global_rect.x(), 0.5);
        assert_eq!(&region.png_bytes[..4], &[0x89, 0x50, 0x4e, 0x47]);
    }

    #[tokio::test]
    async fn cross_display_stale_and_advanced_requests_fail_closed() {
        let backend = XcapBackend::new(
            FakeSource::standard(),
            BackendPlatform::Windows,
            ScreenshotLimits::default(),
        );
        let first = backend.refresh(refresh_input(), token()).await.unwrap();
        let cross_display = backend
            .capture(
                capture_input(CaptureTarget::Region {
                    generation: first.generation.clone(),
                    rect: GlobalDipRect::new(-1.0, 0.0, 2.0, 1.0).unwrap(),
                }),
                token(),
            )
            .await
            .unwrap_err();
        assert_eq!(cross_display.code, "SCREENSHOT_INVALID_REGION");

        let hit = backend
            .hit_test(
                HitTestInput {
                    generation: first.generation.clone(),
                    point: crate::model::GlobalDipPoint::new(0.0, 0.0).unwrap(),
                    granularity: HitTestGranularity::Window,
                    include_panels: false,
                    max_candidates: 1,
                },
                token(),
            )
            .await
            .err()
            .expect("hit test must be unsupported");
        assert_eq!(hit.code, "SCREENSHOT_UNSUPPORTED");

        let unknown = backend
            .capture(
                capture_input(CaptureTarget::Display {
                    generation: first.generation.clone(),
                    display_id: DescriptorId::new("display:xcap:unknown").unwrap(),
                }),
                token(),
            )
            .await
            .unwrap_err();
        assert_eq!(unknown.code, "SCREENSHOT_DISPLAY_NOT_FOUND");

        for target in [
            CaptureTarget::Window {
                generation: first.generation.clone(),
                window_id: DescriptorId::new("window:xcap:unsupported").unwrap(),
            },
            CaptureTarget::UiElement {
                generation: first.generation.clone(),
                element_id: DescriptorId::new("element:xcap:unsupported").unwrap(),
            },
        ] {
            let error = backend
                .capture(capture_input(target), token())
                .await
                .unwrap_err();
            assert_eq!(error.code, "SCREENSHOT_UNSUPPORTED");
        }

        let mut self_exception = capture_input(CaptureTarget::Display {
            generation: first.generation.clone(),
            display_id: first.displays[0].id.clone(),
        });
        self_exception.include_self_window_id =
            Some(DescriptorId::new("window:xcap:self").unwrap());
        let self_error = backend.capture(self_exception, token()).await.unwrap_err();
        assert_eq!(self_error.code, "SCREENSHOT_UNSUPPORTED");

        let frames_error = backend
            .frames(
                FramesInput {
                    target: CaptureTarget::Display {
                        generation: first.generation.clone(),
                        display_id: first.displays[0].id.clone(),
                    },
                    cursor: CursorPolicy::Hidden,
                    include_self_window_id: None,
                    frames_per_second: 5,
                    pixel_format: FramePixelFormat::Bgra8Premultiplied,
                    max_frame_bytes: 1024,
                },
                token(),
            )
            .await
            .err()
            .expect("frames must be unsupported");
        assert_eq!(frames_error.code, "SCREENSHOT_UNSUPPORTED");

        let second = backend.refresh(refresh_input(), token()).await.unwrap();
        let stale = backend
            .capture(
                capture_input(CaptureTarget::Display {
                    generation: first.generation,
                    display_id: first.displays[0].id.clone(),
                }),
                token(),
            )
            .await
            .unwrap_err();
        assert_eq!(stale.code, "SCREENSHOT_STALE_GENERATION");

        let mut cursor_input = capture_input(CaptureTarget::Display {
            generation: second.generation,
            display_id: second.displays[0].id.clone(),
        });
        cursor_input.cursor = CursorPolicy::System;
        let unsupported = backend.capture(cursor_input, token()).await.unwrap_err();
        assert_eq!(unsupported.code, "SCREENSHOT_UNSUPPORTED");
    }

    #[tokio::test]
    async fn cancellation_wins_without_publishing_late_output() {
        let backend = XcapBackend::new(
            FakeSource::standard(),
            BackendPlatform::Linux,
            ScreenshotLimits::default(),
        );
        let cancellation = token();
        cancellation.cancel(CancelReason::Caller);
        let error = backend
            .refresh(refresh_input(), cancellation)
            .await
            .err()
            .expect("pre-cancelled refresh must fail");
        assert_eq!(error.code, "CANCELLED");
    }
}
