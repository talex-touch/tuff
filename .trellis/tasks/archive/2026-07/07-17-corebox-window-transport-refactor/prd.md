# Harden CoreBox transport and refactor WindowManager

## Goal

Eliminate CoreBox transport event-name drift and reduce the 2,027-line Electron-main `WindowManager` into a maintainable facade plus focused window services without changing its public API or user-visible behavior.

## Confirmed Facts

- The renderer/main `core-box:input-change` failure was caused by duplicated raw event names across independently built layers; the handler now derives its name from `CoreBoxEvents.input.change`.
- A repository scan of 2,190 mixed source files and 626 event-like literals found one additional incorrect test fixture: `core-box:search:end` instead of canonical `core-box:search-end`. Four remaining delimiter-collision families are explicit canonical/legacy aliases.
- The transport boundary guard passes and fails on any delimiter collision outside that retained-alias baseline.
- `window.ts` is 844 lines after extraction. It and all six extracted modules report zero ESLint errors and warnings; focused TypeScript diagnostics are empty.

## Requirements

- Producers, handlers, relays, and tests must derive shared transport names from exported `TuffEvent` contracts; retained legacy aliases remain explicit.
- Correct the remaining Search End test-fixture drift and strengthen the event-governance regression so delimiter variants cannot silently reappear.
- Clear every ESLint error and warning in `window.ts` and all newly extracted modules.
- Keep `WindowManager`, `windowManager`, `getCoreBoxWindow`, and existing caller-facing method signatures stable.
- Extract cohesive pure helpers and stateful controllers for bounds/animation, focus policy, key mapping, theme handling, and plugin-view lifecycle.
- Preserve Electron/plugin security ordering, view ownership, navigation policy, preload injection, input/clipboard/key forwarding, focus behavior, bounds animation, pinning, theme updates, and MetaOverlay coordination.
- Do not introduce Vue composables into Electron main-process code; use pure functions and focused controllers.
- Avoid unrelated search ranking, provider, plugin, or UI behavior changes.

## Acceptance Criteria

- [x] No unapproved `:`/`-` delimiter collision remains in scanned transport event contracts or fixtures.
- [x] Existing canonical/legacy CoreBox aliases remain explicitly covered.
- [x] `window.ts` and every extracted module report zero ESLint errors and warnings.
- [x] `pnpm -C apps/core-app run typecheck:node` passed for the CoreBox refactor; later concurrent AI CLI edits introduced unrelated workspace errors, while focused diagnostics for every extracted CoreBox module remain empty.
- [x] Focused CoreBox window, manager, IPC, plugin-feature, plugin-view security, and transport-governance tests pass.
- [x] TuffEx plus CoreApp main/preload/renderer production build passes.
- [x] An isolated Electron runtime smoke confirmed input forwarding, compact/expand/shrink, focus/hide/show, plugin-view attach/detach/cache reattach, and no `No handler registered` error.

## Out of Scope

- Renaming canonical event strings or removing retained legacy aliases.
- Replacing `WindowManager` with a new public API or migrating all callers to dependency injection.
- Product-visible CoreBox redesign.
