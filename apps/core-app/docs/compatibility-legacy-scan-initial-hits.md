# Deprecated/Legacy 关键词扫描命中清单（初版）

## 检索词

- deprecated
- legacy
- compat / compatibility / compatible
- shim
- fallback
- polyfill
- migration
- obsolete

## 检索范围

- 路径：`src/`、`resources/`、`scripts/`、`public/`、`docs/`
- 规则：大小写不敏感；命中后需结合上下文判断归类

## 命中文件列表

### resources / scripts / docs

- resources/db/migrations/0003_exotic_human_robot.sql
- scripts/build-target.js
- docs/compatibility-legacy-scan.md

### src/renderer
- src/renderer/components.d.ts
- src/renderer/src/composables/market/useVersionCompare.ts

- src/renderer/src/locales/zh-CN/download-migration.json
- src/renderer/src/locales/en/download-migration.json
- src/renderer/src/env.d.ts
- src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue
- src/renderer/src/components/render/sourceMeta.ts
- src/renderer/src/components/render/BoxGrid.vue
- src/renderer/src/components/download/IMPLEMENTATION_SUMMARY.md
- src/renderer/src/components/download/MigrationProgress.vue
- src/renderer/src/components/tuff/template/TuffAsideList.vue
- src/renderer/src/components/tuff/tags/TuffWindowsTag.vue
- src/renderer/src/components/tuff/tags/TuffBetaTag.vue
- src/renderer/src/components/tuff/tags/TuffLinuxTag.vue
- src/renderer/src/components/tuff/tags/TuffMacOSTag.vue
- src/renderer/src/components/permission/PermissionStatusCard.vue
- src/renderer/src/components/base/input/FlatMarkdown.vue
- src/renderer/src/components/base/dialog/PlatformCompatibilityWarning.vue
- src/renderer/src/components/base/select/TSelectItem.vue
- src/renderer/src/modules/install/install-manager.ts
- src/renderer/src/modules/box/adapter/hooks/useResize.ts
- src/renderer/src/modules/mousetrap-record.ts
- src/renderer/src/modules/layout/index.ts
- src/renderer/src/modules/layout/useSecondaryNavigation.ts
- src/renderer/src/modules/storage/README.md
- src/renderer/src/modules/storage/intelligence-storage.ts
- src/renderer/src/modules/lang/i18n.ts
- src/renderer/src/modules/lang/zh-CN.json
- src/renderer/src/modules/lang/en-US.json
- src/renderer/src/modules/lang/I18N_IMPLEMENTATION.md
- src/renderer/src/modules/tuffex/index.ts
- src/renderer/src/modules/hooks/core-box.ts
- src/renderer/src/modules/hooks/useAppLifecycle.ts
- src/renderer/src/modules/hooks/useSvgContent.ts
- src/renderer/src/modules/mention/platform-warning.ts
- src/renderer/src/modules/market/providers/nexus-store-provider.ts
- src/renderer/src/modules/market/providers/repository-provider.ts
- src/renderer/src/views/box/BoxInput.vue
- src/renderer/src/views/box/tag/UnifiedFileTag.vue
- src/renderer/src/views/box/tag/FileTag.vue
- src/renderer/src/views/box/tag/ClipboardFileTag.vue
- src/renderer/src/views/base/settings/SettingFileIndex.vue
- src/renderer/src/views/base/settings/SettingPermission.vue
- src/renderer/src/views/base/styles/sub/ThemePreference.vue
- src/renderer/src/views/base/styles/LayoutSection.vue
- src/renderer/src/assets/docs/license.md

### src/main

- src/main/core/main-window-state.ts
- src/main/core/touch-window.ts
- src/main/core/module-manager.ts
- src/main/utils/version-util.ts
- src/main/utils/common-util.ts
- src/main/channel/common.ts
- src/main/service/device-idle-service.ts
- src/main/modules/database/index.ts
- src/main/modules/flow-bus/flow-bus.ts
- src/main/modules/flow-bus/native-share.ts
- src/main/modules/abstract-base-module.ts
- src/main/modules/clipboard.ts
- src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts
- src/main/modules/box-tool/search-engine/search-gather.ts
- src/main/modules/box-tool/search-engine/search-core.ts
- src/main/modules/box-tool/search-engine/search-logger.ts
- src/main/modules/box-tool/core-box/window.ts
- src/main/modules/box-tool/addon/system/system-provider.ts
- src/main/modules/box-tool/addon/files/file-provider.ts
- src/main/modules/box-tool/addon/files/everything-provider.ts
- src/main/modules/box-tool/addon/preview/providers/fx-rate-provider.ts
- src/main/modules/box-tool/addon/apps/app-provider.ts
- src/main/modules/box-tool/addon/apps/search-processing-service.ts
- src/main/modules/plugin/plugin.ts
- src/main/modules/plugin/providers/utils.ts
- src/main/modules/plugin/adapters/plugin-features-adapter.ts
- src/main/modules/plugin/plugin-loaders.ts
- src/main/modules/ocr/ocr-service.ts
- src/main/modules/tray/tray-icon-provider.ts
- src/main/modules/storage/index.ts
- src/main/modules/storage/main-storage-registry.ts
- src/main/modules/system/permission-checker.ts
- src/main/modules/tray-holder.ts
- src/main/modules/download/migration-manager.test.ts
- src/main/modules/download/migration-manager.ts
- src/main/modules/download/network-monitor.ts
- src/main/modules/download/API.md
- src/main/modules/download/migrations.ts
- src/main/modules/download/download-center.ts
- src/main/modules/download/MIGRATION_GUIDE.md
- src/main/modules/download/index.ts
- src/main/modules/download/PERFORMANCE_OPTIMIZATIONS.md
- src/main/modules/download/PERFORMANCE_QUICK_REFERENCE.md
- src/main/modules/ai/intelligence-strategy-manager.ts
- src/main/modules/ai/provider-models.ts
- src/main/modules/ai/runtime/base-provider.ts
- src/main/modules/ai/agents/agent-manager.ts
- src/main/modules/ai/intelligence-module.ts
- src/main/modules/ai/intelligence-sdk.ts
- src/main/modules/ai/tuff-intelligence-storage-adapter.ts
- src/main/modules/division-box/flow-trigger.ts
- src/main/modules/permission/permission-store.ts
- src/main/modules/permission/permission-guard.ts
- src/main/modules/permission/channel-guard.ts
- src/main/modules/analytics/analytics-module.ts
- src/main/modules/analytics/README.md

## 备注

- `docs/compatibility-legacy-scan.md` 本身包含关键词，属于预期命中。
