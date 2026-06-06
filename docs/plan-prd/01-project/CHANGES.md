# 变更日志

> 更新时间：2026-06-06
> 说明：主文件只保留近 30 天重点索引与后续新增变更；压缩前完整快照见 `./archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。更早历史继续按月归档在 `./archive/changes/`。

## 2026-06-06

### test(search): add PreviewSDK benchmark failure summary

- `packages/utils/core-box/preview/types.ts`
- `packages/utils/core-box/preview/sdk/preview-runner.ts`
- `packages/utils/core-box/preview/abilities/advanced-expression-ability.ts`
- `packages/utils/__tests__/core-box/preview-sdk.test.ts`
- `packages/utils/__tests__/core-box/preview-sdk.benchmark.test.ts`
- `docs/plan-prd/TODO.md`
  - Added actionable PreviewSDK benchmark failures for ability mismatch and budget regression cases, including case id, expected/actual ability, status, duration and budget.
  - Tightened AdvancedExpression boundaries so time and percentage queries are no longer stolen from the more specific TimeDelta and Percentage abilities.
  - Added a static advanced-expression fast path for common whitelisted functions/constants/power expressions before falling back to `mathjs`, keeping the cold import out of the default benchmark path.
  - 验证：`pnpm -C "packages/utils" run benchmark:preview`, focused PreviewSDK Vitest, scoped Utils ESLint and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### feat(ai): clarify local skills provider gate hints

- `apps/core-app/src/renderer/src/components/intelligence/IntelligenceLocalSkills.vue`
- `apps/core-app/src/renderer/src/modules/intelligence/local-skills-display.ts`
- `apps/core-app/src/renderer/src/modules/intelligence/local-skills-display.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/TODO.md`
  - Added a focused display helper for Local Skills provider gate summaries so ready, approval-required, unavailable and installed high-risk provider counts are derived from one testable model.
  - Kept missing gated providers out of the installed high-risk approval hint while preserving unavailable counts in the gate summary.
  - Surfaced linked scene hints directly in Local Skills chips instead of only hiding them in the title tooltip.
  - 验证：CoreApp Local Skills display focused Vitest, scoped CoreApp ESLint, CoreApp `typecheck:web` and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### ref(ai): use flip dialog for provider model config

- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue`
- `docs/plan-prd/TODO.md`
  - Moved Intelligence provider model management, default model selection and instruction prompt configuration from the legacy drawer surface to the shared CoreApp `FlipDialog`.
  - Preserved provider settings data flow, model fetch/add/select handlers and `intelligenceSettings.updateProvider()` persistence behavior; this slice only changes the settings interaction surface.
  - 验证：CoreApp scoped IntelligenceModelConfig ESLint, CoreApp `typecheck:web` and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### ref(widget): add sandbox evidence diagnostics

- `packages/utils/plugin/widget.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-diagnostics.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.test.ts`
- `docs/plan-prd/04-implementation/WidgetSandboxIsolation260221.md`
- `docs/plan-prd/TODO.md`
  - Added a typed `WidgetSandboxEvidence` contract covering declared/allowed/blocked/undeclared dependencies, storage facades, window escape boundaries and the `new Function` injected-global boundary.
  - Recorded renderer-side sandbox evidence for successful widget register/update and for runtime registration failures without changing the widget execution model.
  - Extended focused widget registry tests for evidence shape, undeclared module blocking, allowlist blocking, storage/cookie isolation and sandbox window/document handles.
  - 验证：CoreApp widget registry focused Vitest, CoreApp `typecheck:web`, CoreApp `typecheck:node`, scoped CoreApp/Utils ESLint and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### ref(dialog): require trusted html marker for dialog html props

- `packages/tuffex/packages/components/src/dialog/src/types.ts`
- `packages/tuffex/packages/components/src/dialog/src/TxTouchTip.vue`
- `packages/tuffex/packages/components/src/dialog/src/TxPopperDialog.vue`
- `packages/tuffex/packages/components/src/dialog/src/TxBlowDialog.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/*.vue`
- `apps/core-app/vitest.config.ts`
- `packages/tuffex/docs/components/dialog.md`
  - Added the `TrustedDialogHtml` branded type and `asTrustedDialogHtml()` marker for dialog `messageHtml` props.
  - Kept `message` as the default plain-text path while making TuffEx and CoreApp legacy dialog HTML rendering require an explicit trusted marker at TypeScript call sites.
  - Added a CoreApp Vitest config for Vue renderer tests and extended focused dialog rendering tests plus TuffEx package type audit coverage for the trusted HTML boundary.

### docs(audit): add 2026-06-06 UI compatibility follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-06.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Added the 2026-06-06 UI/compatibility/placeholder/architecture audit follow-up.
  - Reconfirmed no new production-path P0 fixed fake-success, mock payment URL, fake empty payload or consumable placeholder response in the reviewed live tree.
  - Corrected the current worktree status: `master` and `origin/master` are synchronized, and the last pushed code baseline before this docs/audit slice is `ea0c2c93c test(search): add preview sdk benchmark command`.
  - Reclassified current high-signal risks from dirty-slice cleanup to CoreApp/TuffEx dialog trusted HTML boundary, Widget runtime sandbox evidence, UI semantic controls, `touch-music` sample plugin cleanup and Windows/macOS device evidence.
  - 验证：static scans and `git diff --check` only; no runtime code changed.

### test(search): add reproducible PreviewSDK benchmark command

- `packages/utils/__tests__/core-box/preview-sdk.benchmark.test.ts`
- `packages/utils/package.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `pnpm -C "packages/utils" run benchmark:preview` as a reproducible PreviewSDK benchmark entry using the existing `runPreviewSdkBenchmark()` helper.
  - Covered default pure PreviewSDK abilities, expected no-result and overlong-input guard cases with expected ability matches, budget exceed checks and console summary output.
  - Current benchmark result: 10/10 expected cases matched, 0 budget exceed; P50 was ~0.36ms, P95/max was ~318.79ms due to the advanced expression mathjs cold import path.
  - 验证：`pnpm -C "packages/utils" run benchmark:preview`、`pnpm -C "packages/utils" exec vitest run "__tests__/core-box/preview-sdk.test.ts"`、scoped utils ESLint and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### fix(nexus): noindex missing docs pages

- `apps/nexus/app/pages/docs/[...slug].vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `robots=noindex,nofollow` for Nexus docs pages that do not resolve to content, while keeping normal rendered docs as `index,follow`.
  - Marked SSR docs misses with HTTP 404 status so missing documentation pages are not treated as valid indexable pages.
  - 验证：`pnpm -C "apps/nexus" run typecheck`、scoped Nexus ESLint and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### feat(nexus): add docs page SEO metadata

- `apps/nexus/app/pages/docs/[...slug].vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added per-doc SEO title, description, canonical URL, Open Graph and Twitter metadata to Nexus docs pages using existing page metadata and runtime request origin.
  - Added escaped `TechArticle` JSON-LD structured data for rendered docs pages, including canonical page URL, language and modified timestamp when available.
  - 验证：`pnpm -C "apps/nexus" run typecheck`、scoped Nexus ESLint and `git diff --check` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### feat(tuffex): add adaptive date picker field calendar

- `packages/tuffex/packages/components/src/date-picker/src/TxDatePicker.vue`
- `packages/tuffex/packages/components/src/date-picker/src/types.ts`
- `packages/tuffex/packages/components/src/date-picker/__tests__/date-picker.test.ts`
- `packages/tuffex/docs/components/date-picker.md`
- `packages/tuffex/docs/.vitepress/theme/components/demos/DatePickerBasicDemo.vue`
- `apps/nexus/app/components/content/demos/DatePickerDatePickerDemo.vue`
- `apps/nexus/content/docs/dev/components/date-picker.zh.mdc`
- `apps/nexus/content/docs/dev/components/date-picker.en.mdc`
  - Added `variant="field"` and `variant="adaptive"` to `TxDatePicker`, keeping the default `picker` wheel behavior backward-compatible.
  - Added a desktop-friendly calendar field surface with min/max disabled states, week-start control, responsive mobile width and adaptive viewport switching.
  - Updated TuffEx and Nexus DatePicker demos/docs so PC field calendar and mobile picker usage are both documented.
  - 验证：`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/date-picker/__tests__/date-picker.test.ts"`、`pnpm -C "packages/tuffex" run build`、`audit:exports`、`audit:types`、`audit:size` and `pnpm -C "apps/nexus" run typecheck` passed with temporary Node `22.16.0` + pnpm `10.32.1`; scoped TuffEx/Nexus ESLint passed.

## 2026-06-05

### ref(search): add PreviewSDK diagnostics and benchmark guard

- `packages/utils/core-box/preview/types.ts`
- `packages/utils/core-box/preview/sdk/preview-registry.ts`
- `packages/utils/core-box/preview/sdk/preview-runner.ts`
- `packages/utils/__tests__/core-box/preview-sdk.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.test.ts`
  - Added `resolveWithDiagnostics()` to PreviewSDK while keeping the existing `resolve()` compatibility path.
  - Added registry-level max input length gating, resolve diagnostics, budget exceed flags and payload `meta.previewSdk` instrumentation for successful preview results.
  - Added `runPreviewSdkBenchmark()` with deterministic case summaries for expected ability matches, expected no-result cases, P50/P95/max duration and budget exceed counts.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/core-box/preview-sdk.test.ts"` passed; `pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/preview/preview-provider.test.ts" --testTimeout 15000` passed; `pnpm -C "apps/core-app" run typecheck:node` passed; scoped ESLint passed with temporary Node `22.16.0` + pnpm `10.32.1`.

### ref(core-ui): move search provider settings into flip dialog

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.css`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - Moved Settings search provider enable/order controls from the inline file-index settings row into the existing CoreApp `FlipDialog` interaction.
  - Kept the Settings row as a compact status summary plus manage entry; provider enable/order save flow, SDK calls, diagnostics loading and source-to-provider metadata remain unchanged.
  - 验证：`git diff --check` passed; `pnpm -C "apps/core-app" run typecheck:web` passed with temporary Node `22.16.0` + pnpm `10.32.1`.

## 2026-06-04

### chore(audit): complete Node 22 verification evidence

- `apps/nexus/app/components/content/demos/ComponentsFeedbackTaskCenterDemo.vue`
- `apps/nexus/app/components/content/demos/ComponentsReleasePolicyDemo.vue`
- `apps/nexus/app/components/content/demos/PickerPickerDemo.vue`
- `apps/nexus/app/components/content/TuffPropsTable.vue`
- `packages/tuffex/packages/script/build/on-demand-style-plugin.ts`
- `packages/tuffex/scripts/audit-package-types.mjs`
- `packages/utils/core-box/preview/abilities/advanced-expression-ability.ts`
- `packages/utils/core-box/preview/abilities/scientific-constants-ability.ts`
- `packages/utils/core-box/preview/abilities/time-delta-ability.ts`
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-04.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Used a temporary ad-hoc signed Node `22.16.0` runtime in `/tmp/talex-touch-node22-adhoc` plus pnpm `10.32.1` to avoid macOS Team ID rejection of Rollup/OXC native bindings without modifying repo dependency artifacts.
  - Fixed Nexus demo strict type errors, TuffEx on-demand style plugin regex capture guards, TuffEx external consumer type audit pnpm resolution, and PreviewSDK ability strict override / undefined boundaries.
  - 验证：`pnpm -C "packages/tuffex" run build`、`audit:exports`、`audit:size`、`audit:types` passed; `pnpm -C "apps/nexus" run typecheck` and `pnpm -C "apps/nexus" run build` passed; `pnpm -C "packages/utils" exec vitest run "__tests__/core-box/preview-sdk.test.ts"` passed; scoped `git diff --check` passed.
  - Nexus build completed with non-blocking warnings: UnoCSS web fonts timeout, browser externalized Node modules from shared utils, large chunks, missing `auth.*` / `pricing.*` en i18n keys, local D1 binding fallback, and OpenAI package ESM top-level `this` rewrite.
  - Nexus visual smoke was not run because no CDP browser service was available on `127.0.0.1:9224` and no Nexus dev/preview server was listening on port `3200`.

### docs(audit): add 2026-06-04 UI compatibility follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-04.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `apps/nexus/content/docs/dev/tools/tuffex.en.mdc`
- `apps/nexus/content/docs/dev/tools/tuffex.zh.mdc`
- `apps/nexus/content/docs/dev/components/foundations.en.mdc`
- `apps/nexus/content/docs/dev/components/foundations.zh.mdc`
  - Added the 2026-06-04 UI/compatibility/placeholder/architecture audit follow-up.
  - Reconfirmed no new production-path P0 fixed fake-success, mock payment URL, fake empty payload or consumable placeholder response in the reviewed live tree and dirty worktree.
  - Updated the current worktree status: `master` and `origin/master` still have no ahead delta, while the dirty worktree contains 308 tracked changes and 25 untracked files after this docs/content sync; these files must be split by related UI/SDK slices.
  - Changed Nexus TuffEx public docs so the recommended path is now `base.css` + component subpath imports + local `style.css`; the full `@talex-touch/tuffex/style.css` import is now documented only as a migration-compatible full import.
  - Routed Nexus release notes `notesHtml` through shared `sanitizeMarkdownHtml()` before `v-html`.
  - Recorded the remaining high-signal items: CoreApp/TuffEx dialog HTML boundary, Widget runtime sandbox evidence and Windows/macOS real-device evidence.
  - 验证：TuffEx `audit:exports` / `audit:size` / `audit:types` passed with Node `22.16.0` + pnpm `10.32.1`; Node 22 sanitizer smoke passed; scoped `git diff --check` passed. 2026-06-05 follow-up then completed TuffEx build, Nexus typecheck/build and PreviewSDK focused test using the temporary ad-hoc Node 22 runtime.

## 2026-06-03

### docs(audit): add 2026-06-03 UI compatibility follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-03.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added the 2026-06-03 UI/compatibility/placeholder/architecture audit follow-up.
  - Reconfirmed no new production-path P0 fixed fake-success, mock payment URL, fake empty payload or consumable placeholder response in the reviewed live tree and dirty worktree.
  - Corrected the current worktree status: `master` and `origin/master` now have no ahead delta, but the dirty worktree still contains 304 tracked changes and 23 untracked files that must be split by related UI/SDK slices.
  - Recorded that Markdown sanitizer, preload DOM construction, cloud preset fail-closed behavior and TuffEx README on-demand import guidance have entered the implementation slice, while Nexus content docs still retain old full `style.css` examples.
  - Reaffirmed the next order: TuffEx build/audit first, Nexus docs/build/visual smoke second, CoreApp renderer web typecheck third, `intelligence-uikit` typecheck fourth, then return to File write/store boundary and Windows evidence.
  - 验证：static scans only; current automation shell exposes Codex Node `v24.14.0` and no `pnpm` / `corepack`, so package build/audit/typecheck still need rerun under Volta Node `22.16.0` + `pnpm@10.32.1`.

## 2026-06-02

### ref(ui): close markdown, preference and placeholder slice

- `packages/utils/renderer/shared/markdown-sanitizer.ts`
- `packages/utils/renderer/shared/components/SharedPluginDetailReadme.vue`
- `apps/core-app/src/renderer/src/components/download/UpdatePromptDialog.vue`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/modules/storage/ui-preference-storage.ts`
- `apps/core-app/src/renderer/src/components/plugin/FeatureCard.vue`
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/styles/SectionItem.vue`
- `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`
- `packages/utils/common/storage/entity/preset-cloud-api.ts`
- `apps/nexus/app/composables/useDeviceIdentity.ts`
- `apps/nexus/app/pages/dashboard/privacy.vue`
  - Added a shared Markdown sanitizer and made shared plugin README rendering plus update release notes use safe Markdown HTML by default.
  - Rebuilt preload loading overlay DOM with `textContent` / `createElement` instead of static `innerHTML` string assembly.
  - Added CoreApp `UiPreferenceStorage` for non-sensitive UI state and moved plugin widget preview size plus group block expand state behind that facade.
  - Converted the first semantic UI slice to native buttons or explicit keyboard/focus semantics for feature cards, app list ordering/items, style section items and PluginNew back navigation.
  - Replaced the public cloud preset coming-soon placeholder with a fail-closed unavailable service that exposes `reason: "not-shipped"` while retaining the deprecated alias.
  - Clarified Nexus web `deviceId` as a local marker only and separated browser-local privacy preferences from server-backed security policy.
  - Added focused tests for Markdown sanitizer, cloud preset unavailable contract, UI preference storage and the first semantic UI slice.
  - 验证：`git diff --check` 通过；targeted Vitest commands were attempted but blocked by the current Codex Node `v24.14.0` / Rollup optional native module code-signature issue, so they still need rerun under Volta Node `22.16.0` + `pnpm@10.32.1`.

### docs(audit): add 2026-06-02 UI compatibility follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-02.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added the 2026-06-02 UI/compatibility/placeholder/architecture audit follow-up.
  - Reconfirmed no new production-path P0 fixed fake-success, mock payment URL, fake empty payload or consumable placeholder response in the reviewed live tree and dirty worktree.
  - Recorded the current TuffEx migration risk: `base.css`, component subpath `style.css`, on-demand style injection and dev/prod alias behavior must be validated together before the TuffEx/Nexus/CoreApp/Intelligence UI slices are submitted.
  - Recorded the automation environment limitation: current shell exposes Codex Node `v24.14.0` and no `pnpm` / `corepack`, while the repo expects Volta Node `22.16.0` and `pnpm@10.32.1`; `git diff --check` passed, but TuffEx build/audit/typecheck still need a normal dev environment.
  - 验证：`git diff --check` 通过；`pnpm` unavailable in this automation shell, so package audits were not executed.

## 2026-06-01

### docs(project): record next execution order

- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Updated the current worktree status after Search/Indexing Runtime and audit docs were committed as related-only batches.
  - Recorded the next execution order: first close remaining TuffEx on-demand entry/audit, Nexus/TuffEx visual smoke/page adapters, CoreApp renderer/i18n/UI migration and `intelligence-uikit` consumption slices; then return to File write/store boundary, Browser Bookmarks official plugin lifecycle, Everything productionization and broader indexed source lifecycle.
  - Reaffirmed that TuffEx/Nexus/renderer/Intelligence UI migration must not be mixed with the next File write boundary commit.
  - 验证：documentation-only update; no runtime behavior changed.

### docs(audit): add 2026-06-01 UI compatibility follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-01.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added the 2026-06-01 UI/compatibility/placeholder/architecture audit follow-up.
  - Reconfirmed no new production-path P0 fixed fake-success, mock payment URL, fake empty payload or consumable placeholder response in the reviewed live tree.
  - Recorded that TuffEx composition visual smoke now has 30/30 screenshot/JSON evidence, while Windows App indexing / Everything registry PATH / CoreBox function key / manual indexing notification still require Windows device evidence.
  - Promoted the next high-signal cleanup list: default-sanitize shared Markdown rendering, Update release notes Markdown renderer unification, preload loading overlay HTML construction, Nexus `deviceId` / privacy settings localStorage semantics, CoreApp UI preference facade, semantic clickable controls, and cloud preset capability unavailable contract.
  - 验证：documentation-only update; no runtime behavior changed.

### docs(project): record current indexing goal progress

- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Recorded the current P1-APP-DATA goal: unify cross-platform indexing apps, realtime watch routing, search recovery and provider settings behind the Search Provider / Indexed Source / Indexing Runtime SDK boundary.
  - Captured current progress: provider SDK, plugin provider registration policy, `search.root-results` permission gate, Settings provider enable/order, source-to-provider links, File progress ETA diagnostics, Browser Bookmarks consent-gated skeleton and Quicklinks linked provider enablement are in baseline.
  - Reaffirmed remaining execution order: File write/store boundary, Browser Bookmarks official plugin-owned lifecycle, Everything productionization, Quicklinks persistent feed/UI evidence, then Browser History / System Settings / Obsidian / VSCode.
  - 验证：documentation-only update; no runtime behavior changed.

### ref(search): share indexed source task state builders

- `packages/utils/search/indexing-source-runtime-task-job.ts`
- `packages/utils/search/indexing-source-task-state.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
  - Moved runtime task job identity and scan/watch/reconcile/reset task-state builders into `@talex-touch/utils/search`.
  - Rewired CoreApp IndexingRuntime to consume SDK builders for `lastScan`, `lastWatch`, `lastReconcile`, `lastReset` and recent task history while keeping the existing CoreApp compatibility re-export.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-runtime-task-job.test.ts" "__tests__/search/indexing-source-task-state.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime-task-job.test.ts" --testTimeout 15000` 通过。

### docs(project): align roadmap, TODO and quality baseline

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Captured the current post-`2.4.11-beta.6` stabilization state: Gate D strict has passed, while Windows/macOS blocking regression, release integrity debt, npm package publishing, real platform evidence and `quality:release` replacement evidence remain open.
  - Recorded the current worktree policy: the repository contains multiple dirty slices and report/TuffEx/utils untracked files, so commits must stay related-only; current first step is to close the verified Indexing Runtime / Browser Bookmarks / TuffEx focused fixes with untracked-file ownership checks and recent focused test/typecheck evidence.
  - Reaffirmed P1-APP-DATA priority order: File write/store boundary first, Browser Bookmarks official `touch-browser-data` runtime source lifecycle second, then Everything/Windows App evidence, Quicklinks feed/UI evidence and broader source lifecycle work.
  - Clarified the AI scope: AI has real CoreApp/Nexus/OmniPanel/Assistant runtime pieces, but it is not experience-complete; `2.5.0` Stable remains text + OCR only, with Workflow/Skills/Automation Beta and Assistant/voice/multimodal generation Experimental. `2.5.3` / `2.5.5` / `2.5.8` stay PRD-locked and must not be pulled into the current stabilization window.
  - 验证：documentation-only update; no runtime behavior changed.

### ref(search): default write runtime delta reasons

- `packages/utils/search/indexing-write-runtime-emitter.ts`
- `packages/utils/__tests__/search/indexing-write-runtime-emitter.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-cleanup-delete-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-delete-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-update-service.ts`
  - Added `defaultDeltaReason` to `IndexedWriteRuntimeEmitterService` so source adapters can declare stable delta reason metadata once at construction while preserving per-call explicit reason overrides.
  - Rewired FileProvider cleanup delete and reconciliation add/update/delete adapters to declare their File-specific delta reasons at the runtime emitter boundary instead of repeating them on every emit call.
  - Kept emitted delta payloads, DB delete/update wiring, SearchIndex artifact cleanup, runtime callbacks and SearchIndex/FTS semantics unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-runtime-emitter.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-update-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-delete-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-cleanup-delete-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): default reset operation reason namespace

- `packages/utils/search/indexing-source-reset-executor.ts`
- `packages/utils/__tests__/search/indexing-source-reset-executor.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.test.ts`
  - Added a constructor-level `operationReasonNamespace` default to `IndexedSourceResetExecutorService`, while keeping per-reset namespace/prefix overrides available for source adapters that need them.
  - Rewired `FileProviderRuntimeResetService` to declare the `file-index` namespace once at the adapter boundary so FileProvider reset call sites no longer repeat reset operation reason policy.
  - Kept `scan_progress` row counting/deletion, SearchIndex provider cleanup, reset result shape, DB writes and SearchIndex/FTS semantics unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-reset-executor.test.ts" "__tests__/search/indexing-source-progress-store.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share write flush runtime config defaults

- `packages/utils/search/indexing-write-flush-runtime.ts`
- `packages/utils/__tests__/search/indexing-write-flush-runtime.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts`
  - Added `resolveIndexedWriteFlushRuntimeConfig()` to the shared write flush runtime SDK so source adapters share base/backlog delay, defer delay, backpressure queue and retry backoff default normalization.
  - Rewired `FileProviderIndexRuntimeService` to consume the SDK-resolved config while keeping File-specific `dbBackpressureMaxQueued` and `busyRetry*` field names as adapter aliases.
  - Kept worker readiness, SQLite busy classification, retry/backoff behavior, DB backpressure, `persistAndIndex`, SearchIndex worker, DB writes and FTS semantics unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-runtime.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts" --testTimeout 15000` 通过。

### ref(search): share indexed write chunking policy

- `packages/utils/search/indexing-write-plan.ts`
- `packages/utils/search/indexing-write-update-executor.ts`
- `packages/utils/__tests__/search/indexing-write-plan.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-full-scan-insert-service.ts`
  - Added `chunkIndexedWriteRecords()` to the shared indexed write plan SDK so write adapters share the same safe positive chunk-size normalization and record splitting.
  - Added `takeIndexedWriteRecordChunk()` so dynamic batch adapters can share offset/chunk-size normalization without hand-slicing windows in CoreApp.
  - Added `buildIndexedWriteManualContext()` and `buildEmptyIndexedWriteManualSummary()` so incremental write adapters share manual trigger path normalization and empty manual summary semantics.
  - Rewired the shared update executor, FileProvider incremental write path, FileProvider reconciliation insert path and FileProvider full-scan insert path to use the SDK helpers instead of keeping local chunk/window/manual-context helpers in each adapter.
  - Kept incremental insert/update planning, full-scan and reconciliation upsert record shaping, queue label/timing, `full-scan.upsert` / `reconciliation.upsert` reasons, side-effect dispatch, runtime batch/delta/progress emission, DB writes and SearchIndex/FTS behavior unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts" "__tests__/search/indexing-write-update-executor.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-planner-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-full-scan-insert-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): centralize browser bookmarks provider contract

- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-source-config.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts`
  - Exported the Browser Bookmarks official provider id, consent-gated reason and runtime-bridge reason from the indexed source contract, and added `buildBrowserBookmarksOfficialProviderDescriptor()` so source diagnostics and provider enablement share one official lifecycle descriptor.
  - Rewired `browser-bookmarks-source-config` to use the shared descriptor instead of duplicating `touch-browser-data.browser-bookmarks` policy fields.
  - Added direct coverage that disabled Browser Bookmarks diagnostics, scan and watch handling do not read Chromium `Bookmarks` files, preserving the high-privacy default until explicit provider enablement.
  - Added a direct `touch-browser-data` manifest consistency test so the official search provider id, indexedSourceId, permission scopes, consent/default-state policy and metadata-only indexed source intent stay aligned with the CoreApp Browser Bookmarks provider contract.
  - Kept scanner-backed reads, runtime batch/delta emission, provider enablement semantics, persistent plugin-owned indexing status and `touch-browser-data` manifest behavior unchanged.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime-sources.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share reconciliation fallback diff

- `packages/utils/search/indexing-write-plan.ts`
- `packages/utils/__tests__/search/indexing-write-plan.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-diff-service.ts`
  - Added `resolveIndexedWriteReconciliationDiff()` to the shared indexed write plan SDK so path-record source adapters can reuse the same add/update/delete diff semantics used by File reconciliation fallback.
  - Rewired `FileProviderReconciliationDiffService.compute()` to delegate main-thread fallback diffing to the SDK helper while keeping worker invocation, fallback logging and File worker payload contracts in CoreApp.
  - Kept duplicate disk path handling, `mtime > db.mtime` update detection, reconciliation-path scoped deletion, DB writes, SearchIndex/FTS behavior and worker-first execution unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-diff-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share indexed path update record mapping

- `packages/utils/search/indexing-write-plan.ts`
- `packages/utils/__tests__/search/indexing-write-plan.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-planner-service.ts`
  - Added `mapIndexedWritePathUpdateRecord()` to the shared indexed write plan SDK so path-record adapters share existing-row identity, name/extension/size, ctime/mtime and file type/isDir update shaping.
  - Rewired FileProvider incremental write planning to keep diffing, timestamp tolerance, manual summary and File row type aliases in CoreApp while delegating update record shaping to the SDK helper.
  - Kept insert/update/unchanged decisions, invalid timestamp `Date(0)` fallback, DB persistence, SearchIndex/FTS behavior and side-effect scheduling unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-planner-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share indexed worker file payload mapping

- `packages/utils/search/indexing-write-plan.ts`
- `packages/utils/__tests__/search/indexing-write-plan.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.ts`
  - Added `mapIndexedWriteWorkerFilePayload()` to the shared indexed write plan SDK so path-record source adapters share id/path/name/displayName/extension/size/ctime/mtime worker payload shaping.
  - Rewired FileProvider index worker scheduling to keep database context checks, immediate/deferred large-file split, worker dispatch and reason suffixing in CoreApp while delegating worker payload shaping and timestamp fallback to the SDK helper.
  - Kept invalid timestamp current-time fallback, large-file `:background-content` reason semantics, chunking, worker dispatch failure handling, SearchIndex/FTS behavior and DB writes unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share indexed file source record mapping

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - Added `IndexedFileSourceRecordRow`, `toIndexedSourceRecordTimestamp()` and `mapIndexedFileSourceRecord()` to the shared indexed source SDK so path-like file source adapters share File row to `IndexedSourceRecord` mapping.
  - Rewired FileProvider to keep only source id injection while delegating recordId/stableKey/title/path/mtime/size/metadata shaping to the SDK helper.
  - Kept FileProvider DB writes, FTS/SearchIndex semantics, worker scheduling, runtime emission callbacks, and timestamp invalid-value fallback behavior unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-startup.test.ts" -t "maps file rows into indexed source records" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share indexed write date normalization

- `packages/utils/search/indexing-write-plan.ts`
- `packages/utils/__tests__/search/indexing-write-plan.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-planner-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-full-scan-run-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-full-scan-run-service.test.ts`
  - Added `toIndexedWriteDate()` to the shared indexed write plan SDK so path-record source adapters reuse the same Date / timestamp / invalid-value normalization used by default write update records.
  - Added `mapIndexedWriteFullScanUpsertRecords()` so full-scan path-record adapters share name/extension/size/ctime/mtime/lastIndexedAt/isDir/type upsert payload shaping while CoreApp still injects the current full-scan batch time.
  - Rewired FileProvider incremental write planning to keep only File row field adaptation while delegating ctime/mtime normalization to the SDK helper.
  - Rewired FileProvider full scan run to keep directory scanning, progress, insert delegation and completed-path reporting in CoreApp while delegating upsert record shaping to the SDK helper.
  - Kept insert/update/unchanged splitting, timestamp tolerance, manual summary counts, DB persist, SearchIndex/FTS semantics, and worker scheduling unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-planner-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-full-scan-run-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share indexed write timestamp normalization

- `packages/utils/search/indexing-write-plan.ts`
- `packages/utils/__tests__/search/indexing-write-plan.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts`
  - Added `toIndexedWriteTimestamp()` to the shared indexed write plan SDK so worker payload adapters reuse the same Date / number / string parsing and invalid-value rejection policy.
  - Added `mapIndexedWriteReconciliationDiskPayload()` and `mapIndexedWriteReconciliationDbPayload()` so File reconciliation worker disk/db diff payloads share path/name/extension/size/ctime/mtime/id shaping, with invalid timestamps falling back to `0` and worker string/number fields retaining `''` / `0` fallbacks.
  - Added `mapIndexedWriteReconciliationUpsertRecords()` so reconciliation add paths share upsert record shaping for path/name/extension/size/ctime/mtime/lastIndexedAt/isDir/type while CoreApp still injects the current reconciliation batch time.
  - Rewired FileProvider index worker scheduling to keep only File row to worker payload mapping, current-time fallback, and large-file background dispatch in CoreApp.
  - Rewired FileProvider reconciliation run to keep directory scanning, DB reads, diff delegation and write operation orchestration in CoreApp while delegating worker diff payload shaping to the SDK helper.
  - Rewired FileProvider reconciliation insert to keep chunked upsert, side-effect dispatch, runtime batch/delta/progress emission and source-specific reason wiring in CoreApp while delegating add upsert record shaping to the SDK helper.
  - Kept index worker scheduling, reconciliation diffing, worker dispatch, SearchIndex/FTS writes, content indexing behavior, and large-file deferred reason semantics unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): reuse indexed write dates in reconciliation writes

- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts`
  - Rewired FileProvider reconciliation insert/update record shaping to reuse `toIndexedWriteDate()` for `ctime` / `mtime`, so invalid timestamp fallback stays consistent with the shared path-record write plan boundary.
  - Kept `lastIndexedAt` current-time semantics, reconciliation diffing, DB upsert/update/delete, SearchIndex/FTS writes, side effects, and runtime delta emission unchanged.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-run-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-plan.test.ts"` 通过。

### ref(search): filter browser bookmarks watch events to Bookmarks files

- `packages/utils/search/indexing-watch-root-policy.ts`
- `packages/utils/__tests__/search/indexing-watch-root-policy.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts`
  - Added shared SDK helpers for extracting and matching watch path basenames across Unix and Windows separators, so source adapters do not need Node `path.basename()` for filename-only watch filters.
  - Rewired the Browser Bookmarks source-level watch filter through the SDK helper so runtime root routing only refreshes the source for `Bookmarks` file changes, not every file under a browser profile root.
  - Kept the existing high-privacy enablement gate unchanged and did not add persistent plugin-owned indexing or new OS watcher registration in this slice.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-watch-root-policy.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts" --testTimeout 15000` 通过；`node --test "plugins/touch-browser-data/index.test.cjs"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): align browser bookmarks lifecycle evidence with touch-browser-data consent

- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-source-config.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts`
- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
  - Changed disabled Browser Bookmarks runtime diagnostics from generic pending migration to explicit `touch-browser-data.browser-bookmarks` official-provider consent required.
  - Marked enabled Browser Bookmarks scanner evidence as a `touch-browser-data` runtime bridge with provider metadata while still reporting persistent plugin-owned indexing as incomplete.
  - Added `resolveIndexedSourceProviderConfigEnablement()` so source adapters can expose linked provider ids, configured provider ids, enabled/disabled provider ids and enablement reason in diagnostics instead of collapsing provider lifecycle to a boolean.
  - Kept the high-privacy default disabled behavior unchanged: real browser bookmark files are scanned only after the linked provider is explicitly enabled.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime-sources.test.ts" --testTimeout 15000` 通过；`node --test "plugins/touch-browser-data/index.test.cjs"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share classified write flush retry decisions

- `packages/utils/search/indexing-write-flush-retry.ts`
- `packages/utils/__tests__/search/indexing-write-flush-retry.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-retry-service.ts`
  - Added `IndexedWriteFlushRetryService.resolveClassifiedFailure()` so source adapters can inject failure classification while reusing the shared retry/backoff decision policy.
  - Rewired FileProvider index flush retry to keep only SQLite busy classification and File-specific reason names while using the SDK helper for retryable vs fallback decisions.
  - Kept retry delay/backoff defaults, SQLite busy detection, pending backlog delay, worker flush scheduling, and SearchIndex/FTS behavior unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-retry.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-flush-retry-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share scan progress reset clear decision

- `packages/utils/search/indexing-source-progress-store.ts`
- `packages/utils/__tests__/search/indexing-source-progress-store.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.ts`
  - Added `resolveIndexedSourceProgressStoreClearDecision()` so source adapters can convert completed progress row counts into a stable reset cleanup decision through the shared SDK progress-store boundary.
  - Rewired FileProvider runtime reset to keep only `scan_progress` row count/delete wiring in CoreApp while using the SDK helper for the no-op vs cleared result shape.
  - Kept Drizzle table access, DB write scheduling, SearchIndex cleanup, reset operation reasons, and FTS/search semantics unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-progress-store.test.ts" "__tests__/search/indexing-source-reset-executor.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): share integrity adapter row field mapping

- `packages/utils/search/indexing-source-integrity.ts`
- `packages/utils/__tests__/search/indexing-source-integrity.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.ts`
  - Added `renameIndexedSourceIntegrityAdapterSnapshotFields()` so source adapters can rename common `indexedRows` / `sourceRows` / `orphanedRecordsRemoved` integrity snapshot fields through a shared SDK helper.
  - Rewired FileProvider integrity snapshots to use the SDK field mapper for `ftsRows`, `filesRows`, and `orphanedKeywordsRemoved` while keeping FTS/files row counting, runtime reset, and keyword orphan cleanup unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-integrity.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.test.ts" --testTimeout 15000` 通过。

### ref(search): share write flush failure retry metadata

- `packages/utils/search/indexing-write-flush-snapshot.ts`
- `packages/utils/__tests__/search/indexing-write-flush-snapshot.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
  - Added `buildIndexedWriteFlushFailureRetryMetadata()` so source adapters can attach retry delay/reason metadata to failed flush snapshots through a shared SDK helper.
  - Rewired FileProvider index runtime failure snapshot recording to keep only SQLite busy classification in the adapter while using the SDK helper for retry metadata shape.
  - Kept `persistAndIndex`, worker readiness, retry scheduling, DB backpressure, buffer rollback, and SearchIndex/FTS behavior unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-snapshot.test.ts" "__tests__/search/indexing-write-flush-executor.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts" --testTimeout 15000` 通过。

### ref(search): share write flush batch metric metadata

- `packages/utils/search/indexing-write-flush-executor.ts`
- `packages/utils/__tests__/search/indexing-write-flush-executor.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-executor-service.ts`
  - Added `buildIndexedWriteFlushBatchMetrics()` so source adapters can derive numeric flush batch metadata through a shared SDK helper instead of hand-counting metrics in each adapter.
  - Rewired FileProvider index flush `withContent` metadata to use the SDK helper while keeping `persistAndIndex`, worker readiness, DB backpressure, buffer commit/rollback, and SearchIndex/FTS behavior unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-executor.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-flush-executor-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts" --testTimeout 15000` 通过。

### ref(search): share indexed source reset operation reason builders

- `packages/utils/search/indexing-source-reset-executor.ts`
- `packages/utils/__tests__/search/indexing-source-reset-executor.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.test.ts`
  - Added SDK helpers for reset operation reason prefixes and operation labels so source adapters no longer hand-build `remove-by-provider` and `scan-progress-reset` reason strings.
  - Rewired FileProvider runtime reset to pass the `file-index` namespace into the SDK executor while keeping DB scan_progress deletion, SearchIndex worker cleanup, worker readiness, and reset result semantics unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-reset-executor.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts" --testTimeout 15000` 通过。

### feat(search): link quicklinks providers to indexed source enablement

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/quicklinks-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/quicklinks-indexed-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/quicklinks-source-config.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime-sources.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime-sources.test.ts`
- `plugins/touch-browser-bookmarks/manifest.json`
- `plugins/touch-dev-toolbox/manifest.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added a default-enabled option to the SDK provider-to-source enablement helper so low-privacy sources can stay available while still honoring explicit source disable and linked provider enablement.
  - Linked the official browser-bookmarks quicklinks provider and dev-toolbox provider to the `quicklinks` runtime source through `indexedSourceId: "quicklinks"`.
  - Added CoreApp `quicklinks-source-config` and wired `QuicklinksIndexedSource` to provider config, including disabled health/evidence/reconcile/open behavior through `quicklinks-provider-disabled`.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/quicklinks-indexed-source.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime-sources.test.ts" --testTimeout 15000` 通过。

### ref(search): move runtime task job ids into SDK

- `packages/utils/search/indexing-source-runtime-task-job.ts`
- `packages/utils/__tests__/search/indexing-source-runtime-task-job.test.ts`
- `packages/utils/search/indexing-source-task-state.ts`
- `packages/utils/__tests__/search/indexing-source-task-state.test.ts`
- `packages/utils/search/index.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime-task-job.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime-task-job.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
  - Moved `IndexedSourceRuntimeTaskJobFactory` to `@talex-touch/utils/search` so scan/watch/reconcile/reset job id and queuedAt generation use a shared SDK primitive instead of a CoreApp-private helper.
  - Added `buildIndexedSourceScanTaskState()` so scan `lastScan` and `recentTasks` history entries are built through the SDK task-state boundary instead of being hand-assembled inside `IndexingRuntime`.
  - Added `buildIndexedSourceWatchTaskState()`, `buildIndexedSourceReconcileTaskState()` and `buildIndexedSourceResetTaskState()` so watch applied delta, handler/store failure, reconcile results/failures/skips, reset results and their `last*` / `recentTasks` history entries use the shared SDK task-state builder.
  - Kept the CoreApp `indexing-runtime-task-job` entry as a compatibility re-export, preserving existing imports and job id format while preparing the task history boundary for durable job history.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-runtime-task-job.test.ts" "__tests__/search/indexing-source-task-state.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime-task-job.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): map flush idle/result snapshots through SDK helper

- `packages/utils/search/indexing-write-flush-snapshot.ts`
- `packages/utils/__tests__/search/indexing-write-flush-snapshot.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
  - Added `buildIndexedWriteFlushIdleSnapshot()` so source adapters can record unavailable, no-pending and in-progress idle trace snapshots without hand-mapping status, zero entries, pending/inflight counts and reason fields.
  - Added `buildIndexedWriteFlushResultSnapshot()` so source adapters can record flush trace snapshots from executor results without hand-mapping status, counts, metadata and duration fields.
  - Rewired FileProvider index runtime flush trace recording to use the SDK snapshot builders while keeping SQLite persist, worker readiness, retry scheduling and SearchIndex/FTS behavior unchanged.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-snapshot.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(tuffex): add base style entry and lazy heavy component loading

- `packages/tuffex/package.json`
- `packages/tuffex/packages/script/build/index.ts`
- `packages/tuffex/packages/components/src/scroll/src/TxScroll.vue`
- `packages/tuffex/packages/components/src/scroll/src/better-scroll-pull-plugins.ts`
- `packages/tuffex/packages/components/src/scroll/src/scroll-wheel.ts`
- `packages/tuffex/packages/components/src/code-editor/src/TxCodeEditor.vue`
- `packages/tuffex/packages/components/src/code-editor/src/TxCodeEditorRuntime.vue`
- `packages/tuffex/packages/components/src/code-editor/__tests__/code-editor.test.ts`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/base-anchor/src/base-anchor-motion.ts`
- `packages/tuffex/packages/components/src/base-anchor/__tests__/base-anchor.test.ts`
- `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue`
- `packages/tuffex/packages/components/src/flip-overlay/src/flip-overlay-motion.ts`
- `packages/tuffex/packages/components/src/radio/src/TxRadioGroup.vue`
- `packages/tuffex/packages/components/src/radio/src/radio-group-indicator.ts`
- `packages/tuffex/packages/components/src/radio/src/radio-group-model.ts`
- `packages/tuffex/packages/components/src/radio/__tests__/radio.test.ts`
- `packages/tuffex/packages/components/src/base-surface/src/TxBaseSurface.vue`
- `packages/tuffex/packages/components/src/base-surface/src/base-surface-math.ts`
- `packages/tuffex/packages/components/src/base-surface/src/base-surface-motion.ts`
- `packages/tuffex/packages/components/src/base-surface/__tests__/base-surface.test.ts`
- `packages/tuffex/scripts/audit-package-exports.mjs`
- `packages/tuffex/scripts/audit-package-size.mjs`
- `packages/tuffex/packages/script/build/component-styles.ts`
- `packages/tuffex/README.md`
- `packages/tuffex/README_ZHCN.md`
- `packages/tuffex/CHANGELOG.md`
- `docs/plan-prd/TODO.md`
  - Added `@talex-touch/tuffex/base.css` as a stable basic style entry for shared tokens and global utilities, while keeping `@talex-touch/tuffex/style.css` as the full stylesheet compatibility entry.
  - Extended `audit:size` with a `base.css` budget so the new on-demand style baseline cannot silently grow.
  - Changed `TxScroll` to load BetterScroll `pull-down` / `pull-up` plugins only when `pullDownRefresh` / `pullUpLoad` is enabled, avoiding static plugin pulls for the default scroll path.
  - Moved the pull plugin install state into a small scroll helper and added `scroll` to the on-demand import graph audit so the default scroll entry is pinned to the `scroll` component directory.
  - Moved `TxScroll` wheel / bounce guard / RAF apply runtime into `useScrollWheel`, reducing the SFC from 887 lines to 613 lines while keeping native fallback, BetterScroll setup, public expose methods and template bindings intact.
  - Changed `TxCodeEditor` to a lightweight async wrapper and moved CodeMirror/YAML runtime implementation into `TxCodeEditorRuntime`, so the default `code-editor` entry only loads the heavy editor stack when the component is rendered.
  - Extended `audit:size` to forbid static `@codemirror/*`, `@lezer/*`, and `yaml` imports from the default `code-editor` entry.
  - Changed empty-state wrapper style entries (`blank-slate`, `empty`, `error-state`, `guide-state`, `loading-state`, `no-data`, `no-selection`, `offline-state`, `permission-state`, `search-empty`) to lightweight imports of `empty-state/style.css` instead of duplicating the full EmptyState CSS in every wrapper entry.
  - Extended `audit:size` with a 128-byte budget for those style aliases so wrapper styles cannot silently grow back to copied EmptyState CSS.
  - Moved `TxBaseAnchor` GSAP animation state/timeline handling into `useBaseAnchorMotion`, leaving the SFC focused on anchoring, floating positioning, events and rendering.
  - Changed BaseAnchor GSAP loading to dynamic import and extended `audit:size` so default `base-anchor`, `button` and `select` on-demand static graphs cannot pull `gsap` back in.
  - Moved `TxFlipOverlay` GSAP tween/stack-card motion handling into `useFlipOverlayMotion`, leaving the SFC focused on overlay state, source resolution, body lock, close guards and rendering.
  - Changed FlipOverlay GSAP loading to dynamic import and extended `audit:size` so the default `flip-overlay` on-demand static graph cannot pull `gsap` back in.
  - Moved `TxRadioGroup` delayed v-model commit logic into `useRadioGroupModel` and button indicator motion, drag, dark-mode sync and keyboard navigation into `useRadioGroupIndicator`, reducing the SFC from 1150 lines to 326 lines without changing public props, events, template classes or exports.
  - Extended `audit:size` with a `radio` on-demand graph budget so the default `radio` entry stays pinned to `radio` and `glass-surface` component dirs.
  - Moved `TxBaseSurface` finite value parsing helpers into `base-surface-math` and auto-detect / settle / refraction recovery RAF lifecycle into `useBaseSurfaceMotion`, reducing the SFC from 1150 lines to 725 lines while preserving root classes, CSS variables, props and rendered layer structure.
  - Extended `audit:size` with a `base-surface` on-demand graph budget so the default `base-surface` entry stays pinned to `base-surface` and `glass-surface` component dirs.
  - 验证：`pnpm -C "packages/tuffex" run build` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/base-anchor/src/TxBaseAnchor.vue" "packages/components/src/base-anchor/src/base-anchor-motion.ts" "packages/components/src/base-anchor/__tests__/base-anchor.test.ts" "packages/components/src/scroll/src/TxScroll.vue" "packages/components/src/scroll/src/better-scroll-pull-plugins.ts" "packages/components/src/scroll/src/scroll-wheel.ts" "packages/script/build/index.ts" "packages/script/build/component-styles.ts" "scripts/audit-package-exports.mjs" "scripts/audit-package-size.mjs"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/flip-overlay/src/TxFlipOverlay.vue" "packages/components/src/flip-overlay/src/flip-overlay-motion.ts" "packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts" "scripts/audit-package-size.mjs"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/radio/src/TxRadioGroup.vue" "packages/components/src/radio/src/radio-group-indicator.ts" "packages/components/src/radio/src/radio-group-model.ts" "packages/components/src/radio/__tests__/radio.test.ts" "scripts/audit-package-size.mjs"` 通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/base-surface/src/TxBaseSurface.vue" "packages/components/src/base-surface/src/base-surface-motion.ts" "packages/components/src/base-surface/src/base-surface-math.ts" "packages/components/src/base-surface/__tests__/base-surface.test.ts" "scripts/audit-package-size.mjs"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/base-anchor/__tests__/base-anchor.test.ts"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/scroll/__tests__/scroll.test.ts" "packages/components/src/scroll/__tests__/scroll-export.test.ts"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/code-editor/__tests__/code-editor.test.ts" "packages/components/src/code-editor/__tests__/code-editor-toolbar.test.ts"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/empty-state/__tests__/empty-state.test.ts" "packages/components/src/empty-state/__tests__/empty-state-wrappers.test.ts"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/radio/__tests__/radio.test.ts"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/base-surface/__tests__/base-surface.test.ts"` 通过；`pnpm -C "packages/tuffex" run audit:exports` 通过；`pnpm -C "packages/tuffex" run audit:types` 通过；`pnpm -C "packages/tuffex" run audit:size` 通过。

### ref(search): map File integrity snapshots and evidence through SDK helpers

- `packages/utils/search/indexing-source-integrity.ts`
- `packages/utils/__tests__/search/indexing-source-integrity.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.ts`
  - Added `mapIndexedSourceIntegritySnapshot()` so source adapters can consume SDK-standard integrity snapshots without each adapter re-mapping the common reset/duration/orphan-cleanup fields by hand.
  - Added `IndexedSourceIntegrityEvidenceService()` so source adapters can expose integrity diagnostics evidence without hand-mapping ready/degraded status, itemCount, checkedAt, reason and metadata fields.
  - Rewired FileProvider integrity checks to keep only File-specific FTS/files row naming and orphan keyword cleanup while reusing the SDK snapshot adapter mapping.
  - Rewired FileProvider `file-provider:integrity` evidence to keep only File-specific evidence id/label/reason and `ftsRows` / `filesRows` metadata naming while reusing the SDK evidence builder.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-integrity.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): move scan progress unavailable-store summary into SDK

- `packages/utils/search/indexing-source-progress-store.ts`
- `packages/utils/__tests__/search/indexing-source-progress-store.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.ts`
  - Extended `IndexedSourceProgressStoreService.summarizeRoots()` with an explicit `isStoreAvailable` option, so source adapters can treat all watch roots as pending when completed-root storage is unavailable and no completed paths were loaded.
  - Rewired FileProvider scan progress summary to pass only store availability into the SDK primitive while keeping Drizzle `scan_progress` select/delete, worker readiness and `upsertScanProgress` injection in the FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-progress-store.test.ts" "__tests__/search/indexing-source-progress-evidence.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.test.ts" --testTimeout 15000` 通过。

### feat(search): add quicklinks indexed source skeleton

- `apps/core-app/src/main/modules/box-tool/search-engine/quicklinks-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/quicklinks-indexed-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime-sources.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added a low-privacy `quicklinks` runtime source skeleton using the shared Quicklinks descriptor template and `IndexedWriteRuntimeEmitterService`.
  - Supports injected quicklink snapshots for scan batches, reconcile/watch change deltas, source health/evidence, and reset/open/clear lifecycle contract validation while keeping real plugin storage out of this slice.
  - Default empty source reports degraded `quicklinks-empty` diagnostics instead of pretending content exists.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/quicklinks-indexed-source.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### fix(nexus): close TuffEx composition visual smoke evidence

- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/components/LanguageToggle.vue`
- `apps/nexus/scripts/tuffex-visual-smoke.mjs`
- `packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue`
- `packages/tuffex/packages/components/src/drawer/src/TxDrawer.vue`
  - Fixed Nexus docs mobile visual smoke overflow caused by fixed/page overlays resolving against the wider mobile layout viewport in CDP, plus hidden language floating content contributing to root scroll width.
  - Hardened the TuffEx composition smoke retry path so transient Nuxt/CDP ready failures are captured as structured scenario results and retried once without hiding real overflow, console, page error, or bad-response failures.
  - Kept the docs-page hydration guard and `useToast()` path so the composition page no longer mounts a private `vue-sonner` host during hydration.
  - Evidence: `TUFFEX_CDP_URL="http://127.0.0.1:9222" NEXUS_VISUAL_SMOKE_URL="http://127.0.0.1:3201" pnpm -C "apps/nexus" run visual:smoke:tuffex` passed 30/30 scenarios; report at `output/playwright/tuffex-visual-smoke/2026-06-01/tuffex-composition-smoke-report.json`.
  - 验证：`pnpm -C "apps/nexus" exec eslint "app/components/LanguageToggle.vue" "app/layouts/docs.vue" "app/pages/docs/[...slug].vue" "scripts/tuffex-visual-smoke.mjs"` 通过；`pnpm -C "packages/tuffex" exec vitest run "packages/components/src/gradual-blur/__tests__/gradual-blur.test.ts" "packages/components/src/drawer/__tests__/drawer.test.ts" "packages/components/src/tabs/__tests__/tabs.test.ts"` 通过；`git diff --check` 通过。

## 历史归档

- [压缩前完整快照（截至 2026-05-14）](./archive/changes/CHANGES-pre-doc-compression-2026-05-14.md)
- [2026-03 历史归档](./archive/changes/CHANGES-2026-03.md)
- [2026-02 历史归档](./archive/changes/CHANGES-2026-02.md)
- [2025-11 历史归档](./archive/changes/CHANGES-2025-11.md)
- [Legacy full snapshot](./archive/changes/CHANGES-legacy-full-2026-03-16.md)

## 2026-05-31

### ref(tuffex): add component subpath exports

- `packages/tuffex/package.json`
- `packages/tuffex/packages/components/vite.config.js`
- `packages/tuffex/packages/script/build/component-styles.ts`
- `packages/tuffex/packages/script/build/component-declarations.ts`
- `packages/tuffex/packages/script/build/index.ts`
- `packages/tuffex/scripts/audit-package-exports.mjs`
- `packages/tuffex/scripts/audit-package-types.mjs`
- `packages/tuffex/scripts/audit-package-size.mjs`
- `packages/tuffex/packages/components/src/switch/index.ts`
- `apps/core-app/src/renderer/src/modules/tuffex/index.ts`
- `packages/tuff-business/src/components/TxPluginMetaHeader.vue`
- `packages/intelligence-uikit/src/**/*`
- `apps/nexus/app/components/ui/{Input,Switch,FlatButton,SearchInput}.vue`
- `apps/nexus/app/components/{HeaderControls.vue,auth/*}`
- `apps/nexus/app/pages/{forgot-password,reset-password,verify-waiting,device-auth}.vue`
- `apps/nexus/app/pages/{auth/*,sign-in/**/*,team/join}.vue`
- `apps/core-app/tsconfig.web.json`
- `packages/tuffex/tsconfig.json`
- `packages/tuffex/README.md`
- `packages/tuffex/README_ZHCN.md`
- `packages/tuffex/CHANGELOG.md`
  - Added stable `@talex-touch/tuffex/<component>` exports backed by existing preserveModules output, plus generated `<component>/style.css` local stylesheet entrypoints for stricter style budgets.
  - Added `src/utils/index.ts` as a build entry so `@talex-touch/tuffex/utils` is backed by real ES/CJS JS wrappers instead of a declaration-only path.
  - Added declaration post-processing and `audit:types` so exported subpath declarations compile in an external TypeScript project with `skipLibCheck=false`, including dist-local utils declarations.
  - Extended `audit:size` with representative on-demand runtime import graph checks for `button`, `input`, `select`, and `code-editor`, preventing subpath entries from reaching the root package entrypoints or unexpected component directories.
  - Rewired Core App controlled TuffEx registration to lazy-load enabled components from subpath modules instead of dynamically importing the root package.
  - Migrated Core App renderer TuffEx consumption from the root package to component subpaths, reducing renderer root TuffEx import files from 150 to 0 and tightening `audit:size` to keep that budget at 0.
  - Migrated `tuff-business` and `intelligence-uikit` runtime imports to TuffEx subpaths, then tightened their root-import budgets to 0.
  - Migrated Nexus app TuffEx consumption to component subpaths across wrappers, auth/sign-in flows, docs, store/search/dialog surfaces, dashboard/admin pages, provider/intelligence panels, asset create flow, and component demos, reducing Nexus app root TuffEx import files from 94 to 0 and tightening `audit:size` to keep that budget at 0.
  - Added a TuffEx on-demand style Vite plugin for release/package consumption so component subpath imports can auto-inject matching `<component>/style.css`; Core App and Nexus dev aliases keep source SFC styles active and disable plugin injection in workspace-source mode to avoid duplicate CSS.
  - Migrated Core App, Nexus, and `intelligence-uikit` app-level styles from `@talex-touch/tuffex/style.css` to `@talex-touch/tuffex/base.css` plus local component style imports, and extended `audit:size` to keep full-style imports at 0 for Core App renderer, Nexus app/config, `tuff-business`, and `intelligence-uikit`.
  - Changed `TxButton` to lazy-load `v-wave` through a local directive wrapper, keeping the default `button` subpath free of static `v-wave` just like the existing GSAP and CodeMirror lazy-loading budgets.
  - 验证：`pnpm -C "packages/tuffex" run build` 退出码 0；`pnpm -C "packages/tuffex" run audit:exports` 通过；`pnpm -C "packages/tuffex" run audit:types` 通过；`pnpm -C "packages/tuffex" run audit:size` 通过；`pnpm -C "apps/core-app" run typecheck:web` 退出码 0（会先触发同一 TuffEx build）；`pnpm -C "packages/intelligence-uikit" run typecheck` 通过；`pnpm -C "apps/core-app" exec eslint "src/renderer/src/modules/tuffex/index.ts"` 通过；Nexus changed-file ESLint for the migrated wrapper/auth/sign-in files passed. `pnpm -C "apps/nexus" exec vue-tsc --noEmit --skipLibCheck` remains blocked by pre-existing unrelated demo and `packages/utils/core-box/preview/abilities/*` strictness errors, with no errors in this migration slice.
  - 2026-06-01 复核：`pnpm -C "packages/tuffex" run build` 通过且无 dts TypeScript error；`audit:size` / `audit:exports` / `audit:types` 均通过；`pnpm -C "packages/tuffex" exec eslint "packages/components/src/button/src/button.vue" "packages/script/build/on-demand-style-plugin.ts" "scripts/audit-package-size.mjs"` 通过；`pnpm -C "packages/intelligence-uikit" run typecheck` 通过。`pnpm -C "apps/core-app" exec vue-tsc --noEmit -p "tsconfig.web.json" --pretty false` 仍被既有 `@talex-touch/tuff-business` / `@talex-touch/tuff-intelligence` composite include 边界 TS6307 阻塞，TuffEx 子路径相关 TS6307 已清除。
  - Remaining follow-up: retire global style reliance in app entrypoints where it materially improves chunking and continue splitting the remaining heavy components such as `TxBaseSurface` into focused helpers.

### docs(audit): add 2026-05-31 UI compatibility follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-31.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added the 2026-05-31 UI/compatibility/placeholder/architecture audit follow-up.
  - Confirmed no new production-path P0 fixed fake-success in this pass.
  - Marked TuffEx Tabs Fragment / async component name validation, TuffEx visual smoke evidence, TuffEx subpath export audit, shared README Markdown sanitization, UI preference facade, semantic click cleanup, and cloud preset unavailable contract as the next P1 follow-up items.

### ref(search): add indexed write runtime emitter helper

- `packages/utils/search/indexing-write-runtime-emitter.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-write-runtime-emitter.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-full-scan-insert-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-cleanup-delete-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-update-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedWriteRuntimeEmitterService` so source adapters can map persisted records into `IndexedSourceRecordBatch`, add/change/delete deltas and progress snapshots without duplicating runtime output plumbing.
  - Rewired FileProvider full-scan insert, cleanup delete, reconciliation insert/update/delete, and App/File watch delta builders to use the SDK emitter while keeping File/App row mapping, DB upsert/update/delete, source-specific reasons and runtime callback wiring in the provider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-runtime-emitter.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-full-scan-insert-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-update-service.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-cleanup-delete-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-delete-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-insert-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-reconciliation-update-service.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-startup.test.ts" "src/main/modules/box-tool/addon/apps/app-provider.test.ts" -t "watch|handleIndexedSourceWatchEvent|delete"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): build runtime record batches with emitter

- `packages/utils/search/indexing-write-runtime-emitter.ts`
- `packages/utils/__tests__/search/indexing-write-runtime-emitter.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added `IndexedWriteRuntimeEmitterService.buildBatch()` so sources can construct `IndexedSourceRecordBatch` through the same mapper used by `emitBatch()` without requiring an emit sink.
  - Rewired AppProvider scan batches to use the runtime emitter builder and reject unexpected source ids instead of hand-writing batch mapping in the provider.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-runtime-emitter.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts" -t "returns indexed source record batches from app scans" --testTimeout 15000` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): emit browser bookmark runtime records through emitter

- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Rewired Browser Bookmarks scanner-backed scan batches, reconcile refresh deltas, and watch refresh deltas to reuse `IndexedWriteRuntimeEmitterService` instead of hand-writing source-specific runtime output objects.
  - Kept high-privacy enablement unchanged: real browser bookmark files are still read only when `browser-bookmarks` or `touch-browser-data.browser-bookmarks` is explicitly enabled through provider config.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### ref(search): add indexed source snapshot cache helper

- `packages/utils/search/indexing-source-snapshot-cache.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-snapshot-cache.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceSnapshotCacheService` for short-TTL source diagnostics snapshots with concurrent load de-duplication, failed-load non-caching and explicit clear semantics.
  - Rewired Browser Bookmarks diagnostics health/roots/evidence reads to share one scanner snapshot per diagnostics refresh while clearing the cache before scan/reconcile/watch/reset maintenance paths.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-snapshot-cache.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed source profile diagnostics helper

- `packages/utils/search/indexing-source-profile-diagnostics.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-profile-diagnostics.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceProfileDiagnosticsService` so Browser Data/profile-like sources can map per-browser/profile diagnostics into `IndexedSourceEvidence` and `IndexedSourceRoot` without duplicating rootCount, roots, status, itemCount, reason, and metadata plumbing.
  - Rewired Browser Bookmarks runtime skeleton to use the SDK helper for scanner diagnostics while keeping Chromium discovery, parsing, record mapping, high-privacy enablement, and migration ownership in the CoreApp boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-profile-diagnostics.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed source diagnostics summary helper

- `packages/utils/search/indexing-source-diagnostics-summary.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-diagnostics-summary.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-diagnostics-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `summarizeIndexedSourceHealth()` and `buildIndexedSourceDiagnosticsSummary()` so runtimes and official plugin tooling share the same `total` / `byStatus` / `ready` / `degraded` / `unavailable` diagnostics summary rules.
  - Rewired CoreApp `SourceDiagnosticsService` to delegate health summary aggregation to the SDK while keeping source reads, logging and diagnostics shape in the runtime boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-diagnostics-summary.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts" -t "aggregates source health diagnostics|converts health failures into source-level error diagnostics"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed source error health helper

- `packages/utils/search/indexing-source-error-health.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-error-health.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-diagnostics-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `getIndexedSourceErrorMessage()` and `buildIndexedSourceErrorHealth()` so runtimes and official plugin adapters can map thrown health errors into the same `IndexedSourceHealth` error shape without duplicating fallback status/watch/reconcile fields.
  - Rewired CoreApp `SourceDiagnosticsService` to use the SDK helper while keeping diagnostics logging and aggregation in the runtime boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-error-health.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts" -t "converts health failures into source-level error diagnostics"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed source root evidence helper

- `packages/utils/search/indexing-source-root-evidence.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-root-evidence.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceRootEvidenceService` so source adapters can map root lists into `IndexedSourceEvidence` with consistent rootCount, roots, ready/degraded state, checkedAt, and empty reason.
  - Rewired AppProvider watch-roots evidence to use the SDK root evidence helper while keeping watch-root path reading in the AppProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-root-evidence.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts" -t "exposes app indexed source evidence"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed source grouped evidence helper

- `packages/utils/search/indexing-source-grouped-evidence.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-grouped-evidence.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceGroupedEvidenceService` so multi-sub-source adapters can map grouped scanner results into `IndexedSourceEvidence` with consistent ready/degraded, empty/error reason, itemCount, sourceLabel, and metadata behavior.
  - Rewired AppProvider Windows scanner evidence to use the SDK grouped evidence helper while keeping platform key/label mapping, the manual synthetic row, and DB metadata fallback in the AppProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-grouped-evidence.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts" -t "prefers Windows scanner grouped source evidence|exposes app indexed source evidence"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed write flush failure snapshot helper

- `packages/utils/search/indexing-write-flush-snapshot.ts`
- `packages/utils/__tests__/search/indexing-write-flush-snapshot.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `buildIndexedWriteFlushFailureSnapshot()` and `getIndexedWriteFlushResultFromError()` so source adapters can convert thrown flush errors plus retry metadata into failed snapshots without duplicating fallback pending/inflight/error metadata logic.
  - Rewired `FileProviderIndexRuntimeService` to use the SDK failure snapshot helper while keeping retry decisions, SQLite busy classification, worker readiness, DB persist, SearchIndex worker, and FTS semantics at the FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-snapshot.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed write flush evidence mapper

- `packages/utils/search/indexing-write-flush-evidence.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-write-flush-evidence.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedWriteFlushEvidenceService` so source adapters can map latest flush snapshots into `IndexedSourceEvidence` without hand-rolling ready/degraded status, itemCount, and metadata plumbing.
  - Rewired FileProvider `file-provider:index-flush` evidence to keep only the File source id/label adapter boundary; DB persist, worker readiness, SearchIndex worker, and FTS semantics remain at the existing FileProvider/SearchIndex worker boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-evidence.test.ts" "__tests__/search/indexing-source-progress-evidence.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-flush-executor-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed write flush result mapper

- `packages/utils/search/indexing-write-flush-executor.ts`
- `packages/utils/__tests__/search/indexing-write-flush-executor.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-executor-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `mapIndexedWriteFlushExecutorResult()` so source adapters can map SDK executor statuses and numeric metadata fields without reimplementing result-shape plumbing.
  - Rewired `FileProviderIndexFlushExecutorService` to use the SDK result mapper for `not-ready` to `worker-not-ready` and `withContent` extraction, keeping SQLite persist, worker readiness, and evidence semantics in the FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-flush-executor.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-flush-executor-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add entry-keyed indexed write buffer

- `packages/utils/search/indexing-write-buffer.ts`
- `packages/utils/__tests__/search/indexing-write-buffer.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedEntryKeyedWriteBufferService` so worker payload buffers can derive their key from the payload while reusing the shared pending/inflight enqueue, take, commit, rollback, and size semantics.
  - Rewired `FileProviderIndexFlushBufferService` to use the SDK entry-keyed buffer and keep only the File worker `fileId` key selector in the FileProvider adapter.
  - Documented that this continues moving index-worker flush buffering toward source-agnostic SDK primitives without moving SQLite persist, SearchIndex worker, or FTS semantics yet.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-write-buffer.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-index-flush-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): centralize indexed source runtime run gate

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Moved shared `IndexedSourceTaskRunGate` ownership into `IndexingRuntime`, then injected the same gate into default scan and reconcile schedulers across constructor and `setStore()`.
  - Rewired `resetSourceRuntimeState()` through the same source/kind running guard, returning structured `reset-already-running` diagnostics instead of duplicating shared SearchIndex cleanup or source-local reset work.
  - Cleared the runtime-owned run gate from `IndexingRuntime.clear()` so teardown does not leave stale in-memory running state.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`git diff --check` 通过。

### ref(search): add indexed source task run gate

- `packages/utils/search/indexing-source-task-run-gate.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-task-run-gate.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-scan-scheduler.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-scan-scheduler.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-reconcile-scheduler.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-reconcile-scheduler.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceTaskRunGate` for source/kind running and debounce admission decisions.
  - Rewired ScanScheduler and ReconcileScheduler to share the SDK run gate while preserving the existing same-source running rejection behavior.
  - Documented that this is still an in-memory run gate and not durable job history, retry, or automatic recovery.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-task-run-gate.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-scan-scheduler.test.ts" "src/main/modules/box-tool/search-engine/indexing-reconcile-scheduler.test.ts"` 通过。

### ref(search): add indexed source recovery recommendation policy

- `packages/utils/search/indexing-source-recovery-policy.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-recovery-policy.test.ts`
- `apps/core-app/src/renderer/src/modules/search/indexing-source-diagnostics-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/indexing-source-diagnostics-display.{ts,test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `resolveIndexedSourceRecoveryRecommendation()` to map admission/lifecycle issues, permission/disabled states, failed or stalled progress, recent failed/skipped tasks, and degraded/error health into one read-only recovery recommendation.
  - Updated Advanced Settings source diagnostics to show a recovery chip while keeping actual scan/reconcile/reset availability under `resolveIndexedSourceMaintenanceActions()` and runtime eligibility guards.
  - Documented that recovery recommendation is diagnostic guidance only and not a durable job scheduler or automatic recovery executor.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-recovery-policy.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/indexing-source-diagnostics-display.test.ts"` 通过。

### ref(search): add indexed source maintenance action policy

- `packages/utils/search/indexing-source-maintenance-action.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-maintenance-action.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.test.ts`
- `apps/core-app/src/renderer/src/modules/search/indexing-source-diagnostics-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/indexing-source-diagnostics-display.{ts,test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `resolveIndexedSourceMaintenanceActions()` so Settings, no-result recovery, and future official plugin settings share one scan/reconcile/reset action policy with blocked reasons.
  - Rewired CoreApp single-source `scanSource()` / `reconcileSource()` to run the same runtime eligibility guard used by batch maintenance and record skipped diagnostics instead of invoking disabled, permission-required, unsupported, or admission-invalid sources.
  - Updated Advanced Settings source diagnostics to disable unavailable maintenance buttons through the shared SDK policy.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-maintenance-action.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/indexing-source-diagnostics-display.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过；`pnpm -C "apps/core-app" run typecheck:web` 命令退出码 0，但 TuffEx build 阶段仍打印既有 `TxDrawer.vue` dts TS7022/TS7024 诊断。

### ref(search): lift indexed source task state helper

- `packages/utils/search/indexing-source-task-state.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-task-state.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `updateIndexedSourceTaskState()` so runtime task state updates share the same newest-first bounded `recentTasks` rule as `appendIndexedSourceTaskHistory()`.
  - Rewired `IndexingRuntime` scan/watch/reconcile/reset diagnostics to update last* task state and history through the SDK helper instead of mutating local task state directly.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-task-state.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### ref(search): lift indexed auto scan preflight policy

- `packages/utils/search/indexing-auto-scan-policy.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-auto-scan-policy.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `resolveIndexedAutoScanPreflight()` for source-agnostic auto-scan skip reason priority across disabled, initializing, missing-context, no-paths, app-busy, search-active, and interval gates.
  - Rewired `FileProviderWatchService.shouldRunAutoIndexing()` to run early SDK preflight before reading `scan_progress`, then reuse the same SDK decision after scan eligibility is known.
  - Kept real `appTaskGate`, search activity, idle/battery checks, DB reads, and background task registration inside the CoreApp/FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-auto-scan-policy.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### ref(search): lift indexed scan strategy policy

- `packages/utils/search/indexing-scan-strategy.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-scan-strategy.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-scan-strategy-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `resolveIndexedScanStrategy()` for splitting watch roots into first-time full-scan roots and existing-root reconciliation roots from completed path state.
  - Rewired `FileProviderScanStrategyService` to keep completed-path loading, yield, timing, and logging in CoreApp while delegating source-agnostic scan strategy to the SDK primitive.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-scan-strategy.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-scan-strategy-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### ref(search): lift indexed scan eligibility policy

- `packages/utils/search/indexing-scan-eligibility.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-scan-eligibility.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `resolveIndexedScanEligibility()` and `toIndexedScanTimestamp()` for source-agnostic auto-scan new root, stale root, and latest scan timestamp calculation.
  - Rewired `FileProviderWatchService.getScanEligibility()` to read `scan_progress` in CoreApp but delegate eligibility calculation to the SDK primitive.
  - Kept Drizzle/SQLite table shape, auto-scan settings persistence, idle/battery gating, and background task registration inside the CoreApp/FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-scan-eligibility.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### ref(search): lift indexed watch root policy

- `packages/utils/search/indexing-watch-root-policy.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-watch-root-policy.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `resolveIndexedWatchRootSet()`, `isIndexedWatchPathOwned()`, and `filterIndexedWatchPendingPermissionPaths()` for path-based indexed source root de-duplication, root/child ownership checks, shared-prefix false-positive protection, and pending-permission root filtering.
  - Rewired `FileProviderWatchService` and FileProvider root checks to delegate source-agnostic root ownership to the SDK while keeping real watcher registration, settings persistence, and `FileSystemWatcher` pending path reads inside CoreApp.
  - Fixed File watch ownership to accept child paths under a watched root instead of only exact root paths.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-watch-root-policy.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### ref(search): lift indexed watch path policy

- `packages/utils/search/indexing-watch-path-policy.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-watch-path-policy.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-path-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `normalizeIndexedWatchPath()` and `getIndexedWatchDepthForPath()` for path-based indexed source watch path normalization, case sensitivity, and macOS/Windows/Linux default watch depth.
  - Rewired FileProvider path helpers into a thin adapter that only narrows CoreApp platform typing while delegating source-agnostic watch path policy to the SDK primitive.
  - Kept real watcher registration, pending permission handling, and FileSystemWatcher lifecycle inside the CoreApp/FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-watch-path-policy.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-path-service.test.ts"` 通过。

### ref(search): lift indexed worker status snapshot

- `packages/utils/search/indexing-worker-status.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-worker-status.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-worker-status-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedWorkerStatusSnapshotService` for worker state summary, short TTL caching, concurrent snapshot load dedupe, and failed-load cache skipping.
  - Rewired `FileProviderWorkerStatusService` into a thin compatibility adapter that injects the real File worker status loader while delegating source-agnostic snapshot behavior to the SDK primitive.
  - Kept worker readiness, real worker IPC/status loading, SearchIndex worker behavior, and FTS/SearchIndex semantics inside the CoreApp/FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-worker-status.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-worker-status.test.ts"` 通过。

### ref(search): lift indexed source progress store

- `packages/utils/search/indexing-source-progress-store.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-progress-store.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceProgressStoreService` for completed-root summary, empty delete/upsert skips, upsert readiness gating, and upsert result reporting.
  - Rewired FileProvider scan progress handling to inject `scan_progress` select/delete, worker readiness, and `upsertScanProgress` while delegating source-agnostic progress store behavior to the SDK primitive.
  - Kept the real `scan_progress` table schema, Drizzle queries, SearchIndex worker, and File metadata mapping inside the CoreApp/FileProvider boundary.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-progress-store.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.test.ts"` 通过。

### refactor(search): lift indexed source integrity policy

- `packages/utils/search/indexing-source-integrity.ts`
- `packages/utils/search/index.ts`
- `packages/utils/__tests__/search/indexing-source-integrity.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added public `IndexedSourceIntegrityService` for source-row versus indexed-row ratio policy, runtime reset decision, SearchIndex clear flag, orphan cleanup call, duration, and snapshot mapping.
  - Rewired FileProvider integrity checks to inject FTS/files row counts, runtime reset, and orphan `keyword_mappings` cleanup while delegating source-agnostic policy to the SDK primitive.
  - Kept actual DB/FTS querying, SearchIndex table semantics, and File-specific keyword cleanup in the FileProvider boundary; this does not claim full FileProvider store migration is complete.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-integrity.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/services/file-provider-integrity-service.test.ts"` 通过。

### feat(core-app): render indexed source progress diagnostics

- `apps/core-app/src/renderer/src/modules/search/indexing-source-diagnostics-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.css`
- `apps/core-app/src/renderer/src/views/base/settings/indexing-source-diagnostics-display.{ts,test.ts}`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added Settings rendering for `IndexedSourceDiagnostics.progress` as a source-level progress chip, including shared tone mapping for estimated, stabilizing, stalled, complete, and failed states.
  - Surfaced stage, percent, current/total, remaining time, ETA, throughput, sample count, estimate basis, and reason without adding FileProvider-specific progress UI.
  - Updated roadmap/TODO/Nexus search API docs so source progress diagnostics are marked as consumed by Settings while FileProvider store-boundary migration and Browser Data plugin lifecycle remain open.
  - 验证：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/indexing-source-diagnostics-display.test.ts"` 通过。

### feat(search): expose indexed source progress diagnostics

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-diagnostics-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/file-indexed-source.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/file-indexed-source.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added source-level `IndexedSourceProgress` / `IndexedSource.getProgress()` and `IndexedSourceDiagnostics.progress` so runtime diagnostics can expose progress/ETA without FileProvider-specific payloads.
  - Wired `SourceDiagnosticsService` to collect optional source progress while isolating progress collection failures.
  - Adapted File indexed source progress from FileProvider indexing status, including stage, current/total, percentage, estimated remaining time, estimated completion time, throughput, sample count, and estimate basis.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/file-indexed-source.test.ts" "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:node` 通过。

### feat(search): add plugin indexed source manifest metadata

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `packages/utils/plugin/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `plugins/touch-browser-data/manifest.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added metadata-only `manifest.indexedSources` parsing through `resolveIndexedSourceManifestDescriptors()`, including admission validation and scope-to-manifest-permission mapping.
  - Extended Browser Data admission so `browser-bookmark` / `browser-history` sources must be official-plugin owned in addition to high privacy and browser-data scoped.
  - Exposed valid indexed source declarations on CoreApp plugin state and recorded `INDEXED_SOURCE_*` loader diagnostics without registering runtime sources or reading browser files.
  - Declared `touch-browser-data` `browser-bookmarks` lifecycle intent with `fs.read` / `fs.index` / `search.root-results` permission boundaries while keeping the current plugin as an immediate, consent-gated push provider.
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/plugin-loaders.test.ts"` 通过。

## 2026-05-30

### refactor(utils): expose indexed source watch root routing helpers

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-router.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added SDK helpers for normalized watch path matching, root permission skip decisions, and source root route resolution.
  - Rewired CoreApp `WatchEventRouter` to use the public SDK helper for root matching and `root-permission:*` skipped reasons.
  - Kept platform-sensitive matching behavior: Linux remains case-sensitive by default, while Windows/macOS matching remains case-insensitive.

### feat(utils): add Browser History indexed source descriptor template

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added `createBrowserHistoryIndexedSourceDescriptor()` and `browser-history` support in `createIndexedSourceDescriptorTemplate()`.
  - Standardized Browser History admission as official-plugin owned, high privacy, disabled by default, explicit-consent required, browser-data + file-system scoped, sqlite-index backed, clearable, and rebuildable.
  - Kept this as a descriptor/admission SDK contract only; it does not register a runtime source or read browser History SQLite files.

### feat(utils): add Browser Bookmarks indexed source descriptor template

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added `createBrowserBookmarksIndexedSourceDescriptor()` and `browser-bookmarks` support in `createIndexedSourceDescriptorTemplate()`.
  - Standardized Browser Bookmarks admission as official-plugin owned, high privacy, disabled by default, explicit-consent required, browser-data + file-system scoped, sqlite-index backed, clearable, and rebuildable.
  - Rewired CoreApp `BrowserBookmarksIndexedSource` descriptor construction through the public SDK factory while keeping the runtime source disabled unless provider config explicitly enables it.

### fix(core-app): stabilize file index progress ETA

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-estimator-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-estimator-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `packages/utils/transport/events/types/file-index.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useEstimatedCompletion.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added `estimateStatus` and `speedSampleCount` to File Index progress/status payloads as optional compatibility fields.
  - Made the shared `IndexingProgressEstimatorService` wait for multiple speed samples before showing ETA and report `stabilizing`, `estimated`, `stalled`, `complete`, or `unknown` state.
  - Suppressed stale ETA after prolonged no-progress intervals so Settings shows estimating/waiting states instead of misleading remaining time.

### refactor(core-app): lift worker scheduler primitive

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-worker-scheduler-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-worker-scheduler-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added shared `IndexedWorkerSchedulerService` for worker context gating, chunked dispatch, deferred dispatch, and worker failure isolation.
  - Rewired `FileProviderIndexSchedulerService` to keep File row to worker-payload mapping plus large-file/background-content policy while delegating chunk scheduling to the shared primitive.
  - Preserved FileProvider failure log wording and worker dispatch arguments, keeping existing behavior compatible.

### refactor(core-app): lift write side-effect dispatcher

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-side-effect-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-side-effect-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-write-side-effect-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-write-side-effect-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added shared `IndexedWriteSideEffectService` for post-write extension processing and indexing scheduling dispatch.
  - Kept extension processing asynchronous and failure-isolated while still scheduling worker indexing immediately, preserving FileProvider behavior.
  - Rewired `FileProviderWriteSideEffectService` as a thin adapter so future indexed sources can reuse the same non-blocking side-effect dispatch path.

### refactor(core-app): lift worker persist entry mapper

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-worker-persist-entry-mapper-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-worker-persist-entry-mapper-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-persist-entry-mapper-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-persist-entry-mapper-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added shared `IndexedWorkerPersistEntryMapperService` for normalizing worker results into SearchIndex worker `PersistEntry` payloads.
  - Centralized progress null-normalization, file-update content hash defaults, embedding vector/model projection, and SearchIndex item passthrough in the search-engine layer.
  - Rewired `FileProviderIndexPersistEntryMapperService` as a thin adapter over the shared mapper so future indexed-source workers do not duplicate FileProvider-private persist-entry mapping.

### refactor(core-app): lift write flush runtime scheduler

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-flush-runtime-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-flush-runtime-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-runtime-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added shared `IndexedWriteFlushRuntimeService` for source-agnostic flush timer ownership, availability/no-pending idle snapshots, in-progress deferral, retry scheduling, and drain-remaining scheduling.
  - Rewired `FileProviderIndexRuntimeService` to delegate scheduling to the shared runtime primitive while keeping File-specific flush executor result mapping, SQLite busy retry metadata, worker-not-ready logging, and `file-provider:index-flush` evidence semantics.
  - Kept DB persistence, SearchIndex worker writes, flush trace wiring, and FTS semantics outside the runtime scheduler so this slice only moves reusable orchestration.

### refactor(core-app): lift watch delta queue primitive

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-delta-queue-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-delta-queue-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-incremental-queue-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-incremental-queue-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added shared `IndexingWatchDeltaQueueService` for watcher delta admission, normalized-key coalescing, delete dominance, prepare-flush gating, and serialized flush processing.
  - Kept source-specific metadata merge behind an injectable `coalesce` hook so FileProvider can preserve `manual` semantics while future Browser Bookmarks, Quicklinks, Obsidian, or VSCode sources can attach their own metadata without duplicating queue scheduling.
  - Rewired `FileProviderIncrementalQueueService` as a thin adapter over the shared primitive, preserving the existing public class, payload shape, delete behavior, manual flag preservation, and process-entry contract.

### refactor(core-app): lift indexing progress ETA estimator

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-estimator-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-estimator-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-stream-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-progress-stream-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-progress-estimator-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-progress-estimator-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-progress-stream-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-progress-stream-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Moved the stage-local smoothed throughput ETA logic from FileProvider into shared `IndexingProgressEstimatorService`, including terminal-stage handling, stage-switch reset, progress-regression reset, cold-start hiding, low-progress hiding, and max ETA clamping.
  - Moved progress stream throttling into shared `IndexingProgressStreamService` helpers, covering first payloads, stage changes, terminal stages, max silence, min interval, and progress/current/total step guards.
  - Kept `FileProviderProgressEstimatorService` as a thin adapter for `FileIndexStage` idle/completed terminal semantics so current File Index progress behavior stays compatible.
  - Kept `file-provider-progress-stream-service` as a thin adapter for `FileIndexProgress` payloads and FileProvider terminal stages.
  - This prepares Browser Bookmarks, Quicklinks, Obsidian, VSCode, and future indexed source progress UI to reuse one ETA rule set instead of each source inventing its own remaining-time logic.

### refactor(core-app): lift write flush retry policy

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-flush-retry-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-write-flush-retry-service.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-retry-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-flush-retry-service.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added shared `IndexedWriteFlushRetryService` plus delay/backoff helpers for pending backlog delay, backlog threshold, exponential retry, jitter, max retry delay, and retry count progression.
  - Rewired FileProvider index-worker flush retry to use the shared service while keeping SQLite busy detection and `sqlite-busy-retry` / `flush-failed` reason mapping in the FileProvider adapter.
  - Kept legacy FileProvider helper exports (`getIndexWorkerFlushDelay`, `getIndexWorkerBusyRetryDelay`) delegating to the shared helpers so existing call sites and tests remain compatible.

### feat(utils): add indexed source descriptor templates

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Added SDK descriptor factories for future Quicklinks and System Settings indexed sources, plus a named `createIndexedSourceDescriptorTemplate()` helper.
  - Quicklinks template now standardizes official-plugin ownership, low privacy, sqlite-index storage, fast priority, clear/rebuild support, and no extra permission scope.
  - System Settings template now standardizes core ownership, low privacy, ephemeral storage, fast priority, `system-index` scope, rebuild support, and no clear operation.
  - This is an admission/descriptor template only: it does not register runtime sources, read data, or claim Quicklinks/System Settings indexing is implemented.

### feat(core-app): format indexed source evidence metadata in Settings

- `apps/core-app/src/renderer/src/modules/search/indexing-source-diagnostics-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/indexing-source-diagnostics-display.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
  - Updated Settings source evidence chips to render source-specific summaries for `file-provider:scan-progress`, `file-provider:index-flush`, and `file-provider:integrity` instead of only showing label/status/count/reason.
  - Scan progress chips now surface completed/total, failed count, and pending-permission roots; index-flush chips surface pending/inflight/entries/duration/reason; integrity chips surface FTS/files row counts, rebuild flag, and orphan keyword cleanup count.
  - Kept this as a renderer helper and i18n change only: no runtime protocol change, no new FileProvider-private settings panel, and no JSON persistence of diagnostics metadata.

### feat(search): link official browser-data provider to runtime source ids

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `plugins/touch-browser-data/manifest.json`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-provider-registry.test.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/{browser-bookmarks-indexed-source,browser-bookmarks-source-config,indexing-runtime-sources}.ts`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
  - Added `SearchProviderRegistrationPolicy.indexedSourceId` / `manifest.searchProviders[].indexedSourceId` so official plugin providers can declare which runtime indexed source they correspond to without embedding source implementation details in the provider descriptor.
  - Linked `touch-browser-data.browser-bookmarks` to the disabled `browser-bookmarks` runtime skeleton while keeping it consent-gated and official-plugin-owned.
  - Added SDK policy coverage that blocks third-party providers from claiming Browser Bookmarks / History runtime source ids, preserving the high-privacy Browser Data boundary before the persistent official-plugin indexed source is implemented.
  - Added registry coverage so plugin provider descriptors keep their `policy.indexedSourceId` when aggregated for Settings.
  - Added `SearchProviderConfigResponse.sourceLinks` so Settings can consume source-to-provider associations as structured transport data instead of reconstructing them from descriptor policy fields only.
  - Updated Advanced Settings provider config rows to show linked runtime source id and current source diagnostics status when a provider declares `indexedSourceId`, without changing the persisted `enabled/order` config shape.
  - Added SDK helper `isIndexedSourceEnabledByProviderConfig()` so runtime sources can share one explicit linked-provider enablement rule instead of each source reading `SearchProviderUserConfig` differently.
  - Added SDK helper `getSearchProviderIdsForIndexedSource()` plus a CoreApp registry wrapper so `indexedSourceId` can be queried in reverse as source-to-provider links instead of hardcoding linked provider ids per source.
  - Added a lightweight Browser Bookmarks source enable resolver that reads unified provider config for `browser-bookmarks` / `touch-browser-data.browser-bookmarks` through those SDK helpers; the runtime source still defaults to disabled and only scans when the user explicitly enables the linked provider config.

### docs(audit): add UI compatibility automation follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-30.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added the 2026-05-30 automation follow-up for UI adaptation, compatibility debt, placeholder/fake implementation risk, and architecture robustness.
  - Reconfirmed no new P0 production fixed fake-success was found in the sampled live tree.
  - Recorded current UI scores and next-step priorities: real Windows/TuffEx visual evidence, FileProvider-to-IndexingRuntime store migration, semantic clickable cleanup, UI preference storage facade, and cloud preset fail-closed placeholder retirement.

### fix(tuffex): support dynamic TxTabs slot fragments

- `packages/tuffex/packages/components/src/tabs/src/TxTabs.vue`
- `packages/tuffex/packages/components/src/tabs/__tests__/tabs.test.ts`
- `apps/nexus/app/plugins/tuffex.ts`
- `packages/tuffex/CHANGELOG.md`
  - Updated `TxTabs` slot normalization to expand Vue `Fragment` nodes generated by `v-for`, ignore comment nodes, and reuse the same normalization for `TxTabItemGroup` children.
  - Preserved exported component names on Nexus async Tuffex registrations so parent components such as `TxTabs` can still identify slot children like `TxTabItem` after lazy loading.
  - Added regression coverage for top-level, grouped, and named async-wrapper dynamic `TxTabItem` children so active content no longer falls back to `No tab selected`.

### docs(search): define Indexing Runtime V1 and source SDK contract

- `packages/utils/search/indexing-source.ts`
- `packages/utils/__tests__/search/indexing-source.test.ts`
- `packages/utils/search/index.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/{app-provider,app-provider.test}.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/{app-indexed-source,app-indexed-source.test,indexing-diagnostics-service}.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/{browser-bookmarks-indexed-source,browser-bookmarks-indexed-source.test,indexing-runtime,indexing-runtime.test,indexing-root-policy,everything-indexed-source,everything-indexed-source.test,search-core}.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/{indexing-store-adapter,indexing-store-adapter.test}.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/{everything-provider,everything-provider.test}.ts`
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- `docs/plan-prd/{README.md,TODO.md}`
- `docs/INDEX.md`
- `apps/nexus/content/docs/dev/api/search.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/architecture/search-engine.{zh,en}.mdc`
- `apps/nexus/app/data/tuffSdkItems.ts`
  - Added a shared `IndexedSource*` type contract under `@talex-touch/utils/search` for local-first search sources, covering descriptor, health, roots, records, scan/watch/reconcile/search/open lifecycle types, and source storage/priority/privacy taxonomy.
  - Added the `IndexedSourceAdmission` SDK contract plus `getIndexedSourceAdmissionIssues()` / `isIndexedSourceAdmissionReady()` helpers so new CoreApp, official-plugin, and third-party-plugin search sources declare owner, permission scopes, default state, user consent, clearability, and rebuildability before entering the runtime.
  - Added admission metadata to App/File/Everything indexed-source descriptors, including the external-fast guard for Everything and file-system scope for File source.
  - Added the Indexing Runtime V1 plan to separate data source lifecycle from SearchProvider behavior without rewriting SearchEngineCore in the first slice.
  - Added the CoreApp `IndexingRuntime` skeleton with source registry, diagnostics aggregation, health failure isolation, root-based watch event routing, focused unit coverage, and SearchEngineCore lifecycle ownership.
  - Registered App/File/Everything as thin core indexed-source adapters that map existing provider diagnostics into unified source health and roots without migrating scan/search behavior yet.
  - Exposed the unified indexing diagnostics snapshot through the typed `CoreBoxEvents.search.indexingDiagnostics` transport event so Settings/CoreBox can consume source health without provider-private APIs.
  - Added an Advanced Settings / File Index Search Source Diagnostics section that reads the typed diagnostics snapshot and surfaces source status, item count, watch/reconcile state, and roots/error/reason summaries for App/File/Everything.
  - Wired CoreBox no-result empty states to the same typed diagnostics snapshot, showing compact degraded / permission-required / error / warming source summaries with retry and File Index settings recovery actions.
  - Split the IndexingRuntime task model into SourceDiagnosticsService, WatchEventRouter, ScanScheduler, ReconcileEngine, and IndexStoreAdapter so future App/File/Browser Data migration can plug into shared scan/watch/reconcile paths instead of expanding provider-private loops.
  - Added ScanScheduler batch scan result stats and source-level failure isolation so one source scan failure no longer aborts the whole batch scan.
  - Added ReconcileEngine batch reconcile result stats and source-level failure isolation so one source reconcile failure no longer aborts the whole batch reconcile.
  - Added a minimal `ReconcileScheduler` between `IndexingRuntime` and `ReconcileEngine` to assign reconcile job ids, record queued timestamps/root counts, and guard concurrent same-source reconcile runs before the future durable job history layer.
  - Added SDK-level `IndexedSourceReconcileReasons` / `IndexedSourceReconcileReason` so scheduled, manual repair, watch gap/recovery, watch-root recovery, health repair, schema migration, external refresh, and unsupported reconcile reasons share stable codes while still allowing source-specific detail strings.
  - Added SDK-level `IndexedSourceScanReasons` / `IndexedSourceScanReason` so startup, manual rebuild, scheduled, watch recovery, schema migration, and health repair scan triggers share stable codes across CoreApp runtime and indexed-source tests.
  - Added SDK-level `IndexedSourceResetReasons` / `IndexedSourceResetReason` so manual rebuild, schema migration, integrity repair, health repair, and user clear runtime resets share stable diagnostics codes.
  - Added WatchEventRouter route result stats and failure isolation so one source handler or store delta failure no longer aborts the entire watcher route.
  - Added optional IndexedSourceEvidence diagnostics and App source evidence for Windows Start Menu/UWP/Registry/App Paths/Steam, macOS mdfind/mdls, Linux desktop entries, and watch roots.
  - Added an AppIndexedSource adapter and AppProvider lifecycle methods so startup backfill/manual rebuild run through source scan, full sync plus macOS mdls repair run through source reconcile, and app path watcher events route through source watch handling.
  - Added a Windows app scanner `getAppsBySource()` entry that separates Start Menu, UWP/Get-StartApps, Uninstall Registry, App Paths Registry, and Steam manifest records as first-class source scan results while keeping legacy `getApps()` flattening and dedupe behavior compatible.
  - Updated AppProvider Windows source evidence to prefer the scanner grouped results, including per-source empty/error reasons, with DB metadata inference retained only as a fallback.
  - Updated AppProvider scan lifecycle to return `IndexedSourceRecordBatch` records mapped from `ScannedAppInfo`, and `AppIndexedSource.scan()` now yields those batches so the runtime ScanScheduler can write app records through SearchIndexStoreAdapter.
  - Updated AppProvider reconcile lifecycle to return real added/changed/deleted/skipped/errors counts from full sync and macOS mdls repair instead of fixed zero counters.
  - Updated AppProvider watch lifecycle so add/change events return `IndexedSourceDelta.record` and delete events return `stableKey/path`, and moved App watcher event routing into SearchEngineCore's indexing runtime bridge for Windows/Linux file events plus macOS app directory events.
  - Added a FileIndexedSource adapter and FileProvider lifecycle methods so manual rebuild/worker scan, reconciliation, incremental watch updates, and clear/rebuild semantics are reachable through the shared indexed-source runtime.
  - Updated FileProvider scan lifecycle to map full-scan and reconciliation inserted file rows into `IndexedSourceRecordBatch`, and `FileIndexedSource.scan()` now yields those batches to the runtime ScanScheduler/store boundary.
  - Updated FileProvider watch lifecycle so add/change events return `IndexedSourceDelta.record` and delete events return `stableKey/path`, allowing WatchEventRouter plus SearchIndexStoreAdapter to apply real file deltas instead of path-only placeholders.
  - Moved global file watcher event routing for the File source into SearchEngineCore's indexing runtime bridge, so `FILE_ADDED` / `FILE_CHANGED` / `FILE_UNLINKED` events now enter `IndexingRuntime.routeWatchEventWithResult()` instead of FileProvider directly subscribing to the event bus.
  - Updated FileProvider reconcile lifecycle to return real added/changed/deleted/skipped/errors counts from full scan, reconciliation diff, and stale watch-root cleanup instead of fixed zero counters.
  - Extended `IndexedSourceReconcileResult` with optional reconcile `deltas`, `appliedDeltas`, `failedDeltas`, and `deltaErrors`, and wired ReconcileEngine to apply those deltas through the runtime store adapter so補漏 can repair the shared index instead of only reporting stats.
  - Updated FileProvider reconciliation to emit runtime deltas for added, changed, and deleted file rows while preserving the existing internal files table, keyword/icon/content indexing pipeline, and incremental queue during the migration.
  - Extracted `FileProviderIncrementalQueueService` for incremental path coalescing, delete precedence, manual flag preservation, and serial flush scheduling, leaving the actual incremental DB/keyword/icon/content writes in FileProvider for the next migration slice.
  - Added `IndexedWritePlanService` as a runtime/store-level write planning primitive for incoming/existing record diffing, timestamp-tolerant unchanged detection, and manual accepted/inserted/updated/unchanged summaries; `FileProviderIncrementalWritePlannerService` now only adapts File rows into update records while actual DB persistence, keyword/icon/content writes, flush trace wiring, and FTS semantics remain in FileProvider/SearchIndex worker boundaries for the next migration slice.
  - Added `FileProviderIncrementalWriteService` to own incremental add/change write orchestration, including build-record calls, existing-row lookup, write-plan execution, insert/update delegation, unchanged logging, and manual summary logging. The service keeps SQL persistence and side-effect dispatch injectable so the next migration can move those boundaries without growing `FileProvider` again.
  - Added `IndexedWriteDeleteExecutorService` as a runtime/store-level delete primitive for path normalization, existing-row lookup, resolved-record deletes, DB delete delegation, SearchIndex removal delegation, and success logging; FileProvider incremental deletes and reconciliation deletes now inject the existing files-table delete, embedding cleanup, chunking, and SearchIndex remove callbacks while keeping reconcile delta emission in the source layer.
  - Added `FileProviderReconciliationInsertService` to own reconciliation add orchestration, including chunked upsert, side-effect dispatch, runtime record batch emission, add delta emission, and progress updates while keeping `upsertSearchIndexFiles()` and source-level delta mapping injected by FileProvider.
  - Added `FileProviderReconciliationDeleteService` and `FileProviderReconciliationUpdateService` so reconciliation delete/update now own source-level delta emission and changed/deleted result reporting, while `FileProvider` only injects the existing SQL/update/delete executors and record mapper.
  - Added `FileProviderReconciliationDiffService` so worker-based reconciliation and main-thread fallback diff share one service boundary for added/updated/deleted calculation, removing the fallback diff algorithm from `FileProvider`.
  - Added `FileProviderReconciliationRunService` so existing-root reconciliation DB row reads, directory scans, diff orchestration, delete/update/insert delegation, progress, stats, and completed-path reporting are no longer embedded in `FileProvider._initialize()`.
  - Added `FileProviderCleanupDeleteService` so stale watch-root cleanup now reuses the shared delete executor shape for files-table rows, embedding cleanup, `scan_progress` cleanup, SearchIndex removal, progress events, and deleted-count reporting instead of keeping another private delete loop in `FileProvider._initialize()`.
  - Added `FileProviderFullScanRunService` so full-scan root scanning, scan progress, event-loop yield, file-row payload mapping, insert delegation, and completed-path reporting are no longer embedded in `FileProvider._initialize()`.
  - Added `FileProviderFullScanInsertService` to own full-scan insert/upsert orchestration, including AIMD batch sizing, idle pacing, side-effect dispatch, runtime record batch emission, progress updates, and inserted-count reporting while keeping files-table upsert and SearchIndex semantics injected.
  - Added `IndexedWriteInsertExecutorService` as a runtime/store-level insert/upsert primitive for persist callback execution, inserted-row side-effect dispatch, and success logging; FileProvider now injects the existing files-table upsert SQL without changing conflict handling or FTS semantics.
  - Added `IndexedWriteUpdateExecutorService` as a runtime/store-level chunked update primitive for idle/capacity waits, per-record update delegation, refreshed-row reads, side-effect dispatch, and progress logging; FileProvider now injects its existing SQL update/read callbacks so update scheduling is reusable without changing files-table or FTS semantics.
  - Extracted `FileProviderWriteSideEffectService` so post-write keyword/icon extension processing and content-index worker scheduling share one non-blocking dispatch path across incremental insert, file update, full scan, and reconciliation insert flows.
  - Extracted `FileProviderIndexSchedulerService` for file-row to index-worker payload mapping, large-file background-content deferral, chunked worker dispatch, and worker failure logging, leaving DB persistence and index-worker result persistence as the remaining FileProvider-owned write boundaries.
  - Extracted `FileProviderIndexPersistEntryMapperService` for index-worker result to `PersistEntry` mapping, including parser file updates, embedding vectors, progress normalization, and SearchIndex item handoff before `FileProviderIndexRuntimeService` flushes entries through the SearchIndex worker.
  - Extracted `FileProviderIndexFlushRetryService` for index-worker flush delay, backlog delay, sqlite-busy exponential retry, and retry reason decisions while leaving actual flush execution, commit/rollback, and DB backpressure in `FileProviderIndexRuntimeService`.
  - Added `IndexedWriteFlushExecutorService` as a runtime/store-level flush primitive for readiness gating, DB write backpressure, persistence, commit/rollback, duration recording, and source-agnostic `reason` / `error` / `metadata` results; `FileProviderIndexFlushExecutorService` now adapts FileProvider-specific result metadata and logging on top of it.
  - Added `IndexedWriteBufferService` as a runtime/store-level pending-inflight buffer primitive for enqueue, take, commit, rollback, and size accounting; `FileProviderIndexFlushBufferService` now only adapts file worker results by `fileId`.
  - Added `IndexedWriteFlushSnapshotService` as a runtime/store-level latest-flush snapshot recorder, moving FileProvider index-flush checkedAt/status storage out of `FileProviderIndexRuntimeService` while preserving existing `file-provider:index-flush` evidence semantics.
  - Added `FileProviderProgressEstimatorService` so File Index progress ETA is based on stage-local smoothed throughput with cold-start and stage-change guards instead of raw current/total linear extrapolation.
  - Added FileProvider index-flush snapshots and `file-provider:index-flush` evidence so unified indexing diagnostics can show the latest flushed / worker-not-ready / failed state, pending/inflight counts, retry reason, error, and duration for the file content index worker.
  - Added File watch-root pending permission diagnostics: FileProvider now exposes FileSystemWatcher pending paths through `FileIndexedSource` roots as `permissionState: "promptable"` with `file-index-watch-root-pending-permission`, and scan-progress evidence records pending permission roots for Settings/CoreBox diagnostics.
  - Added `IndexedSource.shouldHandleWatchEvent()` as a source ownership hook and wired WatchEventRouter to record `source-watch-filtered` when a source rejects a watch path.
  - Added `FILE_WATCH_ROOT_RECOVERED` and routed recovered FileProvider watch roots through `IndexingRuntime.reconcileSource("file-provider", { roots })`, so permission recovery enters runtime reconcile diagnostics instead of staying inside FileSystemWatcher.
  - Added `IndexedSourceReconcileRequest.reason` plus `lastReconcile.reason/rootCount` diagnostics, and wired File watch-root recovery to record `file-watch-root-recovered` in Settings/CoreBox task chips.
  - Extended `lastReconcile` diagnostics with scheduler `jobId` and `queuedAt`, so Settings/trace can distinguish reconcile execution records from raw reconcile results.
  - Extended `lastScan` diagnostics with runtime scan `jobId` and `queuedAt`, covering single-source scans, batch scan failures, and skipped sources so Settings/trace can distinguish scan task executions from raw scan counters.
  - Added `IndexedSourceRuntimeTaskJobFactory` and wired scan, watch, reconcile, and reset maintenance entries to the same in-memory task job identity generator, keeping job id / queuedAt semantics shared without introducing a durable queue yet.
  - Added File source evidence for `scan-progress` and `integrity`, exposing scan_progress pending/failed/completed summaries plus FTS/files row-count mismatch resets through unified indexing diagnostics instead of FileProvider-only logs; scan_progress evidence reads, completed-root strategy reads, stale path deletes, and completed-path upserts now live in `FileProviderScanProgressService`.
  - Added `FileProviderScanStrategyService` so scan_progress completed-root reads, event-loop yield, new full-scan path selection, reconciliation path selection, and strategy logging are no longer embedded in `FileProvider._initialize()`.
  - Extracted `FileProviderIntegrityService` for FTS/files row-count checks, integrity-triggered runtime reset, orphan `keyword_mappings` cleanup, and integrity diagnostics snapshots, leaving only runtime task scheduling as the next boundary to migrate.
  - Consolidated FileProvider manual rebuild, schema-migration, and integrity mismatch reset paths into `FileProviderRuntimeResetService`, so scan_progress and provider-index resets now share reason/count reporting behind a focused service before becoming full runtime tasks. The service now accepts `IndexedSourceResetRequest` and returns the SDK-standard `IndexedSourceResetResult`, removing a FileProvider-private reset result shape from the runtime reset path.
  - Added `IndexedSourceResetRequest` / `IndexedSourceResetResult` and optional `IndexedSource.resetIndex()`, plus `IndexingRuntime.resetSourceRuntimeState()` with `lastReset` diagnostics; FileIndexedSource now exposes FileProvider runtime reset without overloading user-facing `clearIndex()`.
  - Extended `lastReset` diagnostics with runtime reset `jobId` and `queuedAt`, so Settings/trace can distinguish reset task executions from raw reset results just like reconcile diagnostics.
  - Extended `lastWatch` diagnostics with runtime watch `jobId` and `queuedAt`, covering applied deltas, handler/store failures, and skipped sources so watcher routes now share the same task identity model as scan/reconcile/reset.
  - Moved `clearSearchIndex` handling into `IndexingRuntime.resetSourceRuntimeState()` so runtime resets clear the shared SearchIndex through `IndexStoreAdapter.clearSource(sourceId)` before invoking source-local `resetIndex()` with `clearSearchIndex: false`, keeping future indexed sources from duplicating SearchIndexService wiring.
  - Added a generic `settings.indexedSource` typed SDK and `AppEvents.indexedSource.diagnostics/reset/reconcile/scan` transport handlers, so Settings and future source-management UI can maintain any runtime indexed source by `sourceId` instead of adding provider-specific IPC.
  - Injected an indexed-source reset delegate from SearchEngineCore into FileProvider, so manual rebuild, schema migration, and integrity mismatch repair now route through `IndexingRuntime.resetSourceRuntimeState("file-provider", { reason })` without making FileProvider import the runtime singleton.
  - Added IndexingRootPolicy and EverythingIndexedSource so Windows Everything path filtering now mirrors File source roots from runtime diagnostics instead of reading FileProvider private watch roots directly, while still failing closed when no authorized roots are available.
  - Added a BrowserBookmarksIndexedSource runtime skeleton with high-privacy admission metadata and disabled/pending-migration diagnostics, making the `touch-browser-data` gap visible in unified source diagnostics before migrating Chromium Bookmarks JSON into SQLite-backed scan/watch/reconcile.
  - Extracted a pure CoreApp Chromium Bookmarks scanner from the plugin path, covering Chrome/Edge/Brave/Arc profile discovery, `Bookmarks` parsing, http(s)-only filtering, URL dedupe, scanner diagnostics, browser roots, and explicit-enabled `browser-bookmark` record batches while keeping the default registered source disabled/pending migration until settings and clear/rebuild are wired.
  - Updated explicit-enabled `BrowserBookmarksIndexedSource` lifecycle so scan returns record batches, health/evidence/roots reflect scanner output, reconcile emits small-full-refresh deltas through the runtime store boundary, and Bookmarks watch events reuse the same refresh delta path.
  - Added BrowserBookmarksIndexedSource `resetIndex()` diagnostics for source-level runtime resets while keeping user-facing clear/rebuild blocked until explicit browser-data settings and consent are wired.
  - Added SearchIndexStoreAdapter so runtime scan batches and watch deltas can write through the existing SQLite/SearchIndexService `indexItems`, `removeItems`, and `removeByProvider` boundary instead of remaining no-op.
  - Added runtime task state to diagnostics snapshots, exposing latest scan/watch/reconcile results per source for Settings and trace evidence without persisting provider-private task state.
  - Added bounded in-memory `IndexedSourceDiagnostics.recentTasks` history for scan/watch/reconcile/reset, preserving recent task kind/status/jobId/queuedAt/error/summary as source-level evidence without introducing a durable queue or JSON sync payload.
  - Added SDK helper `appendIndexedSourceTaskHistory()` and `DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT` so CoreApp and future official plugin indexed sources share the same newest-first bounded task-history rule.
  - Added the shared `resolveIndexedSourceTaskEligibility()` SDK helper and wired CoreApp batch scan/reconcile plus watch routing to it, so admission-invalid, disabled, unsupported, permission-required, error, denied, promptable, or root-permission-blocked sources are skipped with explicit batch/route and diagnostics `skipped:*` evidence instead of relying on adapter-local empty scans or watch handlers.
  - Updated Advanced Settings source diagnostics to render compact recent task chips for scan/watch/reconcile counts and failures, making runtime task state visible instead of leaving it as transport-only data.
  - Updated Advanced Settings source diagnostics to render bounded `recentTasks` history chips, so scan/watch/reconcile/reset task history becomes visible with shared status tone mapping instead of only latest-task chips.
  - Added shared Settings summary formatting for `recentTasks.summary`, surfacing scan records/batches, watch delta/action, reconcile add/change/delete/skipped, and reset clear flags in recent task chips.
  - Updated Advanced Settings source diagnostics to render prioritized source evidence chips, making File scan-progress / integrity / index-flush evidence such as flush backlog, retry reason, worker-not-ready, and duration visible without adding FileProvider-specific UI.
  - Added public search provider SDK contracts for root-result providers: `SearchProviderDescriptor`, user `enabled/order` config, provider registration policy, config normalization, and registration decision helpers. Third-party push providers now have an explicit `root-results` permission boundary in the SDK contract, and third-party indexed providers require explicit consent.
  - Added SDK helpers for search provider manifest migration: `getSearchProviderManifestCoverage()` audits push-feature explicit provider coverage, `deriveSearchProvidersFromPushFeatures()` centralizes legacy `push: true` compatibility provider derivation, and `resolveSearchProviderManifestDescriptors()` resolves manifest provider descriptors with policy decisions and missing-permission diagnostics in one pass. CoreApp plugin loading now reuses this SDK resolver instead of maintaining private derivation and validation logic.
  - Added the runtime `search.root-results` plugin permission and mapped Search Provider `root-results` scope to that manifest permission. CoreApp now checks this permission before plugin `boxItems.push()` / `plugin.feature.pushItems()` writes to CoreBox root results, while plugin-owned delete/clear remains allowed for stale item cleanup; official push-feature plugin manifests now declare `search.root-results`.
  - Added plugin `manifest.searchProviders` loading support: explicit provider declarations are converted to runtime `SearchProviderDescriptor` values after policy and manifest-permission checks, while legacy `push: true` features derive a temporary compatibility provider with a migration warning. Providers missing required search permissions or blocked by registration policy are diagnosed but not exposed for provider registry aggregation.
  - Added a Search Provider Registry helper that aggregates Core indexed sources and loaded plugin `searchProviders` for Settings provider-config responses. Disabling a push-mode plugin provider now blocks future writes only for that provider while keeping other enabled providers from the same plugin active and keeping `remove` / `clear` available for stale-item cleanup; plugin-pushed items carry `meta.searchProviderId`, and BoxItemManager filters disabled providers plus orders existing push results by provider config during sync/batch upsert. Provider config updates now refresh root-item sync so Settings changes apply to existing push results.
  - Extended `SearchProviderDescriptor` with `featureId` and updated legacy push-feature compatibility so every `push: true` feature derives a distinct provider descriptor. Plugin root-result pushes now map `meta.featureId` to `meta.searchProviderId`, and `boxItems.update()` reads the existing item provider id before applying provider guards, allowing Settings provider toggles to work at feature/provider granularity instead of blocking a whole plugin.
  - Added explicit `manifest.searchProviders` declarations for the official `touch-browser-data` browser-bookmarks push provider and the `touch-browser-bookmarks` Quicklinks-style push provider, so both appear in Settings provider enablement/order controls without relying on legacy push-feature provider derivation.
  - Added explicit `manifest.searchProviders` declarations for multi-push official plugins `touch-browser-open`, `touch-snippets`, and `touch-translation`, mapping browser open/web search, snippets search/save/manage, and translation/multi-source translation features to separate provider ids for Settings-level ordering and enablement.
  - Completed explicit `manifest.searchProviders` coverage for all 18 current push plugins, including system/window actions, Snipaste, batch rename, developer utilities, emoji/symbols, text tools, clipboard history, intelligence, and workspace scripts. `pnpm plugins:validate` now reports 18/18 search provider coverage with no migration warnings for repository plugins.
  - Updated `plugins:validate` to recognize `search.root-results` / `fs.index`, validate provider scope-to-manifest permission mappings, and emit non-blocking migration warnings plus coverage for push plugins that still rely on compatibility-derived search providers.
  - Added `settings.indexedSource` provider-config transport entries and Settings UI controls for indexed provider enablement and ordering.
  - Wired saved search provider config into SearchEngineCore's default provider pool: disabled providers are skipped, enabled providers are ordered by user config, active provider mode remains unchanged, and cache keys now include a provider-config signature so setting changes do not return stale provider results.
  - Connected Settings source diagnostics to `settings.indexedSource` runtime maintenance actions, allowing per-source scan, reconcile, and reset from Advanced Settings through the typed SDK instead of private provider IPC.
  - Clarified Browser Bookmarks ownership: the CoreApp `BrowserBookmarksIndexedSource` remains a disabled runtime skeleton for migration diagnostics, while the product target is an official browser-data plugin provider gated by plugin permissions and user consent.
  - Synced project and Nexus docs so App/File/Everything/Browser Data/Quicklinks future work points to unified source health, diagnostics, and phased App/File/Browser Data migration instead of duplicating per-provider indexing loops.

## 2026-05-29

### ci(release): publish beta.6 and tighten release gate sync

- `.github/workflows/build-and-release.yml`
- `scripts/update-validate-release-manifest.mjs`
- `scripts/backfill-release-assets-from-github.mjs`
- `scripts/check-release-gates/remote-checks.mjs`
- `notes/update_2.4.11-beta.6.{zh,en}.md`
- `.github/workflows/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/{README,TODO}.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/{PRD-QUALITY-BASELINE,NEXUS-RELEASE-ASSETS-CHECKLIST}.md`
- `docs/plan-prd/03-features/download-update/{github-release-asset-spec,pre-release-validation}.md`
  - Published `v2.4.11-beta.6` through the GitHub Actions Build and Release matrix; Windows/macOS/Linux builds, GitHub prerelease creation, and Nexus BETA latest sync completed successfully.
  - Added committed bilingual beta.6 notes so local Gate D checks do not rely only on generated workflow artifacts.
  - Updated release manifest validation to accept both the canonical `tuff-core-*` naming contract and the current workflow-produced platform-prefixed core asset names while preserving sha256/platform/arch validation.
  - Fixed the Nexus sync path to follow the GitHub manifest asset redirect, skip updater/debug YAML metadata before asset linking, and run GitHub-manifest sha256 backfill for all tags instead of only `v2.4.7`.
  - Updated remote release gate checks to validate the manifest asset on GitHub Release and keep Nexus assets as the platform download matrix, avoiding a fake platform/arch slot for metadata.
  - Verified `v2.4.11-beta.6` with `check-release-gates --stage gate-d --strict`; remaining remote sha256/signature warnings are tracked release integrity debt and do not mean the beta release failed.

### docs(plan): add post-slice UI compatibility review

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-post-slice-review-2026-05-29.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
  - Added a post-slice review after the 2026-05-29 UI/compatibility governance slices, confirming no new P0 fixed fake-success was found in the current live tree.
  - Recorded the current UI direction as a professional, dense, scan-friendly desktop tool surface, with evidence and consistency now more important than a broad visual redesign.
  - Synced the next-step focus to recent-path validation for Windows App indexing, Everything registry PATH probing, CoreBox function key hardening, and manual file index rebuild completion notification, plus Windows real-device evidence and TuffEx visual smoke screenshots.

### fix(coreapp): harden Windows app indexing and CoreBox key handling

- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/{everything-provider,file-provider}.ts`
- `apps/core-app/src/main/utils/i18n-helper.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/{window,key-transport}.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/plan-prd/01-project/CHANGES.md`
  - Windows app scanner now verifies shortcut targets before indexing, expands `%ENV%` in registry paths, and adds the Windows `App Paths` registry as an extra app discovery source behind Start Menu results; Everything CLI detection also probes executable candidates built from registry `Path` entries instead of relying only on the inherited process `PATH`.
  - CoreBox now blocks function keys (`F1`-`F24`) in the renderer, BrowserWindow, attached plugin UI views, and key-forwarding transport to prevent F11 fullscreen or plugin-side function-key leakage.
  - Manual file index rebuild now emits a system notification after the manual indexing run completes successfully; the main-process i18n helper also tolerates Electron app mocks without `getLocale` in focused tests.

### fix(corebox): hide placeholder during IME composition input

- `apps/core-app/src/renderer/src/views/box/BoxInput.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Synced the custom CoreBox placeholder visibility with the native input DOM value during `input` and IME composition events, so pinyin pre-edit text hides the overlay placeholder before Vue `v-model` commits.

### feat(quality): close UI compatibility debt slices

- `apps/core-app/src/main/utils/legacy-alias-telemetry.ts`
- `apps/core-app/src/main/modules/{terminal,sync,auth,box-tool}/**`
- `plugins/touch-{text,code}-snippets/manifest.json`
- `apps/core-app/src/renderer/src/modules/store/providers/{nexus-store-provider,tpex-api-provider}.ts`
- `packages/tuffex/packages/components/src/dialog/src/*`
- `apps/core-app/src/renderer/src/components/base/dialog/*`
- `apps/nexus/server/utils/evidenceSource.ts`
- `apps/nexus/server/api/{pageview,docs/**,admin/analytics/docs.get}.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/scripts/tuffex-visual-smoke.mjs`
- `docs/plan-prd/{README.md,TODO.md,docs/PRD-QUALITY-BASELINE.md}`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/INDEX.md`
  - Added payload-free legacy alias telemetry for Terminal / Sync / Auth / CoreBox retained listeners with fixed `family`, `legacyEvent`, `canonicalEvent`, `direction`, `timestamp`, and `sourceModule` metadata.
  - Marked old snippets placeholders as `deprecated`, `hidden`, and `replacedBy: "touch-snippets"` while filtering hidden entries from normal CoreApp Store discovery.
  - Split dialog `message` into plain-text rendering and explicit trusted-only `messageHtml`, with TuffEx/CoreApp tests and docs updated away from implicit HTML examples.
  - Added a shared Nexus evidence source enum/guards for `live | d1 | r2 | local-only | memory | open`; governance UI now treats `memory/local-only` as fallback evidence, not production-ready evidence.
  - Added focused TuffEx composition visual smoke coverage for data operations, navigation shell, feedback task center, permission orchestration, and release policy forms across 375/768/1440, light/dark, and reduced motion. This remains focused evidence and does not change `quality:pr` or `quality:release`.

### feat(tuffex): expand drawer direction, sizing, slots and mask controls

- `packages/tuffex/packages/components/src/drawer/src/TxDrawer.vue`
- `packages/tuffex/packages/components/src/drawer/src/types.ts`
- `packages/tuffex/packages/components/src/drawer/__tests__/drawer.test.ts`
- `packages/tuffex/docs/components/drawer.md`
- `apps/nexus/content/docs/dev/components/drawer.{zh,en}.mdc`
- `apps/nexus/app/components/content/demos/Drawer{Direction,CustomWidth,SlotsEffects}Demo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/divider.{zh,en}.mdc`
- `apps/nexus/app/components/content/demos/Divider{Basic,Vertical}Demo.vue`
  - Expanded `TxDrawer` from left/right width-only behavior to four directions with one `size` prop that maps to width or height by direction and supports CSS lengths, percentages, numeric px, and `full`.
  - Added the discoverable `full` boolean prop as an equivalent to `size="full"` for 100% active-axis opening.
  - Added custom Header/Footer slots, `showHeader` / `showFooter`, TxDivider-based built-in separators, configurable `maskEffect`, transparent panel mode, and default mobile bottom-sheet adaptation with `mobileAdapt=false` opt-out.
  - Kept deprecated `width` as a compatibility alias while updating TuffEx/Nexus Drawer docs and demos to cover each new prop path.
  - Added the missing Nexus `TxDivider` documentation pages, runnable basic/vertical demos, registry entries, and component index links so Drawer separator dependencies have standalone docs.
  - Extended `TxDivider` with `gradient` fade modes (`start` / `end` / `both` / boolean) and updated TuffEx/Nexus docs plus demos for gradient separators.

### docs(audit): update UI and compatibility debt report

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-29.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
  - Added the 2026-05-29 incremental audit for UI adaptation, placeholder/fake implementation risk, compatibility debt, and architecture robustness.
  - Reconfirmed no new P0 production fixed fake-success in the sampled live tree.
  - Recorded that Nexus/TuffEx composition demos and dashboard chart wrappers improve UI completeness, and identified legacy alias telemetry/hard-cut, old snippets placeholder retirement, Nexus `source: memory` evidence separation, dialog message text/HTML split, and TuffEx visual screenshot smoke as the follow-up execution slices now tracked above.

## 2026-05-28

### fix(tuffex): unblock beta typecheck readiness

- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/TODO.md`
  - Removed an unused BaseAnchor local variable surfaced by CoreApp `typecheck` during the `2.4.11-beta.5` readiness pass.
  - Kept behavior unchanged; this only restores the current typecheck path for the beta candidate.

### docs(coreapp): add performance baseline execution plan

- `apps/core-app/package.json`
- `apps/core-app/scripts/bundle-size-report.mjs`
- `docs/plan-prd/04-implementation/performance/CoreAppPerformanceBaseline-2026-05-28.md`
- `docs/plan-prd/04-implementation/README.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added the first-round CoreApp performance baseline plan covering startup, CoreBox search, runtime CPU/memory, and build/package size.
  - Added `build:vite` for quick bundle analysis and `perf:bundle:size` for existing artifact size reports without changing `build`, `quality:pr`, or `quality:release`.
  - Registered low-risk optimization ranking and high-risk refactor gates before any runtime behavior changes.

### ci(tuffex): restore 0.3.7 publish gate

- `pnpm-lock.yaml`
- `.github/workflows/package-tuffex-ci.yml`
- `.github/workflows/package-tuffex-publish.yml`
- `.github/workflows/README.md`
- `packages/tuffex/CHANGELOG.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - Fixed the `@talex-touch/tuffex@0.3.7` publish blocker by aligning the lockfile specifiers for `gsap` and `sass` with the publish-safe concrete semver ranges already declared in `packages/tuffex/package.json`.
  - Expanded Tuffex CI/Publish path filters to include `pnpm-lock.yaml` and `pnpm-workspace.yaml`, so dependency specifier/catalog fixes rerun the package build and publish workflows.
  - Verified locally with `CI=true pnpm install --frozen-lockfile`, `pnpm -C "packages/tuffex" run build`, and `node scripts/validate-publish-manifests.mjs --filter "@talex-touch/tuffex" --pack`.

## 2026-05-27

### docs(nexus): verify release policy form demos

- `apps/nexus/app/components/content/demos/ComponentsReleasePolicyDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{cascader,flat-select,segmented-slider,slider,tag-input}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable release policy demo that composes `TxCascader`, `TxFlatSelect`, `TxSegmentedSlider`, `TxSlider`, `TxTagInput`, `TxTag`, `TxStatusBadge`, and `TxProgressBar`.
  - Marked Cascader, FlatSelect, SegmentedSlider, Slider, and TagInput docs as reviewed/verified with source references, interaction contracts, and admin release-policy guidance.
  - Expanded the Tuffex component hub and composition tutorial with a release configuration path so Dashboard/Admin forms separate scope, policy, thresholds, and metadata.

### docs(nexus): verify permission orchestration demos

- `apps/nexus/app/components/content/demos/ComponentsPermissionOrchestrationDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{tree,tree-select,transfer,timeline}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable permission orchestration demo that composes `TxTree`, `TxTreeSelect`, `TxTransfer`, `TxTimeline`, `TxSearchInput`, `TxStatusBadge`, and `TxTag`.
  - Marked Tree, TreeSelect, Transfer, and Timeline docs as reviewed/verified with source references, interaction contracts, and admin authorization guidance.
  - Expanded the Tuffex composition tutorial with a permission orchestration path so Dashboard/Admin authorization pages separate scope, owner, resource grants, and audit history.

### docs(nexus): verify feedback task center demos

- `apps/nexus/app/components/content/demos/ComponentsFeedbackTaskCenterDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{toast,tooltip,loading-overlay,spinner}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable dashboard task feedback demo that composes `TxToastHost`, `TxTooltip`, `TxLoadingOverlay`, `TxSpinner`, `TxStatusBadge`, `TxProgressBar`, `TxTag`, `TuffSwitch`, and `TxButton`.
  - Marked Toast, Tooltip, LoadingOverlay, and Spinner docs as reviewed/verified with source references, interaction contracts, and admin feedback guidance.
  - Expanded the Tuffex composition tutorial with a task feedback path so Dashboard/Admin pages separate short feedback, action hints, local blocking refreshes, and inline waiting.

### docs(nexus): verify navigation shell demos

- `apps/nexus/app/components/content/demos/ComponentsNavigationShellDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{tabs,dropdown-menu,popover,drawer}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable dashboard navigation shell demo that composes `TxTabs`, `TxDropdownMenu`, `TxPopover`, `TxDrawer`, `TxStatusBadge`, `TxProgressBar`, `TxTag`, and `TuffSwitch`.
  - Marked Tabs, DropdownMenu, Popover, and Drawer docs as reviewed/verified with source references, interaction contracts, and admin settings guidance.
  - Expanded the Tuffex composition tutorial with a navigation/configuration section so Dashboard/Admin settings pages separate fixed navigation, lightweight actions, short notes, and dense configuration.

### docs(nexus): verify data operations demos

- `apps/nexus/app/components/content/demos/ComponentsDataOperationsDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{data-table,pagination,skeleton,layout-skeleton}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable dashboard data operations demo that composes `TxDataTable`, `TxPagination`, `TxSkeleton`, `TxLayoutSkeleton`, `TxStatusBadge`, and `TxTag`.
  - Marked DataTable, Pagination, Skeleton, and LayoutSkeleton docs as reviewed/verified with source references, interaction contracts, and accessibility/loading guidance.
  - Expanded the Tuffex composition tutorial with a data list and pagination section so Dashboard/Admin data regions keep table body, selection state, pagination, and placeholders in one workspace.

### docs(nexus): verify search filter demos

- `apps/nexus/app/components/content/demos/ComponentsSearchFiltersDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{search-input,search-select,search-empty}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable dashboard filter toolbar demo that composes `TxSearchInput`, `TxSearchSelect`, `TxSearchEmpty`, `TxStatusBadge`, and `TxTag`.
  - Marked SearchInput, SearchSelect, and SearchEmpty docs as reviewed/verified with source references, interaction contracts, and accessibility/recovery guidance.
  - Expanded the Tuffex composition tutorial with a search/filter path so Dashboard/Admin list pages keep keyword search, scope filtering, match count, and no-match recovery in one reactive path.

### docs(nexus): verify empty and recovery state demos

- `apps/nexus/app/components/content/demos/ComponentsRecoveryStatesDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{empty-state,error-state,loading-state}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a dashboard recovery-state demo that composes loading, empty, error, no-data, search-empty, and no-selection states inside one data container.
  - Marked EmptyState, ErrorState, and LoadingState docs as reviewed/verified with source references, accessibility guidance, and recovery-path usage notes.
  - Expanded the Tuffex composition tutorial with a dedicated data recovery section so Dashboard/Admin pages cover loading, no-data, and request-failure paths together.

### docs(nexus): verify dashboard status component docs

- `apps/nexus/app/components/content/demos/ComponentsOperationsStatusDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/{status-badge,progress-bar,stat-card}.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `apps/nexus/app/pages/dashboard/team.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a screenshot-verifiable operations status demo that composes `TxStatCard`, `TxStatusBadge`, `TxProgressBar`, `TuffSwitch`, and `TxButton` into a dashboard header pattern.
  - Marked StatusBadge, ProgressBar, and StatCard docs as reviewed/verified, expanded bilingual API notes, accessibility notes, and dashboard composition examples.
  - Expanded the Tuffex composition tutorial with operations status and chart sections so dashboard/admin pages have a clearer “status → metric → progress → trend” pattern.
  - Replaced the Team dashboard credit trend hand-written SVG sparkline with the shared ECharts-backed `DashboardSparklineChart` wrapper.

### docs(nexus): add Tuffex composition tutorial and chart-backed dashboard sparklines

- `apps/nexus/app/components/content/demos/ComponentsWorkflowPanelDemo.vue`
- `apps/nexus/app/components/content/demos/ComponentsDashboardSparklineDemo.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/index.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/tuffex-composition.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/index.{zh,en}.mdc`
- `apps/nexus/app/components/dashboard/DashboardSparklineChart.client.vue`
- `apps/nexus/app/pages/dashboard/{credits,overview,storage}.vue`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`
  - Added a reviewed Tuffex composition demo that combines search input, switch, primary action, status badges, progress, and selectable data table into a screenshot-verifiable admin slice.
  - Added bilingual Tuffex composition tutorials under developer getting-started docs and linked them from the component hub and getting-started index.
  - Added a reusable ECharts-backed `DashboardSparklineChart` client component, documented it with a public screenshotable demo, and replaced one-off SVG sparklines in Credits, Storage, and Overview dashboard pages.
  - Kept the change scoped to Nexus docs/dashboard UI without altering API contracts or storage behavior.

## 2026-05-26

### ci(npm): guard publish manifests before registry release

- `scripts/package-publish.config.mjs`
- `scripts/validate-publish-manifests.mjs`
- `scripts/publish-package.mjs`
- `package.json`
- `packages/tuffex/package.json`
- `scripts/check-release-gates/local-checks.mjs`
- `.github/workflows/package-*-publish.yml`
- `.github/workflows/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/TODO.md`
  - Added an explicit publishable package registry and source/packed manifest validator so public npm packages cannot ship `catalog:` / `workspace:` / `file:` / `link:` protocols to registry consumers.
  - Added a unified publish entry that runs the manifest gate, optional build/test steps, dependency availability waits, npm duplicate-race handling, and registry manifest verification.
  - Wired package publish workflows and release-gate local checks through the shared guard instead of ad-hoc publish commands.
  - Prepared `@talex-touch/tuffex@0.3.7` by replacing publish-facing `catalog:` specs for `gsap` and `sass` with concrete semver ranges.

### docs(nexus): expand FlatRadio docs with multiple and keyboard scenarios

- `apps/nexus/app/components/content/demos/FlatRadioMultipleDemo.vue`
- `apps/nexus/app/components/content/demos/FlatRadioKeyboardDemo.vue`
- `apps/nexus/content/docs/dev/components/flat-radio.{zh,en}.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `FlatRadioMultipleDemo` to cover `multiple` model behavior with icon options and selected-value readout.
  - Added `FlatRadioKeyboardDemo` to demonstrate keyboard workflow in both single and multiple modes.
  - Updated Chinese and English FlatRadio docs with `multiple` and keyboard demo blocks, and aligned API/Event signatures to `string | number | (string | number)[]` payloads.
  - This change keeps docs and demos aligned with the current `TxFlatRadio` implementation contract.

### fix(core-app): unify app theme resolution

- `apps/core-app/src/shared/theme/theme-mode.ts`
- `apps/core-app/src/renderer/src/modules/storage/theme-style.ts`
- `apps/core-app/src/renderer/src/AppEntrance.vue`
- `apps/core-app/src/renderer/src/components/base/effect/GlassSurface.vue`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
  - Added a shared `light | dark | auto` theme resolver that preserves the existing storage shape while exposing a concrete `resolvedTheme`.
  - Unified renderer DOM theme application across `html.dark`, `html[data-theme]`, and `color-scheme` so TuffEx tokens and browser-native surfaces receive the same resolved mode.
  - Made Sonner toasts and GlassSurface follow the app resolved theme instead of independently reading system preference.
  - Synced Electron `nativeTheme.themeSource` from the stored app theme and updated CoreBox injected UI views with `data-theme` and `color-scheme`.
  - Verification: targeted theme tests, `typecheck:node`, scoped ESLint, and `git diff --check` passed; `typecheck:web` remains blocked by the existing TuffEx `arrowEl` unused-variable error.

### docs(nexus): expand DatePicker component documentation

- `apps/nexus/app/components/content/demos/DatePickerDatePickerDemo.vue`
- `apps/nexus/content/docs/dev/components/date-picker.{zh,en}.mdc`
  - Expanded the DatePicker demo from a single popup sample into popup, bounded-range, and inline rendering workflows with localized labels and live value readouts.
  - Synchronized English and Chinese DatePicker docs around the real `YYYY-MM-DD` contract, invalid-value initialization, min/max clamping, popup vs inline behavior, and event semantics.
  - Added source links and verified metadata so the migrated docs slice has the same audit affordance as other reviewed TuffEx component pages.

### docs(nexus): verify Picker component documentation

- `apps/nexus/app/components/content/demos/PickerPickerDemo.vue`
- `apps/nexus/content/docs/dev/components/picker.{zh,en}.mdc`
  - Replaced the placeholder Picker demo with popup, inline disabled-option, and dense-row workflows using typed `PickerValue` array models.
  - Synchronized English and Chinese Picker docs around array value normalization, disabled-option fallback, popup vs inline rendering, toolbar events, and row sizing clamps.
  - Added source links and verified metadata so the migrated Picker docs page is ready for browser-backed review.

### docs(nexus): verify Radio component documentation

- `apps/nexus/app/components/content/demos/RadioRadio*.vue`
- `apps/nexus/content/docs/dev/components/radio.{zh,en}.mdc`
  - Replaced migrated placeholder Radio demos with typed values, localized option labels, visible selected-value readouts, disabled-option coverage, and a working props playground.
  - Synchronized English and Chinese Radio docs around group/item responsibilities, button/standard/card modes, keyboard navigation, disabled-state behavior, and animated indicator semantics.
  - Added source links and verified metadata so the Radio docs page is ready for browser-backed review.

### docs(nexus): verify Select component documentation

- `apps/nexus/app/components/content/demos/SelectSelect*.vue`
- `apps/nexus/content/docs/dev/components/select.{zh,en}.mdc`
  - Replaced migrated Select examples with typed values, localized labels, selected-value readouts, and focused demos for local filtering, remote editable search, disabled states, and scrollable panels.
  - Synchronized English and Chinese Select docs around primitive value handling, option label registration, local vs remote search semantics, disabled behavior, Popover panel props, events, and exposed methods.
  - Added source links and verified metadata so the Select docs page is ready for browser-backed review.

### feat(nexus): render plugin analytics with chart runtime

- `apps/nexus/package.json`
- `apps/nexus/app/components/dashboard/DashboardMetricChart.client.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
- `pnpm-lock.yaml`
  - Added a Nexus-local ECharts runtime wrapper for dashboard metric charts with client-only loading, dark/light styling, tooltip/legend defaults, ResizeObserver resize handling, and empty-state fallback.
  - Upgraded plugin private analytics from dense recent-text lists to chart-backed activity, conversion, retention, usage-hour, invocation-health, action, channel, and version trend sections while preserving text summaries for scanning.
  - Added localized analytics trend copy and static contract checks so the plugin analytics drawer keeps using the chart component for high-density data.

### feat(tuffex): generalize ContextMenu overlays

- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/base-anchor/src/types.ts`
- `packages/tuffex/packages/components/src/context-menu/src/TxContextMenu.vue`
- `packages/tuffex/packages/components/src/context-menu/src/TxContextMenuItem.vue`
- `packages/tuffex/packages/components/src/context-menu/src/TxContextMenuPanel.vue`
- `packages/tuffex/packages/components/src/context-menu/src/TxContextMenuDivider.vue`
- `packages/tuffex/packages/components/src/context-menu/src/types.ts`
- `apps/nexus/app/components/content/demos/ContextMenuContextMenuDemo.vue`
- `apps/nexus/content/docs/dev/components/context-menu.{zh,en}.mdc`
- `packages/tuffex/docs/components/context-menu.md`
  - Added `TxBaseAnchor.virtualReference` and `updatePosition()` so coordinate-anchored overlays can share BaseAnchor positioning, Card surface, arrow, outside close, and GSAP animation behavior.
  - Generalized ContextMenu from a simple right-click surface into a coordinate-aware overlay with `contextmenu` / `click` / `both` / `manual` triggers, repeated right-click position following, viewport collision handling, arrow support, and configurable animation modes.
  - Rewired ContextMenu to use `TxBaseAnchor` virtual-anchor mode instead of maintaining separate Floating UI / CSS-transition logic.
  - Added reusable `TxContextMenuPanel` for embedding menu content inside `TxPopover` or custom overlays, plus `TxContextMenuDivider` for separator rows.
  - Expanded item capabilities with disabled/danger/custom color/shortcut/submenu indicators and per-item `closeOnSelect` control.
  - Added trigger-area and any-pointer close options so right-click targets can dismiss the menu on normal clicks without breaking click-triggered menus.
  - Ensured ContextMenu rows used as Popover references stretch to full panel width for secondary menu scenarios.
  - Expanded Nexus and TuffEx docs with right-click binding, controlled coordinates, custom trigger, Popover embedding, secondary menus, divider/disabled/danger/color/shortcut examples, and automatic placement/animation guidance.
  - Validated with BaseAnchor/ContextMenu/Popover Vitest, TuffEx `vue-tsc --noEmit --skipLibCheck`, and scoped ESLint for changed TuffEx/Nexus files.

### ci(release): generate concise bilingual GitHub release notes

- `.github/workflows/build-and-release.yml`
- `scripts/generate-release-notes.mjs`
- `scripts/generate-release-notes.test.mjs`
- `.github/workflows/README.md`
- `.github/PULL_REQUEST_TEMPLATE/en.md`
- `.github/PULL_REQUEST_TEMPLATE/zh-CN.md`
- `docs/plan-prd/docs/github-automation.zh-CN.md`
  - Replaced the long hard-coded GitHub Release body with a generated concise bilingual release body.
  - Added a release notes generator that resolves the previous same-channel tag, collects merged PR metadata from the release range, filters `skip-changelog`, and writes GitHub/Nexus-ready notes artifacts.
  - Kept committed `notes/update_<version>.{zh,en}.md` files as the highest-priority source for Nexus sync while using generated notes as the fallback.
  - Validated with generator Vitest, file-level ESLint, historical tag dry-run, workflow YAML parse, and `git diff --check`.

### feat(tuffex): add Checkbox visual variants

- `packages/tuffex/packages/components/src/checkbox/src/TxCheckbox.vue`
- `packages/tuffex/packages/components/src/checkbox/__tests__/checkbox.test.ts`
- `apps/nexus/app/components/content/demos/CheckboxCheckbox*.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/checkbox.{zh,en}.mdc`
- `packages/tuffex/docs/components/checkbox.md`
  - Fixed Nexus Checkbox demos so preview panels render real `TxCheckbox` components instead of escaped template text.
  - Added `variant="fill" | "checkmark"`; `fill` remains the default pure filled-square style, while `checkmark` enables an inner SVG tick.
  - Added a localized Nexus variants demo and documented the new prop in Nexus and TuffEx component docs.
  - Validated with Checkbox Vitest, TuffEx `vue-tsc --noEmit --skipLibCheck`, and scoped ESLint for changed Checkbox/Nexus demo files.

### feat(tuffex): expand Rating customization demos

- `packages/tuffex/packages/components/src/rating/src/TxRating.vue`
- `packages/tuffex/packages/components/src/rating/src/types.ts`
- `packages/tuffex/packages/components/src/icon/src/TxIcon.vue`
- `apps/nexus/app/components/content/demos/Rating*.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/content/docs/dev/components/rating.{zh,en}.mdc`
- `packages/tuffex/docs/components/rating.md`
  - Fixed half-star rendering so fractional ratings fill from the left side instead of showing the right-half glyph.
  - Fixed half-star click handling so users can still select a full star / max score; clicking the currently selected full star toggles down to `.5`.
  - Added explicit runtime props for Rating customization so shared/custom icons, colors, size, gap, text color, and animation settings work in compiled Nexus demos.
  - Strengthened the click feedback into a visible bounce + glow + ripple animation and expanded docs with color and heart-icon examples.
  - Expanded Nexus Rating docs with style, custom icon, and animation demos while preserving the existing basic half-star sample.

### fix(core-app): render preload debug logs as text nodes

- `apps/core-app/src/preload/index.ts`
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-25.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/INDEX.md`
  - Replaced the preload debug panel runtime log rendering from `innerHTML` string assembly with explicit `createElement`, `textContent`, and `replaceChildren` calls.
  - Removed the adjacent `debug-preload` console noise while preserving the debug overlay path.
  - Kept the static loading overlay/logo markup boundary unchanged and documented the preload debug slice as closed.
  - Validated with `pnpm -C "apps/core-app" exec eslint --cache --quiet "src/preload/index.ts"` and `pnpm -C "apps/core-app" run typecheck:node`.

### docs(nexus): mark BaseAnchor docs reviewed

- `apps/nexus/content/docs/dev/components/base-anchor.zh.mdc`
- `apps/nexus/content/docs/dev/components/base-anchor.en.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Marked localized BaseAnchor docs as manually reviewed via `verified: true` metadata.

### feat(tuffex): add BaseAnchor animation modes

- `packages/tuffex/packages/components/src/base-anchor/src/types.ts`
- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue`
- `packages/tuffex/packages/components/src/base-anchor/__tests__/base-anchor.test.ts`
- `packages/tuffex/packages/components/src/base-anchor/index.ts`
- `packages/tuffex/packages/components/src/popover/src/types.ts`
- `packages/tuffex/packages/components/src/popover/src/TxPopover.vue`
- `packages/tuffex/packages/components/src/popover/__tests__/popover.test.ts`
- `packages/tuffex/packages/components/src/dropdown-menu/src/types.ts`
- `packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue`
- `packages/tuffex/packages/components/src/dropdown-menu/__tests__/dropdown-menu.test.ts`
- `packages/tuffex/packages/components/src/tooltip/src/TxTooltip.vue`
- `packages/tuffex/packages/components/src/tooltip/__tests__/tooltip.test.ts`
- `apps/nexus/app/components/HeaderUserMenu.vue`
- `apps/nexus/app/components/content/demo-registry.ts`
- `apps/nexus/app/components/content/demos/BaseAnchorAnimationDemo.vue`
- `apps/nexus/app/components/content/demos/BaseAnchor*.vue`
- `apps/nexus/content/docs/dev/components/base-anchor.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/components/{index.zh,popover.*,dropdown-menu.*}.mdc`
  - Renamed the Chinese BaseAnchor docs and navigation from the previous visual metaphor to `BaseAnchor 锚点定位`.
  - Added `BaseAnchorAnimationOptions` and `animation.type` modes: `transfer` for the existing directional reveal, `boom` for focus-scale blur/scale/opacity motion, `opacity` for fade-only motion, and `none` for instant show/hide.
  - Kept legacy `duration` / `ease` as compatibility fallbacks while forwarding the unified `animation` object through Popover / DropdownMenu / Tooltip wrappers.
  - Added a Nexus animation demo and expanded the BaseAnchor playground/docs to compare animation modes and surface behavior.
  - Validated with BaseAnchor / Popover / DropdownMenu / Tooltip Vitest, TuffEx `vue-tsc --noEmit --skipLibCheck`, scoped ESLint for changed TuffEx/Nexus files; Nexus `vue-tsc --noEmit --skipLibCheck` still reports pre-existing unrelated Volar export warnings plus `TuffPropsTable` timeout and `packages/utils/core-box/preview/abilities/*` strictness errors.

## 2026-05-25

### docs(nexus): mark Input docs reviewed

- `apps/nexus/content/docs/dev/components/input.zh.mdc`
- `apps/nexus/content/docs/dev/components/input.en.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Removed the introductory status quote from the Input component docs page.
  - Marked the localized Input docs as manually reviewed via `verified: true` metadata.

### refactor(tuffex): use TxButton for dialog internal actions

- `packages/tuffex/packages/components/src/dialog/src/TxBottomDialog.vue`
- `packages/tuffex/packages/components/src/dialog/src/TxBlowDialog.vue`
- `packages/tuffex/packages/components/src/dialog/src/TxPopperDialog.vue`
- `packages/tuffex/packages/components/src/dialog/src/TxTouchTip.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Replaced Dialog / BottomDialog / PopperDialog / TouchTip internal action `<button>` markup with `TxButton` so Nexus component demos render dialog actions with TuffEx button behavior and native component styling.
  - Added `confirmText` for BlowDialog / PopperDialog and wired Nexus Dialog demos/docs so Chinese pages show localized confirmation text instead of hard-coded `Confirm`.
  - Adjusted BlowDialog / PopperDialog confirmation button layout for absolute-positioned `TxButton` usage and focused the dialog container on open to avoid an immediate visible button focus ring in demos.
  - Marked Nexus Dialog component docs as manually reviewed via `verified: true` metadata.
  - Removed duplicated local spinner/button visual styles from dialog internals while preserving layout hooks, loading states, countdown text, focus behavior, and close callbacks.
  - Validated with `pnpm -C "../../packages/tuffex" exec vue-tsc --noEmit --skipLibCheck` and scoped ESLint for the changed dialog components.

### refactor(core-app): migrate legacy dialog actions to TxButton

- `apps/core-app/src/renderer/src/components/base/dialog/TouchTip.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TDialogMention.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TBottomDialog.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TBlowDialog.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Replaced legacy dialog action controls that used custom `div`/`span` interactive elements plus `v-wave` and local loading markup with `TxButton` from `@talex-touch/tuffex`.
  - Preserved existing dialog action semantics, loading state, countdown text, close behavior, and dialog layout hooks while removing now-unused custom button loading styles.
  - Validated with `pnpm -C "apps/core-app" run typecheck:web`.

### release(tuffex): queue 0.3.6 package publish

- `packages/tuffex/package.json`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Bumped `@talex-touch/tuffex` from `0.3.5` to `0.3.6` so `.github/workflows/package-tuffex-publish.yml` can publish the new package from GitHub Actions on `master` push.
  - Local validation completed with `pnpm -C "packages/tuffex" run build` and `cd packages/tuffex && npm publish --dry-run --access public`.
  - Direct local `npm publish --access public` was not completed because the local npm session returned `E401 whoami` / `E404 PUT @talex-touch/tuffex`; publish authority is expected to come from the repository `NPM_TOKEN` used by GitHub Actions.

### docs(plan-prd): add UI and architecture compatibility audit

- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-25.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a current UI/compatibility/placeholder/architecture audit for CoreApp, Nexus, packages, plugins, and plan-prd docs.
  - Confirmed no new P0 production fake-success was found in the scanned live tree, while keeping legacy retained aliases, old snippets placeholder plugins, Nexus memory fallback evidence, preload debug `innerHTML`, dialog `v-html`, and TuffEx visual smoke as P1/P2 follow-up work.
  - Synchronized README/TODO/INDEX/Roadmap/Quality Baseline so the next execution window focuses on evidence-backed small slices instead of another broad placeholder sweep.

### fix(nexus): simplify docs redirect loading and update page overlays

- `apps/nexus/app/components/docs/DocsRedirectLoading.vue`
- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/content/docs/dev/components/glass-surface.en.mdc`
- `apps/nexus/content/docs/dev/components/glass-surface.zh.mdc`
- `docs/plan-prd/01-project/CHANGES.md`
  - Simplified docs redirect loading pages to a centered spinner badge, removing the large skeleton preview and secondary loading copy.
  - Raised the updates page platform dropdown above the release/news card panel so the popover remains visible when opened.
  - Marked the GlassSurface component docs as manually reviewed via `verified: true` metadata.

### fix(nexus): restore docs component navigation and outline

- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/components/DocsOutline.vue`
- `apps/nexus/app/components/docs/DocsComponentSyncTable.vue`
- `apps/nexus/app/components/docs/DocsRedirectLoading.vue`
- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/pages/docs/index.vue`
- `apps/nexus/app/pages/docs/dev/index.vue`
- `apps/nexus/app/pages/docs/guide/index.vue`
- `apps/nexus/app/utils/docs-api.ts`
- `apps/nexus/app/utils/docs-api.test.ts`
- `apps/nexus/app/utils/docs-outline.ts`
- `apps/nexus/app/utils/docs-outline.test.ts`
- `apps/nexus/content/docs/dev/components/index.{en,zh}.mdc`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - Forced JSON parsing for prerendered docs navigation/sidebar/component-sync payloads and added array coercion so production static API responses served as `application/octet-stream` no longer break `.filter()`-based sidebar and table rendering.
  - Converted the component sync table usage in the Tuffex component index docs from raw Vue self-closing syntax to MDC block syntax, preventing Nuxt Content from treating the rest of the page as the component slot and hiding later headings from the DOM.
  - Made the docs outline SVG track start from the first measured entry and suppress invalid paths, avoiding browser `<path d>` errors when the first visible outline entry is not measured yet.
  - Added a shared fullscreen redirect loading/skeleton surface for `/docs`, `/docs/dev`, and `/docs/guide`, so docs entry redirects no longer render the footer or a floating toast-only placeholder.
  - Added a tested minimark heading fallback for outline data when `body.toc.links` is empty and hid the right aside outline panel when no outline exists, while preserving the loading skeleton during fetch.
  - Slightly increased the right-side Tuff Assistant trigger height to improve hit area consistency.
  - Focused validation: scoped Nexus ESLint, `nuxi prepare`, targeted Vitest docs/content tests plus docs API/outline helper tests, and local Nuxt dev smoke for docs API payloads and `/docs/dev/components/index` SSR output. Full Nexus vue-tsc still fails on pre-existing unrelated TypeScript errors (currently Vue Router Volar export warnings and `packages/utils/core-box/preview/abilities/*` strictness errors).

### fix(nexus): dedupe Nitro server utils auto-imports

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabTools.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - Shared the Nexus auto-import file filter with Nitro so `server/utils/billing/index.ts` barrel exports are excluded from server utility scanning, removing duplicate billing provider/type auto-import warnings.
  - Removed server utility re-exports that shadow canonical sources: Scene adapter readiness now comes from `sceneCapabilityAdapterRegistry`, and telemetry event types remain owned by `telemetrySanitizer`.
  - Consolidated Intelligence Lab locale normalization on the canonical `server/utils/locale.ts` helper and kept tool-local coercion private, removing the duplicate `normalizeLocaleCode` auto-import source.
  - Validated with Nexus `nuxt prepare`, focused ESLint, and related Vitest suites.

### fix(nexus): stabilize governance hydration and admin i18n

- `apps/nexus/app/app.vue`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/composables/useLocaleOrchestrator.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/nuxt.config.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Split locale orchestration so SSR init no longer forces immediate client/profile reconciliation before mount; client locale reconciliation now runs after mount and auth/profile sync is gated until the client is ready.
  - Gated Dashboard navigation revalidation, notification unread refresh, admin menu derivation, and team admin derivation behind the mounted state to avoid SSR/client role drift.
  - Converted the Provider Registry admin page to a ClientOnly lazy admin panel shell using the generated `LazyDashboardProviderRegistryAdminPanel` component.
  - Replaced Data Governance cockpit raw fallback translation calls with `tt()` guards and added the missing English/Chinese dashboard, Provider Registry, and common action labels so admin pages keep stable text during SSR and runtime i18n lookup.
  - Kept Data Governance status in progress: this improves local admin hydration/i18n stability and operator readability, but does not close authenticated browser evidence, live send, live object storage, production D1 backfill, or real provider quota evidence.
  - Focused validation: `pnpm -C "apps/nexus" exec vitest run "app/pages/dashboard/admin/governance.test.ts"`, file-scoped ESLint for the touched Nexus files, `git diff --check`, and local `pnpm nexus:build`.

### release: v2.4.11-beta.3

- `package.json`
- `apps/core-app/package.json`
- `pnpm-lock.yaml`
- Git tag `v2.4.11-beta.3`
  - Published the `2.4.11-beta.3` prerelease from a clean release worktree so unrelated Nexus goal edits stayed out of the release commit.
  - Local packaging completed before release with `pnpm build:beta:mac`, producing the macOS beta artifact under `apps/core-app/dist/`.
  - GitHub Actions `Build and Release` completed successfully for the release tag, including Windows, Linux, macOS matrix jobs, release asset upload, and Nexus release sync.
  - Nexus release API returned a published prerelease record for `v2.4.11-beta.3`; `/api/releases/latest` remains on the latest stable release as expected.

## 2026-05-24

### feat(nexus): add read-only operations report snapshot

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/api/dashboard/governance/report.get.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/test/api/dashboard/governance/report.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added an admin-only `/api/dashboard/governance/report` endpoint that builds a read-only operations report snapshot from existing anonymized governance analytics.
  - The snapshot contains cross-area scorecards, open/local-only evidence status, prioritized search/upload/storage/notification/provider-quota risk queue, hot plugin/model/provider leaderboards, and operations trend peaks.
  - Rendered the report snapshot in the Data Governance cockpit above the existing analytics panels so operators can inspect executive posture and evidence blockers without opening raw event rows.
  - Kept the payload aggregate/config-only: raw actor ids, emails, attempt ids, resource ids, object keys, credential refs, provider secrets, and request payloads are not exposed.
  - This strengthens local report/dashboard coverage for item 7, but authenticated browser visual evidence and longer production trend samples remain separate completion evidence.

### feat(nexus): add scene asset upload health analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `uploads.sceneAssetHealth`, grouping Scene adapter asset upload attempts by scene, capability, provider, asset kind, resource type, storage channel, and storage provider.
  - Rendered Scene asset upload health in the Data Governance upload cockpit with started/completed/failed counts, bytes, failure rate, average duration/size, top failure reason, and top status code.
  - Kept the payload aggregate-only: raw admin ids, attempt ids, resource ids, asset ids, object keys, filenames, base64 payloads, credential refs, and upload payload contents are not exposed.
  - This improves local upload reliability and Intelligence/adapt asset-upload visibility, but live adapter execution and real object-storage smoke artifacts remain separate production evidence.

### feat(nexus): add provider model-channel analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `providers.modelChannelDistribution`, grouping Intelligence provider usage by model and channel with aggregate requests, tokens, quantity, unique actors, provider mix, and provider type mix.
  - Rendered the model-by-channel breakdown in the Data Governance provider cockpit next to existing model and channel distribution blocks.
  - Kept the payload aggregate-only: raw actors, prompts, request bodies, credential refs, provider secrets, account ids, and per-request identifiers are not exposed.

### feat(nexus): add plugin review comment quality buckets

- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/server/utils/pluginReviewStore.test.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added aggregate review comment quality buckets for plugin owners: empty, short, medium, and long comment groups with status counts, average rating, low-rating rate, title coverage, comment coverage, and average content length.
  - Added aggregate moderation timing for pending review age and processed review turnaround, grouped into under-1-hour, 1-24-hour, 1-7-day, and over-7-day buckets with average/max hours.
  - Rendered the buckets and moderation timing summaries in the plugin detail review quality panel so owners can inspect prompt quality, low-rating concentration, and review backlog without opening raw review text.
  - Reused the same comment analytics helper for D1-backed and local fallback analytics to avoid drift between production and local paths.
  - Added focused API contract coverage for owner reads, admin cross-owner reads, and non-owner rejection before private analytics aggregate queries run.
  - Kept the payload aggregate-only: raw reviewer ids, author names, emails, review ids, comment bodies, and raw review content are not exposed.

### fix(nexus): make Nexus updates download page single-screen

- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/app/layouts/home.vue`
- `apps/nexus/public/assets/updates/download-bg.png`
- `docs/plan-prd/01-project/CHANGES.md`
  - Replaced the `/updates` click-to-scroll hero/download flow with a single-screen, non-scrolling download surface.
  - Swapped the generated gradient hero background for the provided downloaded background image asset, using full-image contain scaling with reduced saturation to avoid the previous blue-tint crop.
  - Removed the extra hero badge/subtitle copy and changed the page composition to a top hero plus lower controls/content stack.
  - Reduced the hero title scale with gradient text, stretched the provided background to fill the viewport, removed release channel switching, and fixed the public surface to the stable channel while routing `More versions` to GitHub Releases.
  - Removed the oversized stable-version empty card from the single-screen surface and kept latest-version footer metadata as the compact release indicator.
  - Restored updates/news to the compact horizontal scrolling card strip under the download controls.
  - Kept current-platform primary download, alternate platform assets, and compact update highlights available within the fixed viewport.
  - Hid the home footer on the single-screen `/updates` view so the page no longer creates extra vertical scroll height; `/updates?view=all` and `/updates/all` keep the normal full update list behavior.
  - Disabled server-side auth session fetching for public `/updates` routes so transient `/api/auth/session` failures cannot turn the download pages into a 500 response.

### feat(nexus): add provider quota smoke evidence

- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/quota/smoke.post.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/test/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `apps/nexus/test/helpers/provider-registry-test-utils.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added an admin-only provider quota smoke endpoint that can dry-run a provider/channel quota or consume one synthetic request plus bounded token usage to prove the quota gate blocks subsequent calls.
  - Added `providers.quotaSmokeEvidence` analytics derived from `provider.quota_smoke.allowed/consumed/blocked/failed` events, including provider/channel, mode, latest status, reason, request/token recording, counts, and unique actor count.
  - Rendered recent provider quota smoke evidence in the Data Governance cockpit beside quota action/risk rows.
  - Kept smoke events out of normal provider request/token distribution so diagnostics do not distort usage leaderboards.
  - Kept the payload aggregate/config-only: raw admin ids, provider credential refs, provider secrets, and request payloads are not exposed.

### feat(nexus): add notification channel test evidence analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `notifications.testEvidence` analytics derived from sanitized channel-test delivery audit context (`test` / `channelTestId`), grouped by notification channel config and action.
  - Rendered recent notification channel test evidence in the Data Governance cockpit with latest status, reason, provider/adapter, duration, status code, planned/sent/skipped/failed counts, and unique actor count.
  - Kept the evidence aggregate/config-only: raw admin ids, recipient emails, message body/content, credential refs, endpoint keys, and provider secrets are not exposed.
  - Focused coverage verifies backend aggregation and UI contract exposure; this is local channel-test auditability and still does not replace real credential-backed send proof.

### feat(nexus): separate notification delivery evidence from channel tests

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `notifications.deliveryEvidence` analytics for non-test notification delivery audit events, grouped by provider/config/action/resource type.
  - Kept channel-test events in `notifications.testEvidence` only, so business notification evidence and admin channel-test evidence remain separately inspectable.
  - Rendered recent delivery evidence in the Data Governance cockpit with latest status, provider/adapter, action/resource type, duration, status code, planned/sent/skipped/failed counts, and unique actor count.
  - Kept the payload aggregate/config-only: raw reviewer/admin ids, recipient emails, credential refs, endpoint keys, provider secrets, and delivery payloads are not exposed.
  - Focused coverage verifies aggregation, test/non-test separation, UI contract exposure, and privacy boundaries; live credential-backed send proof remains a separate production evidence requirement.

### feat(nexus): add recovered upload evidence analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `uploads.recoveredEvidence` analytics for upload attempts that completed after retry recovery, including bounded attempt/resource hashes, storage channel/provider, content type, duration, size, retry count, attempt count, storage operation, and upstream storage status code.
  - Rendered recovered upload evidence in the Data Governance cockpit so operators can inspect retry recovery samples without opening raw upload logs.
  - Kept the payload hash/aggregate-only: raw admin ids, attempt ids, resource ids, object keys, credential refs, and upload payload contents are not exposed.
  - Focused coverage verifies recovered evidence aggregation, UI contract exposure, and privacy boundaries; live failed-sample calibration and real S3/OSS/R2 object evidence remain separate production proof.

### fix(nexus): restore storage smoke route and evidence analytics

- `apps/nexus/server/api/dashboard/storage/channels/smoke.post.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/test/api/dashboard/storage/channels-smoke.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Restored the admin storage smoke endpoint behind `requireAdmin`, wiring `/api/dashboard/storage/channels/smoke` to `runStorageChannelSmoke` with the authenticated admin actor id.
  - Added `storage.smokeEvidence` analytics derived from `storage.channel_smoke.ready/sent/failed` audit events, including latest status, policy/channel/provider, mode, operations, bytes written/read, credential readiness flags, counts, and unique actor count.
  - Rendered the smoke evidence list in the Data Governance cockpit before storage action queue rows so operators can see dry-run/write smoke history without opening raw event logs.
  - Kept the payload aggregate/config-only: raw admin ids, emails, object keys, credential refs, and storage payload contents are not exposed.
  - Added focused route, store, and UI contract coverage; this is local smoke auditability evidence and still does not replace live local/S3/OSS/R2 object write/read/delete proof.

### test(nexus): add local storage write smoke artifact evidence

- `apps/nexus/test/api/dashboard/storage/channels-smoke.api.test.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added an admin smoke-route write-mode test for the memory/local storage channel, proving `runStorageChannelSmoke` performs resolve/write/read/delete, emits `storage.channel_smoke.sent`, and records storage write/read/delete usage against the stable `storage-smoke:<policyId>` governance resource id.
  - Extended storage governance analytics coverage so local/memory smoke artifact usage appears in resource-type and channel usage buckets while smoke history still appears in `storage.smokeEvidence`.
  - Kept the evidence payload bounded: raw admin ids, object keys, diagnostic key prefixes, credential refs, and the smoke payload content are not exposed.
  - This closes the local/memory object smoke artifact test-evidence gap only; live R2/S3/OSS smoke artifacts and authenticated cockpit evidence remain open.

### docs(nexus): add storage governance sizing and alert response runbook

- `docs/plan-prd/04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a storage governance operator runbook covering supported local/memory, R2, S3-compatible, and OSS channel profiles; required policy fields; sizing defaults; smoke procedures; privacy checks; alert response; notification flow; and focused verification commands.
  - Linked the runbook from the primary docs index, PRD README, TODO, and Data Governance progress snapshot so item 5 has an explicit operator reference instead of only implementation/test notes.
  - Kept the status in progress: local/memory smoke remains test evidence, while live R2/S3/OSS smoke artifacts, authenticated cockpit evidence, alert-send evidence, and production D1 backfill remain open.

### docs(nexus): add notification governance live-send runbook

- `docs/plan-prd/04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added a notification governance operator runbook covering browser inbox, Resend, SendGrid, Mailgun, Postmark, SMTP relay, generic HTTP email relay, Feishu/Lark bots, webhook, and Web Push relay profiles.
  - Documented channel config shape, secure credential payload shapes, dry-run and live-send procedure, failure response, governance privacy boundary, evidence checklist, and focused verification commands.
  - Linked the runbook from the primary docs index, PRD README, TODO, and Data Governance progress snapshot so item 6 has an explicit live-send/privacy evidence reference.
  - Kept the status in progress: local channel-test/delivery analytics remain implementation evidence, while real credential-backed email/chat/webhook sends, Web Push relay evidence, and authenticated cockpit evidence remain open.

### fix(nexus): restore Data Governance D1 readiness route

- `apps/nexus/server/api/dashboard/governance/d1-readiness.get.ts`
- `apps/nexus/server/utils/platformGovernanceD1Readiness.test.ts`
- `apps/nexus/test/api/dashboard/governance/d1-readiness.api.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Restored the admin-only `/api/dashboard/governance/d1-readiness` route that the Data Governance cockpit already calls, wiring it to the read-only `getPlatformGovernanceD1Readiness` diagnostic utility.
  - Added focused utility coverage for missing D1 binding, missing index plus backfill warning, and fully seeded ready states; added API coverage for admin gating and sanitized readiness output.
  - Kept the evidence read-only: the route does not run migrations or mutate D1, and the response does not expose raw admin ids, `secure://` refs, API keys, or secrets.
  - This restores local readiness-contract evidence only; production D1 migration/backfill execution evidence remains open.

### fix(nexus): document and stabilize local Pages preview runtime bindings

- `apps/nexus/package.json`
- `apps/nexus/SETUP.md`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Updated `pnpm preview:cf` so local `wrangler pages dev` receives default development `AUTH_ORIGIN`, `AUTH_SECRET`, `APP_AUTH_JWT_SECRET`, and `NUXT_INTELLIGENCE_ENCRYPT_KEY` values as explicit Wrangler bindings.
  - Documented that `.env` / `.env.local` and shell env are read by Nuxt build, but current Wrangler Pages dev does not automatically expose those values to the Worker runtime without `--binding`, which otherwise surfaces as Sidebase `AUTH_NO_ORIGIN`.
  - Recorded the real `tuff` Cloudflare Pages deployment status: failed production deployment `b937459f-a069-44ed-8b6d-c686f8de0671` on `ffc0a4f` was superseded by successful production deployment `c933f4f3-a786-4265-b64f-87a540523f79` on `ad5f243`; public checks returned `200` for the latest deployment and `tuff.tagzxia.com`.
  - Kept Data Governance evidence status in-progress because the local Pages browser pass was unauthenticated and does not replace admin cockpit, live send, live storage, D1 migration/backfill, or real provider quota evidence.

### feat(nexus): route auth emails through notification governance channels

- `apps/nexus/server/utils/email.ts`
- `apps/nexus/server/utils/notificationDispatcher.ts`
- `apps/nexus/server/utils/browserNotificationInboxStore.ts`
- `apps/nexus/server/utils/notificationDispatcher.test.ts`
- `apps/nexus/server/api/auth/[...].ts`
- `apps/nexus/server/api/auth/register.post.ts`
- `apps/nexus/server/api/auth/bind-email.post.ts`
- `apps/nexus/server/api/auth/password/forgot.post.ts`
- `apps/nexus/server/api/admin/users/[id]/password-reset-link.post.ts`
- `apps/nexus/app/pages/dashboard/admin/users.vue`
- `apps/nexus/test/api/auth/auth-email-channel-contract.test.ts`
- `apps/nexus/test/api/admin/users-password-reset-link.api.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Routed register verification, email binding verification, password reset, and NextAuth magic-link emails through configured notification email channels. Resend is handled as the `providerType: "resend"` channel adapter, not as a channel-bypassing environment fallback.
  - Reused notification channel send-mode adapters for auth email HTML/text delivery while preserving per-action routing tags such as `auth.email.verify`, `auth.email.bind.verify`, `auth.password.reset`, and `auth.email.magic_link`.
  - Added an admin-only support recovery endpoint and Users dashboard control to generate bounded one-time password reset links for active users, with TTL clamping and admin audit metadata that records expiry/TTL but not the reset token.
  - Hardened notification governance audit and browser inbox metadata sanitization so subjects, bodies, HTML/text, URLs, recipients, tokens, credential refs, and provider secrets are not stored in aggregate governance telemetry or inbox metadata.
  - Kept the status as local implementation evidence only; live credential-backed send evidence is still required before production completion sign-off.

### fix(nexus): scope scene provider quota checks by capability channel

- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/quota.get.ts`
- `apps/nexus/test/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts`
- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/app/utils/provider-registry-admin.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Passed the Scene Orchestrator capability id into `assertIntelligenceProviderQuota` so provider quota enforcement matches the `provider.request` channel recorded for each scene capability.
  - Added a regression test proving an exhausted `text.translate` quota does not block an `image.translate` scene for the same provider, while the executed capability still records its own request channel.
  - Extended the Provider Registry quota GET response with a backward-compatible `quotas[]` list so multi-channel provider quota configs are visible without replacing the existing `quota` field.
  - Rendered multi-channel provider quota summaries in the Provider Registry admin panel, including per-channel request/token/window limits and the configured channel count.
  - Kept the change narrowly scoped to channel isolation; this is local fail-closed evidence, not production provider-call evidence.

### feat(nexus): add anonymous search frequency cohorts

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `searches.frequencyCohorts` to group anonymized search users into single/light/regular/power search cohorts with search count, active-day, selection, zero-result, problem, local-time, preference, context, and plugin aggregates.
  - Rendered the cohorts in the Data Governance cockpit before the raw search heatmap and bucket lists so operators can compare casual and power-search behavior without drilling into actor-level data.
  - Kept the payload aggregate-only: raw query text, actor ids, emails, context ids, resource ids, attempt ids, credential refs, and actor/context hashes are not exposed.

### feat(nexus): add provider quota action queue

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `providers.quotaActionQueue` to derive prioritized operator actions from aggregate Intelligence provider quota evaluations.
  - Rendered the queue in the Data Governance cockpit before raw quota risk rows, including priority, suggested action, reason, provider/channel context, usage, utilization, remaining budget, overage, burn rate, and projected exhaustion.
  - Kept the payload aggregate/config-only: no raw actor, email, credential ref, provider secret, attempt id, account id, or per-request payload is exposed.

### feat(nexus): add plugin owner analytics action queue

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `analytics.actionQueue` for owner/private plugin analytics, derived from aggregate install conversion, invocation conversion, failure rate, retention, and country concentration signals.
  - Rendered the owner queue in the plugin detail analytics panel before review quality, including priority, suggested action, reason, conversion/failure/retention context, top country share, and latest aggregate date.
  - Kept the payload aggregate-only: no raw actor id, email, reviewer id, resource id, attempt id, or raw plugin usage event is exposed.

### feat(nexus): add plugin review action queue

- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/server/utils/pluginReviewStore.test.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/analytics.get.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `reviews.actionQueue` to derive prioritized plugin-owner actions from aggregate pending/rejected review backlog, low-rating signals, and title/comment coverage quality.
  - Rendered the queue in the plugin detail review quality panel before rating distribution, including priority, suggested action, reason, pending/rejected counts, low-rating rate, comment coverage, and latest aggregate date.
  - Kept the payload aggregate-only: no raw reviewer id, author name, email, review id, comment body, or raw review content is exposed.

### feat(nexus): add notification governance action queue

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `notifications.actionQueue` to merge notification channel readiness risks and provider delivery health into prioritized operator actions.
  - Rendered the action queue in the Data Governance cockpit before provider mix and raw channel risk rows, including priority, suggested action, reason, channel/provider context, delivery counts, failure rate, duration, and latest failure context.
  - Kept the payload aggregate/config-only: no raw actor, recipient address, credential ref, endpoint key, provider secret, or delivery payload content is exposed.

### feat(nexus): add storage governance action queue

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `storage.actionQueue` to derive prioritized storage governance actions from aggregate channel pressure and policy evaluation rows.
  - Rendered the action queue in the Data Governance cockpit before raw channel pressure, including priority, suggested action, reason, status, remaining budget, overage, burn rate, utilization, alert count, and latest trend date.
  - Kept the payload aggregate-only: no raw actor, email, storage object key, resource id, package id, credential ref, or storage payload content is exposed.

### feat(nexus): add upload reliability action queue

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `uploads.actionQueue` to derive prioritized upload reliability actions from the existing aggregate failure matrix and failed/stuck problem attempts.
  - Rendered the action queue in the Data Governance cockpit before the failure matrix, including priority, suggested action, retry state, calibration state, age, next retry delay, and bounded evidence hash counts.
  - Kept the payload aggregate/hash-only: no raw actor, email, attempt id, resource id, credential ref, object key, or upload payload content is exposed.

### feat(nexus): add governance search local-time heatmap

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `searches.timeHeatmap` to aggregate anonymized local weekday and local hour search behavior into heatmap cells with selection, zero-result, provider-problem, context, and plugin buckets.
  - Rendered the heatmap in the Data Governance cockpit for quick operator scanning of search frequency and quality by local time window.
  - Kept the payload aggregate-only: no raw query, actor, email, context id, resource id, attempt id, credential ref, or secret-bearing metadata is exposed.

### feat(nexus): add governance operations command board

- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added an operations command board to the governance cockpit, derived from `dashboard.trends.operationsTimeline`, showing latest daily searches, selection rate, plugin installs/calls, provider requests/tokens, search/upload risk, and compact trend bars.
  - Kept the command board aggregate-only and front-end derived; no raw query, actor, resource, credential, attempt, or email identifiers are added to the report surface.
  - Recorded the 2026-05-24 local browser evidence attempt as blocked by Nuxt watcher `EMFILE: too many open files, watch`, so it remains an open validation gap rather than completion evidence.

### feat(nexus): add governance operations daily timeline

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added `dashboard.trends.operationsTimeline` as an aggregate-only daily timeline that merges existing anonymized user signup, search quality, plugin, provider, upload, and storage trend signals.
  - Rendered the latest daily operations rows inside the governance operations dashboard for compact operator review, including daily risk score, search selection/problem rate, provider tokens, upload failure rate, and storage operations.
  - Kept the Nexus Data Governance status as in-progress rather than production-complete; live browser, live send, live storage, production D1, and real quota fail-closed evidence remain open validation gaps.

### fix(nexus): restore storage smoke policy resolver for Pages build

- `apps/nexus/server/utils/storageObjectStore.ts`
- `apps/nexus/server/utils/storageObjectStore.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`
  - Restored the exported `resolveStorageObjectExternalConfigForPolicy` resolver used by `storageChannelSmoke.ts`, keeping explicit storage-channel smoke checks on the same credential, bucket, region, and prefix resolution path as normal object storage writes.
  - Added focused coverage for resolving S3 external storage config from an explicit governance storage policy so Nitro/Rollup static imports cannot regress silently.
  - Reproduced the Cloudflare Pages `tuff` production build failure locally with `pnpm nexus:build`, then verified the same command completes successfully after the fix.

### fix(corebox): stabilize resize animation and collapsed result area

- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - Fixed the CoreBox resize feedback loop by measuring actual result children instead of stretched scroll height, and by adding main-process height target tolerance during animated bounds updates.
  - Hid the result container while CoreBox is collapsed or has no result/search state so its top border does not leak as a tiny strip below the search input.
  - Verification: `pnpm -C "apps/core-app" run typecheck:node`, `pnpm -C "apps/core-app" run typecheck:web`, and targeted CoreBox vitest suites passed; dev app stayed alive during the post-fix observation window.

## 2026-05-23

### docs(repo): record completed branch cleanup

- `docs/plan-prd/04-implementation/ActiveGoalBranchCleanup-2026-05-23.md`
- `docs/plan-prd/04-implementation/README.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Updated the branch cleanup snapshot from proposed execution order to completed result, including pushed `master` integration commits, stale/polluted branch decisions, deleted local branches, deleted remote branches, intentionally retained remote refs, and verification evidence.
  - Confirmed the repository branch baseline is back to a single local `master` tracking `origin/master`, with only the main worktree remaining.
  - Kept Nexus Data Governance product completion separate from branch cleanup: local/API/UI coverage exists, but production evidence remains tracked in `NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`.

### docs(plan-prd): record active goal closure order

- `docs/plan-prd/04-implementation/ActiveGoalClosure-2026-05-23.md`
- `docs/plan-prd/04-implementation/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Added the current active goal closure record for 2.4.11 stabilization, branch/worktree discipline, related-only commits, and follow-up plugin/Intelligence slices.
  - Registered the document in the implementation index and high-value documentation entrances so future work can continue from the same execution order.
  - Kept the priority order explicit: quality gates and open PR cleanup first, then retained transport/CoreBox validation, remaining capability surfaces, secret backend, platform evidence, and later Intelligence/plugin enhancements.

### feat(nexus): add horizontal update news rail and all-updates page

- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/app/pages/updates/all.vue`
- `apps/nexus/app/components/updates/UpdatesAllView.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
  - Changed the public updates/news block from a vertical stack into a horizontal card rail using Tuffex `TxEdgeFadeMask` for scroll-edge shadow/fade behavior.
  - Added a `View all` entry point and shared all-updates view that works through both `/updates/all` and `/updates?view=all`, avoiding Nuxt dev-server page-route hot-reload gaps.
  - Added all-updates search plus type and time filters for announcements, releases, news, config, and data updates.

### docs(repo): record active goal and branch cleanup plan

- `docs/plan-prd/04-implementation/ActiveGoalBranchCleanup-2026-05-23.md`
- `docs/plan-prd/04-implementation/README.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
  - Added a branch cleanup snapshot for the screenshot-identified branch set, including current dirty worktree status, branches already merged into `master`, branches that still need merge/review, worktree locks, remote deletion candidates, and the required execution order.
  - Kept the record separate from execution: no commit, merge, push, branch deletion, remote deletion, worktree removal, or artifact deletion is authorized by the document alone.
  - Linked the snapshot from implementation, roadmap, and docs index so cleanup can continue from current evidence instead of the screenshot alone.

### feat(nexus): add plugin review rating trend analytics

- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/server/utils/pluginReviewStore.test.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
  - Plugin owner/private review analytics now includes an aggregate `ratingTrend` with per-day approved rating count, average rating, low-rating count, and low-rating rate.
  - The plugin detail drawer surfaces the latest rating trend and low-rating rate inside the Review quality block, helping plugin owners spot quality regressions without reading raw review content.
  - The payload stays aggregate-only and does not expose reviewer user ids, author names, comment bodies, or raw review rows.

### docs(nexus): add data governance progress snapshot

- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
  - Added an eight-item Nexus Data Governance progress matrix covering anonymized app data, plugin analytics, upload reliability, Intelligence/adapt asset upload config, storage governance, notification governance, operations dashboards, and provider token/quota limits.
  - Split current implementation evidence from missing proof so code-backed aggregates are not treated as full production completion without browser, live-send, live storage, D1 migration/backfill, and provider-call evidence.
  - Added a current verdict, local-evidence roll-up, production evidence blockers, and next execution order so branch cleanup can distinguish finished documentation from unfinished governance/runtime proof.
  - Linked the snapshot from the active roadmap, TODO, and docs index.

### feat(nexus): add search journey funnel analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search governance analytics now returns an aggregate-only journey funnel with filter, with-results, selected, zero-result, provider-problem, provider error, provider timeout, and rate summaries.
  - Journey segments combine anonymized context app category, context source, local time slot, session bucket, preference mode, entry point, and trigger type, plus aggregate scene/provider/plugin/selected-plugin buckets.
  - Data Governance now shows the funnel and top journey segments without exposing raw query text, actor identifiers, emails, context ids, attempt ids, or raw resource ids.

### feat(nexus): add provider quota risk drill-down

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Provider governance analytics now returns quota risk drill-down items for blocked/warning provider policies, including highest utilization, risk reason, remaining request/token budget, overage, and projected exhaustion.
  - Data Governance now shows lowest remaining quota, total overage, nearest exhaustion, and the top risky provider/channel quota rows beside the existing provider usage and model dashboard.
  - Risk drill-down remains aggregate-only and does not expose provider secrets, credential refs, raw actors, or raw account identifiers.

### feat(nexus): add private plugin usage timing analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
  - Plugin owner/private analytics now includes anonymized usage timing buckets across downloads, installs, and invocations: local hour, local weekday, local time slot, and recent timing trend.
  - Plugin detail analytics renders the timing panel between retention and invocation health so plugin owners can see when users tend to download, install, and invoke their plugin.
  - Timing analytics is aggregate-only and keeps raw actor identifiers, raw user emails, URLs, secret-like region values, and request-specific markers out of the API/UI payload.

### feat(nexus): add storage object content fingerprints

- `apps/nexus/server/utils/storageObjectStore.ts`
- `apps/nexus/server/utils/sceneAssetStorage.ts`
- `apps/nexus/server/api/v1/scenes/assets/[key].get.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/syncStoreV1.ts`
- `apps/nexus/server/utils/storageObjectStore.test.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/test/api/v1/scenes/assets.get.test.ts`
  - Shared object storage writes and reads now return a SHA-256 content fingerprint for memory, R2, S3-compatible, and OSS-backed objects.
  - Scene adapter asset references and private scene asset downloads expose the fingerprint through response metadata/header so upload issues can be correlated without leaking raw payloads, object keys, actors, filenames, or credential data.
  - Sync blob upload persistence now reuses the shared storage fingerprint instead of computing a separate hash path, keeping encrypted blob upload integrity evidence aligned with the storage executor.

### feat(nexus): expose provider quota evaluations

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/quota.get.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/quota.post.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/test/api/dashboard/provider-registry/provider-registry.api.test.ts`
  - Extracted reusable Intelligence provider quota evaluation for request and token budgets, including status, utilization, remaining budget, overage, burn rate, and projected exhaustion.
  - Provider Registry quota GET/POST now return the current quota evaluation alongside the saved policy so admin clients can show whether direct invokes and scene runs are `ok`, `warning`, `blocked`, or `disabled` before dispatch.
  - Existing dispatch-time enforcement remains fail-closed through `assertIntelligenceProviderQuota`; the evaluation response is aggregate policy state and does not expose provider secrets or raw actor identifiers.

### feat(nexus): add notification channel profile templates

- `apps/nexus/server/utils/notificationChannelCatalog.ts`
- `apps/nexus/server/api/dashboard/notifications/channels.get.ts`
- `apps/nexus/server/api/dashboard/notifications/channels.post.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/test/api/dashboard/notifications/channels.api.test.ts`
- `apps/nexus/test/api/dashboard/notifications/channels-test.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
  - Added admin notification channel profile templates for browser inbox, Resend, SendGrid, Mailgun, Postmark, SMTP relay, generic HTTP email relay, Feishu bot, Lark bot, generic webhook, and Web Push relay.
  - Data Governance can now fetch the profile catalog and apply provider defaults to the notification channel form, including config JSON, limits, provider/channel identifiers, and credential reference prefixes.
  - Applying a notification profile also seeds the encrypted credential form with the matching API key, SMTP, webhook, or bot-token JSON shape so admins do not have to infer provider credential schemas from backend validation errors.
  - Notification channel config saves now reject unsupported adapters and credential references outside `secure://notifications/*`, while preserving dispatch-time recipient injection and existing no-plaintext-secret safeguards.
  - The notification channel list/save APIs now return resolved adapter profile and readiness summaries alongside saved configs so admin clients can surface unsupported/missing-runtime states immediately without exposing credential material.
  - Data Governance now shows the selected notification channel's adapter, credential requirement, and readiness reason next to the dry-run/send controls.
  - Credentialed notification providers continue to use `secure://notifications/*` references only; the profile API exposes setup metadata without API keys, SMTP passwords, signing secrets, endpoints with secrets, recipients, or credential material.

### feat(nexus): add grain gradient updates hero

- `apps/nexus/app/components/ui/GrainGradientHeroSection.vue`
- `apps/nexus/app/pages/updates.vue`
- `apps/nexus/i18n/locales/{en,zh}.ts`
  - Added a reusable Vue/Nuxt grain-gradient hero for the public updates and downloads page, matching the requested 21st.dev component shape without introducing React/shadcn dependencies.
  - The hero CTA scrolls to the existing release channel, news, and download content while preserving the current release data and platform-specific download logic.
  - Replaced the manually styled release channel tabs with Tuffex `TxRadioGroup` and `TxRadio` button radios for consistent semantics and styling.

### fix(nexus): stabilize component docs sync dashboard

- `apps/nexus/content/docs/dev/components/index.{en,zh}.mdc`
- `apps/nexus/server/api/docs/component-sync.get.ts`
  - Changed the Tuffex component index sync dashboard to use explicit MDC block syntax so following sections remain sibling content instead of being parsed as component children.
  - Component sync status now reads frontmatter stored under Nuxt Content `meta`, so migrated/verified component docs render the correct dashboard status.

### feat(nexus): add storage channel drill-down analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/api/dashboard/storage/channels/analytics.get.ts`
- `apps/nexus/test/api/dashboard/storage/channels-analytics.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
  - Added an admin-only storage channel analytics API for channel/provider drill-down usage, action/resource buckets, latest trend, channel pressure, matched policy evaluations, and alert summaries.
  - Data Governance now shows compact selected-channel storage usage next to the storage policy editor so admins can inspect the current profile's capacity, traffic, operations, action mix, trend, and policy state.
  - The drill-down response stays aggregate-only and excludes raw actor identifiers, object resource ids, credential refs, and storage config payloads.

### fix(nexus): surface recovered upload storage retries

- `apps/nexus/server/utils/storageObjectStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/api/releases/[tag]/assets.post.ts`
- `apps/nexus/server/api/v1/sync/blobs/upload.post.ts`
- `apps/nexus/server/utils/syncStoreV1.ts`
- `apps/nexus/server/utils/updateAssetStorage.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/storageObjectStore.test.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/test/api/releases/assets.post.test.ts`
- `apps/nexus/test/api/v1/sync/blobs-upload.api.test.ts`
- `apps/nexus/server/utils/__tests__/syncStoreV1.test.ts`
- `apps/nexus/server/utils/updateAssetStorage.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - External object uploads now keep bounded retry metadata when transient storage writes recover before the final success.
  - Release asset and sync blob upload governance record recovered retry metadata on completed upload lifecycle events, not only on exhausted failures.
  - Sync blob writes now use the shared object storage layer instead of direct R2 `bucket.put`, so transient R2 failures reuse retry policy, storage usage governance, and bounded retry metadata.
  - Updates payload storage now also uses the shared object storage layer, adding transient R2 write retry and storage usage governance while exposing only a hashed update-payload governance resource id.
  - Data Governance now aggregates and renders recovered upload counts, retry counts, recovered rate, average recovered attempts, and retry-trend recovered buckets.

### feat(nexus): add private plugin retention analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
  - Plugin owner/private analytics now includes anonymized retention and return-usage metrics: active actors, new actors, returning actors, repeat callers, invocation actors, return rate, repeat invoke rate, average active days, average invokes per actor, active-day buckets, and daily return trend.
  - Plugin detail analytics renders the retention summary between conversion and invocation health so owners can see whether downloads/installations convert into repeated usage.
  - Retention analytics is aggregate-only: actor hashes remain internal to set counting and are not returned in API payloads, UI buckets, or trends.

### feat(nexus): enrich anonymized app and search telemetry buckets

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/server/utils/telemetryStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - App visit governance analytics now exposes local weekday, country, region, and timezone hotspot buckets from already-sanitized telemetry/governance metadata.
  - Search governance analytics now exposes query-length buckets beside result-count and latency buckets, allowing admins to compare search frequency and query-shape trends without storing raw query text.
  - Data Governance now renders the additional visit hotspot and query-length dimensions, and focused coverage verifies the telemetry-to-governance path still excludes raw query, actor, URL query, and secret-like values.

### feat(nexus): add private plugin invocation health analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
  - Plugin owner/private analytics now includes aggregate invocation health: total calls, unique callers, successful/failed/skipped/unknown counts, success/failure rates, duration stats, daily trend, failure reason buckets, invocation surface buckets, country/region buckets, channel/version buckets, and local-time-slot buckets.
  - Invocation status is derived only from explicit sanitized metadata (`status`/`result`/`outcome`/`success`/`skipped`); missing evidence remains `unknown` rather than being treated as success.
  - Failure reasons, surfaces, country/region, channel/version, and local-time-slot dimensions are bounded normalized buckets, with URL/path/email/token/secret-like values redacted before reaching owner analytics.

### feat(nexus): add contextual search plugin preference analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search governance analytics now returns `pluginPreferenceByContext`, grouped by sanitized context app category, context source, and local time slot.
  - Data Governance can compare which plugins were seen and selected in each context/time bucket without storing raw query text, raw actor identifiers, or raw app/window context.
  - The cockpit now surfaces context plugin preference beside the existing time-slot preference and context-selection matrix.

### feat(nexus): add notification delivery timing and status diagnostics

- `apps/nexus/server/utils/notificationDispatcher.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/{notificationDispatcher,platformGovernanceStore}.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Notification dispatch now records sanitized per-delivery `durationMs` and HTTP `statusCode` in delivery audit events and returns them from channel test/alert dispatch responses.
  - Data Governance notification analytics now aggregates average/max delivery duration and status-code buckets globally and per provider health row, without storing recipients, credential refs, endpoints, response bodies, or payload bodies.
  - The notification cockpit and saved-channel test panel surface delivery duration and adapter status code alongside existing sent/failed/skipped health and provider failure diagnostics.

### feat(nexus): add anonymized plugin review comment analytics

- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/server/utils/pluginReviewStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
  - Plugin owner/private analytics now includes anonymized review comment quality metrics: title coverage, comment content coverage, average content length, status buckets, and daily trend.
  - Plugin detail analytics renders the comment coverage summary inside the existing Review quality card, keeping the UI compact while exposing stronger comment/review evidence for plugin owners.
  - Focused coverage verifies that the analytics payload stays aggregate-only and does not expose reviewer email, author name, or raw review content.

### feat(nexus): add upload failure sample calibration

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Upload failure matrix rows now include calibration status, sample source, sample count, and latest sampled timestamp so real/live/manual samples can be distinguished from uncalibrated failure buckets.
  - Data Governance upload reliability now shows failure calibration coverage and live/manual sample counts beside retry diagnostics.
  - The default remains fail-closed for evidence quality: failure buckets without live/manual/synthetic sample metadata stay `needs-calibration` rather than being treated as verified.

### feat(nexus): merge scene adapter upload config

- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/server/utils/sceneAssetStorage.ts`
- `apps/nexus/server/api/v1/scenes/assets/[key].get.ts`
  - Scene adapter dispatch now receives merged `adapter` / `upload` / `assets` / `constraints` config from provider metadata, provider capability metadata, scene metadata, binding metadata, capability constraints, and binding constraints.
  - Later, more specific sources override earlier defaults, allowing Intelligence provider routes to share base config while scenes and bindings tune asset-backed upload routing.
  - Adapter dispatch trace now exposes only sanitized key summaries plus storage channel/provider, asset kind, and source list; credential-like config keys and values stay out of trace metadata.
  - Scene adapters can now explicitly return asset upload descriptors; the orchestrator stores those assets through the shared storage object layer, records upload/storage governance events, and replaces raw base64 output fields with private scene asset references.
  - Scene adapter R2 asset uploads preserve recovered retry metadata on completed upload governance events, so transient asset storage failures are visible in recovered upload retry analytics.
  - Scene adapter asset preflight failures now start and fail an upload governance attempt before payload decoding/size validation errors escape, producing live sampled `payload-validation` failure matrix rows for invalid base64, missing payloads, and size-limit rejections without exposing raw payloads or object keys.
  - Scene asset downloads require Nexus auth or API key access, reject path-like/unsupported object keys before storage reads, and record private storage reads against a hashed scene-asset resource id so raw object keys and binary payloads stay out of analytics.

## 2026-05-22

### fix(plugin): gate browser data external URLs

- `plugins/touch-browser-data/index.js`
- `plugins/touch-browser-data/manifest.json`
- `plugins/touch-browser-data/index.test.cjs`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Browser Data now declares optional `network.internet` for opening local browser bookmark URLs in the default browser.
  - Bookmark result items expose non-mutating `network.internet` capability/audit metadata with browser/profile/host context; denied permission is visible before execution without prompting.
  - Executing a bookmark URL now requests `network.internet`, returns `blocked` when denied, awaits `openUrl` when granted, and returns `started` on successful handoff.

### feat(nexus): add Tuffex docs hero background

- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/components/docs/TuffexDocsHeroBackground.vue`
  - Added a Vue/CSS implementation of the geometric landing hero background for Tuffex documentation routes.
  - The docs layout now switches the ambient background on `/docs/dev/components/*` and `/docs/dev/tools/tuffex`, including locale-prefixed routes, while preserving the existing docs chrome for non-Tuffex pages.
  - The background is decorative only, pointer-events disabled, dark-mode aware, and respects reduced-motion preferences.

### feat(nexus): add storage policy burn-rate forecast

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Storage policy evaluations now return per-day burn rates and projected exhaustion days for stored bytes, traffic bytes, operations, and alert bytes.
  - Storage channel pressure rows reuse the matched policy evaluation so each local/OSS/S3/R2 channel can show remaining budget, burn/day, and projected exhaustion without exposing object keys, actors, credential refs, or filenames.
  - Focused coverage verifies forecast math for storage policy evaluation and channel pressure while keeping existing storage policy enforcement semantics unchanged.

### feat(nexus): add upload pipeline summary

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Upload analytics now returns `pipelineSummary` grouped by resource type, surface, storage channel, and storage provider.
  - Data Governance upload health now shows started/completed/failed/stuck/pending attempt funnels, completion/failure/stuck rates, average duration, and average size before drilling into failure matrix rows.
  - The pipeline summary is derived from sanitized upload attempt metadata and does not expose raw attempt ids, resource ids, actors, object keys, or filenames.

### feat(nexus): enforce provider quota by channel

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.invoke.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Intelligence provider quota enforcement now evaluates provider-level quotas and provider/channel quotas before dispatch, so a `chat.completion` quota only counts `chat.completion` requests/tokens while global provider quotas still cover every channel.
  - Provider governance analytics now returns `channelDistribution` with provider id, channel, requests, tokens, actors, model mix, and provider type mix.
  - Data Governance now shows provider channel usage beside model distribution, keeping prompt/output payloads, raw actors, API keys, and provider secrets out of analytics.

### feat(nexus): add search context selection matrix

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search governance analytics now returns a bounded `contextSelectionMatrix` that groups anonymized search events by context app category, context source, local time slot, and selected result category.
  - Data Governance now shows context selection rows with selection rate, aggregate event/actor counts, and seen/selected plugin buckets without exposing raw query, actor, context, or resource identifiers.
  - Focused coverage verifies the matrix from existing sanitized search metadata and the admin UI contract.

### fix(nexus): harden email auth magic-link flow

- `apps/nexus/server/utils/email.ts`
- `apps/nexus/server/utils/email.test.ts`
- `apps/nexus/server/api/auth/register.post.ts`
- `apps/nexus/server/api/auth/email-capability.get.ts`
- `apps/nexus/server/api/admin/users/[id]/magic-link.post.ts`
- `apps/nexus/app/composables/useSignIn.ts`
- `apps/nexus/app/pages/sign-in/index.vue`
- `apps/nexus/app/pages/sign-in/components/SignInLoginStep.vue`
- `apps/nexus/app/pages/dashboard/admin/users.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
  - Nexus auth email delivery now resolves production-ready Resend notification channels through notification governance config, and exposes a capability endpoint for the sign-in UI.
  - Email registration treats verification email delivery as required and compensates created user/team/token rows on failure, preventing half-created accounts that later report “email already registered”. Existing active unverified accounts can retry signup with the same password to resend verification mail.
  - Sign-in hides Magic Link when no Resend/email delivery is configured, while admin user management can generate short-lived magic login links or password reset links for active users; the governance Resend template now defaults to send mode so it is immediately eligible for auth email delivery after binding credentials.

### docs(plan): add 2026-05-22 compat audit

- `docs/plan-prd/report/cross-platform-compat-placeholder-automation-audit-2026-05-22.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/INDEX.md`
  - Added the 2026-05-22 live-tree compatibility / placeholder / architecture hardening audit.
  - Reconfirmed that current production runtime paths do not show new P0 fixed fake-success or platform capability masquerading as full support.
  - Updated active planning docs to stop treating `touch-snipaste`, `touch-window-presets`, Browser Data source diagnostics, and `touch-quick-actions` shell diagnostics as unstarted work.
  - Re-scoped the next architecture hardening order to Credential Locker/libsecret, real platform evidence, widget runtime sandbox regression, raw console cleanup, example-plugin debug noise, and SRP small-slice refactors.

### docs(core-app): refresh Assistant progress snapshot

- `docs/plan-prd/04-implementation/AssistantExperiment-VoiceFloatingBall-260223.md`
- `docs/engineering/reports/coreapp-visible-assistant-2026-05-22/completion-audit.md`
- `docs/engineering/reports/coreapp-visible-assistant-2026-05-22/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/04-implementation/README.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Rewrote the old Assistant experiment note into the current progress snapshot for Assistant floating ball, VoicePanel, clipboard image translation, visible evidence, open gaps, and next-step evidence plan.
  - Added a completion audit that maps each Assistant requirement to current evidence, explicitly marking provider-backed pin window, provider fallback, release-signed packaged evidence, and platform manual regression as missing.
  - Marked the implementation note as current Beta reference while keeping Stable scope limited to text + OCR and clarifying that clipboard image translation reads the current clipboard image instead of initiating native screenshot capture.
  - Added the current Intelligence boundary: Assistant is the visible desktop entry, while image translation continues to reuse the CoreBox helper and Provider / Scene path; provider selection, health, usage ledger, and fallback evidence stay owned by the Intelligence layer.
  - Added visible experience verifier filtering by Assistant group or individual surface, plus `coreapp-visible-experience-manifest.json` in the Assistant evidence folder.
  - The Assistant manifest now lets `assistant-floating-ball-entry` pass strict artifact/evidence checks independently, while `assistant-screenshot-translate` remains failed until provider-backed pin-window and provider fallback evidence exist.
  - Synchronized Roadmap and PRD Quality Baseline so Assistant floating ball / clipboard image entry is no longer described as purely future Experimental work, while voice wake remains outside Stable.
  - Added navigation entries so future Assistant work can start from the progress snapshot instead of the obsolete 2026-03 environment-gated experiment note.

### feat(nexus): add plugin channel and version trends

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
  - Private plugin analytics now returns daily channel and version trend buckets beside conversion, action, location, install, and overall activity trends.
  - Plugin detail analytics now shows recent channel and version trend cards so owners can see which release channel or version drives downloads, installs, and invocations.
  - Focused coverage verifies channel/version trend aggregation while keeping analytics grouped and free of raw actor identifiers.

### feat(nexus): add provider quota burn-rate forecast

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Provider quota analytics now returns per-policy request/token burn rate per day and projected exhaustion days based on the configured quota window.
  - Data Governance provider quota cards now show burn/day and projected exhaustion beside usage, limits, utilization, remaining budget, and status.
  - Focused coverage verifies forecast math for request and token quotas without changing provider dispatch enforcement or claiming pricing/billing completion.

### feat(nexus): add upload failure matrix analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Upload analytics now returns a bounded `failureMatrix` grouped by resource type, surface, storage channel/provider, reason, retry disposition, and status code.
  - Data Governance upload health now shows failure matrix rows with retry scheduled/exhausted counts and a suggested remediation category such as retry monitoring, storage provider checks, quota/policy checks, payload validation, or manual investigation.
  - Focused coverage verifies retry-scheduled and retry-exhausted failure grouping while keeping raw attempt ids, resource ids, actors, and object keys out of the dashboard payload.

### feat(nexus): summarize notification provider mix readiness

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Notification analytics now returns a bounded provider mix summary by channel, provider type, and adapter, covering enabled, production-ready, warning, disabled, credential-missing, send-mode, relay, and runtime gaps.
  - Data Governance notification delivery now shows provider mix rows so admins can compare Resend, SendGrid, Mailgun, Postmark, SMTP relay, webhook, Web Push, Feishu, and Lark readiness without opening every channel risk card.
  - Focused coverage verifies the multi-email-provider readiness aggregation while keeping credential refs and secrets out of the analytics payload.

### feat(nexus): add storage channel pressure analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Storage analytics now derives `channelPressure` from sanitized storage governance events, grouping channel/provider stored bytes, traffic bytes, operations, writes/reads/deletes, unique actor counts, and recent per-channel trend.
  - Configured storage policies with no current usage now still appear in `channelPressure` with zero traffic, remaining budgets, policy status, and alert state, so admins can see idle local/R2/S3/OSS channels before first upload/read traffic lands.
  - Data Governance storage usage now shows channel pressure status, matched policy, peak utilization, alert count, remaining budget, and latest trend so admins can inspect capacity and traffic pressure without drilling into raw object keys.
  - The aggregation reuses existing storage policy evaluations and only exposes hashed/count-level governance data; raw actor ids, object keys, credential refs, and storage metadata remain out of the dashboard payload.

### feat(nexus): add provider usage billing evidence summary

- `apps/nexus/server/utils/providerUsageLedgerStore.ts`
- `apps/nexus/server/api/dashboard/provider-registry/usage.get.ts`
- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts`
- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/server/utils/providerUsageLedgerStore.test.ts`
- `apps/nexus/test/api/dashboard/provider-registry/usage.api.test.ts`
- `apps/nexus/app/utils/provider-registry-admin.test.ts`
  - Provider usage ledger now returns an admin summary with total rows, completed/planned/failed counts, token totals, billable quantity, estimated rows, pricingRef / providerUsageRef coverage, provider/capability/unit breakdown, and recent usage trend.
  - Provider Registry Admin Usage tab now shows token and billing-evidence readiness from the ledger without inventing cost totals when no pricing amount exists.
  - Focused coverage verifies summary aggregation, API contract, and billing readiness copy while keeping prompt, output, raw request payload, and credential data out of the dashboard payload.

### feat(nexus): add search plugin preference by time slot

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search analytics now derives `pluginPreferenceByTimeSlot` from anonymized governance metadata, grouping seen plugin ids and selected plugin ids by local time slot.
  - Data Governance search context now shows time-slot plugin preference rows so admins can inspect which plugins are surfaced and chosen during morning/afternoon/evening/night usage windows.
  - The aggregation uses coarse time slots plus plugin ids/categories from telemetry metadata and keeps raw queries, actor ids, and request identifiers out of the dashboard payload.

### feat(nexus): add per-plugin action and location trends

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/test/api/dashboard/plugins/analytics.api.test.ts`
  - Private plugin analytics now include per-day action trend buckets and per-day country/region trend buckets in addition to totals, conversion, channel, version, and artifact breakdowns.
  - Plugin detail drawer now surfaces recent action mix and location mix so plugin owners can inspect download/install/invoke movement and geographic concentration from the private analytics view.
  - The new analytics remain derived from hashed governance actors plus coarse country/region metadata; raw users, search queries, and request identifiers are not exposed.

### feat(nexus): classify image and plugin icon upload failures

- `apps/nexus/server/utils/imageStorage.ts`
- `apps/nexus/server/utils/imageStorage.test.ts`
  - Shared image/resource/plugin-icon upload lifecycle failures now use stable reason buckets for invalid asset type, size limit, storage policy blocks, storage write failures, and exhausted retry attempts.
  - Plugin icon extraction and manual asset uploads keep retry metadata from the shared object storage executor while preserving actor and raw filename redaction.
  - Focused coverage verifies invalid icon extension classification and S3 retry-exhausted metadata propagation.

### feat(nexus): add sync blob upload governance diagnostics

- `apps/nexus/server/api/v1/sync/blobs/upload.post.ts`
- `apps/nexus/test/api/v1/sync/blobs-upload.api.test.ts`
  - Sync blob uploads now emit sanitized upload lifecycle events for started, completed, quota-failed, and storage-failed attempts.
  - Data Governance upload health can now see sync blob upload failures under stable `sync-blob:*` governance resource ids while keeping raw user ids, device ids, object keys, and local filenames out of analytics.
  - Focused API coverage verifies completed uploads, quota failures, and missing R2/storage failures.

### feat(nexus): classify release upload storage failures

- `apps/nexus/server/api/releases/[tag]/assets.post.ts`
- `apps/nexus/test/api/releases/assets.post.test.ts`
  - Release asset and release signature upload governance failures now use stable reason buckets for storage policy blocks, storage write failures, and exhausted retry attempts.
  - Failure metadata keeps the existing release tag/platform/arch/surface context while preserving the raw actor and filename redaction guarantees.
  - Focused API coverage verifies release asset retry exhaustion and signature policy-blocked events without exposing private release file names.

### feat(nexus): add Data Governance D1 readiness diagnostics

- `apps/nexus/server/utils/platformGovernanceD1Readiness.ts`
- `apps/nexus/server/api/dashboard/governance/d1-readiness.get.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceD1Readiness.test.ts`
- `apps/nexus/test/api/dashboard/governance/d1-readiness.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Added an admin-only read-only D1 readiness endpoint for Data Governance schema, index, policy seed, credential backfill, browser push, inbox, upload, storage smoke, and notification delivery evidence gaps.
  - Data Governance now surfaces D1 migration readiness with missing table/index counts and per-check seed/backfill reasons without running migrations or exposing `secure://*` references.
  - Focused coverage verifies missing DB binding fail-closed behavior, missing index/seed diagnostics, admin API gating, and UI contract exposure.

### feat(nexus): surface notification production readiness gaps

- `apps/nexus/server/utils/notificationChannelCatalog.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Notification channel analytics now include production-readiness diagnostics for send mode, Web Push public runtime key, and HTTPS SMTP relay endpoint prerequisites.
  - Data Governance now summarizes production-ready notification channels and runtime/relay/send-mode gaps beside existing delivery health and credential risk.
  - Focused coverage verifies Web Push VAPID readiness gaps without exposing `secure://notifications/*`, push endpoints, or subscription keys in analytics.

### feat(nexus): add storage channel smoke diagnostics

- `apps/nexus/server/utils/storageChannelSmoke.ts`
- `apps/nexus/server/utils/storageObjectStore.ts`
- `apps/nexus/server/api/dashboard/storage/channels/smoke.post.ts`
- `apps/nexus/test/api/dashboard/storage/channels-smoke.api.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Added an admin-only storage channel smoke endpoint with `dry-run` readiness mode and explicit `write` mode for short-lived write/read/delete verification through the shared object storage executor.
  - Data Governance storage policy rows now expose dry-run and write smoke actions so admins can produce storage live-evidence against local, R2, S3-compatible, or OSS policies.
  - Smoke audit events use the storage policy id as the governance resource and keep `secure://storage/*` refs, raw temporary object keys, and access-key secrets out of responses and governance metadata.

### test(core-app): add Assistant floating ball smoke probe

- `apps/core-app/scripts/assistant-floating-ball-smoke.ts`
- `apps/core-app/package.json`
- `apps/core-app/src/main/modules/platform/coreapp-visible-experience-evidence.ts`
- `apps/core-app/src/main/modules/platform/coreapp-visible-experience-evidence.test.ts`
  - Added `pnpm -C "apps/core-app" run smoke:assistant -- --remoteDebuggingUrl <json-list>` as a reusable CDP smoke for an already running Electron instance.
  - The smoke verifies the Assistant floating ball DOM, clicks it, and verifies VoicePanel plus the clipboard image translation action without reading or translating the current clipboard image.
  - Added opt-in `--clickTranslateExpectEmpty` coverage for controlled empty-clipboard runs; it clicks clipboard image translation and expects the localized empty-image recovery hint instead of treating a missing image as success.
  - The opt-in empty-clipboard probe now fail-closes with a read-only macOS `NSPasteboard.general.types` preflight: if the system clipboard currently contains an image type, it refuses to click the translate action and records `clipboardImagePreflight`.
  - Added opt-in `--dragFloatingBallExpectPersist` coverage for isolated runtime evidence; it drags the floating ball through CDP, waits for the debounced storage write, and verifies the same coordinates in `app-setting.ini`.
  - Added `--screenshotDir` support so the same smoke can save CDP PNG evidence for the Assistant floating ball and VoicePanel targets; the 2026-05-22 report now includes dev and local packaged-unpacked screenshots for both surfaces.
  - The smoke now accepts packaged `file://` renderer targets in addition to dev `http` targets, so local unpacked app evidence can exercise the same CDP probe.
  - Added opt-in `--clickTranslateExpectPinWindow` and `--clickTranslateExpectProviderUnavailable` modes for controlled clipboard-image success and provider fallback evidence; both modes require a read-only macOS clipboard image type preflight and fail closed before clicking when no image is present.
  - Packaged readiness preflight is recorded in the same evidence folder; after rebuilding local `dist/mac-arm64/tuff.app`, the artifact matches `2.4.11-beta.2` and remote debugging is available, but the unpacked artifact is not release-signed because local builder signing identity is `null`.
  - Runtime evidence: `docs/engineering/reports/coreapp-visible-assistant-2026-05-22/README.md` records isolated Electron dev and local packaged-unpacked runs where the floating ball opened VoicePanel, exposed the `剪贴板图片翻译` action, persisted a dragged floating ball position, and showed the localized empty-image recovery hint with a text-only clipboard preflight.
  - Visible experience evidence now keeps the compatible `assistant-screenshot-translate` id but relabels the surface and checklist to Assistant clipboard image translation, including empty clipboard image and provider fallback recovery.

### fix(core-app): translate Assistant clipboard images

- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `apps/core-app/src/main/modules/assistant/module.contract.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.test.ts`
  - Assistant VoicePanel now uses the canonical typed `assistant:voice-panel:translate-clipboard-image` / `translateClipboardImage` transport event; legacy `assistant:voice-panel:translate-screenshot` remains registered only as a compatibility alias, and the runtime reads the current clipboard image instead of initiating native screen capture.
  - Clipboard image translation reuses `corebox.screenshot.translate` / `image.translate.e2e` and opens the existing image translation pin window.
  - VoicePanel copy now labels the action as clipboard image translation and maps missing image input to clipboard-image recovery guidance instead of Screen Recording permission guidance.
  - Validation: focused Assistant contract and CoreBox image translation tests cover the clipboard image path, empty clipboard image fallback, and native screenshot regression guard.

### feat(nexus): add operations dashboard summary

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Governance analytics now returns a derived `dashboard` summary for user growth, search trend quality, plugin installs, provider requests/tokens, upload status, risk totals, hot plugins, top models, top providers, and recent trend slices.
  - Data Governance now surfaces an Operations dashboard block above the detailed cockpit so admins can scan growth, risk, hot leaderboard, token, and model-distribution signals without digging through every domain panel.
  - Focused coverage verifies dashboard summary fields and keeps raw actor ids, raw attempt ids, raw resource ids, and credential refs out of the analytics payload.

### feat(nexus): route plugin moderation notifications to developers

- `apps/nexus/server/utils/notificationDispatcher.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
- `apps/nexus/server/utils/notificationDispatcher.test.ts`
- `apps/nexus/test/api/dashboard/plugins/version-notification.api.test.ts`
  - Plugin version approval/rejection notifications now pass the plugin developer id into the notification dispatch context so browser inbox, Web Push, and email adapters can target the developer account.
  - Email delivery can derive plugin owner recipients from the account store when runtime recipients are not supplied, while governance configs still reject persisted `to` / `recipients` fields.
  - Focused coverage verifies plugin-owner email routing and the version moderation handler contract without storing raw recipient emails, reviewer emails, credential refs, or API keys in audit events.

### feat(nexus): add additional email notification adapters

- `apps/nexus/server/utils/notificationChannelCatalog.ts`
- `apps/nexus/server/utils/notificationDispatcher.ts`
- `apps/nexus/server/utils/notificationDispatcher.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
  - Notification channels now support `config.providerType` values for SendGrid, Mailgun, and Postmark in addition to Resend, SMTP relay, generic HTTP email, Feishu/Lark, webhook, browser inbox, and Web Push relay.
  - Each email provider remains a separate `provider` instance for filtering and health analytics, while credentials stay behind `secure://notifications/*` references.
  - Focused coverage verifies provider-specific HTTP payloads, provider filtering, and delivery audit sanitization without storing recipient emails, reviewer emails, credential refs, or provider API keys.

### feat(nexus): add search selection quality analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search analytics now aggregates anonymized selection signals: selected provider/category/plugin, selected-rank buckets, result-count buckets, first-result latency buckets, total-duration buckets, and selection rate.
  - Data Governance search behavior now surfaces selection rate plus result quality and selection distribution rows beside local time, context, preference, plugin, and reliability analytics.
  - Focused coverage verifies the new search quality contract without storing raw query text or raw actor identifiers.

### fix(nexus): feed telemetry metadata into governance analytics

- `apps/nexus/server/utils/telemetrySanitizer.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/server/utils/telemetryStore.test.ts`
  - Search telemetry now preserves sanitized selection metadata (`selected`, selected provider/category/plugin/rank) and forwards it into app search governance events, so the existing selection quality cockpit reflects real telemetry ingestion instead of only manually recorded governance events.
  - Visit telemetry now preserves sanitized route/page/surface/referrer/source and local-time metadata, strips query/hash fragments from location-like fields, and writes route-scoped visit governance events for the existing visit hotspot analytics.
  - Focused coverage verifies telemetry-to-governance search selection and visit hotspot aggregation while keeping raw search text, query parameters, client ids, and actor identifiers out of stored telemetry/governance payloads.

## 2026-05-21

### feat(nexus): surface storage policy remaining budgets

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Storage policy evaluations now return remaining and overage budgets for stored bytes, traffic bytes, operations, and alert bytes.
  - Data Governance storage policy cards now show remaining stored/traffic/operation budgets and alert threshold overage beside usage, limits, utilization, status, and reasons.
  - Focused coverage verifies storage policy remaining/overage budget math and UI contract exposure.

### feat(nexus): surface provider quota remaining budgets

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Provider quota analytics now returns remaining request/token budgets and overage counts for each configured Intelligence provider quota.
  - Data Governance provider quota cards now show remaining requests and remaining tokens beside usage, limits, utilization, and status.
  - Focused coverage verifies remaining budget math for provider request/token quota enforcement dashboards.

### feat(nexus): add Intelligence model usage breakdown

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Provider analytics now includes per-model usage breakdown with tokens, requests, unique actors, provider, channel, and provider-type distribution.
  - Data Governance provider cockpit now surfaces model usage breakdown beside provider trend, quota utilization, and provider-type distribution.
  - Focused coverage verifies model distribution details for token/reporting dashboards without exposing raw actor identifiers.

### feat(nexus): add anonymized app visit hotspot analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Visit analytics now aggregates app route/page/surface/referrer, local-hour, local time-slot, trend, and heatmap data from hashed app visit governance events.
  - Data Governance cockpit now surfaces visit hotspot rows beside search, plugin, upload, storage, notification, and provider panels.
  - Focused coverage verifies visit hotspot aggregation and confirms raw visitor identifiers stay out of analytics payloads.

### feat(nexus): add user signup growth trend analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - User analytics now derives daily signup growth trend with per-day growth amount, cumulative signups, and growth-rate delta from existing hashed governance events.
  - Data Governance overview now surfaces the latest user growth trend rows beside total signups, keeping raw user identifiers out of the report.
  - Focused coverage verifies the growth trend contract and UI exposure for growth dashboard requirements.

### feat(nexus): add plugin review status trend analytics

- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/server/utils/pluginReviewStore.test.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
  - Private plugin review analytics now returns daily approved/pending/rejected status trend points for plugin owners/admins.
  - Plugin detail analytics now shows the latest review moderation trend summary beside rating and status totals.
  - Focused coverage verifies aggregated trend output and confirms analytics payloads do not expose reviewer emails, author names, or review content.

### feat(nexus): surface local search preference buckets

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search governance analytics now derives local time-slot buckets from sanitized `localHour` metadata and exposes local weekday counts beside local-hour search preference.
  - Data Governance search context now shows local time slot and local weekday preference rows, improving "when users search" analysis without storing query text or raw actor identifiers.
  - Focused coverage verifies local hour, weekday, and time-slot aggregation plus the UI contract.

### feat(nexus): retry transient object upload writes

- `apps/nexus/server/utils/storageObjectStore.ts`
- `apps/nexus/server/utils/uploadGovernance.ts`
- `apps/nexus/server/utils/storageObjectStore.test.ts`
  - External S3/OSS and R2 object writes now use bounded retry/backoff for retryable transient failures before surfacing upload failure to callers.
  - Final upload failures carry sanitized retry metadata (`retryable`, `retryCount`, `maxRetries`, `nextRetryDelayMs`, storage channel/provider/status) into upload governance, feeding the existing retry analytics without exposing raw object keys, file names, or actors.
  - Focused coverage verifies transient 503 recovery and exhausted retry metadata propagation through upload governance.

### feat(nexus): surface provider adapter readiness

- `apps/nexus/server/utils/sceneCapabilityAdapterRegistry.ts`
- `apps/nexus/server/utils/sceneOrchestrator.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers.get.ts`
- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/server/utils/sceneOrchestrator.test.ts`
- `apps/nexus/test/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `apps/nexus/app/utils/provider-registry-admin.test.ts`
  - Provider Registry list responses now attach capability adapter readiness so declared capabilities without executable Scene adapters are visible before runtime dispatch.
  - Scene adapter key/readiness resolution now lives in a lightweight registry module, avoiding Provider Registry list API imports of heavy runtime adapters and Nitro storage-backed dependencies.
  - Provider Registry Admin capability chips and summaries now distinguish adapter-ready and adapter-missing states while preserving Scene Orchestrator's runtime adapter execution path.

### feat(nexus): add upload retry reliability analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Upload analytics now summarizes retryable, scheduled, exhausted, and non-retryable failed uploads from sanitized upload metadata.
  - Data Governance upload health now shows retry disposition, retry trend, average next retry delay, and problem-attempt retry state without exposing raw attempt ids or resource ids.
  - Focused coverage verifies retry/backoff aggregation and UI contract exposure while leaving the actual upload execution/retry policy unchanged.

### feat(nexus): summarize storage policy risk in governance analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Storage analytics now includes `policySummary` counts for active/blocked/warning/disabled policies, alert count, and peak stored/traffic/operation utilization.
  - Data Governance storage usage now surfaces policy utilization and a bounded risk list, reusing existing storage policy evaluation status/reason semantics.
  - Focused coverage verifies policy summary/risk aggregation and UI contract exposure without changing storage policy enforcement.

### feat(nexus): add plugin conversion trend analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
  - Private plugin analytics now returns daily conversion trend points using the same install/download, invocation/install, and invocation-per-actor formulas as the aggregate conversion summary.
  - Plugin detail analytics now shows the latest active conversion trend point in the conversion efficiency panel.
  - Focused coverage verifies the conversion trend payload and UI contract for plugin owners/admins.

### feat(nexus): add search reliability analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Search governance analytics now returns reliability summary and daily trend for zero-result searches, provider errors, provider timeouts, and problem-search rate from existing sanitized metadata.
  - Data Governance search context now surfaces zero-result rate, provider problem counts, and recent reliability trend without storing query text.
  - Focused coverage verifies aggregation and UI exposure while keeping raw actor/query data out of the analytics payload.

### feat(nexus): summarize notification channel config health

- `apps/nexus/server/utils/notificationChannelCatalog.ts`
- `apps/nexus/server/utils/notificationDispatcher.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/{platformGovernanceStore,notificationDispatcher}.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Notification adapter/profile resolution is now shared between dispatcher and governance analytics for browser, Resend, SMTP relay, Feishu/Lark, webhook, and webpush channels.
  - Governance analytics now returns notification channel health summary and risk list for disabled channels, unsupported adapters, and missing credential refs without exposing secure credential references.
  - Data Governance notification delivery panel now surfaces enabled/missing-credential/unsupported counts and risky channel configs next to delivery audit health.

### feat(nexus): surface plugin conversion analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
  - Private plugin analytics now returns download-to-install rate, install-to-invoke rate, and invocations per actor for plugin owners/admins.
  - Plugin detail analytics now includes a compact conversion efficiency panel beside trend, review, and distribution analytics.
  - Focused coverage verifies conversion aggregation and UI contract exposure without adding raw actor or event identifiers.

### fix(plugin): harden quick actions shell capability

- `plugins/touch-quick-actions/index.js`
- `plugins/touch-quick-actions/index.test.cjs`
- `docs/plan-prd/TODO.md`
  - Quick Actions no longer falls back to raw `exec` when `safe-shell` is unavailable; shell-backed actions now fail closed with `safe-shell-unavailable`.
  - Feature rendering uses non-mutating `system.shell` permission diagnostics only, so listing quick actions does not request shell permission before execution.
  - Quick action items and dynamic feature metadata expose shell capability status, reason, platform, permission, confirmation/admin flags, and audit fields.
  - Action execution now blocks unsafe empty/newline/null command payloads before permission prompts and returns explicit `started`, `blocked`, `failed`, or `cancelled` action status.
  - Validation: `node --test "plugins/touch-quick-actions/index.test.cjs"` passed.

### feat(nexus): add notification delivery trend analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Notification analytics now returns daily planned/sent/skipped/failed delivery counts and unique actor counts.
  - Data Governance notification delivery panel now surfaces recent delivery trend beside provider/adapter/status breakdowns.
  - Focused coverage verifies notification delivery trend aggregation and UI contract exposure without sending live notifications.

### feat(nexus): add upload status trend analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Upload analytics now returns daily started/completed/failed counts, completed bytes, and unique actors for upload status trend inspection.
  - Data Governance upload breakdown now surfaces recent upload status trend next to failure/status-code/problem-attempt diagnostics.
  - Focused coverage verifies upload status trend aggregation and UI contract exposure.

### feat(nexus): add provider usage totals and trend analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Provider analytics now returns total provider request/token usage separately from the top-N provider leaderboard.
  - Data Governance provider cockpit now shows recent provider request/token trend and the overview token card uses the total provider usage summary instead of summing visible leaderboard rows.
  - Focused coverage verifies provider usage summary/trend aggregation and UI contract exposure.

### feat(nexus): summarize provider quota risk in governance analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Provider quota analytics now includes summary counts for total/active/blocked/warning/disabled policies and peak request/token utilization.
  - Data Governance provider quota panel surfaces active, blocked, warning, and peak utilization counts before the per-provider quota list.
  - Focused coverage verifies the quota risk summary contract without changing existing dispatch-time quota enforcement.

### feat(nexus): expose anonymized upload problem attempts

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Upload analytics now returns a bounded `problemAttempts` list for failed or stale stuck upload attempts.
  - Each problem attempt exposes hashed attempt/resource identifiers, status, resource type, surface, storage channel/provider, content type, status code, reason, duration, and age without leaking raw `attemptId` or `resourceId`.
  - Data Governance upload health now surfaces those problem attempts to make intermittent upload failures diagnosable from the dashboard.

### docs(plan-prd): compress data governance status entries

- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Compressed repeated Data Governance status paragraphs in active entry docs into current-state summaries.
  - Kept detailed Data Governance history in this changelog and retained explicit live-evidence gaps in the active TODO/README/INDEX entries.

### feat(nexus): add notification provider health analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Data Governance notification analytics now groups delivery audit by provider instance, including planned/sent/skipped/failed counts, sent rate, failure rate, and latest failure reason/time.
  - The notification cockpit surfaces provider health so admins can distinguish a failing SMTP/Resend/Feishu/Web Push instance without exposing recipients, endpoints, or credential refs.
  - Focused coverage verifies provider health aggregation and UI exposure while preserving the existing sanitized delivery audit model.

### feat(nexus): surface provider quota utilization in governance analytics

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/platformGovernanceStore.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Data Governance analytics now derives Intelligence provider quota usage from saved `intelligence_provider_quota` policies and provider request/token governance events.
  - The provider cockpit shows request/token usage, configured limits, utilization ratios, window days, and `ok`/`warning`/`blocked`/`disabled` status for quota policies.
  - Focused coverage verifies quota utilization aggregation and UI contract exposure without changing the existing dispatch-time quota enforcement path.

### feat(nexus): enrich search context governance analytics

- `apps/nexus/server/utils/telemetrySanitizer.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/server/utils/{telemetryStore,platformGovernanceStore}.test.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - Extended sanitized search telemetry with local hour/day, context app/source, entry point, trigger type, preference mode, session bucket, plugin ids/categories, and bounded context tags without storing raw query text.
  - Data Governance search analytics now aggregates those dimensions alongside existing provider latency/result/status, filter usage, geo/timezone, trend, and heatmap metrics.
  - Upload analytics now also reports attempt count, stale stuck attempts/rate, duration, storage provider, status code, and upload surface while keeping started-only uploads out of terminal size and failure-rate metrics; stuck only counts attempts that have been started for at least 15 minutes without a completed/failed terminal event.
  - Admin Data Governance UI now surfaces local search time, context app, trigger, preference mode, and plugin/plugin-category search usage in the search context panel.

### feat(nexus): add plugin review analytics to asset details

- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/analytics.get.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/i18n/locales/{zh,en}.ts`
- `apps/nexus/server/utils/pluginReviewStore.test.ts`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
  - Added owner/admin-only review analytics to the private plugin analytics payload, including total/approved/pending/rejected counts, approved average rating, rating distribution, and latest review update time.
  - Dashboard plugin detail now shows review count and a compact review quality panel alongside download/install/invocation metrics.
  - Approved reviews are the only source for average rating and distribution; pending/rejected reviews remain visible as moderation counts without affecting quality score.

### fix(nexus): handle reused web device ids across accounts

- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/{user/auth}/me.get.ts`
- `apps/nexus/nuxt.config.ts`
  - Fixed `/api/user/me` failures when a browser-local `x-device-id` is reused after switching accounts by moving the global device record to the active user instead of attempting a duplicate insert into `auth_devices.id`.
  - Cross-account device moves now clear trusted/revoked state and rotate the device token version to avoid inheriting authorization state from the previous account.
  - Removed duplicate session device upsert from `GET /api/user/me`; app-token `/api/auth/me` still refreshes device presence.
  - Added Vite dev `optimizeDeps.include` entries for Mermaid, GSAP plugins, theme colors, simplex-noise, and `path-browserify` to avoid dependency pre-bundle reloads.
  - Validation: focused `authStore-device-reactivation.test.ts` Vitest passed.

### feat(nexus): add data governance analytics foundation

- `apps/nexus/server/utils/platformGovernanceStore.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.invoke.test.ts`
- `apps/nexus/server/utils/telemetryStore.ts`
- `apps/nexus/server/utils/imageStorage.ts`
- `apps/nexus/server/utils/imageStorage.test.ts`
- `apps/nexus/server/utils/pluginPackageStorage.ts`
- `apps/nexus/server/utils/releaseAssetStorage.ts`
- `apps/nexus/server/utils/storageChannelCatalog.ts`
- `apps/nexus/server/utils/storageObjectStore.ts`
- `apps/nexus/server/utils/storageCredentialStore.ts`
- `apps/nexus/server/utils/uploadGovernance.ts`
- `apps/nexus/server/utils/pluginsStore.ts`
- `apps/nexus/server/api/dashboard/governance/*`
- `apps/nexus/server/api/dashboard/plugins/[id]/analytics.get.ts`
- `apps/nexus/server/api/images/upload.post.ts`
- `apps/nexus/server/api/plugins/assets/[key].get.ts`
- `apps/nexus/server/api/releases/[tag]/assets.post.ts`
- `apps/nexus/server/api/releases/[tag]/download/[platform]/[arch].get.ts`
- `apps/nexus/server/api/releases/[tag]/signature/[platform]/[arch].get.ts`
- `apps/nexus/server/api/dashboard/{storage/policies,notifications/channels}.*.ts`
- `apps/nexus/server/api/dashboard/storage/credentials.*.ts`
- `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/quota.*.ts`
- `apps/nexus/server/utils/notificationDispatcher.ts`
- `apps/nexus/server/utils/browserNotificationInboxStore.ts`
- `apps/nexus/server/utils/browserPushSubscriptionStore.ts`
- `apps/nexus/server/utils/notificationCredentialStore.ts`
- `apps/nexus/server/api/dashboard/notifications/channels/test.post.ts`
- `apps/nexus/server/api/dashboard/notifications/credentials.*.ts`
- `apps/nexus/server/api/dashboard/notifications/inbox/*`
- `apps/nexus/server/api/dashboard/notifications/push-subscriptions/*`
- `apps/nexus/public/notification-sw.js`
- `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
- `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
- `apps/nexus/app/pages/dashboard/admin/governance.vue`
- `apps/nexus/app/pages/dashboard/assets.vue`
- `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts`
- `apps/nexus/app/types/dashboard-plugin.ts`
- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/app/utils/provider-registry-admin.test.ts`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/test/api/dashboard/provider-registry/provider-registry.api.test.ts`
- `apps/nexus/test/api/dashboard/storage/credentials.api.test.ts`
- `apps/nexus/test/helpers/provider-registry-test-utils.ts`
  - Added `/api/dashboard/governance/analytics` for anonymized cockpit aggregates across visits, searches, plugin downloads/invocations, upload health, storage/notification events, and provider request/token usage.
  - Search governance analytics now includes sanitized trend/heatmap, filter usage, provider latency/results/status, result categories, geo/timezone, first-result latency, total duration, and result-count stats without storing raw query text.
  - Plugin governance analytics now enriches global hot leaderboard entries with `hotScore`, current-vs-previous growth, action quantity mix, and region/channel breakdowns, and exposes per-plugin downloads, invocations, unique actors, trend, heatmap, geo/channel/action/version/artifact/package-size breakdowns.
  - Upload governance analytics now records sanitized `started` / `completed` / `failed` lifecycle events with attemptId, duration, statusCode, storage channel/provider, stable plugin/version governance resource ids, and extension-only file metadata for resource, image, plugin icon manual/package-extracted assets, release asset, release signature, and plugin package publish/re-edit uploads; `started` events contribute to lifecycle volume but are excluded from terminal failure-rate and upload-size breakdowns.
  - Upload lifecycle governance writes are now best-effort with timeout protection, so a slow or stuck governance/D1 write cannot block the real upload path while normal started/completed/failed telemetry remains recorded.
  - Plugin package storage now writes storage governance usage for package upload, download, and delete operations under stable `plugin:{id}:version:{channel}:{version}` resource ids, so storage policy evaluation covers plugin package traffic without grouping analytics by random `.tpex` object keys.
  - Storage channel policies now enforce operation-time limits scoped by channel, provider, and `targetId` resource type: `maxBytes` blocks writes, `trafficBytes` blocks reads, and operation limits block writes, reads, and deletes before storage side effects.
  - Storage policy configuration now uses a shared local/R2/S3/OSS channel catalog, validates supported channel/provider pairs, required config fields, secure `secure://storage/*` credential references, and supported limit keys before saving governance configs; the Data Governance form exposes the catalog, default limits/config, and encrypted storage credential binding for local/R2/S3/OSS profiles.
  - Image/resource uploads, release assets, and plugin packages now share one object storage executor for memory/R2/S3-compatible/OSS put/get/delete/list, policy enforcement, storage channel resolution, and governance usage recording; S3/OSS credentials are resolved through the encrypted `secure://storage/*` store, and release asset/signature plus plugin package storage usage separates real object keys from sanitized governance resource ids so raw uploaded file names and random package keys are not used for analytics grouping.
  - Plugin icon manual uploads and package-extracted icons now feed upload lifecycle started/completed/failed events under stable `plugin:{id}:icon` governance resource ids without storing raw actor ids or raw upload filenames.
  - Nexus now has a shared governance event/config layer for hashed analytics events, plugin download/invoke metrics, upload success/failure health, storage channel policies, notification channel policies, and Intelligence provider quota policies.
  - Plugin downloads, plugin invocation telemetry, search/visit telemetry, resource uploads, plugin package upload lifecycle events, image/release-asset/plugin-package storage usage, plugin review status changes, and provider scene execution now feed the governance layer without storing raw actor identifiers, raw search queries, raw package filenames, or plaintext secrets.
  - Dashboard admins can open Data Governance to inspect the analytics cockpit, storage policy health evaluation, and configure analytics, storage, notification, and provider quota policies; plugin owners/admins can query per-plugin analytics.
  - Dashboard assets plugin details now load owner/admin-only private analytics and show downloads, installs, invocations, active users, latest/peak trend days, geo/channel/version/action/artifact breakdowns, and package-size summary in the plugin detail drawer.
  - Storage channel policy evaluation now reports stored bytes, traffic bytes, operation counts, utilization, and `ok` / `warning` / `blocked` status for configured storage channels, with `targetId` resource-type filtering aligned with operation enforcement.
  - Data Governance storage analytics now aggregates stored bytes, traffic bytes, operations, writes, reads, deletes, unique actors, action mix, channel/provider/resource breakdowns, and daily storage usage trend without exposing raw object keys or actor ids.
  - `/api/dashboard/storage/policies` now returns a reusable storage alert queue derived from policy evaluations, and Data Governance surfaces blocked/warning storage, traffic, and operation limits with usage, configured limit, utilization, and sanitized reasons.
  - Added `/api/dashboard/storage/alerts/notify` and Data Governance controls so admins can dry-run or send current storage alerts through configured notification channels while recording only sanitized policy/channel/metric metadata.
  - Plugin version moderation now plans notification delivery for configured browser/email/Feishu/Lark/webhook channels and records `planned` / `sent` / `skipped` / `failed` delivery audit events without persisting raw recipients/secrets.
  - Notification channel configs now separate the provider instance name from the adapter type: `provider` can identify entries such as `resend-primary` or `smtp-ops`, while `config.providerType` / `config.adapter` selects `resend`, `smtp`, `feishu`, `lark`, `browser`, or `webhook`.
  - Notification credentials now use a dedicated `secure://notifications/*` D1 encrypted store and Dashboard binding API; notification delivery planning marks credentialed channels as `credential-missing` when the referenced secure credential is absent.
  - Notification delivery remains plan-only by default; explicit `config.mode: "send"` can perform HTTP sending for Resend, SMTP relay, webhook, Feishu, Lark, and Web Push relay adapters when secure credentials exist and recipients or registered push subscriptions are supplied at dispatch time, while browser adapter now writes durable per-user inbox notifications without storing raw recipients or credential refs. Direct SMTP socket delivery, production VAPID/relay evidence, and cross-browser visible evidence remain follow-ups.
  - Added `/api/dashboard/notifications/channels/test` so admins can dry-run a single saved notification channel, or allow send execution according to the channel's existing `config.mode`, while recording only sanitized delivery audit metadata for the selected `configId`.
  - Data Governance now exposes a notification channel test panel with saved-channel selection, action/resource/metadata inputs, dry-run and send buttons, and delivery status/reason/provider/adapter/credentialRef feedback for the selected channel.
  - Data Governance notification analytics now aggregates per-provider delivery health with planned/sent/skipped/failed counts, sent and failure rates, and latest sanitized failure reason without exposing recipients or credential refs.
  - Added `/dashboard/notifications`, `/api/dashboard/notifications/inbox`, and `/api/dashboard/notifications/inbox/read` so signed-in users can open the notification center, manage browser Notification permission, send a local browser test notification, list unread counts, and mark selected or all notifications as read.
  - Added `/api/dashboard/notifications/push-subscriptions`, notification-center Web Push register/remove controls, and a minimal service worker so signed-in users can persist HTTPS push subscriptions without exposing endpoints or `p256dh`/`auth` keys through public API summaries or governance audit.
  - Data Governance now surfaces notification delivery health with planned/sent/skipped/failed counts, sentRate, provider instance, adapter, notification action, delivery reason breakdowns, and browser push subscription register/delete analytics by sanitized endpoint host.
  - User signup governance now records hashed signup events with source/geo/timezone metadata and the Data Governance cockpit surfaces signup growth/trend without storing raw emails.
  - Plugin download handling now emits a separate install governance event, so global and per-plugin analytics can distinguish download volume from install trend while preserving geo/channel/version/artifact/package-size breakdowns.
  - Provider usage governance now carries safe model and provider-type metadata from Scene execution and Nexus Intelligence invokes; the cockpit surfaces token distribution by model/provider type and per-provider top models without recording prompts, inputs, or outputs.
  - Data Governance provider analytics now joins saved `intelligence_provider_quota` configs with provider request/token usage and surfaces request/token utilization plus `ok` / `warning` / `blocked` quota status in the provider cockpit.
  - Direct `/api/v1/intelligence/invoke` / Lab model calls now enforce `intelligence_provider_quota` before model dispatch and record `provider.request`, provider usage ledger, and governance usage with the stable Provider Registry governance id (`metadata.providerRegistryId ?? provider.id`) while keeping the public result provider id compatible.
  - Provider Registry Admin provider cards now show per-provider quota status plus request/token/window summaries and expose an inline quota editor backed by the existing provider quota GET/POST API, so admins can configure provider-scoped limits without manually entering provider ids in the generic Data Governance form.
  - Provider Registry API tests now cover provider-id scoped quota create/update behavior, and the Mock D1 helper supports `platform_governance_configs` rows used by the quota endpoint.
  - Validation: focused `platformGovernanceStore.test.ts`, `imageStorage.test.ts`, `uploadGovernance.test.ts`, `storageObjectStore.test.ts`, `storageChannelCatalog.test.ts`, `telemetryStore.test.ts`, `notificationDispatcher.test.ts`, `notifications/inbox.api.test.ts`, `notifications/channels-test.api.test.ts`, `notifications.test.ts`, `governance.test.ts`, `credentials.api.test.ts`, `storage/credentials.api.test.ts`, `intelligenceVisionOcrProvider.test.ts`, `tuffIntelligenceLabService.invoke.test.ts`, `provider-registry-admin.test.ts`, and `provider-registry.api.test.ts` Vitest passed; affected-file ESLint and `git diff --check` also passed, including plugin package upload lifecycle, plugin icon asset lifecycle, stuck governance-write timeout protection, stable governance-id storage grouping, S3-compatible/OSS executor routing, encrypted storage credential binding, browser notification inbox delivery, user signup analytics, plugin install trend, provider model/provider-type distribution cases, direct Intelligence invoke quota enforcement, Provider Registry quota UI/API coverage, notification channel test API/UI coverage, and the Dashboard plugin detail analytics UI slice.

### feat(sdk): expose native share helpers from MetaK quick actions

- `packages/utils/plugin/sdk/quick-actions-sdk.ts`
- `packages/utils/plugin/sdk/meta-sdk.ts`
- `packages/utils/plugin/sdk/meta/README.md`
- `docs/plan-prd/03-features/meta-overlay/META-OVERLAY-PRD.md`
- `docs/plan-prd/02-architecture/platform-capabilities-prd.md`
  - MetaK / QuickActions SDK now exposes native share helpers for plugins: native target discovery, item-to-share payload building, and FlowBus-backed native share execution.
  - Deprecated `MetaSDK` remains a compatibility alias while forwarding the same SDK options and native share surface.
  - Platform docs now spell out macOS AirDrop / Mail / Messages support and Windows/Linux mail-only fallback semantics.
  - Follow-up: QuickActions SDK now resolves native share targets by configurable preference order and exposes `shareItem()` so MetaK actions can use AirDrop-first sharing without duplicating fallback logic.
  - Validation: focused SDK lifecycle tests and file-scoped ESLint cover the new FlowBus event mapping and item payload builder.

### feat(core-app): expand smart context settings and update package diagnostics

- `packages/utils/core-box/recommendation.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/{context-provider,recommendation-engine}.ts`
- `apps/core-app/src/renderer/src/views/base/settings/{SettingTools,SettingFileIndex,SettingUpdate}.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - 智能推荐默认纳入时间、前台应用、剪贴板、网络、蓝牙、专注状态、电源/电量与粗粒度位置桶，并在高级设置中暴露上下文源开关。
  - 推荐排序新增本地语义向量增强，默认启用本地打分；本地向量同时融合当前上下文、历史使用偏好与重复取消负反馈，只沉淀类别/任务语义，避免把单个应用 ID 直接放大；AI rerank 与 AI embedding 作为显式 opt-in 开关，失败或超时保持 fail-open，不阻断推荐结果。
  - 本地启动区 / 应用索引管理从设置页内联长列表改为按钮打开的弹窗，诊断入口继续保留在设置页。
  - 本地启动区管理弹窗补齐明确可用高度与弹性内容区，列表区域占满剩余高度并独立滚动，避免弹窗内容被压扁。
  - 更新下载包弹窗改为展示当前 release 的全部下载包；当前设备无匹配包时明确提示，并为每个包标注平台/架构/链接/校验信息状态。
  - 验证：focused recommendation/context/semantic Vitest 覆盖上下文开关、系统信号失败降级、cache key 隐私边界、本地语义排序、历史偏好向量、重复取消负反馈向量、语义关闭回退、AI embedding/rerank 成功排序与失败 fail-open、隐私安全 profile；affected-file ESLint、node typecheck 和 `git diff --check` passed。

### feat(core-app): wire Assistant clipboard image translate action

- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/assistant/module.contract.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.test.ts`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `packages/utils/transport/events/assistant.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
- `apps/core-app/src/main/modules/platform/coreapp-visible-experience-evidence.ts`
- `apps/core-app/src/main/modules/platform/coreapp-visible-experience-evidence.test.ts`
  - Assistant VoicePanel now exposes a clipboard image translation action next to text handoff.
  - The action now uses the canonical typed `assistant:voice-panel:translate-clipboard-image` wire event while keeping legacy `assistant:voice-panel:translate-screenshot` as a compatibility alias; the runtime reads the current clipboard image instead of initiating native screen capture.
  - Translated clipboard images open in the existing image translation pin window instead of introducing a second result surface.
  - CoreApp visible experience evidence now tracks Assistant floating ball entry and Assistant clipboard image translation as required visual surfaces, including drag persistence, VoicePanel opening, empty clipboard image recovery, and provider fallback evidence.
  - Assistant floating ball and VoicePanel window creation now use single-flight pending guards, so concurrent settings snapshots or click handoffs reuse the in-flight renderer load instead of spawning duplicate floating windows.
  - Clipboard image translation now suppresses VoicePanel blur auto-hide while the existing image translation flow opens the pin window, with a counted delayed resume so provider fallback recovery does not close the panel unexpectedly.
  - VoicePanel opening from the floating ball now also holds the same blur auto-hide suppression until bounds, show/focus, and typed `panelOpened` handoff complete, avoiding an immediate hide race while the panel is being positioned.
  - Validation: focused Assistant contract, CoreBox image translate helper, transport event, and visible experience evidence tests cover the new typed event, scene reuse path, duplicate-window guard, and manual evidence gate; packaged Electron permission and provider fallback artifacts remain follow-up.

### feat(core-app): make style personalization wallpaper controls usable

- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/base/{router,style-routes}.ts`
- `apps/core-app/src/renderer/src/views/base/styles/{SectionItem,WindowSection}.vue`
- `apps/core-app/src/renderer/src/views/base/styles/sub/{ThemePreference,theme-preference-state}.ts`
- `apps/core-app/src/renderer/src/modules/layout/{useWallpaper,wallpaper-state}.ts`
- `apps/core-app/src/main/channel/common.ts`
- `packages/utils/common/wallpaper.ts`
- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Style personalization now exposes homepage wallpaper controls without the dev-only advanced gate.
  - Added first-class `auto` wallpaper source as the default: it silently tries the desktop wallpaper first and falls back to Bing wallpaper.
  - Custom and folder wallpaper paths now share normalized state handling, with local library path preference when copied.
  - Wallpaper folder scanning and image picking now share one supported-image source of truth and support `.bmp` / `.avif` in addition to the existing formats.
  - Wallpaper adjustment sliders now use TuffEx `TxSlider` instead of raw range inputs.
  - Fixed the window material detail entry to route to `/styles/theme` as a registered `/styles` child route instead of the stale named route.
  - Window preference cards now use a fixed responsive grid, compact 8px card radius, and stopped title-bar click propagation so style card clicks do not fight the parent selector across desktop widths.
  - The window material detail page now acts as a usable selector with active state, recommended material, apply action, and a return path to the full style settings page.
  - Cloud sync remains intentionally hidden from the public style page until the Nexus upload path exists.
  - Validation: focused wallpaper state, wallpaper runtime, section route, material detail state, and shared wallpaper helper tests cover default `auto`, desktop-first loading, Bing fallback, folder empty state, library path preference, registered child route resolution, route generation, material option normalization, and supported image formats.

### test(core-app): cover optional recommendation AI scoring fallback

- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.test.ts`
  - Added focused coverage for optional AI embedding scores and AI rerank scores improving semantic recommendation order.
  - Added fail-open tests for embedding/rerank failures so local recommendation ranking remains available when optional AI scoring is unavailable.
  - Validation: focused recommendation engine Vitest, file-scoped ESLint, and `git diff --check` passed.

### feat(tuffex): add base components and docs coverage

- `packages/tuffex/packages/components/src/{copy-button,divider,kbd,number-input,textarea}`
- `packages/tuffex/packages/components/src/{components,flat-input,status-badge,transfer}*`
- `packages/tuffex/docs/components/*`
- `packages/tuffex/docs/.vitepress/*`
  - Added installable `TxCopyButton`, `TxDivider`, `TxKbd`, `TxNumberInput`, and `TxTextarea` base components with focused tests.
  - Expanded component exports and docs navigation, including docs pages for copy button, divider, kbd, number input, textarea, transfer, flat radio, and flat select.
  - Polished StatusBadge platform icons, responsive Transfer layout, docs logo, and per-component examples for existing TuffEx docs.
  - Validation: focused TuffEx component Vitest, affected-file ESLint, `pnpm -C "packages/tuffex" docs:build`, and `git diff --check` passed; docs build still reports the existing large-chunk warning.

### fix(tuffex): stabilize docs runtime and component interactions

- `packages/tuffex/packages/components/src/{input,chat,scroll,stagger,stat-card,tabs}`
- `packages/tuffex/docs/components/*`
- `packages/tuffex/docs/quality/component-audit-2026-05-21.md`
- `packages/tuffex/scripts/audit-{cdp-client,docs-inventory,docs-coverage,docs-pages,docs-interactions}.mjs`
- `packages/tuffex/CHANGELOG.md`
  - Fixed TuffEx docs hydration stability for ChatMessage, Scroll, and Stagger demos, including stable chat timestamps and client-ready rendering gates.
  - Fixed Input flex shrink behavior, StatCard stable visible value/insight rendering, and Tabs active content synchronization after nav clicks.
  - Fixed the GlassSurface basic docs demo by moving it to an isolated Vue demo, preventing rendered preview leakage of Markdown / HTML source text.
  - Fixed the Input affix-slot docs demo by moving it to an isolated Vue demo, preventing raw slot markup from widening the mobile docs page.
  - Completed source/export/docs/sidebar/index reconciliation and added missing component links for Alert, Badge, Breadcrumb, Card, Collapse, FlipOverlay, Modal, Pagination, Radio, Rating, SegmentedSlider, Steps, TextTransformer, and Timeline.
  - Added a package-local component audit report, generated coverage/page matrices, and reusable Chrome CDP inventory/coverage/page/theme/interaction smoke scripts; current browser evidence is inventory reconciliation `PASS`, focused coverage `12/12 PASS`, desktop static `111/111 PASS`, mobile focused `37/37 PASS`, light/dark theme `222/222 PASS`, and interaction smoke `26/26 PASS`.
  - Validation: TuffEx Vitest, lint, docs build, package build, `git diff --check`, inventory reconciliation, desktop docs screenshot audit, mobile focused screenshot audit, light/dark theme screenshot audit, and interaction smoke checks passed.

## 2026-05-20

### feat(core-app): enable Assistant floating ball settings entry

- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/main/modules/assistant/module.contract.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAssistant.vue`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Assistant is now loaded as a normal CoreApp module instead of being gated by `TUFF_ENABLE_ASSISTANT_EXPERIMENT`.
  - The floating ball remains default-off through app settings, with a visible settings entry for enabling Assistant, showing the floating ball, naming the assistant, and controlling voice wake separately.
  - VoicePanel now respects disabled voice wake by opening in text-only mode without automatically invoking Web Speech or requesting microphone access.
  - Validation: focused Assistant module contract test, file-scoped ESLint, locale JSON parse, and CoreApp node/web typecheck passed; web typecheck still prints existing TuffEx docs dts noise.

### fix(core-app): route MetaOverlay actions through renderer action pipeline

- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.test.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.test.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.test.ts`
  - MetaOverlay built-in and item actions now bridge through `CoreBoxEvents.metaOverlay.itemAction` / retained legacy alias so the renderer action pipeline owns clipboard, reveal, pin, flow-transfer, and item fallback behavior.
  - Plugin actions still use plugin `metaOverlay.actionExecuted` canonical + legacy notification channels.
  - CoreBox stale-session auto-clear now hides MetaOverlay as part of visibility reset.
  - Validation: focused CoreBox main/renderer hook tests cover MetaOverlay action bridging, copy-title/toggle-pin routing, and autoClear MetaOverlay hide behavior.

### test(nexus): pin retired intelligence endpoints

- `apps/nexus/test/api/admin/intelligence-compat-retired.api.test.ts`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Added focused API contract coverage for current production AI compatibility retirement paths.
  - Existing `intelligence-lab/*` and old `intelligence-agent/orchestrator/*` endpoints now have tests asserting HTTP `410` with migration targets instead of a consumable fake-success payload.
  - Historical `retired-ai-app` `livechat/random` / prompt detail / catch-all references remain archive evidence only and are not restored into the live tree.
  - Validation: `pnpm -C "apps/nexus" exec vitest run "test/api/admin/intelligence-compat-retired.api.test.ts" --reporter dot` passed.

### test(ci): restore targeted Nexus sync route test path

- `package.json`
- `apps/nexus/test/api/sync/sync-routes-410.test.ts`
  - Updated root `pnpm test:targeted` to run the current Nexus sync route test path under `apps/nexus/test/api/sync/` instead of the retired Nitro route-tree `server/api/sync/__tests__/` path.
  - This unblocks the PR Quality path that failed after Nexus API tests were moved out of `server/api`.
  - Validation: `pnpm -C "apps/nexus" exec vitest run "test/api/sync/sync-routes-410.test.ts"` and `pnpm test:targeted` passed.

### fix(core-app): prefer system safeStorage for secure store

- `apps/core-app/src/main/utils/secure-store.ts`
- `apps/core-app/src/main/utils/secure-store.test.ts`
- `packages/utils/transport/events/types/app.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - CoreApp secure-store now prefers Electron `safeStorage` when system encryption is available and keeps `local-secret` as the degraded fallback.
  - Shared transport health types now include `safe-storage`, matching the main-process health response and plugin/app SDK contract.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/main/utils/secure-store.test.ts"` and `pnpm -C "apps/core-app" run typecheck:node` passed.

### fix(core-app): hide CoreBox before app launch handoff

- `packages/utils/transport/events/types/core-box.ts`
- `packages/utils/transport/events/core-box-retained.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/{ipc,manager,window}.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `packages/utils/plugin/sdk/box-sdk.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.test.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.test.ts`
- `packages/utils/__tests__/plugin-box-sdk.test.ts`
  - Added an optional typed CoreBox hide payload with `immediate` / `reason`, while keeping legacy no-payload hide calls compatible.
  - Background App Provider launches now await `CoreBoxEvents.ui.hide` with `{ immediate: true, reason: 'execute' }` before dispatching `CoreBoxEvents.item.execute`, preventing slow OS app handoff from leaving the visible launcher frozen.
  - `WindowManager.hide({ immediate: true })` bypasses the normal delayed hide timer and hides the BrowserWindow synchronously; default hide behavior remains delayed/offscreen for existing flows.
  - Validation: focused CoreBox renderer/manager and plugin Box SDK tests passed; full CoreApp web/node typecheck still reports existing TuffEx TS6307 include-boundary debt unrelated to this change.

### docs(plan): add automation compat audit

- `docs/plan-prd/report/cross-platform-compat-placeholder-automation-audit-2026-05-20.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Added the automation-run audit for the current live tree, confirming no new P0 fixed fake-success while keeping Windows/macOS/Linux real-device evidence as a separate requirement.
  - Reconfirmed the next architecture-hardening order: `touch-snipaste` fail-closed shell diagnostics, `touch-window-presets` non-mutating feature listing, Browser Data source-level diagnostics, widget runtime sandbox evidence, secret backend, raw console cleanup, and SRP small-slice refactors.
  - Recorded that the latest local CoreBox Windows first-show/scrollbar stabilization does not change the compat/fake-success risk assessment.

### fix(plugins): close shell diagnostics and browser data source health

- `plugins/touch-snipaste/index.js`
- `plugins/touch-snipaste/index.test.cjs`
- `plugins/touch-window-presets/index.js`
- `packages/test/src/plugins/window-presets.test.ts`
- `plugins/touch-browser-data/index.js`
- `plugins/touch-browser-data/index.test.cjs`
- `docs/plan-prd/04-implementation/WidgetSandboxIsolation260221.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `touch-snipaste` now gates execution on `system.shell`, exposes CoreBox capability metadata, blocks invalid newline/null args, and returns `started` / `blocked` / `failed` instead of silently attempting spawn.
  - `touch-window-presets` now lists presets with a non-mutating permission check and only requests `system.shell` when executing a preset.
  - `touch-browser-data` now reports source-level diagnostics, preserves read-failed reason/profile count, and avoids implying Arc support on Linux.
  - Widget sandbox documentation now records the current `new Function` runtime boundary, allowed globals, blocked APIs, storage facade requirements, runtime source cache constraints, and failure reason policy.

## 2026-05-19

### docs(plan): add compat placeholder incremental audit

- `docs/plan-prd/report/cross-platform-compat-placeholder-incremental-audit-2026-05-19.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Added a live-tree incremental audit for `2.4.11-beta.2`, confirming no new P0 fixed fake-success after the 2026-05-16 deep audit.
  - Updated the current quality口径 to prioritize `touch-snipaste` shell capability fail-closed diagnostics, `touch-window-presets` non-mutating permission checks, Browser Data source-level diagnostics, widget runtime sandbox evidence, and SRP small-slice refactors.
  - Recorded that `touch-browser-data` scans real Chromium Bookmarks JSON rather than returning fake data, while Linux Arc wording, source health, clear/rebuild/disable, and cross-platform evidence remain follow-ups.

### feat(plugins): translate clipboard images through DivisionBox

- `packages/tuff-intelligence/src/types/intelligence.ts`
- `packages/utils/types/intelligence.ts`
- `apps/core-app/src/main/modules/ai/intelligence-{config,module,sdk}.ts`
- `apps/core-app/src/main/modules/ai/runtime/base-provider.ts`
- `apps/core-app/src/main/modules/ai/providers/nexus-provider.ts`
- `apps/core-app/src/main/modules/division-box/{layout,session}.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `packages/utils/plugin/sdk/division-box.ts`
- `packages/utils/__tests__/plugin-sdk-lifecycle.test.ts`
- `plugins/touch-translation/{manifest.json,index.js,index/main.ts,index/utils.ts}`
- `plugins/touch-translation/widgets/{screenshot-translate.vue,image-translate-result.vue}`
- `docs/plan-prd/TODO.md`
  - Added `image.translate.e2e` to the shared Intelligence capability contract and wired the Tuff Nexus provider to run `corebox.screenshot.translate`, so Translation can reuse Nexus image-translation providers such as Tencent adapt instead of owning provider-specific logic.
  - `touch-translation` now detects clipboard image data URLs on `screenshot-translate`, calls the Intelligence capability, and presents the translated image in a detached DivisionBox widget with CoreBox fallback when the window path is unavailable.
  - Fixed the DivisionBox open failure path for plugin calls by declaring `window.create` in the Translation manifest, accepting direct `SessionInfo` SDK responses, and checking the returned `sessionId` before state updates.
  - DivisionBox now honors `header.show=false` and `ui.showInput=false` across main-process WebContentsView bounds and CoreBox renderer layout, allowing tool windows without the launcher header/input chrome.
  - Added focused coverage for image data URL helpers, Nexus scene invocation, DivisionBox header height resolution, and direct `SessionInfo` SDK open responses; packaged Electron/manual clipboard-image evidence remains a follow-up.

### feat(plugins): add snippets uuid placeholder

- `plugins/touch-snippets/index.js`
- `plugins/touch-snippets/index.test.cjs`
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/TODO.md`
  - Extended `touch-snippets` placeholder resolution with `{{uuid}}` using Node `randomUUID()`, keeping `{{date}}`, `{{time}}`, and `{{clipboard}}` behavior unchanged.
  - Added deterministic focused coverage so repeated `{{uuid}}` placeholders inside one snippet resolve to the same generated value.
  - Updated the Raycast/uTools gap matrix and TODO status to mark the first placeholder batch as landed while leaving browser-tab, cursor, hot string/autopaste, and cross-device evidence as follow-ups.

### feat(plugins): add emoji and symbol picker plugin

- `plugins/touch-emoji-symbols/manifest.json`
- `plugins/touch-emoji-symbols/index.js`
- `plugins/touch-emoji-symbols/index.test.cjs`
- `plugins/touch-emoji-symbols/package.json`
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/TODO.md`
  - Added a dedicated `touch-emoji-symbols` Prelude plugin with built-in common emoji, arrows, punctuation, currency, and math symbols.
  - The plugin supports `emoji`, `symbol`, `symbols`, `表情`, `符号`, and `特殊字符` command prefixes, CoreBox search, and clipboard copy actions.
  - Added focused Node tests for prefix parsing, English/Chinese keyword matching, copy-item construction, and empty state; recent usage, larger datasets, grouping, Store metadata, and install evidence remain follow-ups.

### docs(tuffex): improve CommandPalette launcher demo

- `apps/nexus/app/components/content/demos/CommandPaletteCommandPaletteDemo.vue`
- `apps/nexus/content/docs/dev/components/command-palette.{zh,en}.mdc`
- `packages/tuffex/docs/components/command-palette.md`
- `docs/plan-prd/TODO.md`
  - Reworked the CommandPalette demo from a minimal button/list example into a Raycast/uTools-style launcher scenario with command icons, keyboard hints, keyword-backed filtering, disabled command state, empty text, and last-action feedback.
  - Updated the bilingual Nexus component docs to describe launcher usage, UX notes, keyword behavior, disabled states, and the `closeOnSelect=false` workflow option.
  - Synced the package-level TuffEx component doc so local package docs and Nexus docs show the same component behavior.

### docs(nexus): refresh plugin SDK workflow

- `apps/nexus/content/docs/dev/getting-started/plugin-workflow.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/getting-started/quickstart.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/reference/manifest.{zh,en}.mdc`
- `apps/nexus/content/docs/dev/release/publish.{zh,en}.md`
- `apps/nexus/content/docs/dev/index.{zh,en}.mdc`
- `apps/nexus/app/data/tuffSdkItems.ts`
- `apps/nexus/app/data/search/featureIndex.ts`
- `docs/plan-prd/TODO.md`
  - Added a bilingual plugin development workflow that connects Manifest, `index.js` Prelude, SDK selection, validation, build, publish preflight, and plugin package vs CloudShare content package boundaries.
  - Updated quickstart and manifest docs away from the legacy `entry` / `init(ctx)` model toward `main: "index.js"` and `module.exports = { onFeatureTriggered, onItemAction }`.
  - Updated publish docs to use `tuff validate --strict`, `tuff build`, `tuff publish --dry-run`, publisher auth preflight, and API key scope guidance instead of older generic package commands.
  - Added Nexus Developer Hub, Getting Started, Reference, Release, landing SDK card, and search index entries for the workflow.

### feat(core-app): add explicit calculator preview prefixes

- `apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.test.ts`
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/TODO.md`
  - CoreBox preview now treats `calc`, `calculator`, `calculate`, `计算`, and `换算` prefixes as explicit calculator commands and strips the prefix before resolving through PreviewSDK.
  - Explicit calculator results keep the original query for search history while passing the resolved expression/unit query to PreviewSDK, avoiding a duplicate calculator implementation in plugins.
  - The Raycast/uTools gap matrix now marks the explicit calculator entry as landed; Store discoverability and richer history management remain follow-up work.

### docs: add Raycast/uTools capability gap matrix

- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
  - Added a competitor capability baseline for Raycast/uTools-style desktop productivity workflows, grounded in current plugin manifests, PreviewSDK abilities, App Data roadmap, Nexus SDK navigation, and TuffEx component docs.
  - Prioritized Calculator explicit entry, Browser Data, Everything real-device evidence, App Launcher evidence, Snippets placeholders, Emoji/Symbol picker, Quicklinks unification, Context Actions, SDK task-flow docs, and TuffEx scenario demos.
  - Kept the matrix as a P1 execution input and did not change the `2.4.11` P0 stabilization line.

### feat(core-app): allow manual Everything CLI path

- `apps/core-app/src/shared/events/everything.ts`
- `apps/core-app/src/main/modules/storage/main-storage-registry.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`
- `apps/core-app/src/renderer/src/views/base/settings/everything-diagnostic-evidence.ts`
- `apps/core-app/src/main/modules/platform/everything-diagnostic-verifier.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `docs/everything-integration.md`
  - Settings Everything now lets users select or clear a custom Everything CLI (`es.exe`) path through typed transport.
  - The provider persists `cliPath`, validates selected binaries with `es.exe -v` before saving, and probes the configured path before PATH/default install directories.
  - Everything status and diagnostic evidence now include `configuredCliPath` alongside the active `esPath`, keeping Windows regression evidence explicit about user configuration.
  - Everything SDK/CLI results now fail closed through File Index watch-root filtering before reaching CoreBox; diagnostic evidence records only path-filtering counts/reason, not watched root paths.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/everything-provider.test.ts" "src/renderer/src/views/base/settings/setting-everything-state.test.ts" "src/renderer/src/views/base/settings/everything-diagnostic-evidence.test.ts" "src/main/modules/platform/everything-diagnostic-verifier.test.ts" "src/main/modules/native-capabilities/index.test.ts" --reporter dot` passed.

### feat(core-app): manage scanned App Index entries

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-index-metadata.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider-diagnostics.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`
- `packages/utils/transport/events/types/app-index.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppIndexManager.vue`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-manager-display.ts`
  - App Index manager now lists scanned apps alongside manually added launch entries, including source, removability, bundleId, and identity kind metadata.
  - Scanned app entries can be enabled or disabled through the existing typed settings SDK; disabled scanned apps are removed from the search index and filtered out of recommendation/search mapping.
  - Single-app diagnostics, metadata update paths, mdls update repair, and managed-entry reindex now route through the same enabled-state check instead of directly rebuilding keywords.
  - Scanned entries remain non-removable in the manager; deletion is still limited to manually added entries.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/app-provider.test.ts" "src/main/modules/box-tool/addon/apps/search-processing-service.test.ts" "src/renderer/src/views/base/settings/app-index-manager-display.test.ts" --reporter dot` passed.

### feat(core-app): install CloudShare snippet packs from Store details

- `packages/utils/cloud-share/snippet-pack.ts`
- `packages/utils/cloud-share/index.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/plugin.ts`
- `packages/utils/transport/sdk/domains/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin-content-installer.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/renderer/src/composables/store/usePluginContentPackages.ts`
- `apps/core-app/src/renderer/src/composables/store/plugin-content-error-utils.ts`
- `apps/core-app/src/renderer/src/views/base/store/StoreDetailOverlay.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
- `packages/utils/__tests__/cloud-share-snippet-pack.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-content-installer.test.ts`
- `apps/core-app/src/renderer/src/composables/store/usePluginContentPackages.test.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md`
  - CoreApp Store plugin detail now renders a Content section backed by public Nexus `/api/store/plugin-content?pluginId=...&limit=20`, showing title, summary, kind, format, install count, and update time.
  - Added `plugin-content:install` transport flow and a main-process installer that only writes to an already-installed `touch-snippets` plugin, only accepts `manifest.importTarget === "touch-snippets"` and `format === "tuff.snippet-pack+json"`, and writes through the existing plugin storage boundary.
  - Extracted shared snippet pack normalization/import helpers under `packages/utils/cloud-share` so CoreApp install uses the same merge and sensitive-filter semantics as `touch-snippets`.
  - Installation count is synced through the public CloudShare install API after local import succeeds; unsupported target/format, missing target plugin, network sync, and storage write failures return explicit error codes.
  - Validation: `pnpm -C "packages/utils" exec vitest run "__tests__/cloud-share-sdk.test.ts" "__tests__/cloud-share-snippet-pack.test.ts"` passed; `pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/plugin-content-installer.test.ts" "src/renderer/src/composables/store/usePluginContentPackages.test.ts" "src/renderer/src/composables/store/store-rating-error-utils.test.ts"` passed.

### fix(core-app): stabilize Windows CoreBox first-show and result list layout

- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
  - Added a short blur-hide suppression window during CoreBox show on Windows-path runtime to prevent first-show focus/blur races from immediately auto-hiding the window.
  - Hardened blur auto-hide guard to respect suppression both before and after the async UI focus handoff check.
  - Forced stable vertical scrollbar reservation for CoreBox result area (`overflow-y: scroll` + `scrollbar-gutter: stable both-edges`) to remove horizontal layout jitter when search results change.

## 2026-05-19

### feat(plugin): standardize src/prelude engineering

- `packages/unplugin-export-plugin/src/core/prelude.ts`
- `packages/unplugin-export-plugin/src/index.ts`
- `packages/unplugin-export-plugin/src/core/exporter.ts`
- `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
- `packages/unplugin-export-plugin/README.md`
- `packages/unplugin-export-plugin/docs/index-folder-indexjs.md`
  - 新插件 Prelude 标准源码目录切到 `src/prelude/`，最终运行时与 `.tpex` 产物仍只暴露单个 `index.js`。
  - DevKit dev 态会将 `src/prelude` 增量打包成虚拟 `index.js`，并通过 `/_tuff_devkit/update` 暴露 `index.js` 变化状态。
  - CoreApp DevServerHealthMonitor 监控到 `index.js.changed` 后自动 reload 对应 dev 插件生命周期，形成 HMR 体感而不引入函数级热替换 runtime。
  - `tuff builder` 构建态会将 `src/prelude` 落盘到 `dist/build/index.js`；第三方依赖默认 bundle，`electron` 与 Node 内置模块保持 external。
  - 旧根 `index.js`、`manifest.build.index` 与 `index/` 目录继续兼容。

## 2026-05-18

### feat(intelligence): expose local skills gate summary

- `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `apps/core-app/src/main/modules/ai/intelligence-local-environment.ts`
- `apps/core-app/src/renderer/src/components/intelligence/IntelligenceLocalSkills.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - Local AI environment scan now returns a read-only `gate` summary for each Codex skill provider: ready core skills, approval-required high-risk/external skills, and unavailable not-installed skills.
  - Gate summaries expose deterministic scene hint ids without claiming scene registration or execution readiness, keeping execution policy out of this slice.
  - Intelligence settings now shows permission gate counts and per-skill gate labels using localized copy.

### fix(nexus): reactivate CLI devices during browser auth

- `.github/workflows/package-tuff-cli-publish.yml`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/utils/__tests__/authStore-device-reactivation.test.ts`
- `packages/tuff-cli/package.json`
- `packages/tuff-cli/src/bin/tuff.ts`
- `packages/tuff-cli-core/src/publish.ts`
  - Browser OAuth device re-login now reactivates previously revoked device rows and rotates `token_version`, preventing Nexus from issuing an App JWT that is immediately rejected because the device remains revoked.
  - CLI account/login/publish auth probes now send saved device headers with App JWT requests so Nexus can resolve the CLI device consistently.
  - Prepared `@talex-touch/tuff-cli@0.0.6` for npm publish.
  - CLI publish workflow now also triggers on CLI/build-tool source changes, allowing a failed version publish to be retried after source-only fixes.
  - CLI publish workflow now treats Nexus update-news sync failures as warnings after npm publish succeeds; the `NEXUS_API_KEY` still needs `release:news` scope and admin ownership for announcement sync.

### fix(nexus): harden CLI app auth and plugin package integrity

- `apps/nexus/server/utils/auth.ts`
- `apps/nexus/types/cloudflare-env.d.ts`
- `apps/nexus/server/utils/tpex.ts`
- `apps/nexus/server/utils/pluginsStore.ts`
- `apps/nexus/server/api/store/plugins/[slug]/versions.get.ts`
- `packages/tuff-cli/package.json`
- `packages/tuff-cli/src/bin/tuff.ts`
- `packages/tuff-cli/src/cli/i18n/locales/zh.ts`
- `packages/tuff-cli/src/cli/i18n/locales/en.ts`
- `packages/tuff-cli-core/src/security-util.ts`
- `packages/tuff-cli-core/src/__tests__/security-util.test.ts`
- `packages/unplugin-export-plugin/src/core/security-util.ts`
- `packages/utils/plugin/providers/tpex-provider.ts`
- `apps/nexus/README.md`
- `apps/nexus/SETUP.md`
- `plugins/touch-intelligence/package.json`
- `plugins/touch-intelligence/manifest.json`
  - Nexus App JWT signing and verification now resolve the same stable secret chain: runtime config, Cloudflare bindings, then process env; production no longer falls back to an ephemeral per-isolate secret when `APP_AUTH_JWT_SECRET` / `AUTH_SECRET` is missing.
  - CLI browser/manual token login now immediately validates the saved token against Nexus and clears it when Nexus rejects the newly issued token, avoiding a misleading “login succeeded” state before publish; `tuff_` API keys use the publisher preflight endpoint so plugin publish tokens are not misclassified by `/api/auth/me`.
  - Nexus plugin publish/re-edit now verifies the `.tpex` internal manifest `_files` SHA-256 map and `_signature` against archive contents before accepting uploads, keeping publish-side integrity checks aligned with CLI package generation and CoreApp outer package SHA-256 install verification.
  - CLI package generators now normalize manifest `_files` keys to POSIX paths; Nexus verification remains compatible with legacy Windows-built packages whose manifest keys used backslashes.
  - Store plugin detail/list/version APIs now expose package signature metadata consistently, and the shared utils TPEX provider forwards Nexus `signature` metadata like the CoreApp provider so downstream installers can perform the same outer package SHA-256 verification.
  - Deployment docs now state that `APP_AUTH_JWT_SECRET` is required and must stay stable across Cloudflare Pages production/preview deployments.
  - Prepared `@talex-touch/tuff-cli@0.0.5` for npm publish and included the `touch-intelligence` plugin `1.0.2` version bump for the publish retry.

### fix(tuff-cli): declare Vue SFC compiler runtime dependency

- `packages/tuff-cli/package.json`
- `pnpm-lock.yaml`
  - Added `@vue/compiler-sfc` to the published `@talex-touch/tuff-cli@0.0.4` runtime dependency set.
  - Prevents globally installed `tuff`/`tuffcli` from failing with `ERR_MODULE_NOT_FOUND` when the bundled CLI core imports the Vue SFC compiler for widget builds.
  - Local validation: `pnpm -C "packages/tuff-cli" run lint`, `pnpm -C "packages/tuff-cli" run build`, `node "packages/tuff-cli/bin/tuff.js" --version`, and local tarball smoke tests passed.
  - Local npm publish remained blocked by the machine npm credentials/scope permission, but GitHub Actions published `@talex-touch/tuff-cli@0.0.4` successfully with `latest` dist-tag.
  - Public npm install smoke for `@talex-touch/tuff-cli@0.0.4` passed; the GitHub workflow is still marked failed because the post-publish Nexus update-news sync returned `403`.

### docs: add App Data Plugins and Everything roadmap

- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Added a focused roadmap for new official app-data plugins and Windows Everything production hardening.
  - Scoped the plugin line to Browser Data, Obsidian, VSCode, macOS App Data, and Epic clarification, with a shared source health/index diagnostics baseline.
  - Scoped Everything follow-up to SDK-vs-CLI decision, packaging/CLI guidance, path authorization filtering, diagnostic evidence, performance baseline, and Windows real-device regression.
  - Explicitly excluded update-system Nexus Hard-Cut from this roadmap.

### feat(intelligence): expose local skills gate summary

- `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `apps/core-app/src/main/modules/ai/intelligence-local-environment.ts`
- `apps/core-app/src/renderer/src/components/intelligence/IntelligenceLocalSkills.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - Local AI environment scan now returns a read-only `gate` summary for each Codex skill provider: ready core skills, approval-required high-risk/external skills, and unavailable not-installed skills.
  - Gate summaries expose deterministic scene hint ids without claiming scene registration or execution readiness, keeping execution policy out of this slice.
  - Intelligence settings now shows permission gate counts and per-skill gate labels using localized copy.

### docs: move active roadmap to 2.4.11 stabilization

- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/CHANGES.md`
  - Updated active planning docs so `2.4.10` is treated as the current stable baseline.
  - Moved the current 2-week execution window to `2.4.11` stabilization: legacy/compat/size debt, platform regression, secret backend, shell capability diagnostics, PreviewSDK/runtime safety, transport alias hard-cut, and startup benchmark follow-up.
  - Kept `2.5.0` AI work as scoped dev slices that must not displace the `2.4.11` stabilization line; Stable remains text + OCR.

### release: prepare 2.4.10 stable line

- `.github/workflows/package-utils-publish.yml`
- `.github/workflows/package-tuffex-publish.yml`
- `.github/workflows/package-tuff-cli-publish.yml`
- `.github/workflows/package-tuff-intelligence-publish.yml`
- `package.json`
- `apps/core-app/package.json`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Root/CoreApp version has been set to `2.4.10` for the stable release line after explicit approval to backfill a lower stable version from the current `2.4.11-beta.1` working tree.
  - Release notes now record that npm package upload is blocked until npm credentials are refreshed; local package dry-runs passed for the publishable subpackages.
  - Local macOS release build completed with `--publish=never`; generated `apps/core-app/dist/mac-arm64/tuff.app` and `apps/core-app/dist/tuff.app.zip`, both reporting `2.4.10` bundle/app version. The mac builder config currently targets `dir`, with zip produced by post-processing.
  - GitHub Actions `Build and Release` for `v2.4.10` completed successfully on Windows/macOS/Linux, published GitHub Release `Release v2.4.10`, and synced Nexus release metadata successfully. Release assets include Windows setup, macOS app zip, Linux AppImage/deb, update YAML files, builder debug files, and `tuff-release-manifest.json`.
  - Package publish workflows now publish when the current package version is missing from npm even if `package.json` did not change relative to the pushed base; the CLI/build-tool workflow also includes `@talex-touch/tuff-core`.
  - Public npm package publication remains blocked by the repository `NPM_TOKEN`: GitHub package publish runs reached `npm publish` but npm returned `E404 Not Found - PUT https://registry.npmjs.org/@talex-touch%2f...`, which indicates the token cannot publish the `@talex-touch` scope/current packages. Target versions still missing from npm: `@talex-touch/utils@1.0.50`, `@talex-touch/tuffex@0.3.5`, `@talex-touch/unplugin-export-plugin@1.2.16`, `@talex-touch/tuff-cli@0.0.3`, `@talex-touch/tuff-core@0.0.1`, `@talex-touch/tuff-intelligence@0.0.2`.
  - Fixed the `Tuff CLI Package CI` lint failure from the release push by aligning newly added CLI i18n `remoteFailure` keys with the repository `quote-props` style; `pnpm -C "packages/tuff-cli" run lint` passed, and tests were not run per request.
  - Active planning docs now treat `2.4.10` as the current stable baseline; follow-up execution moved to `2.4.11` stabilization and npm package publish recovery.

### fix(cli): validate Nexus login state and publisher auth preflight

- `packages/tuff-cli/src/bin/tuff.ts`
- `packages/tuff-cli/src/cli/i18n/locales/zh.ts`
- `packages/tuff-cli/src/cli/i18n/locales/en.ts`
- `packages/tuff-cli-core/src/publish.ts`
- `packages/tuff-cli-core/src/__tests__/publish-smoke.test.ts`
- `apps/nexus/server/api/dashboard/auth/publisher.get.ts`
- `packages/tuff-core/package.json`
  - Interactive CLI no longer treats a local token file as a valid login by itself; existing tokens are validated against Nexus before entering the main menu, and rejected/expired sessions prompt for relogin instead of showing a misleading account menu.
  - Account summary and remote plugin listing now distinguish unavailable auth/network/service states from an actual empty plugin list, while still showing local auth metadata as local-only evidence.
  - `tuff publish` now preflights publisher access through `/api/dashboard/auth/publisher`, which uses `requireAuthOrApiKey(['plugin:publish'])`; older Nexus deployments fall back to the dashboard plugin lookup, avoiding the previous `/api/auth/me` API-key false rejection path.
  - `@talex-touch/tuff-core` now has an explicit `tsup src/index.ts` build/dev entry so the publishable package can produce `dist` consistently.
  - Validation not run per request; CLI/tuff-core publishable builds and package dry-runs were performed after the source change.

### chore(ci): retire standalone OmniPanel Gate workflow

- `.github/workflows/omnipanel-gate.yml`
- `.github/workflows/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - Removed the standalone `OmniPanel Gate / OmniPanel Stable MVP Gate` GitHub Actions workflow entirely.
  - OmniPanel scoped typecheck/lint/unit/build/smoke no longer runs as an automatic push/PR/manual quality gate.
  - The current quality baseline now relies on ordinary nearest-path validation or explicit local commands for OmniPanel regressions, while `quality:release` remains the release/milestone entry with documented existing lint debt handling.
  - Also recorded the current published baseline as `2.4.11-beta.1` in TODO/Roadmap/Quality Baseline.

### fix(core-app): add packaged auth recovery evidence mode

- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/auth/index.test.ts`
- `apps/core-app/src/preload/index.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/modules/auth/auth-error-message.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/settings/login-recovery-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/login-recovery-display.test.ts`
- `packages/utils/transport/events/auth.ts`
- `packages/utils/preload/loading.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-18/browser-login-recovery-evidence-mode.md`
  - Settings browser login now preserves device-auth start metadata in renderer state, including manual authorize URL, short user code, expiry, and browser-open failure status.
  - The login dialog exposes localized manual recovery copy and copy-to-clipboard actions while keeping the pending device authorization session alive.
  - Auth errors now classify browser-open, timeout, callback/token, device authorization, rate limit, quota, permission, expired session, network, service outage, and generic auth failures into localized recovery copy.
  - Added a strictly gated packaged evidence mode: it requires `TUFF_VISIBLE_EVIDENCE_AUTH=1` plus startup benchmark mode before using deterministic device-auth metadata, forced browser-open failure, controllable poll status, or shortened renderer timeout.
  - Current state: source and focused tests are ready, but `browser-login-recovery` remains blocked until real packaged Electron/CDP screenshot and DOM artifacts are captured.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/main/modules/auth/index.test.ts" "src/renderer/src/views/base/settings/login-recovery-display.test.ts" "src/renderer/src/modules/auth/useAuth.test.ts"` passed; file-level ESLint passed; `typecheck:node`, `typecheck:web`, `build:unpack`, ad-hoc signing, codesign verify, and scoped `git diff --check` passed before capture was interrupted.

### fix(core-app): pass App Index workbench packaged evidence

- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppIndexManager.vue`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-manager-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-manager-display.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/packaged-cdp-visible-capture-2026-05-17.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-strict-verify-result.md`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - Settings deep link `?section=file-index` now forces the nested File Index advanced/App Index workbench section open, so packaged evidence can reach the manager without relying on persisted developer settings.
  - App Index manager no longer emits the raw `common.all` key for source/diagnostic filter chips; the new `appIndexManagerFilterAll` locale key renders localized `全部` / `All`.
  - Rebuilt and re-signed the local `2.4.10-beta.25` packaged artifact, then recaptured packaged Electron CDP evidence on port `9338` with isolated userData. The capture added `/System/Applications/Calculator.app` through the renderer `app:app-index:add-path` channel, then applied the Steam source filter.
  - `app-index-manager-current-dom.json` records `hasManager=true`, `preFilter.entryCount=1`, visible summary counts, all source chips, all diagnostic chips, active Steam filtered-empty state text, `hasRawI18n=false`, and no raw `common.all` matches.
  - Marked `app-index-workbench` passed in the visible-experience manifest/checklist. Strict verification still intentionally fails, but the failure list no longer includes `corebox-search-states` or `app-index-workbench`; remaining blockers are browser login recovery, CoreBox AI Ask, OmniPanel Writing Tools, Workflow Review Queue, Provider Registry observability, and provider migration evidence.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/app-index-manager-display.test.ts"` passed; file-level ESLint passed for the App Index settings/render helper files and locale JSON inputs; `pnpm -C "apps/core-app" run build:unpack` passed; `codesign --verify --deep --strict "apps/core-app/dist/mac-arm64/tuff.app"` passed; strict visible-experience verification exits `1` as expected without `app-index-workbench` in the failure list.

### fix(nexus): align plugin publish auth scopes and CLI diagnostics

- `apps/nexus/server/utils/apiKeyScopes.ts`
- `apps/nexus/server/api/dashboard/api-keys.post.ts`
- `apps/nexus/app/pages/dashboard/api-keys.vue`
- `packages/tuff-cli-core/src/publish.ts`
- `packages/tuff-cli-core/src/__tests__/publish-smoke.test.ts`
- `apps/nexus/server/utils/__tests__/auth-api-key-scopes.test.ts`
- `docs/plan-prd/TODO.md`
  - `plugin:publish` API keys now imply `plugin:read`, so legacy publisher keys can pass the CLI's Dashboard plugin lookup before submitting a version package.
  - Newly created Dashboard API keys now default to `plugin:read` + `plugin:publish`, matching the actual publish flow instead of creating write-only keys that fail during preflight lookup.
  - `tuff publish` now preserves local-only `--dry-run`; the first auth preflight introduced here was later replaced the same day by the publisher-specific `/api/dashboard/auth/publisher` guard to support API keys without `/api/auth/me` false rejection.
  - This makes app-token rejection cases actionable: users can distinguish expired/rotated device app tokens from API key scope issues before the package upload step.
  - Validation: focused Nexus scope tests and tuff-cli-core publish tests added for scope implication, default key scopes, auth preflight success, and auth rejection messaging.

### fix(core-app): resolve CoreBox footer i18n in packaged evidence

- `apps/core-app/src/renderer/src/components/render/CoreBoxFooter.vue`
- `apps/core-app/src/renderer/src/components/render/coreBoxFooterDisplay.ts`
- `apps/core-app/src/renderer/src/components/render/coreBoxFooterDisplay.test.ts`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/packaged-cdp-visible-capture-2026-05-17.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-strict-verify-result.md`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - CoreBox footer title now resolves `$i18n:*` message strings before display, matching the existing completion display i18n repair and preventing raw footer translation keys from leaking into packaged result evidence.
  - Rebuilt and re-signed the local `2.4.10-beta.25` packaged artifact, then recaptured packaged Electron CDP evidence on port `9336` for CoreBox idle, no-result, searching/loading, and populated result states.
  - `corebox-result-reasons-dom.json` now records `hasRawI18n=false` with localized completion/footer text, mixed application/system result rows, and source/quick-key signal rails fitting without visible overlap.
  - Marked `corebox-search-states` passed in the visible-experience manifest/checklist. Strict verification still intentionally fails, but only on the remaining missing UI/provider evidence surfaces: App Index workbench, browser login recovery, CoreBox AI Ask, OmniPanel Writing Tools, Workflow Review Queue, Provider Registry observability, and provider migration evidence.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/renderer/src/components/render/coreBoxFooterDisplay.test.ts" "src/renderer/src/views/box/completion-display.test.ts" "src/renderer/src/components/render/sourceMeta.test.ts"` passed; file-level ESLint passed; `pnpm -C "apps/core-app" run typecheck:web` passed; `pnpm -C "apps/core-app" run build:unpack` passed; `codesign --verify --deep --strict "apps/core-app/dist/mac-arm64/tuff.app"` passed; strict visible-experience verification exits `1` as expected without `corebox-search-states` in the failure list.

### fix(core-app): apply backpressure to file cache database writes

- `apps/core-app/src/main/db/db-write-scheduler.ts`
- `apps/core-app/src/main/db/db-write-scheduler.test.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - File keyword extension writes and icon cache writes no longer inherit the broad `file-index.*` critical/no-drop policy; these rebuildable cache writes now use bounded background/best-effort QoS, stale-task dropping, and SQLITE_BUSY circuit breaking.
  - File provider now waits for DB write queue capacity before enqueueing keyword extension upserts or extracting/persisting icon cache payloads, preventing full-scan fire-and-forget cache work from flooding the serialized SQLite write queue.
  - This keeps primary file record/search-index work prioritized while letting rebuildable keyword/icon cache data recover on later scans instead of blocking plugin/dev runtime responsiveness.

### fix(plugins): expose browser-open shell capability diagnostics

- `plugins/touch-browser-open/index.js`
- `packages/test/src/plugins/browser-open.test.ts`
- `docs/plan-prd/TODO.md`
  - Browser Open result items now expose `system.shell` capability metadata with platform status, permission state, unsupported reason, command source, and audit fields before execution.
  - Web Search result items now expose shell-open platform status and audit metadata without blocking fast suggestion refresh.
  - Browser Open feature rendering uses non-mutating permission checks only, so URL input does not trigger a shell permission prompt; execution still requests `system.shell` for actual browser open actions.
  - Linux keeps default browser / search open as available through `xdg-open`, while specific-browser open reports `linux-specific-browser-open-unsupported` instead of failing as an opaque runtime error.
  - Copy URL no longer requires `system.shell`; it only checks `clipboard.write`, keeping permissions aligned with the actual action.
  - Validation: `pnpm -C "packages/test" exec vitest run "src/plugins/browser-open.test.ts"` passed; `pnpm exec eslint --no-ignore "plugins/touch-browser-open/index.js" "packages/test/src/plugins/browser-open.test.ts"` passed with the existing `.eslintignore` migration warning only; `git diff --check -- "plugins/touch-browser-open/index.js" "packages/test/src/plugins/browser-open.test.ts"` passed.

### fix(plugins): fail closed for system and window shell actions

- `plugins/touch-system-actions/index.js`
- `plugins/touch-window-manager/index.js`
- `packages/test/src/plugins/system-actions.test.ts`
- `packages/test/src/plugins/window-manager.test.ts`
- `docs/plan-prd/TODO.md`
  - System Actions no longer falls back to raw `exec` when safe-shell is unavailable; shell-backed actions now fail closed with `safe-shell-unavailable`.
  - System Actions and Window Manager feature rendering now use non-mutating permission diagnostics, keeping capability reason visible without prompting before the user picks an action.
  - `open-main-window` is now modeled as a native window capability instead of a shell action, so it stays available even when shell execution is unavailable or denied.
  - Window Manager now blocks before permission request when the platform or shell support is unavailable, and action results consistently return `started` or `blocked`.
  - Validation: `pnpm -C "packages/test" exec vitest run "src/plugins/system-actions.test.ts" "src/plugins/window-manager.test.ts"` passed; file-level ESLint passed with the existing `.eslintignore` migration warning only; scoped `git diff --check` passed.

## 2026-05-17

### fix(plugin): keep touch-intelligence CoreBox session visible

- `plugins/touch-intelligence/index.js`
  - Intelligence 推送的 placeholder、send、pending、ready、error 项统一标记 `keepCoreBoxOpen`，避免发送 AI 请求、等待响应或展示回答/错误时被 CoreBox auto-hide 提前隐藏。
  - 复用现有 CoreBox keep-open 语义，不改变普通搜索结果和其他插件 item 的执行流程。

### feat(widget): add TouchWidget Arrow and WebComponent beta runtimes

- `packages/utils/plugin/widget.ts`
- `apps/core-app/src/main/modules/plugin/widget/**`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `packages/tuff-cli-core/src/exporter.ts`
- `apps/nexus/content/docs/dev/api/widget.{zh,en}.mdc`
  - 新增 `arrow` 与 `webcomponent` Widget runtime，统一标记为 beta；现有 Vue Widget 仍保持默认 stable 路径。
  - `@arrow-js/core@1.0.6` 进入受控依赖白名单，支持 `.arrow.ts` / `.arrow.js` TouchWidget 推荐入口。
  - 预编译 manifest 与 runtime payload 记录 `runtime` / `runtimeStage`，renderer 通过轻量 host wrapper 挂载 ArrowJS 与 WebComponent。

### fix(plugins): harden workspace shell capability diagnostics

- `plugins/touch-workspace-scripts/index.js`
- `plugins/touch-workspace-scripts/index.test.cjs`
- `plugins/touch-workspace-scripts/package.json`
- `docs/plan-prd/TODO.md`
  - Workspace Scripts no longer falls back to raw `spawn(..., shell: true)` when the shared safe-shell helper is unavailable; shell execution now fails closed with `safe-shell-unavailable`.
  - CoreBox shell command items now expose capability status, permission, unsupported reason, command source, and audit metadata so permission/platform failures are visible before execution.
  - Command execution now validates empty commands, newline/null payloads, and cwd availability before spawning, then returns explicit `started`, `blocked`, or `cancelled` action status.
  - Added a local plugin test entrypoint covering shell capability diagnostics, permission-missing state, unsafe payload/cwd blocking, safe-shell fail-closed behavior, package script parsing, and relative cwd resolution.

### feat(nexus): tighten Provider Registry observability empty states

- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/app/utils/provider-registry-admin.test.ts`
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts`
- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/i18n/locales/{zh,en}.ts`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`
- `docs/plan-prd/TODO.md`
  - Provider Registry Admin now distinguishes initial empty, filtered empty, no-attention, no-unknown-provider, and no-failed-scene states for Provider and Scene observability lists.
  - Filtered empty states now include a clear “show all” recovery action, keeping the admin surface closer to the command-center UI direction without changing backend APIs.
  - Usage Ledger and Health tabs now expose next-action guidance for failed, planned, estimated, completed, unhealthy, degraded, and healthy rows, plus clearer empty-state detail for how to seed evidence.
  - Usage Ledger and Health tabs now also have local filter chips with per-filter counts, so failed/planned/estimated usage rows and degraded/unhealthy health checks are scannable without adding backend query scope.
  - Kept this as a source/UI helper improvement only: Provider Admin still needs a real admin session with registry data and visual capture before the visible-experience manifest can pass.

### fix(core-app): broaden CoreBox result signal metadata mapping

- `apps/core-app/src/renderer/src/components/render/sourceMeta.ts`
- `apps/core-app/src/renderer/src/components/render/sourceMeta.test.ts`
- `apps/core-app/src/renderer/src/components/render/BoxItem.vue`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - CoreBox result signals now also read direct `meta.resultSignal`, top-level `status/reason/error`, provider health metadata, and top-level permissions instead of only relying on `meta.extension`.
  - This keeps Provider/permission failures visible as status/reason/action pills across more result payload shapes without changing the renderer contract.
  - CoreBox default result rows now constrain the right-side status/source/quick-key signal rail, truncate long source labels and reason text with full `title` fallbacks, and preserve the main title/subtitle scan area for compact command-center density.
  - Follow-up packaged CDP recapture on 2026-05-18 confirmed the CoreBox search-state visible-experience item now passes with localized completion/footer text and no visible signal overlap.

### fix(core-app): keep App Index workbench shell visible when empty

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppIndexManager.vue`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`
- `docs/plan-prd/TODO.md`
  - App Index manager now keeps summary counts and source/diagnostic filter chips visible even when there are no manually managed app entries.
  - This removes a recapture risk where a fresh or empty profile could only show the add-entry empty state and still fail the workbench summary/filter evidence requirement.
  - Kept this as a source/UI visibility improvement only: packaged Electron recapture is still required before the App Index workbench visible-experience item can pass.

### feat(core-app): tighten Workflow Review Queue metadata chips

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.test.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - Workflow Review Queue items now render labeled metadata chips for capability, provider/model, trace, latency, token count, risk, and failure reason.
  - Medium-risk and failure chips use warning styling so failed copy/replace states are easier to scan before retrying or clearing failure.
  - Kept this as a source/UI helper improvement only: packaged Electron workflow-run evidence is still required before the Review Queue visible-experience item can pass.

### feat(core-app): tighten OmniPanel AI preview status metadata

- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - OmniPanel Writing Tools preview now shows running, ready, failed, and confirming status details instead of relying on a short status pill only.
  - AI preview metadata now renders labeled capability, provider, model, and latency chips so the result fits the command-center evidence model.
  - Kept this as a source/UI helper improvement only: packaged Electron selected-context/result/copy/replace/failure evidence is still required before the OmniPanel visible-experience item can pass.

### feat(store): add CloudShare plugin content packages

- `packages/utils/types/cloud-share.ts`
- `packages/utils/cloud-share/cloud-share-sdk.ts`
- `packages/utils/plugin/sdk/cloud-share.ts`
- `packages/utils/__tests__/cloud-share-sdk.test.ts`
- `apps/nexus/server/utils/pluginContentStore.ts`
- `apps/nexus/server/utils/pluginContentStore.test.ts`
- `apps/nexus/server/api/store/plugin-content/*`
- `apps/nexus/app/pages/store.vue`
- `apps/nexus/app/types/store.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
- `plugins/touch-snippets/index.js`
- `plugins/touch-snippets/index.test.cjs`
- `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md`
  - Added CloudShare / Content Store contract separate from private CloudSync semantics, with `PluginContentPackage` types, client SDK, plugin SDK wrapper, Nexus D1/Nitro fallback store, public list/detail/install APIs, authenticated publish API, and focused SDK/store tests.
  - Nexus Store plugin detail now has a Content tab that lists shared content packages for the selected plugin.
  - `touch-snippets` now supports snippet pack export/import helpers, sensitive-content filtering for pack export, CloudShare list/install helper actions, and tests for pack normalization/merge/publish/install helpers.

### feat(core-app): tighten CoreBox AI answer status feedback

- `apps/core-app/src/renderer/src/components/render/custom/CoreIntelligenceAnswer.vue`
- `apps/core-app/src/renderer/src/components/render/custom/core-intelligence-answer.ts`
- `apps/core-app/src/renderer/src/components/render/custom/core-intelligence-answer.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - CoreBox AI Ask answer cards now show status-specific tone and readable pending/ready/error hints alongside provider metadata.
  - Added a provider metadata pending fallback so incomplete AI payloads do not render as an empty footer.
  - Kept this as a source/UI helper improvement only: packaged Electron answer or recoverable failure evidence is still required before the CoreBox AI Ask visible-experience item can pass.

### docs(nexus): attach provider migration planning evidence

- `apps/nexus/test/api/dashboard/intelligence/providers/migrate.local-dry-run.api.test.ts`
- `apps/nexus/server/utils/intelligenceProviderRegistryBridge.local-dry-run.test.ts`
- `apps/nexus/test/helpers/provider-registry-test-utils.ts`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/provider-migration-dry-run.md`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/coreapp-visible-experience-manifest.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - Added local isolated Provider Registry migration dry-run coverage through the migration API handler and the real migration bridge against Mock D1, recording the copied evidence format, dry-run readiness semantics, and secret-redaction boundary.
  - Kept `provider-migration-evidence` blocked in the visible-experience manifest because the artifact is not a user-session Dashboard or real local-binding API dry-run result and must not claim registry-primary readiness.
  - TODO and the completion audit now distinguish local isolated API/bridge dry-run evidence from required Phase 0/1 real Dashboard/API dry-run or execute evidence.

### fix(core-app): restore CoreBox search results on reopen

- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/types.ts`
  - CoreBox now forces a search refresh when the window is shown, so reopening with a retained query such as `aaa` restores matching results instead of leaving an empty result area.
  - CoreBox layout reporting now bypasses renderer-side duplicate-payload suppression on `corebox:shown`, allowing the collapsed hidden window to expand back to the existing result height.
  - Search duplicate suppression now runs before incrementing the renderer search sequence, preventing skipped duplicate queries from invalidating an in-flight result.
  - Added focused renderer hook coverage for retained-query reopen refresh and duplicate-query in-flight result preservation.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts" "src/renderer/src/modules/box/adapter/hooks/useVisibility.test.ts"` passed; `pnpm -C "apps/core-app" exec vue-tsc --noEmit -p tsconfig.web.json --composite false --pretty false` passed.

### fix(core-app): record packaged CDP visible evidence and completion display repair

- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/renderer/src/views/box/completion-display.ts`
- `apps/core-app/src/renderer/src/views/box/completion-display.test.ts`
- `packages/utils/transport/events/auth.ts`
- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/main/modules/auth/index.test.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/settings/login-recovery-display.ts`
- `apps/core-app/src/renderer/src/views/base/settings/login-recovery-display.test.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/*`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - Captured real packaged Electron CDP evidence for the current `2.4.10-beta.25` local artifact, including first usable onboarding/login screen, Settings/About startup health, CoreBox idle state, no-result state, result-reason state, and loading-state artifacts.
  - Marked `startup-first-screen` passed in the visible-experience manifest because the packaged app reaches a usable non-blank surface and Settings/About exposes version/build/startup-health, login state, and permission state.
  - Initially kept `corebox-search-states` blocked because the packaged result-reason capture exposed raw i18n completion/footer text for a system screenshot action.
  - Added `completion-display` helper coverage and resolved CoreBox completion i18n strings before prefix trimming in source. A 2026-05-18 follow-up rebuilt packaged artifact and CDP recapture closed the CoreBox search-state evidence gap.
  - Propagated browser-open failure from main auth to renderer as optional login-start metadata, so the login dialog can keep the device authorization session waiting while showing manual login link and short-code recovery copy.
  - Captured App Index file-index packaged CDP negative evidence: the current packaged artifact reaches App Index scheduling settings, but the manager workbench DOM is absent, so summary/filter evidence cannot be claimed without rebuild/recapture.
  - Updated the completion audit and TODO to distinguish dev capture blockers from the now-validated packaged CDP capture path, while keeping Login Recovery, AI Ask, App Index, OmniPanel, Review Queue, Provider Admin, and provider migration visual evidence open until rebuilt packaged artifacts or real admin/API evidence are recaptured.
  - Validation: `pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/box/completion-display.test.ts"` passed; `pnpm -C "apps/core-app" exec vitest run "src/main/modules/auth/index.test.ts" "src/renderer/src/views/base/settings/login-recovery-display.test.ts"` passed; `pnpm -C "apps/core-app" exec eslint "src/renderer/src/views/box/completion-display.ts" "src/renderer/src/views/box/completion-display.test.ts" "src/renderer/src/views/box/CoreBox.vue"` passed; `pnpm -C "apps/core-app" exec eslint "src/main/modules/auth/index.ts" "src/main/modules/auth/index.test.ts" "src/renderer/src/modules/auth/useAuth.ts" "src/renderer/src/views/base/settings/SettingUser.vue" "src/renderer/src/views/base/settings/login-recovery-display.ts" "src/renderer/src/views/base/settings/login-recovery-display.test.ts"` passed; `pnpm exec eslint "packages/utils/transport/events/auth.ts"` passed.

### feat(plugins): consolidate snippets into a canonical plugin

- `plugins/touch-snippets/manifest.json`
- `plugins/touch-snippets/index.js`
- `plugins/touch-snippets/index.test.cjs`
- `plugins/touch-text-snippets/manifest.json`
- `plugins/touch-text-snippets/index.js`
- `plugins/touch-code-snippets/manifest.json`
- `plugins/touch-code-snippets/index.js`
  - Added canonical `touch-snippets` plugin with unified text/code/prompt/template snippet model, CoreBox search, copy, save, manage entries, placeholder replacement, usage metadata, and focused Node tests.
  - Retired `touch-text-snippets` and `touch-code-snippets` from the CoreBox feature surface by leaving their manifests as legacy placeholders with empty `features`, no clipboard permissions, and inert lifecycle modules; directories remain in place until a separate deletion/migration cleanup is explicitly approved.
  - Validation: `pnpm -C "plugins/touch-snippets" test` passed; `pnpm exec eslint --no-ignore "plugins/touch-snippets/index.js" "plugins/touch-snippets/index.test.cjs" "plugins/touch-text-snippets/index.js" "plugins/touch-code-snippets/index.js"` passed; `git diff --check -- "plugins/touch-snippets" "plugins/touch-text-snippets/manifest.json" "plugins/touch-text-snippets/index.js" "plugins/touch-code-snippets/manifest.json" "plugins/touch-code-snippets/index.js" "docs/plan-prd/01-project/CHANGES.md" "docs/plan-prd/TODO.md"` passed.

### fix(core-app): stabilize packaged startup runtime closure

- `apps/core-app/scripts/build-target/runtime-modules.js`
- `apps/core-app/src/main/core/runtime-modules.contract.test.ts`
- `apps/core-app/scripts/startup-benchmark-dev.mjs`
- `apps/core-app/src/main/core/precore.ts`
- `docs/engineering/reports/startup-packaged-hot-runs-2026-05-17/*`
  - Packaged runtime module discovery now resolves pnpm symlinked dependencies from each package's real install path before falling back to workspace roots, preventing resources-side modules such as `compressing` from binding to an incompatible hoisted transitive dependency.
  - Resource runtime closure traversal now visits duplicate package instances by package path/version before flattening copied resource modules by name, so nested legacy dependency chains such as `readable-stream -> process-nextick-args` are not silently skipped.
  - Added contract coverage for pnpm-style symlink resolution and duplicate package instance traversal.
  - Packaged startup benchmark now supports isolated `userData`, artifact preflight, app log deltas, and an early precore diagnostic file to distinguish "Electron did not enter JS" from later startup failures.
  - Rebuilt and ad-hoc signed local `2.4.10-beta.25` macOS unpacked artifact, verified packaged startup no longer raises main-process missing-module dialogs, and captured hot benchmark evidence: latest 10 runs pass with Startup health P50 1700ms, P95 1900ms, 0 WARN, and 0 ERROR.
  - Captured packaged cold benchmark evidence in `docs/engineering/reports/startup-packaged-cold-runs-2026-05-17/`: 10/10 runs pass with Startup health P50 1100ms, P95 3400ms, 0 WARN, and 0 ERROR; the first cold run is near the 3500ms budget and remains a UI first-screen verification target.

### fix(core-app): align CoreBox empty state and tray menu behavior

- `apps/core-app/src/renderer/src/views/box/search-state.ts`
- `apps/core-app/src/renderer/src/components/app/MainWindowRuntimeServices.vue`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/modules/tray/tray-menu-builder.ts`
  - Removed the idle CoreBox empty guidance card so a fully empty query/result state collapses back to the compact input height instead of showing a large blank result area.
  - Main-window language initialization now starts the renderer-to-main locale sync, and the main process emits a language-changed event after locale updates so tray menus rebuild with the selected language.
  - Removed the misleading tray `Clipboard History` entry until a dedicated clipboard history route/window exists; clipboard history remains available to SDK/transport consumers but is no longer presented as a direct tray page.

### fix(nexus): stabilize locale preference orchestration

- `apps/nexus/app/composables/useLocaleOrchestrator.ts`
- `apps/nexus/app/composables/useLocalePreference.ts`
- `apps/nexus/app/components/LanguageToggle.vue`
- `apps/nexus/app/components/HeaderUserMenu.vue`
- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue`
  - Client-side locale initialization now reconciles cookie/localStorage preference after prerender hydration instead of trusting serialized SSR init state.
  - Local language preference now takes priority over profile locale during auth sync, preventing manual Chinese/English selection from being overwritten by stale remote profile data.
  - Manual language switching now uses the unified locale orchestrator and updates the authenticated user profile when available; AI language tool results reuse the same local persistence path.
  - Locale preference cookie is now written at `/` scope to avoid path-scoped language drift across Nexus pages.

### fix(core-app): align CoreBox clipboard session settings

- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.test.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingTools.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - CoreBox AutoClear now treats legacy `0` as no automatic reset instead of clearing on every reopen, preserving short-session reuse semantics.
  - AutoClear options no longer expose a duplicate `No limit` choice; `Disabled` is the visible no-auto-reset option while runtime remains backward compatible with saved `0` values.
  - AutoPaste and AutoClear descriptions now clarify the intended uTools-like behavior: fresh clipboard content is checked when CoreBox is opened, and stale CoreBox sessions reset only after the hidden-time window expires.
  - Added focused hook coverage for disabled/no-limit AutoClear, short reopen preservation, and stale session reset.

### test(core-app): record visible experience capture blockers

- `apps/core-app/scripts/dev-electron-wrapper.mjs`
- `apps/core-app/scripts/coreapp-visible-experience-readiness.ts`
- `apps/core-app/src/main/modules/platform/coreapp-visible-experience-evidence.ts`
- `docs/engineering/reports/coreapp-visible-browser-smoke-2026-05-17/README.md`
- `docs/engineering/reports/coreapp-visible-electron-dev-capture-2026-05-17/README.md`
- `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md`
- `docs/plan-prd/TODO.md`
  - Archived the plain-browser CoreApp smoke result as negative evidence: the page is blank because Electron preload is absent and `ipcRenderer` is undefined, so it cannot replace Electron UI proof.
  - Added opt-in `TUFF_DEV_ELECTRON_BUNDLE_ID` / `TUFF_DEV_ELECTRON_BUNDLE_NAME` support to the macOS dev wrapper so future capture runs can prepare a separate Electron.app bundle without changing the default dev bundle.
  - Recorded the Electron dev capture blocker: separate dev ports and the isolated bundle both built main/preload and announced a renderer URL, but exited after `start electron app...` without a remote-debugging port or UI artifact.
  - Recorded the OS-level screenshot fallback blocker: macOS Screen Recording permission is not granted for the terminal/Codex process, so no Tuff window screenshot could be captured.
  - Added `visible:experience:readiness`, a read-only preflight for packaged artifact version, browser-smoke boundary, Electron remote debugging availability, and Screen Recording state; the command now reports the current capture state as blocked instead of relying on manual report interpretation.
  - The visible-experience audit now distinguishes negative capture evidence from completion evidence: packaged hot/cold startup evidence is covered for the current `2.4.10-beta.25` artifact, while first-screen, CoreBox, login recovery, AI, OmniPanel, Review Queue, Provider Admin, provider migration, Windows, and Nexus evidence remain incomplete.

### fix(core-app): smooth CoreBox height resize animation

- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
  - CoreBox height animation now relaxes the window minimum height during animated resize instead of clamping expand frames directly to the final height.
  - Animated resize temporarily enables resizable mode for panel windows, improving macOS/Electron bounds update stability before restoring the original state.
  - Renderer layout updates are lightly throttled and the settled measurement delay now better matches result transition timing, reducing repeated retarget jitter while typing/searching.
  - CoreBox resize animation now runs on the critical polling lane and retargets an active animation instead of canceling/restarting it, avoiding pressure-mode frame intervals and stepped resize motion.

### test(core-app): add visible experience evidence gate

- `apps/core-app/src/main/modules/platform/coreapp-visible-experience-evidence.ts`
- `apps/core-app/scripts/coreapp-visible-experience-template.ts`
- `apps/core-app/scripts/coreapp-visible-experience-verify.ts`
- `apps/core-app/package.json`
- `docs/plan-prd/TODO.md`
  - Added a repeatable manifest/checklist generator for CoreApp visible experience evidence, covering packaged hot/cold startup, first screen, CoreBox search states, App Index workbench, browser login recovery, CoreBox AI Ask, OmniPanel Writing Tools, Workflow Review Queue, Provider Registry observability, and provider migration evidence.
  - The generated checklist now includes per-surface collection steps, recommended artifact filenames, and explicit blocked conditions so UI screenshots, benchmark reports, and migration summaries can be gathered consistently without treating templates as proof.
  - Added a strict verifier that fails when required surfaces are not passed, artifact paths are missing, visual surfaces lack screenshot/recording artifacts, required checklist evidence is not checked, or referenced artifacts are missing/empty.
  - The verifier is intentionally evidence-only: an empty generated template remains blocked and cannot be counted as real UI proof.
  - Added `docs/engineering/reports/coreapp-visible-experience-completion-audit-2026-05-17.md` to map the user-facing objective to concrete artifacts and mark missing packaged benchmark, screenshot/recording, migration, Windows, and Nexus evidence explicitly.

### fix(core-app): make AI provider failure reasons more actionable

- `apps/core-app/src/renderer/src/components/render/sourceMeta.ts`
- `apps/core-app/src/renderer/src/modules/intelligence/ai-error-recovery.ts`
  - CoreBox result signals now map credential, secure-store, capability, and permission failure codes to readable labels and next-action hints instead of falling back to opaque reason text.
  - CoreBox AI Ask and OmniPanel Writing Tools recovery hints now distinguish provider credential issues and permission gaps from generic provider/network failures.
  - Added focused helper coverage for credential, secure-store, capability, and permission recovery classification.

### feat(core-app): clarify CoreBox search empty states

- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/renderer/src/views/box/search-state.ts`
  - CoreBox now shows compact workbench-style status guidance for idle search, recommendation warm-up, active searching, and no-result states instead of leaving an empty result area.
  - No-result states now expose direct recovery actions to retry the query or jump to File Index diagnostics through the existing settings deep link.
  - The state resolver keeps feature-owned input and populated result lists out of the empty-state UI, preserving plugin and widget flows.
  - Added focused helper coverage for search-state resolution.

### feat(core-app): add App Index manager workbench filters

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppIndexManager.vue`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-manager-display.ts`
  - App Index manager now shows a compact workbench summary for total, needs-attention, found, unchecked, and disabled managed entries.
  - Added source filters for UWP/Store, Steam, shortcut, protocol, AppRef, and path entries, plus diagnostic filters for attention, found, unchecked, and disabled states.
  - Filtered empty states now distinguish between no managed entries and no entries matching the current source/diagnostic filter.
  - Extended focused helper coverage for source/diagnostic filtering and workbench summary counts.

### feat(core-app): clarify App Index manager empty states

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppIndexManager.vue`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-manager-display.ts`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
  - App Index manager now gives initial empty, source-filtered empty, attention-clean, no-diagnosed-hit, all-diagnosed, and no-disabled states distinct titles and recovery details.
  - Empty states expose the relevant next action, either selecting an app file for a clean slate or clearing filters for filtered-out workbench states.
  - Added focused helper coverage for empty-state resolution without changing the App Index transport or indexing contract.

### fix(core-app): localize recoverable login failure copy

- `apps/core-app/src/renderer/src/modules/auth/auth-error-message.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/modules/lang/{en-US,zh-CN}.json`
  - Settings login failures now use localized, recoverable messages for browser-open failure, timeout, callback/token failure, device authorization, rate limit, quota, permission, expired session, network, and Nexus service outage cases.
  - The auth error helper now exposes a focused classifier so new transport or callback errors can be tested without duplicating string matching in UI components.
  - Existing non-component auth call sites keep the fallback message path, avoiding changes to renderer initialization or global toast lifecycle.

### fix(core-app): infer CoreBox result status from known reasons

- `apps/core-app/src/renderer/src/components/render/sourceMeta.ts`
  - CoreBox result rows now infer failed/degraded status from known provider, auth, quota, permission, database, capability, platform, and indexing reason codes even when the result metadata forgot to set an explicit `status`.
  - Unknown advisory reasons still stay silent unless a status is provided, avoiding noisy warning pills for feature-specific descriptive metadata.
  - Extended focused result-signal coverage for reason-only metadata.

### fix(core-app): make desktop AI failures recoverable

- `apps/core-app/src/renderer/src/components/render/custom/CoreIntelligenceAnswer.vue`
- `apps/core-app/src/renderer/src/components/render/custom/core-intelligence-answer.ts`
  - `apps/core-app/src/renderer/src/modules/intelligence/ai-error-recovery.ts`
  - `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
  - CoreBox AI Ask and OmniPanel Writing Tools now share recovery hints for common auth, quota, provider, model-capability, and network failures.
  - Unknown AI failures still keep the original backend error visible so diagnostics are not hidden behind generic copy.
  - Added focused helper coverage for common AI error recovery classification.

### fix(core-app): make CoreBox result reasons readable

- `apps/core-app/src/renderer/src/components/render/sourceMeta.ts`
- `apps/core-app/src/renderer/src/components/render/BoxItem.vue`
  - CoreBox result status pills now map common provider, auth, quota, platform, database, and permission reason codes to readable labels.
  - Unknown reason codes still fall back to the original compact text, preserving diagnostics for new providers.
  - Added focused coverage for known reason-code mapping and permission-code fallback behavior.

### feat(core-app): clarify Workflow Review Queue next actions

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
  - Review Queue cards now show an explicit next-action hint for pending, copied, clipboard-replaced, and failed outputs.
  - Failed review items include the captured clipboard/action error in the hint while preserving retry copy, retry replace, and clear-failure actions.
  - Added focused helper coverage for Review Queue next-action hint mapping.

### feat(nexus): add Provider Registry observability filters

- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts`
- `apps/nexus/app/utils/provider-registry-admin.ts`
  - Provider Registry admin now exposes compact filter chips for all/attention/healthy/degraded/unhealthy/unknown providers and all/attention/completed/failed/planned/unknown scenes.
  - Provider attention highlights degraded/unhealthy providers or failed latest usage, while scene attention highlights failed history or unknown run coverage.
  - Empty states now distinguish between no registry data and no records matching the selected observability filter.
  - Added focused helper coverage for provider and scene observability filtering.

### fix(core-app): keep CoreBox result failure reasons visible

- `apps/core-app/src/renderer/src/components/render/BoxItem.vue`
- `apps/core-app/src/renderer/src/components/render/sourceMeta.ts`
  - CoreBox result status pills now show a compact inline reason when failed/degraded/permission metadata already carries an actionable cause.
  - Failure reasons are normalized to single-line text and trimmed before rendering, so result rows stay stable while still explaining why an item is unavailable.
  - Added focused utility coverage for compact result-signal reason formatting.

### fix(core-app): make browser login recovery actionable

- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `packages/utils/transport/events/auth.ts`
  - Browser login startup now returns the prepared device authorization URL, short user code, and expiry metadata to the renderer while keeping the existing `initiated` contract.
  - If the system browser fails to open, the device auth polling session remains active and Settings can still show copy actions for the login URL and short code.
  - The login dialog now surfaces a manual recovery hint plus copy-link/copy-code actions backed by the typed clipboard transport.
  - Added focused main-process coverage for the browser-open-failure recovery contract.

### test(core-app): add packaged startup benchmark harness

- `apps/core-app/scripts/startup-benchmark-dev.mjs`
- `apps/core-app/src/main/polyfills.ts`
- `apps/core-app/package.json`
- `docs/engineering/reports/startup-packaged-hot-runs-2026-05-17-preflight/*`
- `docs/engineering/reports/startup-packaged-hot-runs-2026-05-17-open-a/*`
- `docs/plan-prd/TODO.md`
  - Extended the startup benchmark runner with explicit `--target packaged`, `--profile hot|cold`, and `--launchMethod open|exec` options while keeping the existing dev benchmark default unchanged.
  - Packaged runs now use an isolated `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR` and parse app log deltas from that profile, so cold/hot samples do not write into the user's normal CoreApp data directory.
  - Added packaged artifact preflight that records app bundle path, executable path, expected package version, bundle version, executable bit, and version-match status before launching the app.
  - Added `startup:bench:packaged:hot` and `startup:bench:packaged:cold` scripts for repeatable packaged startup evidence collection.
  - Captured the current local packaged blocker: existing `apps/core-app/dist/mac-arm64/tuff.app` is still `2.4.10-beta.23` while the current package baseline is `2.4.10-beta.25`, so the preflight report blocks timing collection as `packaged_artifact_version_mismatch`; earlier direct launch evidence is kept as an auxiliary blocker note.

### feat(core-app): surface Review Queue runtime cost signals

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
  - Review Queue items now carry and display Use Model latency, total token count, and review risk level from the run step output/metadata.
  - The workbench card keeps capability/provider/model/trace context while adding cost and risk signals before copy/replace actions.
  - Extended focused hook coverage so page-local Review Queue items preserve latency, token usage, and medium-risk output contracts.

### feat(core-app): tighten App Index manager workbench signals

- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndexAppIndexManager.vue`
- `apps/core-app/src/renderer/src/views/base/settings/app-index-manager-display.ts`
  - App Index managed entries now show compact source badges for UWP/Store, Steam, shortcut, protocol, AppRef, and path entries.
  - Entry cards now show a diagnostic summary before the raw JSON block, including unchecked, found, matched-stage, and needs-attention states.
  - Added focused helper coverage for source grouping and diagnostic summary behavior.

### feat(core-app): tighten CoreBox AI answer preview feedback

- `apps/core-app/src/renderer/src/components/render/custom/CoreIntelligenceAnswer.vue`
- `apps/core-app/src/renderer/src/components/render/custom/core-intelligence-answer.ts`
  - CoreBox AI Ask answer cards now keep copy failures visible inside the answer preview instead of relying only on a transient toast.
  - The preview footer now surfaces existing provider/model, latency, trace id, and input kind metadata from the AI payload so AI results align with the command-center result model.
  - Added focused utility coverage for AI preview metadata normalization and invalid latency filtering.

### feat(nexus): surface Provider Registry observability in cards

- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/app/utils/provider-registry-admin.ts`
  - Provider cards now show compact latest health and latest usage summaries, including status, capability, latency, scene, and error/reference details.
  - Scene cards now show latest run status, run/provider/capability, recent failure count, and the latest error hint before the edit/run panels.
  - Added focused utility coverage for provider health precedence, usage-only unhealthy fallback, scene latest run selection, failure counting, and unknown empty states.

### feat(nexus): add Provider Registry observability action hints

- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
- `apps/nexus/app/utils/provider-registry-admin.ts`
- `apps/nexus/i18n/locales/{en,zh}.ts`
  - Provider and Scene cards now show a compact next-action hint derived from health checks, usage ledger status, degraded reasons, failed runs, and unknown evidence gaps.
  - Provider hints distinguish unhealthy credential/endpoint checks, degraded rerun guidance, healthy registry-evidence readiness, and unknown check-first states.
  - Scene hints distinguish failed run inspection, failed-history dry-run guidance, planned-only execute guidance, completed evidence readiness, and unknown dry-run-first states.
  - Added focused helper coverage for Provider/Scene observability action hint mapping.

### feat(nexus): make Provider Registry migration evidence copyable

- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAdminPanel.vue`
- `apps/nexus/app/utils/intelligence-provider-migration.ts`
  - Provider Registry migration dry-run/execute results now format a copyable evidence summary with mode, readiness, registry-primary safety, counts, blockers, and per-provider action details.
  - The Intelligence admin migration panel exposes a Copy evidence action so Phase 0/1 retirement evidence can be captured without copying raw UI fragments.
  - Added focused helper coverage for dry-run, ready execute, and failed migration evidence summaries.

### feat(core-app): add CoreBox result next-action hints

- `apps/core-app/src/renderer/src/components/render/sourceMeta.ts`
- `apps/core-app/src/renderer/src/components/render/BoxItem.vue`
  - CoreBox result status signals now derive compact next-action hints for auth, quota, provider, permission, database, platform, and indexing reasons.
  - Result rows keep the existing dense layout while exposing the full reason plus recovery hint through the status tooltip.
  - Added focused utility coverage for known action-hint mapping and generic failed/degraded fallbacks.

### feat(core-app): clarify OmniPanel selection recovery hints

- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/selection-recovery.ts`
  - OmniPanel footer hints now distinguish ready, empty, unsupported, disabled, and failed selected-text capture states with explicit recovery guidance.
  - Unsupported and failed capture states use warning/danger tone instead of looking like a generic zero-selection state.
  - Added focused helper coverage for selected-text preview normalization and recovery hint mapping.

### fix(core-app): keep OmniPanel AI clipboard failures visible

- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
  - OmniPanel Writing Tools now keep copy/replace clipboard failures visible inside the AI preview instead of relying only on a transient toast.
  - Retrying an AI action or clearing the preview resets the clipboard action error while preserving the existing result preview and replace-confirm flow.

### fix(core-app): make Workflow Review Queue failures recoverable

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
  - Review Queue copy/replace clipboard failures now remain visible with the original error and an explicit recovery action.
  - Failed review items expose retry copy, retry replace, and clear-failure actions without changing the existing clipboard confirmation flow.
  - Review Queue now has status filter chips for all/pending/copied/replaced/failed items, with shared summary/filter helpers to keep the workbench state logic testable.
  - Added focused hook coverage for failed review item recovery and confirmation-state reset.

### fix(core-app): normalize browser login failure messages

- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
  - Browser login timeout now keeps the dedicated timeout message instead of being collapsed into a generic network error.
  - Settings login failure dialog now shows the normalized recoverable auth message instead of raw Error text.
  - Browser-open failures use a clear retry/manual-open hint.

### feat(nexus): surface provider migration readiness in admin UI

- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAdminPanel.vue`
- `apps/nexus/app/utils/intelligence-provider-migration.ts`
  - Added a Provider Registry migration readiness panel that distinguishes dry-run planning, blocked execution, and registry-primary ready states.
  - Exposed `readyForRegistryPrimaryReads` and machine-readable `blockers` in the dashboard so legacy `intelligence_providers` retirement is auditable before promoting registry-primary reads.
  - Added focused utility and migrate API coverage for readiness pass-through and blocker normalization.

### fix(core-app): make file-search degraded notices recoverable

- `apps/core-app/src/main/modules/box-tool/addon/files/{file-provider,everything-provider}.ts`
- `apps/core-app/src/renderer/src/views/base/settings/AppSettings.vue`
  - File Index warm-up and Windows Everything unavailable CoreBox notices now include item actions that open the relevant settings/diagnostics section.
  - CoreBox action handling supports item-level `navigate` actions without changing default Enter execution semantics.
  - Settings honors `?section=file-index` / `?section=everything`, reveals the File Index section when advanced settings would otherwise hide it, and scrolls to the requested diagnostic block.

### feat(core-app): show CoreBox result source and status signals

- `apps/core-app/src/renderer/src/components/render/{BoxItem.vue,sourceMeta.ts}`
  - CoreBox default result rows now surface compact status signals for failed/degraded/elevated-permission/system results next to the existing source badge.
  - The signal resolver uses existing `source.permission`, `meta.security.permissions`, and provider `meta.extension` status/reason fields, avoiding new TuffItem protocol fields.
  - Added focused renderer utility coverage for source label fallback and failed/degraded/permission/system signal mapping.

### fix(nexus): prevent dashboard asset icon dark-mode filter leak

- `apps/nexus/app/components/dashboard/DashboardAssetIcon.vue`
  - Replaced the global `.dark` scoped selector used for monochrome asset icon inversion with a component-local dark-mode class derived from Nuxt Color Mode.
  - Prevented the assets dashboard CSS chunk from emitting a global `.dark { filter: brightness(0) invert(1) }` rule that inverted the whole dark dashboard page into a washed-out light surface.
  - Kept the original behavior of brightening dark monochrome plugin icons in dark mode without affecting the document-level theme class.

## 2026-05-16

### ref(core-app): extract PreviewSDK kernel and dynamic execution inventory

- `packages/utils/core-box/preview/**`
- `apps/core-app/src/main/modules/box-tool/addon/preview/**`
- `apps/core-app/src/main/modules/calculation/unit-converter.ts`
  - Added the minimal PreviewSDK kernel under `packages/utils/core-box/preview` with ability registration, priority matching, abort-aware resolve, pure `PreviewAbilityResult` / `PreviewCardPayload` output, and per-ability safety metadata.
  - Migrated BasicExpression, AdvancedExpression, Percentage, TextStats, Color, ScientificConstants, UnitConversion, and TimeDelta into the SDK while keeping CoreApp responsible for CoreBox item rendering, clipboard write, and preview history persistence.
  - Replaced BasicExpression `new Function` evaluation with a small arithmetic parser and unified preview unit conversion with the calculation module through a static conversion core.
  - Added preview ability inventory and dynamic execution inventory, explicitly keeping Currency as a CoreApp adapter and Widget runtime sandbox outside the PreviewSDK first batch.
  - Added focused PreviewSDK and CoreApp preview adapter tests.

### perf(nexus): lazy Intelligence admin and trim duplicate Content SQL dumps

- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAdminPanel.vue`
- `apps/nexus/build/trim-content-assets.mjs`
- `apps/nexus/build/check-worker-bundle.mjs`
  - Converted the 3000-line Intelligence admin page into a lightweight ClientOnly lazy shell while keeping the existing heavy panel implementation intact in a dashboard component.
  - Extended Content asset trimming to remove root `dump.*.sql` duplicates after verifying they match the canonical `__nuxt_content/*/sql_dump.txt` files byte-for-byte.
  - Analyzer now fails if duplicate root SQL dumps or duplicate sqlite wasm assets return to `dist`.
  - Clean pre-SQL-trim build after the Intelligence lazy split measured about 24.06 MiB total dist, 7.76 MiB Worker executable JS, and 1.84 MiB Worker gzip; SQL dump trim removes another projected 749.3 KiB from dist when the tree is otherwise build-clean.

### fix(core-app): trace account login state and gate publisher tab

- `apps/core-app/src/main/modules/auth/index.ts`
- `apps/core-app/src/renderer/src/views/base/Store.vue`
- `apps/core-app/src/renderer/src/components/store/StoreHeader.vue`
- `apps/nexus/server/utils/auth.ts`
  - Added safe main-process auth diagnostics for token load/persist state, browser device-login start/poll, remote `/api/v1/auth/me` profile fetch, auth state transitions, and Nexus proxy request status without logging token values.
  - Kept account/Nexus requests behind the main-process `AuthEvents.nexus.*` proxy; renderer continues to trigger only transport events and no longer exposes the publisher tab when no signed-in account is available.
  - If auth state changes while `/store/publisher` is active, the store view now falls back to the public marketplace tab instead of showing `NOT_AUTHENTICATED` inside publisher management.
  - Nexus verified-email API guards now accept app tokens through the shared auth fallback, so desktop app tokens can access credits endpoints after `/api/v1/auth/me` succeeds.
  - Desktop Nexus proxy now preserves the signed-in account on ordinary business-endpoint 401 responses; only explicit auth-profile contexts can clear the global auth state.
  - Settings account sign-in now opens a dedicated progress dialog for preparing, waiting-for-browser, success, and failure states, while keeping the account card itself compact.
  - Default sync is now gated behind Advanced Settings, matching other account/runtime switches that should not be visible in the simplified settings view.

### fix(plugin): require DeepL API key before save/test

- `plugins/touch-translation/src/components/ProviderConfigModal.vue`
  - DeepL provider configuration now treats `apiKey` as a required field instead of referring to a nonexistent mock mode.
  - Save and connection-test paths share the same required-field validation, preventing an empty DeepL key from being persisted when the user skips the test action.

### perf(nexus): dedupe Content sqlite assets and lazy admin route

- `apps/nexus/build/trim-content-assets.mjs`
- `apps/nexus/build/check-worker-bundle.mjs`
- `apps/nexus/package.json`
- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue`
- `apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue`
  - Added a Nexus post-build content asset trim step that rewrites the sqlite worker to use the canonical sqlite wasm and removes the duplicate hashed wasm copy emitted by Nuxt Content.
  - Extended the bundle analyzer to fail if the duplicate `sqlite3-*.wasm` asset returns to the Pages dist output.
  - Converted the Provider Registry admin page into a lightweight ClientOnly shell and lazy-loaded the heavy admin panel component to reduce dashboard/admin route coupling.
  - Current local build output drops to about 24.48 MiB total dist, with Worker executable JS at about 8.05 MiB and Worker gzip at about 1.88 MiB.

### test(nexus): restore full Nexus test pass

- `apps/nexus/vitest.config.ts`
- `apps/nexus/server/utils/__tests__/*`
  - Added the `~` Vitest alias for app imports used by OAuth context tests.
  - Updated exchange-rate, exchange-history, and Turnstile tests to mock the current SDK/network and credit-store boundaries.
  - `pnpm -C "apps/nexus" run test` now passes locally.

### fix(core-app): surface CoreBox search degraded reasons

- `apps/core-app/src/renderer/src/components/render/BoxItem.vue`
  - CoreBox default result rows now render `notification` items as compact warning notices with a dedicated icon, source/accessory label, and the backend-provided `description` reason.
  - Windows Everything unavailable and FileProvider startup-degraded notices now show the user-facing cause directly in the result list instead of hiding it behind a generic subtitle.
  - Normal search/app/plugin/file rows keep the existing layout and source badge behavior.

### fix(core-app): make browser login recovery visible in settings

- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Settings account section now shows a browser-login pending state with remaining timeout instead of only a generic disabled login button.
  - Added explicit "reopen" and "cancel sign-in" actions so users can recover when the browser tab was blocked, closed, or the protocol handoff did not return.
  - Browser-login cancellation now also clears the countdown interval before resolving the pending login attempt.

### feat(core-app): clarify Workflow Review Queue state

- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Workflow Review Queue now shows a compact status summary for pending, copied, clipboard-replaced, and failed AI outputs.
  - Review item badges use localized state labels instead of raw persisted status values.
  - This keeps the existing copy / replace clipboard / dismiss behavior while making the AI output review loop easier to scan.

### feat(core-app): tighten OmniPanel AI preview workflow

- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionItem.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.ts`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - OmniPanel AI result preview now surfaces a compact input summary, state pill, capability/provider/model/latency metadata, and trace id in the result panel.
  - OmniPanel action tiles now show source and unavailable reason directly, so disabled plugin/capability actions explain why they cannot run.
  - Copying a result clears a pending clipboard-replace confirmation so the preview does not leave stale destructive state behind.
  - Added focused coverage for compact input preview generation used by the AI result panel.

### feat(core-app): surface startup health in settings

- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - About settings now show a compact startup health summary using the existing analytics startup snapshot and startup bridge timing.
  - The summary exposes total, main-process, renderer, module-count, and rating in user-facing language before users open the detailed analytics rows.
  - This is diagnostic visibility only; it does not replace the required real-device cold/hot startup benchmark evidence for the release gate.

### docs(nexus): define Intelligence provider table retirement phases

- `docs/plan-prd/04-implementation/NexusIntelligenceProviderRetirement-2026-05-16.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
  - Added the concrete retirement plan for legacy `intelligence_providers`, covering baseline inventory, mirror migration, registry-primary reads, legacy write freeze, final table retirement, and rollback paths.
  - Provider migration results now expose `readyForRegistryPrimaryReads` and machine-readable `blockers`, so the dashboard/release evidence can distinguish dry-run planning from an executed migration that is safe to promote.
  - Anchored the plan to existing migration API, Provider Registry bridge, secure-store `authRef`, `provider_usage_ledger`, and `provider_health_checks` evidence instead of adding new providers first.
  - TODO and Provider Scene PRD now point to Phase 0/1 evidence collection before registry-primary reads and advanced routing work.

### feat(plugin): surface CoreBox AI Ask runtime metadata

- `plugins/touch-intelligence/index.js`
- `packages/test/src/plugins/intelligence.test.ts`
  - CoreBox AI Ask result rows now expose provider, model, trace id, latency, capability, input kind, and handoff session metadata under `meta.intelligence`.
  - Ready/error/pending rows now use CoreBox `description` and `accessory` fields for scan-friendly state, instead of relying only on a long subtitle string.
  - Error rows keep retry behavior while carrying `errorCode` and `errorMessage` in both payload and metadata for follow-up diagnostics.

### feat(core-app): surface Workflow Use Model runtime summary

- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Workflow runtime step cards now summarize Use Model capability, provider, model, latency, token count, trace id, and error code from the actual run step output/metadata.
  - The right-side workflow workbench can now show whether a model step used `text.chat`, `text.summarize`, or another stable capability without forcing users to inspect raw JSON first.
  - Added focused hook coverage for extracting model runtime metadata used by the UI summary.

### test(core-app): capture startup smoke benchmark evidence

- `docs/engineering/reports/startup-dev-runs-2026-05-16/*`
- `docs/plan-prd/TODO.md`
  - Captured 10 local dev startup benchmark runs with `TUFF_STARTUP_REPORT_DATE="2026-05-16" pnpm -C "apps/core-app" exec node "scripts/startup-benchmark-dev.mjs" --mode run --runs 10 --timeoutMs 180000 --continueOnFail`.
  - The dev startup sample passed 10/10 runs with Startup health P50 509ms, P95 890ms, 0 WARN, 0 ERROR, no blocking issues, and the benchmark script's final gate passing.
  - Kept the P1 startup item open because this evidence still does not cover packaged cold/hot startup, renderer ready, StartupAnalytics total time, UI screenshot evidence, or WAL/health long-tail checks.

### docs(governance): refresh compatibility deep audit

- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-audit-2026-05-16.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
  - 新增 2026-05-16 live-tree 深度审计：当前未发现新的 P0 fixed fake-success、mock 成功或平台能力伪装全支持。
  - 将 `2.4.11` 下一步聚焦到插件 shell capability、动态执行边界、secret backend、runtime console 与 SRP 小切片。
  - 明确算式 evaluator、单位公式 evaluator 与 widget runtime sandbox 属于受控动态执行边界，需要审计/替换/回归计划，而不是泛化 placeholder 问题。

### docs(ai): split 2.5.x local knowledge and ASR roadmaps

- `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md`
- `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md`
- `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
  - 将 2.5.x AI 后续路线拆成三条独立版本线：2.5.3 本地知识检索与 Context Builder、2.5.5 本地文本模型 runtime、2.5.8 ASR Provider Runtime。
  - 2.5.3 锁定 SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项，MVP 不引入独立向量数据库服务。
  - 2.5.5 明确“不强依赖 Ollama，优先内置 GGUF / llama.cpp runtime”；Ollama 仅作为可选兼容后端，模型权重按需下载到用户数据目录。
  - 2.5.8 锁定本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto` 策略；TTS、语音唤醒与 streaming 转写不进入 Stable。

### ref(core-app): remove main runtime `$app` global access

- `apps/core-app/src/main/core/main-runtime-state.ts`
- `apps/core-app/src/main/core/index.ts`
- `apps/core-app/src/main/core/precore.ts`
- `apps/core-app/src/main/modules/**`
  - 新增显式 TouchApp runtime holder，替代主进程 `$app` / `globalThis.$app` 访问。
  - 模块初始化阶段优先复用 `resolveMainRuntime(ctx, ...)`，跨生命周期场景缓存 transport 或 touchApp context。
  - 删除 `electron-env.d.ts` 中 `$app` 全局声明，保持 lint hard-cut 与类型边界一致。

### chore(nexus): move API tests out of route tree

- `apps/nexus/test/api/dashboard/provider-registry/**`
- `apps/nexus/test/api/{app-auth,auth,oauth,subscription}/**`
- `apps/nexus/test/api/{admin,dashboard,sync,v1}/**`
- `apps/nexus/server/api/**/__tests__/**`
- `apps/nexus/server/api/**/*.api.test.ts`
- `apps/nexus/server/api/dashboard/provider-registry/*.api.test.ts`
- `apps/nexus/build/check-server-api-route-tree.mjs`
- `apps/nexus/vitest.config.ts`
  - Moved provider-registry, app-auth, auth, OAuth, subscription, admin release-evidence, dashboard intelligence/OAuth, sync, and v1 API tests from Nitro's `server/api` route tree into the dedicated `test/api` tree.
  - Extended Vitest discovery to include `test/**/*.test.ts` so migrated API tests keep running outside production route directories.
  - Added a route-tree guard that fails when any test/dev file is introduced under `server/api`, keeping the production API route tree clean.

### perf(nexus): keep Content runtime assets out of PWA precache

- `apps/nexus/app/config/pwa.ts`
- `apps/nexus/build/check-worker-bundle.mjs`
  - Removed `.txt` from Nexus Workbox precache glob and explicitly ignored Nuxt Content SQL dumps, sqlite wasm files, and sqlite worker assets so public docs runtime data is not cached during PWA install/update.
  - Extended the Worker bundle analyzer to fail when oversized Content runtime assets re-enter the generated `sw.js` precache manifest.
  - Verified that disabling Nuxt Content `nativeSqlite` is not currently viable because Nuxt Content falls back to requiring `better-sqlite3` during build.

### perf(nexus): trim public site assets and production routes

- `apps/nexus/app/pages/test/**`
- `apps/nexus/public/shots/{SearchApp.gif,PluginTranslate.gif}`
- `apps/nexus/app/images/assets/**`
- `apps/nexus/app/components/tuff/landing/**`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/build/nexus-prerender-routes.ts`
- `apps/nexus/build/*test.ts`
  - Removed Nexus production-only test pages, Finder metadata files, and retired landing GIF assets that already have MP4 replacements.
  - Replaced the largest public landing PNG imports for plugin cards and the Intelligence header with compressed JPG derivatives while keeping the original PNG sources available for rollback.
  - Removed global highlight.js CDN injection from the app head; docs code rendering continues to load highlight.js only when code blocks need it.
  - Expanded public prerender coverage for low-risk static shells and public pages such as `/updates`, `/store`, `/sign-in`, `/forgot-password`, `/verify-waiting`, and `/device-auth`.

### fix(nexus): stop OAuth callback from spinning forever

- `apps/nexus/app/composables/useSignIn.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
  - Nexus sign-in OAuth callback now performs a final session refresh after the callback query is detected.
  - If the callback returns without an authenticated session, the page clears OAuth intermediate state and shows a retryable error instead of staying on the blocking “processing sign-in” spinner.
  - Added localized fallback copy for the missing-session case to make provider/cookie/session failures visible to users.

## 2026-05-15

### fix(core-app): reuse device auth for browser login

- `apps/core-app/src/main/modules/auth/index.ts`
  - Desktop App browser login now starts the existing Nexus device authorization flow with `clientType: 'app'` and polls `/api/app-auth/device/poll` in the main process for the resulting `appToken`.
  - The browser is only responsible for sign-in and approval on `/device-auth`; the App no longer depends on `tuff://auth/callback` for new login attempts, while the old callback path remains available for compatibility.
  - Superseded, failed, expired, cancelled, or closed browser authorization attempts are logged and the pending device auth request is aborted when possible.

### perf(nexus): remove retired watermark runtime

- `apps/nexus/app/components/watermark/**`
- `apps/nexus/app/composables/useWatermark*.ts`
- `apps/nexus/server/api/watermark/**`
- `apps/nexus/server/utils/watermark*.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/package.json`
  - Removed the retired Nexus watermark experiment from the app shell, dashboard layout, admin navigation, route gates, server API routes, and Worker utilities.
  - Dropped the watermark-only `qrcode` and `jsqr` dependencies and removed the stale `NUXT_PUBLIC_WATERMARK_ENABLED` runtime switch.
  - Kept the separate risk-control feature gate intact while reducing default client and Worker surface area.

### perf(nexus): tighten Pages media and bundle budgets

- `apps/nexus/public/shots/SearchFileImmediately.mp4`
- `apps/nexus/build/check-worker-bundle.mjs`
- `apps/nexus/build/check-worker-bundle.test.ts`
- `apps/nexus/nuxt.config.ts`
  - Re-encoded the landing showcase file-search video as a silent 1280px H.264 asset, reducing it from about 19 MiB to about 659 KiB while keeping the existing `/shots/SearchFileImmediately.mp4` contract.
  - Extended the existing Worker bundle analyzer into a Pages dist budget guard covering total dist size, largest static file, Worker executable JS, and gzip Worker size.
  - Added focused tests to keep landing showcase MP4 assets below 2 MiB and to assert legacy GIF assets stay excluded from Cloudflare Pages output.
  - Current local build output drops from about 54 MiB to about 38 MiB on disk, with `dist/shots` reduced to about 1.7 MiB.

### fix(nexus): keep app auth callback page alive for protocol handoff

- `apps/nexus/app/pages/auth/app-callback.vue`
  - Desktop app auth callback no longer closes the browser tab immediately on `blur` after firing the `tuff://auth/callback` protocol URL, avoiding premature close before the OS/app consumes the callback.
  - The callback page now keeps a success/fallback state visible, delays auto-close, and exposes manual token copy/close actions for recovery.

### fix(nexus): prevent dashboard search overlay from mounting by default

- `apps/nexus/app/app.vue`
- `apps/nexus/app/components/search/GlobalSearch.vue`
- `apps/nexus/app/components/HeaderControls.vue`
- `apps/nexus/app/layouts/dashboard.vue`
  - Global search command palette now mounts only while open and closes on route changes, avoiding a stale command palette overlay washing out dashboard pages such as Assets.
  - Search keyboard shortcuts are handled at the app shell level so lazy mounting still supports Cmd/Ctrl+K and `/` without keeping the palette component alive on every dashboard page.
  - Dashboard visible watermark opacity/z-index is reduced to avoid sitting above page content.

### perf(nexus): reduce auth shell critical client work

- `apps/nexus/app/app.vue`
- `apps/nexus/app/components/auth/AuthVisualShell.vue`
- `apps/nexus/app/pages/sign-in/index.vue`
  - Nexus auth shell routes no longer eagerly mount global search or watermark risk clients, reducing sign-in / auth callback critical hydration work.
  - Sign-in visual aurora now mounts after client idle/short delay via lazy component, keeping the static gradient fallback on the first interactive path.
  - Normal `/sign-in` no longer shows a hydration-only full-page blocking overlay; the blocking copy is limited to active OAuth verification.

### fix(nexus): harden production auth origin resolution

- `apps/nexus/server/api/auth/[...].ts`
- `apps/nexus/server/utils/authOrigin.ts`
- `apps/nexus/nuxt.config.ts`
  - Nexus AuthJS 现在会把有效 `AUTH_ORIGIN` 桥接为 `NEXTAUTH_URL`，避免生产环境回退到 `localhost:3000` 并写入错误 `next-auth.callback-url` cookie。
  - 当生产环境缺失 canonical origin 或误配为 localhost/127.0.0.1 时，AuthJS 改为通过 `AUTH_TRUST_HOST` 信任 Cloudflare forwarded host 兜底，避免退出/刷新后 session 与 profile 状态分裂。
  - Sidebase auth 配置显式声明 `/api/auth`、`authjs` 与 `trustHost`，并补充 origin 归一化单测。

### fix(core-app): use notification test button for macOS unverifiable permission

- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - macOS 通知权限仍保留 `unverifiable` 状态口径，但操作按钮从“前往系统设置”调整为“测试通知”，直接发送一条系统通知帮助用户验证授权效果。
  - Windows/Linux 仍沿用打开系统设置入口；补充测试通知相关中英文文案。

### fix(core-app): reset browser login pending state and gate dev runtime server switch

- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
  - 修复设置页账户区在浏览器已完成登录但 App 未收到完整成功回调/收到未登录状态广播后，`isLoggingIn` 未及时复位导致按钮长期显示“登录中...”的问题。
  - 登录状态广播现在会兜底结束 pending browser login；已登录时恢复账户展示，未登录时恢复按钮可重试。
  - 浏览器登录增加 2 分钟可见超时与按钮倒计时，超时后自动恢复登录按钮，避免 dev protocol callback 丢失时长期卡住。
  - “运行时 API 服务器”切换项明确限制为 dev 环境未登录时显示，避免 production 暴露开发调试入口。

### docs(governance): refresh compatibility audit and live SoT wording

- `docs/plan-prd/report/cross-platform-compat-placeholder-summary-2026-05-15.md`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
  - 新增 2026-05-15 兼容性、占位实现与治理口径总结：当前未发现新的 P0 级固定假值成功或平台能力伪装全支持，主要风险仍是 Windows/Nexus evidence、AI 占位退场、secret backend、插件 shell capability、动态执行边界与 SRP 大文件拆分。
  - 活跃入口基线同步到 `2.4.10-beta.25`，并明确旧 `compatibility-debt-registry.csv`、`legacy-boundary-allowlist.json`、`large-file-boundary-allowlist.json` 与 `docs:guard/legacy:guard/compat:registry:guard` 已不在当前 live tree，不能继续作为当前事实来源。
  - 下一步收口口径改为 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单，避免继续引用已经退场的 guard/清册。

### fix(nexus): stabilize component docs demo loading

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/components/content/TuffDemoWrapper.vue`
- `apps/nexus/app/components/content/TuffDemoClientRenderer.client.vue`
- `apps/nexus/app/components/content/demo-lazy.ts`
- `apps/nexus/app/components/content/demo-loader.ts`
- `apps/nexus/app/components/content/demo-client-boundary.test.ts`
  - 将组件文档 demo 与 demo registry 从 Nuxt 自动组件注册中硬过滤，避免 UI 文档切换时把数百个 demo 组件注入客户端初始化边界。
  - Demo renderer 仅在 wrapper 进入视口并处于浏览器 idle/短延迟后挂载，registry 只在客户端 active 后加载，减轻 docs 路由 hydration 与切换时的主线程压力。
  - 补充 focused 回归，锁定 SSR wrapper 不静态引入 demo registry、renderer 仍在 active state 后加载，以及自动注册过滤规则继续存在。

### feat(core-app): expose local AI tools and skills providers

- `apps/core-app/src/main/modules/ai/intelligence-local-environment.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `apps/core-app/src/renderer/src/components/intelligence/IntelligenceLocalSkills.vue`
  - Intelligence 新增只读本地环境扫描：识别 Codex / Claude CLI、Codex 配置键路径、项目 `AGENTS.md` / `CLAUDE.md` / `.codex` / `.claude` 指令入口，以及本地 `SKILL.md` provider 元数据。
  - 新增 typed `intelligence:api:local-environment` 与 SDK `getLocalEnvironment()`，首版只返回工具、配置、skills provider 摘要；敏感配置仅暴露 key path，不返回密钥值，不执行任何 skill。
  - Intelligence 首页新增“本地 Skills Provider”只读区块，用于继续定调 providers / scenes / skills 管理；高风险 skills 仅展示为 gated，后续再接权限与场景门控。

### feat(intelligence): persist workflow review state and model contracts

- `packages/tuff-intelligence/src/types/intelligence.ts`
- `packages/utils/types/intelligence.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `apps/core-app/src/main/modules/ai/intelligence-deepagent-orchestration.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
  - Workflow Review Queue 的 copy / replace clipboard / dismiss / failed 状态现在通过 typed `intelligence:workflow:review:update` 写回 run metadata，历史 run 重新 inspect 时可恢复审阅状态，不再只依赖页面临时 ref。
  - `Use Model` 步骤新增 `inputSources` 与 `output` 合同，支持 `workflow.input`、`clipboardRef`、`ocrRef`、`fileTextRef`、`previousStep` 等输入引用描述，并把输出格式 / schema / reviewPolicy / riskLevel 固化到 step metadata 的 `modelContract`。
  - Model step prompt 构建会消费输入引用与输出合同，同时继续只允许 Stable capability；不新增 DB 列、不保存完整 prompt / response 到普通 metadata。

### feat(nexus): reshape Intelligence admin around Providers and Scenes

- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/server/api/dashboard/intelligence/providers/[id]/probe-stream.post.ts`
- `apps/nexus/server/utils/intelligenceProviderRegistryBridge.ts`
- `apps/nexus/server/utils/intelligenceProviderRegistryBridge.test.ts`
- `apps/nexus/i18n/locales/{zh,en}.ts`
  - Nexus Intelligence 管理页从单纯 provider 列表调整为 `Providers + Models` 与 `Scenes` 配置：provider 负责暴露模型，scene 负责绑定 provider/model、策略、fallback 与启停状态。
  - Scene 配置复用 Provider Registry / Scene Registry，不新增独立存储；仅展示/编辑 `routingShape=providers-scenes` 的 Intelligence scenes，并限制 binding provider 必须已迁移且声明当前 scene capability。
  - Binding metadata 保留 `source=intelligence`、`intelligenceProviderId`、`model` 与排序信息；provider mirror 同步会保留已有 registry metadata，并补测试覆盖。
  - Provider 测试新增 SSE 流式 probe 入口，前端实时展示模型增量输出并支持停止；流式不可用时仍回退到原 JSON probe。
  - Provider 启停、scene/fallback、全局 audit/cache 等二态控件切到 Tuffex switch/status 组件，收敛管理页交互一致性。

### feat(nexus): link AI invoke billing and audit ledgers

- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/creditsStore.ts`
- `apps/nexus/server/utils/providerUsageLedgerStore.ts`
- `apps/nexus/server/api/dashboard/intelligence/invoke-audits.get.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.invoke.test.ts`
  - `/api/v1/intelligence/invoke` 成功调用后会把安全审计字段写入返回 metadata：source/caller/session/workflow/run/step、credit ledger id、charged credits 与 provider usage ledger id。
  - Nexus AI invoke 现在同步写入 `provider_usage_ledger`，使用固定 `sceneId=nexus.intelligence.invoke` 与 trace 派生 runId，便于和 `credit_ledger.metadata.traceId` 对账。
  - 新增 Dashboard 只读 `invoke-audits` 查询入口，支持按 trace/provider/capability/status/mode 过滤 AI invoke provider usage，并按 trace 精确关联 credit ledger。
  - 计费与 provider usage ledger 只记录 capability/provider/model/token/trace/workflow 等安全元数据，不落 prompt、输入文本或模型输出明文；`totalTokens=0` 不扣 credits 但仍保留非 billable usage ledger。

### feat(intelligence): seed P0 workflow templates

- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts`
- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.test.ts`
- `docs/plan-prd/TODO.md`
  - Workflow 内置模板从单个“整理近期剪贴板”扩展为 3 个 P0 模板：剪贴板整理、会议纪要 / 摘要、文本批处理。
  - 新增模板均使用 `model` step 与 Stable capability：会议纪要走 `text.summarize`，文本批处理走 `text.chat`，输出继续进入现有运行结果与页面 Review Queue。
  - 内置模板统一写入 `builtin/template/category/templateVersion` metadata；启动 seed 只自动覆盖同 ID 且 `metadata.builtin === true` 的模板，保留用户另存副本。

### perf(nexus): slim prerender docs and silent showcase media

- `apps/nexus/build/docs-prerender-routes.ts`
- `apps/nexus/build/docs-prerender-routes.test.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/app/components/tuff/landing/showcase/TuffShowcaseDisplayer.vue`
- `apps/nexus/public/shots/SearchApp.mp4`
- `apps/nexus/public/shots/PluginTranslate.mp4`
  - Nexus docs prerender 从全量扫描 `content/docs` 收敛为稳定入口 allowlist，保留 `/docs`、guide/start、preview、dev index 与 docs API 静态输出；组件/API 等长尾文档继续走运行时 SSR，降低 Cloudflare Pages 上传包与重复 HTML。
  - 首页 showcase 的两个 GIF 演示迁移为无音轨 MP4，并保持前端 `muted` / `loop` / `playsinline` 播放；Nitro public copy 排除 legacy GIF，避免大 GIF 继续进入发布产物。

### fix(nexus): stabilize component docs route switches

- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/components/content/demos/GlassSurfaceGlassSurface2Demo.vue`
- `packages/tuffex/packages/components/src/glass-surface/src/TxGlassSurface.vue`
  - Docs 内容页取消整页 `out-in` page/state transition，并在文档切换与卸载时清理手动渲染的 code header VNode，避免 Vue route unmount 过程中出现 `parentNode` 为空导致页面卡死。
  - `TxGlassSurface` 的 `ResizeObserver` / `setTimeout` 更新增加卸载保护，组件离开页面后不再继续写 SVG filter DOM。
  - 修正 GlassSurface 参数调节 demo 的初始值，避免生成 demo 把数字、channel 列表和 blend mode 错误初始化为空字符串或布尔值。

### fix(ci): prevent beta release dependency install hang

- `.github/workflows/build-and-release.yml`
  - 移除 tag 发布矩阵构建中 `pnpm approve-builds --all` 的非交互调用，避免依赖安装已完成后 workflow 长时间停留在 `Install Dependencies`。
  - `v2.4.10-beta.24` 发布流水线因此取消，后续使用 `v2.4.10-beta.25` 重新触发 beta 发布验证。

### ref(nexus): slim static docs and Worker bundle surface

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/build/nexus-prerender-routes.ts`
- `apps/nexus/build/check-worker-bundle.mjs`
- `apps/nexus/app/plugins/tuffex.ts`
- `apps/nexus/app/components/content/TuffDemoWrapper.vue`
- `apps/nexus/app/components/content/TuffDemoClientRenderer.client.vue`
- `packages/tuff-intelligence/src/light.ts`
- `packages/tuff-intelligence/package.json`
  - Nexus prerender 清单抽成可测试 helper，覆盖稳定公开页、文档页与 docs API；动态市场/发布/登录/控制台页面继续保留运行时渲染，避免固化用户态或 D1 数据。
  - Tuffex 全局组件注册从顶层整包静态 import 改为组件子入口 async component 注册，避免文档与组件文档首屏初始化时全量拉入组件实现。
  - 组件文档 demo registry 移入 `.client.vue` 渲染器，`TuffDemoWrapper` 在 SSR 侧仅保留文档外壳与 `ClientOnly` fallback；避免 300+ demo dynamic imports 被编进 Cloudflare Pages Worker。
  - `@talex-touch/tuff-intelligence/light` 作为 Nexus contract 轻入口，仅导出 enum/types/sync payload；Nexus 侧 import 迁移到轻入口，避免误带 runtime / LangChain barrel。
  - 新增 `pnpm -C "apps/nexus" run build:analyze-worker`，用于构建后统计 `_worker.js` 可执行 JS、Top chunks，校验关键静态路由已排除出 Pages Worker，并阻断具体 demo implementation chunk 回流 Worker。

### fix(core-app): refine Intelligence capability detail layout

- `apps/core-app/src/renderer/src/components/intelligence/capabilities/CapabilityHeader.vue`
- `apps/core-app/src/renderer/src/components/intelligence/capabilities/CapabilityOverview.vue`
- `apps/core-app/src/renderer/src/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceCapabilitiesPage.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - 智能能力详情头部标题压缩为 16px，说明文字限制为两行，能力列表说明支持两行展示并同步放大卡片高度。
  - 统计卡片调整为单行三列紧凑布局，避免“启用渠道/总绑定数/配置模型”换行。
  - 测试能力入口移动到详情头部右侧，点击后通过 Drawer 承载原测试表单与结果；底部生效提示移动到详情头部提示区。
  - 模型优先级与默认提示词合并为“能力配置”区块，两个配置项均通过点击打开 Drawer。
  - 补齐能力测试与渠道选择 i18n 文案，避免按钮展示 `settings.intelligence.*` key；未启用渠道时点击“管理模型”会先启用当前渠道并打开模型配置。

### fix(core-app): improve main window search recall

- `apps/core-app/src/main/modules/box-tool/addon/system/main-window-provider.ts`
  - 扩展主窗口系统动作召回词，补齐 `show/open/display/focus` 与 `显示/打开/唤起/主窗口` 等中英文别名，确保搜索 `show` 或 `主窗口` 均可命中主窗口动作。
  - 中文或别名命中时映射到标题中的 `Show` / `Main Window` 范围，恢复 CoreBox 结果标题高亮反馈。

### fix(core-app): refine Intelligence prompt manager page

- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePromptsPage.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - 梳理智能提示词页面右侧详情区：统一头部操作按钮、内容区留白、折叠区块间距和表单输入态，降低页面拥挤感。
  - 补齐提示词元信息、正文说明、操作区、复制失败与测试能力等 i18n 文案，避免 UI 直接显示 key。
  - 默认收起低频模板操作区，保留基础信息与正文的优先阅读层级。

### fix(core-app): align Intelligence provider action menu

- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue`
  - 官方渠道继续隐藏删除操作；非官方渠道删除项前增加 divider，并保持删除项 danger 红色样式。
  - 统一更多菜单项图标与文字的垂直居中，避免菜单内容视觉偏移。

### fix(core-app): refine Intelligence channel management

- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue`
- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceInfo.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceChannelsPage.vue`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
  - Nexus 官方通道使用 Tuff Logo，隐藏官方通道 API/模型/速率限制编辑，仅保留优先级设置。
  - 右上操作菜单补充复制 ID、复制配置、分享配置、导出配置、复制渠道、修改基本信息，并禁止删除官方通道；配置复制/分享/导出会排除密钥字段。
  - 修复浏览器登录回调后渲染端账户状态未及时刷新；登录凭证保护默认开启且仅在高级设置中提供关闭入口。
  - 智能首页移除 AI 积分区块，能力配置商统计摘要调整为“已绑定：x/y”格式。

### docs: align FileProvider quality status

- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将 FileProvider 口径从 `0 字节/typecheck:node 失败` 更新为已恢复完整 `fileProvider` 导出且 CoreApp `typecheck:node` 已通过。
  - 保留 `quality:release` 受既有 CoreApp lint debt 阻断、需记录最近路径替代验证的质量约束。

## 2026-05-14

### feat(nexus): streamline admin management surfaces

- `apps/nexus/app/pages/dashboard/admin/users.vue`
- `apps/nexus/server/api/admin/users/[id]/profile.patch.ts`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/components/dashboard/admin/AccountTabs.vue`
- `apps/nexus/app/components/dashboard/admin/CommentTabs.vue`
- `apps/nexus/app/pages/dashboard/admin/subscriptions.vue`
- `apps/nexus/app/pages/dashboard/admin/reviews.vue`
- `apps/nexus/app/pages/dashboard/admin/doc-comments.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
  - Nexus 管理员导航收敛：Intelligence Lab 与 AI 积分并入 Intelligence 分组入口，用户管理/订阅管理合并为账号管理 tabs，评论审核/文档评论合并为评论管理 tabs。
  - 用户管理表格压缩为用户、权限状态、创建时间、编辑操作，避免长邮箱撑宽；行内权限/状态操作统一收进编辑 Drawer。
  - 新增管理员用户资料编辑接口，Drawer 可编辑显示名、头像、语言、角色、状态，并可直接授予/续期订阅。

### fix(ai): align tuff-intelligence transport events with TuffTransport

- `packages/tuff-intelligence/src/transport/event/builder.ts`
- `packages/tuff-intelligence/src/transport/types.ts`
- `packages/tuff-intelligence/src/transport/event/builder.test.ts`
- `packages/utils/transport/sdk/renderer-transport.ts`
  - 修复 OmniPanel 调用 AI client 时，`@talex-touch/tuff-intelligence` 自有 event builder 只生成 `{ toEventName }`、缺少 `__brand: 'TuffEvent'` 等运行时字段，导致 `TuffRendererTransport.send` 拒绝 `intelligence:api:invoke` 的问题。
  - Renderer transport 在非法 event 场景新增结构化诊断输出，包含 event 摘要、候选 eventName、payload/options 摘要与调用栈，便于后续定位 SDK/事件对象不兼容。

### feat(nexus): allow guarded CLI cross-IP authorization

- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/dashboard/security-settings.get.ts`
- `apps/nexus/server/api/dashboard/security-settings.patch.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/app/pages/dashboard/privacy.vue`
- `apps/nexus/app/pages/device-auth.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
  - 新增账号级安全设置 `allowCliIpMismatch`，默认关闭；Dashboard 隐私/安全设置页提供“允许 CLI 跨 IP 授权”开关，开启前二次确认并明确警告不可随意开启。
  - CLI 设备授权在请求 IP 与浏览器确认 IP 不一致时，默认仍拒绝；仅当当前账号开启该设置且请求来源为 `clientType=cli` 时放行，并在授权页展示高风险警告。
  - App / External 授权不受该开关影响，仍保持 IP 不一致拒绝策略。
  - 验证：`pnpm -C "apps/nexus" run typecheck` 通过（仅保留既有 Nuxt 自动导入重复 warning）。

### fix(nexus): harden docs props table prerender

- `apps/nexus/app/components/content/TuffPropsTable.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - `TuffPropsTable` 不再假设 `type/default` 一定是字符串，复制与可复制判定前会统一归一化 boolean/number/string，避免 docs prerender 在 `/docs/dev/components/floating` 遇到 boolean default 时因 `.trim()` 崩溃。
  - 目标是恢复 Cloudflare Pages / Nexus build；不改变文档表格数据结构与展示入口。

### fix(intelligence): address tool and handoff review feedback

- `apps/core-app/src/main/modules/ai/agents/tool-registry.ts`
- `packages/tuff-intelligence/src/tools/*`
- `packages/tuff-intelligence/src/registry/skill-registry.ts`
- `plugins/touch-intelligence/index.js`
- `apps/nexus/server/api/docs/sidebar-components.get.ts`
  - CoreApp Tuff tool bridge 改为通过 `ToolKit` 执行，保留 Zod 输入校验与 approval gate；ToolKit 注册重复 id 会拒绝覆盖，approval gate 异常会返回结构化 tool error，capability bridge 不再默认绕过高风险工具审批。
  - SkillRegistry 移除长 query 包含短 candidate 的过宽匹配；`touch-intelligence` handoff session id 加入 sha256 短摘要避免 slug 碰撞，并优先采用更长远端 handoff 历史。
  - Nexus docs sidebar cached handler 移除冗余 `cache-control` 手写 header，继续由 Nitro cache options 生成。

### perf(nexus): prerender docs routes and smooth docs switching

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/build/docs-prerender-routes.ts`
- `apps/nexus/build/docs-prerender-routes.test.ts`
- `apps/nexus/server/api/docs/sidebar-components.get.ts`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/vitest.config.ts`
  - Nexus 构建期扫描 `content/docs/**/*.{md,mdc}` 生成 canonical `/docs/**` 预渲染路由，并将稳定 docs API 纳入 prerender 列表。
  - Docs Sidebar 与 pager 局部启用 NuxtLink prefetch；feedback/comments 延后到内容稳定后客户端挂载，减少切换时重复 DOM 扫描。

### feat(plugin): bridge touch-intelligence to handoff sessions

- `plugins/touch-intelligence/index.js`
- `packages/test/src/plugins/intelligence.test.ts`
- `apps/nexus/content/docs/guide/features/plugins/intelligence.{zh,en}.mdc`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `touch-intelligence` 发送 CoreBox AI Ask 前会确保稳定 `corebox_ai_ask_<featureId>` Intelligence Session，并在成功回答后把最近业务消息写入 `context.conversation` 供后续恢复/接续。
  - `text.chat` / `vision.ocr` 调用 metadata 增加 `sessionId`、`handoffSessionId` 与 `handoffSource=corebox.touch-intelligence`，保留原有审计字段。
  - 已验证：`corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"` 通过。

### feat(intelligence): add native tool kit foundation

- `apps/core-app/src/main/modules/ai/agents/tool-registry.ts`
- `apps/core-app/src/main/modules/ai/agents/tool-registry.test.ts`
- `packages/tuff-intelligence/src/adapters/*`
- `packages/tuff-intelligence/src/runtime/decision-dispatcher.ts`
- `packages/tuff-intelligence/src/tools/*`
- `packages/tuff-intelligence/src/registry/*`
- `packages/tuff-intelligence/README.md`
- `packages/tuff-intelligence/package.json`
  - 新增 Tuff-native Tool Kit 基础层，提供 `defineTuffTool()`、`createToolKit()`、工具 manifest/discovery、LangChain/DeepAgents adapter、approval gate 与 SkillRegistry deterministic resolution。
  - 工具输入/输出使用 Zod runtime schema 校验，并统一返回结构化错误码；`CapabilityRegistry.registerTool()` 支持直接注册 Tuff Tool。
  - 修复 DeepAgent Responses 输入中未授权 system message 进入模型上下文的问题，并补 Core App 旧 AgentTool/TuffTool 双向桥接。
  - 已验证：`packages/tuff-intelligence` vitest/lint/build 与 CoreApp tool-registry targeted test 通过。

### feat(ai): charge Nexus invoke credits and surface usage

- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.invoke.test.ts`
- `apps/nexus/server/api/v1/intelligence/invoke.api.test.ts`
- `apps/core-app/src/renderer/src/modules/nexus/credits-summary*.ts`
- `apps/core-app/src/renderer/src/components/account/CreditsSummaryBlock.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePage.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Nexus `/api/v1/intelligence/invoke` 成功返回模型结果后按 `usage.totalTokens` 扣减 AI credits；provider 调用失败与 `totalTokens <= 0` 不扣 credits。
  - `Team credits exceeded.` / `User credits exceeded.` 映射为 `402 CREDITS_EXCEEDED`，避免落成 500。
  - CoreApp 通过既有登录态代理复用 `/api/credits/summary` 展示个人剩余、已用、总额度与团队池剩余；模型倍率与 dynamic `pricingRef` 留给 Provider Registry Phase 4。

### fix(core-app): restore Windows PowerShell app source scans

- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.test.ts`
- `apps/core-app/scripts/windows-capability-evidence.ts`
  - Windows app scanner and capability evidence scripts now pass PowerShell object-literal scripts with newline separators instead of semicolon-joining `[PSCustomObject]@{ ... }`, preventing parser failures that silently dropped `Get-StartApps`, registry, and Start Menu evidence.
  - Real Windows scan smoke now finds Codex as `shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App` with `launchKind=uwp`; `windows:capability:verify --requireTargets --requireUwp --strict` passes for the Codex target, with only the local `es.exe` Everything warning remaining.
  - Added regression coverage so Windows PowerShell scan scripts do not reintroduce the invalid `@{;` form that previously caused Codex/UWP apps to miss the app index.

### fix(core-app): contain prod feature native crash paths

- `apps/core-app/src/main/modules/plugin/runtime/plugin-require.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/system/active-app.ts`
- `apps/core-app/src/main/modules/database/index.ts`
- `packages/utils/plugin/sdk/system.ts`
- `packages/utils/transport/events/types/app.ts`
  - Plugin runtime now denies direct `electron`, `.node`, `@libsql/*`, `@crosscopy/clipboard`, and `extract-file-icon` imports with `PLUGIN_RUNTIME_DENIED_MODULE`, keeping failures scoped to the plugin/feature.
  - Plugin `dialog`, `openUrl`, and `clipboard` globals remain compatible but now go through narrow main-process wrappers instead of exposing raw Electron objects.
  - `system.getActiveApp` adds `includeIcon`; plugin transport and main channel default it to `false`, so `app.getFileIcon` only runs for explicit icon requests.
  - WAL checkpoint now runs through DB maintenance scheduling and skips when the DB write queue or search-index worker is busy, logging `DB_WAL_CHECKPOINT_SKIPPED_BUSY`.
  - Feature execution, widget registration, plugin lifecycle, and WAL checkpoint paths emit lightweight breadcrumbs without query text, clipboard text, or full file paths.

### ci(quality): scope PR lint to changed files

- `package.json`
- `scripts/run-eslint-changed.mjs`
- `.github/workflows/ci.yml`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `quality:pr` 的 lint 阶段从全仓 `pnpm lint` 调整为 `pnpm lint:changed`，PR CI 中按 base 分支三点 diff 仅 lint PR 修改过的 JS/TS/Vue 文件。
  - PR Quality checkout 改为 `fetch-depth: 0`，避免 shallow checkout 下 changed-file lint 找不到 merge base。
  - `quality:release` 仍保留全仓 lint，不降低正式 release gate。

### feat(ai): add translation TTS beta path

- `apps/core-app/src/main/modules/ai/intelligence-tts-service.ts`
- `packages/utils/plugin/sdk/intelligence.ts`
- `packages/tuff-intelligence/src/types/intelligence.ts`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
  - `audio.tts` 进入 2.5.0 Beta 调用链，新增 typed `ttsSpeak` API，统一封装 TTS invoke、data URL 归一与进程内短期缓存。
  - `touch-translation` 翻译结果新增朗读入口，通过 Intelligence SDK 调用 TTS，保留 trace metadata，插件侧不接触 provider secret。
  - Stable 范围仍只承诺文本 + OCR，TTS 不升级为 2.5.0 Stable blocker。

### docs: refresh compatibility and placeholder follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-followup-2026-05-14.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 新增 2026-05-14 跟进报告，记录 `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 0 字节导致 `typecheck:node` 失败，并将其提升为当前 `2.4.10` 质量 blocker。
  - 更新 CLI/plugin secret 口径：CLI token 已有 POSIX `0700/0600` 权限缓解与 Windows ACL warning，`touch-translation` provider secret 已迁入 `usePluginSecret()`；OS 级 credential backend、secure-store degraded health 与遗留 secret 清理 evidence 仍待闭环。
  - 验证：`pnpm -C "apps/core-app" run typecheck:node` 失败，错误均指向 `file-provider.ts is not a module`；未恢复该文件，避免覆盖并行/既有工作区改动。

### fix(core-app): restore file provider compile boundary

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `docs/plan-prd/TODO.md`
  - 按确认恢复 `file-provider.ts` 到完整 `fileProvider` 导出，解除主进程编译边界的 0 字节阻断。
  - 验证：`pnpm -C "apps/core-app" run typecheck:node` 通过。
  - Windows 真机 evidence、Nexus Release Evidence 与发版前完整质量复核仍按 TODO 保持未处理。

### refactor(transport): continue corebox retained alias migration

- `packages/utils/transport/events/core-box-retained.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/key-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/renderer/src/components/render/CoreBoxRender.vue`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useChannel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/usePreviewHistory.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `packages/utils/plugin/sdk/quick-actions-sdk.ts`
- `docs/plan-prd/TODO.md`
  - CoreBox UI control、UI state/input visibility、beginner shortcut、input focus、ui resume、forward key event、input command、input visibility/value request、input monitoring、clipboard allow、provider management、recommendation、preview history/copy、action panel、MetaOverlay bridge、layout control 与 uiMode enter/exit 小组继续迁入 retained alias registry：`CoreBoxEvents.beginner.*` / `CoreBoxEvents.ui.*` / `CoreBoxEvents.input.*` / `CoreBoxEvents.inputMonitoring.*` / `CoreBoxEvents.clipboard.allow` / `CoreBoxEvents.provider.*` / `CoreBoxEvents.recommendation.*` / `CoreBoxEvents.previewHistory.*` / `CoreBoxEvents.preview.*` / `CoreBoxEvents.actionPanel.*` / `CoreBoxEvents.metaOverlay.*` / `CoreBoxEvents.layout.*` / `CoreBoxEvents.uiMode.*` 默认暴露 canonical `core-box:*:*` typed events。
  - 保留旧 `core-box:*` / `corebox:*` / `meta-overlay:*` / `beginner:shortcut-triggered` wire names 作为 `CoreBoxRetainedEvents.legacy.*` aliases；main IPC/key transport/search recommendation/MetaOverlay bridge/beginner shortcut/input focus/ui resume 双监听或双发，shortcut trigger 与 UI mode exit push 在兼容窗口内双发，renderer 保留 legacy push 双监听。
  - QuickActions/MetaSDK action execute 监听改为 canonical + legacy 双监听，并增加短窗口去重，避免 main 双发期间插件 action 回调重复触发。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-sdk-lifecycle.test.ts" "__tests__/transport-domain-sdks.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:web` 通过（仍输出既有 Tuffex `TouchScroll` dts/Sass/Browserslist 噪声）；`git diff --check` 通过。

### feat(plugin): expose plugin secret storage health

- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/plugin.ts`
- `packages/utils/plugin/sdk/secret.ts`
- `packages/utils/plugin/sdk/types.ts`
- `packages/utils/__tests__/plugin-storage-sdk.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin.test.ts`
- `docs/plan-prd/TODO.md`
  - 新增只读 `PluginEvents.storage.getSecretHealth`，复用已有 `SecureStoreHealthResponse`，让插件 secret SDK 可查询当前 secure-store backend、available/degraded 与 reason。
  - `usePluginSecret().health()` 与 prelude 注入的 `plugin.secret.health()` 均走 typed event；主进程 handler 只返回 `getSecureStoreHealth()`，不读取或写入任何 secret 值。
  - 为后续插件配置页展示 secret storage degraded/unavailable reason 提供 SDK 入口；OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence 仍待闭环。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-storage-sdk.test.ts" "__tests__/transport-domain-sdks.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/plugin.test.ts"` 通过。

### feat(plugin): surface translation provider secret health

- `plugins/touch-translation/src/components/ProviderConfigModal.vue`
- `plugins/touch-translation/src/composables/useTranslationProvider.ts`
- `docs/plan-prd/TODO.md`
  - 将翻译插件 provider secret 字段清单导出为配置页与持久化逻辑共用的单一来源，避免重复维护哪些 provider 需要密钥保护。
  - 配置弹窗在 Deepl、Bing、Custom、Baidu、Tencent 等含 secret 字段的 provider 上展示 `usePluginSecret().health()` 查询结果，区分 secure-store available、local-secret degraded 与 unavailable/reason。
  - 不读取或展示任何 secret 值；仅提示保存密钥前的本地保护后端状态。OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence 仍待闭环。

### docs: compress planning entry documents

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md`
- `docs/plan-prd/01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`
  - 将主 TODO 压缩为 2 周执行清单，仅保留 P0/P1/P2 当前任务、验收证据与文档同步规则。
  - 长期事项下沉到 `TODO-BACKLOG-LONG-TERM.md`；压缩前 TODO 完整内容保留为 archive 快照。
  - 将 PRD README 与全局 INDEX 改为轻量入口，移除长历史叙事，保留当前基线、主线、阻塞项与高价值专题导航。
  - 将 CHANGES 主文件压缩为近 30 天索引 + 归档入口；压缩前完整 CHANGES 保留为 archive 快照，避免历史信息丢失。

### docs: compress roadmap quality and engineering entries

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/engineering/README.md`
- `docs/engineering/ARCHIVE.md`
- `docs/plan-prd/docs/archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md`
- `docs/plan-prd/01-project/archive/PRODUCT-OVERVIEW-ROADMAP-2026Q1-pre-compression-2026-05-14.md`
- `docs/engineering/archive/README-pre-compression-2026-05-14.md`
- `docs/engineering/archive/ARCHIVE-pre-compression-2026-05-14.md`
  - 将质量基线压缩为活跃 PRD 的最小强规则，保留 Windows evidence、Storage/Secret、typed transport、平台真实能力与文档同步门禁。
  - 将产品总览路线图压缩为产品定义、North Star、2.4.10/2.4.11/2.5.0 版本路线与当前状态快照。
  - 将工程文档入口与工程归档改为轻量索引，不再复制长报告正文；压缩前版本保留在 `docs/engineering/archive/`。

### docs: compress deep-dive and historical engineering reports

- `docs/engineering/electron-event-loop-perf-optimization.md`
- `docs/plan-prd/05-archive/TUFF-TRANSPORT-PRD.md`
- `docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.deep-dive-2026-03.md`
- `docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.deep-dive-2026-03.md`
- `docs/plan-prd/docs/DIVISION_BOX_GUIDE.deep-dive-2026-03.md`
- `docs/clipboard-mechanism-analysis.md`
  - 将历史 deep-dive 与工程分析文档压缩为 `TL;DR + 当前口径 + 完整快照链接`。
  - 完整原文分别保留到对应 `archive/` 或 `full/` 快照文件，避免信息丢失。
  - 当前 release / quality 判定统一指向 `TODO`、`Quality Baseline`、现行压缩版 PRD 与 Release Evidence。

### docs: compress transport ai permission and inventory docs

- `docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.deep-dive-2026-03.md`
- `docs/plan-prd/03-features/tuff-transport/API-REFERENCE.deep-dive-2026-03.md`
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/plan-prd/05-archive/permission-center-prd.md`
- `docs/engineering/typecheck/TYPECHECK_FIXES.md`
- `docs/plan-prd/ISSUES.md`
- `docs/engineering/reports/md-inventory.md`
  - 将 Transport deep-dive、AI 2.5.0 PRD、权限中心历史 PRD、typecheck 修复记录、i18n issues 与 Markdown inventory 压缩为当前口径索引。
  - 完整原文分别保留到对应 `archive/` 或 `full/` 快照文件。
  - 当前执行状态统一指向 `TODO`、`Quality Baseline`、`Roadmap` 与实际 CI/typecheck 结果。

### docs: compress provider scene search performance and sdk reports

- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/docs/DIVISION_BOX_API.deep-dive-2026-03.md`
- `docs/plan-prd/02-architecture/intelligence-agents-system-prd.deep-dive-2026-03.md`
- `docs/plan-prd/05-archive/direct-preview-calculation-prd.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.deep-dive-2026-03.md`
- `docs/plan-prd/03-features/SEARCH-REFACTOR-PRD.md`
- `docs/plan-prd/04-implementation/PerformanceLag260111.md`
- `docs/engineering/reports/sdk-unification-progress-2026-02-08.md`
  - 将 Nexus Provider/Scene 活跃 PRD 压缩为目标、原则、已落地、未闭环、验收清单与当前入口。
  - 将 DivisionBox API、Intelligence Agents、Direct Preview、Everything/Search、Performance Lag 与 SDK unification 报告压缩为历史索引。
  - 完整原文保留到对应 `archive/` 或 `full/` 快照文件。

### docs: compress storage sync everything flow widget and analytics docs

- `docs/engineering/plans/2026-02-01_00-09-19-nexus-user-data-sync-auth.md`
- `docs/everything-integration.md`
- `docs/plan-prd/04-implementation/config-storage-unification.md`
- `docs/plan-prd/03-features/flow-transfer-prd.md`
- `docs/plan-prd/03-features/flow-transfer-detailed-prd.md`
- `docs/plan-prd/docs/DIVISION_BOX_MANIFEST.deep-dive-2026-03.md`
- `docs/plan-prd/04-implementation/CoreAppRefactor260111.md`
- `docs/plan-prd/05-archive/plugin-store-provider-frontend-plan.md`
- `docs/plan-prd/05-archive/widget-dynamic-loading-plan.md`
- `docs/analytics-data-prd.md`
  - 将同步/存储、Everything、Flow Transfer、DivisionBox Manifest、CoreApp 重构、插件市场、Widget 与 analytics 文档压缩为当前口径索引。
  - 完整原文保留到对应 archive/full 快照文件。
  - 当前权威口径统一指向 TODO、Quality Baseline、Roadmap 与现行专题入口。

### docs: compress clipboard automation recommendation and view docs

- `docs/plan-prd/03-features/corebox-clipboard-transport-migration.md`
- `docs/plan-prd/docs/github-automation.zh-CN.md`
- `docs/plan-prd/05-archive/intelligent-recommendation-system-prd.md`
- `docs/plan-prd/05-archive/NEXUS-TEAM-INVITE-PRD.md`
- `docs/plan-prd/05-archive/PROJECT_DOCS_INDEX.md`
- `docs/engineering/notes/notification-sdk.md`
- `docs/engineering/base-surface-refraction-advanced-rendering.md`
- `docs/engineering/reports/overall-code-optimization-2026-04-17.md`
- `docs/plan-prd/03-features/view/view-mode-prd.md`
  - 将剪贴板 transport、GitHub automation、推荐、Nexus Team Invite、旧索引、通知 SDK、视觉渲染、代码优化报告与 View Mode 文档压缩为当前口径索引。
  - 完整原文保留到对应 archive/full 快照文件。

### docs: compress startup platform build quality ai and capability docs

- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
- `docs/engineering/plans/2026-01-20_18-55-03-context-requirements.md`
- `docs/plan-prd/02-architecture/platform-capabilities-prd.md`
- `docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md`
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`
- `docs/plan-prd/03-features/build/build-integrity-verification-prd.md`
- `docs/reports/quality-scan-2026-02-26.md`
- `docs/plan-prd/05-archive/MIGRATION_SUMMARY.md`
- `docs/plan-prd/docs/AISDK_GUIDE.md`
- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md`
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md`
  - 将启动异步化、上下文需求、平台能力、兼容审计、设备风控、构建完整性、质量扫描、迁移摘要、AI SDK、OmniPanel 与 Intelligence 能力路由文档压缩为当前口径索引。
  - 完整原文保留到对应 archive/full 快照文件。

### 近期重点变更索引

以下详细内容可在压缩前完整快照中追溯：

- sanitized telemetry 默认开启与 Sentry/telemetry sanitizer 隐私收口。
- Nexus dashboard asset publishing flows UI/交互 polish。
- Transport retained event alias 迁移：sync、terminal、opener、auth、CoreBox retained aliases 等批次。
- Tuff 2.5.0 Nexus AI invoke 与 OmniPanel Writing Tools MVP。
- CoreApp 启动异步化 P0/P1/P2/P3 切片。
- Windows App 索引、Everything diagnostic evidence、acceptance manifest、manual evidence 与 performance evidence 门禁强化。
- Native transport V1：screenshot、capabilities、file-index、file、media 五域。
- Nexus Provider Registry / Scene run / health & usage ledger / composed capability 最小链路。

## 后续记录格式

新增变更按以下模板追加到本文件顶部对应日期下：

```md
### type(scope): summary

- `changed/file.ts`
- `docs/changed.md`
  - 变更点 1。
  - 变更点 2。
  - 验证：`command` 通过 / 未执行原因。
```
