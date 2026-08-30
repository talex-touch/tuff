# tuffex-charts 可组合图表原语（Custom Chart 板块）

父任务：`08-30-tuffex-charts`（API 形态见其 `design.md` §4）。**前置：foundation 已归档。** timeseries 子任务依赖本任务。

## Goal

交付组合式图表原语层：`TxChart` 容器 + `TxAxis`/`TxGrid` + 五种系列组件 + `TxChartTooltip` stage —— 即 kumo「Custom Chart」逃生舱的 Vue 对等物，同时覆盖 Charts 总览页的基础 line/bar/donut 能力。

## Requirements

1. `core/`：ChartContext（provide/inject：width/height/plot/xScale/yScale/registerSeries/palette.next）、scale 封装（linear/time/band，nice ticks）、accessor 工具（`keyof T | (d)=>V`）。
2. `TxChart`：ResizeObserver 测容器（量容器不量画布——OGL resize 教训）、`height=350`/`aspectRatio`（互斥）、`padding`、`xType`、`xDomain/yDomain` 显式或由系列 extent 自动并集、`yNice`、`#overlay` 插槽、宽度未测得（0）时不渲系列。
3. `TxAxis`：`position: bottom|left`、`ticks`、`format`、`name`（轴名居中）、文本/网线颜色走 CSS 变量。`TxGrid`：x/y 虚线网格。
4. 系列组件：`TxLineSeries`（curve、showSymbol 默认关）、`TxAreaSeries`（gradient 40%→0 垂直渐变）、`TxBarSeries`（band/时间分桶、stack 支持）、`TxScatterSeries`、`TxArcSeries`（donut/pie，无坐标系模式）。系列 props 统一 `data/x/y/color?`（accessor 模式，color 缺省 palette 轮转）。
5. `TxChartTooltip`：DOM overlay，`follow: 'both'|'x'`，容器钳制 + 视口翻转，默认 rows 渲染（色点+名+值）+ 作用域插槽。参考现有 `TxChartScrubber` 的钳制实现思路（不复用其代码，包不依赖 tuffex）。
6. 新增依赖：`d3-shape`（+ 已有 d3-scale/d3-array）、`d3-time`。

## Acceptance Criteria

- [ ] 用原语手搓出 line、stacked bar、donut 三个用例（测试或 playground），视觉/几何断言通过
- [ ] domain 自动推导：多系列 extent 并集正确；显式 domain 覆盖生效
- [ ] tooltip：两种 follow 模式定位与钳制的几何单测（fake rAF/pointer 事件驱动）
- [ ] jsdom 下 SVG path 断言（d3-shape 输出确定性）；typecheck/lint/test/build 全绿
- [ ] 父 design.md §12 对照表更新：`Chart`/`ChartProps` 行标记「改进：组合原语替代」
