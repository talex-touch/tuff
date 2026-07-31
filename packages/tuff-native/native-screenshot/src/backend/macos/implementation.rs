use std::sync::Arc;

use tuff_native_core::{CancellationToken, ProtocolError};

use super::actor::MacScreenActor;
use super::ax_actor::{MacAxActor, MacAxHitRequest};
use super::system::{MacOsVersion, StaticCaptureApi, availability_for, permission_probe};
use crate::backend::{
    BackendCapture, BackendFrameSource, BackendFuture, BackendProbe, BackendSupport,
    ScreenshotBackend,
};
use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{
    AccessibilityFallback, AccessibilityStatus, CaptureInput, CaptureTarget, ContentSnapshot,
    FramesInput, HitTestGranularity, HitTestInput, HitTestResult, OsVersion, PermissionStatus,
    RefreshInput,
};

pub struct MacBackend {
    actor: MacScreenActor,
    ax_actor: Option<MacAxActor>,
    version: MacOsVersion,
}

impl MacBackend {
    pub fn new(limits: ScreenshotLimits) -> Result<Self, ProtocolError> {
        let version = MacOsVersion::current()
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        let availability = availability_for(version);
        if availability.static_capture == StaticCaptureApi::Unsupported {
            return Err(ScreenshotError::Unsupported.to_protocol_error());
        }
        Ok(Self {
            actor: MacScreenActor::new(limits, availability.static_capture)?,
            ax_actor: if permission_probe().accessibility {
                MacAxActor::new(limits).ok()
            } else {
                None
            },
            version,
        })
    }

    pub fn shared(limits: ScreenshotLimits) -> Result<Arc<Self>, ProtocolError> {
        Self::new(limits).map(Arc::new)
    }
}

impl ScreenshotBackend for MacBackend {
    fn support(&self) -> BackendSupport {
        let accessibility = accessibility_status(permission_probe().accessibility);
        if self.ax_actor.is_some() {
            BackendSupport::macos(accessibility)
        } else {
            BackendSupport::macos_without_ui_elements(accessibility)
        }
    }

    fn probe(&self, cancellation: CancellationToken) -> BackendFuture<BackendProbe> {
        let version = self.version;
        Box::pin(async move {
            if cancellation.reason().is_some() {
                return Err(ProtocolError::cancelled());
            }
            let permission = permission_probe();
            let (major, minor, patch) = version.components();
            Ok(BackendProbe {
                platform: "macos".to_string(),
                os_version: Some(OsVersion {
                    major: u32::from(major),
                    minor: u32::from(minor),
                    patch: u32::from(patch),
                }),
                screen_recording: if permission.screen_recording {
                    PermissionStatus::Granted
                } else {
                    PermissionStatus::Denied
                },
                accessibility: accessibility_status(permission.accessibility),
            })
        })
    }

    fn refresh(
        &self,
        input: RefreshInput,
        cancellation: CancellationToken,
    ) -> BackendFuture<ContentSnapshot> {
        let actor = self.actor.clone();
        let ax_actor = self.ax_actor.clone();
        Box::pin(async move {
            let snapshot = actor.refresh(input, cancellation).await?;
            if let Some(ax_actor) = ax_actor {
                let _ = ax_actor.reset(snapshot.generation.clone()).await;
            }
            Ok(snapshot)
        })
    }

    fn hit_test(
        &self,
        input: HitTestInput,
        cancellation: CancellationToken,
    ) -> BackendFuture<HitTestResult> {
        let actor = self.actor.clone();
        let ax_actor = self.ax_actor.clone();
        Box::pin(async move {
            let mut result = actor.hit_test(input.clone(), cancellation.clone()).await?;
            if input.granularity != HitTestGranularity::UiElement {
                return Ok(result);
            }
            let Some(candidate) = result.candidates.first_mut() else {
                result.accessibility_fallback = None;
                return Ok(result);
            };
            let Some(ax_actor) = ax_actor else {
                result.accessibility_fallback = Some(AccessibilityFallback::PermissionDenied);
                return Ok(result);
            };
            let request = MacAxHitRequest {
                generation: result.generation.clone(),
                point: result.point,
                window_id: candidate.window.id.clone(),
                window_frame: candidate.window.global_frame,
                process_id: candidate.window.owner.process_id,
            };
            match ax_actor.hit_test(request, cancellation).await? {
                Ok(element) => {
                    candidate.element = Some(element);
                    result.accessibility_fallback = None;
                }
                Err(fallback) => result.accessibility_fallback = Some(fallback),
            }
            Ok(result)
        })
    }

    fn capture(
        &self,
        input: CaptureInput,
        cancellation: CancellationToken,
    ) -> BackendFuture<BackendCapture> {
        let actor = self.actor.clone();
        let ax_actor = self.ax_actor.clone();
        Box::pin(async move {
            let (generation, element_id) = match &input.target {
                CaptureTarget::UiElement {
                    generation,
                    element_id,
                } => (generation.clone(), element_id.clone()),
                _ => return actor.capture(input, cancellation).await,
            };
            let ax_actor = ax_actor.ok_or_else(|| {
                crate::error::ScreenshotError::ElementNotFound.to_protocol_error()
            })?;
            let rect = ax_actor
                .lookup(generation.clone(), element_id, cancellation.clone())
                .await?;
            let mut region_input = input;
            region_input.target = CaptureTarget::Region { generation, rect };
            let mut capture = actor.capture(region_input, cancellation).await?;
            capture.target_kind = "ui-element".to_string();
            Ok(capture)
        })
    }

    fn frames(
        &self,
        input: FramesInput,
        cancellation: CancellationToken,
    ) -> BackendFuture<Arc<dyn BackendFrameSource>> {
        let actor = self.actor.clone();
        Box::pin(async move { actor.frames(input, cancellation).await })
    }
}

const fn accessibility_status(granted: bool) -> AccessibilityStatus {
    if granted {
        AccessibilityStatus::Granted
    } else {
        AccessibilityStatus::Denied
    }
}
