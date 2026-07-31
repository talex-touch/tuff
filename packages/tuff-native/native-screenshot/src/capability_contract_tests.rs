use serde_json::{Value, json};
use tuff_native_core::{ErrorCategory, ProtocolError};

use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{CaptureTarget, ScreenshotRequest, decode_screenshot_request};

fn decode(operation: &str, payload: Value) -> Result<ScreenshotRequest, ProtocolError> {
    decode_screenshot_request(operation, payload, 0, &ScreenshotLimits::default())
}

#[test]
fn probe_and_refresh_validate_defaults_unknown_fields_and_self_bounds() {
    let probe = decode("probe", json!({ "futureField": true })).unwrap();
    assert!(matches!(probe, ScreenshotRequest::Probe));

    let refresh = decode(
        "refresh",
        json!({
            "includeWindowTitles": true,
            "self": {
                "processIds": [42],
                "bundleIds": ["com.talex.touch"],
                "nativeWindowIds": ["7001"]
            },
            "futureField": { "supported": true }
        }),
    )
    .unwrap();
    let ScreenshotRequest::Refresh(refresh) = refresh else {
        panic!("expected refresh request");
    };
    assert!(refresh.include_window_titles);
    assert_eq!(refresh.self_context.process_ids, vec![42]);
    assert_eq!(refresh.self_context.bundle_ids, vec!["com.talex.touch"]);
    assert_eq!(refresh.self_context.native_window_ids[0].as_str(), "7001");

    let default_refresh = decode(
        "refresh",
        json!({
            "self": { "processIds": [], "bundleIds": [], "nativeWindowIds": [] }
        }),
    )
    .unwrap();
    let ScreenshotRequest::Refresh(default_refresh) = default_refresh else {
        panic!("expected refresh request");
    };
    assert!(!default_refresh.include_window_titles);

    let limits = ScreenshotLimits::default();
    let too_many_processes = (1..=limits.max_self_process_ids() + 1).collect::<Vec<_>>();
    let error = decode(
        "refresh",
        json!({
            "self": {
                "processIds": too_many_processes,
                "bundleIds": [],
                "nativeWindowIds": []
            }
        }),
    )
    .unwrap_err();
    assert_eq!(error.code, "INVALID_ARGUMENT");

    let too_many_bundles = (0..=limits.max_self_bundle_ids())
        .map(|index| format!("com.example.bundle-{index}"))
        .collect::<Vec<_>>();
    assert!(
        decode(
            "refresh",
            json!({
                "self": {
                    "processIds": [],
                    "bundleIds": too_many_bundles,
                    "nativeWindowIds": []
                }
            }),
        )
        .is_err()
    );
    let too_many_windows = (0..=limits.max_self_window_ids())
        .map(|index| format!("window:{index}"))
        .collect::<Vec<_>>();
    assert!(
        decode(
            "refresh",
            json!({
                "self": {
                    "processIds": [],
                    "bundleIds": [],
                    "nativeWindowIds": too_many_windows
                }
            }),
        )
        .is_err()
    );

    assert!(
        decode(
            "refresh",
            json!({
                "self": {
                    "processIds": [0],
                    "bundleIds": [],
                    "nativeWindowIds": []
                }
            }),
        )
        .is_err()
    );
}

#[test]
fn hit_test_validates_generation_point_granularity_and_candidate_limit() {
    let request = decode(
        "hit_test",
        json!({
            "generation": "generation:1",
            "point": { "x": -100.25, "y": 20.5 },
            "granularity": "ui-element",
            "includePanels": true,
            "maxCandidates": 100,
            "futureField": "ignored"
        }),
    )
    .unwrap();
    let ScreenshotRequest::HitTest(hit_test) = request else {
        panic!("expected hit-test request");
    };
    assert_eq!(hit_test.generation.as_str(), "generation:1");
    assert_eq!(hit_test.max_candidates, 16);
    assert!(hit_test.include_panels);

    assert!(
        decode(
            "hit_test",
            json!({
                "generation": "invalid/generation",
                "point": { "x": 0, "y": 0 },
                "granularity": "window"
            }),
        )
        .is_err()
    );
    assert!(
        decode(
            "hit_test",
            json!({ "generation": "generation:1", "granularity": "window" }),
        )
        .is_err()
    );
    assert!(
        decode(
            "hit_test",
            json!({
                "generation": "generation:1",
                "point": { "x": 0, "y": 0 },
                "granularity": "pixel"
            }),
        )
        .is_err()
    );
}

