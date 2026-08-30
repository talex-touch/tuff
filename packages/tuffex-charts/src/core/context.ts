import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ChartXScale, ChartYScale } from './scales'
import type { ChartPadding, PlotArea, ScaleKind, SeriesExtent } from './types'
import { computed, inject, reactive, shallowReactive } from 'vue'
import { ChartPalette } from '../palette'
import { createXScale, createYScale } from './scales'

/** Live pointer position in container pixel coordinates. */
export interface ChartPointer {
  x: number
  y: number
  inside: boolean
}

/** A bar series registered for lane/stack layout. */
export interface BarSeriesEntry {
  uid: number
  stack: string | null
  /** x key → y value for the series' current data. */
  points: () => Map<string | number, number>
}

export interface BarLayout {
  /** Side-by-side lanes: each unstacked series is a lane, each stack shares one. */
  laneCount: number
  laneIndex: (uid: number) => number
  /** Cumulative baseline under `uid` at `xKey` (0 unless stacked above others). */
  baseline: (uid: number, xKey: string | number) => number
}

export interface TxChartContext {
  width: Readonly<Ref<number>>
  height: Readonly<Ref<number>>
  plot: ComputedRef<PlotArea>
  xType: Readonly<Ref<ScaleKind>>
  xScale: ComputedRef<ChartXScale | null>
  yScale: ComputedRef<ChartYScale | null>
  /** id of the plot-area clipPath series should reference. */
  clipId: string
  pointer: ChartPointer
  container: Readonly<Ref<HTMLElement | null>>
  /** Report a series' data extent; returns an unregister function. */
  registerSeries: (extent: Ref<SeriesExtent | null>) => () => void
  /** Next categorical color slot as a theme-following var() reference. */
  allocateColor: () => string
  registerBar: (entry: BarSeriesEntry) => () => void
  barLayout: ComputedRef<BarLayout>
}

export const chartContextKey: InjectionKey<TxChartContext> = Symbol('tx-chart-context')

export function useChartContext(component: string): TxChartContext {
  const ctx = inject(chartContextKey, null)
  if (!ctx)
    throw new Error(`[tuffex-charts] <${component}> must be rendered inside <TxChart>`)
  return ctx
}

export interface CreateChartContextInput {
  width: Ref<number>
  height: Ref<number>
  padding: ComputedRef<ChartPadding>
  xType: Ref<ScaleKind>
  xDomain: Ref<Array<string | number> | undefined>
  yDomain: Ref<[number, number] | undefined>
  yNice: Ref<boolean>
  container: Ref<HTMLElement | null>
}

let contextUid = 0

