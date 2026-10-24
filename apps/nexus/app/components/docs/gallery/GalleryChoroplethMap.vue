<script setup lang="ts">
import { TxChoroplethMap } from '@talex-touch/tuffex/charts/src/maps'
import { computed } from 'vue'
import DocsGallerySpecimen from '../DocsGallerySpecimen.vue'
import { MINI_WORLD_GEO } from '../mini-world-geo'

/* Real but rounded country outlines, inlined so the specimen never waits on a
   fetch — and joined on `properties.name`, which is the key the choropleth
   reads by default. */
const shares = [
  { country: 'United States of America', share: 31 },
  { country: 'Brazil', share: 12 },
  { country: 'China', share: 24 },
  { country: 'India', share: 14 },
  { country: 'Australia', share: 7 },
  { country: 'South Africa', share: 4 },
]

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      hint: '拖拽平移 · ⌘/Ctrl + 滚轮缩放',
      labels: {
        map: '世界地图',
        instructions: '拖拽或用方向键平移。双指捏合、按住 Control 或 Command 滚动，或按加号减号缩放。双击或按 0 复位。',
      },
    }
  : { hint: 'Drag to pan · ⌘/Ctrl + scroll to zoom', labels: { map: 'World map' } })
</script>

<template>
  <div class="docs-gallery__stage not-prose">
    <DocsGallerySpecimen>
      <div class="docs-gallery__block">
        <TxChoroplethMap
          :geo-json="MINI_WORLD_GEO"
          :data="shares"
          name="country"
          value="share"
          :height="176"
          :value-format="(value: number) => `${value}%`"
          :labels="copy.labels"
          show-legend
        />
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
