# Transport MessagePort Lanes — Implementation

- [x] Remove legacy search push events from `DEFAULT_PORT_CHANNELS` and align port-policy expectations.
- [x] Audit clipboard stream on renderer and plugin transports; preserve channel fallback.
- [x] Audit file-index progress registration, throttling, terminal emission, and cancellation cleanup.
- [x] Audit CoreBox search session/index-committed stream isolation and cancellation.
- [x] Make renderer/plugin close paths equivalent for last-handler, close-before-open, messageerror, cancel, and destroy.
- [x] Keep main port registry sender-bound and release records on sender destruction.
- [x] Preserve `CoreBoxEvents.layout.update` batching and record the port carve-out.

## Verification Result

- Utils transport: 5 files / 18 tests passed.
- CoreBox transport: 2 files / 24 tests passed.
- Search renderer: 1 file / 17 tests passed.
- Clipboard/file-index: 2 files / 11 tests passed.
- Scoped ESLint passed; CoreApp web typecheck passed.
- CoreApp node typecheck remains blocked by pre-existing AppProvider/file-index/update test errors outside this slice; no changed transport file appeared in diagnostics.
- CoreApp dev build and bootstrap completed on isolated port 5174; Electron exited through the existing single-instance guard because another user instance was already running.

Verification:

```bash
corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/transport/port-policy.test.ts" \
  "__tests__/renderer-transport-stream.test.ts" \
  "__tests__/plugin-transport-stream.test.ts"

corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/box-tool/core-box/ipc.test.ts" \
  "src/renderer/src/modules/box/adapter/hooks/useSearch.test.ts"

corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
```

Smoke: start CoreApp, run a CoreBox search, resize while results stream, open clipboard history, observe file-index progress if active, then close the app without port leak warnings.
