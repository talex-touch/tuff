// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// Canvas painting, split from the SFC so the draw-call surface can be asserted
// against a stub context — jsdom has no 2d context at all.

import type { ProjectedPoint } from './geometry'
import type { SparkChartPadding } from './types'

export interface DrawSeries {
  points: ProjectedPoint[]
  color: string
}

export interface DrawSparkChartOptions {
  /** CSS pixels; the context is pre-scaled by `dpr` so all maths stays in CSS units. */
  width: number
  height: number
  dpr: number
  lineWidth: number
  padding: SparkChartPadding
  grid: boolean
  gridLines: number
  gridColor: string
  series: DrawSeries[]
}

export function drawSparkChart(
  ctx: CanvasRenderingContext2D,
  options: DrawSparkChartOptions,
): void {
  const { width, height, dpr } = options
  if (width <= 0 || height <= 0)
    return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  if (options.grid && options.gridLines > 0)
    drawGrid(ctx, options)

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = options.lineWidth

  for (const series of options.series) {
    if (series.points.length === 0)
      continue

    ctx.strokeStyle = series.color
    ctx.beginPath()
    series.points.forEach((point, index) => {
      if (index === 0)
        ctx.moveTo(point.x, point.y)
      else
        ctx.lineTo(point.x, point.y)
    })
    // A single sample keeps its subpath zero-length; the round cap paints it as
    // a dot rather than dropping the series off the chart.
    if (series.points.length === 1) {
      const only = series.points[0]!
      ctx.lineTo(only.x, only.y)
    }
    ctx.stroke()
  }

  // Leave the context in the identity transform for anything painting after us.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function drawGrid(ctx: CanvasRenderingContext2D, options: DrawSparkChartOptions): void {
  const { width, height, dpr, padding, gridLines, gridColor } = options
  const innerHeight = Math.max(0, height - padding.top - padding.bottom)

  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1 / dpr

  for (let index = 0; index < gridLines; index += 1) {
    const ratio = gridLines === 1 ? 0.5 : index / (gridLines - 1)
    const raw = padding.top + ratio * innerHeight
    // Snap onto a device pixel so the hairline stays one pixel wide.
    const y = Math.round(raw * dpr) / dpr + 0.5 / dpr

    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}
