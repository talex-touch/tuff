# Implementation Plan — Enforce Secure Plugin Views #298

## RED 1 — Profile And Bridge Contracts

- [x] Add stable legacy runtime error code and SDK preservation test.
- [x] Rewrite profile tests so old/unsupported SDK, preload, webview and explicit legacy fail before construction.
- [x] Add bridge version roundtrip/missing/mismatch tests.
- [x] Change window/profile host tests to prove no unsafe managed-key combination is representable.

## GREEN 1

- [x] Remove compat security base and env escape hatch.
- [x] Add typed compatibility gate and blocked diagnostics.
- [x] Require bridge version and expose frozen minimal version metadata.
- [x] Make plugin view host always use bundled preload and unique versioned partition.

## RED 2 — Surface And Policy Boundaries

- [x] Add static constructor-order and unowned-URL contract tests for CoreBox, DivisionBox and public window.
- [x] Add navigation/subframe/resource scheme tests, popup/webview denial and owner-bound session/download tests.
- [x] Add main-window no-webview and atom no-local-read contract tests.

## GREEN 2

- [x] Remove dynamic legacy preload generation from CoreBox and DivisionBox.
- [x] Reject legacy public windows with stable response before `new TouchWindow`.
- [x] Bind permission/request/download handlers to owner WebContents and deny webview attach.
- [x] Disable main-window webviewTag and remove dead historical webview host.
- [x] Replace atom local-file mapping with deterministic 410 response.

## RED/GREEN 3 — Bundled Migration And Docs

- [x] Raise bundled webcontent manifests to minimum trusted SDK and validate.
- [x] Add bilingual migration guidance for preload globals, forbidden legacy APIs and error code.
- [x] Update real Electron preload smoke for bridge version and download denial.

## REFACTOR / REVIEW

- [x] Remove unused compat imports, preload temp-file helpers and legacy injection payloads.
- [x] Scan all production `BrowserWindow`, `WebContentsView`, `<webview>`, `loadURL`, custom protocol and download paths for bypasses.
- [x] Independent security review finds no remaining P0/P1/P2 bypass.

## Validation

```bash
pnpm -C apps/core-app exec vitest run \
  src/main/core/window-security-profile.test.ts \
  src/shared/plugin-view-bridge.test.ts \
  src/main/modules/plugin/runtime/plugin-view-security-profile.test.ts \
  src/main/modules/plugin/runtime/plugin-view-host.test.ts \
  src/main/modules/plugin/runtime/plugin-window-policy.test.ts \
  src/main/modules/plugin/runtime/plugin-window-boundary-contract.test.ts \
  src/preload/plugin-view-channel.test.ts

pnpm -C packages/utils exec vitest run __tests__/plugin-window-sdk.test.ts
pnpm -C apps/core-app typecheck:node
pnpm -C apps/core-app typecheck:web
pnpm plugins:validate
pnpm -C apps/core-app build:vite
pnpm -C apps/core-app exec electron scripts/plugin-view-preload-smoke.cjs
test -f apps/core-app/out/preload/plugin-view.js
git diff --check
```

## Final Evidence

- Core focused: 10 files / 81 tests passed; Utils focused: 3 files / 13 tests passed.
- CoreApp node and web typechecks passed; scoped rewritten-module ESLint and `git diff --check` passed.
- `plugins:validate`: 24/24; bundled `clipboard-history` and `touch-translation` migrated to SDK 260615.
- Production `build:vite` passed and generated `out/preload/plugin-view.js`.
- Real Electron 41 smoke passed: bridge v1, frozen minimal globals, no require/process/Electron/raw IPC, six hardened preferences, isolated session, and navigation/popup/resource/permission/download denial.
- Production scan found no compat profile, env escape hatch, unsafe Electron preference, or `<webview>` pattern.
- Independent targeted review reported no remaining P0/P1/P2 findings.

## Release Gate

Do not commit, publish or close #298 until every production plugin Electron surface is secure by construction, legacy paths fail deterministically, bundled webcontent plugins pass validation/smoke, and the real Electron preload test proves no Node/Electron/raw IPC exposure.
