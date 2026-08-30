# tuffex-charts Sankey 桑基图

父任务：`08-30-tuffex-charts`（设计见其 `design.md` §6；kumo 源 `research/kumo-reference/src/SankeyChart.tsx` + 815 行测试可作行为参照）。**前置：foundation 已归档**（不依赖 primitives，可与 timeseries 并行；并行时 barrel 只 append 自己的导出段）。

## Goal

交付 `TxSankeyChart`：d3-sankey 布局 + SVG 渲染，props 面对齐 kumo SankeyChart。

## Requirements

1. 新增依赖 `d3-sankey`。
2. Props：`nodes`（name/color?/value?/tooltipData?/isDrillable?/childCount?）、`links`（source/target 节点下标、value、isDrillable?）、`height=400`、`nodeWidth=8`、`nodePadding=10`、`left/right`、`showNodeValues?`（默认任一节点有 value 即开）、`nodeLabelLayout 'stacked'|'inline'`、`formatValue`（默认 toLocaleString）、`linkColor 'gradient'|'gray'`、`linkOpacity=0.5`、`defaultNodeColor?`、`showTooltip=true`。
3. 渐变连线：每 link 一个 `<linearGradient>`（source 色→target 色）；节点缺省色 palette 轮转。
4. emits：`node-click`/`link-click`；drillable 项 hover 出 pointer 光标与 childCount 提示。
5. tooltip：默认渲 name/value/tooltipData 键值对；自定义走作用域插槽（VNode，不是 HTML 字符串——kumo 的 XSS 转义面不带入）。
6. 空数据/单节点/环检测（d3-sankey 遇环会抛——捕获并渲染空态 + dev 警告，unguarded console.warn 惯例）。

## Acceptance Criteria

- [ ] 布局冒烟测：固定输入下节点/连线几何与 d3-sankey 输出一致；渐变/灰双模式
- [ ] 点击/hover 事件、下钻标记、两种 label 排布、value 格式化各有测试
- [ ] 环输入不崩溃；typecheck/lint/test/build 全绿；父对照表 Sankey 段更新
