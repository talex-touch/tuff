# CoreApp Visible Experience Completion Audit

> Date: 2026-05-17
> Scope: CoreApp visible experience, AI desktop entry, Provider Registry observability, and workbench UI direction.

## Objective Breakdown

This audit treats the current objective as five deliverables:

1. CoreApp visible experience evidence: startup, search, login, and failure states.
2. Tuff 2.5.0 AI desktop entry minimal loop: CoreBox AI Ask, OmniPanel Writing Tools, Workflow Use Model, and Review Queue.
3. Provider / Scene retirement and observability: legacy `intelligence_providers` retirement evidence, Provider Registry health, usage ledger, and degraded reasons.
4. Workbench UI direction: command-center density for CoreBox, App Index, OmniPanel, Workflow Review Queue, and Nexus Provider Admin.
5. Completion evidence: real benchmark reports, real screenshots or recordings, copied migration evidence, and strict verifier output. Passing tests or generated templates are not completion evidence by themselves.

## Prompt-To-Artifact Checklist

| Requirement | Expected Artifact | Current Evidence | Status |
| --- | --- | --- | --- |
| Packaged hot startup benchmark uses current package baseline | `startup:bench:packaged:hot` report for current `apps/core-app/package.json` version | `apps/core-app/package.json` and local `apps/core-app/dist/mac-arm64/tuff.app` both report `2.4.10-beta.25`; `codesign --verify --deep --strict` completed without output; `docs/engineering/reports/startup-packaged-hot-runs-2026-05-17/汇总报告.md` records latest 10 runs passing with Startup health P50 `1700ms`, P95 `1900ms`, 0 WARN, and 0 ERROR | Covered |
| Packaged cold startup benchmark uses isolated userData | `startup:bench:packaged:cold` report plus WAL/health notes | `docs/engineering/reports/startup-packaged-cold-runs-2026-05-17/汇总报告.md` records 10/10 cold runs passing with isolated per-run `userData`, Startup health P50 `1100ms`, P95 `3400ms`, 0 WARN, and 0 ERROR; `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/startup-packaged-cold-long-tail-notes.md` preserves the run 01 long-tail note | Covered with UI follow-up |
| First usable CoreApp screen has visual proof | Screenshot or recording attached to visible-experience manifest | Packaged Electron CDP evidence is attached in `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/`: `startup-first-screen-onboarding.png`, `startup-settings-after-onboarding.png`, and DOM captures show a usable onboarding/login surface plus reachable Settings/About startup health | Covered |
| CoreBox search idle/searching/no-result/result reason states have visual proof | Screenshots or recording for CoreBox search states | Rebuilt packaged CDP artifacts cover idle, no-result, searching/loading, and populated result states. `corebox-no-result-dom.json` shows retry and File Index settings actions; `corebox-result-reasons-dom.json` includes mixed application/system rows with `hasRawI18n=false`, localized completion/footer text, and source/quick-key signal rails fitting without visible overlap | Covered |
| Browser login failure is recoverable and visible | Screenshot or recording showing manual URL/code actions and readable failure copy | Packaged Settings evidence shows unauthenticated state and login entry points. Source now propagates browser-open failure from main auth to renderer, focused tests cover manual link/code recovery copy while the device authorization session remains waiting, and Settings login errors are localized for browser-open, timeout, callback/token, device authorization, rate limit, quota, permission, expired session, network, and service outage cases. Packaged UI evidence is not recaptured | Blocked after source fix |
| App Index manager workbench is visible | Screenshot or recording showing summary counts, source filters, diagnostic filters, and filtered empty state | Rebuilt packaged Electron CDP on port `9338` archived `app-index-manager-current.png` / `app-index-manager-current-dom.json`. The capture reaches Settings -> file-index, contains `.app-index-manager`, seeds `/System/Applications/Calculator.app` through the renderer `app:app-index:add-path` channel in isolated packaged userData, records `preFilter.entryCount=1`, shows summary counts plus all source/diagnostic chips, applies the Steam source filter, and shows a filtered-empty state with `hasRawI18n=false` | Covered |
| Permission/provider/capability failures say readable reasons | CoreBox/AI screenshot or captured UI evidence | Mapping helpers and tests exist; no complete packaged UI artifact for permission/provider/capability failure copy is attached yet | Weakly verified |
| CoreBox AI Ask minimal loop is usable | Screenshot/recording of answer preview, metadata, copy/retry/failure recovery | Source now tightens the answer card with status-specific tone, pending/ready/error hints, provider metadata, copy failure visibility, and metadata-pending fallback; focused tests cover metadata/status helpers. `corebox-ai-recovery.png` still only shows a loading/searching state, not answer preview or recoverable failure evidence | Blocked after source/UI helper fix |
| OmniPanel Writing Tools minimal loop is usable | Screenshot/recording of selected context, actions, preview, copy/replace/retry confirmation | Source now tightens the AI preview with selected-context preview, running/ready/failed/confirming status details, labeled capability/provider/model/latency metadata chips, inline clipboard action failures, and copy/replace confirmation. Focused helper tests cover selection recovery, input preview, metadata chips, status mapping, and result normalization. No real packaged OmniPanel visual evidence is attached | Blocked after source/UI helper fix |
| Workflow Use Model output enters Review Queue | Screenshot/recording of Use Model output, queue filters, cost signals, failed-action recovery | Source now tightens Review Queue cards with labeled capability/provider/model/trace/latency/tokens/risk/failure metadata chips, status filters, copy/replace confirmation, retry copy/replace labels, clear-failure recovery, and focused helper tests. No real packaged workflow run visual evidence is attached | Blocked after source/UI helper fix |
| Provider Registry health/usage/degraded state is visible | Nexus Provider Admin screenshot or recording with real registry data | Source now distinguishes Provider/Scene initial empty, filtered empty, no-attention, no-unknown-provider, and no-failed-scene states, and filtered lists include a “show all” recovery action. Usage Ledger and Health tabs now expose next-action guidance and local filter chips for failed, planned, estimated, completed, unhealthy, degraded, and healthy rows. Focused helper tests cover these states. `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/provider-registry-observability-blocked-2026-05-17.md` records a local Nexus Admin capture attempt as negative evidence: the page requires a real admin session and registry data, and local `dev:pure` repeatedly exited with `EMFILE: too many open files, watch`, so no valid UI capture was produced. | Blocked after source/UI helper fix |
| Legacy AI provider table retirement has migration evidence | Dry-run or execute copied evidence summary | `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/provider-migration-dry-run.md` now records local isolated dry-runs that execute the migration API handler and real migration bridge against Mock D1, preserve `registryPrimaryReady: no`, and verify no registry or secure-store write occurs. This is still not a user-session Dashboard or real local-binding API dry-run result, so provider migration remains blocked until real copied dry-run or execute evidence is captured. | Blocked / local isolated API dry-run only |
| Browser-only smoke does not masquerade as CoreApp UI proof | Browser screenshot and console log are archived with an explicit boundary note | `docs/engineering/reports/coreapp-visible-browser-smoke-2026-05-17/` records a blank browser page and `ipcRenderer` missing because Electron preload is absent | Covered as negative evidence |
| Electron dev capture produces real UI artifacts | CDP/Playwright screenshots or recording from Electron, not a plain browser | Dev capture remains blocked under `docs/engineering/reports/coreapp-visible-electron-dev-capture-2026-05-17/`, but packaged Electron CDP on port `9334` is viable and produced partial UI artifacts under `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/` | Dev blocked / packaged partial |
| OS-level screenshot fallback is available | macOS Screen Recording permission is granted and a Tuff window screenshot is captured | Screen Recording preflight reports permission is not granted, so no fallback screenshot was captured | Blocked |
| Capture readiness is machine-checkable | `visible:experience:readiness` reports packaged, browser-smoke, Electron capture, and screen-recording readiness | Readiness command now reports packaged artifact ready for `2.4.10-beta.25`, plain-browser smoke as warning-only negative evidence, Electron dev capture blocked, and Screen Recording blocked | Covered as blocker gate |
| Evidence gate prevents proxy completion | Strict `visible:experience:verify` output against generated empty/current manifest | Verified: generated empty manifest fails strict verification, and the current manifest in `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/` still fails only on missing UI/provider artifacts after hot/cold startup passed; summary archived in `coreapp-visible-strict-verify-result.md` | Covered |
| Workbench UI direction is documented in project history | `docs/plan-prd/01-project/CHANGES.md` and `docs/plan-prd/TODO.md` | CHANGES and TODO record visible evidence tooling and current blockers | Covered |

