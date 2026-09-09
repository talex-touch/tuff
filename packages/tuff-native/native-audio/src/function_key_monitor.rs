use std::cell::{Cell, RefCell};
use std::collections::HashSet;
use std::ffi::c_void;
use std::ptr::{NonNull, null_mut};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use napi::bindgen_prelude::Function;
use napi::threadsafe_function::{
    ThreadsafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::{Env, Result, Status};
use objc2::MainThreadMarker;
use objc2_core_foundation::{
    CFArray, CFDictionary, CFMachPort, CFNumber, CFRetained, CFRunLoop, CFRunLoopSource, CFString,
    Type, kCFRunLoopCommonModes,
};
use objc2_core_graphics::{
    CGEvent, CGEventField, CGEventFlags, CGEventSourceStateID, CGEventTapLocation,
    CGEventTapOptions, CGEventTapPlacement, CGEventTapProxy, CGEventType,
};
use objc2_io_kit::{
    IOHIDDevice, IOHIDElement, IOHIDElementType, IOHIDManager, IOHIDValue, kIOReturnSuccess,
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
const HID_USAGE_PAGE_GENERIC_DESKTOP: u32 = 0x01;
const HID_USAGE_GENERIC_DESKTOP_KEYBOARD: u32 = 0x06;
const HID_USAGE_PAGE_KEYBOARD_OR_KEYPAD: u32 = 0x07;
const HID_USAGE_KEYBOARD_FIRST_REAL_KEY: u32 = 0x04;
const HID_USAGE_KEYBOARD_LEFT_CONTROL: u32 = 0xE0;
const HID_USAGE_KEYBOARD_RIGHT_GUI: u32 = 0xE7;
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

struct PhysicalKeyboardDevice {
    device: CFRetained<IOHIDDevice>,
    elements: Vec<CFRetained<IOHIDElement>>,
}

struct PhysicalKeyboardState {
    manager: CFRetained<IOHIDManager>,
    run_loop: CFRetained<CFRunLoop>,
    keyboards: Vec<PhysicalKeyboardDevice>,
}

impl PhysicalKeyboardState {
    fn new(run_loop: &CFRunLoop) -> Option<Self> {
        let run_loop_mode = (unsafe { kCFRunLoopCommonModes })?;
        let device_usage_page_key = CFString::from_str("DeviceUsagePage");
        let device_usage_key = CFString::from_str("DeviceUsage");
        let device_usage_page = CFNumber::new_isize(HID_USAGE_PAGE_GENERIC_DESKTOP as isize);
        let device_usage = CFNumber::new_isize(HID_USAGE_GENERIC_DESKTOP_KEYBOARD as isize);
        let matching = CFDictionary::<CFString, CFNumber>::from_slices(
            &[device_usage_page_key.as_ref(), device_usage_key.as_ref()],
            &[device_usage_page.as_ref(), device_usage.as_ref()],
        );
        let manager = IOHIDManager::new(None, 0);
        // SAFETY: This typed CFDictionary contains the exact IOKit matching keys
        // and numeric values required by IOHIDManagerSetDeviceMatching.
        unsafe {
            manager.set_device_matching(Some(matching.as_ref()));
            manager.schedule_with_run_loop(run_loop, run_loop_mode);
        }
        if manager.open(0) != kIOReturnSuccess {
            unsafe { manager.unschedule_from_run_loop(run_loop, run_loop_mode) };
            return None;
        }

        Some(Self {
            manager,
            run_loop: run_loop.retain(),
            keyboards: Vec::new(),
        })
    }
    fn collect_keyboards(manager: &IOHIDManager) -> Vec<PhysicalKeyboardDevice> {
        let Some(devices) = manager.devices() else {
            return Vec::new();
        };
        let device_count = devices.count();
        if device_count <= 0 {
            return Vec::new();
        }

        let mut raw_devices = vec![std::ptr::null(); device_count as usize];
        // SAFETY: The vector has exactly CFSetGetCount pointer slots, and the
        // retained CFSet keeps every returned device alive during this loop.
        unsafe { devices.values(raw_devices.as_mut_ptr()) };

        let mut keyboards = Vec::new();
        for raw_device in raw_devices {
            // SAFETY: IOHIDManagerCopyDevices returns only IOHIDDeviceRef values.
            let Some(device) = (unsafe { raw_device.cast::<IOHIDDevice>().as_ref() }) else {
                continue;
            };
            if !device.conforms_to(
                HID_USAGE_PAGE_GENERIC_DESKTOP,
                HID_USAGE_GENERIC_DESKTOP_KEYBOARD,
            ) {
                continue;
            }

            // SAFETY: A null element dictionary returns the device's own retained
            // IOHIDElementRef objects; the typed view matches that API contract.
            let Some(elements) = (unsafe { device.matching_elements(None, 0) }) else {
                continue;
            };
            let elements: &CFArray<IOHIDElement> = unsafe { elements.cast_unchecked() };
            let elements = elements
                .iter()
                .filter(|element| Self::is_keyboard_input_element(element))
                .collect::<Vec<_>>();
            if elements.is_empty() {
                continue;
            }

            keyboards.push(PhysicalKeyboardDevice {
                device: device.retain(),
                elements,
            });
        }
        keyboards
    }

    fn is_keyboard_input_element(element: &IOHIDElement) -> bool {
        if element.is_virtual() || element.usage_page() != HID_USAGE_PAGE_KEYBOARD_OR_KEYPAD {
            return false;
        }
        let element_type = element.r#type();
        let is_input = element_type == IOHIDElementType::Input_Misc
            || element_type == IOHIDElementType::Input_Button
            || element_type == IOHIDElementType::Input_Axis
            || element_type == IOHIDElementType::Input_ScanCodes;
        is_input && (element.is_array() || Self::is_non_modifier_usage(element.usage()))
    }

    fn is_non_modifier_usage(usage: u32) -> bool {
        usage >= HID_USAGE_KEYBOARD_FIRST_REAL_KEY
            && !(HID_USAGE_KEYBOARD_LEFT_CONTROL..=HID_USAGE_KEYBOARD_RIGHT_GUI).contains(&usage)
    }

    fn read_cached_non_modifier_state(&self) -> Option<bool> {
        let mut saw_readable_element = false;
        for keyboard in &self.keyboards {
            for element in &keyboard.elements {
                let mut value = NonNull::<IOHIDValue>::dangling();
                // SAFETY: `value` is valid writable pointer storage. Input element
                // reads are synchronous; the returned value is consumed immediately.
                if unsafe { keyboard.device.value(element, NonNull::from(&mut value)) }
                    != kIOReturnSuccess
                {
                    continue;
                }
                saw_readable_element = true;
                let raw_value = unsafe { value.as_ref() }.integer_value();
                let usage = if element.is_array() {
                    let Ok(usage) = u32::try_from(raw_value) else {
                        continue;
                    };
                    usage
                } else {
                    if raw_value == 0 {
                        continue;
                    }
                    element.usage()
                };
                if Self::is_non_modifier_usage(usage) {
                    return Some(true);
                }
            }
        }
        saw_readable_element.then_some(false)
    }

    fn read_non_modifier_state(&mut self) -> Option<bool> {
        if self.keyboards.is_empty() {
            self.keyboards = Self::collect_keyboards(&self.manager);
        }
        if let Some(state) = self.read_cached_non_modifier_state() {
            return Some(state);
        }

        // A device may have disappeared after enumeration. Refresh once; an
        // unreadable state remains unknown and is treated as a combination.
        self.keyboards = Self::collect_keyboards(&self.manager);
        self.read_cached_non_modifier_state()
    }
}

impl Drop for PhysicalKeyboardState {
    fn drop(&mut self) {
        if let Some(run_loop_mode) = unsafe { kCFRunLoopCommonModes } {
            unsafe {
                self.manager
                    .unschedule_from_run_loop(&self.run_loop, run_loop_mode);
            }
        }
        let _ = self.manager.close(0);
    }
}
struct MonitorState {
    callback: EventCallback,
    callbacks: Arc<CallbackState>,
    gesture: RefCell<GestureState>,
    // IOHID is best-effort at startup. When it is unavailable, the event tap still
    // protects the common standalone-Fn path and tracks every key edge after startup.
    physical_keyboard: RefCell<Option<PhysicalKeyboardState>>,
    escape_capture_enabled: AtomicBool,
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
        has_other_keys: bool,
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
            has_other_keys,
        } => {
            if function_down == state.function_down {
                return None;
            }
            state.function_down = function_down;
            if function_down {
                state.contaminated = has_other_keys || !state.held_non_function_keys.is_empty();
                state.suppress_function_events = !state.contaminated;
                Some(if state.contaminated {
                    EVENT_DOWN_WITH_OTHER_KEYS
                } else {
                    EVENT_DOWN
                })
            } else {
                state.contaminated = false;
                state.suppress_function_events = false;
                // Drain the held set on every Fn release.
                //
                // It only ever shrank on KeyUp, so a single down whose up the tap never
                // saw stayed in the set forever — and `contaminated` above is computed
                // from `!held_non_function_keys.is_empty()`, so from that moment on every
                // Fn press was classified as a combination and the tap gesture stopped
                // working entirely. Missing an up is routine: another tap can consume the
                // event, the app can lose focus mid-chord, or the tap can be re-enabled
                // after macOS disabled it for being slow.
                //
                // Fn being up is the one moment the physical truth is knowable without
                // guessing: whatever is still in the set is stale by definition, because
                // the next gesture starts from here.
                state.held_non_function_keys.clear();
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
/// Returns true only for a standalone Fn transition that must not reach macOS's
/// default Globe/Emoji action. The JavaScript projection has already happened;
/// this controls the OS event stream separately.
pub(crate) fn should_suppress_function_event(input: MonitorInput, suppress: bool) -> bool {
    suppress && matches!(input, MonitorInput::FunctionFlagsChanged { .. })
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
pub(crate) fn should_suppress_escape(capture_enabled: bool, input: MonitorInput) -> bool {
    capture_enabled
        && matches!(
            input,
            MonitorInput::KeyDown {
                key_code: ESCAPE_KEY_CODE
            } | MonitorInput::KeyUp {
                key_code: ESCAPE_KEY_CODE
            }
        )
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
    // Our own synthetic keystrokes are not user input.
    //
    // Voice delivery types the transcript with `enigo`, which posts one CGEvent per
    // character through this very tap. Unfiltered, a 200-character transcript looked
    // like 200 real keypresses: each one landed in `held_non_function_keys`, and any
    // whose key-up the tap missed left the set permanently non-empty — which makes
    // `reduce_gesture` classify every later Fn press as a combination and kills the
    // tap-to-stop gesture until the app restarts.
    //
    // Real hardware carries `HIDSystemState`. enigo 0.6 builds its source with
    // `Private` or `CombinedSessionState` and never with `HIDSystemState`, so this
    // discriminates exactly, and it is the honest test either way: an event we posted
    // ourselves should never drive a gesture that means "the user pressed something".
    if CGEvent::integer_value_field(Some(event_ref), CGEventField::EventSourceStateID)
        != CGEventSourceStateID::HIDSystemState.0 as i64
    {
        return event.as_ptr();
    }
    let key_code =
        CGEvent::integer_value_field(Some(event_ref), CGEventField::KeyboardEventKeycode) as u16;
    let flags = CGEvent::flags(Some(event_ref));
    let input = match event_type {
        CGEventType::FlagsChanged if key_code == FUNCTION_KEY_CODE => {
            let function_down = flags.contains(CGEventFlags::MaskSecondaryFn);
            let physical_has_other_keys = if function_down {
                match state.physical_keyboard.borrow_mut().as_mut() {
                    // A live IOHID manager that cannot answer is unknown; preserve the
                    // fail-closed combination policy for this case.
                    Some(physical) => physical.read_non_modifier_state().unwrap_or(true),
                    // Startup IOHID enumeration can be unavailable on macOS. The event tap
                    // starts with an empty edge set, so allow standalone Fn while retaining
                    // all keydown/up edges observed after the tap was installed.
                    None => !state.gesture.borrow().held_non_function_keys.is_empty(),
                }
            } else {
                false
            };
            let has_other_keys = flags.intersects(
                CGEventFlags::MaskShift
                    | CGEventFlags::MaskControl
                    | CGEventFlags::MaskAlternate
                    | CGEventFlags::MaskCommand,
            ) || physical_has_other_keys;
            MonitorInput::FunctionFlagsChanged {
                function_down,
                has_other_keys,
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
    if can_project_escape && let Some(escape_event) = outputs[1] {
        let _ = state.emit(escape_event);
    }
    // Project the original Fn edge to the Voice controller, then remove only
    // standalone Fn transitions from the OS event stream. Combination Fn events
    // are forwarded unchanged so the user's normal shortcut semantics survive.
    if should_suppress_function_event(input, suppress) {
        return null_mut();
    }
    if should_suppress_escape(state.escape_capture_enabled.load(Ordering::Acquire), input) {
        return null_mut();
    }
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
    let Some(run_loop) = CFRunLoop::main() else {
        return Ok(inactive("main-run-loop-unavailable"));
    };
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
    // IOHID is an enhancement for keys held before startup, not a prerequisite for
    // the event tap. Some macOS launches cannot open IOHIDManager immediately; the
    // event tap still sees all key edges after startup and must suppress standalone Fn.
    let physical_keyboard = PhysicalKeyboardState::new(&run_loop);
    let gesture = GestureState::default();
    let mut state = Box::new(MonitorState {
        callback,
        callbacks,
        gesture: RefCell::new(gesture),
        physical_keyboard: RefCell::new(physical_keyboard),
        escape_capture_enabled: AtomicBool::new(false),
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

pub fn set_escape_capture(enabled: bool) -> bool {
    if MainThreadMarker::new().is_none() {
        return false;
    }
    MONITOR.with(|monitor| {
        let handles = monitor.borrow();
        let Some(handles) = handles.as_ref() else {
            return false;
        };
        handles
            .state
            .escape_capture_enabled
            .store(enabled, Ordering::Release);
        true
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
