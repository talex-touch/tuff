# 隐性兼容路径补扫（不含关键词命中）

本清单补充的是未被 `deprecated/legacy/compat/fallback/...` 关键词命中的兼容性/过渡路径，作为隐性兼容模式样本。

## 1) 平台分支（Renderer UI/交互层）

- src/renderer/src/components/render/CoreBoxFooter.vue
- src/renderer/src/components/render/ActionPanel.vue
- src/renderer/src/components/base/input/FlatKeyInput.vue
- src/renderer/src/views/box/DivisionBoxHeader.vue
- src/renderer/src/views/base/settings/SettingSetup.vue

## 2) 平台分支（Main 功能实现/模块加载）

- src/main/core/precore.ts
- src/main/modules/box-tool/file-system-watcher/file-system-watcher.ts
- src/main/modules/box-tool/addon/app-addon.ts
- src/main/modules/box-tool/addon/apps/app-scanner.ts
- src/main/modules/tray/tray-manager.ts
- src/main/modules/terminal/terminal.manager.ts
- src/main/modules/build-verification/index.ts

## 3) 版本门控/版本比较（semver 或 compare）

- src/renderer/src/composables/market/useVersionCompare.ts
- src/renderer/src/modules/update/UpdateProvider.ts
- src/main/modules/update/update-system.ts

## 4) 环境门控/功能开关（DEV/ENV）

- src/renderer/src/modules/auth/auth-env.ts
- src/renderer/src/modules/devtools/app-entrance-log.ts
- src/main/service/plugin-market.service.ts
- src/main/utils/logger.ts
