// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// Canvas painting, split from the SFC so the draw-call surface can be asserted
// against a stub context — jsdom has no 2d context at all.

import type { ProjectedPoint } from './geometry'
import type { LineCurve } from '../../charts/src/series/src/types'
import { line } from 'd3-shape'
import { curveFactory } from '../../charts/src/series/src/curves'

export interface DrawSeries {
  points: ProjectedPoint[]
  color: string
}

export interface DrawAxisTick {
  position: number
  label: string
}

export interface DrawSparkChartOptions {
  /** CSS pixels; the context is pre-scaled by `dpr` so all maths stays in CSS units. */
  width: number
  height: number
  dpr: number
  lineWidth: number
  padding: { top: number, right: number, bottom: number, left: number }
  grid: boolean
  gridLines: number
  gridColor: string
  curve: LineCurve
  xAxis: boolean
  yAxis: boolean
  xTicks: DrawAxisTick[]
  yTicks: DrawAxisTick[]
  axisColor: string
  axisTextColor: string
  axisFont: string
  activeIndex: number | null
  activeColor: string
  revealProgress: number
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
  if (options.xAxis || options.yAxis)
    drawAxes(ctx, options)

  ctx.save()
  ctx.beginPath()
  ctx.rect(
    options.padding.left,
    options.padding.top,
    Math.max(0, width - options.padding.left - options.padding.right) * clampProgress(options.revealProgress),
    Math.max(0, height - options.padding.top - options.padding.bottom),
  )
  ctx.clip()

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = options.lineWidth

  for (const series of options.series)
    strokeSeries(ctx, series, options.curve)

  ctx.restore()

  if (options.activeIndex !== null)
    drawActiveSample(ctx, options)

  // Leave the context in the identity transform for anything painting after us.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function strokeSeries(
  ctx: CanvasRenderingContext2D,
  series: DrawSeries,
  curve: LineCurve,
): void {
  if (series.points.length === 0)
    return

  ctx.strokeStyle = series.color
  ctx.beginPath()
  if (series.points.length === 1) {
    const only = series.points[0]!
    ctx.moveTo(only.x, only.y)
    ctx.lineTo(only.x, only.y)
  } else {
    line<ProjectedPoint>()
      .x(point => point.x)
      .y(point => point.y)
      .curve(curveFactory(curve))
      .context(ctx)(series.points)
  }
  ctx.stroke()
}

function drawGrid(ctx: CanvasRenderingContext2D, options: DrawSparkChartOptions): void {
  const { width, height, dpr, padding, gridLines, gridColor } = options
  const innerWidth = Math.max(0, width - padding.left - padding.right)
  const innerHeight = Math.max(0, height - padding.top - padding.bottom)

  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1 / dpr

  for (let index = 0; index < gridLines; index += 1) {
    const ratio = gridLines === 1 ? 0.5 : index / (gridLines - 1)
    const raw = padding.top + ratio * innerHeight
    // Snap onto a device pixel so the hairline stays one pixel wide.
    const y = Math.round(raw * dpr) / dpr + 0.5 / dpr

    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(padding.left + innerWidth, y)
    ctx.stroke()
  }
}

function drawAxes(ctx: CanvasRenderingContext2D, options: DrawSparkChartOptions): void {
  const { width, height, dpr, padding } = options
  const right = width - padding.right
  const bottom = height - padding.bottom

  ctx.strokeStyle = options.axisColor
  ctx.fillStyle = options.axisTextColor
  ctx.lineWidth = 1 / dpr
  ctx.font = options.axisFont

  if (options.yAxis) {
    ctx.beginPath()
    ctx.moveTo(padding.left + 0.5 / dpr, padding.top)
    ctx.lineTo(padding.left + 0.5 / dpr, bottom)
    ctx.stroke()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const tick of options.yTicks) {
      // Right-aligned against the axis, so a label wider than the inset would
      // start left of the canvas and be drawn outside it: hold the anchor at
      // least its own width in.
      const anchor = Math.max(ctx.measureText(tick.label).width, padding.left - 5)
      ctx.fillText(tick.label, anchor, tick.position)
    }
  }

  if (options.xAxis) {
    ctx.beginPath()
    ctx.moveTo(padding.left, bottom - 0.5 / dpr)
    ctx.lineTo(right, bottom - 0.5 / dpr)
    ctx.stroke()
    ctx.textBaseline = 'top'
    for (const tick of options.xTicks) {
      // The first and last tick sit on the plot edges, where a centred label
      // loses half of itself; anchor those two inward instead.
      const half = ctx.measureText(tick.label).width / 2
      ctx.textAlign = tick.position - half < 0
        ? 'left'
        : tick.position + half > width ? 'right' : 'center'
      ctx.fillText(tick.label, tick.position, bottom + 5)
    }
  }
}

function drawActiveSample(ctx: CanvasRenderingContext2D, options: DrawSparkChartOptions): void {
  const index = options.activeIndex
  if (index === null)
    return
  const anchor = options.series.find(series => series.points[index] !== undefined)?.points[index]
  if (!anchor)
    return

  const { padding, height, dpr } = options
  ctx.strokeStyle = options.activeColor
  ctx.lineWidth = 1 / dpr
  ctx.beginPath()
  ctx.moveTo(anchor.x, padding.top)
  ctx.lineTo(anchor.x, height - padding.bottom)
  ctx.stroke()

  for (const series of options.series) {
    const point = series.points[index]
    if (!point)
      continue
    ctx.fillStyle = series.color
    ctx.beginPath()
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value))
}
