# TuffEx menu activation blink feedback

## Goal

Give a menu selection a short, unmistakable visual confirmation before the menu disappears, using one consistent TuffEx interaction across dropdown and context menus.

## Background

- `TxDropdownItem` and `TxContextMenuItem` currently emit `select` and close their root menu synchronously in the same activation handler.
- Pointer click, Enter, and Space converge on `TxCardItem`'s `click` event, so one item-level mechanism can cover mouse and keyboard activation.
- Submenu trigger rows already set `closeOnSelect=false`; they open another panel and must not run a pre-close confirmation.
- Both item families already compose `TxCardItem`, whose existing active style is the canonical selected-row treatment.

## Requirements

1. `TxDropdownItem` and `TxContextMenuItem` MUST share the same pre-close activation feedback behavior.
2. Feedback MUST be enabled by default and configurable at both the menu/panel level and per item through `activationFeedback?: boolean`; the item value overrides the inherited value.
3. Feedback MUST run only when the activation will close a parent menu:
   - clear the current hover/focus highlight for 90 ms;
   - show the existing `TxCardItem` active treatment for 90 ms;
   - emit `select`;
   - close the root menu.
4. `closeOnSelect=false`, `activationFeedback=false`, missing menu context, disabled items, and `prefers-reduced-motion: reduce` MUST keep the immediate existing path without the 180 ms delay.
5. A feedback cycle MUST ignore duplicate activation and MUST cancel pending timers when the item unmounts.
6. Existing focus movement, Arrow/Home/End navigation, submenu opening, outside/Escape close handling, and root-menu close propagation MUST remain unchanged.
7. The visual treatment MUST reuse existing TuffEx row tokens and `TxCardItem` active styling; it MUST NOT introduce a second menu-selection color system.
8. Dropdown Menu and Context Menu Chinese/English docs and live demos MUST describe and display the behavior, including opt-out and reduced-motion semantics.

## Acceptance Criteria

- [x] Mouse activation of a closing dropdown item visibly clears then confirms the row before `select` and close.
- [x] Enter and Space activation follow the same sequence.
- [x] Context-menu items, including nested context-menu items, follow the same sequence and close the root menu after confirmation.
- [x] Submenu trigger rows and any `closeOnSelect=false` item emit immediately and stay open without blinking.
- [x] `activationFeedback=false` at menu/panel or item scope restores immediate select-and-close behavior.
- [x] Reduced-motion preference restores immediate select-and-close behavior and does not leave a feedback class or active state behind.
- [x] Repeated activation during the 180 ms cycle produces one `select` emission and one close.
- [x] Component tests, scoped type checks, TuffEx build, Nexus docs gates, and a real-browser mouse/keyboard/reduced-motion smoke all pass.
- [x] Chinese and English docs remain section-parity aligned and their rendered demos expose the new interaction.

## Out of Scope

- Changing popover open/close animations.
- Adding sounds, haptics, or platform-native menu rendering.
- Changing `TxCardItem`'s global hover/active design.
- Applying the delay to non-closing toggle/check/radio menu items.
