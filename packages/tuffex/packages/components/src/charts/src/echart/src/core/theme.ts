// Shared theming for the ECharts family.
//
// ECharts paints into a canvas, so it cannot consume `var(--tx-chart-*)` the
// way the SVG family does: the tokens have to be resolved to real colors before
// they reach the option. Everything here reads the same tokens the native
// charts use, so an ECharts chart dropped next to a native one matches it in
// both themes without a single styling prop.

import type { EChartsOption } from 'echarts'
import { CHART_DARK_COLORS, CHART_LIGHT_COLORS, ChartPalette } from '../../../palette'

export type EChartMode = 'light' | 'dark'

export interface EChartThemeTokens {
  /** Categorical series palette, indexed by series position. */
  palette: string[]
  /** Sequential ramp (low → high) for `visualMap` and shaded regions. */
  sequential: string[]
  /** Axis labels and general text. */
  text: string
  /** Secondary text: axis names, legend entries. */
  textMuted: string
  /** Axis lines. */
  axisLine: string
  /** Dashed grid / split lines. */
  splitLine: string
  /** Hairline drawn under the cursor by the axis pointer. */
  axisPointer: string
  tooltipBg: string
  tooltipFg: string
  tooltipBorder: string
}

/** Used when the host has not loaded the chart stylesheet (or in tests). */
export const ECHART_THEME_FALLBACKS: Record<EChartMode, EChartThemeTokens> = {
  light: {
    palette: [...CHART_LIGHT_COLORS],
    sequential: ChartPalette.sequential('blues'),
    text: '#6b7280',
    textMuted: '#9ca3af',
    axisLine: '#e0e2e5',
    splitLine: 'rgba(107, 114, 128, 0.2)',
    axisPointer: 'rgba(31, 33, 36, 0.26)',
    tooltipBg: '#25272b',
    tooltipFg: '#f6f7f8',
    tooltipBorder: '#3a3c40',
  },
  dark: {
    palette: [...CHART_DARK_COLORS],
    sequential: ChartPalette.sequential('blues', true),
    text: '#9ca3af',
    textMuted: '#6b7280',
    axisLine: '#2e3033',
    splitLine: 'rgba(156, 163, 175, 0.2)',
    axisPointer: 'rgba(246, 247, 248, 0.26)',
    tooltipBg: '#25272b',
    tooltipFg: '#f6f7f8',
    tooltipBorder: '#3a3c40',
  },
}

const TOKEN_NAMES = {
  text: '--tx-chart-text-primary',
  textMuted: '--tx-chart-text-secondary',
  axisLine: '--tx-bui-line-strong',
  splitLine: '--tx-chart-grid-line',
  axisPointer: '--tx-bui-ink-2',
  tooltipBg: '--tx-bui-tooltip-bg',
  tooltipFg: '--tx-bui-tooltip-fg',
  tooltipBorder: '--tx-bui-tooltip-border',
} as const

/**
 * Resolves the chart tokens against `el`. Custom properties are read as token
 * streams — `color-mix(...)` and `var(...)` come back unresolved — so each value
 * is round-tripped through a throwaway probe element and read back as a computed
 * `color`, which is what a canvas can actually paint.
 */
export function readEChartThemeTokens(el: HTMLElement | null, mode: EChartMode): EChartThemeTokens {
  const fallback = ECHART_THEME_FALLBACKS[mode]
  if (!el || typeof getComputedStyle !== 'function' || typeof document === 'undefined')
    return { ...fallback, palette: [...fallback.palette], sequential: [...fallback.sequential] }

  const style = getComputedStyle(el)
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  el.appendChild(probe)

  const read = (name: string, fallbackColor: string): string => {
    const raw = style.getPropertyValue(name).trim()
    if (!raw)
      return fallbackColor
    probe.style.color = raw
    const resolved = getComputedStyle(probe).color
    return resolved || fallbackColor
  }

  try {
    const palette = Array.from({ length: 6 }, (_, index) =>
      read(`--tx-chart-categorical-${index + 1}`, fallback.palette[index] ?? fallback.palette[0]!))
    const sequential = Array.from({ length: fallback.sequential.length }, (_, index) =>
      read(`--tx-chart-sequential-blues-${index + 1}`, fallback.sequential[index] ?? fallback.sequential[0]!))

    return {
      palette,
      sequential,
      text: read(TOKEN_NAMES.text, fallback.text),
      textMuted: read(TOKEN_NAMES.textMuted, fallback.textMuted),
      axisLine: read(TOKEN_NAMES.axisLine, fallback.axisLine),
      splitLine: read(TOKEN_NAMES.splitLine, fallback.splitLine),
      axisPointer: read(TOKEN_NAMES.axisPointer, fallback.axisPointer),
      tooltipBg: read(TOKEN_NAMES.tooltipBg, fallback.tooltipBg),
      tooltipFg: read(TOKEN_NAMES.tooltipFg, fallback.tooltipFg),
      tooltipBorder: read(TOKEN_NAMES.tooltipBorder, fallback.tooltipBorder),
    }
  }
  finally {
    probe.remove()
  }
}

/**
 * The base option every `TxEChart` starts from: transparent, token-coloured and
 * with the same tooltip bubble as `TxChartTooltip`. It deliberately declares no
 * axes, grid or legend — those components would be instantiated on every chart,
 * including the ones that have no use for them.
 */
export function echartThemeOption(tokens: EChartThemeTokens): EChartsOption {
  return {
    backgroundColor: 'transparent',
    color: [...tokens.palette],
    textStyle: { color: tokens.text, fontSize: 12, fontFamily: 'inherit' },
    tooltip: {
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      borderWidth: 1,
      padding: [9, 10],
      textStyle: { color: tokens.tooltipFg, fontSize: 12 },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 28px #0000001a;',
    },
    axisPointer: {
      lineStyle: { color: tokens.axisPointer, width: 1 },
      label: {
        backgroundColor: tokens.tooltipBg,
        color: tokens.tooltipFg,
        borderWidth: 0,
        borderRadius: 6,
        padding: [4, 6],
      },
    },
  }
}
