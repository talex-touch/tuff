use crate::function_key_monitor::{
    EVENT_DOWN, EVENT_DOWN_WITH_OTHER_KEYS, EVENT_OTHER_KEY_DOWN, EVENT_UP, GestureState,
    MonitorInput, process_input, reduce_gesture,
};

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
fn suppresses_only_fn_transitions_claimed_by_a_standalone_press() {
    let mut standalone = GestureState::default();
    assert_eq!(
        process_input(
            &mut standalone,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: false,
            },
        ),
        (Some(EVENT_DOWN), true),
    );
    assert_eq!(
        process_input(&mut standalone, MonitorInput::KeyDown { key_code: 12 }),
        (Some(EVENT_OTHER_KEY_DOWN), false),
    );
    // The initial standalone Fn down was consumed, so its matching up must be consumed even
    // after a letter invalidates the gesture. The letter itself remains visible to macOS.
    assert_eq!(
        process_input(
            &mut standalone,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_modifiers: false,
            },
        ),
        (Some(EVENT_UP), true),
    );

    let mut combo = GestureState::default();
    assert_eq!(
        process_input(
            &mut combo,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_modifiers: true,
            },
        ),
        (Some(EVENT_DOWN_WITH_OTHER_KEYS), false),
    );
    assert_eq!(
        process_input(&mut combo, MonitorInput::KeyDown { key_code: 12 }),
        (None, false),
    );
    assert_eq!(
        process_input(
            &mut combo,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_modifiers: false,
            },
        ),
        (Some(EVENT_UP), false),
    );
}
