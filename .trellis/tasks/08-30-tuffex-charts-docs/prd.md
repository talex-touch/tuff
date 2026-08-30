# tuffex-charts nexus 文档与 demo

父任务：`08-30-tuffex-charts`（板块结构参照其 `research/kumo-reference/docs-pages/`）。**前置：foundation/primitives/timeseries/sankey/maps 全部归档。**

## Goal

在 nexus 文档站新增 Charts 分组（对应用户给的 kumo 侧栏截图：Charts / Colors / Timeseries / Maps / Sankey / Custom Chart），zh/en 各一套 + 可运行 demo，全程不 import echarts。

## Requirements

1. 内容落点 `apps/nexus/content/docs/dev/components/`（或经确认的 charts 子目录），六页 × zh/en：
   - `charts`（总览：可用图表卡片 + 色彩系统摘要 + Legend 用法）
   - `chart-colors`（语义/分类/顺序色板展示，明暗对照）
   - `timeseries-chart`（kumo 同构的 14 个场景 demo）
   - `maps`（Bubble + Choropleth，附小体积世界 GeoJSON demo 数据）
   - `sankey-chart`
   - `custom-chart`（原语组合：donut、双系列复合图、自定义 tooltip 插槽）
2. 走通 tuffex-new-component-wiring 记忆里的接线清单（nexus plugin/registry/sidebar/index），侧栏新增「Charts」分组；demo 经 demo-registry 注册（注意该链路在 master 与 docs 分支的差异，以实际 base 分支为准先核实）。
3. 文档规范：nexus frontmatter 8 字段（status `beta`、since 取下一未发布版）、中文段名惯例（不引入 `## Usage`）、H1 下不写导语、zh/en 段数相等、MDC 围栏同深度检查。
4. nexus 需将 `@talex-touch/tuffex-charts` 加入依赖（workspace:*）并确认 Nuxt/vite 对 workspace 包的解析与样式引入。
5. 禁幻影 API：每个文档示例的 prop/事件先对照包源码存在性核验。

## Acceptance Criteria

- [ ] 六页 zh/en 均可渲染，侧栏分组与截图结构一致；demo 无 echarts import
- [ ] mdc 围栏检查 + nexus typecheck（严格配置）全绿
- [ ] 文档示例逐个跑通（demo 组件真实挂载 tuffex-charts 组件）
- [ ] 与 kumo 六页逐节对照：场景覆盖不少于 kumo；已知行为差异（tooltip 边界等）在文档中注明
