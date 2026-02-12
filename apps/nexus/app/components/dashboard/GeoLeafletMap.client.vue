<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface GeoLeafletPoint {
  id: string
  label: string
  latitude: number | null
  longitude: number | null
  value?: number
  color?: string
}

interface Props {
  points: GeoLeafletPoint[]
  height?: number
  fitPadding?: number
  defaultZoom?: number
}

const props = withDefaults(defineProps<Props>(), {
  height: 260,
  fitPadding: 24,
  defaultZoom: 2,
})

const emit = defineEmits<{
  (event: 'point-click', point: GeoLeafletPoint): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const mapReady = ref(false)

declare global {
  interface Window {
    L?: any
    __txLeafletLoader?: Promise<any>
  }
}

let Leaflet: any | null = null
let map: any = null
let markerLayer: any = null

function loadLeaflet(): Promise<any> {
  if (window.L) {
    return Promise.resolve(window.L)
  }
  if (window.__txLeafletLoader) {
    return window.__txLeafletLoader
  }

  window.__txLeafletLoader = new Promise((resolve, reject) => {
    const stylesheetId = 'tx-leaflet-css'
    if (!document.getElementById(stylesheetId)) {
      const link = document.createElement('link')
      link.id = stylesheetId
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    const existingScript = document.getElementById('tx-leaflet-js') as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Leaflet runtime')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = 'tx-leaflet-js'
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => resolve(window.L)
    script.onerror = () => reject(new Error('Failed to load Leaflet runtime'))
    document.head.appendChild(script)
  })

  return window.__txLeafletLoader
}

const validPoints = computed(() => props.points.filter((point) => {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
}))

function destroyMap() {
  markerLayer?.clearLayers()
  markerLayer = null
  map?.remove()
  map = null
  mapReady.value = false
}

function createMap() {
  if (!Leaflet || map || !containerRef.value) {
    return
  }

  map = Leaflet.map(containerRef.value, {
    zoomControl: true,
    attributionControl: true,
    minZoom: 1,
    maxZoom: 18,
  })

  Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  markerLayer = Leaflet.layerGroup().addTo(map)
  mapReady.value = true
  renderMarkers()
}

function resolveRadius(value: number | undefined, maxValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) {
    return 8
  }
  const ratio = Math.sqrt((value as number) / maxValue)
  return Math.max(6, Math.min(22, 6 + ratio * 16))
}

function renderMarkers() {
  if (!map || !markerLayer) {
    return
  }

  markerLayer.clearLayers()

  const points = validPoints.value
  if (!points.length) {
    map.setView([20, 0], props.defaultZoom)
    return
  }

  const maxValue = Math.max(...points.map(point => Number(point.value ?? 0)), 0)
  const coordinates: Array<[number, number]> = []

  for (const point of points) {
    const lat = Number(point.latitude)
    const lng = Number(point.longitude)
    coordinates.push([lat, lng])

    const marker = Leaflet.circleMarker([lat, lng], {
      radius: resolveRadius(point.value, maxValue),
      color: point.color || '#22c55e',
      fillColor: point.color || '#3b82f6',
      fillOpacity: 0.72,
      weight: 1,
    })

    const valueText = Number.isFinite(point.value) ? ` · ${point.value}` : ''
    marker.bindTooltip(`${point.label}${valueText}`, {
      direction: 'top',
      opacity: 0.92,
      offset: [0, -8],
    })
    marker.on('click', () => emit('point-click', point))
    markerLayer.addLayer(marker)
  }

  if (coordinates.length === 1) {
    map.setView(coordinates[0], Math.max(4, props.defaultZoom))
    return
  }

  const bounds = Leaflet.latLngBounds(coordinates)
  map.fitBounds(bounds, {
    padding: [props.fitPadding, props.fitPadding],
    maxZoom: 6,
  })
}

watch(
  () => props.points,
  async () => {
    await nextTick()
    renderMarkers()
  },
  { deep: true },
)

watch(
  () => props.height,
  async () => {
    await nextTick()
    map?.invalidateSize()
  },
)

onMounted(async () => {
  await nextTick()
  Leaflet = await loadLeaflet().catch(() => null)
  createMap()
})

onBeforeUnmount(() => {
  destroyMap()
})
</script>

<template>
  <div class="relative">
    <div
      ref="containerRef"
      class="w-full overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.1]"
      :style="{ height: `${height}px` }"
    />
    <div
      v-if="mapReady && validPoints.length === 0"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/65 text-sm text-black/55 backdrop-blur-sm dark:bg-black/55 dark:text-white/60"
    >
      No geo data
    </div>
  </div>
</template>
