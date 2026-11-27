<script setup lang="ts">
import { TxSankeyChart } from '@talex-touch/tuffex/charts/src/sankey'
import { computed } from 'vue'
import { SANKEY_ZH_LABELS } from '../../content/demos/chart-demo-locale'

/* Ported from kumo's compact Sankey preview: every intermediate node's inflow
   and outflow balance, so nothing hangs below its links as an unaccounted tail. */
const values = [50, 40, 35, 55, 70]
const links = [
  { source: 0, target: 3, value: 30 },
  { source: 0, target: 4, value: 20 },
  { source: 1, target: 3, value: 25 },
  { source: 1, target: 4, value: 15 },
  { source: 2, target: 4, value: 35 },
]

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { names: ['搜索', '社区', '付费', '安装', '商店'], hint: '拖动节点即可移动，双击背景复位', labels: SANKEY_ZH_LABELS }
  : { names: ['Search', 'Community', 'Paid', 'Install', 'Store'], hint: 'Drag a node to move it; double-click to reset', labels: undefined })
const nodes = computed(() => copy.value.names.map((name, index) => ({ name, value: values[index] })))
</script>

<template>
  <div class="docs-gallery__block">
    <TxSankeyChart
      :nodes="nodes"
      :links="links"
      :height="170"
      :labels="copy.labels"
      :format-value="(value: number) => value.toLocaleString(locale)"
    />
    <p class="gallery-hint">
      {{ copy.hint }}
    </p>
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
