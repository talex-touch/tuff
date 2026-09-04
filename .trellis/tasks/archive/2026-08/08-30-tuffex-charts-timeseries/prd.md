# tuffex-charts Timeseries 时序图

父任务：`08-30-tuffex-charts`（props 全表与行为清单见其 `design.md` §5；kumo 源 `research/kumo-reference/src/TimeseriesChart.tsx` 及 markers/thresholds/tooltip 辅助文件）。**前置：primitives 已归档。**

## Goal

交付 `TxTimeseriesChart`——功能面与 kumo TimeseriesChart 逐项对齐的高层时序组件（六板块中功能最重的一块）。

## Requirements

范围 = design.md §5 的 props/emits/v-model 全表 + 行为移植清单，要点：

1. line/bar（bar 自动堆叠）、`data` 的 color 可缺省。
2. 标记（markers）：聚簇算法移植（`clusterTimeseriesMarkers`/`getApproximateMarkerClusterInterval`）为纯函数 + 单测；竖虚线 + label 气泡 + hover 出标记 tooltip（含 description、簇内多条列出）。
3. 阈值（thresholds）：水平虚线 + 内侧右上 label；y domain 扩到覆盖阈值。
4. tooltip：`mode all/single`、`maxItems`+`+N more`、按值降序、二分最近点、`followCursor both/x`、隐藏系列剔除、越界兜底关闭。
5. `incomplete before/after`：边界外虚线段（切分含重叠一点，照 kumo 逻辑）。
6. `gradient`、`loading`（TxChartSkeleton：谐波波形 line/bar 两形态 + shimmer + reduced-motion，kumo 的 SVG loader 近乎直移）、`ariaDescription`。
7. 刷选：提供 `@time-range-change` 即启用 drag-lineX——拖拽画选区、选区外系列 30% 透明、松手 emit 并清选区；几何抽纯函数。
8. `v-model:hiddenSeries`（替代 kumo 命令式 legend action）：隐藏系列不画、tooltip 跳过；与 TxChartLegendItem 联动示例（测试里演示 hover 高亮 + 点击切换）。

## Acceptance Criteria

- [ ] 聚簇/二分/切分/刷选纯函数单测全绿（含空数据、单点、乱序时间戳边界）
- [ ] kumo Timeseries 文档页的 14 个场景（Basic/Markers/Thresholds/AxisFormat/Gradient/Incomplete/RangeSelection/CursorTracking/Boundary→记差异/Bar/LegendHighlight/LegendClick/Loading×2）逐个有对应测试或 playground 用例
- [ ] typecheck/lint/test/build 全绿；父 design.md §12 对照表 Timeseries 段逐 prop 更新状态
