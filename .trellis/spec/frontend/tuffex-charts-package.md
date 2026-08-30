# TuffEx Charts Package

> Contracts for `packages/tuffex-charts` (@talex-touch/tuffex-charts) — the kumo-parity chart family. Reference sources live in `.trellis/tasks/08-30-tuffex-charts/research/kumo-reference/` (kumo is MIT; attribute ports in code comments).

---

## Package Boundaries

- **No echarts, ever.** The whole point of the package is kumo's API shape without its echarts engine. Renderer is Vue-emitted SVG; math comes only from d3 micro-modules (`d3-scale`/`d3-shape`/`d3-sankey`/`d3-geo` + transitive `d3-array`). Verify with `pnpm --filter @talex-touch/tuffex-charts why echarts` (empty) — and run a positive control (`why vue`) so an empty result is meaningful.
- **No runtime dependency on @talex-touch/tuffex.** Every CSS variable carries a light-mode fallback; small helpers (withInstall, shimmer keyframes) are re-declared locally with a comment saying why.
- Nexus consumes the package **always from source** via a vite alias + tsconfig path (the tuff-business pattern in `apps/nexus/nuxt.config.ts`), so there is no dist build-ordering dependency.

## Theming Contract

- Components read colors **only** through `--tx-chart-*` variables (`src/style/tokens.scss`), themed under both `.dark` and `[data-theme='dark']`. There is no `isDarkMode` prop anywhere — do not add one.
- `ChartPalette` (JS literals, kumo-compatible signatures with `isDark` params) exists for consumers outside chart components. `categoricalVar(i)` returns theme-following `var()` references for templates.
- Continuous color interpolation (choropleth ramp) happens in CSS via `color-mix(in oklab, …)` between `--tx-chart-map-scale-*` stops — never parse colors in JS for theming.

## Component Conventions

- Directory shape mirrors tuffex: `src/<component>/{index.ts, src/{TxX.vue, types.ts}, __tests__/}`; `Tx` prefix + `defineOptions({ name })`; barrel exports both value and types.
- **Vue Boolean-prop trap (bitten twice here):** an absent Boolean prop is cast to `false`, so `props.flag ?? auto` never reaches the auto branch. Tri-state props (`boolean | 'auto'`, default `'auto'`) are the established fix — `TxChartTooltip.open`, `TxSankeyChart.showNodeValues`.
- Generic SFCs (`generic="T"`, accessor props) compile to functions: `InstanceType<typeof comp>` does not apply (maps exports no `*Instance` types), and a deep `ref` holding `T` unwraps it (`UnwrapRef<T> ≠ T`) — use `shallowRef`.
- Interactive elements are semantic: a legend item with a click listener renders a native `<button type="button">`, never `div role="button"`.
- All components accept explicit `width` (SSR/tests — jsdom measures 0); interactive math (brush, roam, clustering, tooltip placement) lives in pure modules with unit tests.
- HTML-string formatters from kumo became slots everywhere (no XSS-escaping surface). Cluster/"+N more" wording is overridable via function props, per the no-i18n convention.

## Chart Context (custom layers)

`TxChart` provides `TxChartContext` (scales, plot rect, pointer, palette allocation, bar lane/stack layout) via `chartContextKey`; series/axes throw outside it. Bars: no `stack` → side-by-side lanes; shared `stack` key → stacked, with stacked totals feeding the auto y domain (stacked bar series deliberately report `y: null` extents).

## Known Divergences from kumo (intentional — don't "fix")

Registered in the parity appendix of `.trellis/tasks` archive `08-30-tuffex-charts/design.md` §12: no `echarts`/`isDarkMode`/`optionUpdateBehavior`/`onEvents` props; `enableLegendSelection` → `v-model:hidden-series` + `highlighted-series`; tooltip boundary simplified to container clamp + viewport flip; no transient out-of-brush dimming; `projection` takes a d3-geo instance (`null` = equirectangular); sankey cycles degrade to empty render + dev warning instead of throwing.

## Docs

Six-page Charts group under `apps/nexus/content/docs/dev/components/` (charts / chart-colors / timeseries-chart / maps / sankey-chart / custom-chart × zh/en), category `Charts` wired in DocsSidebar + TAXONOMY + both locales. Map demos fetch world GeoJSON from a CDN at runtime — the package ships no geo data by design.
