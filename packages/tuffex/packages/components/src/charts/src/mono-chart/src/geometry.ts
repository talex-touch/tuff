// Adapted from Amicro mono-charts (MIT).
// Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { MonoChartContribution, MonoChartCurve, MonoChartData, MonoChartHit, MonoChartLabels, MonoChartLayout, MonoChartSeriesMode, MonoChartTreeNode, MonoChartVariant } from './types'
import { area, curveStepAfter, line } from 'd3-shape'
import { createXScale, createYScale, xPosition, xTickValues } from '../../core/scales'
import { computeSankeyLayout } from '../../sankey/src/layout'
import { curveFactory } from '../../series/src/curves'

export interface MonoMark {
  tag: 'path' | 'rect' | 'circle' | 'line' | 'text'
  attrs: Record<string, number | string>
  text?: string
  hit?: string
  className?: string
}
export interface MonoGeometry { marks: MonoMark[], hits: MonoChartHit[], total: number, center?: { x: number, y: number } }
export interface MonoGeometryOptions {
  variant: MonoChartVariant
  data: MonoChartData
  width: number
  height: number
  seriesMode: MonoChartSeriesMode
  layout: MonoChartLayout
  curve: MonoChartCurve
  showLine: boolean
  cellSize: number
  months: number
  showMonths: boolean
  monthNames: string[]
  accent?: string | string[]
  labels: Required<MonoChartLabels>
}
const INK = 'var(--tx-mono-ink, var(--tx-text-color-primary, #303133))'
const GRID = 'var(--tx-chart-grid-line, var(--tx-border-color-light, #e4e7ed))'
const TEXT = 'var(--tx-chart-text-primary, var(--tx-text-color-regular, #606266))'
const TRACK = 'var(--tx-mono-track, var(--tx-fill-color, #f0f2f5))'
const TAU = Math.PI * 2
const finite = (n: number) => Number.isFinite(n)
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))
const tone = (i: number, n: number) => Math.max(0.2, 1 - i / Math.max(1, n) * 0.8)
function extent(values: number[]): [number, number] {
  let lo = 0
  let hi = 0
  for (const value of values) {
    if (finite(value)) { lo = Math.min(lo, value); hi = Math.max(hi, value) }
  }
  return lo === hi ? [lo, hi + 1] : [lo, hi]
}
function arcPath(cx: number, cy: number, r: number, start: number, sweep: number): string {
  const end = start + Math.min(sweep, TAU - 0.00001)
  return `M${cx + Math.cos(start) * r},${cy + Math.sin(start) * r} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${cx + Math.cos(end) * r},${cy + Math.sin(end) * r}`
}
function roundedRect(x: number, y: number, w: number, h: number, radius: number, top = true, bottom = true): string {
  const r = Math.min(radius, w / 2, h / 2)
  const t = top ? r : 0
  const b = bottom ? r : 0
  return `M${x + t},${y}H${x + w - t}Q${x + w},${y} ${x + w},${y + t}V${y + h - b}Q${x + w},${y + h} ${x + w - b},${y + h}H${x + b}Q${x},${y + h} ${x},${y + h - b}V${y + t}Q${x},${y} ${x + t},${y}Z`
}

