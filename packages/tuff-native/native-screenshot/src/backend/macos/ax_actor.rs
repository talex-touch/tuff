use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, SyncSender, TrySendError, sync_channel};
use std::sync::{Arc, Mutex};
use std::thread;

use tokio::sync::oneshot;
use tuff_native_core::{CancellationToken, ProtocolError};

use super::system::{MacAxElementHandle, MacAxFailure, hit_test_element};
use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{
    AccessibilityFallback, DescriptorId, GlobalDipPoint, GlobalDipRect, UiElementDescriptor,
};

const AX_QUEUE_CAPACITY: usize = 16;

#[derive(Clone)]
pub struct MacAxActor {
    inner: Arc<AxActorInner>,
}

struct AxActorInner {
    sender: SyncSender<AxCommand>,
    closed: AtomicBool,
    /// The generation the producer last asked for, whether or not the Reset command was accepted.
    ///
    /// The mailbox holds 16 commands and `submit` is a `try_send`, so a Reset issued while the AX
    /// thread is mid-call is refused. That refusal used to be discarded at the call site, leaving
    /// the AX actor on generation N-1 while the screen actor advanced to N — every later hit test
    /// then failed the generation check and silently degraded to `UnverifiedWindow`, with the
    /// stale element map never cleared (#852).
    ///
    /// Recording the intent here makes the reset independent of mailbox pressure: the actor adopts
    /// it on the next command it handles, whichever that is.
    pending_generation: Arc<Mutex<Option<DescriptorId>>>,
}

pub struct MacAxHitRequest {
    pub generation: DescriptorId,
    pub point: GlobalDipPoint,
    pub window_id: DescriptorId,
    pub window_frame: GlobalDipRect,
    pub process_id: u32,
}

enum AxCommand {
    Reset {
        generation: DescriptorId,
        response: oneshot::Sender<()>,
    },
    HitTest {
        request: MacAxHitRequest,
        cancellation: CancellationToken,
        response: oneshot::Sender<Result<UiElementDescriptor, AccessibilityFallback>>,
    },
    Lookup {
        generation: DescriptorId,
        element_id: DescriptorId,
        response: oneshot::Sender<Result<GlobalDipRect, ProtocolError>>,
    },
    Shutdown,
}

struct AxActorState {
    limits: ScreenshotLimits,
    generation: Option<DescriptorId>,
    element_counter: u64,
    elements: HashMap<DescriptorId, MacAxElementHandle>,
}

impl MacAxActor {
    pub fn new(limits: ScreenshotLimits) -> Result<Self, ProtocolError> {
        let (sender, receiver) = sync_channel(AX_QUEUE_CAPACITY);
        let pending_generation = Arc::new(Mutex::new(None));
        let actor_pending = Arc::clone(&pending_generation);
        thread::Builder::new()
            .name(format!("tuff-macos-ax-{}", std::process::id()))
            .spawn(move || ax_actor_main(receiver, limits, actor_pending))
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
        Ok(Self {
            inner: Arc::new(AxActorInner {
                sender,
                closed: AtomicBool::new(false),
                pending_generation,
            }),
        })
    }

    pub async fn reset(&self, generation: DescriptorId) -> Result<(), ProtocolError> {
        // Recorded before the command is offered, so a refused Reset still takes effect.
        *lock_pending(&self.inner.pending_generation) = Some(generation.clone());

        let (response, receiver) = oneshot::channel();
        if self
            .submit(AxCommand::Reset {
                generation,
                response,
            })
            .is_err()
        {
            // A closed actor is a real failure; a full mailbox is not, because the generation
            // above is what the actor adopts next.
            return if self.inner.closed.load(Ordering::Acquire) {
                Err(ScreenshotError::BackendFailed.to_protocol_error())
            } else {
                Ok(())
            };
        }
        receiver
            .await
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())
    }

    pub async fn hit_test(
        &self,
        request: MacAxHitRequest,
        cancellation: CancellationToken,
    ) -> Result<Result<UiElementDescriptor, AccessibilityFallback>, ProtocolError> {
        let (response, receiver) = oneshot::channel();
        if self
            .submit(AxCommand::HitTest {
                request,
                cancellation: cancellation.clone(),
                response,
            })
            .is_err()
        {
            return Ok(Err(AccessibilityFallback::Timeout));
        }
        tokio::select! {
            biased;
            result = receiver => result
                .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error()),
            _ = cancellation.cancelled() => Err(ProtocolError::cancelled()),
        }
    }

    pub async fn lookup(
        &self,
        generation: DescriptorId,
        element_id: DescriptorId,
        cancellation: CancellationToken,
    ) -> Result<GlobalDipRect, ProtocolError> {
        let (response, receiver) = oneshot::channel();
        self.submit(AxCommand::Lookup {
            generation,
            element_id,
            response,
        })
        .map_err(|_| ScreenshotError::BackendBusy.to_protocol_error())?;
        tokio::select! {
            result = receiver => result
                .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?,
            _ = cancellation.cancelled() => Err(ProtocolError::cancelled()),
        }
    }

    fn submit(&self, command: AxCommand) -> Result<(), ()> {
        if self.inner.closed.load(Ordering::Acquire) {
            return Err(());
        }
        match self.inner.sender.try_send(command) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => Err(()),
            Err(TrySendError::Disconnected(_)) => {
                self.inner.closed.store(true, Ordering::Release);
                Err(())
            }
        }
    }
}

