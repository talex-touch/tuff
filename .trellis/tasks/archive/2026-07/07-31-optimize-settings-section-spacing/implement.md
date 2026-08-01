# Implementation plan

## Phase 1: RED

- [x] Add/extend focused tests proving utility controls are hidden with advanced settings off and visible with it on.
- [x] Add SettingSetup tests for the three advanced controls, including macOS capability gating.
- [x] Add storage/default tests proving missing fields become true and explicit false remains false.
- [x] Update/add runtime tests for tray hideDock, silent launch, and OmniPanel auto-mount missing/false behavior.
- [x] Add locale/tag copy assertions and an AppSettings layout/conditional-wrapper contract test.
- [x] Run focused tests and confirm they fail for the expected pre-change reasons.

## Phase 2: GREEN

- [x] Add advanced visibility gates in `SettingTools.vue` and `SettingSetup.vue` without changing models or handlers.
- [x] Set the three canonical defaults to true in `app-settings.ts`.
- [x] Normalize only the three nested booleans at the main storage boundary, preserving explicit false and unrelated data.
- [x] Align renderer ensure functions and direct main runtime fallbacks with canonical defaults.
- [x] Change `TuffMacOSTag` and locale copy to `Only / 仅限`; remove duplicate hideDock platform wording.
- [x] Apply page-scoped 12px flex gaps, direct-child margin reset, conditional wrapper rendering, and auto-height setting rows in `AppSettings.vue`.
- [x] Re-run focused tests until green.

## Phase 3: REFACTOR / CHECK

- [x] Inspect the diff for duplicated fallback literals; use `appSettingOriginData` where it reduces drift without creating cross-layer coupling.
- [x] Verify no unrelated dirty locale/update changes were reformatted or reverted.
- [x] Run scoped ESLint for changed TypeScript/Vue/test files.
- [x] Run `pnpm -C "apps/core-app" run typecheck:node`.
- [x] Run `pnpm -C "apps/core-app" run typecheck:web`.
- [x] Run focused tests for settings, storage normalization, tray, silent launch, and OmniPanel.
- [x] Run `git diff --check`.
- [x] Start the CoreApp dev server and visually check default/advanced settings on the available platform; verify 12px rhythm, no ghost gaps, and no overlap while expanding/collapsing.
- [x] Re-run Impeccable layout detector on the changed settings files; unresolved findings must be zero or documented.

## Verification record

- RED run: 12 expected behavior failures across visibility, defaults, onboarding, copy, and layout; Tray initially exposed a missing `talex-mica-electron` test mock before assertions ran.
- Onboarding contract: configuration-driven silent launch requires `beginner.init === true`; explicit secondary data, argv, and login-item signals retain their original priority. Missing onboarding state stays visible.
- GREEN/final focused run: 10 files passed 85 tests, including settings visibility/defaults, storage normalization, Common tray helpers, Tray, Silent Launch, OmniPanel, Done, and onboarding permissions.
- `typecheck:node`: passed.
- `typecheck:web`: passed, including the required TuffEx build.
- `lint:changed`, locale JSON parse, and `git diff --check`: passed.
- AppSettings layout verification compiles the real scoped SCSS with `@vue/compiler-sfc` and inspects the compiled template AST for conditional wrappers.
- CDP visual verification at `1100x680`: advanced mode showed all six target items, normal mode hid all six, every visible top-level gap measured `12px`, and all three macOS tags rendered Apple icon + `Only`.
- Responsive rows: General Settings (10 rows) and Utilities (24 rows) had zero rectangle overlaps; rows expanded from `56px` up to `92px` for wrapped English descriptions.
- Visual QA caveat: `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR` did not change the Chromium helper command-line profile path. The exact Electron/Vite process tree was terminated and temporary files removed; future QA must not assume this env or `--user-data-dir` provides complete dev-profile isolation.

## Focused command set

```bash
pnpm -C "apps/core-app" exec vitest run \
  "src/renderer/src/views/base/settings/SettingTools.quickops.test.ts" \
  "src/renderer/src/views/base/settings/SettingSetup.test.ts" \
  "src/renderer/src/views/base/settings/AppSettings.layout.test.ts" \
  "src/renderer/src/views/base/begin/internal/Done.test.ts" \
  "src/renderer/src/views/base/begin/internal/onboarding-permission-flow.test.ts" \
  "src/main/channel/common.test.ts" \
  "src/main/modules/storage/main-storage-registry.test.ts" \
  "src/main/modules/tray/tray-manager.test.ts" \
  "src/main/core/silent-launch.test.ts" \
  "src/main/modules/omni-panel/index.test.ts"

pnpm -C "apps/core-app" run typecheck:node
pnpm -C "apps/core-app" run typecheck:web
git diff --check
```

## Risky files / guardrails

- `apps/core-app/src/renderer/src/modules/lang/en-US.json` and `zh-CN.json` contain unrelated user edits: exact replacements only.
- Do not modify shared `TuffGroupBlock.vue` spacing.
- Do not change field names, event handlers, transport DTOs, or persistence schema.
- Do not coerce explicit false with truthy/falsy shortcuts; use boolean type checks or nullish fallback semantics that preserve false.
