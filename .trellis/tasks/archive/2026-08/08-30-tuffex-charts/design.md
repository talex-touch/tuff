# tuffex-charts 技术设计

参照物：`research/kumo-reference/`（Cloudflare kumo，MIT）。核心结论：kumo 图表 = ECharts 6 薄封装 + d3-geo；本包复刻其 API 形态与能力面，渲染层自研（Vue 渲 SVG，d3 微模块做数学）。

## 1. 包结构与构建

```
packages/tuffex-charts/
├── package.json          # @talex-touch/tuffex-charts；peer: vue ^3.5
├── vite.config.ts        # lib mode：es + cjs 双产物 + vite-plugin-dts + css 抽取
├── tsconfig.json
├── vitest.config.ts      # jsdom 环境
├── src/
│   ├── index.ts          # barrel：组件 + 类型 + ChartPalette
│   ├── style/
│   │   ├── tokens.scss   # :root + .dark/[data-theme='dark'] 两套 CSS 变量
│   │   └── index.scss
│   ├── palette/          # ChartPalette（JS 字面值 API）+ cssVar 助手
│   ├── core/             # ChartContext、scale 封装、公共类型、几何纯函数
│   ├── chart/            # TxChart 容器（尺寸测量、provide 上下文）
│   ├── axis/  grid/      # TxAxis、TxGrid
│   ├── series/           # TxLineSeries、TxAreaSeries、TxBarSeries、TxArcSeries、TxScatterSeries
│   ├── tooltip/          # TxChartTooltip（DOM overlay stage）
│   ├── legend/           # TxChartLegendItem（small/large/loading）
│   ├── skeleton/         # TxChartSkeleton（谐波波形，line/bar 两形态）
│   ├── timeseries/       # TxTimeseriesChart + markers/thresholds/cluster 纯函数
│   ├── sankey/           # TxSankeyChart
│   └── maps/             # TxBubbleMap、TxChoroplethMap、projection.ts
└── __tests__/            # 或按 tuffex 惯例放各组件目录内 __tests__
```

- pnpm-workspace `packages/*` 通配已覆盖，无需改 workspace 配置。
- exports：`.`（es/cjs/types）、`./style.css`。跟 tuffex 主包对齐。
- 组件统一 `Tx` 前缀 + `defineOptions({ name })`；文件内注释按仓库惯例标注 kumo 出处（参照 spark-chart 对 Beautiful UI 的 attribution 格式）。

## 2. 依赖

| 依赖 | 用途 | 说明 |
|---|---|---|
| d3-scale + d3-array + d3-time | 线性/时间/band 比例尺、nice ticks | 纯数学，可摇树 |
| d3-shape | line/area/arc/stack 路径生成、curve | 同上 |
| d3-sankey | 桑基布局 | 手写风险高，直接用 |
| d3-geo | Mercator/geoPath | kumo 自己也在用 |
| @types/d3-*（dev） | 类型 | |

peer 仅 `vue ^3.5`。**不**依赖 echarts、不依赖 @talex-touch/tuffex 运行时。

## 3. 色彩系统（Colors 板块）

双轨：CSS 变量为组件内部唯一取色途径；JS `ChartPalette` 供包外拿字面值（kumo API 兼容）。

**CSS 变量**（tokens.scss，全部带 fallback，`.dark` 与 `[data-theme='dark']` 两个选择器同时覆盖，对齐 bui-tokens 惯例）：

```
--tx-chart-categorical-1..6      # Blue #4290F0 / Yellow / Pink / Purple / Teal / Orange
--tx-chart-semantic-attention|warning|success|neutral|disabled|skeleton
--tx-chart-sequential-blues-1..5
--tx-chart-text-primary|secondary
--tx-chart-grid-line             # text-primary @ 20% 透明度
--tx-chart-map-area              # 无数据陆地
--tx-chart-map-scale-1..5        # choropleth 色阶（明暗两套方向相反）
```

色值起步直接沿 kumo（Cloudflare 仪表盘验证过的配色，明暗差异集中在 Yellow/Neutral/Disabled/Skeleton）；后续换 tuffex 品牌色时用 dataviz skill 的校验器过对比度。

**JS API**（kumo `ChartPalette` 同名同形）：

```ts
ChartPalette.categorical(index, isDark?)      // 模 6 取色
ChartPalette.semantic(name, isDark?)          // 'Attention' | 'Warning' | ...
ChartPalette.sequential('blues', isDark?)     // 5 档数组
ChartPalette.text('primary'|'secondary', isDark?)
ChartPalette.mapColors(isDark?)               // { area, bubble, scale[] }
ChartPalette.categoricalVar(index)            // 'var(--tx-chart-categorical-N, #hex)'（新增，供自定义组件写模板）
```

