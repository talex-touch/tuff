<script setup lang="ts">
import { TxSankeyChart } from '@talex-touch/tuffex/charts/src/sankey'
import { computed } from 'vue'
import DocsGallerySpecimen from '../DocsGallerySpecimen.vue'

/* Ported from kumo's compact Sankey preview: every intermediate node's inflow
   and outflow balance, so nothing hangs below its links as an unaccounted tail. */
const nodes = [
  { name: 'Search', value: 50 },
  { name: 'Community', value: 40 },
  { name: 'Paid', value: 35 },
  { name: 'Install', value: 55 },
  { name: 'Store', value: 70 },
]
const links = [
  { source: 0, target: 3, value: 30 },
  { source: 0, target: 4, value: 20 },
  { source: 1, target: 3, value: 25 },
  { source: 1, target: 4, value: 15 },
  { source: 2, target: 4, value: 35 },
]

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      hint: '拖动节点即可移动，双击背景复位',
      labels: { instructions: '按回车键选中节点。按住 Alt 加上下方向键可移动它；也可拖动节点重新排列，双击背景复位。' },
    }
  : { hint: 'Drag a node to move it; double-click to reset', labels: undefined })
</script>

<template>
  <div class="docs-gallery__stage not-prose">
    <DocsGallerySpecimen>
      <div class="docs-gallery__block">
        <TxSankeyChart :nodes="nodes" :links="links" :height="170" :labels="copy.labels" />
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
