# Settings hierarchy and defaults research

## Confirmed findings

### Advanced visibility

- `SettingTools.vue:829-923` renders auto paste, auto clear, and auto hide without `showAdvancedSettings`; the component already exposes `showAdvancedSettings`, so each control can use the existing gate without changing its model or options.
- `SettingSetup.vue:742-770` renders hide Dock, silent start, and OmniPanel auto-mount outside the existing advanced gate. Hide Dock must retain `isMacOS && traySettingsAvailable` in addition to the new advanced gate.

### Defaults and missing-field behavior

- 实现前的规范默认在 `packages/utils/common/storage/entity/app-settings.ts:178-186,372-387` 均为 `false`；本任务已改为 `true`。
- 实现前，`main-storage-registry.ts` 只验证顶层对象，历史嵌套对象不会深合并，因此仅修改规范默认无法覆盖缺失嵌套字段。
- 实现前，`SettingSetup.vue`、`SettingTools.vue`、`SettingWindow.vue` 的 Renderer fallback 会写入 `false`，可能覆盖新默认。
- 实现前，以下 Main 直接读取路径也对缺失值回退 `false`：
  - `main/channel/common.ts` tray snapshot/update fallback.
  - `main/modules/tray/tray-manager.ts` Dock and silent-start config reads.
  - `main/core/silent-launch.ts` silent launch resolution.
  - `main/modules/omni-panel/index.ts` runtime snapshot and registry persistence.
- Safe compatibility rule: preserve every explicit boolean, including false; only undefined/non-boolean values receive the new true default.

### macOS tag and copy

- `TuffMacOSTag.vue` owns the Apple icon and localized `settings.platformTags.macOnly` label.
- The only three current `TuffMacOSTag` usages are in `SettingSetup.vue`.
- Locale values are currently `macOS only` and `仅限 macOS`.
- `settings.setup.hideDockDesc` repeats `(macOS only)` in English and Chinese; remove that suffix because the tag already carries platform scope.

### Layout

- `TuffGroupBlock.vue` owns a shared `margin-bottom: 0.7rem`; `SettingStorage.vue` renders a standalone `TuffBlockSwitch` with no outer margin, causing the screenshot's attached cards.
- The fix belongs in `AppSettings.vue`, not the shared component.
- `AppSettings.vue` contains always-rendered `file-index` and `everything` wrappers whose children are conditional. A parent `gap` would leave ghost spacing unless the conditions move to the wrappers.
- Some setting components render multiple root groups. The page and section wrapper both need vertical flex/gap behavior, with legacy child margins reset only within those containers.
- Impeccable layout detector returned `[]`; the issue is cross-component spacing ownership and is not detectable as a single-file arbitrary-spacing violation.

## Existing tests to extend

- `SettingTools.quickops.test.ts`: add advanced-off/on visibility assertions for the three utility controls.
- `main/modules/omni-panel/index.test.ts`: change missing auto-mount expectation to true and add explicit-false coverage.
- `main/core/silent-launch.test.ts`：完成 onboarding 后缺失 `startSilent` 回退开启；缺失/未完成 onboarding 保持可见；显式 `false` 正常启动。
- `main/modules/tray/tray-manager.test.ts`: cover missing hideDock/startSilent defaults and explicit false.

## New focused tests

- Add a SettingSetup renderer test for advanced visibility and missing/false default preservation.
- Add a storage normalization test for three missing fields and explicit false values.
- Add a locale/tag copy contract test for `Only / 仅限` and removal of duplicate platform suffixes.
- Add an AppSettings layout contract/mount test for 12px gap and absent condition wrappers.

## Dirty-worktree note

`en-US.json`, `zh-CN.json`, and unrelated update/release-note files already contain user changes. Implementation must edit only the exact locale keys owned by this task and must not revert or reformat unrelated lines.

## Validation findings

- At `1100x680`, the original fixed `56px` setting-row height allowed wrapped English descriptions to overlap the next row. The page-scoped fix keeps `min-height: 56px`, uses `height: auto`, and adds `8px` vertical padding. CDP rectangle checks found zero overlaps across 10 General Settings rows and 24 Utilities rows; measured heights ranged from 56px to 92px.
- Advanced mode exposed all six target items; normal mode hid all six. Computed top-level gaps were exactly `12px` in both modes, and all three macOS tags rendered `Only` with the Apple icon.
- `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR` redirects application business data, but Electron helper command lines still advertised the shared Chromium dev profile. Do not treat `--user-data-dir` or this env alone as full-profile isolation for visual QA; terminate the exact launched process tree after verification and avoid destructive runtime checks against dev profiles.

## Implementation learnings

- `normalizeAppSetting` now narrowly reconstructs only `setup`, `window`, and `omniPanel` enough to normalize the three target booleans. Historical top-level and sibling nested fields remain untouched, and every explicit boolean `false` survives.
- Silent launch uses one shared configuration resolver. Configuration-driven silence requires `beginner.init === true`; explicit `false` and a missing onboarding state both keep the first-run window visible. Secondary data, argv, and Electron login-item signals remain higher-priority explicit signals.
- `TrayManager` tests require `talex-mica-electron` and screenshot-session mocks in plain Node; without them, transitive Electron initialization fails before Tray assertions execute.
- Page-owned flex `gap` works for Vue fragment roots only when the file-index/everything multi-root paths have rendered wrappers. Moving each condition to its wrapper prevents comment/empty wrappers from becoming ghost flex items.
- The AppSettings layout contract now compiles the real scoped SCSS and inspects Vue's compiled template AST. This proves the emitted direct-child selectors and wrapper-level `v-if` conditions without depending on source formatting regexes.
- Scoped lint initially found two task-owned test issues: an invalid `ts/no-require-imports` rule alias and unformatted new tests. Both were fixed; every task-owned CoreApp TypeScript/Vue/test file and the canonical utils defaults file now pass scoped ESLint.
