# CoreApp Electron Dev Capture Attempt

> Date: 2026-05-17
> Scope: Electron dev runtime capture for visible-experience evidence.

## Objective

Collect real Electron UI evidence for CoreApp visible-experience surfaces without
overwriting `apps/core-app/dist` or claiming browser-only screenshots as product
evidence.

## Attempts

### OS-Level Screenshot Fallback

The macOS screenshot helper was checked after CDP capture failed.

Result:

- sandboxed permission preflight reported that screen capture checks are blocked,
- escalated permission preflight reported Screen Recording is not granted,
- no OS-level screenshot was captured.

This blocks screenshot-based fallback capture until Screen Recording permission
is granted for the terminal/Codex process in macOS System Settings.

### Existing Dev Runtime

`127.0.0.1:5173` was already occupied by an existing dev server. The running
Tuff dev instance continued writing logs under:

`~/Library/Application Support/@talex-touch/core-app/tuff-dev/logs/D.2026-05-17.log`

This existing instance did not expose the requested remote debugging port, so it
could not be used for Playwright/CDP UI capture.

### Separate Dev Server

Command shape:

```bash
TUFF_DEV_SERVER_HOST=127.0.0.1 TUFF_DEV_SERVER_PORT=5185 \
pnpm -C "apps/core-app" run dev --remoteDebuggingPort 9224
```

Result:

- main and preload builds completed,
- renderer dev server announced `http://127.0.0.1:5185/`,
- process exited immediately after `start electron app...`,
- neither `5185` nor `9224` remained listening.

The most likely reason is collision with an already-running macOS Tuff Dev
Electron app using the same development bundle path / bundle identifier.

### Isolated Dev Bundle Attempt

`apps/core-app/scripts/dev-electron-wrapper.mjs` now supports an opt-in
development bundle variant:

- `TUFF_DEV_ELECTRON_BUNDLE_ID`
- `TUFF_DEV_ELECTRON_BUNDLE_NAME`

Command shape:

```bash
TUFF_DEV_ELECTRON_BUNDLE_ID=com.tagzxia.app.tuff.visible-evidence \
TUFF_DEV_ELECTRON_BUNDLE_NAME="Tuff Visible Evidence" \
TUFF_STARTUP_BENCHMARK_ONCE=1 \
TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS=120000 \
TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/private/tmp/tuff-visible-electron-user-data \
TUFF_DEV_SERVER_HOST=127.0.0.1 \
TUFF_DEV_SERVER_PORT=5186 \
pnpm -C "apps/core-app" run dev --remoteDebuggingPort 9225
```

Result:

- variant bundle was created under
  `apps/core-app/.dev-electron/darwin/variants/com.tagzxia.app.tuff.visible-evidence/dist`,
- main and preload builds completed,
- renderer dev server announced `http://127.0.0.1:5186/`,
- process exited immediately after `start electron app...`,
- neither `5186` nor `9225` remained listening,
- `/private/tmp/tuff-visible-electron-user-data` was not created.

Because the isolated userData directory was never created, this failure happened
before CoreApp bootstrap reached `polyfills.ts`. It should be treated as a dev
capture chain blocker, not as evidence that the CoreApp UI failed to render.

## Completion Impact

No Electron UI screenshot or recording was produced by this attempt. The
visible-experience surfaces remain incomplete:

- first usable CoreApp screen,
- CoreBox search states,
- login failure recovery,
- provider / permission / capability failure states,
- CoreBox AI Ask,
- OmniPanel Writing Tools,
- Workflow Use Model / Review Queue.

Packaged cold/hot startup evidence also remains blocked until a current
`2.4.10-beta.25+` packaged artifact is produced.
