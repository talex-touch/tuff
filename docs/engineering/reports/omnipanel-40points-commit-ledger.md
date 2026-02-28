# OmniPanel 40 Points Commit Ledger

| FP-ID | Commit | Scope Files | Behavior Delta | Tests | Review Findings | Status |
|---|---|---|---|---|---|---|
| FP-01 | `8256d80e` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 移除面板内启停按钮与状态展示 | `vitest index.test.ts` | None | Done |
| FP-02 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 执行链不再返回 `FEATURE_DISABLED` | `vitest index.test.ts` | None | Done |
| FP-03 | `8256d80e` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 移除 `omniPanelFeatureToggleEvent` 调用路径 | `vitest interaction.test.ts` | None | Done |
| FP-04 | `8256d80e` | `apps/core-app/src/shared/events/omni-panel.ts` | `feature:toggle` 标记 deprecated（兼容保留） | `typecheck:node` | None | Done |
| FP-05 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 兼容读取 `enabled`，不作为执行门禁 | `vitest index.test.ts` | None | Done |
| FP-06 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 支持 ↑/↓ 键盘导航 | `vitest interaction.test.ts` | None | Done |
| FP-07 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 支持 Enter 执行焦点 Feature | `vitest interaction.test.ts` | None | Done |
| FP-08 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 支持 Cmd/Ctrl+F 聚焦搜索框 | `vitest interaction.test.ts` | None | Done |
| FP-09 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | Esc 关闭与焦点恢复 | `vitest interaction.test.ts` | None | Done |
| FP-10 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 执行中禁重入与统一反馈 | `vitest index.test.ts` | None | Done |
| FP-11 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelHeader.vue` | 抽离 Header 组件 | `typecheck:web` | None | Done |
| FP-12 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelContextCard.vue` | 抽离 ContextCard 组件 | `typecheck:web` | None | Done |
| FP-13 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelSearchBar.vue` | 抽离 SearchBar 组件 | `typecheck:web` | None | Done |
| FP-14 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionItem.vue` | 抽离 ActionItem 组件 | `typecheck:web` | None | Done |
| FP-15 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionList.vue` | 抽离 ActionList 并接入 tuffex 组件风格 | `typecheck:web` | None | Done |
| FP-16 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/filter-features.ts` | Feature 过滤逻辑纯函数化 | `vitest filter-features.test.ts` | None | Done |
| FP-17 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | unavailable reason 结构化字段透传 | `vitest index.test.ts` | None | Done |
| FP-18 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 执行错误码映射表统一 | `vitest index.test.ts` | None | Done |
| FP-19 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 执行 payload 校验收敛（id/context/source） | `vitest index.test.ts` | None | Done |
| FP-20 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | refresh reason 扩展与兼容映射 | `vitest index.test.ts` | None | Done |
| FP-21 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 插件 unavailable 原因细化 | `vitest index.test.ts` | None | Done |
| FP-22 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 自动装载去重强化 | `vitest index.test.ts` | None | Done |
| FP-23 | `8781702a` | `apps/core-app/src/main/modules/omni-panel/index.test.ts` | `omniTransfer` 优先级补单测 | `vitest index.test.ts` | None | Done |
| FP-24 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 安装并发锁与重入保护 | `vitest index.test.ts` | None | Done |
| FP-25 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 插件变更后刷新路径补齐 | `vitest index.test.ts` | None | Done |
| FP-26 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 选中文本捕获失败分平台降级 | `vitest index.test.ts` | None | Done |
| FP-27 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | clipboard 快照恢复失败增强处理 | `vitest index.test.ts` | None | Done |
| FP-28 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | 复制模拟流程超时保护与日志 | `vitest index.test.ts` | None | Done |
| FP-29 | `c05e9c20` | `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue` | 无选中文本提示文案优化 | `typecheck:web` | None | Done |
| FP-30 | `8256d80e` | `apps/core-app/src/main/modules/omni-panel/index.ts` | source 标记全链路一致化 | `vitest index.test.ts` | None | Done |
| FP-31 | `8781702a` | `apps/core-app/src/main/modules/omni-panel/index.test.ts` | registry 初始化与内置补齐单测 | `vitest index.test.ts` | None | Done |
| FP-32 | `8781702a` | `apps/core-app/src/main/modules/omni-panel/index.test.ts` | 执行分发单测（builtin/corebox/plugin/system） | `vitest index.test.ts` | None | Done |
| FP-33 | `8781702a` | `apps/core-app/src/main/modules/omni-panel/index.test.ts` | 自动装载 declared/fallback 单测 | `vitest index.test.ts` | None | Done |
| FP-34 | `8781702a` | `apps/core-app/src/renderer/src/views/omni-panel/*.test.ts` | 渲染层交互测试（搜索/排序/执行） | `vitest filter-features.test.ts interaction.test.ts` | None | Done |
| FP-35 | `8781702a` | `apps/core-app/src/main/modules/omni-panel/index.test.ts` | 最小 smoke（show -> execute builtin -> close） | `vitest index.test.ts` | None | Done |
| FP-36 | `6e3bd646` | `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` | 更新 PRD 状态与缺口 | N/A | None | Done |
| FP-37 | `6e3bd646` | `docs/plan-prd/README.md`, `docs/plan-prd/TODO.md` | README/TODO 对齐现状 | N/A | None | Done |
| FP-38 | `6e3bd646` | `docs/INDEX.md` | 导航状态与 OmniPanel 条目更新 | N/A | None | Done |
| FP-39 | `6e3bd646` | `docs/engineering/reports/omnipanel-40points-commit-ledger.md` | 建立提交台账文档 | N/A | None | Done |
| FP-40 | `6e3bd646` | `docs/engineering/reports/omnipanel-40points-summary.md` | 输出最终汇总表 | N/A | None | Done |
