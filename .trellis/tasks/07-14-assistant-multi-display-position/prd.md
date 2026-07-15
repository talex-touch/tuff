# Preserve Assistant Position Across Displays

## Goal

Restore persisted Assistant floating-ball coordinates on their saved display, including negative desktop coordinates, while clamping removed-display positions safely.

## Background

`AssistantModule.applyFloatingBallBounds()` currently chooses the display nearest the cursor before interpreting persisted coordinates, so reopening can move a ball saved on another display onto the cursor's display. It also treats any negative x/y as unset, although Electron desktop coordinates are legitimately negative for displays placed left of or above the primary display.

## Requirements

- Treat only the canonical `{ x: -1, y: -1 }` pair as the unset/default position; preserve every other finite coordinate pair, including negative coordinates.
- For a persisted position, select the display nearest that saved point and clamp the full floating-ball bounds into that display's current work area.
- For the unset/default position, keep selecting the cursor's current display and apply the existing edge-padding/default-height placement.
- If the saved display was removed or its work area changed, rely on Electron's nearest-display result and clamp to a visible position; do not discard the persisted coordinates before display resolution.
- Preserve existing size, opacity, drag persistence, click behavior, window lifecycle, and settings schema.

## Acceptance Criteria

- [x] A focused test proves a saved negative coordinate resolves against the saved display rather than being treated as unset or redirected to the cursor display.
- [x] A focused test proves `{ x: -1, y: -1 }` still uses the cursor display and existing default placement.
- [x] A focused test proves an off-work-area saved position is clamped wholly inside the nearest available display.
- [x] Existing Assistant module focused tests, targeted lint, and CoreApp node type-check pass.
- [x] TODO/CHANGES and the Assistant quality contract distinguish landed persistence from still-open real multi-display/HiDPI packaged evidence.

## Out of Scope

- Runtime display hot-plug repositioning while the floating-ball window remains open.
- Per-display position history, DPI migration, or monitor fingerprint persistence.
- Claiming real-device multi-display/HiDPI or current-version packaged evidence complete.
