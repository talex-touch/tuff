<script setup lang="ts">
import type { MapGeoJson } from '@talex-touch/tuffex-charts'
import { TxBubbleMap } from '@talex-touch/tuffex-charts'
import { onMounted, ref, shallowRef } from 'vue'

interface Colo { city: string, lon: number, lat: number, requests: number }

// The package ships no geo data — consumers bring their own GeoJSON.
// Typed `string` so Nitro's typed-route inference short-circuits.
const WORLD_URL: string = 'https://cdn.jsdelivr.net/gh/johan/world.geo.json/countries.geo.json'

const world = shallowRef<MapGeoJson | null>(null)
const failed = ref(false)

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
</script>

<template>
  <div class="map-demo">
    <TxBubbleMap
      v-if="world"
      :geo-json="world"
      :data="colos"
      lng="lon"
      lat="lat"
      value="requests"
      name="city"
      roam
      :value-format="(value: number) => `${value.toLocaleString()} req/s`"
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
