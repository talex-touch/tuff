# 洞察页共享组件与语音页迁移

父任务：`../10-03-intelligence-audit-rebuild/`（需求 R-E1、R-E2；决定 D7）。设计以父任务 `design.md` §4 为准。

## Goal

把语音页私有的标题行、提示条、主指标 / 辅助指标卡、⋯ 菜单抽成 CoreApp 共享组件，语音页先切过去且外观行为不变，为审计页提供同一套骨架。

## Requirements

- **E1**：新建 `apps/core-app/src/renderer/src/components/settings/insights/` 下五个组件：
  - `InsightsHeader`
  - `InsightsNotice`
  - `InsightsHeroMetric`
  - `InsightsMetricCard`
  - `InsightsMenu`

  接口按父 `design.md` §4。样式从 `views/base/VoiceInsights.vue` 原样迁出，仍用 `--shell-*` token。
- **E2**：`VoiceInsights.vue` 改用这些组件。
  - 保留全部 `data-testid` 与可访问性属性（`role`、`aria-*`、可聚焦的说明图标）；
  - 删除迁走的私有样式；
  - 不改语音页的数据逻辑与文案。
- **E3**：组件不新增文案键；若确需新增（例如 ⋯ 菜单的默认 aria 名），中英同时加。
- **E4**：交互语义：
  - 菜单项是原生 `button`，`disabled` 原样生效；
  - 危险项样式保留；
  - 分隔线 `role="separator"`；
  - 提示条 error 用 `role="alert"`，其余用 `role="status"`。

## Acceptance Criteria

- [ ] AC-E1（父 AC-18）：`views/base/VoiceInsights.test.ts` 全部用例不改断言、全绿。
- [ ] AC-E2：五个组件各有单测，覆盖插槽渲染、`disabled` 菜单项不触发 `select`、提示条 role、主指标 note 的可聚焦与 aria。
- [ ] AC-E3（父 AC-18）：同一 profile、同一窗口尺寸下，语音页迁移前后各截一张有数据的图和一张空态图，逐区域比对标题行、指标区、菜单展开态无差异，差异截图附在任务目录。
- [ ] AC-E4：`VoiceInsights.vue` 中被迁走的选择器（`.VoiceInsights-Hero*`、`.VoiceInsights-Notice`、`.VoiceInsights-Metric*`、`.VoiceInsights-Menu*`）全部删除，无残留重复样式。
- [ ] AC-E5：
  - `pnpm -C apps/core-app run typecheck:web` 本子任务范围 0 新错误；
  - `pnpm check coreapp-ui-contract` 通过；
  - lint delta 为 0；
  - `git diff --check` 干净。

## Out of Scope

- 审计页本身（审计页子任务）。
- 语音页热力图、周柱、报告卡、记录抽屉：这些不是共享骨架，不动。

## Dependencies

无前置，可与定价、记忆子页并行。下游：审计页子任务使用这些组件。
