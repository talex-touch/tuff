use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    Protocol,
    Validation,
    Availability,
    Permission,
    NotFound,
    Cancelled,
    Timeout,
    Resource,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ErrorDetailValue {
    String(String),
    Number(f64),
    Boolean(bool),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    pub code: String,
    pub category: ErrorCategory,
    pub message: String,
    pub retryable: bool,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub details: BTreeMap<String, ErrorDetailValue>,
}

impl ProtocolError {
    pub fn new(
        code: impl Into<String>,
        category: ErrorCategory,
        message: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code: code.into(),
            category,
            message: message.into(),
            retryable,
            details: BTreeMap::new(),
        }
    }

    pub fn protocol_version_unsupported() -> Self {
        Self::new(
            "PROTOCOL_VERSION_UNSUPPORTED",
            ErrorCategory::Protocol,
            "Native protocol version is unsupported",
            false,
        )
    }

    pub fn protocol_feature_unsupported() -> Self {
        Self::new(
            "PROTOCOL_FEATURE_UNSUPPORTED",
            ErrorCategory::Protocol,
            "Native protocol feature is unsupported",
            false,
        )
    }

    pub fn malformed_control() -> Self {
        Self::new(
            "MALFORMED_CONTROL",
            ErrorCategory::Validation,
            "Native control is malformed",
            false,
        )
    }

    pub fn invalid_envelope() -> Self {
        Self::new(
            "INVALID_ENVELOPE",
            ErrorCategory::Validation,
            "Native control envelope is invalid",
            false,
        )
    }

    pub fn attachment_mismatch() -> Self {
        Self::new(
            "ATTACHMENT_MISMATCH",
            ErrorCategory::Validation,
            "Native attachments do not match control metadata",
            false,
        )
    }

    pub fn attachment_limit_exceeded() -> Self {
        Self::new(
            "ATTACHMENT_LIMIT_EXCEEDED",
            ErrorCategory::Resource,
            "Native attachments exceed the protocol limit",
            false,
        )
    }

    pub fn capability_not_found() -> Self {
        Self::new(
            "CAPABILITY_NOT_FOUND",
            ErrorCategory::NotFound,
            "Native capability is not available",
            false,
        )
    }

    pub fn operation_not_found() -> Self {
        Self::new(
            "OPERATION_NOT_FOUND",
            ErrorCategory::NotFound,
            "Native operation is not available",
            false,
        )
    }

    pub fn invalid_argument() -> Self {
        Self::new(
            "INVALID_ARGUMENT",
            ErrorCategory::Validation,
            "Native operation arguments are invalid",
            false,
        )
    }

    pub fn deadline_exceeded() -> Self {
        Self::new(
            "DEADLINE_EXCEEDED",
            ErrorCategory::Timeout,
            "Native operation deadline was exceeded",
            true,
        )
    }

    pub fn cancelled() -> Self {
        Self::new(
            "CANCELLED",
            ErrorCategory::Cancelled,
            "Native operation was cancelled",
            false,
        )
    }

    pub fn transport_disposed() -> Self {
        Self::new(
            "TRANSPORT_DISPOSED",
            ErrorCategory::Availability,
            "Native transport is disposed",
            false,
        )
    }

    pub fn native_busy() -> Self {
        Self::new(
            "NATIVE_BUSY",
            ErrorCategory::Resource,
            "Native runtime is busy",
            true,
        )
    }

    pub fn native_unavailable() -> Self {
        Self::new(
            "NATIVE_UNAVAILABLE",
            ErrorCategory::Availability,
            "Native runtime is unavailable",
            true,
        )
    }

    pub fn capability_conflict() -> Self {
        Self::new(
            "CAPABILITY_CONFLICT",
            ErrorCategory::Protocol,
            "Native capability registration conflicts with an existing capability",
            false,
        )
    }

    pub fn duplicate_request_id() -> Self {
        Self::new(
            "DUPLICATE_REQUEST_ID",
            ErrorCategory::Protocol,
            "Native request identifier is already in flight",
            false,
        )
    }

    pub fn stream_not_found() -> Self {
        Self::new(
            "STREAM_NOT_FOUND",
            ErrorCategory::NotFound,
            "Native stream is not available",
            false,
        )
    }

    pub fn resource_exhausted() -> Self {
        Self::new(
            "RESOURCE_EXHAUSTED",
            ErrorCategory::Resource,
            "Native resource budget was exhausted",
            true,
        )
    }

    pub fn dispose_timeout() -> Self {
        Self::new(
            "NATIVE_DISPOSE_TIMEOUT",
            ErrorCategory::Timeout,
            "Native runtime disposal timed out",
            false,
        )
    }

    pub fn protocol_violation() -> Self {
        Self::new(
            "NATIVE_PROTOCOL_VIOLATION",
            ErrorCategory::Protocol,
            "Native protocol invariant was violated",
            false,
        )
    }

    pub fn backpressure_broken() -> Self {
        Self::new(
            "NATIVE_BACKPRESSURE_BROKEN",
            ErrorCategory::Protocol,
            "Native stream backpressure invariant was violated",
            false,
        )
    }

    pub fn internal() -> Self {
        Self::new(
            "INTERNAL",
            ErrorCategory::Internal,
            "Native operation failed",
            false,
        )
    }
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ProtocolError {}