## 4. 原语层（Custom Chart 板块的对等设计）

kumo 的逃生舱是 `<Chart echarts={echarts} options={raw}/>`。没有 echarts 可透传，Vue 下自然的逃生舱是**组合式原语**：

```vue
<TxChart :height="350" :x-type="'time'" :y-nice="true">
  <TxGrid y />
  <TxAxis position="bottom" :ticks="5" :format="fmtTime" name="Time" />
  <TxAxis position="left" :format="fmtCount" name="Count" />
  <TxAreaSeries :data="series" :x="d => d.ts" :y="d => d.value" gradient />
  <TxLineSeries :data="series" :x="d => d.ts" :y="d => d.value" curve="monotone" />
  <template #overlay><!-- 自定义标注/tooltip --></template>
</TxChart>
```

**ChartContext**（provide/inject，`core/context.ts`）：

```ts
interface ChartContext {
  width: Ref<number>; height: Ref<number>       // 容器实测（ResizeObserver，注意 OGL resize 教训：量容器不量画布）
  plot: ComputedRef<{ x; y; w; h }>             // 去掉 padding/轴位后的绘图区
  xScale: ComputedRef<Scale>; yScale: ComputedRef<Scale>
  registerSeries(extent: SeriesExtent): () => void   // 系列挂载时上报数据域，用于自动 domain
  palette: { next(): string }                    // 未显式给色的系列按注册序取 categorical
}
```

- `TxChart` props：`height`（默认 350）、`aspectRatio`（互斥，优先）、`padding`、`xType: 'linear'|'time'|'band'`、`xDomain/yDomain`（缺省由系列 extent 自动并集）、`yNice`。
- 系列 props 统一：`data: T[]`、`x/y: keyof T | (d:T)=>number`（accessor 模式，与 kumo Maps 一致）、`color?`（缺省取 palette）。
- `TxArcSeries`（donut/pie）不依赖坐标系：`TxChart` 无轴时即纯 SVG 画布。
- 基础 bar/line/donut（kumo Charts 总览页的 Available Charts）全部由这层组合得到，不做独立「BarChart 组件」。

**TxChartTooltip（stage）**：DOM overlay（非 SVG），借鉴现有 `TxChartScrubber` 的钳制思路 —— 跟随光标（`follow: 'both' | 'x'`，`'x'` 时垂直位置固定）、容器内钳制 + 视口翻转。不实现 kumo 借 Base UI 做的 clipping-ancestors 全链路碰撞（差异记入对照表）。插槽自定义内容，默认渲染 rows（色点 + 名称 + 值）。

## 5. TxTimeseriesChart（Timeseries 板块）

组合原语构建的高层组件。Props 对照 kumo（Vue 化）：

```ts
interface TimeseriesData { name: string; data: [number, number][]; color?: string }  // color 可缺省（改进：kumo 必填）
interface TimeseriesMarker { timestamp: number; label?: string; description?: string;
  color?: string; lineStyle?: 'solid'|'dashed'|'dotted' }
interface TimeseriesThreshold { value: number; label?: string; color: string }

props: {
  type?: 'line' | 'bar'                  // bar 自动堆叠（stack 'total'，kumo 同）
  data: TimeseriesData[]
  markers?, thresholds?
  xAxisName?, yAxisName?, xAxisTickCount? (默认 5), yAxisTickCount?
  xAxisTickFormat?, yAxisTickFormat?, tooltipValueFormat?: (v:number)=>string
  tooltipMode?: 'all' | 'single'         // single = 取离光标 y 最近的系列
  tooltipMaxItems?: number (默认 10)      // 超出显示 "+N more"
  tooltipFollowCursor?: 'both' | 'x'
  incomplete?: { before?: number; after?: number }   // 边界外画虚线段（按 kumo 的切分逻辑，含重叠一点）
  gradient?: boolean                      // line 下垂直渐变填充（40% → 0）
  loading?: boolean                       // 换渲 TxChartSkeleton
  height?: number (默认 350)
  ariaDescription?: string                // svg role=img + aria-label
}
emits: {
  'time-range-change': (from: number, to: number)    // 提供即启用 lineX 刷选
}
v-model:hiddenSeries?: string[]          // 替代 kumo 的 enableLegendSelection + echarts 命令式 action；
                                         // 隐藏系列不画、tooltip 跳过；与 TxChartLegendItem 组合使用
```

