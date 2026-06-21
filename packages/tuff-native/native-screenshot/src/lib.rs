use std::io::Cursor;
use std::time::Instant;

use image::ImageFormat;
use napi::bindgen_prelude::Buffer;
use napi::{Error, Result};
use napi_derive::napi;
use xcap::Monitor;

#[napi(object)]
pub struct NativeScreenshotSupport {
    pub supported: bool,
    pub platform: String,
    pub engine: Option<String>,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct NativeScreenshotDisplay {
    pub id: String,
    pub name: String,
    pub friendly_name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub rotation: f64,
    pub is_primary: bool,
}

#[napi(object)]
pub struct NativeScreenshotRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct NativeScreenshotCaptureOptions {
    pub display_id: Option<String>,
    pub cursor_x: Option<i32>,
    pub cursor_y: Option<i32>,
    pub region: Option<NativeScreenshotRegion>,
}

#[napi(object)]
pub struct NativeScreenshotCaptureResult {
    pub image: Buffer,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub display_id: String,
    pub display_name: String,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub duration_ms: u32,
}

#[napi]
pub fn get_native_screenshot_support() -> NativeScreenshotSupport {
    build_native_screenshot_support(
        std::env::consts::OS.to_string(),
        platform_supported(),
        probe_monitor_count(),
    )
}

#[napi]
pub fn list_displays() -> Result<Vec<NativeScreenshotDisplay>> {
    let monitors = Monitor::all().map_err(to_napi_error)?;
    monitors
        .iter()
        .map(to_display)
        .collect::<Result<Vec<NativeScreenshotDisplay>>>()
}

#[napi]
pub fn capture_display(display_id: Option<String>) -> Result<NativeScreenshotCaptureResult> {
    capture_with_options(NativeScreenshotCaptureOptions {
        display_id,
        cursor_x: None,
        cursor_y: None,
        region: None,
    })
}

#[napi]
pub fn capture_region(
    options: NativeScreenshotCaptureOptions,
) -> Result<NativeScreenshotCaptureResult> {
    capture_with_options(options)
}

#[napi(js_name = "capture")]
pub fn capture_with_options(
    options: NativeScreenshotCaptureOptions,
) -> Result<NativeScreenshotCaptureResult> {
    let started_at = Instant::now();
    let monitor = resolve_monitor(
        options.display_id.as_deref(),
        options.cursor_x,
        options.cursor_y,
    )?;
    let display = to_display(&monitor)?;
    let image = if let Some(region) = options.region {
        validate_region(&region, display.width, display.height)?;
        monitor
            .capture_region(region.x, region.y, region.width, region.height)
            .map_err(to_napi_error)?
    } else {
        monitor.capture_image().map_err(to_napi_error)?
    };

    let width = image.width();
    let height = image.height();
    let mut png = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(to_napi_error)?;

    Ok(NativeScreenshotCaptureResult {
        image: Buffer::from(png),
        mime_type: "image/png".to_string(),
        width,
        height,
        display_id: display.id,
        display_name: display.name,
        x: display.x,
        y: display.y,
        scale_factor: display.scale_factor,
        duration_ms: started_at.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
    })
}

fn resolve_monitor(
    display_id: Option<&str>,
    cursor_x: Option<i32>,
    cursor_y: Option<i32>,
) -> Result<Monitor> {
    if let Some(id) = display_id {
        let monitors = Monitor::all().map_err(to_napi_error)?;
        for monitor in monitors {
            if monitor_id(&monitor)? == id {
                return Ok(monitor);
            }
        }
        return Err(Error::from_reason(format!("Display not found: {id}")));
    }

    if let (Some(x), Some(y)) = (cursor_x, cursor_y) {
        return Monitor::from_point(x, y).map_err(to_napi_error);
    }

    select_default_monitor(Monitor::all().map_err(to_napi_error)?)
}

fn platform_supported() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

fn probe_monitor_count() -> std::result::Result<usize, String> {
    Monitor::all()
        .map(|monitors| monitors.len())
        .map_err(|error| error.to_string())
}

fn build_native_screenshot_support(
    platform: String,
    platform_supported: bool,
    monitor_probe: std::result::Result<usize, String>,
) -> NativeScreenshotSupport {
    if !platform_supported {
        return NativeScreenshotSupport {
            supported: false,
            platform,
            engine: None,
            reason: Some("platform-not-supported".to_string()),
        };
    }

    match monitor_probe {
        Ok(count) if count > 0 => NativeScreenshotSupport {
            supported: true,
            platform,
            engine: Some("xcap".to_string()),
            reason: None,
        },
        Ok(_) => NativeScreenshotSupport {
            supported: false,
            platform,
            engine: Some("xcap".to_string()),
            reason: Some("no-display-available".to_string()),
        },
        Err(reason) => NativeScreenshotSupport {
            supported: false,
            platform,
            engine: Some("xcap".to_string()),
            reason: Some(format!("xcap-monitor-probe-failed: {reason}")),
        },
    }
}

fn select_default_monitor(monitors: Vec<Monitor>) -> Result<Monitor> {
    let mut fallback = None;

    for monitor in monitors {
        if monitor.is_primary().unwrap_or(false) {
            return Ok(monitor);
        }

        if fallback.is_none() {
            fallback = Some(monitor);
        }
    }

    fallback.ok_or_else(|| Error::from_reason("No display available"))
}

fn to_display(monitor: &Monitor) -> Result<NativeScreenshotDisplay> {
    let id = monitor_id(monitor)?;
    let name = monitor.name().unwrap_or_else(|_| id.clone());
    Ok(NativeScreenshotDisplay {
        id,
        name,
        friendly_name: monitor.friendly_name().ok(),
        x: monitor.x().unwrap_or(0),
        y: monitor.y().unwrap_or(0),
        width: monitor.width().unwrap_or(0),
        height: monitor.height().unwrap_or(0),
        scale_factor: f64::from(monitor.scale_factor().unwrap_or(1.0)),
        rotation: f64::from(monitor.rotation().unwrap_or(0.0)),
        is_primary: monitor.is_primary().unwrap_or(false),
    })
}

fn monitor_id(monitor: &Monitor) -> Result<String> {
    Ok(monitor.id().map_err(to_napi_error)?.to_string())
}

fn validate_region(
    region: &NativeScreenshotRegion,
    display_width: u32,
    display_height: u32,
) -> Result<()> {
    if region.width == 0 || region.height == 0 {
        return Err(Error::from_reason(
            "Capture region width and height must be positive",
        ));
    }

    if display_width == 0 || display_height == 0 {
        return Err(Error::from_reason(
            "Display bounds are unavailable for capture region",
        ));
    }

    let right = region
        .x
        .checked_add(region.width)
        .ok_or_else(|| Error::from_reason("Capture region horizontal bounds overflow"))?;
    let bottom = region
        .y
        .checked_add(region.height)
        .ok_or_else(|| Error::from_reason("Capture region vertical bounds overflow"))?;

    if right > display_width || bottom > display_height {
        return Err(Error::from_reason(format!(
            "Capture region is outside display bounds: region=({}, {}, {}x{}), display={}x{}",
            region.x, region.y, region.width, region.height, display_width, display_height
        )));
    }

    Ok(())
}

fn to_napi_error<E: std::fmt::Display>(error: E) -> Error {
    Error::from_reason(error.to_string())
}

#[cfg(test)]
#[unsafe(no_mangle)]
extern "C" fn napi_delete_reference(
    _env: napi::sys::napi_env,
    _ref: napi::sys::napi_ref,
) -> napi::sys::napi_status {
    napi::Status::Ok as napi::sys::napi_status
}

#[cfg(test)]
#[unsafe(no_mangle)]
extern "C" fn napi_reference_unref(
    _env: napi::sys::napi_env,
    _ref: napi::sys::napi_ref,
    result: *mut u32,
) -> napi::sys::napi_status {
    if !result.is_null() {
        unsafe {
            *result = 0;
        }
    }
    napi::Status::Ok as napi::sys::napi_status
}

#[cfg(test)]
mod tests {
    use super::*;

