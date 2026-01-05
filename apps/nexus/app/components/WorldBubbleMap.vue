<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  distribution: Record<string, number>
  maxCountries?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxCountries: 12,
})

const { locale } = useI18n()

const MAP_WIDTH = 1000
const MAP_HEIGHT = 500

const landShapes = [
  'M70 90 L150 60 L260 70 L320 130 L290 210 L210 250 L140 220 L90 160 Z',
  'M250 260 L310 260 L350 320 L330 420 L260 450 L220 360 Z',
  'M420 110 L470 90 L540 100 L580 130 L540 160 L470 150 L430 130 Z',
  'M450 180 L540 180 L590 250 L560 360 L470 350 L430 260 Z',
  'M560 120 L690 80 L820 110 L900 200 L840 250 L720 230 L620 170 Z',
  'M760 320 L860 330 L900 380 L820 410 L750 360 Z',
  'M220 40 L270 20 L320 40 L280 70 Z',
]

const countryCenters: Record<string, { lat: number; lon: number }> = {
  US: { lat: 37, lon: -95 },
  CA: { lat: 56, lon: -106 },
  MX: { lat: 23, lon: -102 },
  BR: { lat: -10, lon: -55 },
  AR: { lat: -34, lon: -64 },
  CL: { lat: -35, lon: -71 },
  CO: { lat: 4, lon: -74 },
  PE: { lat: -9, lon: -75 },
  GB: { lat: 54, lon: -2 },
  IE: { lat: 53, lon: -8 },
  FR: { lat: 46, lon: 2 },
  DE: { lat: 51, lon: 10 },
  NL: { lat: 52, lon: 5 },
  BE: { lat: 50, lon: 4 },
  ES: { lat: 40, lon: -4 },
  IT: { lat: 42, lon: 12 },
  SE: { lat: 62, lon: 15 },
  NO: { lat: 61, lon: 8 },
  PL: { lat: 52, lon: 20 },
  RU: { lat: 60, lon: 90 },
  EG: { lat: 26, lon: 30 },
  ZA: { lat: -30, lon: 24 },
  NG: { lat: 9, lon: 8 },
  KE: { lat: 0, lon: 38 },
  IL: { lat: 31, lon: 35 },
  SA: { lat: 24, lon: 45 },
  AE: { lat: 24, lon: 54 },
  TR: { lat: 39, lon: 35 },
  IN: { lat: 21, lon: 78 },
  CN: { lat: 35, lon: 103 },
  HK: { lat: 22, lon: 114 },
  TW: { lat: 23, lon: 121 },
  JP: { lat: 36, lon: 138 },
  KR: { lat: 36, lon: 128 },
  SG: { lat: 1, lon: 103 },
  TH: { lat: 15, lon: 101 },
  VN: { lat: 16, lon: 107 },
  ID: { lat: -2, lon: 118 },
  AU: { lat: -25, lon: 133 },
  NZ: { lat: -41, lon: 174 },
}

const total = computed(() => Object.values(props.distribution).reduce((a, b) => a + b, 0))

const topCountries = computed(() => {
  return Object.entries(props.distribution)
    .filter(([, count]) => Number.isFinite(count))
    .sort((a, b) => b[1] - a[1])
    .slice(0, props.maxCountries)
})

const maxCount = computed(() => Math.max(0, ...topCountries.value.map(([, count]) => count)))

const displayNames = computed(() => {
  try {
    return new Intl.DisplayNames([locale.value], { type: 'region' })
  } catch {
    return null
  }
})

function resolveCountryName(code: string) {
  return displayNames.value?.of(code) ?? code
}

function project(lat: number, lon: number) {
  const x = ((lon + 180) / 360) * MAP_WIDTH
  const y = ((90 - lat) / 180) * MAP_HEIGHT
  return { x, y }
}

const bubbles = computed(() => {
  const max = maxCount.value || 1
  return topCountries.value
    .map(([code, count]) => {
      const position = countryCenters[code.toUpperCase()]
      if (!position)
        return null
      const { x, y } = project(position.lat, position.lon)
      const ratio = Math.sqrt(count / max)
      const r = 8 + ratio * 14
      const pct = total.value > 0 ? (count / total.value) * 100 : 0
      return {
        code: code.toUpperCase(),
        name: resolveCountryName(code.toUpperCase()),
        count,
        pct,
        x,
        y,
        r,
      }
    })
    .filter(Boolean) as Array<{
      code: string
      name: string
      count: number
      pct: number
      x: number
      y: number
      r: number
    }>
})

const activeCode = ref<string | null>(null)
const activeBubble = computed(() => bubbles.value.find(item => item.code === activeCode.value) ?? null)
const tooltipStyle = computed(() => {
  if (!activeBubble.value)
    return {}
  const x = (activeBubble.value.x / MAP_WIDTH) * 100
  const y = (activeBubble.value.y / MAP_HEIGHT) * 100
  return { left: `${x}%`, top: `${y}%` }
})

function setActive(code: string) {
  activeCode.value = code
}

function clearActive() {
  activeCode.value = null
}
</script>

<template>
  <div class="relative overflow-hidden rounded-xl bg-black/5 p-3 dark:bg-light/5">
    <svg viewBox="0 0 1000 500" class="h-44 w-full">
      <defs>
        <linearGradient id="bubble" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.9" />
        </linearGradient>
      </defs>

      <g class="text-black/10 dark:text-light/10" opacity="0.7">
        <path
          v-for="shape in landShapes"
          :key="shape"
          :d="shape"
          fill="currentColor"
        />
      </g>

      <g opacity="0.25">
        <path d="M0 250 H1000" stroke="currentColor" stroke-width="1" class="text-black/20 dark:text-light/20" />
        <path d="M500 0 V500" stroke="currentColor" stroke-width="1" class="text-black/20 dark:text-light/20" />
      </g>

      <g>
        <circle
          v-for="item in bubbles"
          :key="item.code"
          :cx="item.x"
          :cy="item.y"
          :r="item.r"
          fill="url(#bubble)"
          fill-opacity="0.9"
          stroke="white"
          stroke-opacity="0.4"
          :stroke-width="activeCode === item.code ? 2 : 1"
          class="cursor-pointer transition-all"
          @mouseenter="setActive(item.code)"
          @mouseleave="clearActive"
        />
      </g>
    </svg>

    <div
      v-if="activeBubble"
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs text-black shadow-md backdrop-blur dark:border-white/10 dark:bg-black/70 dark:text-light"
      :style="tooltipStyle"
    >
      <p class="font-semibold">{{ activeBubble.name }}</p>
      <p class="text-[11px] text-black/60 dark:text-light/60">
        {{ activeBubble.count }} · {{ activeBubble.pct.toFixed(1) }}%
      </p>
    </div>

    <div class="mt-2 flex items-center justify-between text-[11px] text-black/50 dark:text-light/50">
      <span class="flex items-center gap-1">
        <span class="i-carbon-earth-americas text-xs" />
        Global distribution
      </span>
      <span v-if="total">Total {{ total }}</span>
    </div>
  </div>
</template>