export function createChartContext(input: CreateChartContextInput): TxChartContext {
  const clipId = `tx-chart-clip-${++contextUid}`

  interface ExtentEntry { source: Ref<SeriesExtent | null> }
  const extents = shallowReactive<ExtentEntry[]>([])
  const barEntries = shallowReactive<BarSeriesEntry[]>([])
  const pointer = reactive<ChartPointer>({ x: 0, y: 0, inside: false })

  // Slots are assigned in registration order and not reclaimed on unregister —
  // remounting series keeps stable hues, transient removals don't reshuffle.
  let colorSlot = 0

  const plot = computed<PlotArea>(() => {
    const pad = input.padding.value
    return {
      x: pad.left,
      y: pad.top,
      width: Math.max(0, input.width.value - pad.left - pad.right),
      height: Math.max(0, input.height.value - pad.top - pad.bottom),
    }
  })

  const xDomainAuto = computed<Array<string | number>>(() => {
    if (input.xDomain.value !== undefined)
      return input.xDomain.value
    if (input.xType.value === 'band') {
      const seen = new Set<string | number>()
      const ordered: Array<string | number> = []
      for (const entry of extents) {
        for (const value of entry.source.value?.xBand ?? []) {
          if (!seen.has(value)) {
            seen.add(value)
            ordered.push(value)
          }
        }
      }
      return ordered
    }
    let lo = Infinity
    let hi = -Infinity
    for (const entry of extents) {
      const range = entry.source.value?.x
      if (!range)
        continue
      lo = Math.min(lo, range[0])
      hi = Math.max(hi, range[1])
    }
    return lo <= hi ? [lo, hi] : []
  })

  /** Per stack key: x key → summed value, for stacked y-domain and baselines. */
  const stackTotals = computed(() => {
    const totals = new Map<string, Map<string | number, number>>()
    for (const entry of barEntries) {
      if (entry.stack === null)
        continue
      let perX = totals.get(entry.stack)
      if (!perX) {
        perX = new Map()
        totals.set(entry.stack, perX)
      }
      for (const [key, value] of entry.points())
        perX.set(key, (perX.get(key) ?? 0) + value)
    }
    return totals
  })

  const yDomainAuto = computed<[number, number]>(() => {
    if (input.yDomain.value !== undefined)
      return input.yDomain.value
    let lo = Infinity
    let hi = -Infinity
    // Stacked bar series report y: null and contribute via their stack totals.
    for (const entry of extents) {
      const range = entry.source.value?.y
      if (!range)
        continue
      lo = Math.min(lo, range[0])
      hi = Math.max(hi, range[1])
    }
    for (const perX of stackTotals.value.values()) {
      for (const total of perX.values()) {
        lo = Math.min(lo, Math.min(0, total))
        hi = Math.max(hi, Math.max(0, total))
      }
    }
    if (lo > hi)
      return [0, 1]
    if (lo === hi)
      return lo === 0 ? [0, 1] : [Math.min(lo, 0), Math.max(hi, 0)]
    return [lo, hi]
  })

  const xScale = computed<ChartXScale | null>(() => {
    const area = plot.value
    if (area.width <= 0)
      return null
    const domain = xDomainAuto.value
    if (domain.length === 0)
      return null
    return createXScale(input.xType.value, domain, [area.x, area.x + area.width])
  })

  const yScale = computed<ChartYScale | null>(() => {
    const area = plot.value
    if (area.height <= 0)
      return null
    return createYScale(
      yDomainAuto.value,
      [area.y + area.height, area.y],
      input.yNice.value,
    )
  })

  const barLayout = computed<BarLayout>(() => {
    const laneByKey = new Map<string, number>()
    const laneByUid = new Map<number, number>()
    for (const entry of barEntries) {
      const key = entry.stack === null ? `series-${entry.uid}` : `stack-${entry.stack}`
      if (!laneByKey.has(key))
        laneByKey.set(key, laneByKey.size)
      laneByUid.set(entry.uid, laneByKey.get(key) as number)
    }
    return {
      laneCount: Math.max(1, laneByKey.size),
      laneIndex: uid => laneByUid.get(uid) ?? 0,
      baseline: (uid, xKey) => {
        const self = barEntries.find(entry => entry.uid === uid)
        if (!self || self.stack === null)
          return 0
        let sum = 0
        for (const entry of barEntries) {
          if (entry.uid === uid)
            break
          if (entry.stack !== self.stack)
            continue
          sum += entry.points().get(xKey) ?? 0
        }
        return sum
      },
    }
  })

  return {
    width: input.width,
    height: input.height,
    plot,
    xType: input.xType,
    xScale,
    yScale,
    clipId,
    pointer,
    container: input.container,
    registerSeries: (source) => {
      const entry: ExtentEntry = { source }
      extents.push(entry)
      return () => {
        const index = extents.indexOf(entry)
        if (index >= 0)
          extents.splice(index, 1)
      }
    },
    allocateColor: () => ChartPalette.categoricalVar(colorSlot++),
    registerBar: (entry) => {
      barEntries.push(entry)
      return () => {
        const index = barEntries.indexOf(entry)
        if (index >= 0)
          barEntries.splice(index, 1)
      }
    },
    barLayout,
  }
}
