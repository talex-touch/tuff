# Technical Design

## Boundaries

`window.ts` remains the public facade and owns CoreBox business transitions (`create`, `show`, `hide`, `expand`, `shrink`) plus composition of focused helpers. Callers continue importing the existing exports.

New modules live beside the facade under `core-box/window/`:

- `key-event.ts`: blocked function keys, modifier normalization, Electron key-code mapping.
- `focus-policy.ts`: blur-hide timer and focus-grace policy with injected focus/hide callbacks.
- `bounds.ts`: pure compact/expanded bounds and position calculations.
- `bounds-controller.ts`: animation token/target state, temporary resize restoration, height/position application.
- `theme-controller.ts`: settings subscription, theme-file resolution, bundled CSS cache, dark-class/CSS application.
- `plugin-view-controller.ts`: WebContentsView attach/detach/extract/restore, security/navigation setup, message relay, and input/clipboard/key forwarding state.

## Transport Contract

Canonical event ownership stays in `packages/utils/transport/events`. Main, renderer, plugin relays, and tests consume exported events or `toEventName()`; direct raw event strings are limited to the existing governance allowlist and explicit retained aliases.

## State Ownership

- `WindowManager`: active `TouchWindow`, pinning, show/hide/expand/shrink semantics, controller composition.
- `BoundsController`: animation lifecycle and last applied bounds.
- `FocusPolicy`: timers and grace windows only.
- `ThemeController`: theme subscription/cache/application only.
- `PluginViewController`: attached plugin/feature/view and view-scoped forwarding permissions.

Controllers receive callbacks or narrow dependencies rather than importing `WindowManager`, preventing cycles.

## Compatibility

No public signatures change. Extraction proceeds from pure helpers to stateful controllers. Each step preserves existing call order, especially plugin security policy installation before load, initial input after DOM readiness, MetaOverlay layering, and cleanup on detach.

## Risks

- Bounds animation races: preserve token invalidation and resizable restoration exactly.
- Plugin view lifecycle: preserve ownership checks, `detachingUIView`, security profile, preload, navigation, and listener cleanup.
- Focus timing: preserve shortcut/default grace windows and pin behavior.
- Theme injection: preserve idempotent CSS keys and native-theme listener disposal.

## Rollback Shape

Every extraction keeps facade method boundaries. A controller can be inlined back into `window.ts` without caller migration if a focused verification fails.