行为移植清单（源文件见 research）：
- 标记聚簇：`clusterTimeseriesMarkers` + `getApproximateMarkerClusterInterval`（按 tick 间隔近似聚簇，簇 label 显示数量）→ 纯函数直接移植 + 单测。
- 阈值：虚线水平线 + 右上内侧 label；y domain 扩展到覆盖阈值 extent（min/max 回调逻辑同 kumo）。
- tooltip 行：二分查最近点（`findNearest`）、按值降序、legend 隐藏系列剔除、maxItems 截断。
- 刷选：自研 drag-lineX overlay —— 拖拽生成半透明选区，松手 emit 后清除，选区外系列 30% 透明度（outOfBrush 效果）。
- 骨架：kumo 的谐波波形 loader 本来就是 SVG（`chartLoaderWave` 三谐波叠加，line/bar 两形态 + shimmer + reduced-motion），近乎直移。
- 右键菜单后 tooltip 卡死的兜底（窗口级 mousemove 越界即关）也一并移植。

## 6. TxSankeyChart（Sankey 板块）

- 布局：`d3-sankey`（nodeWidth/nodePadding/left/right 映射到布局参数）。
- Props 对照 kumo：`nodes`（name/color?/value?/tooltipData?/isDrillable?/childCount?）、`links`（source/target 为节点下标、value、isDrillable?）、`showNodeValues?`（默认：任一节点有 value 即开）、`nodeLabelLayout: 'stacked'|'inline'`、`formatValue?`、`nodeWidth=8`、`nodePadding=10`、`linkColor: 'gradient'|'gray'`、`linkOpacity=0.5`、`defaultNodeColor?`、`showTooltip=true`、`height=400`。
- emits：`node-click`、`link-click`；tooltip 默认渲 name/value/tooltipData，插槽或 `tooltipFormatter`（返回 VNode/插槽作用域，**不是 HTML 字符串** —— 规避 kumo 被迫做的 XSS 转义面）。
- 渐变连线：每条 link 一个 `<linearGradient>`（source→target 色）；节点色缺省按 palette 轮转。

## 7. TxBubbleMap / TxChoroplethMap（Maps 板块）

- 投影：`geoMercator` + 纬度钳制 ±85.0511°，显示窗 `[[-180, 80], [180, -58]]`（裁两极），`projection` prop 可换 d3-geo 任意投影、`null` 为裸经纬度 —— 全部照 kumo 常量移植。容器高度按 `projectedAspect`（赤道量宽、中央经线量高）算 aspect-ratio。
- 陆地：`geoPath` 一次性生成 path（GeoJSON 由调用方传入，`geoJson` + `nameProperty` 默认 `'name'`）。
- accessor 模式直移：`MapAccessor<T,V> = keyof T | (row)=>V`；样式 `MapStyle<T,V> = V | (row)=>V`。
- **TxBubbleMap**：`lng/lat/value/name?` accessor；半径 `sqrt` 比例尺 `minRadius=6`/`maxRadius=26` 或 `bubbleSize(value)` 覆盖；`bubbleColor`（默认 categorical-1）/`bubbleBorderColor`。
- **TxChoroplethMap**：`name/value` accessor 连接 GeoJSON feature；**连续**色阶（kumo 是 visualMap continuous）——归一化后落在 5 档 ramp 之间用 CSS `color-mix(in oklab, var(--tx-chart-map-scale-N), var(--tx-chart-map-scale-N+1) p%)` 插值，零 JS 颜色解析、自动随主题翻转；`min/max`、`noDataColor`、`showLegend`（CSS linear-gradient 色带）、`valueFormat`、tooltip 插槽、`region-hover`/`region-click` emits。
- roam（`roam=false` 默认）：wheel 缩放 + 拖拽平移，实现为 `<g transform>` 矩阵，缩放限幅 `[min(1, zoom), zoom × 8]`（kumo 常量）。交互数学抽纯函数单测。

## 8. TxChartLegendItem + TxChartSkeleton（Charts 总览板块）

- `TxChartLegendItem`：`variant: 'small' | 'large'`；props `name/color/value/unit?/inactive?/loading?`；点击/hover 事件供联动（配合 `v-model:hiddenSeries`）。loading 态渲骨架行。
- 遵循 tuffex 无 i18n 惯例：文案 props 默认英文（如 `+N more` 模板可由 prop 覆盖）。

