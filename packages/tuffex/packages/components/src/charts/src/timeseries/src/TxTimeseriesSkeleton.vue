<script setup lang="ts">
// Ported from Cloudflare kumo's ChartSkeletonLoader (MIT) — the same harmonic
// silhouette drives both variants so line and bar skeletons feel related.

import { computed } from 'vue'
import { nextUid } from '../../core/uid'

defineOptions({ name: 'TxTimeseriesSkeleton' })

const props = withDefaults(defineProps<{
  height?: number
  type?: 'line' | 'bar'
}>(), {
  height: 350,
  type: 'line',
})

const WIDTH = 400
const SAMPLES = 80
const BARS = 24
const BAR_GAP_RATIO = 0.35

const uid = nextUid()
const fillId = `tx-ts-skeleton-fill-${uid}`
const shineId = `tx-ts-skeleton-shine-${uid}`
const clipId = `tx-ts-skeleton-clip-${uid}`

/** Sum of harmonics, roughly in [-1, 1] — a calm, organic waveform. */
function wave(theta: number): number {
  return (
    0.45 * Math.sin(3 * theta)
    + 0.3 * Math.sin(5 * theta + 0.9)
    + 0.25 * Math.sin(7 * theta + 2.1)
  )
}

const bars = computed(() => {
  const slot = WIDTH / BARS
  const barWidth = slot * (1 - BAR_GAP_RATIO)
  const minH = props.height * 0.15
  const maxH = props.height * 0.85
  return Array.from({ length: BARS }, (_, index) => {
    const theta = ((index + 0.5) / BARS) * 2 * Math.PI
    const norm = (wave(theta) + 1) / 2
    const barHeight = minH + norm * (maxH - minH)
    return {
      x: index * slot + (slot - barWidth) / 2,
      y: props.height - barHeight,
      width: barWidth,
      height: barHeight,
    }
  })
})

const lineD = computed(() => {
  const mid = props.height / 2
  const amp = Math.min(props.height * 0.18, 40)
  return Array.from({ length: SAMPLES + 1 }, (_, index) => {
    const x = (index / SAMPLES) * WIDTH
    const theta = (x / WIDTH) * 2 * Math.PI
    const y = mid - wave(theta) * amp
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
})

const areaD = computed(() => `${lineD.value} L${WIDTH},${props.height} L0,${props.height} Z`)

const isBar = computed(() => props.type === 'bar')
</script>

<template>
  <div
    class="tx-ts-skeleton"
    role="status"
    aria-label="Loading chart"
    :style="{ height: `${props.height}px` }"
  >
    <svg
      aria-hidden="true"
      width="100%"
      :height="props.height"
      :viewBox="`0 0 ${WIDTH} ${props.height}`"
      preserveAspectRatio="none"
      class="tx-ts-skeleton__svg"
    >
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--tx-skeleton-base-color, #dddddd)" stop-opacity="0.1" />
          <stop offset="100%" stop-color="var(--tx-skeleton-base-color, #dddddd)" stop-opacity="0" />
        </linearGradient>
        <linearGradient :id="shineId" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--tx-skeleton-base-color, #dddddd)" stop-opacity="0" />
          <stop offset="50%" stop-color="var(--tx-skeleton-base-color, #dddddd)" stop-opacity="0.24" />
          <stop offset="100%" stop-color="var(--tx-skeleton-base-color, #dddddd)" stop-opacity="0" />
        </linearGradient>
        <clipPath :id="clipId">
          <template v-if="isBar">
            <rect
              v-for="(bar, index) in bars"
              :key="index"
              :x="bar.x"
              :y="bar.y"
              :width="bar.width"
              :height="bar.height"
            />
          </template>
          <path v-else :d="areaD" />
        </clipPath>
      </defs>

      <template v-if="isBar">
        <rect
          v-for="(bar, index) in bars"
          :key="index"
          class="tx-ts-skeleton__bar"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
        />
      </template>
      <template v-else>
        <path :d="areaD" :fill="`url(#${fillId})`" stroke="none" />
        <path
          class="tx-ts-skeleton__line"
          :d="lineD"
          fill="none"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
      </template>

      <g :clip-path="`url(#${clipId})`">
        <rect
          class="tx-ts-skeleton__shimmer"
          x="0"
          y="0"
          :width="WIDTH"
          :height="props.height"
          :fill="`url(#${shineId})`"
        />
      </g>
    </svg>
  </div>
</template>

<style lang="scss" scoped>
.tx-ts-skeleton {
  overflow: hidden;

  &__svg {
    display: block;
    width: 100%;
  }

  &__bar {
    fill: var(--tx-skeleton-base-color, #dddddd);
    fill-opacity: 0.16;
    stroke: none;
  }

  &__line {
    stroke: var(--tx-skeleton-base-color, #dddddd);
    stroke-opacity: 0.6;
  }

  &__shimmer {
    animation: tx-ts-skeleton-slide 1.8s linear infinite;
    transform-box: fill-box;
  }
}

@keyframes tx-ts-skeleton-slide {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-ts-skeleton__shimmer {
    animation: none;
  }
}
</style>