## Current Verified Commands

These commands were run locally on 2026-05-17:

```bash
pnpm -C "apps/core-app" exec vitest run "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"
pnpm -C "apps/core-app" exec eslint "src/main/modules/platform/coreapp-visible-experience-evidence.ts" "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"
pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/box/search-state.test.ts" "src/renderer/src/views/base/settings/app-index-manager-display.test.ts" "src/renderer/src/views/omni-panel/selection-recovery.test.ts" "src/renderer/src/components/render/custom/core-intelligence-answer.test.ts" "src/renderer/src/modules/hooks/useWorkflowEditor.test.ts" "src/renderer/src/modules/intelligence/ai-error-recovery.test.ts"
pnpm -C "apps/core-app" exec eslint "src/renderer/src/views/box/search-state.ts" "src/renderer/src/views/box/search-state.test.ts" "src/renderer/src/views/base/settings/app-index-manager-display.ts" "src/renderer/src/views/base/settings/app-index-manager-display.test.ts" "src/renderer/src/views/omni-panel/selection-recovery.ts" "src/renderer/src/views/omni-panel/selection-recovery.test.ts" "src/renderer/src/components/render/custom/core-intelligence-answer.ts" "src/renderer/src/components/render/custom/core-intelligence-answer.test.ts" "src/renderer/src/modules/intelligence/ai-error-recovery.ts" "src/renderer/src/modules/intelligence/ai-error-recovery.test.ts"
pnpm -C "apps/nexus" exec vitest run "app/utils/provider-registry-admin.test.ts" "app/utils/intelligence-provider-migration.test.ts"
pnpm -C "apps/nexus" exec eslint "app/utils/provider-registry-admin.ts" "app/utils/provider-registry-admin.test.ts" "app/utils/intelligence-provider-migration.ts" "app/utils/intelligence-provider-migration.test.ts"
pnpm -C "apps/nexus" exec vitest run "app/utils/provider-registry-admin.test.ts"
pnpm -C "apps/nexus" exec eslint "app/utils/provider-registry-admin.ts" "app/utils/provider-registry-admin.test.ts" "app/composables/useProviderRegistryAdmin.ts" "app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue"
pnpm -C "apps/nexus" exec vitest run "server/utils/intelligenceProviderRegistryBridge.local-dry-run.test.ts" "app/utils/intelligence-provider-migration.test.ts"
pnpm -C "apps/nexus" exec eslint "server/utils/intelligenceProviderRegistryBridge.local-dry-run.test.ts" "test/helpers/provider-registry-test-utils.ts" "app/utils/intelligence-provider-migration.ts" "app/utils/intelligence-provider-migration.test.ts"
pnpm -C "apps/nexus" exec vitest run "test/api/dashboard/intelligence/providers/migrate.local-dry-run.api.test.ts" "server/utils/intelligenceProviderRegistryBridge.local-dry-run.test.ts"
pnpm -C "apps/nexus" run dev:pure
env CHOKIDAR_USEPOLLING=true NUXT_DISABLE_SENTRY=true pnpm -C "apps/nexus" exec nuxt dev --port 3217 --host 127.0.0.1
pnpm -C "apps/core-app" run visible:experience:template -- --evidenceDir "/private/tmp/tuff-visible-evidence-v2" --output "/private/tmp/tuff-visible-evidence-v2/coreapp-visible-experience-manifest.json" --writeChecklist
pnpm -C "apps/core-app" run visible:experience:verify -- --input "/private/tmp/tuff-visible-evidence-v2/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
git diff --check
node --check "apps/core-app/scripts/startup-benchmark-dev.mjs"
pnpm -C "apps/core-app" exec vitest run "src/main/core/runtime-modules.contract.test.ts"
pnpm -C "apps/core-app" run visible:experience:template -- --evidenceDir "../../docs/engineering/reports/coreapp-visible-evidence-2026-05-17" --output "../../docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json" --writeChecklist
pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
pnpm -C "apps/core-app" run visible:experience:readiness -- --screenRecording denied --compact
```