#[test]
fn capture_decodes_all_targets_and_rejects_invalid_region_and_scale() {
    let targets = [
        json!({ "kind": "display", "generation": "generation:1", "displayId": "display:1" }),
        json!({ "kind": "window", "generation": "generation:1", "windowId": "window:1" }),
        json!({
            "kind": "region",
            "generation": "generation:1",
            "rect": { "x": -10.5, "y": 0.25, "width": 20.5, "height": 10.75 }
        }),
        json!({
            "kind": "ui-element",
            "generation": "generation:1",
            "elementId": "element:1"
        }),
    ];

    for target in targets {
        let request = decode(
            "capture",
            json!({
                "target": target,
                "cursor": "hidden",
                "output": { "format": "png", "scale": "native-max" },
                "futureField": 1
            }),
        )
        .unwrap();
        assert!(matches!(request, ScreenshotRequest::Capture(_)));
    }

    let explicit = decode(
        "capture",
        json!({
            "target": { "kind": "display", "generation": "generation:1", "displayId": "display:1" },
            "cursor": "system",
            "includeSelfWindowId": "window:self",
            "output": { "format": "png", "scale": 1.5 }
        }),
    )
    .unwrap();
    let ScreenshotRequest::Capture(explicit) = explicit else {
        panic!("expected capture request");
    };
    assert!(matches!(explicit.target, CaptureTarget::Display { .. }));
    assert_eq!(
        explicit.include_self_window_id.unwrap().as_str(),
        "window:self"
    );

    let invalid_region = decode(
        "capture",
        json!({
            "target": {
                "kind": "region",
                "generation": "generation:1",
                "rect": { "x": 0, "y": 0, "width": 0, "height": 10 }
            },
            "cursor": "hidden",
            "output": { "format": "png", "scale": "native-max" }
        }),
    )
    .unwrap_err();
    assert_eq!(invalid_region.code, "SCREENSHOT_INVALID_REGION");
    assert_eq!(invalid_region.category, ErrorCategory::Validation);

    for scale in [json!(0.24), json!(4.01), json!("device")] {
        assert!(
            decode(
                "capture",
                json!({
                    "target": { "kind": "display", "generation": "generation:1", "displayId": "display:1" },
                    "cursor": "hidden",
                    "output": { "format": "png", "scale": scale }
                }),
            )
            .is_err()
        );
    }
}

#[test]
fn frames_validate_rate_format_and_frame_budget() {
    let request = decode(
        "frames",
        json!({
            "target": { "kind": "window", "generation": "generation:1", "windowId": "window:1" },
            "cursor": "system",
            "framesPerSecond": 30,
            "pixelFormat": "bgra8-premultiplied",
            "maxFrameBytes": 33554432,
            "futureField": true
        }),
    )
    .unwrap();
    assert!(matches!(request, ScreenshotRequest::Frames(_)));

    for frames_per_second in [0, 31] {
        assert!(
            decode(
                "frames",
                json!({
                    "target": { "kind": "window", "generation": "generation:1", "windowId": "window:1" },
                    "cursor": "hidden",
                    "framesPerSecond": frames_per_second,
                    "pixelFormat": "bgra8-premultiplied",
                    "maxFrameBytes": 1024
                }),
            )
            .is_err()
        );
    }
    for max_frame_bytes in [0_u64, 64 * 1024 * 1024 + 1] {
        assert!(
            decode(
                "frames",
                json!({
                    "target": { "kind": "window", "generation": "generation:1", "windowId": "window:1" },
                    "cursor": "hidden",
                    "framesPerSecond": 1,
                    "pixelFormat": "bgra8-premultiplied",
                    "maxFrameBytes": max_frame_bytes
                }),
            )
            .is_err()
        );
    }
    assert!(
        decode(
            "frames",
            json!({
                "target": { "kind": "window", "generation": "generation:1", "windowId": "window:1" },
                "cursor": "hidden",
                "framesPerSecond": 1,
                "pixelFormat": "rgba8",
                "maxFrameBytes": 1024
            }),
        )
        .is_err()
    );
}

