use crate::function_key_monitor::{
    EVENT_DOWN, EVENT_DOWN_WITH_OTHER_KEYS, EVENT_ESCAPE_DOWN, EVENT_ESCAPE_UP,
    EVENT_OTHER_KEY_DOWN, EVENT_UP, GestureState, MonitorInput, forwarded_event_flags,
    process_event, reduce_gesture,
};
use objc2_core_graphics::CGEventFlags;

#[test]
fn standalone_fn_emits_a_tap_pair() {
    let mut state = GestureState::default();

    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_DOWN),
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_UP),
    );
}

#[test]
fn modifier_combo_stays_contaminated_when_its_other_key_releases_first() {
    let mut state = GestureState::default();

    assert_eq!(
        reduce_gesture(&mut state, MonitorInput::KeyDown { key_code: 55 }),
        None,
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_DOWN_WITH_OTHER_KEYS),
    );
    assert_eq!(
        reduce_gesture(&mut state, MonitorInput::KeyUp { key_code: 55 }),
        None,
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_UP),
    );
}

#[test]
fn other_key_during_fn_stops_the_gesture_and_the_next_fn_press_is_clean() {
    let mut state = GestureState::default();

    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_DOWN),
    );
    assert_eq!(
        reduce_gesture(&mut state, MonitorInput::KeyDown { key_code: 12 }),
        Some(EVENT_OTHER_KEY_DOWN),
    );
    assert_eq!(
        reduce_gesture(&mut state, MonitorInput::KeyUp { key_code: 12 }),
        None,
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_UP),
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: false,
            },
        ),
        Some(EVENT_DOWN),
    );
}

#[test]
fn only_standalone_fn_transitions_are_marked_for_flag_neutralization() {
    let preserved_flags =
        CGEventFlags::MaskAlphaShift | CGEventFlags::MaskShift | CGEventFlags::MaskCommand;
    let mut standalone = GestureState::default();
    let (down_events, neutralize_down) = process_event(
        &mut standalone,
        MonitorInput::FunctionFlagsChanged {
            function_down: true,
            has_other_modifiers: false,
        },
    );
    assert_eq!(down_events, [Some(EVENT_DOWN), None]);
    assert!(neutralize_down);
    assert_eq!(
        forwarded_event_flags(preserved_flags | CGEventFlags::MaskSecondaryFn, neutralize_down),
        preserved_flags,
    );
    assert_eq!(
        process_event(&mut standalone, MonitorInput::KeyDown { key_code: 12 }),
        ([Some(EVENT_OTHER_KEY_DOWN), None], false),
    );
    // The down transition remains marked for neutralization through its matching up,
    // even after a letter invalidates the voice gesture. The letter stays untouched.
    let (up_events, neutralize_up) = process_event(
        &mut standalone,
        MonitorInput::FunctionFlagsChanged {
            function_down: false,
            has_other_modifiers: false,
        },
    );
    assert_eq!(up_events, [Some(EVENT_UP), None]);
    assert!(neutralize_up);
    assert_eq!(
        forwarded_event_flags(preserved_flags, neutralize_up),
        preserved_flags,
    );

    let mut combo = GestureState::default();
    let (combo_events, neutralize_combo) = process_event(
        &mut combo,
        MonitorInput::FunctionFlagsChanged {
            function_down: true,
            has_other_modifiers: true,
        },
    );
    assert_eq!(combo_events, [Some(EVENT_DOWN_WITH_OTHER_KEYS), None]);
    assert!(!neutralize_combo);
    let combo_flags = preserved_flags | CGEventFlags::MaskSecondaryFn;
    assert_eq!(
        forwarded_event_flags(combo_flags, neutralize_combo),
        combo_flags,
    );
    assert_eq!(
        process_event(&mut combo, MonitorInput::KeyDown { key_code: 12 }),
        ([None, None], false),
    );
    assert_eq!(
        process_event(
            &mut combo,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_modifiers: false,
            },
        ),
        ([Some(EVENT_UP), None], false),
    );
}

#[test]
fn escape_projects_down_up_and_invalidates_fn_before_its_own_projection() {
    let mut standalone = GestureState::default();
    assert_eq!(
        process_event(&mut standalone, MonitorInput::KeyDown { key_code: 53 }),
        ([None, Some(EVENT_ESCAPE_DOWN)], false),
    );
    assert_eq!(
        process_event(&mut standalone, MonitorInput::KeyUp { key_code: 53 }),
        ([None, Some(EVENT_ESCAPE_UP)], false),
    );

    let mut fn_then_escape = GestureState::default();
    assert_eq!(
        process_event(
            &mut fn_then_escape,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: false,
            },
        ),
        ([Some(EVENT_DOWN), None], true),
    );
    let (escape_events, neutralize_escape) =
        process_event(&mut fn_then_escape, MonitorInput::KeyDown { key_code: 53 });
    assert_eq!(
        escape_events,
        [Some(EVENT_OTHER_KEY_DOWN), Some(EVENT_ESCAPE_DOWN)],
    );
    assert!(!neutralize_escape);
    let fn_escape_flags = CGEventFlags::MaskAlphaShift | CGEventFlags::MaskSecondaryFn;
    assert_eq!(
        forwarded_event_flags(fn_escape_flags, neutralize_escape),
        fn_escape_flags,
    );
    assert_eq!(
        process_event(&mut fn_then_escape, MonitorInput::KeyUp { key_code: 53 }),
        ([None, Some(EVENT_ESCAPE_UP)], false),
    );
}
