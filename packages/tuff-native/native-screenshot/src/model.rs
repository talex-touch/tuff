use std::collections::HashSet;
use std::fmt;

use serde::de::{DeserializeOwned, Error as _};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use tuff_native_core::ProtocolError;

use crate::error::ScreenshotError;
use crate::limits::{ScreenshotLimits, ScreenshotLimitsPublic};

const MAX_AXIS_SCALE: f64 = 4.0;
const MAX_DESCRIPTOR_ID_BYTES: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GeometryError {
    message: &'static str,
}

impl GeometryError {
    pub const fn new(message: &'static str) -> Self {
        Self { message }
    }
}

impl fmt::Display for GeometryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for GeometryError {}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalDipPoint {
    x: f64,
    y: f64,
}

impl GlobalDipPoint {
    pub fn new(x: f64, y: f64) -> Result<Self, GeometryError> {
        validate_finite_pair(x, y)?;
        Ok(Self { x, y })
    }

    pub const fn x(self) -> f64 {
        self.x
    }

    pub const fn y(self) -> f64 {
        self.y
    }
}

impl<'de> Deserialize<'de> for GlobalDipPoint {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct RawPoint {
            x: f64,
            y: f64,
        }

        let raw = RawPoint::deserialize(deserializer)?;
        Self::new(raw.x, raw.y).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalDipRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl GlobalDipRect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Result<Self, GeometryError> {
        validate_rect(x, y, width, height)?;
        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }

    pub const fn x(self) -> f64 {
        self.x
    }

    pub const fn y(self) -> f64 {
        self.y
    }

    pub const fn width(self) -> f64 {
        self.width
    }

    pub const fn height(self) -> f64 {
        self.height
    }

    pub fn right(self) -> f64 {
        self.x + self.width
    }

    pub fn bottom(self) -> f64 {
        self.y + self.height
    }

    pub fn contains_point(self, point: GlobalDipPoint) -> bool {
        point.x >= self.x && point.x < self.right() && point.y >= self.y && point.y < self.bottom()
    }

    pub fn contains_rect(self, other: Self) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }

    pub fn intersection(self, other: Self) -> Option<Self> {
        let left = self.x.max(other.x);
        let top = self.y.max(other.y);
        let right = self.right().min(other.right());
        let bottom = self.bottom().min(other.bottom());
        if right <= left || bottom <= top {
            return None;
        }
        Self::new(left, top, right - left, bottom - top).ok()
    }
}

impl<'de> Deserialize<'de> for GlobalDipRect {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RawRect {
            x: f64,
            y: f64,
            width: f64,
            height: f64,
        }

        let raw = RawRect::deserialize(deserializer)?;
        Self::new(raw.x, raw.y, raw.width, raw.height).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayLocalPointRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl DisplayLocalPointRect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Result<Self, GeometryError> {
        validate_rect(x, y, width, height)?;
        if x < 0.0 || y < 0.0 {
            return Err(GeometryError::new(
                "display-local coordinates must be non-negative",
            ));
        }
        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }

    pub const fn x(self) -> f64 {
        self.x
    }

    pub const fn y(self) -> f64 {
        self.y
    }

    pub const fn width(self) -> f64 {
        self.width
    }

    pub const fn height(self) -> f64 {
        self.height
    }

    pub fn right(self) -> f64 {
        self.x + self.width
    }

    pub fn bottom(self) -> f64 {
        self.y + self.height
    }
}

impl<'de> Deserialize<'de> for DisplayLocalPointRect {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RawRect {
            x: f64,
            y: f64,
            width: f64,
            height: f64,
        }

        let raw = RawRect::deserialize(deserializer)?;
        Self::new(raw.x, raw.y, raw.width, raw.height).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelSize {
    width: u32,
    height: u32,
}

impl PixelSize {
    pub fn new(width: u32, height: u32) -> Result<Self, GeometryError> {
        if width == 0 || height == 0 {
            return Err(GeometryError::new("pixel dimensions must be positive"));
        }
        Ok(Self { width, height })
    }

    pub const fn width(self) -> u32 {
        self.width
    }

    pub const fn height(self) -> u32 {
        self.height
    }

    pub fn pixel_count(self) -> Result<u64, GeometryError> {
        u64::from(self.width)
            .checked_mul(u64::from(self.height))
            .ok_or_else(|| GeometryError::new("pixel count overflow"))
    }
}

impl<'de> Deserialize<'de> for PixelSize {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RawSize {
            width: u32,
            height: u32,
        }

