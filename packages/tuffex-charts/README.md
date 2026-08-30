# @talex-touch/tuffex-charts

Chart components for TuffEx. API surface modeled on [Cloudflare kumo](https://github.com/cloudflare/kumo)'s chart family (MIT), rendered natively with Vue 3 + SVG — no echarts, no chart framework. Math comes from tree-shakeable d3 micro-modules only.

## Install

```bash
pnpm add @talex-touch/tuffex-charts
```

```ts
import { ChartPalette, TxChartLegendItem } from '@talex-touch/tuffex-charts'
import '@talex-touch/tuffex-charts/style.css'
```

## Theming

Components read colors from `--tx-chart-*` CSS custom properties and switch automatically under `.dark` or `[data-theme='dark']` — there is no `isDarkMode` prop. `ChartPalette` exposes the same values as literal hex strings for use outside chart components (`categorical`, `semantic`, `sequential`, `text`, `mapColors`), plus `categoricalVar(i)` for theme-following `var()` references.

## Scope

Charts overview (legend, basics) · Colors · Timeseries · Maps (bubble / choropleth) · Sankey · composable primitives for custom charts. See the nexus docs site for usage per chart type.