#[test]
fn every_operation_rejects_input_attachments_and_unknown_operations() {
    for operation in ["probe", "refresh", "hit_test", "capture", "frames"] {
        let error =
            decode_screenshot_request(operation, json!({}), 1, &ScreenshotLimits::default())
                .unwrap_err();
        assert_eq!(error.code, "ATTACHMENT_MISMATCH", "{operation}");
    }
    assert_eq!(
        decode("unknown", json!({})).unwrap_err().code,
        "OPERATION_NOT_FOUND"
    );
}

#[test]
fn screenshot_errors_have_stable_sanitized_protocol_mappings() {
    let cases = [
        (
            ScreenshotError::Unsupported,
            "SCREENSHOT_UNSUPPORTED",
            ErrorCategory::Availability,
            false,
        ),
        (
            ScreenshotError::PermissionDenied,
            "SCREENSHOT_PERMISSION_DENIED",
            ErrorCategory::Permission,
            false,
        ),
        (
            ScreenshotError::StaleGeneration,
            "SCREENSHOT_STALE_GENERATION",
            ErrorCategory::Validation,
            true,
        ),
        (
            ScreenshotError::TopologyChanged,
            "SCREENSHOT_TOPOLOGY_CHANGED",
            ErrorCategory::Availability,
            true,
        ),
        (
            ScreenshotError::DisplayNotFound,
            "SCREENSHOT_DISPLAY_NOT_FOUND",
            ErrorCategory::NotFound,
            true,
        ),
        (
            ScreenshotError::WindowNotFound,
            "SCREENSHOT_WINDOW_NOT_FOUND",
            ErrorCategory::NotFound,
            true,
        ),
        (
            ScreenshotError::ElementNotFound,
            "SCREENSHOT_ELEMENT_NOT_FOUND",
            ErrorCategory::NotFound,
            true,
        ),
        (
            ScreenshotError::InvalidRegion,
            "SCREENSHOT_INVALID_REGION",
            ErrorCategory::Validation,
            false,
        ),
        (
            ScreenshotError::ProtectedContent,
            "SCREENSHOT_PROTECTED_CONTENT",
            ErrorCategory::Permission,
            false,
        ),
        (
            ScreenshotError::FrameUnavailable,
            "SCREENSHOT_FRAME_UNAVAILABLE",
            ErrorCategory::Availability,
            true,
        ),
        (
            ScreenshotError::OutputTooLarge,
            "SCREENSHOT_OUTPUT_TOO_LARGE",
            ErrorCategory::Resource,
            false,
        ),
        (
            ScreenshotError::BackendBusy,
            "SCREENSHOT_BACKEND_BUSY",
            ErrorCategory::Resource,
            true,
        ),
        (
            ScreenshotError::BackendFailed,
            "SCREENSHOT_BACKEND_FAILED",
            ErrorCategory::Internal,
            true,
        ),
    ];

    for (kind, code, category, retryable) in cases {
        let error = kind.to_protocol_error();
        assert_eq!(error.code, code);
        assert_eq!(error.category, category);
        assert_eq!(error.retryable, retryable);
        assert!(!error.message.is_empty());
        assert!(error.message.len() <= 96);
        assert!(error.details.is_empty());
        assert!(!error.message.contains("secret-window-title"));
    }
}
