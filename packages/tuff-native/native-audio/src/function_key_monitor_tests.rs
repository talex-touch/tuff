use crate::function_key_monitor::{
    EVENT_DOWN, EVENT_DOWN_WITH_OTHER_KEYS, EVENT_ESCAPE_DOWN, EVENT_ESCAPE_UP,
    EVENT_OTHER_KEY_DOWN, EVENT_UP, GestureState, MonitorInput, process_event, reduce_gesture,
    should_suppress_escape, should_suppress_function_event,
};

#[test]
fn standalone_fn_emits_a_tap_pair() {
    let mut state = GestureState::default();

    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_keys: false,
            },
        ),
        Some(EVENT_DOWN),
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_keys: false,
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
                has_other_keys: false,
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
                has_other_keys: false,
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
                has_other_keys: false,
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
                has_other_keys: false,
            },
        ),
        Some(EVENT_UP),
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_keys: false,
            },
        ),
        Some(EVENT_DOWN),
    );
}

#[test]
fn standalone_fn_transitions_are_removed_from_the_os_after_voice_projection() {
    let mut standalone = GestureState::default();
    let standalone_down = MonitorInput::FunctionFlagsChanged {
        function_down: true,
        has_other_keys: false,
    };
    let (down_events, suppress_down) = process_event(&mut standalone, standalone_down);
    assert_eq!(down_events, [Some(EVENT_DOWN), None]);
    assert!(should_suppress_function_event(
        standalone_down,
        suppress_down
    ));

    assert_eq!(
        process_event(&mut standalone, MonitorInput::KeyDown { key_code: 12 }),
        ([Some(EVENT_OTHER_KEY_DOWN), None], false),
    );

    // A matching Fn up remains removed after a later key invalidates the Voice
    // gesture. Both original standalone Fn edges must stay out of macOS's
    // Globe/Emoji path after their typed Voice projections are emitted.
    let standalone_up = MonitorInput::FunctionFlagsChanged {
        function_down: false,
        has_other_keys: false,
    };
    let (up_events, suppress_up) = process_event(&mut standalone, standalone_up);
    assert_eq!(up_events, [Some(EVENT_UP), None]);
    assert!(should_suppress_function_event(standalone_up, suppress_up));

    let mut combo = GestureState::default();
    let combo_down = MonitorInput::FunctionFlagsChanged {
        function_down: true,
        has_other_keys: true,
    };
    let (combo_events, suppress_combo_down) = process_event(&mut combo, combo_down);
    assert_eq!(combo_events, [Some(EVENT_DOWN_WITH_OTHER_KEYS), None]);
    assert!(!should_suppress_function_event(
        combo_down,
        suppress_combo_down
    ));
    assert_eq!(
        process_event(&mut combo, MonitorInput::KeyDown { key_code: 12 }),
        ([None, None], false),
    );

    let combo_up = MonitorInput::FunctionFlagsChanged {
        function_down: false,
        has_other_keys: false,
    };
    let (combo_up_events, suppress_combo_up) = process_event(&mut combo, combo_up);
    assert_eq!(combo_up_events, [Some(EVENT_UP), None]);
    assert!(!should_suppress_function_event(combo_up, suppress_combo_up));
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
                has_other_keys: false,
            },
        ),
        ([Some(EVENT_DOWN), None], true),
    );
    let escape_down = MonitorInput::KeyDown { key_code: 53 };
    let (escape_events, _) = process_event(&mut fn_then_escape, escape_down);
    assert_eq!(
        escape_events,
        [Some(EVENT_OTHER_KEY_DOWN), Some(EVENT_ESCAPE_DOWN)],
    );
    assert!(!should_suppress_function_event(escape_down, true));
    assert_eq!(
        process_event(&mut fn_then_escape, MonitorInput::KeyUp { key_code: 53 }),
        ([None, Some(EVENT_ESCAPE_UP)], false),
    );
}

#[test]
fn escape_capture_suppresses_escape_edges_only_when_enabled() {
    let escape_down = MonitorInput::KeyDown { key_code: 53 };
    let escape_up = MonitorInput::KeyUp { key_code: 53 };

    assert!(should_suppress_escape(true, escape_down));
    assert!(should_suppress_escape(true, escape_up));
    assert!(!should_suppress_escape(false, escape_down));
    assert!(!should_suppress_escape(false, escape_up));
}

/// A key-down whose up the tap never sees must not disable the gesture forever.
///
/// `held_non_function_keys` only shrank on KeyUp, and `contaminated` is computed from
/// whether that set is empty — so one lost up latched every later Fn press into the
/// "combination" branch and tap-to-stop silently stopped working. Voice delivery is what
/// made this routine rather than theoretical: it typed the transcript through the same
/// tap, hundreds of synthetic downs at a time.
#[test]
fn a_lost_key_up_does_not_latch_later_taps_into_combinations() {
    let mut state = GestureState::default();

    // A key goes down and its up never arrives.
    assert_eq!(
        reduce_gesture(&mut state, MonitorInput::KeyDown { key_code: 4 }),
        None,
    );

    // The gesture that spans the stale entry is still a combination — nothing here
    // claims to know the key was released early.
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_keys: false,
            },
        ),
        Some(EVENT_DOWN_WITH_OTHER_KEYS),
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: false,
                has_other_keys: false,
            },
        ),
        Some(EVENT_UP),
    );

    // But the NEXT one starts clean: Fn being up is the moment the stale entry is
    // knowably stale, so the release drained it.
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_keys: false,
            },
        ),
        Some(EVENT_DOWN),
    );
}

/// Releasing Fn must not forgive a key that is genuinely still held.
///
/// The drain above would be wrong if it also cleared keys whose downs are real and
/// current: a user holding Shift across two Fn taps should still get a combination.
/// A real key re-announces itself with a fresh KeyDown only when it is pressed again,
/// so this pins that the drain is scoped to the release edge and nothing else.
#[test]
fn a_key_pressed_after_the_drain_still_contaminates() {
    let mut state = GestureState::default();

    reduce_gesture(
        &mut state,
        MonitorInput::FunctionFlagsChanged {
            function_down: false,
            has_other_keys: false,
        },
    );
    assert_eq!(
        reduce_gesture(&mut state, MonitorInput::KeyDown { key_code: 56 }),
        None,
    );
    assert_eq!(
        reduce_gesture(
            &mut state,
            MonitorInput::FunctionFlagsChanged {
                function_down: true,
                has_other_keys: false,
            },
        ),
        Some(EVENT_DOWN_WITH_OTHER_KEYS),
    );
}
