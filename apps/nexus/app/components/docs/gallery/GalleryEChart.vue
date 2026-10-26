<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { TxEChart } from '@talex-touch/tuffex/charts/src/echart'
import { computed } from 'vue'
import DocsGallerySpecimen from '../DocsGallerySpecimen.vue'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { installs: '安装', sessions: '会话', chart: '按星期统计的安装与会话', hint: '⌘/Ctrl + 滚轮缩放，放大后拖拽平移' }
  : { installs: 'Installs', sessions: 'Sessions', chart: 'Installs and sessions by weekday', hint: 'Zoom with ⌘/Ctrl + scroll, then drag to pan' })

/* The gallery's only raw-option chart: a bar plus a line on one grid, which is
   the proof that the escape hatch carries the themed axis chrome and tooltip
   without a typed wrapper. Bars and line share the category axis, so the trend
   is read against the same seven days. The inside dataZoom is the whole of its
   interaction: TxEChart supplies the cooperative wheel, the grab cursor and the
   double-click reset around it. */
const days = computed(() => {
  const weekday = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
  // 2026-03-02 is a Monday.
  return Array.from({ length: 7 }, (_, index) => weekday.format(Date.UTC(2026, 2, 2 + index)))
})
const option = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: {},
  grid: { left: 44, right: 12, top: 30, bottom: 28 },
  xAxis: { type: 'category', data: days.value },
  yAxis: { type: 'value' },
  dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
  series: [
    {
      name: copy.value.installs,
      type: 'bar',
      data: [420, 468, 512, 494, 548, 610, 586],
      barWidth: 14,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    },
    {
      name: copy.value.sessions,
      type: 'line',
      data: [820, 932, 901, 934, 1290, 1330, 1320],
      smooth: true,
      showSymbol: false,
    },
  ],
}))
</script>

<template>
  <div class="docs-gallery__stage not-prose">
    <DocsGallerySpecimen>
      <div class="docs-gallery__block">
        <TxEChart :option="option" :height="220" :aria-label="copy.chart" />
        <p class="gallery-hint">
          {{ copy.hint }}
        </p>
      </div>
      <template #fallback>
        <div class="docs-gallery__ph" />
      </template>
    </DocsGallerySpecimen>
  </div>
</template>

<style scoped>
.gallery-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--docs-muted);
  text-align: center;
}
</style>
