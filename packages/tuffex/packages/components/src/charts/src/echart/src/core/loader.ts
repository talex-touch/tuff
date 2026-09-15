// ECharts is loaded on demand and never bundled: it is a peer dependency, and
// the dynamic imports keep it in its own chunk until an ECharts-backed chart
// actually mounts. Tree-shaken registration happens once per page.

import type * as echarts from 'echarts/core'

export type EChartsRuntime = typeof echarts

let pending: Promise<EChartsRuntime> | null = null

async function register(): Promise<EChartsRuntime> {
  const [core, charts, components, renderers] = await Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers'),
  ])

  core.use([
    renderers.CanvasRenderer,
    charts.LineChart,
    charts.BarChart,
    charts.PieChart,
    charts.FunnelChart,
    charts.RadarChart,
    charts.GaugeChart,
    charts.ScatterChart,
    charts.HeatmapChart,
    charts.TreemapChart,
    components.GridComponent,
    components.TooltipComponent,
    components.LegendComponent,
    components.TitleComponent,
    components.VisualMapComponent,
    components.AriaComponent,
  ])

  return core
}

/**
 * Resolves the ECharts runtime, registering the component and series modules
 * this family uses. Rejections are not cached: a host that installs `echarts`
 * after the first failure still gets a working chart on the next mount.
 */
export function loadECharts(): Promise<EChartsRuntime> {
  pending ??= register().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}