Additional capture attempts were run locally on 2026-05-17:

```bash
TUFF_DEV_SERVER_HOST=127.0.0.1 TUFF_DEV_SERVER_PORT=5185 pnpm -C "apps/core-app" run dev --remoteDebuggingPort 9224
TUFF_DEV_ELECTRON_BUNDLE_ID=com.tagzxia.app.tuff.visible-evidence TUFF_DEV_ELECTRON_BUNDLE_NAME="Tuff Visible Evidence" TUFF_STARTUP_BENCHMARK_ONCE=1 TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS=120000 TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/private/tmp/tuff-visible-electron-user-data TUFF_DEV_SERVER_HOST=127.0.0.1 TUFF_DEV_SERVER_PORT=5186 pnpm -C "apps/core-app" run dev --remoteDebuggingPort 9225
pnpm -C "apps/core-app" run visible:experience:readiness -- --screenRecording denied --compact
```

Packaged CDP capture was also run locally on 2026-05-17:

```bash
TUFF_STARTUP_BENCHMARK_ONCE=1 TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS=300000 TUFF_STARTUP_BENCHMARK_USER_DATA_DIR="/private/tmp/tuff-visible-cdp-user-data-2" "apps/core-app/dist/mac-arm64/tuff.app/Contents/MacOS/tuff" --remote-debugging-port=9334
```

