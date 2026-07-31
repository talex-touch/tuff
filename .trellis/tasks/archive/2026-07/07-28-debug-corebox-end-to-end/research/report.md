# CoreBox end-to-end debugging report

## Executive summary

At `HEAD=origin/master=38860855b9a59acfd9abdf18182fa3b0d6a64310`, CoreBox's normal keyboard search, scoped app search, result rendering, keyboard execution, onboarding recovery, pin/focus/bounds, expand/collapse, hide/show, and clean teardown all worked in an isolated packaged runtime.

One new P1 defect is confirmed: `IpcManager.registerTransportHandlers()` registers 21 canonical CoreBox events twice. `TuffMainTransport` intentionally stores a `Set` of wrapper handlers and executes every registration, so one programmatic `input.set`, `input.setQuery`, or `input.clear` sends two renderer `input.setQuery` events. Each renderer event starts `handleSearchImmediate({ force: true })`; the second search supersedes the first and the fire-and-forget call leaves `Error: Search stream superseded` as an unhandled rejection.

This reproduced twice before onboarding, once after onboarding, and did not reproduce in the keyboard-input control path.

## Baseline and safety boundary

- Commit: `38860855b9a59acfd9abdf18182fa3b0d6a64310` (`HEAD == origin/master`).
- CoreApp: `2.4.13`.
- Host: macOS 27.0 arm64, Darwin 27.0.0.
- Node: `v24.18.0`; pnpm: `10.34.4`.
- Runtime root: `/tmp/tuff-corebox-debug-a0wxab` with isolated `profile`, `home`, `fixtures`, and `evidence`.
- File-provider base roots were limited to two synthetic fixture files.
- The user manually replaced the system clipboard with non-sensitive synthetic text before launch. The diagnostic tooling did not inspect, back up, clear, restore, or persist clipboard content.
- Product source and product tests were not changed. Diagnostic code lives only in this Trellis task.
- Raw logs, screenshots, profile, and crash dump stayed under `/tmp`; this report contains only a redacted summary.

## Call chain and data flow

1. A renderer or host invokes `core-box:input:set` or `core-box:input:clear`.
2. `ipc.ts:411-434` has two canonical registrations for each event.
3. Every `TuffMainTransport.on()` call creates fresh local/invoke wrappers (`main-transport.ts:663-721`).
4. The transport keeps all wrappers in per-event sets and iterates all of them (`main-transport.ts:92-122`, `899-931`).
5. Both CoreBox handlers call `sendInputValueToRenderer()`, producing two `core-box:input:set-query` deliveries.
6. The renderer handler at `useSearch.ts:1629-1637` updates the value and starts `void handleSearchImmediate({ force: true })` for each delivery.
7. The later search supersedes the earlier stream. Because the promise is intentionally discarded without a rejection handler, the renderer reports `Uncaught (in promise) Error: Search stream superseded`.

The duplication was introduced by `a0c6282898377c0b51faa93f5e10a2eabcedece1` (`feat(runtime): hard-cut transport and sandbox widgets`): legacy alias registrations were mechanically replaced with second registrations of the same canonical event.

## Executable evidence

### Static and transport cardinality

- Registration audit: 52 `.on()` calls and 21 canonical event names registered twice.
- Duplicated families include UI show/hide/expand/focus, input get/set/setQuery/clear/visibility, provider deactivate/deactivateAll/details, clipboard/input monitoring, UI mode exit, and layout bounds/height/position.
- Real `TuffMainTransport` probe proved both local invoke and `ipcMain.handle` execute every same-event registration and return the last result.
- Real `IpcManager + TuffMainTransport` probe proved one request calls each selected side effect twice:
  - `ui.show` -> `coreBoxManager.trigger(true)` twice;
  - provider deactivate -> `searchEngineCore.deactivateProvider()` twice;
  - clipboard allow -> `windowManager.enableClipboardMonitoring()` twice.
- Both task-level tests passed twice consecutively.

### Packaged runtime

Before onboarding, each of two separate packaged processes produced the same sequence:

- one `input.set(alpha)` -> 1 superseded rejection;
- concurrent `input.set(alpha)` then `input.set(beta)` -> 3 superseded rejections from 4 started streams;
- one `input.clear()` -> 1 superseded rejection;
- total: exactly 5 unhandled superseded rejections per run.

After completing onboarding through the normal UI, the same programmatic matrix again produced 5 new superseded errors. This excludes the onboarding gate as the cause.

Control path:

- keyboard input `show main window` produced one result, expanded the window from `720x56` to `720x190`, and added no exception;
- Enter executed the internal main-window action, hid/reset CoreBox, and focused the existing Tuff main window;
- `Calculator` and `@app Calculator` each rendered one selected `.BoxItem` with a visible result area;
- clear returned to `720x56`; explicit expand reached `720x257`; hide/show generated one visibility transition each;
- pin, focus, and bounds requests returned the expected state;
- teardown unloaded 37/37 modules, stopped both file watchers, and left no diagnostic process or CDP listener.

## Automated gates

Passed before unrelated concurrent native changes appeared:

- focused CoreBox matrix: 13 files / 98 tests;
- CoreBox IPC/window: 2 files / 12 tests;
- utils transport regression: 4 files / 50 tests;
- task real-transport diagnostics: 2 files / 2 tests, twice;
- `typecheck:node`;
- `typecheck:web` including TuffEx build;
- `build:vite`.

The full CoreApp suite was run twice and failed identically both times: 494/502 files and 3763/3783 tests passed. The 8 failing files / 20 failing tests are stable #323 scope: stale complete mocks missing `PLUGIN_STORAGE_ERROR_CODES`, host-only response assertions, and the packaged runtime closure missing `formdata-node`. No failure was in a CoreBox test.

A later `build:unpack` rerun was blocked by an unrelated concurrent untracked native test helper (`TS6133` at `native-transport.test-helpers.ts:40`). The already verified `out/` was packaged with `electron-builder --dir` and signing disabled for local diagnostics only.

## Impact

- Programmatic input APIs do twice the search work and deterministically emit an unhandled rejection for every set/query/clear request.
- Rapid programmatic replacement multiplies cancelled streams and console/Sentry noise.
- The defect affects 21 event contracts, so currently idempotent calls still pay duplicate work and can regress if their side effects become non-idempotent.
- Existing `ipc.test.ts` uses a single-handler `Map`; the second registration overwrites the first and masks the production transport behavior.

## Regression risk and fix boundary

The narrow fix is to keep exactly one registration per canonical event in `core-box/ipc.ts`. Do not change `TuffMainTransport` to last-handler-wins: multiple handlers are an intentional shared transport capability and changing it would affect unrelated modules. If a legacy alias is ever retained, it must use a distinct legacy event definition rather than the canonical event again.

Tests should add a registration-cardinality contract or use the real transport so duplicate registrations cannot be hidden by a `Map` mock. Preserve stream cancellation, rapid replacement, sender scoping, and existing disposer behavior.

## Other observations

- The two `shortcutTriggered` sends in `window.ts:352-381` are not classified as a bug. The pre-show send was intentionally added by `bfa18626b` to beat native visibility; the historical post-show send is a fallback. `useVisibility` consumes the flag once, deduplicates repeated visible state, and clears it on hide.
- One first-run process later entered `vision.ocr` and terminated with an uncaught `Napi::Error`. It did not reproduce in the second longer run, occurred after CoreBox steps, and the worktree contains unrelated concurrent native transport/Rust changes. Evidence is insufficient and contaminated, so no Issue is proposed.
- Network/telemetry timeouts and unsigned-build warnings are expected for the isolated local package and are not CoreBox defects.