impl Drop for AxActorInner {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::Release);
        let _ = self.sender.try_send(AxCommand::Shutdown);
    }
}

fn lock_pending(
    slot: &Mutex<Option<DescriptorId>>,
) -> std::sync::MutexGuard<'_, Option<DescriptorId>> {
    slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn ax_actor_main(
    receiver: Receiver<AxCommand>,
    limits: ScreenshotLimits,
    pending_generation: Arc<Mutex<Option<DescriptorId>>>,
) {
    let mut state = AxActorState {
        limits,
        generation: None,
        element_counter: 0,
        elements: HashMap::new(),
    };
    while let Ok(command) = receiver.recv() {
        // Adopt a generation whose Reset command never made it into the mailbox. Doing this
        // before every command rather than only on HitTest keeps the rule in one place, and it is
        // a no-op when the Reset did land, since the slot then already matches.
        state.adopt_pending_generation(lock_pending(&pending_generation).as_ref());
        match command {
            AxCommand::Reset {
                generation,
                response,
            } => {
                state.generation = Some(generation);
                state.element_counter = 0;
                state.elements.clear();
                let _ = response.send(());
            }
            AxCommand::HitTest {
                request,
                cancellation,
                response,
            } => match state.prepare_hit_test(request, &cancellation) {
                Ok(prepared) => {
                    let PreparedAxElement {
                        descriptor,
                        id,
                        handle,
                        element_counter,
                    } = prepared;
                    if response.send(Ok(descriptor)).is_ok() {
                        state.element_counter = element_counter;
                        state.elements.insert(id, handle);
                    }
                }
                Err(fallback) => {
                    let _ = response.send(Err(fallback));
                }
            },
            AxCommand::Lookup {
                generation,
                element_id,
                response,
            } => {
                let _ = response.send(state.lookup(&generation, &element_id));
            }
            AxCommand::Shutdown => break,
        }
    }
}

struct PreparedAxElement {
    descriptor: UiElementDescriptor,
    id: DescriptorId,
    handle: MacAxElementHandle,
    element_counter: u64,
}

impl AxActorState {
    /// Takes on a generation the producer recorded, dropping the element map that belonged to the
    /// previous one.
    ///
    /// Same effect as handling a `Reset`, reached from the pending slot instead of the mailbox, so
    /// a Reset refused while the AX thread was busy still lands (#852). A matching or absent
    /// generation is a no-op — it must not clear a map that is still current.
    fn adopt_pending_generation(&mut self, pending: Option<&DescriptorId>) {
        let Some(generation) = pending else {
            return;
        };
        if self.generation.as_ref() == Some(generation) {
            return;
        }
        self.generation = Some(generation.clone());
        self.element_counter = 0;
        self.elements.clear();
    }

    fn prepare_hit_test(
        &self,
        request: MacAxHitRequest,
        cancellation: &CancellationToken,
    ) -> Result<PreparedAxElement, AccessibilityFallback> {
        if self.generation.as_ref() != Some(&request.generation) {
            return Err(AccessibilityFallback::UnverifiedWindow);
        }
        if !has_element_capacity(self.elements.len(), self.limits.max_ax_elements()) {
            return Err(AccessibilityFallback::Unsupported);
        }
        if cancellation.reason().is_some() {
            return Err(AccessibilityFallback::Timeout);
        }
        let data = hit_test_element(
            objc2_core_foundation::CGPoint::new(request.point.x(), request.point.y()),
            request.process_id,
            objc2_core_foundation::CGRect::new(
                objc2_core_foundation::CGPoint::new(
                    request.window_frame.x(),
                    request.window_frame.y(),
                ),
                objc2_core_foundation::CGSize::new(
                    request.window_frame.width(),
                    request.window_frame.height(),
                ),
            ),
            self.limits.ax_call_timeout_ms() as f32 / 1000.0,
        )
        .map_err(map_ax_failure)?;
        if cancellation.reason().is_some() {
            return Err(AccessibilityFallback::Timeout);
        }
        let frame = GlobalDipRect::new(
            data.frame.origin.x,
            data.frame.origin.y,
            data.frame.size.width,
            data.frame.size.height,
        )
        .map_err(|_| AccessibilityFallback::Unsupported)?;
        let element_counter = self
            .element_counter
            .checked_add(1)
            .ok_or(AccessibilityFallback::Unsupported)?;
        let id = DescriptorId::new(format!(
            "element:mac:{}:{}",
            request.generation.as_str(),
            element_counter
        ))
        .map_err(|_| AccessibilityFallback::Unsupported)?;
        let handle = data.retained_handle();
        let descriptor = UiElementDescriptor {
            id: id.clone(),
            window_id: request.window_id,
            role: data.role,
            subrole: data.subrole,
            global_frame: frame,
            enabled: data.enabled,
            focused: data.focused,
        };
        Ok(PreparedAxElement {
            descriptor,
            id,
            handle,
            element_counter,
        })
    }

