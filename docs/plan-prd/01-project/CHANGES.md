# 变更日志

> 更新时间：2026-05-20
> 说明：主文件只保留近 30 天重点索引与后续新增变更；压缩前完整快照见 `./archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。更早历史继续按月归档在 `./archive/changes/`。

## 历史归档

- [压缩前完整快照（截至 2026-05-14）](./archive/changes/CHANGES-pre-doc-compression-2026-05-14.md)
- [2026-03 历史归档](./archive/changes/CHANGES-2026-03.md)
- [2026-02 历史归档](./archive/changes/CHANGES-2026-02.md)
- [2025-11 历史归档](./archive/changes/CHANGES-2025-11.md)
- [Legacy full snapshot](./archive/changes/CHANGES-legacy-full-2026-03-16.md)

## 2026-05-20

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

## 2026-05-18

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
