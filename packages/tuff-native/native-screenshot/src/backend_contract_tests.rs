use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use serde_json::json;
use tuff_native_core::{
    CancellationToken, CapabilityRegistry, CapabilityState, Control, NativeRuntime,
    OperationOutput, PROTOCOL_MAJOR, PROTOCOL_MINOR, ProtocolLimits, ProtocolVersion,
};

use crate::backend::{
    BackendCapture, BackendFuture, BackendPlatform, BackendProbe, BackendSupport, ScreenshotBackend,
};
use crate::capability::ScreenshotCapability;
use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{
    AccessibilityStatus, AxisScale, CaptureInput, CaptureOutputScale, CaptureTarget,
    ContentSnapshot, CoordinateSpace, CursorPolicy, DisplayDescriptor, GlobalDipRect, HitTestInput,
    HitTestResult, PermissionStatus, PixelSize, RefreshInput, Rotation,
};

#[derive(Default)]
struct FakeState {
    generation: u32,
    current_generation: Option<String>,
    retained_displays: HashSet<String>,
    retained_elements: HashSet<String>,
    fail_next_refresh: bool,
    topology_changed: bool,
}

#[derive(Clone)]
struct FakeBackend {
    support: BackendSupport,
    limits: ScreenshotLimits,
    state: Arc<Mutex<FakeState>>,
}

impl FakeBackend {
    fn new(support: BackendSupport, limits: ScreenshotLimits) -> Self {
        Self {
            support,
            limits,
            state: Arc::new(Mutex::new(FakeState::default())),
        }
    }

    fn fail_next_refresh(&self) {
        self.state.lock().unwrap().fail_next_refresh = true;
    }

    fn set_topology_changed(&self, changed: bool) {
        self.state.lock().unwrap().topology_changed = changed;
    }

    fn current_generation(&self) -> Option<String> {
        self.state.lock().unwrap().current_generation.clone()
    }

    fn retained_element_count(&self) -> usize {
        self.state.lock().unwrap().retained_elements.len()
    }
}

impl ScreenshotBackend for FakeBackend {
    fn support(&self) -> BackendSupport {
        self.support.clone()
    }

    fn probe(&self, _cancellation: CancellationToken) -> BackendFuture<BackendProbe> {
        let support = self.support.clone();
        Box::pin(async move {
            Ok(BackendProbe {
                platform: support.platform_name().to_string(),
                os_version: None,
                screen_recording: PermissionStatus::Granted,
                accessibility: support.accessibility(),
            })
        })
    }