    fn lookup(
        &self,
        generation: &DescriptorId,
        element_id: &DescriptorId,
    ) -> Result<GlobalDipRect, ProtocolError> {
        if self.generation.as_ref() != Some(generation) {
            return Err(ScreenshotError::StaleGeneration.to_protocol_error());
        }
        let element = self
            .elements
            .get(element_id)
            .ok_or_else(|| ScreenshotError::ElementNotFound.to_protocol_error())?;
        GlobalDipRect::new(
            element.frame.origin.x,
            element.frame.origin.y,
            element.frame.size.width,
            element.frame.size.height,
        )
        .map_err(|_| ScreenshotError::ElementNotFound.to_protocol_error())
    }
}

const fn has_element_capacity(current: usize, maximum: usize) -> bool {
    current < maximum
}

const fn map_ax_failure(failure: MacAxFailure) -> AccessibilityFallback {
    match failure {
        MacAxFailure::PermissionDenied => AccessibilityFallback::PermissionDenied,
        MacAxFailure::Timeout => AccessibilityFallback::Timeout,
        MacAxFailure::Unsupported => AccessibilityFallback::Unsupported,
        MacAxFailure::UnverifiedWindow => AccessibilityFallback::UnverifiedWindow,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state_at(generation: Option<&str>) -> AxActorState {
        AxActorState {
            limits: ScreenshotLimits::default(),
            generation: generation.map(|id| DescriptorId::new(id).unwrap()),
            element_counter: 7,
            elements: HashMap::new(),
        }
    }

    /// A generation the mailbox refused still takes effect.
    ///
    /// This is the #852 defect: `reset()` discarded a `BackendBusy` from a full mailbox, so the AX
    /// actor stayed on N-1 while the screen actor advanced to N. Every later `prepare_hit_test`
    /// then failed its generation check and degraded to `UnverifiedWindow` with no error surfaced,
    /// and the element map for the old generation was never dropped.
    #[test]
    fn a_pending_generation_is_adopted_and_clears_the_old_elements() {
        let mut state = state_at(Some("generation:mac:n-1"));
        let next = DescriptorId::new("generation:mac:n").unwrap();

        state.adopt_pending_generation(Some(&next));

        assert_eq!(state.generation.as_ref(), Some(&next));
        assert_eq!(state.element_counter, 0);
        assert!(state.elements.is_empty());
    }

    /// The Reset landed normally, so the slot matches and there is nothing to do.
    ///
    /// Without this the rule above is satisfied by clearing unconditionally, which would drop a
    /// live element map on every command the actor handles.
    #[test]
    fn a_matching_pending_generation_leaves_the_state_alone() {
        let mut state = state_at(Some("generation:mac:n"));
        let same = DescriptorId::new("generation:mac:n").unwrap();

        state.adopt_pending_generation(Some(&same));

        assert_eq!(
            state.element_counter, 7,
            "a matching generation cleared the state"
        );
    }

    #[test]
    fn no_pending_generation_leaves_the_state_alone() {
        let mut state = state_at(Some("generation:mac:n"));

        state.adopt_pending_generation(None);

        assert_eq!(state.element_counter, 7);
        assert_eq!(
            state.generation,
            Some(DescriptorId::new("generation:mac:n").unwrap())
        );
    }

    #[test]
    fn cancelled_hit_does_not_consume_element_capacity_or_counter() {
        let generation = DescriptorId::new("generation:mac:test").unwrap();
        let state = AxActorState {
            limits: ScreenshotLimits::default(),
            generation: Some(generation.clone()),
            element_counter: 0,
            elements: HashMap::new(),
        };
        let cancellation = CancellationToken::new();
        cancellation.cancel(tuff_native_core::CancelReason::Caller);
        let result = state.prepare_hit_test(
            MacAxHitRequest {
                generation,
                point: GlobalDipPoint::new(10.0, 10.0).unwrap(),
                window_id: DescriptorId::new("window:mac:test").unwrap(),
                window_frame: GlobalDipRect::new(0.0, 0.0, 100.0, 100.0).unwrap(),
                process_id: std::process::id(),
            },
            &cancellation,
        );
        assert_eq!(result.err(), Some(AccessibilityFallback::Timeout));
        assert_eq!(state.element_counter, 0);
        assert!(state.elements.is_empty());
    }

    #[test]
    fn ax_failure_mapping_is_complete_and_element_capacity_is_bounded() {
        assert_eq!(
            map_ax_failure(MacAxFailure::PermissionDenied),
            AccessibilityFallback::PermissionDenied
        );
        assert_eq!(
            map_ax_failure(MacAxFailure::Timeout),
            AccessibilityFallback::Timeout
        );
        assert_eq!(
            map_ax_failure(MacAxFailure::Unsupported),
            AccessibilityFallback::Unsupported
        );
        assert_eq!(
            map_ax_failure(MacAxFailure::UnverifiedWindow),
            AccessibilityFallback::UnverifiedWindow
        );
        assert!(has_element_capacity(511, 512));
        assert!(!has_element_capacity(512, 512));
    }
}
