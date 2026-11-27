<script setup lang="ts">
import { TxChoroplethMap } from '@talex-touch/tuffex/charts/src/maps'
import { computed } from 'vue'
import { MINI_WORLD_GEO } from '../mini-world-geo'

/* Real but rounded country outlines, inlined so the specimen never waits on a
   fetch — and joined on `properties.name`, which is the key the choropleth
   reads by default. `iso` names the country in the page's language. */
interface Share { country: string, iso: string, share: number }
const shares: Share[] = [
  { country: 'United States of America', iso: 'US', share: 31 },
  { country: 'Brazil', iso: 'BR', share: 12 },
  { country: 'China', iso: 'CN', share: 24 },
  { country: 'India', iso: 'IN', share: 14 },
  { country: 'Australia', iso: 'AU', share: 7 },
  { country: 'South Africa', iso: 'ZA', share: 4 },
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

const regions = computed(() => new Intl.DisplayNames([locale.value], { type: 'region' }))
function countryName(row: Share): string {
  return regions.value.of(row.iso) ?? row.country
}
</script>

<template>
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
    >
      <template #tooltip="{ row }">
        <strong>{{ countryName(row) }}</strong>
        <span class="gallery-tooltip-value">{{ row.share }}%</span>
      </template>
    </TxChoroplethMap>
    <p class="gallery-hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.gallery-tooltip-value {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.gallery-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--docs-muted);
  text-align: center;
}
</style>