## 9. 主题、可访问性、SSR

- 取色一律 `var(--tx-chart-*, fallback)`，明暗自动；无 isDarkMode prop。
- svg `role="img"` + `aria-label`（ariaDescription）；legend 项键盘可点（Enter/Space）；shimmer 尊重 `prefers-reduced-motion`。
- nexus 是 Nuxt：组件首帧无窗口尺寸依赖（width 初值 0 时不渲系列），客户端挂载后测量 —— 不强制 `.client`，但 docs demo 按现行 demo 机制走。

## 10. 测试与验证

- vitest + jsdom：SVG path/几何断言（spark-chart 先例）；聚簇/二分/切分/刷选/roam 数学纯函数单测；palette API 快照；sankey/geo 冒烟（d3 输出确定性）。
- 契约测试：barrel 导出完整性（missing-export.contract 先例）。
- 双侧 typecheck：tuffex 弱配置 + nexus 严配置（`noUncheckedIndexedAccess`）都要过（仓库已知踩坑点）。
- 验证命令：`pnpm --filter @talex-touch/tuffex-charts typecheck / test / build`；docs 侧 `pnpm nexus:dev` 人工核 + mdc 围栏检查。

## 11. 风险与取舍

| 风险 | 处置 |
|---|---|
| roam 与刷选是自研交互里最易出细节 bug 的两处 | 数学抽纯函数 + 单测；行为对照 kumo demo 手测 |
| tooltip 碰撞只做容器钳制+视口翻转，弱于 kumo 的 clipping-ancestors | 记入对照表；docs 注明 |
| SVG 大数据量性能（万点级） | 文档写明建议每系列 ≤ ~5k 点；canvas 渲染器 YAGNI 不做 |
| color-mix 依赖较新 CSS | Electron 41 / 现代浏览器均支持；nexus 目标环境满足 |
| 色值/算法移植的许可 | kumo MIT，attribution 注释 + LICENSE 已存 research |

## 12. kumo 对照表（验收核对用）

各实现子任务完成时逐行更新「状态」列（同名 / 改名 / 改进 / 缓议），终审以此表核缺项。初始状态见各子任务 prd 的范围清单；对照源：
- `research/kumo-reference/src/index.ts`（导出面）
- `research/kumo-reference/src/*.tsx|ts`（逐 prop）
- `research/kumo-reference/docs-pages/`（六板块文档结构）

已确定的有意偏离（预登记）：
1. `echarts` prop → 删除（无实例可传）。
2. `isDarkMode` prop → 删除，CSS 变量自动（JS ChartPalette 保留 isDark 参数）。
3. `dangerousHtmlFormatter` / HTML 字符串 tooltip → 插槽/VNode（消除 XSS 面）。
4. `enableLegendSelection` + echarts 命令式 action → `v-model:hiddenSeries`。
5. 低层 `Chart(options)` → 组合原语 `TxChart` + 子组件。
6. `TimeseriesData.color` 必填 → 可缺省（palette 轮转）。
7. `optionUpdateBehavior`、`onEvents`（echarts 专属）→ 删除；事件按各组件语义化 emits 提供。
8a. **Sankey 已落地（2026-08-30）**：props 面全对齐；tooltip 改插槽；环输入降级空渲染+dev 警告（kumo 会抛）。
8b. **Maps 已落地（2026-08-30）**：投影常量/纬度钳制/裁两极/sqrt 半径/zoom 限幅全移植；`projection` prop 接 d3-geo 实例（kumo 是 {project,unproject} 包装）、`null`=equirectangular；roam 用 SVG transform 且符号随缩放反缩（尺寸恒定）；choropleth 连续色阶 color-mix 实现、showLegend=CSS 渐变条；`tooltipFormatter`(HTML) → 插槽；choropleth 插槽作用域用 `regionName`（`name` 与 slot 属性冲突）。BubbleMap 增 `bubbleHover`/`bubbleClick` emits 同 kumo onBubbleHover/Click。
8. **Timeseries 已落地（2026-08-30）**，两处有意简化：`tooltipBoundary`（clipping-ancestors 碰撞）→ 容器钳制+视口翻转；刷选拖拽中的 outOfBrush 30% 变淡（瞬态）→ 只画选区矩形。新增改进：`highlightedSeries` prop 替代 echarts dispatchAction 高亮、`clusterLabel`/`timestampFormat` 文案可覆盖（no-i18n 惯例）、`width` prop（SSR/测试）。其余 14 场景能力逐项有测试或实现（52 用例）。
