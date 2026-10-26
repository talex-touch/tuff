import type { ChartLabels } from '@talex-touch/tuffex/charts'

/**
 * A chart's accessible name and key instructions in Chinese. TuffEx renders
 * English by default and owns no message catalog, so the zh pages pass these
 * through `labels`.
 */
export const CHART_ZH_LABELS: Partial<ChartLabels> = {
  chart: '图表',
  instructions: '左右方向键逐点读数，Home 和 End 跳到首尾，Escape 清除。',
  zoomInstructions: '左右方向键逐点读数，加号和减号缩放，Shift 加左右方向键平移，0 显示全部，Escape 清除。',
}

/** TxTimeseriesChart's `labels` in Chinese: the chart's, its loading skeleton and the tooltip's "+N more" row. */
export const TIMESERIES_ZH_LABELS = {
  ...CHART_ZH_LABELS,
  loading: '正在加载图表',
  more: (count: number) => `另有 ${count} 条`,
}

/** TxSankeyChart's `labels` in Chinese: the node instructions and the default tooltip's words. */
export const SANKEY_ZH_LABELS = {
  instructions: '按回车键选中节点。按住 Alt 加上下方向键可移动它；也可拖动节点重新排列，双击背景复位。',
  value: '数值',
  items: (count: number) => `${count} 项`,
}

/** How to pan and zoom a roaming TxBubbleMap or TxChoroplethMap, in Chinese. */
export const MAP_ZH_INSTRUCTIONS = '拖拽或用方向键平移。双指捏合、按住 Control 或 Command 滚动，或按加号减号缩放。双击或按 0 复位。'

/**
 * Times in the page's language. TuffEx formats tooltip times in the browser's
 * language and draws its default time ticks in English, so the demos pass these.
 */
export function chartTimeFormats(locale: string) {
  const stamp = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  return {
    /** The tooltip timestamp TxTimeseriesChart shows by default. */
    stamp: (ts: number) => stamp.format(ts),
    /** Hours and minutes. */
    clock: (ts: number) => clock.format(ts),
    /** A time-axis tick: the date at midnight and the time otherwise, as the default ticks do. */
    tick: (ts: number) => {
      const at = new Date(ts)
      return at.getHours() === 0 && at.getMinutes() === 0 ? date.format(at) : clock.format(at)
    },
  }
}
