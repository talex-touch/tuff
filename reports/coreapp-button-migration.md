# core-app 按钮迁移分析（TxButton 变体）

## 目标
- core-app 内原生 `<button>` 统一迁移为 `TxButton` 变体
- 业务按钮保留：`apps/core-app/src/renderer/src/components/layout/LayoutBackButton.vue`
- `MarketInstallButton` 已使用 `TxButton`，不做改动

## 变体策略
- **自定义样式/图标/列表项**：`TxButton` + `variant="bare"`，保留原有 class/布局
- **纯测试页**：使用 `TxButton` 基础变体（当前为 `variant="flat"`）

## 迁移覆盖（按模块）
- **基础组件**
  - `apps/core-app/src/renderer/src/components/base/BuildSecurityBanner.vue`
  - `apps/core-app/src/renderer/src/components/base/dialog/PlatformCompatibilityWarning.vue`
  - `apps/core-app/src/renderer/src/components/base/template/BrickTemplate.vue`
  - `apps/core-app/src/renderer/src/components/base/tuff/TModal.vue`
  - `apps/core-app/src/renderer/src/components/base/tuff/TSelectField.vue`
- **下载/索引/流程**
  - `apps/core-app/src/renderer/src/components/download/MigrationProgress.vue`
  - `apps/core-app/src/renderer/src/components/file-index/FileIndexFailDialog.vue`
  - `apps/core-app/src/renderer/src/components/flow/FlowSelector.vue`
- **智能/能力**
  - `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceUsageChart.vue`
  - `apps/core-app/src/renderer/src/components/intelligence/capabilities/AISDKCapabilityDetails.vue`
  - `apps/core-app/src/renderer/src/components/intelligence/capabilities/CapabilityModelTransfer.vue`
  - `apps/core-app/src/renderer/src/components/intelligence/capabilities/CapabilityTestDialog.vue`
  - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePromptsPage.vue`
- **插件与日志**
  - `apps/core-app/src/renderer/src/components/plugin/PluginNavTree.vue`
  - `apps/core-app/src/renderer/src/components/plugin/tabs/CommandDetailDrawer.vue`
  - `apps/core-app/src/renderer/src/components/plugin/tabs/PluginLogs.vue`
  - `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`
- **渲染/模板**
  - `apps/core-app/src/renderer/src/components/render/custom/CoreIntelligenceAnswer.vue`
  - `apps/core-app/src/renderer/src/components/render/custom/PreviewResultCard.vue`
  - `apps/core-app/src/renderer/src/components/tuff/template/TuffAsideList.vue`
  - `apps/core-app/src/renderer/src/components/tuff/template/TuffListTemplate.vue`
  - `apps/core-app/src/renderer/src/views/base/styles/LayoutSection.vue`
  - `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- **布局/视图**
  - `apps/core-app/src/renderer/src/modules/division-box/components/DivisionBoxHeader.vue`
  - `apps/core-app/src/renderer/src/views/base/LingPan.vue`
  - `apps/core-app/src/renderer/src/views/base/begin/internal/LanguageSetup.vue`
  - `apps/core-app/src/renderer/src/views/storage/Storagable.vue`
- **测试页**
  - `apps/core-app/src/renderer/src/views/test/LoginTest.vue`
  - `apps/core-app/src/renderer/src/views/test/MemoryLeakTest.vue`

## TxButton 变体扩展
- 在 `@talex-touch/tuffex` 中新增 `variant="bare"`（用于无样式基底按钮）
  - `packages/tuffex/packages/components/src/button/src/types.ts`
  - `packages/tuffex/packages/components/src/button/src/style/index.scss`

## 剩余项
- `apps/core-app/src/renderer/src/components/layout/LayoutBackButton.vue`（按约定保留原生 `<button>`）
