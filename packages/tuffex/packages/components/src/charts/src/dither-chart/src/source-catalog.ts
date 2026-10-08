// Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { DitherChartVariant } from './types'

export const DITHER_SOURCE_COMPONENTS: Record<string, DitherChartVariant | 'flip-book' | 'demo-composition'> = {
  DitherDonutChart: 'dither-donut', DitherStackedChart: 'dither-stacked',
  DitherGrowthChart: 'dither-growth', ActivityHeatmap: 'dither-heatmap',
  ServerGauge: 'dither-gauge', TrafficBubble: 'dither-traffic',
  DitherFunnelChart: 'dither-funnel', DeviceUsageChart: 'dither-device',
  StorageUsageChart: 'dither-storage', RevenueLineChart: 'dither-revenue',
  UptimeChart: 'dither-uptime', DitherBarChart: 'dither-bar',
  DitherRadialChart: 'dither-radial', DitherScatterChart: 'dither-scatter',
  DitherHeatmapGrid: 'dither-heatmap-grid', DitherSparklineMatrix: 'dither-sparkline-matrix',
  MembersGrowthChart: 'members-growth', PaymentsChart: 'payments', ChartCard: 'plan-card',
  DitherBook: 'flip-book', DitherChartsGrid: 'demo-composition', SimpleCompExtracted: 'demo-composition',
  // SimpleCompExtracted is Apache-2.0; its derived composition is in the demo,
  // with the original SPDX and a significant Vue/TuffEx modification notice.
}

/** Byte-equality established by the fixed upstream inventory, not inferred from names. */
export const DITHER_IDENTICAL_SOURCES = [
  'ChartCard', 'DitherBarChart', 'DitherBook', 'DitherChartsGrid',
  'DitherHeatmapGrid', 'DitherRadialChart', 'DitherScatterChart',
  'DitherSparklineMatrix', 'MembersGrowthChart', 'PaymentsChart', 'SimpleCompExtracted',
] as const

/** Both source files were reviewed. Their geometry is identical; differences are runtime protections. */
export const DITHER_SOURCE_DIFFERENCES = [
  { component: 'ActivityHeatmap', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion'] },
  { component: 'DeviceUsageChart', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion'] },
  { component: 'DitherDonutChart', differences: ['cached-resize', 'visibility', 'reduced-motion'] },
  { component: 'DitherFunnelChart', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion', '30fps'] },
  { component: 'DitherGrowthChart', differences: ['cached-resize', 'visibility', 'reduced-motion'] },
  { component: 'DitherStackedChart', differences: ['cached-resize', 'visibility', 'reduced-motion'] },
  { component: 'RevenueLineChart', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion'] },
  { component: 'ServerGauge', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion'] },
  { component: 'StorageUsageChart', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion', '30fps'] },
  { component: 'TrafficBubble', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion'] },
  { component: 'UptimeChart', differences: ['cached-resize', 'dpr-cap', 'visibility', 'reduced-motion', '30fps'] },
] as const
