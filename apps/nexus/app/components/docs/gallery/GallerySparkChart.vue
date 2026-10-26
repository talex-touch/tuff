<script setup lang="ts">
import { ChartPalette } from '@talex-touch/tuffex/charts'
import { TxChartScrubber, TxSparkChart } from '@talex-touch/tuffex/spark-chart'
import { computed, ref } from 'vue'

/* Twelve evenly spaced days. Both series stay inside one value band so the y
   axis has something to label, and the gaps are uniform so the default
   monotone curve reads as a trend instead of a zig-zag. */
const samples = [
  [420, 468, 512, 494, 548, 610, 586, 642, 705, 678, 742, 804],
  [186, 204, 178, 216, 232, 208, 244, 226, 258, 240, 268, 286],
]

const { locale } = useI18n()
const series = computed(() => {
  const names = locale.value === 'zh' ? ['安装', '错误'] : ['Installs', 'Errors']
  return samples.map((values, index) => ({
    id: index === 0 ? 'installs' : 'errors',
    label: names[index],
    color: ChartPalette.categoricalVar(index * 2),
    data: values.map((value, time) => ({ time, value })),
  }))
})

// Sample n is March n + 1, named in the page's language.
const day = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }))
function dayLabel(index: number): string {
  return day.value.format(Date.UTC(2026, 2, Math.round(index) + 1))
}

const active = ref<number | null>(null)
const rows = computed(() => active.value === null
  ? []
  : series.value.map(item => ({
      label: item.label ?? item.id,
      color: item.color,
      value: (item.data[active.value!]?.value ?? 0).toLocaleString(locale.value),
    })))
</script>

<template>
  <div class="docs-gallery__block docs-gallery__spark">
    <TxChartScrubber
      class="docs-gallery__spark-stage"
      :point-count="samples[0]!.length"
      :active-index="active"
      :rows="rows"
      :time-label="active === null ? '' : dayLabel(active)"
      @update:active-index="active = $event"
    >
      <TxSparkChart
        :series="series"
        :active-index="active"
        :padding="{ top: 14, right: 10, bottom: 24, left: 36 }"
        :x-tick-format="dayLabel"
        grid
        x-axis
        y-axis
      />
    </TxChartScrubber>
  </div>
</template>