/** Pure SVG geometry; no demo values, browser APIs, random IDs or time dependence. */
export function buildMonoGeometry(o: MonoGeometryOptions): MonoGeometry {
  const { data, width: w, height: h, variant } = o
  const result: MonoGeometry = { marks: [], hits: [], total: 0 }
  const mark = (tag: MonoMark['tag'], attrs: MonoMark['attrs'], hit?: string, text?: string, className?: string) => result.marks.push({ tag, attrs, hit, text, className })
  const hit = (key: string, label: string, rows: MonoChartHit['rows'], x: number, y: number, value?: number) => {
    result.hits.push({ key, label, rows, x, y, value })
    return key
  }
  const label = (x: number, y: number, text: string, anchor = 'middle') => mark('text', { x, y, fill: TEXT, 'text-anchor': anchor }, undefined, text, 'tx-mono-chart__axis')
  const rect = (x: number, y: number, width: number, height: number, key?: string, opacity = 1, fill = INK, radius = 8) => mark('rect', { x, y, width: Math.max(0, width), height: Math.max(0, height), rx: radius, fill, opacity }, key)
  const stroke = (d: string, key?: string, opacity = 1, sw = 2.5, fill = 'none') => mark('path', { d, fill, stroke: INK, 'stroke-width': sw, opacity, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, key)
  const items = (data.items ?? []).filter(item => finite(item.value))
  const plot = { x: 46, y: 18, width: Math.max(1, w - 68), height: Math.max(1, h - 58) }

  if (variant.startsWith('mono-activity-') || variant === 'github-activity') {
    const days = (data.contributions ?? []).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && finite(day.count))
    const size = Math.max(3, o.cellSize)
    const gap = Math.max(2, Math.round(size / 4))
    const columns = Math.max(1, Math.min(Math.ceil(o.months * 365.25 / 12 / 7), Math.floor((w - 40 + gap) / (size + gap))))
    const visible = days.slice(-columns * 7)
    const count = Math.ceil(visible.length / 7)
    const x0 = (w - (count * (size + gap) - gap)) / 2
    const y0 = Math.max(24, (h - 7 * (size + gap)) / 2)
    let lastMonth = ''
    visible.forEach((day: MonoChartContribution, index) => {
      const column = Math.floor(index / 7)
      const x = x0 + column * (size + gap)
      const y = y0 + index % 7 * (size + gap)
      const key = hit(`day-${day.date}`, day.date, [{ name: day.date, value: day.count }], x + size / 2, y + size / 2, day.count)
      const colors = Array.isArray(o.accent) ? o.accent : undefined
      const color = colors ? colors[day.level] ?? colors.at(-1) ?? INK : typeof o.accent === 'string' ? o.accent : 'var(--tx-mono-accent, var(--tx-chart-semantic-success, #00a63e))'
      rect(x, y, size, size, key, colors ? 1 : [0.08, 0.3, 0.52, 0.76, 1][day.level] ?? 0.08, color, 3)
      const month = day.date.slice(0, 7)
      if (o.showMonths && index % 7 === 0 && month !== lastMonth && (count - column >= 3 || column === 0)) {
        label(x, y0 - 8, o.monthNames[Number(day.date.slice(5, 7)) - 1] ?? '', 'start')
        lastMonth = month
      }
    })
    result.total = days.reduce((sum, day) => sum + day.count, 0)
    return result
  }

  if (variant === 'mono-rounded-heatmap') {
    const rows = data.matrix ?? []
    const columns = Math.max(1, ...rows.map(row => row.values.length))
    const size = Math.min((plot.width - 45) / columns, plot.height / Math.max(1, rows.length))
    const x0 = 85 + Math.max(0, (plot.width - 45 - columns * size) / 2)
    const y0 = plot.y + Math.max(0, (plot.height - rows.length * size) / 2)
    const max = Math.max(1, ...rows.flatMap(row => row.values).filter(finite))
    rows.forEach((row, i) => {
      label(x0 - 8, y0 + (i + 0.6) * size, row.label, 'end')
      row.values.forEach((value, j) => {
        if (!finite(value)) return
        const x = x0 + j * size
        const y = y0 + i * size
        const key = hit(`matrix-${i}-${j}`, row.label, [{ name: String(data.categories?.[j] ?? j + 1), value }], x + size / 2, y + size / 2, value)
        rect(x + 3, y + 3, size - 6, size - 6, key, Math.max(0.06, value / max), INK, Math.min(6, size / 5))
        result.total += value
      })
    })
    return result
  }

  if (variant === 'mono-rounded-donut' || variant === 'mono-rounded-gauge-arc' || variant === 'mono-rounded-meter' || variant === 'mono-rounded-radial-group' || variant === 'mono-rounded-radial-gauge' || variant === 'mono-rounded-polar') {
    const radius = Math.min(w * 0.3, h * 0.35)
    const cx = w / 2
    const cy = variant === 'mono-rounded-meter' || variant === 'mono-rounded-gauge-arc' || variant === 'mono-rounded-radial-group' ? h * 0.65 : h / 2
    result.total = items.reduce((sum, item) => sum + item.value, 0)
    result.center = { x: cx, y: cy }
    if (variant === 'mono-rounded-donut') {
      let start = -Math.PI / 2
      const sw = Math.max(8, radius * 0.25)
      const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0)
      items.forEach((item, i) => {
        const sweep = total > 0 ? Math.max(0, item.value) / total * TAU : 0
        if (sweep <= 0) return
        const gap = Math.min(0.12, sweep / 3)
        const middle = start + sweep / 2
        const key = hit(`item-${i}`, item.label, [{ name: item.label, value: item.value }], cx + Math.cos(middle) * radius, cy + Math.sin(middle) * radius, item.value)
        stroke(arcPath(cx, cy, radius, start + gap / 2, sweep - gap), key, item.opacity ?? tone(i, items.length), sw)
        start += sweep
      })
    }
    else if (variant === 'mono-rounded-meter' || variant === 'mono-rounded-gauge-arc') {
      const item = items[0]
      if (!item) return result
      const sweep = variant === 'mono-rounded-meter' ? Math.PI : Math.PI * 4 / 3
      const start = variant === 'mono-rounded-meter' ? Math.PI : Math.PI * 5 / 6
      const ratio = clamp(item.value / (item.max && item.max > 0 ? item.max : 100))
      mark('path', { d: arcPath(cx, cy, radius, start, sweep), fill: 'none', stroke: TRACK, 'stroke-width': 16, 'stroke-linecap': 'round' })
      const key = hit('gauge', item.label, [{ name: item.label, value: item.value }], cx, cy - radius, item.value)
      if (ratio > 0) stroke(arcPath(cx, cy, radius, start, Math.max(0.0001, sweep * ratio - 0.04)), key, 1, 16)
    }
    else {
      const half = variant === 'mono-rounded-radial-group'
      const sweep = half ? Math.PI : TAU
      const start = variant === 'mono-rounded-polar' ? -Math.PI / 2 : Math.PI
      const gap = Math.min(5, radius / Math.max(2, items.length + 1) * 0.25)
      const sw = Math.min(variant === 'mono-rounded-polar' ? 12 : 9, (radius - gap * items.length) / Math.max(2, items.length + 1))
      items.forEach((item, i) => {
        const r = radius - i * (sw + gap)
        if (r <= sw / 2) return
        const ratio = clamp(item.value / (item.max && item.max > 0 ? item.max : 100))
        mark('path', { d: arcPath(cx, cy, r, start, sweep), fill: 'none', stroke: TRACK, 'stroke-width': sw, 'stroke-linecap': 'round' })
        const key = hit(`item-${i}`, item.label, [{ name: item.label, value: item.value }], cx + Math.cos(start + sweep * ratio) * r, cy + Math.sin(start + sweep * ratio) * r, item.value)
        if (ratio > 0) stroke(arcPath(cx, cy, r, start, sweep * ratio), key, variant === 'mono-rounded-polar' ? 1 : item.opacity ?? tone(i, items.length), sw)
      })
    }
    return result
  }

  if (variant === 'mono-rounded-bullet' || variant === 'mono-rounded-pyramid' || variant === 'mono-rounded-funnel') {
    const rowHeight = plot.height / Math.max(1, items.length)
    const max = Math.max(1, ...items.flatMap(item => [item.max ?? 0, item.value, item.target ?? 0]))
    const left = variant === 'mono-rounded-pyramid' ? 24 : Math.min(110, w * 0.24)
    const available = w - left - 30
    items.forEach((item, i) => {
      const barWidth = Math.max(0, item.value / max) * available
      const y = plot.y + i * rowHeight + rowHeight * 0.34
      const barH = Math.min(26, rowHeight * 0.38)
      const x = variant === 'mono-rounded-pyramid' ? (w - barWidth) / 2 : left
      const key = hit(`item-${i}`, item.label, [{ name: item.label, value: item.value }, ...(item.target === undefined ? [] : [{ name: o.labels.target, value: item.target }])], x + barWidth, y + barH / 2, item.value)
      if (variant === 'mono-rounded-bullet') rect(x, y, available, barH, undefined, 1, TRACK, barH / 2)
      rect(x, y, barWidth, barH, key, item.opacity ?? (variant === 'mono-rounded-pyramid' ? tone(i, items.length) : 1), INK, variant === 'mono-rounded-pyramid' ? 8 : barH / 2)
      if (variant === 'mono-rounded-bullet' && item.target !== undefined)
        mark('line', { x1: left + item.target / max * available, x2: left + item.target / max * available, y1: y - 4, y2: y + barH + 4, stroke: 'var(--tx-chart-semantic-success, #00a63e)', 'stroke-width': 3, 'stroke-linecap': 'round' }, key)
      label(variant === 'mono-rounded-pyramid' ? w / 2 : left - 10, y - 5, item.label, variant === 'mono-rounded-pyramid' ? 'middle' : 'end')
      result.total += item.value
    })
    return result
  }

  if (variant === 'mono-rounded-sankey') {
    const nodes = data.nodes ?? []
    const links = (data.links ?? []).filter(link => finite(link.value) && link.value > 0 && link.source >= 0 && link.source < nodes.length && link.target >= 0 && link.target < nodes.length)
    const layout = computeSankeyLayout(nodes, links, { width: w - 40, height: h - 28, nodeWidth: 18, nodePadding: 14, left: 0, right: 0 })
    if (!layout) return result
    layout.links.forEach((link, i) => {
      const name = `${nodes[link.sourceIndex]?.name ?? ''} → ${nodes[link.targetIndex]?.name ?? ''}`
      const key = hit(`link-${i}`, name, [{ name, value: link.datum.value }], (link.x1 + link.x2) / 2 + 20, h / 2, link.datum.value)
      mark('path', { d: link.path, transform: 'translate(20 14)', fill: 'none', stroke: INK, 'stroke-width': link.width, 'stroke-linecap': 'round', opacity: 0.25 + tone(i, links.length) * 0.15 }, key)
      result.total += link.datum.value
    })
    layout.nodes.forEach((node, i) => {
      const x = node.x0 + 20
      const y = node.y0 + 14
      const value = node.datum.value ?? Math.max(links.filter(link => link.source === i).reduce((sum, link) => sum + link.value, 0), links.filter(link => link.target === i).reduce((sum, link) => sum + link.value, 0))
      const key = hit(`node-${i}`, node.datum.name, [{ name: node.datum.name, value }], x + 9, y + (node.y1 - node.y0) / 2, value)
      rect(x, y, 18, node.y1 - node.y0, key, tone(i, nodes.length), INK, 5)
      label(x < w / 2 ? x + 24 : x - 6, y + 12, node.datum.name, x < w / 2 ? 'start' : 'end')
    })
    return result
  }

  if (variant === 'mono-rounded-treemap') {
    const roots: MonoChartTreeNode[] = data.tree ?? items.map(item => ({ label: item.label, value: item.value }))
    const weight = (node: MonoChartTreeNode): number => node.children?.length ? node.children.reduce((sum, child) => sum + weight(child), 0) : Math.max(0, node.value ?? 0)
    let index = 0
    function partition(nodes: MonoChartTreeNode[], x: number, y: number, width: number, height: number): void {
      const positive = nodes.filter(node => weight(node) > 0).sort((a, b) => weight(b) - weight(a))
      if (!positive.length) return
      if (positive.length === 1) {
        const node = positive[0]!
        if (node.children?.length) { partition(node.children, x, y, width, height); return }
        const value = weight(node)
        const key = hit(`tile-${index}`, node.label, [{ name: node.label, value }], x + width / 2, y + height / 2, value)
        const opacity = tone(index++, Math.max(1, roots.length))
        rect(x + 3, y + 3, width - 6, height - 6, key, opacity, INK, 10)
        if (width > 65 && height > 28) {
          const fill = opacity > 0.55 ? 'var(--tx-bg-color, #fff)' : INK
          mark('text', { x: x + 10, y: y + 18, fill, 'text-anchor': 'start' }, undefined, node.label, 'tx-mono-chart__tile-label')
          mark('text', { x: x + 10, y: y + height - 10, fill, 'text-anchor': 'start' }, undefined, String(value), 'tx-mono-chart__tile-label')
        }
        return
      }
      const sum = positive.reduce((total, node) => total + weight(node), 0)
      let cut = 1
      let a = weight(positive[0]!)
      while (cut < positive.length - 1 && a + weight(positive[cut]!) / 2 < sum / 2) a += weight(positive[cut++]!)
      const ratio = a / sum
      if (width >= height) {
        partition(positive.slice(0, cut), x, y, width * ratio, height)
        partition(positive.slice(cut), x + width * ratio, y, width * (1 - ratio), height)
      }
      else {
        partition(positive.slice(0, cut), x, y, width, height * ratio)
        partition(positive.slice(cut), x, y + height * ratio, width, height * (1 - ratio))
      }
    }
    result.total = roots.reduce((sum, node) => sum + weight(node), 0)
    partition(roots, 16, 12, w - 32, h - 24)
    return result
  }

  if (variant === 'mono-rounded-radar') {
    const n = items.length
    if (!n) return result
    const cx = w / 2
    const cy = h / 2
    const radius = Math.min(w * 0.3, h * 0.32)
    const max = Math.max(1, ...items.map(item => item.max ?? Math.max(100, item.value)))
    const position = (i: number, ratio: number): [number, number] => [cx + Math.sin(i / n * TAU) * radius * ratio, cy - Math.cos(i / n * TAU) * radius * ratio]
    for (const ratio of [0.25, 0.5, 0.75, 1]) {
      const points = items.map((_, i) => position(i, ratio))
      mark('path', { d: `${line()(points)}Z`, fill: 'none', stroke: GRID, 'stroke-linejoin': 'round' })
    }
    items.forEach((item, i) => {
      const [x, y] = position(i, 1)
      mark('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: GRID })
      const [lx, ly] = position(i, 1.22)
      label(lx, ly + 3, item.label)
    })
    const positions = items.map((item, i) => position(i, clamp(item.value / max)))
    stroke(`${line()(positions)}Z`, undefined, 1, 2, 'color-mix(in srgb, var(--tx-mono-ink, var(--tx-text-color-primary, #303133)) 15%, transparent)')
    positions.forEach(([x, y], i) => {
      const item = items[i]!
      const key = hit(`radar-${i}`, item.label, [{ name: item.label, value: item.value }], x, y, item.value)
      mark('circle', { cx: x, cy: y, r: 4, fill: INK }, key)
    })
    result.total = items.reduce((sum, item) => sum + item.value, 0) / n
    return result
  }

  if (variant === 'mono-rounded-sparkline') {
    const series = data.series ?? []
    const rowHeight = (h - 24) / Math.max(1, series.length)
    series.forEach((series, i) => {
      const values = series.data.filter(point => finite(point.value))
      if (!values.length) return
      const y = createYScale(extent(values.map(point => point.value)), [12 + (i + 0.85) * rowHeight, 12 + (i + 0.15) * rowHeight], false)
      const x = createXScale('linear', [0, Math.max(1, values.length - 1)], [w * 0.35, w - 22])
      const points = values.map((point, index): [number, number] => [xPosition(x, index), y(point.value)])
      const key = hit(`spark-${i}`, series.name, [{ name: series.name, value: series.metric ?? values.at(-1)!.value }], w - 22, points.at(-1)![1], values.at(-1)!.value)
      stroke(line().curve(curveFactory(o.curve))(points) ?? '', key, series.opacity ?? 1, 2)
      label(18, 12 + (i + 0.4) * rowHeight, series.name, 'start')
      label(18, 12 + (i + 0.7) * rowHeight, String(series.metric ?? values.at(-1)!.value), 'start')
      rect(12, 12 + i * rowHeight, w - 24, rowHeight, key, 0, 'transparent', 0)
    })
    return result
  }

  const series = (data.series ?? []).slice(0, o.seriesMode === 'single' ? 1 : undefined)
  const seriesPoints = series.map(series => new Map(series.data.map(point => [point.x, point])))
  const categories = data.categories?.length ? data.categories : [...new Set(series.flatMap(series => series.data.map(point => point.x)))]
  const xs = variant === 'mono-rounded-candlestick' ? (data.candles ?? []).map(candle => candle.x) : variant === 'mono-rounded-range' ? (data.ranges ?? []).map(range => range.x) : variant === 'mono-rounded-waterfall' ? (data.waterfall ?? []).map(point => point.label) : categories
  const xScale = createXScale('band', xs, [plot.x, plot.x + plot.width])
  const x = (value: string | number) => xPosition(xScale, value)
  const stackTotals = xs.flatMap(key => {
    const values = seriesPoints.map(points => points.get(key)?.value ?? 0)
    return [values.reduce((sum, value) => sum + Math.max(0, value), 0), values.reduce((sum, value) => sum + Math.min(0, value), 0)]
  })
  let running = 0
  const waterfall = (data.waterfall ?? []).map(point => {
    const base = point.total ? 0 : point.base ?? running
    const end = base + point.delta
    running = end
    return { ...point, base, end }
  })
  const values = variant === 'mono-rounded-stacked-bar' ? stackTotals : variant === 'mono-rounded-candlestick' ? (data.candles ?? []).flatMap(candle => [candle.low, candle.high]) : variant === 'mono-rounded-range' ? (data.ranges ?? []).flatMap(range => [range.min, range.max]) : variant === 'mono-rounded-waterfall' ? waterfall.flatMap(point => [point.base, point.end]) : series.flatMap(series => series.data.map(point => point.value))
  const finiteValues = values.filter(finite)
  const domain: [number, number] = variant === 'mono-rounded-candlestick' && finiteValues.length ? [Math.min(...finiteValues), Math.max(...finiteValues) + (Math.min(...finiteValues) === Math.max(...finiteValues) ? 1 : 0)] : extent(values)
  const yScale = createYScale(domain, [plot.y + plot.height, plot.y], true)
  const y = (value: number) => yScale(value)
  const row = o.layout === 'row' && (variant === 'mono-rounded-bar' || variant === 'mono-rounded-stacked-bar')
  const horizontal = createYScale(extent(values), [plot.x + 40, plot.x + plot.width], true)
  const band = plot.width / Math.max(1, xs.length)
  const grid = !['mono-rounded-kpi', 'mono-rounded-scatter', 'mono-rounded-bubble'].includes(variant)
  if (grid) {
    yScale.ticks(4).forEach(value => {
      if (!row) {
        mark('line', { x1: plot.x, x2: w - 20, y1: y(value), y2: y(value), stroke: GRID, 'stroke-dasharray': '3 3' })
        label(plot.x - 8, y(value) + 3, String(value), 'end')
      }
    })
    xs.forEach((value, i) => label(row ? plot.x + 28 : x(value), row ? plot.y + (i + 0.55) * plot.height / Math.max(1, xs.length) : h - 16, String(value), row ? 'end' : 'middle'))
  }
  if (variant === 'mono-rounded-scatter' || variant === 'mono-rounded-bubble') {
    const points = (data.points ?? []).filter(point => finite(point.x) && finite(point.y) && finite(point.z ?? 1))
    const sx = createXScale('linear', extent(points.map(point => point.x)), [plot.x + 20, w - 35])
    const sy = createYScale(extent(points.map(point => point.y)), [h - 42, 28], true)
    const maxZ = Math.max(1, ...points.map(point => point.z ?? 1))
    if (variant === 'mono-rounded-scatter') sy.ticks(4).forEach(value => mark('line', { x1: plot.x, x2: w - 20, y1: sy(value), y2: sy(value), stroke: GRID, 'stroke-dasharray': '3 3' }))
    points.forEach((point, i) => {
      const px = xPosition(sx, point.x)
      const py = sy(point.y)
      const key = hit(`point-${i}`, point.label, [{ name: o.labels.x, value: point.x }, { name: o.labels.y, value: point.y }, { name: o.labels.z, value: point.z ?? 1 }], px, py, point.y)
      const r = Math.sqrt(Math.max(0, point.z ?? 1) / maxZ) * (variant === 'mono-rounded-bubble' ? 26 : 11) + 3
      mark('circle', { cx: px, cy: py, r, fill: INK, 'fill-opacity': variant === 'mono-rounded-bubble' ? 0.2 : 1, stroke: INK, 'stroke-width': variant === 'mono-rounded-bubble' ? 2 : 1 }, key)
    })
    xTickValues(sx, 4).forEach(value => label(xPosition(sx, Number(value)), h - 16, String(value)))
    sy.ticks(4).forEach(value => label(plot.x - 8, sy(value) + 3, String(value), 'end'))
    result.total = points.length
    return result
  }
  if (variant === 'mono-rounded-candlestick') {
    const candles = data.candles ?? []
    candles.forEach((candle, i) => {
      if (![candle.open, candle.high, candle.low, candle.close].every(finite)) return
      const px = x(candle.x)
      const key = hit(`candle-${i}`, String(candle.x), [{ name: o.labels.open, value: candle.open }, { name: o.labels.high, value: candle.high }, { name: o.labels.low, value: candle.low }, { name: o.labels.close, value: candle.close }], px, y(candle.high), candle.close)
      mark('line', { x1: px, x2: px, y1: y(candle.high), y2: y(candle.low), stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.5 }, key)
      mark('rect', { x: px - Math.min(12, band * 0.28), y: y(Math.max(candle.open, candle.close)), width: Math.min(24, band * 0.56), height: Math.max(2, Math.abs(y(candle.open) - y(candle.close))), rx: 5, fill: candle.close >= candle.open ? INK : TRACK, stroke: INK, 'stroke-width': 1.5 }, key)
    })
    result.total = candles.at(-1)?.close ?? 0
    return result
  }
  if (variant === 'mono-rounded-waterfall') {
    waterfall.forEach((point, i) => {
      const px = x(point.label)
      const key = hit(`waterfall-${i}`, point.label, [{ name: o.labels.delta, value: point.delta }, { name: o.labels.balance, value: point.end }], px, y(point.end), point.delta)
      rect(px - Math.min(12, band * 0.25), y(Math.max(point.base, point.end)), Math.min(24, band * 0.5), Math.max(2, Math.abs(y(point.base) - y(point.end))), key, point.delta < 0 ? 0.35 : 1, INK, 6)
      if (i + 1 < waterfall.length) mark('line', { x1: px + 12, x2: x(waterfall[i + 1]!.label) - 12, y1: y(point.end), y2: y(point.end), stroke: GRID, 'stroke-dasharray': '3 3' })
    })
    result.total = waterfall.at(-1)?.end ?? 0
    return result
  }
  if (variant === 'mono-rounded-range') {
    const ranges = (data.ranges ?? []).filter(range => finite(range.min) && finite(range.max))
    const generator = area<typeof ranges[number]>().x(point => x(point.x)).y0(point => y(point.min)).y1(point => y(point.max)).curve(curveFactory(o.curve))
    mark('path', { d: generator(ranges) ?? '', fill: 'var(--tx-mono-gradient)', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    ranges.forEach((range, i) => {
      const key = hit(`range-${i}`, String(range.x), [{ name: o.labels.min, value: range.min }, { name: o.labels.max, value: range.max }], x(range.x), y(range.max), range.max - range.min)
      rect(x(range.x) - band / 2, plot.y, band, plot.height, key, 0, 'transparent', 0)
    })
    result.total = ranges.at(-1) ? ranges.at(-1)!.max - ranges.at(-1)!.min : 0
    return result
  }

  const categoryHits = xs.map((category, i) => {
    const rows = series.flatMap((series, index) => {
      const point = seriesPoints[index]?.get(category)
      return point && finite(point.value) ? [{ name: series.name, value: point.value }] : []
    })
    if (!rows.length) return undefined
    const primary = seriesPoints[0]?.get(category)?.value
    return hit(`category-${i}`, String(category), rows, x(category), y(primary ?? 0), primary)
  })
  if (variant === 'mono-rounded-bar' || variant === 'mono-rounded-stacked-bar' || variant === 'mono-rounded-composed') {
    const barSeries = variant === 'mono-rounded-composed' ? series.slice(0, 1) : series
    xs.forEach((category, i) => {
      let pos = 0
      let neg = 0
      barSeries.forEach((series, j) => {
        const value = seriesPoints[j]?.get(category)?.value
        if (value === undefined || !finite(value)) return
        const stacked = variant === 'mono-rounded-stacked-bar'
        const base = stacked ? value >= 0 ? pos : neg : 0
        if (value >= 0) pos += value; else neg += value
        const barWidth = Math.min(20, band * 0.65 / (stacked ? 1 : barSeries.length))
        const px = x(category) - (stacked ? barWidth / 2 : barSeries.length * barWidth / 2) + (stacked ? 0 : j * barWidth)
        const opacity = series.opacity ?? (variant === 'mono-rounded-composed' ? 0.18 : tone(j, barSeries.length))
        if (row) {
          const rh = plot.height / Math.max(1, xs.length)
          const bh = Math.min(16, rh * 0.7 / (stacked ? 1 : barSeries.length))
          rect(Math.min(horizontal(base), horizontal(base + value)), plot.y + (i + 0.5) * rh - (stacked ? bh / 2 : barSeries.length * bh / 2) + (stacked ? 0 : j * bh), Math.abs(horizontal(base + value) - horizontal(base)), bh, categoryHits[i], opacity, INK, 8)
        }
        else {
          const py = y(Math.max(base, base + value))
          const bh = Math.max(1, Math.abs(y(base) - y(base + value)))
          mark('path', { d: roundedRect(px, py, Math.max(0.2, barWidth - (stacked ? 0 : 3)), bh, 8, !stacked || j === barSeries.length - 1, !stacked || j === 0), fill: INK, opacity }, categoryHits[i])
        }
      })
    })
  }
  if (!['mono-rounded-bar', 'mono-rounded-stacked-bar'].includes(variant)) {
    const lineSeries = variant === 'mono-rounded-composed' ? o.showLine ? series.slice(1) : [] : series
    lineSeries.forEach((series, i) => {
      const positioned = series.data.filter(point => finite(point.value)).map(point => ({ x: x(point.x), y: y(point.value) }))
      const curve = variant === 'mono-rounded-step' ? curveStepAfter : curveFactory(variant === 'mono-rounded-stream' ? 'natural' : o.curve)
      const filled = ['mono-rounded-area', 'mono-rounded-kpi', 'mono-rounded-stream'].includes(variant)
      if (filled) mark('path', { d: area<{ x: number, y: number }>().x(point => point.x).y0(y(0)).y1(point => point.y).curve(curve)(positioned) ?? '', fill: 'var(--tx-mono-gradient)', opacity: series.opacity ?? tone(i, lineSeries.length) })
      mark('path', { d: line<{ x: number, y: number }>().x(point => point.x).y(point => point.y).curve(curve)(positioned) ?? '', fill: 'none', stroke: INK, 'stroke-width': i === 0 ? 3 : 2, opacity: series.opacity ?? tone(i, lineSeries.length), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...(variant === 'mono-rounded-line' && i > 0 ? { 'stroke-dasharray': '4 4' } : {}) })
      if (['mono-rounded-line', 'mono-rounded-composed', 'mono-rounded-step'].includes(variant)) positioned.forEach(point => mark('circle', { cx: point.x, cy: point.y, r: 3.5, fill: INK, stroke: 'var(--tx-bg-color, #fff)', 'stroke-width': 1.5 }))
    })
    xs.forEach((category, i) => rect(x(category) - band / 2, plot.y, band, plot.height, categoryHits[i], 0, 'transparent', 0))
  }
  result.total = variant === 'mono-rounded-bar' || variant === 'mono-rounded-composed' ? series[0]?.data.reduce((sum, point) => sum + point.value, 0) ?? 0 : variant === 'mono-rounded-stacked-bar' || variant === 'mono-rounded-stream' ? series.reduce((sum, series) => sum + (series.data.at(-1)?.value ?? 0), 0) : series[0]?.data.at(-1)?.value ?? 0
  return result
}
