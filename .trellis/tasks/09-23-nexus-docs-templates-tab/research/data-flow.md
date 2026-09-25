# Research: Data & Flow templates (Dashboard / Automation)

- **Query**: component APIs, charts-subpath resolution, sizing/teleport behaviour, motion, and composition proposals for the "数据流程" template group (Dashboard 数据看板, Automation 自动化编排).
- **Scope**: internal (tuffex source, Nexus config, existing demos, archived audit notes)
- **Date**: 2026-09-23
- Paths are repo-relative. `C/` = `packages/tuffex/packages/components/src/`, `D/` = `apps/nexus/app/components/content/demos/`.

---

## Import convention

**Components: rely on global auto-registration. Do not import them.**

- `apps/nexus/modules/tuffex-components.ts` is a local Nuxt module (auto-loaded from `modules/`). It reads every `C/<dir>/index.ts` barrel as text, follows one `export *` hop, and skips the aggregate directories `ai/base/pro/utils` (:37). Every value export that matches `/^(?:Tx|Tuff)[A-Z]…$/` (:30) is registered with `addComponent({ name, filePath: '<prefix>/<dir>', export: name })` (:124-130).
  - `<prefix>` (:91-96) is `@talex-touch/tuffex` in dev (dist mode) and `@tuffex-components` in production and in `NUXT_TUFFEX_SOURCE=true` mode.
  - This means `<TxFlowchart>`, `<TxSparkChart>`, `<TxChartScrubber>`, `<TxStatCard>`, `<TxTimeseriesChart>`, `<TxChartLegendItem>`, `<TxChartGrid>` and the rest all resolve with no import. Nuxt handles lazy per-route chunks.
  - `TxSwitch` is exported as both `TuffSwitch` and `TxSwitch`, so both names register (`C/switch/index.ts`).
- **Explicit imports** appear only for non-component exports (`ChartPalette`, `toast`, `prefersReducedMotion`) and for chart primitives that must share one module instance. Examples: `D/ChartsLegendDashboardDemo.vue:2-3` and `D/CustomChartComposedDemo.vue:2`, which imports `TxChart` together with its series.
  - Always use the component subpath `@talex-touch/tuffex/<dir>`. No demo imports from bare `@talex-touch/tuffex` (0 of 399 files).
  - Counts across `D/`: `@talex-touch/tuffex/charts` ×32 import lines, `/group-block` ×15, `/select` ×15, `/utils` ×3.
- **Types**: 46 demos use `import type { … } from '@talex-touch/tuffex/<dir>'` and 8 use `@tuffex-components/<dir>` (e.g. `D/StatCardInsightVariantDemo.vue:2`).
  - The flowchart and fine-tune demos instead mirror the interface locally, "so the demo does not depend on the tuffex barrel having been rebuilt" (`D/FlowchartFlowchartDemo.vue:7-16`, `D/FineTuneCardFineTuneCardDemo.vue:7-16`). Either pattern passes.
- **Utils**: `import { toast, clearToasts } from '@talex-touch/tuffex/utils'` (`D/ToastToastDemo.vue:4`, `D/ComponentsFeedbackTaskCenterDemo.vue:3`).
- **Demo idioms to copy**:
  - `const { locale } = useI18n()` (auto-imported) with a zh/en `copy` computed inside the demo.
  - Deterministic data from sin-hash jitter, never `Math.random()` (`D/ChartsLegendDashboardDemo.vue:31-38`), and fixed epoch starts such as `Date.UTC(2026, 8, 13, …)`.
  - Start timers in `onMounted` and clear them in `onBeforeUnmount`, with `watch(locale, replay)` (`D/ToolChipsRunFlowDemo.vue:125-156`).
  - `defineExpose({ replayDemo })` is picked up by the wrapper's Reset button (`TuffDemoWrapper.vue:86` tries `resetDemo ?? replayDemo ?? reset ?? replay`, otherwise re-keys). Examples: `D/ProgressBarUploadDemo.vue:62`, `D/BaseAnchorBeadDemo.vue:37`.
- **Client-only**: every demo renders inside `<ClientOnly>` (`TuffDemoWrapper.vue:193-213`) and mounts lazily through an IntersectionObserver with a 240px root margin (`demo-lazy.ts`, `TuffDemoWrapper.vue:141-157`). There are no SSR concerns for charts, canvas or timers.
  - `.tuff-demo__window` has `overflow: hidden` (`TuffDemoWrapper.vue:283`) and the preview has 28px padding (:361-364). Absolutely-positioned menus that are not teleported can clip at the window edge.
- **Icons**: Nexus UnoCSS scans only Nexus's own `.vue/.ts…` modules (`apps/nexus/uno.config.ts:17-27`). Tuffex dist `.vue.js` files are not scanned.
  - An `i-*` class that tuffex uses internally renders only if some Nexus file also contains that string. The template `.vue` file is scanned, so any icon class written literally in the template is safe.

## Charts subpath in Nexus

1. **Resolution** of `import { … } from '@talex-touch/tuffex/charts'`:
   - The Vite alias `/^@talex-touch\/tuffex\/([a-z0-9-]+)$/` points to `tuffexComponentEntry` (`apps/nexus/nuxt.config.ts:558`, defined at :44-46).
   - Dev default (dist mode): `packages/tuffex/dist/es/charts/index.js` (it exists, built 09-23 18:07). With `NUXT_TUFFEX_SOURCE=true` it resolves to `C/charts/index.ts` instead (`build/tuffex-dev-mode.ts`).
   - Production also resolves to dist.
   - TS paths `'@talex-touch/tuffex/*'` (:588) point to dist `.d.ts` in dev dist mode and to source otherwise.
   - If dist is missing, the dev server throws "tuffex dist is missing" at config load. Rebuilding tuffex while dev is running requires a dev restart (`.trellis/tasks/archive/2026-09/09-21-bui-parity-audit/audit-result.md:75`).
2. **Styles**:
   - `tuffexOnDemandStylePlugin` (`nuxt.config.ts:563-566`; source `packages/tuffex/packages/script/build/on-demand-style-plugin.ts`) injects `import '@talex-touch/tuffex/charts/style.css'` plus its `style-deps.json` closure for every static import from a subpath. In dev dist mode it also injects into each component's dist entry, which covers auto-registered components.
   - `dist/es/charts/style.css` carries the chart tokens `--tx-chart-categorical-1..6`, `--tx-chart-semantic-*`, `--tx-chart-text-*` and `--tx-chart-grid-line` on `:root`, with dark overrides under `[data-theme='dark'], .dark` (`C/charts/src/style/tokens.scss`). Nexus toggles `html.dark` through `@nuxtjs/color-mode` (`classSuffix: ''`).
3. **The main barrel also re-exports charts**: `C/components.ts:20` has `export * from './charts/index'`, so `@talex-touch/tuffex` exposes them too. Demos never use that path.
   - Name clash: the charts `TxGrid` is renamed to **`TxChartGrid`** (`C/charts/index.ts:56`), so it does not collide with layout `TxGrid`.
4. **What `@talex-touch/tuffex/charts` exports** (`C/charts/index.ts`):
   - SVG family: `TxTimeseriesChart`, `TxTimeseriesSkeleton`, `TxChart` (container), `TxAxis`, `TxChartGrid`, the series `TxLineSeries/TxAreaSeries/TxBarSeries/TxScatterSeries/TxArcSeries`, `TxChartTooltip` (plus `placeTooltip`), `TxChartLegendItem`, `TxSankeyChart` (plus `computeSankeyLayout`), and maps `TxBubbleMap/TxChoroplethMap` (the host brings GeoJSON; `D/MapsBubbleMapDemo.vue` loads `/geo/world-countries.geo.json`).
   - Palette: `ChartPalette` (`categorical`, `categoricalVar`, `semantic`, `sequential`, `text`, `mapColors`) and `CHART_LIGHT_COLORS/CHART_DARK_COLORS`.
   - Motion helpers: `prefersReducedMotion`, `tween`, `useEnterProgress`, `useTweenedNumbers`, `easings`, `ENTER_DURATION = 1000`, `UPDATE_DURATION = 500`, `STATE_DURATION = 300`, `ANIMATION_THRESHOLD = 2000`.
   - Timeseries helpers: `clusterTimeseriesMarkers`, `splitIncompleteSegments`, `formatTimestamp`.
   - ECharts family (optional peer): `TxEChart`, `TxLineChart`, `TxBarChart`, `TxPieChart`, `TxFunnelChart`, `TxRadarChart`, `TxGaugeChart`, `TxScatterChart`, `TxHeatmapChart`, `TxTreemapChart`, plus `build*ChartOption`, `loadECharts`, etc.
     - These dynamic-import `echarts/*` on mount (`C/charts/src/echart/src/core/loader.ts`).
     - `echarts ^6.1.0` is a Nexus dependency and is pre-bundled (`nuxt.config.ts:528-531`). If the runtime is missing they show a note instead of a blank box.
   - **Not in `/charts`**: `TxSparkChart` and `TxChartScrubber` live in `C/spark-chart/` (subpath `@talex-touch/tuffex/spark-chart`). Existing demos use them through auto-registration.
