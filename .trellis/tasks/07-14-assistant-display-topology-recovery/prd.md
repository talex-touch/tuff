# Reposition Assistant on Display Changes

## Goal

Keep the Assistant floating ball and visible Voice Panel inside available work areas when displays are added, removed, rotated, rescaled, or resized.

## Background

The Assistant restores initial floating-ball bounds correctly, but it does not subscribe to Electron `screen` topology events. Removing a display or changing work area, bounds, rotation, or scale can therefore leave the already-open floating ball or Voice Panel outside every available work area until a settings refresh or restart.

## Requirements

- Register one shared handler for Electron `display-added`, `display-removed`, and `display-metrics-changed` after module initialization; unregister the same handler during module destruction.
- A topology event MUST NOT create Assistant windows. If no live floating-ball window exists, it is a no-op.
- Reapply floating-ball bounds from the persisted setting so removed displays fall back to Electron's nearest available display and re-added displays may recover the original saved location.
- If the Voice Panel is currently visible, reposition it beside the corrected floating ball and clamp it into the same display work area without focusing, reopening, or rebroadcasting `panelOpened`.
- A hidden, missing, or destroyed Voice Panel remains untouched.
- Do not overwrite the persisted floating-ball position merely because the available display topology changed.
- Preserve existing drag persistence, default position, size, opacity, click/open behavior, and screenshot workflows.

## Acceptance Criteria

- [x] Focused tests prove all three Electron display events register once and are removed on teardown.
- [x] A focused test invokes a topology listener after a saved display disappears and proves the live floating ball is clamped into the nearest available work area without config persistence.
- [x] A focused test proves a visible Voice Panel is re-anchored and clamped beside the corrected ball without focus/show/broadcast side effects; hidden panels remain untouched.
- [x] Existing Assistant focused tests, targeted lint, and CoreApp node type-check pass.
- [x] TODO/CHANGES and the Assistant quality contract record code completion while keeping real display hot-plug/HiDPI packaged evidence open.

## Out of Scope

- Persisting a separate position per monitor or replacing coordinates after a temporary display removal.
- Creating, showing, or focusing Assistant windows in response to display events.
- Claiming real-device hot-plug, multi-display/HiDPI, or current-version packaged evidence complete.
