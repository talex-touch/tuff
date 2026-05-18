# Packaged CDP Visible Capture

> Date: 2026-05-17
> Artifact baseline: `2.4.10-beta.25`
> Runtime: local packaged Electron artifact, not plain browser smoke.

## Command

```bash
TUFF_STARTUP_BENCHMARK_ONCE=1 \
TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS=300000 \
TUFF_STARTUP_BENCHMARK_USER_DATA_DIR="/private/tmp/tuff-visible-cdp-user-data-4" \
"/private/tmp/tuff-visible-cdp-9336.app/Contents/MacOS/tuff" \
--remote-debugging-port=9336
```

The App Index recapture used the same rebuilt local packaged artifact on port `9338` with isolated userData at `/private/tmp/tuff-visible-cdp-user-data-6`.

CDP targets were discovered through the local `/json/list` endpoints and archived in `cdp-target-inventory.json`.

## Captured Artifacts

- `startup-first-screen-onboarding.png`
- `startup-settings-after-onboarding.png`
- `startup-first-screen-onboarding-dom.json`
- `startup-settings-after-onboarding-dom.json`
- `corebox-idle.png`
- `corebox-no-result.png`
- `corebox-result-reasons.png`
- `corebox-ai-recovery.png`
- `corebox-idle-dom.json`
- `corebox-no-result-dom.json`
- `corebox-result-reasons-dom.json`
- `corebox-ai-recovery-dom.json`
- `app-index-manager-current.png`
- `app-index-manager-current-dom.json`

## Findings

- First usable screen is not blank or indefinitely loading. The packaged app reaches an onboarding/login surface and Settings/About remains reachable.
- Settings/About shows `2.4.10-beta.25`, build metadata, unauthenticated account state, permission state, and startup health.
- CoreBox idle, no-result, and searching states are visible in packaged runtime. No-result state exposes retry and File Index settings actions.
- The rebuilt result capture includes mixed application/system rows, localized completion/footer text, and `corebox-result-reasons-dom.json` records `hasRawI18n=false`; source/quick-key signal rails fit without visible overlap.
- `corebox-ai-recovery.png` only captures a loading/searching state. It is not evidence for AI answer preview, provider metadata, copy failure visibility, or recoverable AI failure copy.
- `app-index-manager-current.png` / `app-index-manager-current-dom.json` now reach Settings -> file-index in packaged runtime and show the App Index manager workbench. The recapture added `/System/Applications/Calculator.app` through the renderer `app:app-index:add-path` channel in isolated packaged userData, then applied the Steam source filter. The DOM records `preFilter.entryCount=1`, summary counts, all source and diagnostic chips, active filtered-empty text, `hasRawI18n=false`, and no raw `common.all` keys.

## Source Fix And Recapture

CoreBox completion display now resolves i18n message strings before prefix trimming:

- `apps/core-app/src/renderer/src/views/box/completion-display.ts`
- `apps/core-app/src/renderer/src/views/box/completion-display.test.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/renderer/src/components/render/CoreBoxFooter.vue`
- `apps/core-app/src/renderer/src/components/render/coreBoxFooterDisplay.ts`
- `apps/core-app/src/renderer/src/components/render/coreBoxFooterDisplay.test.ts`

Verified locally:

```bash
pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/box/completion-display.test.ts"
pnpm -C "apps/core-app" exec eslint "src/renderer/src/views/box/completion-display.ts" "src/renderer/src/views/box/completion-display.test.ts" "src/renderer/src/views/box/CoreBox.vue"
pnpm -C "apps/core-app" exec vitest run "src/renderer/src/components/render/coreBoxFooterDisplay.test.ts" "src/renderer/src/views/box/completion-display.test.ts" "src/renderer/src/components/render/sourceMeta.test.ts"
pnpm -C "apps/core-app" exec eslint "src/renderer/src/components/render/CoreBoxFooter.vue" "src/renderer/src/components/render/coreBoxFooterDisplay.ts" "src/renderer/src/components/render/coreBoxFooterDisplay.test.ts" "src/renderer/src/components/render/BoxItem.vue" "src/renderer/src/components/render/sourceMeta.ts" "src/renderer/src/components/render/sourceMeta.test.ts"
pnpm -C "apps/core-app" run typecheck:web
pnpm -C "apps/core-app" run build:unpack
codesign --verify --deep --strict "apps/core-app/dist/mac-arm64/tuff.app"
```

Login recovery now carries browser-open failure from main auth to the renderer so the login dialog can keep the device authorization session alive while showing manual link/code recovery copy:

- `packages/utils/transport/events/auth.ts`
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/auth/index.test.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/settings/login-recovery-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/login-recovery-display.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`

Verified locally:

```bash
pnpm -C "apps/core-app" exec vitest run "src/main/modules/auth/index.test.ts" "src/renderer/src/views/base/settings/login-recovery-display.test.ts"
pnpm -C "apps/core-app" exec eslint "src/main/modules/auth/index.ts" "src/main/modules/auth/index.test.ts" "src/renderer/src/modules/auth/useAuth.ts" "src/renderer/src/views/base/settings/SettingUser.vue" "src/renderer/src/views/base/settings/login-recovery-display.ts" "src/renderer/src/views/base/settings/login-recovery-display.test.ts"
pnpm exec eslint "packages/utils/transport/events/auth.ts"
```

## Open Gaps

- Browser login recovery still needs forced browser-open failure evidence with manual URL copy, short-code copy, and timeout/network recovery copy from a rebuilt packaged artifact.
- CoreBox AI Ask still needs answer preview, provider/model/latency/trace metadata, copy failure, and recoverable failure evidence.
- OmniPanel Writing Tools, Workflow Review Queue, Provider Registry Admin, and provider migration evidence are still pending.
