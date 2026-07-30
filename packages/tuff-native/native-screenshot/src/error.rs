use tuff_native_core::{ErrorCategory, ProtocolError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenshotError {
    Unsupported,
    PermissionDenied,
    StaleGeneration,
    TopologyChanged,
    DisplayNotFound,
    WindowNotFound,
    ElementNotFound,
    InvalidRegion,
    ProtectedContent,
    FrameUnavailable,
    OutputTooLarge,
    BackendBusy,
    BackendFailed,
}

impl ScreenshotError {
    pub fn to_protocol_error(self) -> ProtocolError {
        let (code, category, message, retryable) = match self {
            Self::Unsupported => (
                "SCREENSHOT_UNSUPPORTED",
                ErrorCategory::Availability,
                "Screenshot capture is unavailable",
                false,
            ),
            Self::PermissionDenied => (
                "SCREENSHOT_PERMISSION_DENIED",
                ErrorCategory::Permission,
                "Screen capture permission is denied",
                false,
            ),
            Self::StaleGeneration => (
                "SCREENSHOT_STALE_GENERATION",
                ErrorCategory::Validation,
                "Screenshot content generation is stale",
                true,
            ),
            Self::TopologyChanged => (
                "SCREENSHOT_TOPOLOGY_CHANGED",
                ErrorCategory::Availability,
                "Display topology changed after refresh",
                true,
            ),
            Self::DisplayNotFound => (
                "SCREENSHOT_DISPLAY_NOT_FOUND",
                ErrorCategory::NotFound,
                "Screenshot display is unavailable",
                true,
            ),
            Self::WindowNotFound => (
                "SCREENSHOT_WINDOW_NOT_FOUND",
                ErrorCategory::NotFound,
                "Screenshot window is unavailable",
                true,
            ),
            Self::ElementNotFound => (
                "SCREENSHOT_ELEMENT_NOT_FOUND",
                ErrorCategory::NotFound,
                "Screenshot UI element is unavailable",
                true,
            ),
            Self::InvalidRegion => (
                "SCREENSHOT_INVALID_REGION",
                ErrorCategory::Validation,
                "Screenshot region is invalid",
                false,
            ),
            Self::ProtectedContent => (
                "SCREENSHOT_PROTECTED_CONTENT",
                ErrorCategory::Permission,
                "Screenshot content is protected",
                false,
            ),
            Self::FrameUnavailable => (
                "SCREENSHOT_FRAME_UNAVAILABLE",
                ErrorCategory::Availability,
                "Screenshot frame is unavailable",
                true,
            ),
            Self::OutputTooLarge => (
                "SCREENSHOT_OUTPUT_TOO_LARGE",
                ErrorCategory::Resource,
                "Screenshot output exceeds the resource limit",
                false,
            ),
            Self::BackendBusy => (
                "SCREENSHOT_BACKEND_BUSY",
                ErrorCategory::Resource,
                "Screenshot backend is busy",
                true,
            ),
            Self::BackendFailed => (
                "SCREENSHOT_BACKEND_FAILED",
                ErrorCategory::Internal,
                "Screenshot backend failed",
                true,
            ),
        };
        ProtocolError::new(code, category, message, retryable)
    }
}

impl From<ScreenshotError> for ProtocolError {
    fn from(value: ScreenshotError) -> Self {
        value.to_protocol_error()
    }
}