5. **Client-only / SSR**:
   - `TxChart` renders its `<svg>` only once the ResizeObserver-measured width is above 0 (`C/charts/src/chart/src/TxChart.vue:28-51,99-113`). It is SSR-safe but paints nothing on the server.
   - `TxSparkChart` draws its canvas after mount.
   - `TxEChart` initialises in `onMounted`.
   - Inside `TuffDemoWrapper` all of these are already client-only.

## Component cheat sheets

### TxStatCard (`C/stat-card/`)
- Props (`src/types.ts`, defaults at `TxStatCard.vue:9-13`):
  - `value: number|string` (required). Numbers are formatted with `Intl en-US`; strings such as `'1.28M'` are shown verbatim.
  - `label: string` (required).
  - `iconClass=''`, `clickable=false` (adds a cursor only; the root is a `div role="group"`, so it is not keyboard-reachable).
  - `insight?: { from, to, type?: 'percent'|'delta', color?: 'success'|'danger'|'warning'|'info'|css, iconClass?, suffix?, precision? }`.
  - `variant: 'default'|'progress'`, `progress?: number` (a conic ring), `meta?`, `ariaLabel?`.
- Slots: `label`, `value` (the demo puts `TxTextMorph` plus a unit here, `D/StatCardInsightVariantDemo.vue:62-68`), `meta` (progress variant). No events and no expose.
- Sizing: `width: 100%`, `min-height: 112px` (:292), padding 16, value 28px/700. It reflows with its container.
- Motion: the glow fade-in goes through `requestAnimationFrame`; hover scale/blur transitions run 0.18–0.65s. There is **no** `prefers-reduced-motion` guard in the file.
- Caveats:
  - The default insight icon is `i-carbon-growth` or `i-carbon-arrow-down` (:120). **`i-carbon-arrow-down` appears in no Nexus source file (0 matches)**, so negative insights render a blank icon unless the template passes `insight.iconClass` explicitly.
  - Parallel task `09-23-nexus-base-gallery-sidebar` R6 is redesigning the insight row, glow and hover. Its R6.3 promises props, slots and events stay the same, but visuals will change, so screenshot after it lands.
- Borrow from: `D/StatCardInsightVariantDemo.vue`, `D/ComponentsOperationsStatusDemo.vue`.

