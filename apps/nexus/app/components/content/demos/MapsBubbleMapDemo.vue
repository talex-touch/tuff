<script setup lang="ts">
import type { MapGeoJson } from '@talex-touch/tuffex/charts'
import { TxBubbleMap } from '@talex-touch/tuffex/charts'
import { computed, onMounted, ref, shallowRef } from 'vue'

interface Colo { city: string, lon: number, lat: number, requests: number }

// The package ships no geo data — consumers bring their own GeoJSON.
// Typed `string` so Nitro's typed-route inference short-circuits. Served from
// `public/geo` (vendored copy of johan/world.geo.json) rather than the CDN, so
// the demo never depends on a third-party origin to render.
const WORLD_URL: string = '/geo/world-countries.geo.json'

const world = shallowRef<MapGeoJson | null>(null)
const failed = ref(false)
const selected = shallowRef<Colo | null>(null)
const resetKey = ref(0)
const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      loading: '正在加载世界地图…',
      failed: '世界地图加载失败。',
      hint: '点击气泡查看城市；拖拽平移，⌘/Ctrl + 滚轮缩放。',
      selected: '已选择',
      unit: '请求/秒',
      labels: {
        map: '边缘节点地图',
        instructions: '拖拽或用方向键平移。双指捏合、按住 Control 或 Command 滚动，或按加号减号缩放。双击或按 0 复位。',
      },
    }
  : {
      loading: 'Loading world GeoJSON…',
      failed: 'World GeoJSON failed to load.',
      hint: 'Select a bubble to inspect its city; drag to pan, ⌘/Ctrl + scroll to zoom.',
      selected: 'Selected',
      unit: 'req/s',
      labels: { map: 'Edge locations map' },
    })

const colos: Colo[] = [
  { city: 'San Jose', lon: -121.89, lat: 37.34, requests: 9200 },
  { city: 'Ashburn', lon: -77.49, lat: 39.04, requests: 12400 },
  { city: 'São Paulo', lon: -46.63, lat: -23.55, requests: 4100 },
  { city: 'Frankfurt', lon: 8.68, lat: 50.11, requests: 10800 },
  { city: 'Johannesburg', lon: 28.05, lat: -26.2, requests: 1900 },
  { city: 'Singapore', lon: 103.82, lat: 1.35, requests: 7600 },
  { city: 'Tokyo', lon: 139.69, lat: 35.69, requests: 8900 },
  { city: 'Sydney', lon: 151.21, lat: -33.87, requests: 3200 },
]

// Plain-function view of $fetch: Nitro's typed-route inference explodes on
// arbitrary external URLs (TS2589).
const fetchGeoJson = $fetch as (url: string) => Promise<MapGeoJson>

onMounted(async () => {
  try {
    world.value = await fetchGeoJson(WORLD_URL)
  }
  catch {
    failed.value = true
  }
})

// Remounting the map restores the initial view without fetching the GeoJSON again.
function resetDemo(): void {
  selected.value = null
  resetKey.value += 1
}

defineExpose({ resetDemo })
</script>

<template>
  <div class="map-demo not-prose">
    <TxBubbleMap
      v-if="world"
      :key="resetKey"
      :geo-json="world"
      :data="colos"
      lng="lon"
      lat="lat"
      value="requests"
      name="city"
      :labels="copy.labels"
      :value-format="(value: number) => `${value.toLocaleString(locale)} ${copy.unit}`"
      @bubble-click="selected = $event"
    />
    <p v-if="world" class="map-demo__selection" aria-live="polite">
      {{ selected ? `${copy.selected}: ${selected.city}` : copy.hint }}
    </p>
    <p v-else class="map-demo__placeholder">
      {{ copy[failed ? 'failed' : 'loading'] }}
    </p>
  </div>
</template>

<style scoped>
.map-demo {
  width: 100%;
}

.map-demo__selection {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--tx-chart-text-primary, #6b7280);
}

.map-demo__placeholder {
  margin: 0;
  padding: 48px 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
  text-align: center;
}
</style>
