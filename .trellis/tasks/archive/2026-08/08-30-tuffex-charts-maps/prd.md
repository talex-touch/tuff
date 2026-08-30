# tuffex-charts Maps 地图

父任务：`08-30-tuffex-charts`（设计见其 `design.md` §7；kumo 源 `research/kumo-reference/src/Maps.tsx`，1009 行，常量与算法直接移植）。**前置：foundation 已归档**（可与 timeseries/sankey 并行；barrel 只 append 自己的导出段）。

## Goal

交付 `TxBubbleMap` 与 `TxChoroplethMap`：GeoJSON + d3-geo 渲染，accessor 取数，能力面对齐 kumo Maps。

## Requirements

1. 新增依赖 `d3-geo`。
2. `maps/projection.ts` 移植 kumo 常量与纯函数：Mercator 纬度钳制 ±85.0511°、显示窗 `[[-180,80],[180,-58]]`、`projectedAspect`（容器 aspect-ratio）、`MAX_ZOOM_FACTOR=8`；`projection` prop（自定义 d3-geo 投影 / `null` 裸经纬度）。
3. 共同：`geoJson`（调用方提供，不打包）、`nameProperty='name'`、陆地 `geoPath` 底图（色 `--tx-chart-map-area`）、`center`/`zoom`、`roam=false`（wheel 缩放 + 拖拽平移，`<g transform>` 实现，限幅 `[min(1,zoom), zoom×8]`，数学抽纯函数）、tooltip（默认渲名+值，作用域插槽自定义）。
4. `TxBubbleMap`：`data/lng/lat/value/name?` accessor；sqrt 半径比例尺 `minRadius=6`/`maxRadius=26` 或 `bubbleSize(v)`；`bubbleColor`（默认 categorical-1）/`bubbleBorderColor`（MapStyle：常量或 (row)=>v）。
5. `TxChoroplethMap`：`name/value` accessor 连接 feature；连续色阶——归一化后在 `--tx-chart-map-scale-1..5` 相邻档间用 `color-mix(in oklab, …)` 插值（自动随主题翻转）；`min/max`、`noDataColor`、`showLegend`（CSS linear-gradient 色带）、`valueFormat`；emits `region-hover(row|undefined)`/`region-click(row)`。

## Acceptance Criteria

- [ ] 投影/aspect/roam 限幅纯函数单测（含钳制边界、反投影往返）
- [ ] choropleth：数据缺失区域用 noDataColor；min/max 覆盖生效；color-mix 表达式生成正确（字符串断言）
- [ ] bubble：半径比例尺两端点与覆盖函数；accessor 的 key 与函数两形态
- [ ] jsdom 下用小型 GeoJSON fixture 断言 path 生成；typecheck/lint/test/build 全绿；父对照表 Maps 段更新
