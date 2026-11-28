<script setup lang="ts">
import { TxChoroplethMap } from '@talex-touch/tuffex/charts/src/maps'
import { computed, shallowRef } from 'vue'
import { useWorldGeo } from './use-world-geo'

interface Share { country: string, iso: string, share: number }

const shares: Share[] = [
  { country: 'United States of America', iso: 'US', share: 31 },
  { country: 'Canada', iso: 'CA', share: 9 },
  { country: 'Brazil', iso: 'BR', share: 12 },
  { country: 'United Kingdom', iso: 'GB', share: 11 },
  { country: 'France', iso: 'FR', share: 8 },
  { country: 'Germany', iso: 'DE', share: 15 },
  { country: 'China', iso: 'CN', share: 26 },
  { country: 'Japan', iso: 'JP', share: 13 },
  { country: 'India', iso: 'IN', share: 17 },
  { country: 'Australia', iso: 'AU', share: 7 },
  { country: 'South Africa', iso: 'ZA', share: 4 },
  { country: 'Nigeria', iso: 'NG', share: 5 },
]

const worldGeo = useWorldGeo()
const hovered = shallowRef<Share | null>(null)
const { locale } = useI18n()

const copy = computed(() => locale.value === 'zh'
  ? {
      hint: '悬停查看占比 · 拖拽平移 · ⌘/Ctrl + 滚轮缩放',
      hovered: (name: string, share: number) => `${name}：${share}%`,
      labels: {
        map: '全球区域分布地图',
        instructions: '拖拽或用方向键平移。双指捏合、按住 Control 或 Command 滚动，或按加号减号缩放。双击或按 0 复位。',
      },
    }
  : {
      hint: 'Hover regions · Drag to pan · ⌘/Ctrl + scroll to zoom',
      hovered: (name: string, share: number) => `${name}: ${share}%`,
      labels: { map: 'Global distribution map' },
    })

const regions = computed(() => new Intl.DisplayNames([locale.value], { type: 'region' }))
function countryName(row: Share): string {
  return regions.value.of(row.iso) ?? row.country
}
</script>

<template>
  <div class="docs-gallery__block">
    <TxChoroplethMap
      :geo-json="worldGeo"
      :data="shares"
      name="country"
      value="share"
      :zoom="1.08"
      :height="192"
      :value-format="(value: number) => `${value}%`"
      :labels="copy.labels"
      show-legend
      @region-hover="hovered = $event ?? null"
    >
      <template #tooltip="{ row }">
        <strong>{{ countryName(row) }}</strong>
        <span class="gallery-tooltip-value">{{ row.share }}%</span>
      </template>
    </TxChoroplethMap>
    <p class="gallery-hint">
      {{ hovered ? copy.hovered(countryName(hovered), hovered.share) : copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.gallery-tooltip-value {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.gallery-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--docs-muted);
  text-align: center;
}
</style>