        let raw = RawSize::deserialize(deserializer)?;
        Self::new(raw.width, raw.height).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AxisScale {
    x: f64,
    y: f64,
}

impl AxisScale {
    pub fn new(x: f64, y: f64) -> Result<Self, GeometryError> {
        validate_finite_pair(x, y)?;
        if x <= 0.0 || y <= 0.0 || x > MAX_AXIS_SCALE || y > MAX_AXIS_SCALE {
            return Err(GeometryError::new("axis scale must be in (0, 4]"));
        }
        Ok(Self { x, y })
    }

    pub const fn x(self) -> f64 {
        self.x
    }

    pub const fn y(self) -> f64 {
        self.y
    }

    pub fn maximum(self, other: Self) -> Self {
        Self {
            x: self.x.max(other.x),
            y: self.y.max(other.y),
        }
    }
}

impl<'de> Deserialize<'de> for AxisScale {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct RawScale {
            x: f64,
            y: f64,
        }

        let raw = RawScale::deserialize(deserializer)?;
        Self::new(raw.x, raw.y).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rotation {
    Degrees0,
    Degrees90,
    Degrees180,
    Degrees270,
}

impl Rotation {
    pub const fn degrees(self) -> u16 {
        match self {
            Self::Degrees0 => 0,
            Self::Degrees90 => 90,
            Self::Degrees180 => 180,
            Self::Degrees270 => 270,
        }
    }

    pub const fn swaps_axes(self) -> bool {
        matches!(self, Self::Degrees90 | Self::Degrees270)
    }
}

impl TryFrom<u16> for Rotation {
    type Error = GeometryError;

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Degrees0),
            90 => Ok(Self::Degrees90),
            180 => Ok(Self::Degrees180),
            270 => Ok(Self::Degrees270),
            _ => Err(GeometryError::new("rotation must be 0, 90, 180, or 270")),
        }
    }
}

impl Serialize for Rotation {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u16(self.degrees())
    }
}

impl<'de> Deserialize<'de> for Rotation {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Self::try_from(u16::deserialize(deserializer)?).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayLocalPixelRect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

impl DisplayLocalPixelRect {
    pub fn new(x: u32, y: u32, width: u32, height: u32) -> Result<Self, GeometryError> {
        validate_pixel_rect(x, y, width, height)?;
        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }

    pub const fn x(self) -> u32 {
        self.x
    }

    pub const fn y(self) -> u32 {
        self.y
    }

    pub const fn width(self) -> u32 {
        self.width
    }

    pub const fn height(self) -> u32 {
        self.height
    }

    pub fn right(self) -> u32 {
        self.x + self.width
    }

    pub fn bottom(self) -> u32 {
        self.y + self.height
    }
}

impl<'de> Deserialize<'de> for DisplayLocalPixelRect {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RawRect {
            x: u32,
            y: u32,
            width: u32,
            height: u32,
        }

        let raw = RawRect::deserialize(deserializer)?;
        Self::new(raw.x, raw.y, raw.width, raw.height).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPixelRect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

impl OutputPixelRect {
    pub fn new(x: u32, y: u32, width: u32, height: u32) -> Result<Self, GeometryError> {
        validate_pixel_rect(x, y, width, height)?;
        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }

    pub const fn x(self) -> u32 {
        self.x
    }

    pub const fn y(self) -> u32 {
        self.y
    }

    pub const fn width(self) -> u32 {
        self.width
    }

    pub const fn height(self) -> u32 {
        self.height
    }

    pub fn right(self) -> u32 {
        self.x + self.width
    }

    pub fn bottom(self) -> u32 {
        self.y + self.height
    }
}

impl<'de> Deserialize<'de> for OutputPixelRect {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RawRect {
            x: u32,
            y: u32,
            width: u32,
            height: u32,
        }

