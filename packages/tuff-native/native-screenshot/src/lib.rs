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
  let supported = cfg!(any(target_os = "macos", target_os = "windows", target_os = "linux"));
  NativeScreenshotSupport {
    supported,
    platform: std::env::consts::OS.to_string(),
    engine: if supported {
      Some("xcap".to_string())
    } else {
      None
    },
    reason: if supported {
      None
    } else {
      Some("platform-not-supported".to_string())
    },
  }
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
pub fn capture_region(options: NativeScreenshotCaptureOptions) -> Result<NativeScreenshotCaptureResult> {
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
    validate_region(&region)?;
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

  Monitor::all()
    .map_err(to_napi_error)?
    .into_iter()
    .next()
    .ok_or_else(|| Error::from_reason("No display available"))
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

fn validate_region(region: &NativeScreenshotRegion) -> Result<()> {
  if region.width == 0 || region.height == 0 {
    return Err(Error::from_reason("Capture region width and height must be positive"));
  }
  Ok(())
}

fn to_napi_error<E: std::fmt::Display>(error: E) -> Error {
  Error::from_reason(error.to_string())
}
