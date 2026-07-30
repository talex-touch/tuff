# Proposed GitHub Issue: CoreBox duplicate canonical handlers

**Title**

`CoreBox: prevent duplicate IPC handlers from superseding programmatic searches`

**Labels**

`bug`

**Body**

## Priority

P1 — programmatic CoreBox input deterministically performs duplicate work and emits unhandled search-stream rejections.

## Problem

`IpcManager.registerTransportHandlers()` registers 21 canonical CoreBox events twice. `TuffMainTransport` supports multiple handlers per event and executes every registration, so the duplicates are active rather than overwritten.

For `input.set`, `input.setQuery`, and `input.clear`, one request sends two `input.setQuery` messages to the renderer. Both messages run `handleSearchImmediate({ force: true })`; the second stream supersedes the first and the discarded promise reports:

```text
Uncaught (in promise) Error: Search stream superseded
```

This reproduces before and after onboarding. Ordinary keyboard input does not produce the error.

## Reproduction

1. Start the current packaged CoreApp with an isolated profile.
2. Complete onboarding so CoreBox search providers are admitted.
3. Invoke `core-box:input:set` once with a synthetic query.
4. Observe two forced searches and one unhandled `Search stream superseded` rejection.
5. Invoke two programmatic input sets rapidly.
6. Observe four searches and three superseded rejections.
7. Invoke `core-box:input:clear` once.
8. Observe two searches and one superseded rejection.

Two separate pre-onboarding runs and one admitted run produced the same `1 + 3 + 1` error cardinality. A keyboard-input control rendered and executed one result with no new exception.

## Root cause

The transport hard-cut in `a0c6282898377c0b51faa93f5e10a2eabcedece1` replaced legacy alias registrations with second registrations of the same canonical events.

`TuffMainTransport.on()` creates a fresh wrapper for every call and stores it in per-event handler sets. Both `ipcMain.handle` and local `invoke` iterate all registered wrappers and return the final result.

The existing CoreBox IPC test mock stores one handler per event in a `Map`, so the second registration overwrites the first and masks production behavior.

## Impact

- Every programmatic set/query/clear starts duplicate searches and emits an unhandled rejection.
- Rapid replacement multiplies cancelled streams and console/Sentry noise.
- UI, provider, clipboard, input-monitoring, UI-mode, and layout events also execute twice; several are only safe today because their side effects happen to be idempotent.
- Future changes can turn currently harmless duplicate work into user-visible state corruption.

## Acceptance criteria

- [ ] Every canonical CoreBox event has exactly one main-process registration.
- [ ] One `input.set`, `input.setQuery`, or `input.clear` delivers one renderer query update and starts one search.
- [ ] Rapid programmatic replacement preserves latest-query-wins behavior without unhandled superseded rejections.
- [ ] Ordinary and `@app` searches still render, select, clear, expand, and execute correctly.
- [ ] Provider, layout, pin, focus, clipboard, input-monitoring, and UI-mode contracts retain their current return values and side effects.
- [ ] Registration tests use real multi-handler behavior or assert handler cardinality; a single-value `Map` mock may not hide duplicates.
- [ ] Transport disposer and legitimate multi-handler behavior remain unchanged.

## Verification

```bash
corepack pnpm exec vitest run --config .trellis/tasks/07-28-debug-corebox-end-to-end/research/probes/vitest.config.ts
corepack pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/core-box packages/utils/__tests__/main-transport-identity.test.ts
corepack pnpm -C apps/core-app run typecheck:node
corepack pnpm -C apps/core-app run typecheck:web
```

Run the isolated packaged programmatic-input matrix twice and verify zero `Search stream superseded` errors.

## Non-goals

- Changing `TuffMainTransport` to last-handler-wins.
- Removing legitimate multi-subscriber transport behavior.
- Refactoring unrelated CoreBox search or window lifecycle code.