        let raw = RawRect::deserialize(deserializer)?;
        Self::new(raw.x, raw.y, raw.width, raw.height).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct DescriptorId(String);

impl DescriptorId {
    pub fn new(value: impl Into<String>) -> Result<Self, GeometryError> {
        let value = value.into();
        let mut bytes = value.bytes();
        let Some(first) = bytes.next() else {
            return Err(GeometryError::new("invalid descriptor id"));
        };
        if value.len() > MAX_DESCRIPTOR_ID_BYTES
            || !first.is_ascii_alphanumeric()
            || !bytes.all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-')
            })
        {
            return Err(GeometryError::new("invalid descriptor id"));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for DescriptorId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Self::new(String::deserialize(deserializer)?).map_err(D::Error::custom)
    }
}

impl TryFrom<String> for DescriptorId {
    type Error = GeometryError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl TryFrom<&str> for DescriptorId {
    type Error = GeometryError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionStatus {
    Granted,
    Denied,
    Unknown,
    NotRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityStatus {
    Granted,
    Denied,
    Unknown,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotProbeResult {
    pub platform: String,
    pub engine: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<OsVersion>,
    pub screen_recording: PermissionStatus,
    pub accessibility: AccessibilityStatus,
    pub features: Vec<String>,
    pub limits: ScreenshotLimitsPublic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum CoordinateSpace {
    #[serde(rename = "global-dip-v1")]
    GlobalDipV1,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayDescriptor {
    pub id: DescriptorId,
    pub native_id: String,
    pub name: String,
    pub global_frame: GlobalDipRect,
    pub pixel_size: PixelSize,
    pub scale: AxisScale,
    pub rotation: Rotation,
    pub is_primary: bool,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOwnerDescriptor {
    pub process_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub application_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowDescriptorKind {
    Normal,
    Panel,
    Transient,
    System,
    Unknown,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSnapshotDescriptor {
    pub id: DescriptorId,
    pub native_id: String,
    pub owner: WindowOwnerDescriptor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub global_frame: GlobalDipRect,
    pub layer: i32,
    pub z_index: usize,
    pub kind: WindowDescriptorKind,
    pub on_screen: bool,
    pub active: Option<bool>,
    pub capturable: bool,
    pub minimized: Option<bool>,
    pub covered_display_ids: Vec<DescriptorId>,
    #[serde(rename = "self")]
    pub is_self: bool,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiElementDescriptor {
    pub id: DescriptorId,
    pub window_id: DescriptorId,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subrole: Option<String>,
    pub global_frame: GlobalDipRect,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focused: Option<bool>,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentSnapshot {
    pub generation: DescriptorId,
    pub coordinate_space: CoordinateSpace,
    pub captured_at_unix_ms: u64,
    pub displays: Vec<DisplayDescriptor>,
    pub windows: Vec<WindowSnapshotDescriptor>,
    pub accessibility: AccessibilityStatus,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HitTestCandidate {
    pub window: WindowSnapshotDescriptor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element: Option<UiElementDescriptor>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessibilityFallback {
    PermissionDenied,
    Timeout,
    Unsupported,
    UnverifiedWindow,
}

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HitTestResult {
    pub generation: DescriptorId,
    pub point: GlobalDipPoint,
    pub candidates: Vec<HitTestCandidate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessibility_fallback: Option<AccessibilityFallback>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ScreenshotRequest {
    Probe,
    Refresh(RefreshInput),
    HitTest(HitTestInput),
    Capture(CaptureInput),
    Frames(FramesInput),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefreshInput {
    pub include_window_titles: bool,
    pub self_context: SelfCaptureContext,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelfCaptureContext {
    pub process_ids: Vec<u32>,
    pub bundle_ids: Vec<String>,
    pub native_window_ids: Vec<DescriptorId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HitTestGranularity {
    Window,
    UiElement,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HitTestInput {
    pub generation: DescriptorId,
    pub point: GlobalDipPoint,
    pub granularity: HitTestGranularity,
    pub include_panels: bool,
    pub max_candidates: usize,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum CaptureTarget {
    Display {
        generation: DescriptorId,
        display_id: DescriptorId,
    },
    Window {
        generation: DescriptorId,
        window_id: DescriptorId,
    },
    Region {
        generation: DescriptorId,
        rect: GlobalDipRect,
    },
    UiElement {
        generation: DescriptorId,
        element_id: DescriptorId,
    },
}

impl CaptureTarget {
    pub const fn generation(&self) -> &DescriptorId {
        match self {
            Self::Display { generation, .. }
            | Self::Window { generation, .. }
            | Self::Region { generation, .. }
            | Self::UiElement { generation, .. } => generation,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorPolicy {
    Hidden,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureFormat {
    Png,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CaptureOutputScale {
    NativeMax,
    Explicit(f64),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CaptureOutputOptions {
    pub format: CaptureFormat,
    pub scale: CaptureOutputScale,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CaptureInput {
    pub target: CaptureTarget,
    pub cursor: CursorPolicy,
    pub include_self_window_id: Option<DescriptorId>,
    pub output: CaptureOutputOptions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FramePixelFormat {
    Bgra8Premultiplied,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FramesInput {
    pub target: CaptureTarget,
    pub cursor: CursorPolicy,
    pub include_self_window_id: Option<DescriptorId>,
    pub frames_per_second: u32,
    pub pixel_format: FramePixelFormat,
    pub max_frame_bytes: u64,
}

#[derive(Deserialize)]
struct ProbeInputWire {}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshInputWire {
    #[serde(default)]
    include_window_titles: bool,
    #[serde(rename = "self")]
    self_context: SelfCaptureContextWire,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelfCaptureContextWire {
    process_ids: Vec<u32>,
    bundle_ids: Vec<String>,
    native_window_ids: Vec<DescriptorId>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HitTestInputWire {
    generation: DescriptorId,
    point: GlobalDipPoint,
    granularity: HitTestGranularity,
    #[serde(default)]
    include_panels: bool,
    #[serde(default)]
    max_candidates: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureInputWire {
    target: CaptureTarget,
    cursor: CursorPolicy,
    #[serde(default)]
    include_self_window_id: Option<DescriptorId>,
    output: CaptureOutputOptionsWire,
}

#[derive(Deserialize)]
struct CaptureOutputOptionsWire {
    format: CaptureFormat,
    scale: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FramesInputWire {
    target: CaptureTarget,
    cursor: CursorPolicy,
    #[serde(default)]
    include_self_window_id: Option<DescriptorId>,
    frames_per_second: u32,
    pixel_format: FramePixelFormat,
    max_frame_bytes: u64,
}

pub fn decode_screenshot_request(
    operation: &str,
    payload: Value,
    input_attachment_count: usize,
    limits: &ScreenshotLimits,
) -> Result<ScreenshotRequest, ProtocolError> {
    if input_attachment_count != 0 {
        return Err(ProtocolError::attachment_mismatch());
    }

    match operation {
        "probe" => {
            decode_payload::<ProbeInputWire>(&payload)?;
            Ok(ScreenshotRequest::Probe)
        }
        "refresh" => decode_refresh(&payload, limits).map(ScreenshotRequest::Refresh),
        "hit_test" => decode_hit_test(&payload, limits).map(ScreenshotRequest::HitTest),
        "capture" => decode_capture(&payload, limits).map(ScreenshotRequest::Capture),
        "frames" => decode_frames(&payload, limits).map(ScreenshotRequest::Frames),
        _ => Err(ProtocolError::operation_not_found()),
    }
}

fn decode_refresh(
    payload: &Value,
    limits: &ScreenshotLimits,
) -> Result<RefreshInput, ProtocolError> {
    let input = decode_payload::<RefreshInputWire>(payload)?;
    let context = input.self_context;
    let max_process_ids = usize::try_from(limits.max_self_process_ids())
        .map_err(|_| ProtocolError::invalid_argument())?;
    if context.process_ids.len() > max_process_ids
        || context.bundle_ids.len() > limits.max_self_bundle_ids()
        || context.native_window_ids.len() > limits.max_self_window_ids()
        || context.process_ids.contains(&0)
        || !all_unique(&context.process_ids)
        || !all_unique(&context.bundle_ids)
        || !all_unique(&context.native_window_ids)
        || context
            .bundle_ids
            .iter()
            .any(|bundle_id| !valid_bundle_id(bundle_id, limits.max_bundle_id_bytes()))
    {
        return Err(ProtocolError::invalid_argument());
    }

    Ok(RefreshInput {
        include_window_titles: input.include_window_titles,
        self_context: SelfCaptureContext {
            process_ids: context.process_ids,
            bundle_ids: context.bundle_ids,
            native_window_ids: context.native_window_ids,
        },
    })
}

fn decode_hit_test(
    payload: &Value,
    limits: &ScreenshotLimits,
) -> Result<HitTestInput, ProtocolError> {
    let input = decode_payload::<HitTestInputWire>(payload)?;
    if input.max_candidates == Some(0) {
        return Err(ProtocolError::invalid_argument());
    }
    Ok(HitTestInput {
        generation: input.generation,
        point: input.point,
        granularity: input.granularity,
        include_panels: input.include_panels,
        max_candidates: input
            .max_candidates
            .unwrap_or(limits.max_window_candidates())
            .min(limits.max_window_candidates()),
    })
}

fn decode_capture(
    payload: &Value,
    limits: &ScreenshotLimits,
) -> Result<CaptureInput, ProtocolError> {
    let input = decode_payload::<CaptureInputWire>(payload)
        .map_err(|error| map_capture_decode_error(payload, error))?;
    Ok(CaptureInput {
        target: input.target,
        cursor: input.cursor,
        include_self_window_id: input.include_self_window_id,
        output: CaptureOutputOptions {
            format: input.output.format,
            scale: decode_output_scale(&input.output.scale, limits)?,
        },
    })
}

fn decode_frames(payload: &Value, limits: &ScreenshotLimits) -> Result<FramesInput, ProtocolError> {
    let input = decode_payload::<FramesInputWire>(payload)
        .map_err(|error| map_capture_decode_error(payload, error))?;
    if input.frames_per_second < limits.min_frame_rate()
        || input.frames_per_second > limits.max_frame_rate()
        || input.max_frame_bytes == 0
        || input.max_frame_bytes > limits.max_stream_frame_bytes()
    {
        return Err(ProtocolError::invalid_argument());
    }
    Ok(FramesInput {
        target: input.target,
        cursor: input.cursor,
        include_self_window_id: input.include_self_window_id,
        frames_per_second: input.frames_per_second,
        pixel_format: input.pixel_format,
        max_frame_bytes: input.max_frame_bytes,
    })
}

fn decode_output_scale(
    value: &Value,
    limits: &ScreenshotLimits,
) -> Result<CaptureOutputScale, ProtocolError> {
    if value.as_str() == Some("native-max") {
        return Ok(CaptureOutputScale::NativeMax);
    }
    let Some(scale) = value.as_f64() else {
        return Err(ProtocolError::invalid_argument());
    };
    if !scale.is_finite() || scale < limits.min_output_scale() || scale > limits.max_output_scale()
    {
        return Err(ProtocolError::invalid_argument());
    }
    Ok(CaptureOutputScale::Explicit(scale))
}

fn decode_payload<T: DeserializeOwned>(payload: &Value) -> Result<T, ProtocolError> {
    serde_json::from_value(payload.clone()).map_err(|_| ProtocolError::invalid_argument())
}

fn map_capture_decode_error(payload: &Value, error: ProtocolError) -> ProtocolError {
    if invalid_region_payload(payload) {
        ScreenshotError::InvalidRegion.to_protocol_error()
    } else {
        error
    }
}

fn invalid_region_payload(payload: &Value) -> bool {
    let Some(target) = payload.get("target").and_then(Value::as_object) else {
        return false;
    };
    if target.get("kind").and_then(Value::as_str) != Some("region") {
        return false;
    }
    target
        .get("rect")
        .cloned()
        .and_then(|value| serde_json::from_value::<GlobalDipRect>(value).ok())
        .is_none()
}

fn all_unique<T>(values: &[T]) -> bool
where
    T: Eq + std::hash::Hash,
{
    let mut seen = HashSet::with_capacity(values.len());
    values.iter().all(|value| seen.insert(value))
}

fn valid_bundle_id(value: &str, max_bytes: usize) -> bool {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    value.len() <= max_bytes
        && first.is_ascii_alphanumeric()
        && bytes
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn validate_finite_pair(first: f64, second: f64) -> Result<(), GeometryError> {
    if !first.is_finite() || !second.is_finite() {
        return Err(GeometryError::new("coordinate values must be finite"));
    }
    Ok(())
}

fn validate_rect(x: f64, y: f64, width: f64, height: f64) -> Result<(), GeometryError> {
    validate_finite_pair(x, y)?;
    validate_finite_pair(width, height)?;
    if width <= 0.0 || height <= 0.0 {
        return Err(GeometryError::new("rectangle dimensions must be positive"));
    }
    if !(x + width).is_finite() || !(y + height).is_finite() {
        return Err(GeometryError::new("rectangle bounds overflow"));
    }
    Ok(())
}

fn validate_pixel_rect(x: u32, y: u32, width: u32, height: u32) -> Result<(), GeometryError> {
    if width == 0 || height == 0 {
        return Err(GeometryError::new(
            "pixel rectangle dimensions must be positive",
        ));
    }
    x.checked_add(width)
        .ok_or_else(|| GeometryError::new("pixel rectangle horizontal bounds overflow"))?;
    y.checked_add(height)
        .ok_or_else(|| GeometryError::new("pixel rectangle vertical bounds overflow"))?;
    Ok(())
}
