// Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { DitherCell, DitherChartVariant, DitherDataset, DitherHover, DitherSeries } from './types'
import { arc, area, curveLinear, line, pie } from 'd3-shape'
import { createXScale, createYScale, xPosition } from '../../core/scales'

export interface DitherShape {
  key: string
  path: string
  bounds: [number, number, number, number]
  datum?: DitherHover
  /** Distinct pixel shading algorithms from the source, not interchangeable presets. */
  texture: 'donut' | 'device' | 'stacked' | 'payments' | 'growth' | 'member' | 'bar' | 'radial' | 'gauge' | 'traffic' | 'scatter' | 'funnel' | 'storage' | 'revenue' | 'cell' | 'matrix' | 'sparkline' | 'track'
  opacity: number
  color?: string
  seriesIndex: number
  circle?: { x: number, y: number, inner: number, outer: number, midAngle?: number }
  stroke?: boolean
  translate?: [number, number]
}
export interface DitherScene {
  shapes: DitherShape[]
  labels: { x: number, y: number, text: string, anchor?: 'start' | 'middle' | 'end' }[]
  ticks: { y: number, value: number }[]
  cursorPoints: { x: number, y: number, datum: DitherHover }[]
  total: number
}
export interface SceneInput {
  variant: DitherChartVariant
  dataset: DitherDataset
  width: number
  height: number
  selectedSeries?: string
  activeKeys?: readonly string[]
  maxValue?: number
  /** Internal interpolation ratio for gauge/storage transitions. */
  selectedRatio?: number
  hover?: DitherHover | null
}
export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))
export const finite = (value: number | undefined, fallback = 0): number => Number.isFinite(value) ? value! : fallback
export function seriesValue(series: DitherSeries): number {
  return finite(series.value, series.data?.reduce((sum, point) => sum + finite(point.value), 0) ?? 0)
}
function rectPath(x: number, y: number, w: number, h: number, radius = 0): string {
  const r = Math.min(radius, Math.max(0, w / 2), Math.max(0, h / 2))
  if (!r) return `M${x},${y}h${w}v${h}h${-w}Z`
  return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`
}
const circlePath = (x: number, y: number, r: number): string => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`
const cellStatus = (cell: DitherCell): number => cell.status === 'up' ? 1 : cell.status === 'down' ? 0 : cell.status === 'degraded' ? 0.8 : clamp(cell.value)

/** Every branch mirrors its source geometry; consumer values replace upstream demonstration constants. */
export function createDitherScene(input: SceneInput): DitherScene {
  const { variant, width: w, height: h } = input
  const allSeries = input.dataset.series ?? []
  const series = allSeries.filter(item => !input.activeKeys || input.activeKeys.includes(item.id))
  const scene: DitherScene = { shapes: [], labels: [], ticks: [], cursorPoints: [], total: series.reduce((sum, item) => sum + seriesValue(item), 0) }
  const shape = (value: DitherShape): void => { scene.shapes.push(value) }
  const selected = series.find(item => item.id === input.selectedSeries) ?? series[0]
  const datum = (item: DitherSeries): DitherHover => ({ id: item.id, seriesId: item.id, label: item.label, value: seriesValue(item) })
  const colorIndex = (item: DitherSeries): number => allSeries.findIndex(entry => entry.id === item.id)
  if (w <= 0 || h <= 0) return scene

  if (variant === 'dither-donut' || variant === 'dither-device' || variant === 'plan-card') {
    const r = Math.min(w, h) * 0.43
    const inner = r * (variant === 'dither-device' ? 0.65 : 55 / 86)
    const cx = w / 2; const cy = h / 2
    const wedges = pie<DitherSeries>().sort(null).value(item => Math.max(0, seriesValue(item)))(series)
    const drawArc = arc<typeof wedges[number]>().innerRadius(inner).outerRadius(r)
      .padAngle(variant === 'dither-device' ? 0 : 0.07).cornerRadius(variant === 'dither-device' ? 0 : 6)
    for (const wedge of wedges) {
      if (wedge.value <= 0) continue
      shape({ key: wedge.data.id, path: drawArc(wedge) ?? '', translate: [cx, cy], bounds: [cx - r, cy - r, 2 * r, 2 * r], datum: datum(wedge.data), texture: variant === 'dither-device' ? 'device' : 'donut', opacity: 0.85, color: wedge.data.color, seriesIndex: colorIndex(wedge.data), circle: { x: cx, y: cy, inner, outer: r, midAngle: (wedge.startAngle + wedge.endAngle) / 2 - Math.PI / 2 } })
    }
    return scene
  }

  if (variant === 'dither-gauge' || variant === 'dither-radial') {
    if (!selected) return scene
    const radial = variant === 'dither-radial'
    const r = radial ? Math.min(w, h) * 0.42 : Math.min(w * 0.4, h * 0.7)
    const inner = radial ? r * 0.58 : Math.max(0, r - 10)
    const cx = w / 2; const cy = radial ? h / 2 : h * 0.8
    const start = radial ? 0 : -Math.PI / 2
    const sweep = radial ? Math.PI * 2 : Math.PI
    const drawArc = arc().innerRadius(inner).outerRadius(r)
    const track = drawArc({ startAngle: start, endAngle: start + sweep, innerRadius: inner, outerRadius: r }) ?? ''
    shape({ key: 'track', path: track, translate: [cx, cy], bounds: [cx - r, cy - r, 2 * r, 2 * r], texture: 'track', opacity: 0.1, seriesIndex: 0 })
    const value = clamp(input.selectedRatio ?? seriesValue(selected) / Math.max(1, finite(selected.capacity, 100)))
    shape({ key: selected.id, path: drawArc({ startAngle: start, endAngle: start + sweep * value, innerRadius: inner, outerRadius: r }) ?? '', translate: [cx, cy], bounds: [cx - r, cy - r, 2 * r, 2 * r], texture: radial ? 'radial' : 'gauge', datum: datum(selected), opacity: 0.9, color: selected.color, seriesIndex: colorIndex(selected), circle: { x: cx, y: cy, inner, outer: r } })
    scene.total = seriesValue(selected)
    return scene
  }

  if (variant === 'dither-traffic' || variant === 'dither-scatter') {
    const nodes = (input.dataset.nodes ?? []).filter(item => !input.activeKeys || input.activeKeys.includes(item.id))
    const traffic = variant === 'dither-traffic'
    const positions = nodes.map(node => ({ x: clamp(finite(node.x), 0, 100) / 100 * w, y: traffic ? clamp(finite(node.y), 0, 100) / 100 * h : h - clamp(finite(node.y), 0, 100) / 100 * h }))
    if (!traffic && positions.length > 1) {
      shape({ key: 'trend', path: line<typeof positions[number]>().x(point => point.x).y(point => point.y)(positions) ?? '', bounds: [0, 0, w, h], texture: 'track', opacity: 0.3, seriesIndex: 0, stroke: true })
    }
    nodes.forEach((node, index) => {
      const point = positions[index]!
      const radius = Math.max(1, finite(node.radius, traffic ? 25 : 7))
      const r = !traffic && input.hover?.id === node.id ? radius * 3.5 / 2.2 : radius
      const originalIndex = input.dataset.nodes?.findIndex(item => item.id === node.id) ?? index
      shape({ key: node.id, path: circlePath(point.x, point.y, r), bounds: [point.x - r, point.y - r, 2 * r, 2 * r], texture: traffic ? 'traffic' : 'scatter', opacity: 0.85, datum: { id: node.id, label: node.label, value: node.value }, color: node.color, seriesIndex: originalIndex, circle: { x: point.x, y: point.y, inner: 0, outer: r } })
      if (traffic) scene.labels.push({ x: point.x, y: point.y, text: node.label })
      scene.cursorPoints.push({ x: point.x, y: point.y, datum: { id: node.id, label: node.label, value: node.value } })
    })
    scene.total = nodes.reduce((sum, node) => sum + finite(node.value), 0)
    return scene
  }

  if (variant === 'dither-heatmap' || variant === 'dither-heatmap-grid' || variant === 'dither-uptime') {
    const cells = input.dataset.cells ?? []
    scene.total = cells.reduce((sum, cell) => sum + finite(cell.value), 0)
    const maxRow = cells.reduce((max, cell) => Math.max(max, cell.row), 0) + 1
    const maxCol = cells.reduce((max, cell) => Math.max(max, cell.column), 0) + 1
    const max = Math.max(1, input.maxValue ?? cells.reduce((value, cell) => Math.max(value, finite(cell.value)), 0))
    const uptime = variant === 'dither-uptime'
    const perRow = Math.max(1, Math.floor(w / 8))
    const rows = Math.ceil(cells.length / perRow)
    const cellW = uptime ? 6 : variant === 'dither-heatmap' ? Math.min(10, (w - (maxCol - 1) * 2.5) / maxCol) : w / maxCol - 2
    const cellH = uptime ? Math.min(26, (h - Math.max(0, rows - 1) * 2) / Math.max(1, rows)) : variant === 'dither-heatmap' ? Math.min(10, (h - (maxRow - 1) * 2.5) / maxRow) : h / maxRow - 2
    const gap = variant === 'dither-heatmap' ? 2.5 : 2
    const sx = variant === 'dither-heatmap' ? Math.max(0, (w - maxCol * (cellW + gap) + gap) / 2) : 0
    const sy = variant === 'dither-heatmap' ? Math.max(0, (h - maxRow * (cellH + gap) + gap) / 2) : 0
    cells.forEach((cell, index) => {
      const x = sx + (uptime ? index % perRow : cell.column) * (cellW + gap)
      const y = sy + (uptime ? Math.floor(index / perRow) : cell.row) * (cellH + gap)
      const intensity = uptime ? cellStatus(cell) === 1 ? 1 : cellStatus(cell) === 0 ? 0.3 : 0.6 : 0.15 + clamp(finite(cell.value) / max) * 0.85
      shape({ key: cell.id, path: rectPath(x, y, Math.max(0, cellW), Math.max(0, cellH)), bounds: [x, y, Math.max(0, cellW), Math.max(0, cellH)], texture: variant === 'dither-heatmap-grid' ? 'matrix' : 'cell', opacity: intensity, datum: { id: cell.id, label: cell.label, value: cell.value }, seriesIndex: 0 })
    })
    return scene
  }

  if (variant === 'dither-funnel' || variant === 'dither-storage') {
    const storage = variant === 'dither-storage'
    const items = storage && selected ? [selected] : series
    const max = Math.max(1, input.maxValue ?? items.reduce((value, item) => Math.max(value, seriesValue(item)), 0))
    const rowH = storage ? Math.min(32, h) : Math.max(0, (h - Math.max(0, items.length - 1) * 6) / Math.max(1, items.length))
    items.forEach((item, index) => {
      const y = storage ? (h - rowH) / 2 : index * (rowH + 6)
      const denom = storage ? Math.max(1, finite(item.capacity, 100)) : max
      const fillW = clamp(storage ? input.selectedRatio ?? seriesValue(item) / denom : seriesValue(item) / denom) * w
      if (storage) shape({ key: 'track', path: rectPath(0, y, w, rowH), bounds: [0, y, w, rowH], texture: 'track', opacity: 0.1, seriesIndex: 0 })
      shape({ key: item.id, path: rectPath(0, y, fillW, rowH), bounds: [0, y, fillW, rowH], texture: storage ? 'storage' : 'funnel', opacity: 0.85, datum: datum(item), color: item.color, seriesIndex: colorIndex(item) })
    })
    if (storage && selected) scene.total = seriesValue(selected)
    return scene
  }

  if (variant === 'dither-stacked' || variant === 'payments' || variant === 'dither-bar') {
    const stacked = variant !== 'dither-bar'
    const categories = Array.from(new Set(series.flatMap(item => item.data?.map(point => point.label) ?? [])))
    const categoryTotals = categories.map(label => series.reduce((sum, item) => sum + Math.max(0, finite(item.data?.find(point => point.label === label)?.value)), 0))
    const max = Math.max(1, input.maxValue ?? Math.max(0, ...categoryTotals) * 1.05)
    const yScale = createYScale([0, max], [h, 0], true)
    const xScale = createXScale('band', categories, [0, w])
    const laneW = w / Math.max(1, categories.length)
    const barW = Math.min(laneW * (stacked ? 0.62 : 0.55), stacked ? 54 : 36)
    categories.forEach((label, index) => {
      const cx = xPosition(xScale, label)
      let bottom = h
      series.forEach((item, seriesIndex) => {
        const value = Math.max(0, finite(item.data?.find(point => point.label === label)?.value))
        const height = h - yScale(value)
        const gap = variant === 'payments' ? 4 : 0
        const x = stacked ? cx - barW / 2 : cx - barW / 2 + seriesIndex * barW / Math.max(1, series.length)
        const width = stacked ? barW : barW / Math.max(1, series.length)
        const y = bottom - height
        shape({ key: `${item.id}:${label}`, path: rectPath(x, y, width, height, stacked ? 5 : 0), bounds: [x, y, width, height], texture: variant === 'payments' ? 'payments' : stacked ? 'stacked' : 'bar', opacity: 0.85, datum: { id: label, seriesId: item.id, label: `${label} · ${item.label}`, value }, color: item.color, seriesIndex: colorIndex(item) })
        if (stacked) bottom = y - gap
      })
      scene.labels.push({ x: cx, y: h + 16, text: label })
      scene.cursorPoints.push({ x: cx, y: h - categoryTotals[index]! / yScale.domain()[1]! * h, datum: { id: label, label, value: categoryTotals[index]! } })
    })
    scene.ticks = yScale.ticks(4).map(value => ({ y: yScale(value), value }))
    return scene
  }

  const sparkline = variant === 'dither-sparkline-matrix'
  const items = sparkline && selected ? [selected] : series
  const max = Math.max(1, input.maxValue ?? items.reduce((value, item) => Math.max(value, ...(item.data?.map(point => Math.max(0, finite(point.value))) ?? [0])), 0) * 1.2)
  const yScale = createYScale([0, max], [h, 0], false)
  items.forEach((item) => {
    const points = item.data ?? []
    if (!points.length) return
    const xScale = createXScale('linear', [0, Math.max(1, points.length - 1)], [0, w])
    const coords = points.map((point, index) => ({ x: points.length === 1 ? w / 2 : xPosition(xScale, index), y: yScale(Math.max(0, finite(point.value))) }))
    const areaPath = area<typeof coords[number]>().x(point => point.x).y0(h).y1(point => point.y).curve(curveLinear)(coords) ?? ''
    const texture = variant === 'dither-revenue' ? 'revenue' : variant === 'members-growth' ? 'member' : sparkline ? 'sparkline' : 'growth'
    shape({ key: item.id, path: areaPath, bounds: [0, 0, w, h], texture, opacity: 0.8, color: item.color, seriesIndex: colorIndex(item), datum: datum(item) })
    if (variant === 'dither-revenue') shape({ key: `${item.id}:line`, path: line<typeof coords[number]>().x(point => point.x).y(point => point.y)(coords) ?? '', bounds: [0, 0, w, h], texture: 'revenue', opacity: 1, color: item.color, seriesIndex: colorIndex(item), stroke: true })
    if (item === items[0]) {
      coords.forEach((point, index) => scene.cursorPoints.push({ ...point, datum: { id: String(index), seriesId: item.id, label: points[index]!.label, value: points[index]!.value } }))
      const indices = new Set([0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2), Math.floor((points.length - 1) * 3 / 4), points.length - 1])
      for (const index of indices) scene.labels.push({ x: coords[index]!.x, y: h + 16, text: points[index]!.label, anchor: index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle' })
    }
  })
  scene.ticks = yScale.ticks(4).map(value => ({ y: yScale(value), value }))
  if (sparkline && selected) scene.total = seriesValue(selected)
  return scene
}
