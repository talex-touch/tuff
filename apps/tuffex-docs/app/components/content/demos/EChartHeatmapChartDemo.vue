<script setup lang="ts">
import { computed, shallowRef } from 'vue'

interface Selected { cells: Array<{ rowLabel: string, columnLabel: string, value: number }> }

const { locale } = useI18n()

const columns = computed(() => locale.value === 'zh'
  ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

const rows = ['00-04', '04-08', '08-12', '12-16', '16-20']

const values = computed(() => locale.value === 'zh'
  ? [
      [12, 9, 14, 11, 8, 26, 31],
      [7, 6, 9, 8, 5, 14, 18],
      [42, 48, 45, 52, 58, 36, 29],
      [55, 61, 58, 64, 72, 44, 38],
      [38, 44, 41, 47, 66, 52, 33],
    ]
  : [
      [10, 8, 12, 9, 7, 22, 27],
      [6, 5, 8, 7, 4, 12, 15],
      [38, 43, 40, 47, 52, 32, 26],
      [50, 55, 52, 58, 65, 40, 34],
      [34, 40, 37, 42, 60, 47, 30],
    ])

const unit = computed(() => locale.value === 'zh' ? '次' : '')

const labels = computed(() => locale.value === 'zh'
  ? {
      instructions: '在单元格上拖拽可框选一块。单击或按 Escape 清除选区。',
      selected: '已选择 {count} 格，共 {total} 格。',
      cleared: '已清除选区。',
    }
  : undefined)

const selection = shallowRef<Selected | null>(null)

const readout = computed(() => {
  const cells = selection.value?.cells ?? []
  if (!cells.length) {
    return locale.value === 'zh'
      ? '在单元格上拖拽可框选一块；单击或按 Escape 清除。'
      : 'Drag across the cells to select a block; click or press Escape to clear.'
  }
  const first = cells[0]!
  const last = cells[cells.length - 1]!
  const average = Math.round(cells.reduce((sum, cell) => sum + cell.value, 0) / cells.length * 10) / 10
  const range = `${first.columnLabel} ${first.rowLabel}`
  const end = `${last.columnLabel} ${last.rowLabel}`
  return locale.value === 'zh'
    ? `${range} 至 ${end}：${cells.length} 格，均值 ${average}${unit.value}`
    : `${range} to ${end}: ${cells.length} cells, average ${average}`
})
</script>

<template>
  <div class="echart-demo not-prose">
    <TxHeatmapChart
      :values="values"
      :rows="rows"
      :columns="columns"
      :unit="unit"
      :labels="labels"
      :height="260"
      @select="selection = $event"
    />
    <p class="echart-demo__hint">
      {{ readout }}
    </p>
  </div>
</template>

<style scoped>
.echart-demo {
  width: 100%;
  max-width: 560px;
}

.echart-demo__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
}
</style>
