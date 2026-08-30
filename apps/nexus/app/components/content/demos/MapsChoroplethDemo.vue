<script setup lang="ts">
import type { MapGeoJson } from '@talex-touch/tuffex-charts'
import { TxChoroplethMap } from '@talex-touch/tuffex-charts'
import { onMounted, ref, shallowRef } from 'vue'

interface Row { country: string, share: number }

// Typed `string` so Nitro's typed-route inference short-circuits.
const WORLD_URL: string = 'https://cdn.jsdelivr.net/gh/johan/world.geo.json/countries.geo.json'

const world = shallowRef<MapGeoJson | null>(null)
const failed = ref(false)
const hovered = ref<string>('')

const data: Row[] = [
  { country: 'United States of America', share: 31 },
  { country: 'China', share: 24 },
  { country: 'Germany', share: 11 },
  { country: 'Brazil', share: 8 },
  { country: 'India', share: 14 },
  { country: 'Australia', share: 5 },
  { country: 'South Africa', share: 3 },
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
</script>

<template>
  <div class="map-demo">
    <TxChoroplethMap
      v-if="world"
      :geo-json="world"
      :data="data"
      name="country"
      value="share"
      show-legend
      :value-format="(value: number) => `${value}%`"
      @region-hover="hovered = $event ? $event.country : ''"
    />
    <p v-else class="map-demo__placeholder">
      {{ failed ? 'World GeoJSON failed to load.' : 'Loading world GeoJSON…' }}
    </p>
  </div>
</template>

<style scoped>
.map-demo {
  width: 100%;
}

.map-demo__placeholder {
  margin: 0;
  padding: 48px 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
  text-align: center;
}
</style>
