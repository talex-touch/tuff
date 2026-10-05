# Design — 洞察页共享组件

以父任务 `design.md` §4 为准。

## 迁移映射

| 语音页现状 | 共享组件 | 备注 |
|---|---|---|
| `<header class="VoiceInsights-Hero">` + `HeroCopy` + `HeroActions`（模板 `VoiceInsights.vue` 标题行段） | `InsightsHeader` | `title` 来自 `eyebrow`；`#status` 插槽接语音页的状态；`#actions` 接「记录」按钮与菜单 |
| `.VoiceInsights-Notice.is-error / .is-warning`（三处提示） | `InsightsNotice` | 各处的 `data-testid` 透传到根元素 |
| `VoiceInsights-Hero2`（主指标，label 旁带估算说明 tooltip） | `InsightsHeroMetric` | `note` → `TxTooltip` + 可聚焦图标，`data-testid="voice-insights-saved-basis"` 由调用方传入 |
| `TxCard.VoiceInsights-Metric`（辅助指标 × 3） | `InsightsMetricCard` | `data-metric` 透传 |
| `TxPopover` + `.VoiceInsights-Menu` | `InsightsMenu` | 项的 `testId` 映射到 `data-testid`；`runFromMenu` 的关闭逻辑在组件内完成 |

## 样式

- 原样迁出对应选择器，改成组件根类名（`InsightsHeader`、`InsightsNotice`、…），保留注释里的设计理由。
- `TxTextMorph` 的继承修正（`.tx-text-morph` 的 `font: inherit; vertical-align: baseline`）一并迁入指标组件，不得丢。
- 响应式断点里与这些块相关的规则（`@media (max-width: 900px / 680px / 480px)`）一并迁移。

## 测试

- 组件单测用 `@vue/test-utils` 挂载。
- 语音页测试是回归基准，不改断言；若因 DOM 包裹层变化导致选择器失效，优先调整组件让原选择器继续成立，而不是改测试。