Results:

- Visible experience focused Vitest passed.
- File-level ESLint passed.
- CoreBox result signal helper tests now cover direct `meta.resultSignal`, provider health metadata, top-level status/error, and top-level permissions.
- CoreBox result signal helper now also infers failed/degraded pills from known reason-only metadata while leaving unknown advisory reasons silent.
- CoreBox result rows now constrain the right-side status/source/quick-key signal rail and truncate long source/reason text with `title` fallbacks; rebuilt packaged CDP evidence confirms mixed source rows render without raw i18n leakage or visible signal overlap.
- CoreApp workbench UI helper tests passed for CoreBox search states, App Index manager display, OmniPanel selection recovery, CoreBox AI preview, Workflow Review Queue, and AI error recovery.
- App Index manager source now distinguishes initial empty, source-filtered empty, attention-clean, no-diagnosed-hit, all-diagnosed, and no-disabled states with a clear next action. Rebuilt packaged Electron CDP evidence now confirms the manager DOM, summary counts, filters, seeded entry state, and filtered-empty state in runtime.
- Settings login error source now classifies browser-open failure, timeout, callback/token failure, device authorization, rate limit, quota, permission, expired session, network, and service outage cases into localized recovery copy, but this does not replace packaged Electron forced-failure UI evidence.
- CoreBox AI Ask preview source now covers readable status tone/hints and metadata fallback in focused tests, but this does not replace packaged Electron answer/failure UI evidence.
- OmniPanel Writing Tools preview source now covers readable status details and labeled metadata chips in focused tests, but this does not replace packaged Electron selected-context/result/copy/replace/failure UI evidence.
- Workflow Review Queue source now covers labeled metadata chips, warning styling for medium-risk/failure states, and focused helper tests, but this does not replace packaged Electron workflow-run UI evidence.
- Nexus Provider Registry / migration utility tests passed for observability summaries, filters, action hints, and migration evidence summaries.
- Nexus Provider Registry Admin source now covers observability empty states, filter recovery, Usage Ledger / Health next-action hints, and Usage / Health local filtering, with 31 focused tests passing; this does not replace a real admin-session UI capture with registry data.
- File-level ESLint passed for the CoreApp and Nexus helper files listed above.
- Checklist generation produced per-surface collection steps, recommended artifact names, and blocked conditions.
- Strict verifier failed as expected for an empty manifest; this confirms the template cannot be used as completion evidence.
- Browser-only smoke is archived under `docs/engineering/reports/coreapp-visible-browser-smoke-2026-05-17/`; it shows a blank browser page and `ipcRenderer` missing, so it is negative evidence only.
- Electron dev capture attempts are archived under `docs/engineering/reports/coreapp-visible-electron-dev-capture-2026-05-17/`; both separate-port and isolated-bundle attempts exited after `start electron app...` without a listening remote debugging port or UI artifact.
- OS-level screenshot fallback is also blocked until macOS Screen Recording permission is granted for the terminal/Codex process.
- Packaged Electron CDP capture is viable even while dev capture and OS screenshot fallback are blocked. It produced first-screen, Settings/About, CoreBox idle, no-result, result-reason, loading-state, and App Index manager artifacts under `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/`; target inventory is archived as `cdp-target-inventory.json`.
- First-screen evidence is now covered for the current packaged artifact: the app reaches a usable onboarding/login surface, not a blank screen, and Settings/About shows version/build/startup-health, login state, and permission state.
- CoreBox search-state evidence is now covered: rebuilt packaged CDP artifacts show idle, no-result with retry/File Index settings actions, and populated result rows with localized completion/footer text (`hasRawI18n=false`) and non-overlapping source/quick-key signal rails.
- Browser login recovery source behavior is now stronger: main auth returns browser-open failure as recoverable login-start metadata and renderer copy distinguishes that state while keeping manual login URL and short code actions visible; Settings login errors now classify common recoverable failures into localized copy. Current screenshots still do not show the forced failure path.
- App Index workbench packaged evidence is now covered: rebuilt port `9338` evidence exposes `.app-index-manager`, summary counts, all source and diagnostic filters, a seeded Calculator.app entry before filtering, an active Steam filtered-empty state after filtering, and no raw i18n leakage.
- CoreBox AI Ask remains incomplete: current screenshots do not show AI answer/failure preview metadata.
- Provider migration evidence is stronger than a formatter fixture: `test/api/dashboard/intelligence/providers/migrate.local-dry-run.api.test.ts` runs the migration API handler with a mocked admin session and Mock D1, while `server/utils/intelligenceProviderRegistryBridge.local-dry-run.test.ts` runs the real migration bridge directly. Both verify `registryPrimaryReady: no`, verify the raw secret placeholder is not copied, and verify dry-run writes neither registry entries nor secure-store credentials. This is still not a user-session Dashboard or real local-binding API dry-run result, so the manifest keeps `provider-migration-evidence` blocked.
- Provider Registry Admin observability remains blocked. A local `dev:pure` capture attempt first collided with an existing non-Nexus service on `3001` after Nuxt port fallback, then an explicit `127.0.0.1:3217` run still exited with `EMFILE: too many open files, watch`. The source now improves empty/filtered observability states, filter recovery actions, Usage Ledger guidance/filtering, and Health guidance/filtering, but the source/API path still requires an active admin session and real registry data before health, usage, scene run state, filters, and next-action hints can count as evidence. The negative artifact is archived as `provider-registry-observability-blocked-2026-05-17.md`.
- Packaged runtime closure contract tests pass after fixing pnpm symlink resolution and duplicate package instance traversal for resource-side runtime modules.
- Local unpacked macOS artifact is rebuilt as `2.4.10-beta.25`, and `codesign --verify --deep --strict "apps/core-app/dist/mac-arm64/tuff.app"` completed without output.
- Packaged hot startup evidence is now valid for the current artifact: latest 10 runs pass with Startup health P50 `1700ms`, P95 `1900ms`, 0 WARN, and 0 ERROR.
- Packaged cold startup evidence is now valid for the current artifact: 10/10 runs pass with Startup health P50 `1100ms`, P95 `3400ms`, 0 WARN, and 0 ERROR. Run 01 remains the long-tail sample at Startup health `3400ms` and Renderer ready `3200ms`, so first-screen UI proof is still required.
- The visible evidence manifest is archived under `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/`; hot/cold startup, first-screen, CoreBox search-state, and App Index workbench entries are marked passed, provider migration has local isolated API/bridge dry-run evidence but remains blocked until real Dashboard/API dry-run or execute evidence, and the remaining UI/provider observability entries remain pending or blocked.
- The current strict verifier result is archived under `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-strict-verify-result.md`; exit code `1` is expected until UI/provider artifacts are attached.
- `visible:experience:readiness` now makes this blocker state explicit before a capture run: packaged artifact ready, browser-only smoke warning, Electron dev capture blocker, and Screen Recording blocker.
- `git diff --check` passed.

## Completion Audit Result

The objective is not complete.

The repo now has useful implementation slices, focused helper tests, and a stronger evidence collection gate. However, the explicit completion criteria still require real device/runtime evidence:

- browser login recovery screenshot or recording from a rebuilt packaged artifact,
- CoreBox AI Ask and OmniPanel Writing Tools UI evidence,
- Workflow Use Model / Review Queue UI evidence,
- Provider Registry observability screenshot or recording with real data,
- Provider migration dry-run or execute evidence summary from Dashboard Admin or real local API bindings, replacing the current local isolated Mock D1 API/bridge dry-run artifact,
- Windows acceptance evidence and Nexus Release Evidence credentials when release gate is in scope.

## Next Concrete Step

Do not claim completion from tests or generated manifests.

Next best action is to collect the remaining real Electron or packaged UI artifacts and attach them to the current manifest:

```bash
pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
```

The strict verifier should keep failing until login recovery, AI Ask, OmniPanel, Review Queue, Provider Admin, and real Dashboard/API provider migration evidence are attached. CoreBox search-state and App Index manager evidence are now covered by rebuilt packaged CDP artifacts; future rebuild/recapture is still required for any newly changed packaged UI surface before it can be claimed.
