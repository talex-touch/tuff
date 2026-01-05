<script setup lang="ts">
interface Props {
  distribution: Record<string, number>
  maxCountries?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxCountries: 12,
})

const total = computed(() => Object.values(props.distribution).reduce((a, b) => a + b, 0))

const topCountries = computed(() => {
  return Object.entries(props.distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, props.maxCountries)
})

const maxCount = computed(() => Math.max(0, ...topCountries.value.map(([, count]) => count)))

const countryPositions: Record<string, { x: number; y: number }> = {
  // Americas
  US: { x: 18, y: 18 },
  CA: { x: 16, y: 12 },
  MX: { x: 20, y: 25 },
  BR: { x: 30, y: 40 },
  AR: { x: 28, y: 48 },
  CL: { x: 26, y: 48 },
  CO: { x: 24, y: 34 },
  PE: { x: 26, y: 40 },
  // Europe
  GB: { x: 47, y: 16 },
  IE: { x: 45, y: 16 },
  FR: { x: 49, y: 21 },
  DE: { x: 52, y: 18 },
  NL: { x: 51, y: 16 },
  BE: { x: 50, y: 18 },
  ES: { x: 48, y: 25 },
  IT: { x: 53, y: 24 },
  SE: { x: 53, y: 10 },
  NO: { x: 51, y: 9 },
  PL: { x: 56, y: 18 },
  RU: { x: 65, y: 12 },
  // Africa / Middle East
  EG: { x: 57, y: 28 },
  ZA: { x: 56, y: 48 },
  NG: { x: 50, y: 35 },
  KE: { x: 60, y: 38 },
  IL: { x: 58, y: 24 },
  SA: { x: 62, y: 30 },
  AE: { x: 66, y: 28 },
  TR: { x: 58, y: 22 },
  // Asia-Pacific
  IN: { x: 70, y: 30 },
  CN: { x: 76, y: 22 },
  HK: { x: 80, y: 26 },
  TW: { x: 82, y: 26 },
  JP: { x: 86, y: 22 },
  KR: { x: 84, y: 20 },
  SG: { x: 78, y: 38 },
  TH: { x: 76, y: 34 },
  VN: { x: 78, y: 32 },
  ID: { x: 80, y: 42 },
  AU: { x: 86, y: 46 },
  NZ: { x: 92, y: 50 },
}

const bubbles = computed(() => {
  const max = maxCount.value || 1
  return topCountries.value
    .map(([code, count]) => {
      const pos = countryPositions[code.toUpperCase()]
      if (!pos)
        return null
      const ratio = Math.sqrt(count / max)
      const r = 2.8 + ratio * 6.5
      const pct = total.value > 0 ? (count / total.value) * 100 : 0
      return {
        code: code.toUpperCase(),
        count,
        pct,
        x: pos.x,
        y: pos.y,
        r,
      }
    })
    .filter(Boolean) as Array<{ code: string; count: number; pct: number; x: number; y: number; r: number }>
})
</script>

<template>
  <div class="relative overflow-hidden rounded-xl bg-black/5 p-3 dark:bg-light/5">
    <svg viewBox="0 0 100 55" class="h-40 w-full">
      <defs>
        <linearGradient id="bubble" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.9" />
        </linearGradient>
      </defs>

      <g opacity="0.35">
        <ellipse cx="22" cy="18" rx="16" ry="10" fill="currentColor" class="text-black/10 dark:text-light/10" />
        <ellipse cx="30" cy="40" rx="9" ry="12" fill="currentColor" class="text-black/10 dark:text-light/10" />
        <ellipse cx="52" cy="18" rx="10" ry="7" fill="currentColor" class="text-black/10 dark:text-light/10" />
        <ellipse cx="56" cy="32" rx="10" ry="12" fill="currentColor" class="text-black/10 dark:text-light/10" />
        <ellipse cx="76" cy="18" rx="18" ry="10" fill="currentColor" class="text-black/10 dark:text-light/10" />
        <ellipse cx="86" cy="44" rx="9" ry="6" fill="currentColor" class="text-black/10 dark:text-light/10" />
      </g>

      <g opacity="0.25">
        <path d="M0 27 H100" stroke="currentColor" stroke-width="0.4" class="text-black/20 dark:text-light/20" />
        <path d="M50 0 V55" stroke="currentColor" stroke-width="0.4" class="text-black/20 dark:text-light/20" />
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
          stroke-opacity="0.35"
          stroke-width="0.6"
        >
          <title>{{ item.code }} · {{ item.count }} ({{ item.pct.toFixed(1) }}%)</title>
        </circle>
      </g>
    </svg>

    <div class="mt-2 flex items-center justify-between text-[11px] text-black/50 dark:text-light/50">
      <span class="flex items-center gap-1">
        <span class="i-carbon-earth-americas text-xs" />
        Global distribution
      </span>
      <span v-if="total">Total {{ total }}</span>
    </div>
  </div>
</template>