    fn region(x: u32, y: u32, width: u32, height: u32) -> NativeScreenshotRegion {
        NativeScreenshotRegion {
            x,
            y,
            width,
            height,
        }
    }

    fn error_text(error: Error) -> String {
        error.to_string()
    }

    #[test]
    fn support_reports_ready_when_monitor_probe_has_displays() {
        let support = build_native_screenshot_support("macos".to_string(), true, Ok(1));

        assert!(support.supported);
        assert_eq!(support.platform, "macos");
        assert_eq!(support.engine.as_deref(), Some("xcap"));
        assert_eq!(support.reason, None);
    }

    #[test]
    fn support_reports_platform_not_supported_before_monitor_probe() {
        let support = build_native_screenshot_support("freebsd".to_string(), false, Ok(1));

        assert!(!support.supported);
        assert_eq!(support.engine, None);
        assert_eq!(support.reason.as_deref(), Some("platform-not-supported"));
    }

    #[test]
    fn support_reports_no_display_when_monitor_probe_is_empty() {
        let support = build_native_screenshot_support("linux".to_string(), true, Ok(0));

        assert!(!support.supported);
        assert_eq!(support.engine.as_deref(), Some("xcap"));
        assert_eq!(support.reason.as_deref(), Some("no-display-available"));
    }

    #[test]
    fn support_reports_monitor_probe_error() {
        let support = build_native_screenshot_support(
            "macos".to_string(),
            true,
            Err("screen recording denied".to_string()),
        );

        assert!(!support.supported);
        assert_eq!(support.engine.as_deref(), Some("xcap"));
        assert_eq!(
            support.reason.as_deref(),
            Some("xcap-monitor-probe-failed: screen recording denied")
        );
    }

    #[test]
    fn validate_region_accepts_in_bounds_region() {
        assert!(validate_region(&region(10, 20, 100, 80), 200, 200).is_ok());
        assert!(validate_region(&region(100, 100, 100, 100), 200, 200).is_ok());
    }

    #[test]
    fn validate_region_rejects_zero_sized_region() {
        let error = validate_region(&region(0, 0, 0, 10), 200, 200).unwrap_err();

        assert!(error_text(error).contains("width and height must be positive"));
    }

    #[test]
    fn validate_region_rejects_unavailable_display_bounds() {
        let error = validate_region(&region(0, 0, 10, 10), 0, 200).unwrap_err();

        assert!(error_text(error).contains("Display bounds are unavailable"));
    }

    #[test]
    fn validate_region_rejects_region_outside_display_bounds() {
        let error = validate_region(&region(150, 20, 100, 80), 200, 200).unwrap_err();

        assert!(error_text(error).contains("outside display bounds"));
    }

    #[test]
    fn validate_region_rejects_overflowing_region_bounds() {
        let error = validate_region(&region(u32::MAX, 0, 1, 10), 200, 200).unwrap_err();

        assert!(error_text(error).contains("horizontal bounds overflow"));
    }
}