    fn refresh(
        &self,
        _input: RefreshInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<ContentSnapshot> {
        let state = Arc::clone(&self.state);
        Box::pin(async move {
            let mut state = state.lock().unwrap();
            if state.fail_next_refresh {
                state.fail_next_refresh = false;
                return Err(ScreenshotError::BackendFailed.to_protocol_error());
            }

            let next_generation = state.generation + 1;
            let generation = format!("generation:{next_generation}");
            let display_id = format!("display:{next_generation}");
            let descriptor = DisplayDescriptor {
                id: display_id.clone().try_into().unwrap(),
                native_id: "1".to_string(),
                name: "Test Display".to_string(),
                global_frame: GlobalDipRect::new(0.0, 0.0, 100.0, 100.0).unwrap(),
                pixel_size: PixelSize::new(200, 200).unwrap(),
                scale: AxisScale::new(2.0, 2.0).unwrap(),
                rotation: Rotation::Degrees0,
                is_primary: true,
            };

            state.generation = next_generation;
            state.current_generation = Some(generation.clone());
            state.retained_displays = HashSet::from([display_id]);
            state.retained_elements.clear();
            Ok(ContentSnapshot {
                generation: generation.try_into().unwrap(),
                coordinate_space: CoordinateSpace::GlobalDipV1,
                captured_at_unix_ms: u64::from(next_generation),
                displays: vec![descriptor],
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
        let state = Arc::clone(&self.state);
        let max_elements = self.limits.max_ax_elements();
        Box::pin(async move {
            let mut state = state.lock().unwrap();
            if state.current_generation.as_deref() != Some(input.generation.as_str()) {
                return Err(ScreenshotError::StaleGeneration.to_protocol_error());
            }
            if state.retained_elements.len() < max_elements {
                let element_id = format!("element:{}", state.retained_elements.len() + 1);
                state.retained_elements.insert(element_id);
            }
            Ok(HitTestResult {
                generation: input.generation,
                point: input.point,
                candidates: Vec::new(),
                accessibility_fallback: None,
            })
        })
    }

    fn capture(
        &self,
        input: CaptureInput,
        _cancellation: CancellationToken,
    ) -> BackendFuture<BackendCapture> {
        let state = Arc::clone(&self.state);
        Box::pin(async move {
            let state = state.lock().unwrap();
            if state.topology_changed {
                return Err(ScreenshotError::TopologyChanged.to_protocol_error());
            }
            let CaptureTarget::Display {
                generation,
                display_id,
            } = &input.target
            else {
                return Err(ScreenshotError::Unsupported.to_protocol_error());
            };
            if state.current_generation.as_deref() != Some(generation.as_str()) {
                return Err(ScreenshotError::StaleGeneration.to_protocol_error());
            }
            if !state.retained_displays.contains(display_id.as_str()) {
                return Err(ScreenshotError::DisplayNotFound.to_protocol_error());
            }
            Ok(BackendCapture {
                generation: generation.clone(),
                target_kind: "display".to_string(),
                width: 1,
                height: 1,
                output_scale: AxisScale::new(1.0, 1.0).unwrap(),
                global_rect: GlobalDipRect::new(0.0, 0.0, 1.0, 1.0).unwrap(),
                png_bytes: vec![1, 2, 3],
            })
        })
    }
}

fn empty_refresh() -> serde_json::Value {
    json!({
        "self": { "processIds": [], "bundleIds": [], "nativeWindowIds": [] }
    })
}

#[tokio::test]
async fn backend_refresh_swap_is_atomic_and_stale_ids_fail_closed() {
    let limits = ScreenshotLimits::default();
    let backend = Arc::new(FakeBackend::new(
        BackendSupport::macos(AccessibilityStatus::Granted),
        limits,
    ));
    let capability = ScreenshotCapability::new(backend.clone(), limits);

    let first = capability
        .invoke_unary("refresh", empty_refresh(), vec![], CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(first.payload["generation"], "generation:1");

    backend.fail_next_refresh();
    let failed = capability
        .invoke_unary("refresh", empty_refresh(), vec![], CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(failed.code, "SCREENSHOT_BACKEND_FAILED");
    assert_eq!(
        backend.current_generation().as_deref(),
        Some("generation:1")
    );

    capability
        .invoke_unary("refresh", empty_refresh(), vec![], CancellationToken::new())
        .await
        .unwrap();
    let stale_capture = CaptureInput {
        target: CaptureTarget::Display {
            generation: "generation:1".to_string().try_into().unwrap(),
            display_id: "display:1".to_string().try_into().unwrap(),
        },
        cursor: CursorPolicy::Hidden,
        include_self_window_id: None,
        output: crate::model::CaptureOutputOptions {
            format: crate::model::CaptureFormat::Png,
            scale: CaptureOutputScale::NativeMax,
        },
    };
    assert_eq!(
        backend
            .capture(stale_capture, CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "SCREENSHOT_STALE_GENERATION"
    );
}

#[tokio::test]
async fn topology_change_and_element_cap_are_backend_owned_and_refresh_clears_elements() {
    let limits = ScreenshotLimits::default();
    let backend = Arc::new(FakeBackend::new(
        BackendSupport::macos(AccessibilityStatus::Granted),
        limits,
    ));
    let capability = ScreenshotCapability::new(backend.clone(), limits);
    capability
        .invoke_unary("refresh", empty_refresh(), vec![], CancellationToken::new())
        .await
        .unwrap();

    let hit_payload = json!({
        "generation": "generation:1",
        "point": { "x": 1, "y": 1 },
        "granularity": "ui-element"
    });
    for _ in 0..limits.max_ax_elements() + 10 {
        capability
            .invoke_unary(
                "hit_test",
                hit_payload.clone(),
                vec![],
                CancellationToken::new(),
            )
            .await
            .unwrap();
    }
    assert_eq!(backend.retained_element_count(), limits.max_ax_elements());

    backend.set_topology_changed(true);
    let capture = CaptureInput {
        target: CaptureTarget::Display {
            generation: "generation:1".to_string().try_into().unwrap(),
            display_id: "display:1".to_string().try_into().unwrap(),
        },
        cursor: CursorPolicy::Hidden,
        include_self_window_id: None,
        output: crate::model::CaptureOutputOptions {
            format: crate::model::CaptureFormat::Png,
            scale: CaptureOutputScale::NativeMax,
        },
    };
    assert_eq!(
        backend
            .capture(capture, CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "SCREENSHOT_TOPOLOGY_CHANGED"
    );

    backend.set_topology_changed(false);
    capability
        .invoke_unary("refresh", empty_refresh(), vec![], CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(backend.retained_element_count(), 0);
}

#[test]
fn capability_feature_matrix_is_exact_for_each_backend_state() {
    let cases = [
        (
            BackendSupport::macos(AccessibilityStatus::Granted),
            CapabilityState::Available,
            None,
            true,
            true,
        ),
        (
            BackendSupport::macos(AccessibilityStatus::Denied),
            CapabilityState::Available,
            None,
            true,
            false,
        ),
        (
            BackendSupport::xcap(BackendPlatform::Windows),
            CapabilityState::Degraded,
            Some("basic-backend-only"),
            false,
            false,
        ),
        (
            BackendSupport::xcap(BackendPlatform::Linux),
            CapabilityState::Degraded,
            Some("basic-backend-only"),
            false,
            false,
        ),
        (
            BackendSupport::unsupported("freebsd"),
            CapabilityState::Unavailable,
            Some("unsupported-os"),
            false,
            false,
        ),
        (
            BackendSupport::disabled(BackendPlatform::Macos),
            CapabilityState::Unavailable,
            Some("disabled-by-env"),
            false,
            false,
        ),
    ];

    for (support, state, reason, has_frames, has_ui_elements) in cases {
        let backend = Arc::new(FakeBackend::new(support, ScreenshotLimits::default()));
        let capability = ScreenshotCapability::new(backend, ScreenshotLimits::default());
        let descriptor = capability.descriptor();
        assert_eq!(descriptor.id, "screenshot.capture");
        assert_eq!(descriptor.version, "1.1.0");
        assert_eq!(descriptor.state, state);
        assert_eq!(descriptor.reason.as_deref(), reason);
        assert_eq!(
            descriptor
                .features
                .iter()
                .any(|feature| feature == "frames"),
            has_frames
        );
        assert_eq!(
            descriptor
                .features
                .iter()
                .any(|feature| feature == "ui-element-hit-test"),
            has_ui_elements
        );
        if state == CapabilityState::Degraded {
            assert_eq!(
                descriptor.features,
                vec!["display", "region", "frozen-compose"]
            );
        }
    }
}

#[tokio::test]
async fn registry_routes_probe_and_refresh_through_the_generic_capability() {
    let limits = ScreenshotLimits::default();
    let backend = Arc::new(FakeBackend::new(
        BackendSupport::macos(AccessibilityStatus::Granted),
        limits,
    ));
    let capability = Arc::new(ScreenshotCapability::new(backend, limits));
    let mut registry = CapabilityRegistry::new();
    capability.register_handlers(&mut registry).unwrap();
    let runtime = NativeRuntime::new(registry, ProtocolLimits::default());

    for (request_id, operation, payload) in [
        ("request:probe", "probe", json!({})),
        ("request:refresh", "refresh", empty_refresh()),
    ] {
        let packet = runtime
            .invoke(
                Control::Request {
                    protocol: ProtocolVersion {
                        major: PROTOCOL_MAJOR,
                        minor: PROTOCOL_MINOR,
                    },
                    request_id: request_id.to_string(),
                    capability: "screenshot.capture".to_string(),
                    operation: operation.to_string(),
                    deadline_unix_ms: None,
                    payload,
                    attachments: Vec::new(),
                },
                Vec::new(),
            )
            .await
            .unwrap();
        let Control::Response {
            ok, payload, error, ..
        } = packet.control
        else {
            panic!("expected response");
        };
        assert!(ok, "{operation}: {error:?}");
        assert!(payload.is_some());
    }
}

#[tokio::test]
async fn probe_includes_only_allowlisted_limits_and_backend_permission_states() {
    let limits = ScreenshotLimits::default();
    let backend = Arc::new(FakeBackend::new(
        BackendSupport::macos(AccessibilityStatus::Denied),
        limits,
    ));
    let capability = ScreenshotCapability::new(backend, limits);
    let OperationOutput { payload, .. } = capability
        .invoke_unary("probe", json!({}), vec![], CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(payload["engine"], "screen-capture-kit");
    assert_eq!(payload["screenRecording"], "granted");
    assert_eq!(payload["accessibility"], "denied");
    assert!(
        payload["features"]
            .as_array()
            .unwrap()
            .iter()
            .any(|feature| feature == "frozen-compose")
    );
    assert_eq!(payload["limits"]["maxWindowCandidates"], 16);
    assert!(payload["limits"].get("maxSelfProcessIds").is_none());
}