/// Separates the human-readable prefix from the machine-readable envelope in an error reason.
///
/// `protocol.js` matches this literal; the two halves have to agree on one spelling.
pub const ERROR_ENVELOPE_PREFIX: &str = "|protocol-error:";

/// Renders a `ProtocolError` as a napi error reason that keeps its structure.
///
/// `napi::Status` is a fixed enum, so the protocol code cannot ride on `err.code` the way
/// `QueueFull` does — the reason is the only channel with room for `category`, `retryable` and
/// `details`. Flattening to `code: message` meant JS could not tell `NATIVE_BUSY` (retryable) from
/// `CAPABILITY_NOT_FOUND` (not) without splitting the string and hardcoding a list (#849).
///
/// Lives here rather than in the napi crate so it can be tested: that crate is a cdylib whose
/// napi symbols are supplied by the Node host, so its unit tests cannot link.
pub fn format_error_reason(error: &ProtocolError) -> String {
    match serde_json::to_string(error) {
        Ok(envelope) => format!(
            "{}: {} {}{}",
            error.code, error.message, ERROR_ENVELOPE_PREFIX, envelope
        ),
        // Unreachable for this shape, but a panic here would cross the FFI boundary.
        Err(_) => format!("{}: {}", error.code, error.message),
    }
}

#[cfg(test)]
mod reason_tests {
    use super::*;

    #[test]
    fn reason_carries_the_structured_error() {
        let mut details = BTreeMap::new();
        details.insert(
            "requestId".to_string(),
            ErrorDetailValue::String("req-1".to_string()),
        );
        let error = ProtocolError {
            code: "NATIVE_BUSY".to_string(),
            category: ErrorCategory::Resource,
            message: "runtime is busy".to_string(),
            retryable: true,
            details,
        };

        let reason = format_error_reason(&error);
        let (prefix, envelope) = reason
            .split_once(ERROR_ENVELOPE_PREFIX)
            .expect("reason should carry the machine-readable envelope");

        // The human-readable prefix is kept so a raw stack trace still reads as it did.
        assert!(prefix.starts_with("NATIVE_BUSY: runtime is busy"));

        let parsed: serde_json::Value =
            serde_json::from_str(envelope).expect("envelope should be valid JSON");
        assert_eq!(parsed["code"], "NATIVE_BUSY");
        assert_eq!(parsed["retryable"], true);
        assert_eq!(parsed["category"], "resource");
        assert_eq!(parsed["details"]["requestId"], "req-1");
    }

    #[test]
    fn a_permanent_error_is_distinguishable_from_a_retryable_one() {
        let busy = ProtocolError::new("NATIVE_BUSY", ErrorCategory::Resource, "busy", true);
        let missing = ProtocolError::new(
            "CAPABILITY_NOT_FOUND",
            ErrorCategory::NotFound,
            "no such capability",
            false,
        );

        assert!(format_error_reason(&busy).contains("\"retryable\":true"));
        assert!(format_error_reason(&missing).contains("\"retryable\":false"));
    }
}
