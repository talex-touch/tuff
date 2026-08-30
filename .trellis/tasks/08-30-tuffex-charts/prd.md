# tuffex-charts 图表包（对标 kumo Charts 家族，无 echarts）

## Goal

新建 `@talex-touch/tuffex-charts`：复刻 Cloudflare kumo 的 Charts 家族六板块能力面（Charts 总览 / Colors / Timeseries / Maps / Sankey / Custom Chart），Vue 3 渲 SVG + d3 纯数学微模块，**不引入 echarts**。父任务管总需求、任务地图与最终验收。

## 背景事实（调研结论，2026-08-30）

- kumo 的图表底层就是 ECharts 6（peerDependency，调用方自己 `echarts.use([...])` 传实例进组件）；地图另用 d3-geo 做 Mercator 投影。
- 因此「不带 echarts + 用法和 kumo 一样」= 照搬 kumo 的 API 形态与能力面，渲染层自研。
- kumo 参考源码（chart 组件 + 六个文档页 + demos + MIT LICENSE）已固化在本任务 `research/kumo-reference/`，实现子任务离线可查。
- tuffex 已有先例：`spark-chart`（canvas 手绘）+ `TxChartScrubber`（DOM tooltip stage），佐证自研渲染路线；本包不改动它们。

## Requirements

### 交付物（六板块 → 实现）

1. 新包 `packages/tuffex-charts`，发布名 `@talex-touch/tuffex-charts`：Vue 3 peer，构建/导出结构对齐 tuffex（ES + CJS 双产物、d.ts、`style.css` 子路径导出），组件前缀 `Tx`。
2. **Colors**：ChartPalette 色彩系统 —— 分类 6 色、语义 6 色（Attention/Warning/Success/Neutral/Disabled/Skeleton）、顺序色阶（blues 5 档）、文本色（primary/secondary）、地图色（area/bubble/scale 5 档），明暗两套；同时以 CSS 变量输出并随 `.dark` / `[data-theme='dark']` 自动切换。
3. **Charts 总览**：`TxChartLegend`（SmallItem / LargeItem / loading 骨架态）；基础图（line / bar / donut）由原语组合得到。
4. **Custom Chart**：可组合原语（`TxChart` 容器 + 轴/网格/系列子组件）替代 kumo 的「透传 echarts options」逃生舱。
5. **Timeseries**：`TxTimeseriesChart` 全功能（line/bar、标记聚簇、阈值线、渐变、不完整数据虚线、刷选时间范围、tooltip 三模式、图例联动、加载骨架、aria）。
6. **Maps**：`TxBubbleMap` / `TxChoroplethMap`（GeoJSON + Mercator 纬度钳制/裁两极、accessor 取数、缩放平移、连续色阶）。
7. **Sankey**：`TxSankeyChart`（d3-sankey 布局、节点值标签两种排布、渐变连线、节点/连线点击、下钻标记）。
8. **文档**：nexus 侧新增 Charts 分组六页（zh/en 各一）+ 无 echarts 的 demos。

### 约束

- 禁止 echarts 及任何整图表框架；允许的 d3 纯数学微模块：`d3-scale`、`d3-shape`、`d3-sankey`、`d3-geo`（及其必要传递依赖如 d3-array/d3-time）。
- 渲染用 SVG（jsdom 可测、CSS 变量可用、逐元素事件），不用 canvas。
- API 命名与行为尽量贴 kumo，按 Vue 习惯转换（props/emits/slots/v-model）；每处偏离在 design.md 对照表中显式记录，不默默丢弃。
- 明暗主题走 CSS 变量 + `.dark`/`[data-theme='dark']`（对齐 tuffex bui-tokens 机制），组件不加 `isDarkMode` prop；JS 侧 `ChartPalette` 保留 `isDark` 参数供包外取字面值（kumo API 兼容）。
- 不运行时依赖 `@talex-touch/tuffex`：CSS 变量带 fallback 值，包可独立使用、宿主可主题覆盖。
- kumo 为 MIT：移植的算法/色值处按 spark-chart 的先例加出处注释；LICENSE 副本已存 research。
- 不改 spark-chart / signal-meter；不在本任务里替换 nexus dashboard 现有 echarts 用法（可作后续任务）。
- GeoJSON 不打进包里，由调用方提供（与 kumo 一致）；docs demo 可带一份小体积世界地图数据。

## Acceptance Criteria

- [ ] `pnpm --filter @talex-touch/tuffex-charts build` 产出 es + lib + d.ts + css；包的依赖树中无 echarts。
- [ ] 六板块组件按各子任务验收全部通过；`typecheck` / `lint` / `vitest` 全绿（tuffex 弱检查与 nexus 严格检查两侧都过）。
- [ ] nexus 文档六页 zh/en 可渲染，demo 不 import echarts。
- [ ] design.md 的 kumo 对照表逐项核对：每个 kumo prop/行为标注 同名实现 / 改名 / 有意改进 / 显式缓议，无静默缺项。
- [ ] 所有子任务归档后，父任务做最终集成审查（barrel 导出完整、文档与实现一致）。

## Task Map（children）

| 子任务 | 内容 | 依赖 |
|---|---|---|
| 08-30-tuffex-charts-foundation | 包脚手架 + Colors + TxChartLegend | 无 |
| 08-30-tuffex-charts-primitives | TxChart 容器 + 轴/网格/系列原语 + tooltip stage（Custom Chart 板块） | foundation |
| 08-30-tuffex-charts-timeseries | TxTimeseriesChart 全功能 | primitives |
| 08-30-tuffex-charts-sankey | TxSankeyChart | foundation（可与 timeseries 并行） |
| 08-30-tuffex-charts-maps | TxBubbleMap / TxChoroplethMap | foundation（可与 timeseries 并行） |
| 08-30-tuffex-charts-docs | nexus 六页 zh/en + demos + 接线 | 全部实现子任务 |

排序约束写入各子任务 prd（parent/child 不是依赖系统）。