### TxSparkChart (`C/spark-chart/`)
- Props (`src/types.ts`, defaults at `TxSparkChart.vue:14-34`):
  - `series: SparkSeries[]` (required), `theme='auto'`, `grid=false`, `gridLines=4`, `lineWidth=2.25`, `curve='monotone'` (`'linear'|'monotone'|'natural'|'step'`).
  - `xAxis=false`, `yAxis=false`, `xTicks=3`, `yTicks=4`, `xTickFormat?`, `yTickFormat?`.
  - **`padding` defaults to `{ top: 24, right: 0, bottom: 22, left: 0 }`** (`geometry.ts:9-12`). A tiny cell such as a table row must override it, e.g. `{ top: 4, bottom: 4 }`, or the plot height collapses.
  - `domain?: [min, max]` (fits the data otherwise), `activeIndex?: number|null` (undefined means the chart owns hover state), `interactive=true`, `baseline=true` (a dashed rule at each series' first value), `endpoint=true`, `animation=true`, `ariaLabel?`.
- Data:

  ```ts
  interface SparkPoint { time: number, value: number }
  interface SparkSeries { id: string, data: SparkPoint[], color?: string, label?: string }
  ```

- Events: `update:activeIndex`, `hover(index)`, `leave`. Expose: `redraw()` (:296).
- Sizing: the root is `width: 100%; height: 100%`, so **the parent needs an explicit height** (demos use `.stage { height: 166–178px }`).
  - A ResizeObserver on the root re-measures and redraws (:276-282).
  - A resize re-projects the geometry, and `useTweenedNumbers` **morphs 500ms to the new size**, so teleporting into the overlay shows a morph rather than a snap. Under reduced motion it is instant.
  - Changing the point count morphs by index. Keep a constant sample count across time ranges, or `:key` the chart by range to replay the 1000ms enter animation.
- Theme/colour: canvas can't read CSS vars, so `color: 'var(--token, …)'` is resolved with `getComputedStyle` on the chart root (:136-139). Omitting colour picks from `--tx-bui-accent/orange/green/red`. `useAutoTheme` watches `class`/`data-theme` on `<html>/<body>` and triggers a redraw on theme toggle.
- Motion: enter 1000ms and update 500ms via rAF. Both are skipped under `prefers-reduced-motion` or above 2000 points (`C/charts/src/core/animate.ts:111-116,187-204`).
- Borrow from: `D/SparkChartSparkChartDemo.vue` (scrubber, axes, time formatter), `D/InsightCardsInsightCardsDemo.vue`.

### TxChartScrubber (`C/spark-chart/`, exported alongside TxSparkChart)
- Props (`TxChartScrubber.vue:15-22`): `pointCount: number` (required), `activeIndex?` (controlled if defined), `rows?: ChartTooltipRow[]` (`{ label, value, color? }`), `timeLabel?`, `tooltip=true`, `anchorMargin=8`, `disabled=false`.
- Events: `update:activeIndex`, `scrub(index)`, `leave`. Slots: default (the chart), `tooltip { index, rows }`.
- Sizing: a `position: relative; overflow: hidden` stage (the host sets its height). It reads the wrapped chart's `--tx-bui-plot-left/right` so the crosshair lines up with the samples. A ResizeObserver covers both the stage and the tooltip anchor (:130-146). The tooltip is DOM (not canvas) and edge-clamped. `touch-action: pan-y`.
- Status: the scrub layer is complete and verified in a browser (`archive/2026-09/09-21-bui-parity-audit/audit-result.md:27,70`). "Missing scrub" findings were a static-screenshot artefact.

### TxAllocationBar (`C/allocation-bar/`)
- Props (defaults at :9-15): `segments: AllocationSegment[]`, `modelValue?` (selected key; defaults to the first), `legend=true`, `detail=false`, `ariaLabel='Allocation segments'`, `percentFormatter?`.
- Data: `{ key, label, short?, percent /*0-100*/, amount?, color?, description? }`. Widths are `calc(percent% - gapShare)`, so percents should add up to 100.
- Events: `update:modelValue(key)`, `change(segment)`. There is **no hover event**. It is a radiogroup with roving arrow keys.
- Sizing: fully CSS-percentage based, so it follows its container. Track 36px, legend chips 11px.
  - **The legend is `display: flex` with no wrap** (:253-258), so keep to 4 segments or fewer with `short` codes in a ~250px rail.
- Fallback colours are accent, ink, ink-2, ink-3 (:26-31). Pass `color: ChartPalette.categoricalVar(i)` to match the chart series.
- Motion: 0.3–0.5s transitions, with reduced-motion guards.

### TxSignalMeter (`C/signal-meter/`)
- Props: `value` (lit bars, clamped), `max=3`, `tone='currentColor'` (any CSS colour, e.g. `var(--tx-bui-green)`), `label?` (without it the meter is `aria-hidden`), `barHeight=10`, `barWidth=4`.
- An inline element with a 0.3s colour transition and a reduced-motion guard. No events or slots.
- Borrow from: `D/SignalMeterLevelsDemo.vue` (green/orange/red/ink-3 levels).

### TxDataTable (`C/data-table/`)
- Props (defaults at :10-29):
  - `columns`, `data`, `rowKey?`, `loading`, `emptyText='No data'`, `striped`, `bordered`, `hover=true`, `interactiveRows`.
  - `selectable`, `selectedKeys` (v-model).
  - Sorting: `defaultSort` (uncontrolled) or `sort` (controlled, v-model), `sortOnClient=true`, `sortCycle 'tri'|'bi'`.
  - `tableLayout 'auto'|'fixed'`, `nowrap`, **`maxHeight`** (turns the table into its own scroll container), `scrollX`, `stickyHeader`, `stickyFooter`, `rowClass?`, `highlightSelected`.
- Column type: `{ key, title, dataIndex?, width?, minWidth?, maxWidth?, auto?, fixed?, nowrap?, align?, sortable?, sorter?(a,b), format?(value,row,i), headerClass?, cellClass? }`.
- Events: `update:selectedKeys`, `selectionChange`, `sortChange`, `update:sort`, `rowClick({ row, index })` (listening makes rows keyboard-focusable).
- Slots: `cell-<key> { row, column, value, index }`, `header-<key> { column, sorted, order, toggle }`, `footer-<key> { column, data }`, `footer { columns, data, selectedKeys }` (you supply the whole `<td>` set), `empty`.
- Theming vars: `--tx-data-table-row-hover-bg`, `--tx-data-table-row-selected-bg` (`D/DataTableRecordsDemo.vue:222-227`).
- Sizing: `width: 100%`. Pass a larger `maxHeight` when the template is expanded (it is a number/px prop).
- Borrow from: `D/DataTableRecordsDemo.vue`, which composes TxTag, TxDotIndicator and TxCellLink cells with sticky header/footer, `sort-cycle="bi"` and custom sorters.

### Charts: TxTimeseriesChart (`C/charts/src/timeseries/`)
- Props (`src/types.ts`, defaults at `TxTimeseriesChart.vue:25-39`):
  - `data: { name, data: [ms, value][], color? }[]`, `type 'line'|'bar'` (bar stacks), `markers?: { timestamp, label?, description?, color?, lineStyle? }[]`, `thresholds?: { value, label?, color }[]`.
  - Axes: `xAxisName`, `xAxisTickCount=5`, `xAxisTickFormat`, `yAxisName`, `yAxisTickCount=5`, `yAxisMinInterval`, `yAxisTickFormat`.
  - Tooltip: `tooltipValueFormat`, `tooltipMode 'all'|'single'`, `tooltipMaxItems=10`, `tooltipFooter`, `tooltipBoundary='clipping-ancestors'`, `tooltipFollowCursor`.
  - `incomplete?: { before?, after? }` (dashed partial data, line only), `gradient=false`, `loading=false` (renders the skeleton).
  - **`height=350` (number)**, `width?`, `ariaDescription?`, `highlightedSeries?` (dims the others to 10%), `clusterLabel`, `timestampFormat`.
- Model / events: `v-model:hidden-series` (string[]). `@time-range-change(from, to)`: **brush-to-select exists only when a listener is attached** (:305-308).
- Sizing: width comes from the container ResizeObserver. **Height is a numeric prop**: CSS and container queries cannot change it, so pass a reactive value for the expanded state.
- **Y-domain is forced to include 0** (:172-175). Metrics like crash-free 99.6% draw as a flat line at the top. Use a zero-based metric such as "crashes / 10k sessions", or `TxSparkChart` (`domain`), or `TxChart` with an explicit `yDomain`.
- Motion: ECharts-parity enter/update animations with reduced-motion guards. The series-dim opacity transition applies under `no-preference` only (:528-532). A window `mousemove` listener is added only while the tooltip is open and removed on unmount.
- Borrow from: `D/ChartsLegendDashboardDemo.vue` (large legend items plus chart, the closest to a dashboard), `D/TimeseriesChartLegendDemo.vue` (legend toggles and hover highlight), `D/TimeseriesChartMarkersDemo.vue` (markers and thresholds), `D/TimeseriesChartRangeDemo.vue` (brush).

### Charts: TxChartLegendItem / ChartPalette / TxChart + series / TxSankeyChart
- **`TxChartLegendItem`**: `variant 'small'|'large'`, `name`, `color`, `value` (a string), `unit?` (large only), `inactive`, `loading` (skeleton). Attaching `@click` renders a native `<button>`. Pair it with `@pointerenter/@pointerleave` to drive `highlightedSeries`.
- **`ChartPalette.categoricalVar(i)`** returns `var(--tx-chart-categorical-N, #hex)`. It follows the theme in DOM and also works for the TxSparkChart canvas, which resolves the var. `ChartPalette.semantic(name)` returns a **literal hex** that does not follow the theme; prefer `var(--tx-chart-semantic-*)`.
- **`TxChart`**: `height=350`, `aspectRatio?` (height then derives from width through CSS), `width?`, `padding=24`, `xType`, `xDomain`, `yDomain`, `yNice=true`, `ariaDescription`. Slots: default (SVG layers) and `overlay` (DOM). Expose: `context`.
  - Series share context through provide/inject, so **import `TxChart` and its series in one statement from `@talex-touch/tuffex/charts`** (`D/CustomChartComposedDemo.vue:2`).
- **`TxSankeyChart`**: `nodes`, `links` (by index), `height=400`, and more. Width comes from a ResizeObserver. Optional in the expanded dashboard for "query → provider → action" flows.
- **ECharts wrappers**: `height` accepts a CSS length (e.g. `'100%'`), so these are the only charts whose height can follow container CSS. Ready as an optional funnel ("install → activate → weekly use") or heatmap ("searches by hour × weekday").

### TxDatePicker (`C/date-picker/`)
- Props (defaults at :10-26):
  - `modelValue: string | [string, string]` (`YYYY-MM-DD`), `variant 'picker'` (wheel popup, the default) / `'field'` (calendar in a popover) / `'adaptive'` (field when `window.innerWidth ≥ adaptiveBreakpoint`, default 768).
  - **`range`: field calendar only** ("wheel picker … ignores it"). The model is emitted only once both ends are picked. `rangeSeparator=' → '`.
  - `min`, `max`, `placeholder`, `title`, `confirmText`, `cancelText`, `weekStartsOn`, `disabled`.
- Events: `update:modelValue`, `change`, `update:visible`, `confirm`, `cancel`, `open`, `close`.
- The field variant is a `TxPopover` (`:729-745`, `reference-full-width`). The popover teleports to `body` through `TxBaseAnchor` (`C/base-anchor/src/TxBaseAnchor.vue:1037`) and takes its z-index from the allocator, seed 2000 (see Risks).
- Borrow from: `D/DatePickerDatePickerDemo.vue:78-81` (`v-model="rangeValue" variant="field" range`).

### TxFlatRadio / TxTabs
- **TxFlatRadio** + `TxFlatRadioItem`:
  - Radio props: `modelValue` (required), `multiple`, `disabled`, `size 'sm'|'md'|'lg'|'xl'`, `bordered`. Item props: `value`, `label?`, `icon?`, `disabled?`.
  - Emits `update:modelValue` and `change`.
  - The sliding indicator is measured, and a ResizeObserver re-measures it (`TxFlatRadio.vue:167-180`), so it is teleport-safe. It has a reduced-motion guard.
  - This is the right time-range switch (7d/30d/90d). Borrow from `D/FlatRadioBasicDemo.vue` and `D/AgentTraceVariantsDemo.vue`, which uses a four-way FlatRadio.
- **TxTabs**: a full container (nav plus animated content panels, 1441 lines). Props: `modelValue` (the tab **name**, which is also its display label), `placement`, `indicatorVariant`, `indicatorMotion`, `autoHeight`, `animation`, … Items are `<TxTabItem name icon-class activation>`.
  - Use it only for section switching (e.g. Overview / Plugins / AI) in the expanded view. It is overkill for a range switch.

### TxProgressBar (`C/progress-bar/`)
- Props: `percentage`, `segments?: { value, color?, label? }[]` with `segmentsTotal=100` (hovering a segment lifts it and raises a tip showing `label · share`; **it needs about 28px of headroom**, see `D/ProgressBarSegmentsDemo.vue:27-31`).
  - Also `height='5px'`, `showText`, `textPlacement 'inside'|'outside'|'top'`, `detail` (top placement), `format`, `status`, `success`, `error`, `indeterminate` (+ variant), `loading`, `flowEffect 'shimmer'|'wave'|'stardust'`, `color` (gradients allowed), `ariaLabel`, `tooltip*`.
- Emits `complete`. Has a reduced-motion guard (:1070-1078).
- Use: AI quota bar segmented by provider.

### TxDotIndicator / TxStatusBadge
- **TxDotIndicator**: `color='currentColor'` (any CSS colour), `label?`, `size=8`, `ariaLabel?`, default slot. It is a bare dot with text and no border, meant for table cells and legends.
- **TxStatusBadge**:
  - Props: `text` (required), `status 'success'|'warning'|'danger'|'info'|'muted'` or `statusKey`, `size 'sm'|'md'`, `icon?`, `os?`, `osOnly`.
  - Icons come from UnoCSS: `i-carbon-checkmark`, `i-carbon-time`, `i-carbon-close`, `i-carbon-information` (`TxStatusBadge.vue:43-49`). All four are referenced elsewhere in Nexus, so they render.
  - `muted` shows a hollow dashed ring, a good fit for "Skipped" or "Not run".
  - Attaching `@click` makes it an interactive button.

### TxInsightCards / TxInsightMetric (`C/insight-cards/`)
- **InsightCards**:
  - Props: `pages: { key, prose?, suggestion? }[]`, `activeIndex?` (v-model; uncontrolled if undefined), `title='Insights'`, `showCount=true`, `loop=true`, `previousLabel`, `nextLabel`.
  - Events: `update:activeIndex`, `change(page, i)`, `followUp(page)`.
  - Slots: default `{ page, index }` (the card body), `prose`, `follow-up`. Expose: `previous`, `next`, `goTo` (:82).
  - The pager shell only: the cards are host content built from TxSparkChart, TxChartScrubber, TxAllocationBar and TxInsightMetric. `width: 100%`.
- **InsightMetric**: `label`, `color?` (dot), `value?` (signed; formatted with U+2212 minus and tone by sign), `delta?` (verbatim), `unit='%'`, `precision=2`, `detail?` (mono second line), `tone?`, `formatter?`.
- Borrow from: `D/InsightCardsInsightCardsDemo.vue`, which demonstrates all three card archetypes (a two-series scrub chart, an anomaly chart with a metric switch, and an allocation bar) at `max-width: 344px` with a 166px stage.

### TxGrid / TxGridLayout
- **TxGrid** + `TxGridItem`:
  - Grid props: `cols: number | Responsive<number>`, `rows`, `gap` (number, string, `{row,col}` or responsive), `minItemWidth` (sets `repeat(auto-fit, minmax(x, 1fr))`), `justify`, `align`. Item props: `colSpan`, `rowSpan`, `justifySelf`, `alignSelf`.
  - **Responsive breakpoints read `window.innerWidth`** (`TxGrid.vue:20,37`), not the container: xs<640, sm<768, md<1024, lg<1280, xl.
  - Only the `minItemWidth` auto-fit mode is container-responsive.
- **TxGridLayout**:
  - Props: `minItemWidth='300px'`, `gap='1.5rem'`, `maxColumns=4`, `interactive=true` (a pointer spotlight; children need the class `tx-grid-layout__item`).
  - **`@media (min-width: 1400px)` forces `repeat(maxColumns, 1fr)`** (`TxGridLayout.vue:86-87`). On a wide viewport the 784px column is also forced to 4 columns.
  - `transition: all .3s` with no reduced-motion guard.
- **Recommendation**: lay templates out with their own CSS grid plus `@container` queries. Where tuffex is wanted, use `TxGrid` with `minItemWidth` for the KPI row. No existing Nexus or tuffex code uses `@container` yet, so the template would be the first.

### TxFlowchart (`C/flowchart/`)
- Props (defaults at `TxFlowchart.vue:24-33`):
  - `nodes: FlowNode[]` (required), `edges=[]`, **`height=333` (px number)**, `nodeWidth=290`, `grid=22` (dot pitch and drag-snap step), `dots=true`, `draggable=false`, `snap=true`, `ariaLabel='Workflow'`.
- Data (`src/types.ts`):

  ```ts
  type FlowNodeTone = 'violet' | 'orange' | 'accent' | 'green' | 'red' | 'neutral'
  interface FlowNode { id: string, label?: string /* chip */, tone?: FlowNodeTone, x: number /* horizontal CENTRE, px */, y: number /* TOP edge, px */, width?: number, draggable?: boolean }
  interface FlowEdge { from: string, to: string, dashed?: boolean }
  ```

- Events:
  - `node-move({ id, x, y })` fires on pointerup. The component is **controlled**: it never mutates `nodes`, so the host writes positions back.
  - `node-click({ id, node })` fires on click or Enter/Space. There is no suppression after a drag, so a drag most likely also emits it.
- Slots: `node { node, index }` (the card body; an empty card without it), `label { node }` (replaces the chip). No expose.
- Geometry:
  - Each edge is a cubic from the **bottom-centre of `from` to the top-centre of `to`**, with control ratio 0.55 (:122-145). Edges that name unknown ids are skipped.
  - Card heights are measured per node with a ResizeObserver, so content-height changes re-route edges (:52-75). Keep card height constant across run states to avoid edge jitter.
- Sizing: the canvas is `width: 100%` with an inline `height`, `overflow: hidden`, and **no pan or zoom**.
  - Node x/y are absolute px and do **not** reflow when the canvas widens. The host recomputes positions from the measured canvas width, e.g. store `dx` from centre and pass `x = cx + dx`.
  - The canvas itself carries a hairline ring and radius 10 (`--tx-bui-*`), and BUI tokens have dark variants (`C/../style/bui-tokens.scss:79-137`). The violet chip has its own dark override (:380-386).
- **Missing capabilities**:
  - No node status or selected styling. Do it in the slot, and for a selection ring use `:deep(.tx-bui-flowchart__node:has(.is-selected) .tx-bui-flowchart__card)`.
  - No per-edge class, colour, label or animation. The only edge variant is `.is-dashed` (`stroke-dasharray: 4 4`, :296-298).
  - No horizontal ports, so the graph must be a top-down DAG.
- Motion: none built in (drag follows the pointer). Touch drag uses `touch-action: none`.
- Borrow from: `D/FlowchartFlowchartDemo.vue` (trigger card and If/Else token rows, `max-width: 480px` to centre fixed coordinates, `place()` write-back). Docs: `apps/nexus/content/docs/dev/components/flowchart.zh.mdc`.

### TxFineTuneCard (`C/fine-tune-card/`)
- Props (defaults at :14-27):
  - `values: { layout: 'row'|'col'|'grid', width, height, radius, opacity, type: string|null }` (v-model:values), `defaults?` (tints changed fields and flips the header to "Edited"), `edited?`.
  - Copy: `title='Fine-tune'`, `layoutLabel`, `typeLabel`, `typeOptions: { value, label }[]`, `typePlaceholder`, `adjustLabel`, `editedLabel`, `fieldLabels?: Partial<Record<'width'|'height'|'radius'|'opacity', string>>`.
  - `ranges?` (defaults: width 40–999, height 24–999, radius 0–64, opacity 0–100 with a `%` suffix), `disabled`.
- Events: `update:values(values)`, `change(key, value)`.
- **Fixed schema**: 4 numeric fields, a row/col/grid layout glyph (English aria-label `${layout} layout`), and a type chip.
  - It is semantically honest only for inspecting a *visual* thing, e.g. the Notify step's notification card. Other node types need a custom inspector.
- Sizing: `max-width: 240px` (:211). The type chip menu **opens upward, absolutely positioned, z-index 10, and is not teleported** (`TxFineTuneChipSelect.vue:268-273`), so allow about 110px of clearance above it inside `overflow: hidden` ancestors.
- Borrow from: `D/FineTuneCardFineTuneCardDemo.vue` (a live preview mirrored from values, and reset).

### TxScrubField / TxSwitch / TxFlatSelect (inspector controls)
- **TxScrubField**:
  - Props: `modelValue`, `label`, `min`, `max` (all required), `step=1`, `suffix?`, `active` (changed tint), `disabled`, `pixelsPerStep=2`, `shiftMultiplier=10`, `clampOn 'input'|'blur'`, `ariaLabel?`, `valueLabel?`.
  - Emits `update:modelValue`, `change`, `scrubStart`, `scrubEnd`. Expose: `focus`, `focusInput` (:220-223).
  - Drag the caption to scrub; the value stays typeable.
- **TxSwitch**:
  - Props (`TxSwitch.vue:9-33`): `modelValue`, `disabled`, `loading` (a spinning ring that blocks toggling), `size 'small'|'default'|'large'`, `label?`, `labelPlacement 'start'|'end'`, `ariaLabel='Toggle'`.
  - Emits `update:modelValue` and `change`.
- **TxFlatSelect** + `TxFlatSelectItem { value, label?, disabled? }`: props `modelValue`, `placeholder`, `disabled`; emits `update:modelValue` and `change`.
  - `min-width: 120px`.
  - The dropdown is **absolutely positioned and not teleported** (`TxFlatSelect.vue:392`), so it can clip inside `overflow: hidden` panels.
  - Usage: `D/FlatSelectBasicDemo.vue`.

### TxTimeline / TxTimelineItem (`C/timeline/`)
- Timeline props: `layout 'vertical'|'horizontal'` (vertical has `padding-left: 40px`). Item props: `title?`, `time?`, `icon?` (a `TxIcon` name or `i-*` class, 6px glyph), `color 'default'|'primary'|'success'|'warning'|'error'`, `active` (ring and scale 1.2). Default slot is the description.
- No events and no expose. CSS vars `--tx-timeline-line`, `--tx-timeline-dot-*`, `--tx-timeline-title/time/description`.
- **Dark-mode caveat**: the dot has a hard-coded `border: 2px solid #ffffff` (`TxTimelineItem.vue:103`), which shows a white ring on dark. Override it at the docs level with `:deep(.tx-timeline-item__dot) { border-color: var(--tx-bg-color) }`.
- Borrow from: `D/TimelineTimelineDemo.vue`.

### TxTaskRows (`C/task-rows/`)
- Props (`src/types.ts`):
  - `rows: { id, label, status: 'pending'|'running'|'done'|'error', amount?, index?, statusText?, details?: { label, meta? }[], retryable?=true }[]`, `variant 'capsules'|'list'`.
  - Expansion: `defaultOpenIds`, `openIds` (v-model).
  - Pill text: `doneText='Completed'`, `errorText='Failed'`, `runningText?`, `pendingText?` (running and pending rows show no pill by default).
- Events: `toggle(id, open)`, `update:openIds`. Slots: `badge { row }`, `detail { row, detail, index }`, `trailing { row }` (host controls).
- Icons are inline SVG, so there is no UnoCSS dependency. The running ring spins; the badge is keyed by status so it pops in on change. Rows fade up staggered at 80ms each, with a reduced-motion block at :481-493.
- Borrow from: `D/TaskRowsListDemo.vue`, `D/TaskRowsCapsulesDemo.vue`.

### TxWorkingIndicator (`C/working-indicator/`)
- Props: `label='Working'`, `variant 'drive'|'dots'|'orbit'`, `startedAt?` (epoch ms; survives remounts), `showElapsed=true`, `elapsedFormatter?`, `ariaLabel?`. Slot: `label`.
- Also exported: `useElapsed({ startedAt, active, intervalMs=100 })` and `formatElapsed(ms)` (`12.3s` / `2m 3.0s`).
- A 100ms interval runs while mounted with `showElapsed` true, so **`v-if` it off when idle**. Under reduced motion the grid freezes and the timer keeps ticking by design.

### TxSteps / TxStep (`C/steps/`)
- Steps props: `direction 'horizontal'|'vertical'`, `size 'small'|'medium'|'large'`, `active` (number or string).
- Step props: `title`, `description`, `icon`, `status 'wait'|'active'|'completed'|'error'`, `step?`, `clickable=true`, `disabled`, `showLine=true`, `completedIcon='check'` (a built-in TxIcon).
- Steps before `active` render completed.
- **No emitted change and no v-model**: clicks only set internal state. Use it as a display-only run progress bar driven through `active`, or set `clickable=false`.
- Active steps "breathe" (a 2.8s infinite animation), with a reduced-motion guard at :462.

### TxCodeStream (`C/code-stream/`)
- Props:
  - `code: string` (required; also what the copy button yields), `lang=''` (Shiki id, lazily loaded; an unknown or empty lang renders plain text, which is always correct), `filename?`, `langLabel?`, `diff?: { content, kind?: 'context'|'added'|'removed', number? }[]`.
  - **`revealedLines?`**: the host owns the cadence. Omit it or pass -1 to show everything.
  - `caret=true`, `lineNumbers=true`, `theme 'auto'`, `copyable=true`, `copyLabel`, `copiedLabel`, `minHeight?`.
- Events: `copy(code)`, `complete` (fires when the reveal reaches the last line). Slots: `header`, `actions`.
- Sizing:
  - The body reserves the **full listing height** by default (`min-height` from the line count, :301).
  - It has only `overflow-x: auto` (:306): **no vertical scroll and no autoscroll**. For a log, wrap it in a fixed-height `overflow: auto` container and scroll to the end on each reveal, or pass a smaller `minHeight`.
- Borrow from: `D/CodeStreamStreamingDemo.vue` (a timer-driven `revealed` ref: 400ms start, 240ms per line, 3200ms hold; timers started `onMounted`).

### TxSplitter (`C/splitter/`)
- Props (:7-15): `modelValue=0.5` (ratio 0–1, v-model), `direction 'horizontal'|'vertical'`, `min=0.1`, `max=0.9`, `disabled`, `barSize=10`, `snap=0`.
- Emits `update:modelValue`, `change`, `drag-start`, `drag-end`. Slots `a` and `b`. Arrow keys step by 0.02.
- Sizing: `width: 100%; height: 100%` with a CSS grid. **The parent must have a definite height.**
  - It draws its own frame (1px border, radius 14, translucent background; scoped styles). To embed it frameless, override from the host wrapper with `:deep(.tx-splitter) { border: 0; border-radius: 0; background: transparent }`.
- Borrow from: `D/SplitterSplitterDemo.vue`.

### Toast: `toast()` + TxToastHost / TxToastPanel
- **`toast({ title?, description?, variant?: 'default'|'info'|'success'|'warning'|'danger', duration?=2600, action?: { label, onClick?, dismiss? }, id? })`** from `@talex-touch/tuffex/utils`. Also `dismissToast`, `clearToasts` (`packages/tuffex/packages/utils/toast.ts:85-126`).
  - It pushes into the global `toastStore` and takes a fresh z-index from `nextZIndex()`.
- **`<TxToastHost>`**:
  - Props: `position` (6 corners/edges), `visibleToasts`, `expand`, `gap`, `offset`, `swipeToDismiss`. Expose: `pause`, `resume`, `expanded`.
  - It **teleports to `body`, `position: fixed`** (`TxToastHost.vue:319,395`), so toasts appear at the viewport corner, outside the in-column frame.
  - With several hosts mounted, the first to mount claims rendering (`host-registry.ts`). Nexus's own app toasts (`app/composables/useToast.ts`) are a separate, unrelated system.
- **`<TxToastPanel>`**: an in-flow, controlled, anchored card with a dashed tether ("this came from *that*").
  - Props: `open=true`, `tether=true`, `tetherLength=28`, `side 'below'|'above'`, `stack=1` (0–2 peeking layers), `ariaLabel`, `live 'polite'|'off'`. Slots: default and `tether`.
  - When closed it keeps its box (opacity/transform only), so it reserves layout space. Card padding is 10/12 with radius 12; host `:deep(.tx-toast-panel__card)` overrides win.
  - It has a reduced-motion guard. This is the teleport-safe choice for in-template feedback.

---

## Template proposals

Shared mechanics (both templates):
- The root element gets `container-type: inline-size`. Two breakpoints drive CSS: compact below 640px (narrow screens), default 640–999px (≈784 in-column), wide at 1000px and above (the ≈1280 overlay).
- The same breakpoints feed numeric props: `TxFlowchart.height`, `TxTimeseriesChart.height`, `TxDataTable.maxHeight`, flowchart node x.
  - Derive them from a ResizeObserver on the template root (VueUse `useElementSize`; `@vueuse/core ^14.4` is a Nexus dependency) rather than from a prop passed by the shell. That way the teleported instance adapts by itself.
  - Declare the breakpoint constants once and mirror them in the `@container` rules.
- Every chart and flowchart listed above re-measures through a ResizeObserver after teleport. Only numeric heights and flowchart coordinates need host help.
- `defineExpose({ replayDemo })` hooks the wrapper's Reset button (the Dashboard resets range and filters; Automation replays the run).
- Colours:
  - Series identity uses `ChartPalette.categoricalVar(i)` everywhere: chart series, legend, allocation segments, spark lines and dot indicators.
  - Status uses `--tx-bui-green/orange/red` or `--tx-color-*`.

### Dashboard 数据看板 — "Tuff Pulse"

A product-analytics board for the launcher.

**Layout ≈784×540 (in-column, default)**

```
┌ Tuff Pulse ▾  ● All systems normal          [ 7d | 30d | 90d ]  [ 2026-08-25 → 09-23 ▾ ] ┐  40
├──────────────────┬──────────────────┬──────────────────┬──────────────────┤
│ Daily active     │ CoreBox searches │ AI requests      │ Plugin installs  │  88  4× TxStatCard (insight)
│ 18,240  ↑8.2%    │ 1.28M  ↑12.4%    │ 86.4K  ↑31.0%    │ 4,912  ↑18.0%    │
├──────────────────┴──────────────────┴──────┬───────────┴──────────────────┤
│ ● macOS ● Windows ● Linux   (legend, small)│ Platform share               │
│ TxTimeseriesChart  h=190                   │ [██████████████|███████|██]  │ 220
│   ┆v2.4 OCR      ┆Market refresh   ╌╌(partial)│ MAC 58.4 WIN 34.1 LNX 7.5 │
│                                            │ Service health               │
│                                            │ ● Search index   ▮▮▮         │
│                                            │ ● Sync           ▮▮▯         │
│                                            │ AI quota  68%  ▬▬▬▬▬▬░░░     │
├────────────────────────────────────────────┴──────────────────────────────┤
│ Top plugins   Plugin ▾  Category  Installs ↓  Trend ⌇  Crash-free  Status │ 150 TxDataTable (max-height, sticky header)
│ Clipboard History  Utilities  12,840  ⌇⌇⌇  ▮▮▮ 99.9%  ● Stable           │
└───────────────────────────────────────────────────────────────────────────┘
```

**Layout ≈1280×800 (overlay, wide)**

```
┌ header (same) + TxTabs? optional: Overview | Plugins | AI                                       ┐
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────────────────┤
│ KPI ×5 (adds "Crash rate /10k")                       │                                          │ 96
├──────────────────────────────────────────────────────┼─────────────────────────────────────────┤
│ legend (TxChartLegendItem large ×3 with totals)       │ TxInsightCards pager (3 pages)           │
│ TxTimeseriesChart h=300, brush enabled                │  1 spark+scrubber "OCR usage ×2"         │ 360
│                                                       │  2 anomaly "Win crash spike 09-18"       │
│                                                       │  3 allocation "AI served locally 72%"    │
├──────────────────────────────┬──────────────────────┴───────────┬─────────────────────────────┤
│ TxDataTable (8 rows, maxHeight 260)                             │ Platform share + Health + AI  │ 280
│                                                                 │ quota (rail moves down here)  │
└─────────────────────────────────────────────────────────────────┴─────────────────────────────┘
```

In the compact layout (below 640px) the KPIs go 2×2, the chart and rail stack, and the table uses `scrollX`.

**Components and their roles**
- `TxStatusBadge` (header, "All systems normal" / "Degraded").
- `TxFlatRadio` size sm for the 7d/30d/90d range, plus a hidden "custom" value.
- `TxDatePicker` with `variant="field" range`: it shows the resolved range, and picking a custom range sets the radio to custom.
- `TxStatCard` ×4–5 KPIs.
  - The `value` slot can hold `<TxTextMorph :text numbers>` so numbers roll on range change (it respects reduced motion).
  - The insight carries an explicit `iconClass` (e.g. `i-carbon-arrow-up-right` / `i-carbon-arrow-down-right`).
- `TxChartLegendItem` (small in-column, large when wide), clickable (`v-model:hidden-series` toggle) and hover (`highlighted-series`).
- `TxTimeseriesChart` for the main trend.
  - `markers` for releases.
  - `incomplete.after` set to today at 00:00, so today's partial data is dashed.
  - `@time-range-change` for brush-to-zoom, used as a cross-filter.
- `TxAllocationBar` for platform share. The selected segment sets `highlightedSeries` on the chart.
- `TxSignalMeter` + `TxDotIndicator` for service health rows.
- `TxProgressBar` with `segments` for AI quota by provider.
- `TxDataTable` for top plugins.
  - `cell-trend`: a non-interactive `TxSparkChart` with `:padding="{top:4,bottom:4}"`, `:baseline="false"`, `:interactive="false"`, and cell height 28px.
  - `cell-crashFree`: `TxSignalMeter` plus text.
  - `cell-status`: `TxStatusBadge size="sm"`.
  - Sortable installs and crash-free columns with `sort-cycle="bi"`.
- `TxInsightCards` + `TxInsightMetric` + `TxSparkChart`/`TxChartScrubber` (the scrub interaction) + `TxAllocationBar`, in the wide layout only.
- Layout via the template's own CSS grid and `@container`. Avoid `TxGridLayout`, whose 1400px media query breaks it; `TxGrid min-item-width="168px"` is acceptable for the KPI row.

**Interactions**
1. Switching the time range regenerates deterministic series, and the KPIs, table trends and insights recompute.
   - Keep a constant sample count for spark lines (e.g. 24 buckets) so they morph smoothly.
   - The timeseries uses 7d → 168 hourly points × 3 series (504 points, under the 2000 animation threshold), 30d → 30 daily points, 90d → 90 daily points.
2. Hovering the chart shows the crosshair and a tooltip with all three platforms. Hovering a marker shows the release note.
3. Brushing the chart zooms: the KPI cards show that window's totals, and a "Reset zoom" chip appears.
4. Legend click hides or shows a series; legend hover dims the others.
5. Selecting an allocation segment highlights that platform in the chart.
6. Sort the table by installs or crash-free. Optional drill-down: a row click switches the chart to that plugin's install series, and a "← All platforms" chip returns.
7. Wide only: page through InsightCards. Scrubbing the spark chart shows day values; the follow-up pill opens a `TxToastPanel` "Sent to Intelligence".

**Mock data** (seeded with sin-hash jitter; start `Date.UTC(2026, 7, 25)`)
- KPIs (30d):
  - DAU 18,240 (from 16,860, +8.2%).
  - CoreBox searches/day `'1.28M'` (+12.4%).
  - AI requests `'86.4K'` (+31.0%).
  - Plugin installs 4,912 (+18.0%).
  - Wide-only fifth card: crash rate 3.8 per 10k sessions, delta −0.6 (a zero-based metric, which avoids the TxTimeseriesChart zero-domain problem).
- Timeseries: CoreBox searches per day for macOS, Windows and Linux (≈742K / 431K / 96K). Markers: "v2.4 · Clipboard OCR" on day 12 and "Plugin market refresh" on day 21.
- Allocation: `[{ key:'mac', label:'macOS', short:'MAC', percent:58.4 }, { key:'win', short:'WIN', percent:34.1 }, { key:'linux', short:'LNX', percent:7.5 }]`.
- Health: Search index 3/3 green, Sync 2/3 orange ("Degraded · 1 region"), AI gateway 3/3, Update CDN 3/3.
- AI quota: 68% of 100K tokens. Segments: On-device 22 (label "On-device"), Nexus AI 38, Custom keys 8.
- Top plugins, using real ids from `plugins/`: `clipboard-history` 12,840 · `touch-translation` 9,312 · `touch-snipaste` 7,605 · `touch-quick-actions` 6,450 · `touch-intelligence` 5,118 · `touch-window-presets` 4,118 · `json-formatter` 3,977 · `touch-dictation` 2,240. Each row also gets crash-free 98.9–99.9%, status Stable/Beta, and a 24-point trend.

**Risks and fallbacks**
- Numeric heights (chart and table) follow the size observer, not CSS.
- The zero-based y-domain rules out percentage-near-100 series, so chart counts rather than rates.
- The negative StatCard icon is blank unless `iconClass` is set.
- Legend chips don't wrap: at most 3–4 segments.
- The DatePicker popover teleports and must stack above the overlay (see Risks).
- Five KPIs at 784px are too tight (about 145px each), so the fifth appears only at the wide breakpoint.

### Automation 自动化编排 — "Clipboard OCR → Translate"

This mirrors Tuff's real OCR design: native Apple Vision or Windows OCR, with an AI-provider fallback (CLAUDE.md, OCR module).

**Graph** (top-down DAG, 5 levels; the host keeps `dx` from centre)

```
L1  (cx,      12)  ⚡ Trigger    "Clipboard · image copied"        tone violet
L2  (cx,     100)  ◎ OCR        "Native OCR · Apple Vision"        tone accent
L3  (cx+140, 188)  ↻ If < 80%   "AI re-read (vision model)"        tone orange   ← only when confidence < threshold
L4  (cx,     276)  文 Translate  "Translate → English"              tone accent
L5  (cx,     364)  🔔 Notify     "Notify + copy result"             tone green
edges: 1→2, 2→4 (straight, passes empty cx at L3), 2→3, 3→4, 4→5
```

The condition lives in a node chip (`label: 'If < 80%'`, orange). Edges carry no condition, so `dashed` stays free to mean "in flight".

**Layout ≈784×540 (in-column)**

```
┌ ⚡ Clipboard OCR → Translate   ● Idle / ▦ Running 1.4s   [⏻ Enabled]  [▶ Run]         ┐ 44
├───────────────────────────────────────────────┬──────────────────────────────────────┤
│ TxFlowchart  (w≈516, h≈452, nodeWidth 196)    │ Inspector (w≈256)                     │
│        [Trigger] Clipboard image              │  OCR · Apple Vision                   │
│              │                                │  Engine   [Apple Vision ▾] FlatSelect │
│        [OCR] Native OCR  ✓ 142 chars 0.93     │  Min conf [‹ 80 % ›]   ScrubField     │
│              │ ╲                              │  Detect language  [⏻]  Switch         │
│              │  [If < 80%] AI re-read ○ skip  │ ───────────────────────────────────── │
│              │ ╱                              │ This run   (TxTaskRows list, compact) │
│        [Translate] → English  ▦ running       │  ✓ Trigger   212 KB                   │
│              ┆  (dashed, marching)            │  ✓ OCR       142 chars                │
│        [Notify] Toast + copy                  │  ◌ Translate                          │
│                                               │  ○ Notify                             │
└───────────────────────────────────────────────┴──────────────────────────────────────┘
   TxToastPanel (anchored under the Run button, tether) opens on completion: "Translation copied"
```

**Layout ≈1280×800 (overlay, wide)**

```
┌ header (+ TxSteps small horizontal: Trigger › OCR › Translate › Notify)                             ┐ 56
├───────────────┬────────────────────────────────────────────┬────────────────────────────────────────┤
│ Run history   │ TxFlowchart (h≈500, level pitch 100)        │ Inspector: selected node               │
│ TxTimeline    │                                            │  Notify → TxFineTuneCard               │
│ #128 ✓ 2.1s   │                                            │  (layout/W/H/radius/opacity/type)      │
│ #127 ⚠ fallbk │                                            │  + live TxToastPanel preview           │
│ #126 ✕ 429    │                                            ├────────────────────────────────────────┤
│ …             │                                            │ This run: TxTaskRows (details open)    │
├───────────────┴────────────────────────────────────────────┴────────────────────────────────────────┤
│ TxSplitter (vertical, v-model 0.72) ── bottom pane: TxCodeStream  run-128.log  (scroll container)   │ ~200
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

In-column there is no splitter, history or code log; they appear at the wide breakpoint. A compact "Log" disclosure could show the last 4 lines in-column if wanted.

**Components and their roles**
- `TxFlowchart` for the canvas: `draggable`, `@node-move` writes `dx/dy`, `@node-click` selects a node.
  - `#node` slot card: icon, title and subtitle, plus a fixed-height status line. The status line shows `TxStatusBadge size="sm"` for done/error/skipped (muted), `TxWorkingIndicator variant="dots" :show-elapsed="false"` while running, or `TxDotIndicator` for idle.
  - The selected ring is done through `:has(.is-selected)`.
- Inspector:
  - Per-node forms built from `TxFlatSelect` + `TxScrubField` + `TxSwitch`.
  - The Notify node uses `TxFineTuneCard`, which styles the notification card honestly: layout sets icon placement; W/H/Radius/Opacity map to CSS vars on a `TxToastPanel` preview; `type` is Toast / Banner / HUD.
- Run status: `TxTaskRows` (list variant with `doneText` set short, e.g. "Done/完成"), `TxSteps` (display-only through `active`, wide), and `TxWorkingIndicator` in the header while running (`:started-at` for elapsed).
- `TxTimeline` for run history. A new run is prepended as active: success, warning (fallback used) or error.
- `TxCodeStream` for the run log (`lang=''` plain, host-driven `revealedLines`, wrapped in an `overflow:auto` box that scrolls to the end on each reveal). Wide only.
- `TxSplitter` (vertical) splits the log pane from the rest (wide only; frame overridden through `:deep`).
- `TxToastPanel` for completion feedback inside the template.
  - Optional real `toast()` + `TxToastHost` only if the Risks item is verified. Note that toasts land at the viewport corner.
- `TxButton` (`variant="primary" size="sm" icon="i-carbon-play"`, `:loading` while running) and `TxSwitch` (automation enabled).

**Scripted Run** (replayable; one `setTimeout` chain with a `cancel()`; started from click, `replayDemo`, or optionally auto-run once `onMounted`)

| t (ms) | Canvas | Right column / log |
|---|---|---|
| 0 | all nodes idle → Trigger `running` | header shows WorkingIndicator "Running"; TaskRows reset to pending; log `trigger clipboard.image 1280×720 png · 212 KB` |
| 400 | Trigger `done` ✓; edge 1→2 `dashed` (in flight) | TaskRow 1 done, amount "212 KB" |
| 700 | edge solid; OCR `running` | log `ocr engine=apple-vision lang=zh-Hans` |
| 1500 | OCR `done` "142 chars · 0.93" | compare with the inspector threshold (default 80): if confidence ≥ threshold, fallback `skipped` (muted badge) and edge 2→4 in flight; otherwise fallback runs 900ms, then edge 3→4 |
| 1800 | Translate `running` | log `translate provider=on-device target=en` |
| 3000 | Translate `done` "2 sentences · 38 tokens"; edge 4→5 in flight | TaskRow 3 details: `{ label:'Model', meta:'on-device' }`, `{ label:'Tokens', meta:'38' }` |
| 3300 | Notify `done` | `TxToastPanel :open="true"` "Translation copied / 译文已复制" (auto-close after 4s); header `TxStatusBadge success "Succeeded · 2.1s"`; `TxTimeline` prepends #128; Steps `active=4` |

- Failure demo: a "Simulate rate limit" switch in the header ⋯ menu or inspector makes Translate go `error` (a TaskRows pill with the retry glyph). After a 600ms retry it goes `done`, and history records a warning.
- Raising Min confidence above 93 in the inspector forces the AI-fallback path, so the inspector visibly changes the next run.
- Edge "in flight" styling lives in the template, with no tuffex change:

  ```css
  .flow :deep(.tx-bui-flowchart__edge.is-dashed) { stroke: var(--tx-bui-accent); }
  @media (prefers-reduced-motion: no-preference) {
    .flow :deep(.tx-bui-flowchart__edge.is-dashed) { animation: flow-dash .6s linear infinite; }
  }
  @keyframes flow-dash { to { stroke-dashoffset: -8; } }
  ```

- Reduced motion: keep the state sequence, since it is information, but drop decoration. Edges become static dashed accent lines. TaskRows, Steps, WorkingIndicator, ToastPanel and CodeStream each carry their own reduced-motion guards. `prefersReducedMotion()` (exported from `/charts`) can shorten the delays to about 150ms if desired.
- Cleanup:
  - `onBeforeUnmount(cancel)`.
  - `watch(locale, reset)`.
  - Do not schedule timers in setup.
  - `TxWorkingIndicator` is `v-if`-ed off after the run so its 100ms interval stops.

**Mock data**
- Inspector defaults:
  - Trigger: watch Images, debounce 300ms, "only when CoreBox hidden" on.
  - OCR: engine Apple Vision / Windows OCR / AI provider, min confidence 80, detect language on.
  - Fallback: model "vision · on-device" / "Nexus AI".
  - Translate: target English / 中文 / 日本語, keep formatting on, max tokens 512.
  - Notify: `{ layout:'row', width:320, height:72, radius:12, opacity:100, type:'toast' }`.
- History:
  - #128 ✓ 2.1s 12:04 (success, active).
  - #127 ⚠ fallback used · 3.4s 11:52 (warning).
  - #126 ✕ rate limited (429) 11:40 (error).
  - #125 ✓ 1.9s 11:02.
- Log lines use `HH:MM:SS.mmm  stage  message`, 7 lines per successful run.

**Risks and fallbacks**
- Fixed coordinates: compute `x = cx + dx` from the measured canvas width. The height prop comes from the size observer, with level pitch 88 in-column and 100 wide.
- No edge API beyond `dashed`, handled with the CSS above.
- FineTuneCard's upward chip menu and FlatSelect's dropdown are absolute and not teleported. Keep the inspector column free of `overflow:hidden` near them, and remember the demo window clips.
- Timeline's white dot ring in dark mode needs a docs-level override.
- TxSteps has no event, so it stays display-only.
- CodeStream has no scroll, so wrap it.
- TxSplitter needs a sized parent and double-frames, so apply the `:deep` override.

---

## Risks

1. **Container-agnostic sizing.** CSS container queries cannot reach numeric props: `TxFlowchart.height` (px), `TxTimeseriesChart.height`, `TxSankeyChart.height`, `TxChart.height` (unless `aspectRatio`), `TxDataTable.maxHeight`, and flowchart node `x/y`.
   - Mitigation: a ResizeObserver or `useElementSize` on the template root, with shared breakpoint constants.
   - Components that are CSS-sized (they fill their parent): `TxSparkChart`, `TxChartScrubber` stage, `TxSplitter`, `TxEChart` (CSS `height`), `TxAllocationBar`, `TxStatCard`.
2. **Viewport-based grids.**
   - `TxGrid` responsive `cols` uses `window.innerWidth` (`C/grid/src/TxGrid.vue:20,37`).
   - `TxGridLayout` has `@media (min-width:1400px)` forcing `maxColumns` (`C/grid-layout/src/TxGridLayout.vue:86-87`), which forces 4 columns in the 784px column on wide screens.
   - `TxDatePicker variant='adaptive'` also keys off `window.innerWidth`.
   - Use template CSS grid with `@container`, or `TxGrid minItemWidth`.
3. **Flowchart capability gaps.** Absolute coordinates with no reflow, pan or zoom; top-down edges only; no per-edge styling or labels; `dashed` is the only edge variant; no node status or selection API. Everything lives in slots or template CSS as described above. A drag most likely also fires `node-click`, since there is no suppression in `C/flowchart/src/TxFlowchart.vue:170-190`.
4. **Production module split (unverified, verify before relying on `toast()`).**
   - In production, auto-registered components resolve to tuffex **source** (`@tuffex-components/*` → `tuffexComponentSourceEntry`, `nuxt.config.ts:47,553`; module prefix at `modules/tuffex-components.ts:91-96`).
   - Explicit `@talex-touch/tuffex/<dir>` and `/utils` imports resolve to **dist** (`nuxt.config.ts:46,555,558`).
   - An auto-registered `<TxToastHost>` (source → `packages/tuffex/packages/utils/toast.ts`) and `toast()` from `/utils` (dist → `dist/es/utils/toast.js`) could therefore read different `toastStore` instances in a production build. Dev dist mode shares one store (`dist/es/toast/src/TxToastHost.vue.js:2` imports `../../utils/toast.js`).
   - The same asymmetry applies to any provide/inject pairing, e.g. TxChart and its series, which is why those must be imported together.
   - No current production build was available to confirm: `apps/nexus/dist` is from 09-21 and predates flowchart.
   - Mitigation: in-template feedback through `TxToastPanel` (stateless), or import both `toast` and `TxToastHost` explicitly (`@talex-touch/tuffex/utils` and `@talex-touch/tuffex/toast`).
5. **Overlay stacking.** Teleported floating layers take z-index from the tuffex allocator: seed `DEFAULT_Z_INDEX_SEED=2000`, `next()` on each open (`packages/tuffex/packages/utils/z-index-manager.ts:33,221-266`). This covers the DatePicker popover through `TxBaseAnchor` and `toast()`.
   - Nexus does not install the tuffex app plugin, so these fall back to the module-level allocator.
   - The fullscreen template overlay must sit below whatever `next()` hands out: allocate its own z-index from the same allocator when it opens, or stay below 2000.
   - Non-teleported menus (`TxFlatSelect` :392, `TxFineTuneChipSelect` :268-273, z-index 3/10) are clipped by `overflow:hidden` ancestors, including `.tuff-demo__window` (`TuffDemoWrapper.vue:283`).
6. **Icon classes owned by tuffex.** These render only when a Nexus file also contains the string.
   - `TxStatCard`'s negative-insight `i-carbon-arrow-down` has 0 references: blank. `i-carbon-growth` is referenced only by `D/StatCardInsightVariantDemo.vue`.
   - Pass `insight.iconClass` in the template. Parallel task R6.1 intends to make this self-contained.
7. **`TxTimeseriesChart` y-domain always includes 0** (`…/TxTimeseriesChart.vue:172-175`). Near-100% rates render flat, so chart counts per 10k instead, or use `TxSparkChart` `domain` or `TxChart` `yDomain`.
8. **Dark-mode spots.**
   - `TxTimelineItem` dot `border: 2px solid #ffffff` (:103).
   - Flowchart chip tones other than violet rely on `--tx-bui-*-tint`, which have dark variants (OK).
   - Canvas colours in `TxSparkChart` resolve `var(--token)` at draw time and redraw on theme change (OK). Pass `var(--x)` or hex.
   - Screenshot both themes; the PRD acceptance requires ego screenshots.
9. **Motion without guards.** `TxStatCard` hover and glow transitions, `TxGridLayout` `transition: all`, and `TxFlatSelect`'s clip-path open/close have no `prefers-reduced-motion` handling. The template's own marching-ants CSS must sit inside `@media (prefers-reduced-motion: no-preference)`.
10. **Spark-chart morph on resize and data change.** Teleport resizing tweens the line for 500ms, and index-matched morphs look odd when the point count changes. Keep the sample count constant, or `:key` by range. The default padding (24/22) must be overridden in table cells.
11. **`TxCodeStream`** reserves the full listing height and has no vertical scroll or autoscroll. Wrap it in a scroller.
12. **`TxSteps`** emits nothing on click, so it is display-only.
13. **`TxWorkingIndicator`** runs a 100ms interval while mounted. `v-if` it off when idle.
14. **Parallel edits.**
    - `TxStatCard` visuals are being redesigned by `09-23-nexus-base-gallery-sidebar` (R6), with the API unchanged.
    - That session also rebuilds `packages/tuffex/dist` (lock `/tmp/tuffex-build.lock`). A running Nexus dev server must be restarted after a rebuild, or every page shows "tuffex dist is missing" (audit-result.md:75).
15. **No existing `@container` usage** in Nexus or tuffex. The templates would introduce the pattern. It is fine in evergreen browsers, but there is no precedent to copy.

## Related specs / docs

- `apps/nexus/content/docs/dev/components/{flowchart,charts,timeseries-chart,spark-chart,insight-cards,allocation-bar,signal-meter,stat-card,data-table,date-picker,flat-radio,progress-bar,dot-indicator,status-badge,grid,grid-layout,fine-tune-card,scrub-field,switch,flat-select,timeline,task-rows,working-indicator,steps,code-stream,splitter,toast,toast-panel,tabs,echart-charts,sankey-chart,custom-chart,chart-colors}.{zh,en}.mdc` — the "组成" link targets. The Flow suite currently holds only `flowchart` (`flow-suite.zh.mdc`, category `Flow`).
- `apps/nexus/app/utils/docs-suites.ts` — suite taxonomy (`data`: Charts/Visualization; `flow`: Flow).
- `.trellis/tasks/archive/2026-09/09-21-bui-parity-audit/audit-result.md` — confirms the scrub layer, spark `baseline`/`endpoint`, and the flowchart port.
