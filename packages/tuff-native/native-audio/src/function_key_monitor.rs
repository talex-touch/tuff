use std::cell::{Cell, RefCell};
use std::collections::HashSet;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use napi::bindgen_prelude::Function;
use napi::threadsafe_function::{
    ThreadsafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::{Env, Result, Status};
use objc2::MainThreadMarker;
use objc2_core_foundation::{
    CFMachPort, CFRetained, CFRunLoop, CFRunLoopSource, kCFRunLoopCommonModes,
};
use objc2_core_graphics::{
    CGEvent, CGEventField, CGEventFlags, CGEventSource, CGEventSourceStateID, CGEventTapLocation,
    CGEventTapOptions, CGEventTapPlacement, CGEventTapProxy, CGEventType,
};

use super::FunctionKeyMonitorStart;

pub(crate) const EVENT_DOWN: u32 = 1;
pub(crate) const EVENT_DOWN_WITH_OTHER_KEYS: u32 = 2;
pub(crate) const EVENT_UP: u32 = 3;
pub(crate) const EVENT_OTHER_KEY_DOWN: u32 = 4;
pub(crate) const EVENT_RESET: u32 = 5;
pub(crate) const EVENT_ESCAPE_DOWN: u32 = 6;
pub(crate) const EVENT_ESCAPE_UP: u32 = 7;
const ESCAPE_KEY_CODE: u16 = 53;
const FUNCTION_KEY_CODE: u16 = 63;
const CALLBACK_QUEUE_CAPACITY: usize = 64;

// The callback is not error-first, is weak (must not keep Electron alive), and
// has a bounded FIFO. These generics must match the builder below exactly.
type EventCallback =
    ThreadsafeFunction<CallbackMessage, (), u32, Status, false, true, CALLBACK_QUEUE_CAPACITY>;

struct CallbackMessage {
    event: u32,
    epoch: u64,
}

#[derive(Default)]
struct CallbackState {
    disposed: AtomicBool,
    epoch: AtomicU64,
    reset_pending: AtomicBool,
}

struct MonitorState {
    callback: EventCallback,
    callbacks: Arc<CallbackState>,
    gesture: RefCell<GestureState>,
}

impl MonitorState {
    /// Returns false after a queue overflow, so one physical input cannot append
    /// a later transition behind the reset that invalidates its earlier sibling.
    fn emit(&self, event: u32) -> bool {
        let message = CallbackMessage {
            event,
            epoch: self.callbacks.epoch.load(Ordering::Acquire),
        };
        if self
            .callback
            .call(message, ThreadsafeFunctionCallMode::NonBlocking)
            == Status::QueueFull
        {
            // A full queue guarantees queued work exists. Invalidate its transitions;
            // its first JS projection becomes reset, never a stale down without up.
            self.callbacks.reset_pending.store(true, Ordering::Release);
            self.callbacks.epoch.fetch_add(1, Ordering::AcqRel);
            return false;
        }
        true
    }
}

struct MonitorHandles {
    // Box address is stable for CGEventTap's user_info, only used on this run loop.
    state: Box<MonitorState>,
    tap: CFRetained<CFMachPort>,
    source: CFRetained<CFRunLoopSource>,
    run_loop: CFRetained<CFRunLoop>,
}

impl Drop for MonitorHandles {
    fn drop(&mut self) {
        self.state.callbacks.disposed.store(true, Ordering::Release);
        CGEvent::tap_enable(&self.tap, false);
        self.run_loop
            .remove_source(Some(&self.source), unsafe { kCFRunLoopCommonModes });
        self.source.invalidate();
        self.tap.invalidate();
    }
}

thread_local! {
    static MONITOR: RefCell<Option<MonitorHandles>> = const { RefCell::new(None) };
    static CLEANUP_REGISTERED: Cell<bool> = const { Cell::new(false) };
}

#[derive(Debug, Default)]
pub(crate) struct GestureState {
    function_down: bool,
    contaminated: bool,
    suppress_function_events: bool,
    held_non_function_keys: HashSet<u16>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MonitorInput {
    FunctionFlagsChanged {
        function_down: bool,
        has_other_modifiers: bool,
    },
    KeyDown {
        key_code: u16,
    },
    KeyUp {
        key_code: u16,
    },
    OtherModifierChanged,
}

pub(crate) fn reduce_gesture(state: &mut GestureState, input: MonitorInput) -> Option<u32> {
    match input {
        MonitorInput::FunctionFlagsChanged {
            function_down,
            has_other_modifiers,
        } => {
            if function_down == state.function_down {
                return None;
            }
            state.function_down = function_down;
            if function_down {
                state.contaminated =
                    has_other_modifiers || !state.held_non_function_keys.is_empty();
                state.suppress_function_events = !state.contaminated;
                Some(if state.contaminated {
                    EVENT_DOWN_WITH_OTHER_KEYS
                } else {
                    EVENT_DOWN
                })
            } else {
                state.contaminated = false;
                state.suppress_function_events = false;
                Some(EVENT_UP)
            }
        }
        MonitorInput::KeyDown { key_code } => {
            if key_code == FUNCTION_KEY_CODE {
                return None;
            }
            state.held_non_function_keys.insert(key_code);
            if state.function_down && !state.contaminated {
                state.contaminated = true;
                Some(EVENT_OTHER_KEY_DOWN)
            } else {
                None
            }
        }
        MonitorInput::KeyUp { key_code } => {
            state.held_non_function_keys.remove(&key_code);
            None
        }
        MonitorInput::OtherModifierChanged => {
            if state.function_down && !state.contaminated {
                state.contaminated = true;
                Some(EVENT_OTHER_KEY_DOWN)
            } else {
                None
            }
        }
    }
}

/// Neutralize Fn transitions whose initial down was standalone. Combination
/// key events retain their original flags; no event is discarded.
pub(crate) fn process_input(state: &mut GestureState, input: MonitorInput) -> (Option<u32>, bool) {
    let owned = state.suppress_function_events;
    let output = reduce_gesture(state, input);
    let suppress = match input {
        MonitorInput::FunctionFlagsChanged {
            function_down: true,
            ..
        } => state.suppress_function_events,
        MonitorInput::FunctionFlagsChanged {
            function_down: false,
            ..
        } => owned,
        _ => false,
    };
    (output, suppress)
}

/// Reduces one native event to its ordered JavaScript projections without
/// allocating. Escape is deliberately a second projection of its ordinary key
/// transition: it still contaminates an in-progress Fn gesture before main sees
/// the Escape hold.
pub(crate) fn process_event(
    state: &mut GestureState,
    input: MonitorInput,
) -> ([Option<u32>; 2], bool) {
    let (function_event, suppress) = process_input(state, input);
    let escape_event = match input {
        MonitorInput::KeyDown {
            key_code: ESCAPE_KEY_CODE,
        } => Some(EVENT_ESCAPE_DOWN),
        MonitorInput::KeyUp {
            key_code: ESCAPE_KEY_CODE,
        } => Some(EVENT_ESCAPE_UP),
        _ => None,
    };
    ([function_event, escape_event], suppress)
}

pub(crate) fn forwarded_event_flags(flags: CGEventFlags, neutralize_fn: bool) -> CGEventFlags {
    if neutralize_fn {
        flags & !CGEventFlags::MaskSecondaryFn
    } else {
        flags
    }
}

unsafe extern "C-unwind" fn handle_event(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: NonNull<CGEvent>,
    user_info: *mut c_void,
) -> *mut CGEvent {
    // SAFETY: user_info points at the boxed state held by MONITOR until the tap
    // and source have been invalidated on the same main run loop.
    let state = unsafe { &*user_info.cast::<MonitorState>() };
    if event_type == CGEventType::TapDisabledByTimeout
        || event_type == CGEventType::TapDisabledByUserInput
    {
        *state.gesture.borrow_mut() = GestureState::default();
        let _ = state.emit(EVENT_RESET);
        // macOS disables slow taps. Reset the gesture before allowing fresh events.
        MONITOR.with(|monitor| {
            if let Ok(handles) = monitor.try_borrow()
                && let Some(handles) = handles.as_ref()
            {
                CGEvent::tap_enable(&handles.tap, true);
            }
        });
        return event.as_ptr();
    }
    let event_ref = unsafe { event.as_ref() };
    let key_code =
        CGEvent::integer_value_field(Some(event_ref), CGEventField::KeyboardEventKeycode) as u16;
    let flags = CGEvent::flags(Some(event_ref));
    let input = match event_type {
        CGEventType::FlagsChanged if key_code == FUNCTION_KEY_CODE => {
            MonitorInput::FunctionFlagsChanged {
                function_down: flags.contains(CGEventFlags::MaskSecondaryFn),
                has_other_modifiers: flags.intersects(
                    CGEventFlags::MaskShift
                        | CGEventFlags::MaskControl
                        | CGEventFlags::MaskAlternate
                        | CGEventFlags::MaskCommand,
                ),
            }
        }
        CGEventType::FlagsChanged => MonitorInput::OtherModifierChanged,
        CGEventType::KeyDown => MonitorInput::KeyDown { key_code },
        CGEventType::KeyUp => MonitorInput::KeyUp { key_code },
        _ => return event.as_ptr(),
    };
    let (outputs, suppress) = process_event(&mut state.gesture.borrow_mut(), input);
    let can_project_escape = match outputs[0] {
        Some(output) => state.emit(output),
        None => true,
    };
    // Escape is observed globally, never consumed. It is projected after the Fn
    // reducer's contamination notification, so Fn+Escape reaches JavaScript in
    // source order without swallowing the foreground application's Escape key.
    if can_project_escape {
        if let Some(escape_event) = outputs[1] {
            let _ = state.emit(escape_event);
        }
    }
    // Project the original Fn edge above before removing its system-action flag.
    // Dropping the entire event still opened Character Viewer in physical testing;
    // forwarding the neutralized state transition prevents that default action.
    CGEvent::set_flags(Some(event_ref), forwarded_event_flags(flags, suppress));
    event.as_ptr()
}

pub fn start(env: Env, callback: Function<'_, u32, ()>) -> Result<FunctionKeyMonitorStart> {
    if MainThreadMarker::new().is_none() {
        return Ok(inactive("main-thread-required"));
    }
    stop();
    if !super::is_accessibility_trusted() {
        return Ok(inactive("accessibility-required"));
    }
    if !CLEANUP_REGISTERED.with(Cell::get) {
        env.add_env_cleanup_hook((), |_| {
            stop();
            CLEANUP_REGISTERED.with(|registered| registered.set(false));
        })?;
        CLEANUP_REGISTERED.with(|registered| registered.set(true));
    }
    let callbacks = Arc::new(CallbackState::default());
    let projection = Arc::clone(&callbacks);
    let callback = callback
        .build_threadsafe_function::<CallbackMessage>()
        .callee_handled::<false>()
        .weak::<true>()
        .max_queue_size::<CALLBACK_QUEUE_CAPACITY>()
        .build_callback(move |context: ThreadsafeCallContext<CallbackMessage>| {
            if projection.disposed.load(Ordering::Acquire) {
                return Ok(0);
            }
            if context.value.epoch != projection.epoch.load(Ordering::Acquire) {
                return Ok(if projection.reset_pending.swap(false, Ordering::AcqRel) {
                    EVENT_RESET
                } else {
                    0
                });
            }
            Ok(context.value.event)
        })?;
    let source_state = CGEventSourceStateID::CombinedSessionState;
    let mut gesture = GestureState {
        function_down: CGEventSource::key_state(source_state, FUNCTION_KEY_CODE),
        ..GestureState::default()
    };
    for key_code in 0..128 {
        if !(54..=63).contains(&key_code) && CGEventSource::key_state(source_state, key_code) {
            gesture.held_non_function_keys.insert(key_code);
        }
    }
    let mut state = Box::new(MonitorState {
        callback,
        callbacks,
        gesture: RefCell::new(gesture),
    });
    let mask = (1_u64 << CGEventType::FlagsChanged.0)
        | (1_u64 << CGEventType::KeyDown.0)
        | (1_u64 << CGEventType::KeyUp.0);
    // Use the HID entry point verified by the physical Fn neutralization probe.
    // No Session fallback: keep the tested event-rewriting boundary explicit.
    // SAFETY: callback always returns the original event; boxed state outlives
    // the tap. Fn state is read before its system-action flag is cleared.
    let Some(tap) = (unsafe {
        CGEvent::tap_create(
            CGEventTapLocation::HIDEventTap,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            mask,
            Some(handle_event),
            (&mut *state as *mut MonitorState).cast(),
        )
    }) else {
        return Ok(inactive("hid-event-tap-registration-failed"));
    };
    let Some(source) = CFMachPort::new_run_loop_source(None, Some(&tap), 0) else {
        tap.invalidate();
        return Ok(inactive("run-loop-source-unavailable"));
    };
    let Some(run_loop) = CFRunLoop::main() else {
        source.invalidate();
        tap.invalidate();
        return Ok(inactive("main-run-loop-unavailable"));
    };
    run_loop.add_source(Some(&source), unsafe { kCFRunLoopCommonModes });
    CGEvent::tap_enable(&tap, true);
    let handles = MonitorHandles {
        state,
        tap,
        source,
        run_loop,
    };
    if !CGEvent::tap_is_enabled(&handles.tap) {
        return Ok(inactive("event-tap-disabled"));
    }
    MONITOR.with(|monitor| *monitor.borrow_mut() = Some(handles));
    Ok(FunctionKeyMonitorStart {
        active: true,
        reason: None,
    })
}

pub fn stop() {
    if MainThreadMarker::new().is_none() {
        return;
    }
    let handles = MONITOR.with(|monitor| monitor.borrow_mut().take());
    drop(handles);
}

fn inactive(reason: &str) -> FunctionKeyMonitorStart {
    FunctionKeyMonitorStart {
        active: false,
        reason: Some(reason.to_string()),
    }
}
