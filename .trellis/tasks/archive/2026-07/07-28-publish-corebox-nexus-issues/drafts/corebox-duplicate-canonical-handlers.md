## Priority

P1 - programmatic CoreBox input deterministically performs duplicate work and emits unhandled search-stream rejections.

## Summary

Audited on default-branch commit [`784377c499899529145c0dac7f1d0000329e0794`](https://github.com/talex-touch/tuff/commit/784377c499899529145c0dac7f1d0000329e0794) with an isolated packaged CoreApp profile.

`IpcManager.registerTransportHandlers()` registers 21 canonical CoreBox events twice. `TuffMainTransport` supports multiple handlers per event and executes every registration, so the duplicates are active rather than overwritten.

For `input.set`, `input.setQuery`, and `input.clear`, one request sends two input updates to the renderer. Both updates run a forced search; the second stream supersedes the first and the discarded promise reports:

```text
Uncaught (in promise) Error: Search stream superseded
```

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

## Expected

Each canonical request is handled once. One programmatic input update starts one search, and rapid replacement preserves latest-query-wins behavior without an unhandled rejection.

## Actual

Each affected request is handled twice. Programmatic set/query/clear operations start duplicate searches and surface superseded-stream errors.

## Evidence and root cause

- [`registerTransportHandlers()` duplicates UI handlers](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/core-app/src/main/modules/box-tool/core-box/ipc.ts#L247-L303).
- [Programmatic input handlers are also registered twice](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/core-app/src/main/modules/box-tool/core-box/ipc.ts#L381-L445).
- [`TuffMainTransport` stores a set of handlers and invokes every active handler](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/packages/utils/transport/sdk/main-transport.ts#L92-L130).
- [The renderer uses a dedicated `Search stream superseded` error](https://github.com/talex-touch/tuff/blob/784377c499899529145c0dac7f1d0000329e0794/apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts#L474).

The transport hard cut in [`a0c628289`](https://github.com/talex-touch/tuff/commit/a0c6282898377c0b51faa93f5e10a2eabcedece1) replaced legacy alias registrations with second registrations of the same canonical events.

The existing CoreBox IPC test mock stores one handler per event in a `Map`, so the second registration overwrites the first and masks production multi-handler behavior.

## Impact

- Every programmatic set/query/clear starts duplicate searches and emits an unhandled rejection.
- Rapid replacement multiplies cancelled streams and console/Sentry noise.
- UI, provider, clipboard, input-monitoring, UI-mode, and layout events also execute twice; several are only safe today because their side effects happen to be idempotent.
- Future changes can turn currently harmless duplicate work into user-visible state corruption.

## Required outcome

Keep legitimate `TuffMainTransport` multi-subscriber semantics, but register each canonical CoreBox command exactly once and make tests observe real handler cardinality.

## Acceptance criteria

- [ ] Every canonical CoreBox event has exactly one main-process registration.
- [ ] One `input.set`, `input.setQuery`, or `input.clear` delivers one renderer update and starts one search.
- [ ] Rapid programmatic replacement preserves latest-query-wins behavior without unhandled superseded rejections.
- [ ] Ordinary and `@app` searches still render, select, clear, expand, and execute correctly.
- [ ] Provider, layout, pin, focus, clipboard, input-monitoring, and UI-mode contracts retain their current return values and side effects.
- [ ] Registration tests use real multi-handler behavior or assert handler cardinality; a single-value `Map` mock may not hide duplicates.
- [ ] Transport disposer and legitimate multi-handler behavior remain unchanged.

## Verification

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/box-tool/core-box/ipc.test.ts \
  src/main/modules/box-tool/core-box/window.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts
corepack pnpm -C packages/utils exec vitest run \
  __tests__/main-transport-identity.test.ts
corepack pnpm -C apps/core-app typecheck:node
corepack pnpm -C apps/core-app typecheck:web
```

Run the isolated packaged programmatic-input matrix twice and verify zero `Search stream superseded` errors.

## Non-goals

- Changing `TuffMainTransport` to last-handler-wins.
- Removing legitimate multi-subscriber transport behavior.
- Refactoring unrelated CoreBox search or window lifecycle code.
