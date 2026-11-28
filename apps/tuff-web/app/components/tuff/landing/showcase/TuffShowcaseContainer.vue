<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  class?: string
  colors?: string[]
  speed?: number
  thickness?: number
  radius?: number
  background?: string
  glowBlur?: number
}>(), {
  colors: () => [
    '#ff6bcb',
    '#ffa63f',
    '#fffb7d',
    '#38f9d7',
    '#4776e6',
    '#b967ff',
  ],
  speed: 1800,
  thickness: 2.4,
  radius: 28,
  background: 'transparent',
  glowBlur: 72,
})

const FALLBACK_COLORS = [
  '#ff6bcb',
  '#ffa63f',
  '#fffb7d',
  '#38f9d7',
  '#4776e6',
  '#b967ff',
] as const

const palette = computed(() => {
  const unique = props.colors?.length ? props.colors : Array.from(FALLBACK_COLORS)
  const tailMatchesHead = unique[0] === unique[unique.length - 1]
  return tailMatchesHead ? unique : [...unique, unique[0]]
})

const gradientStops = computed(() => {
  const stops = palette.value
  if (!stops.length)
    return 'rgba(255,255,255,0.25)'

  const step = stops.length > 1 ? 100 / (stops.length - 1) : 100
  return stops
    .map((color, index) => `${color} ${(index * step).toFixed(2)}%`)
    .join(', ')
})

const containerClass = computed(() =>
  `${props.class} tuff-showcase-container`.trim(),
)

const containerStyle = computed(() => ({
  '--showcase-stops': gradientStops.value,
  '--showcase-speed': `${props.speed}ms`,
  '--showcase-border-width': `${props.thickness}px`,
  '--showcase-radius': `${props.radius}px`,
  '--showcase-surface': props.background,
  '--showcase-glow-blur': `${props.glowBlur}px`,
}))
</script>

<template>
  <div
    :class="containerClass"
    :style="containerStyle"
  >
    <div class="tuff-showcase-container__glow" aria-hidden="true" />
    <div class="tuff-showcase-container__inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@property --showcase-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.tuff-showcase-container {
  --showcase-angle: 0deg;
  --showcase-stops: #ff6bcb, #ffa63f, #fffb7d, #38f9d7, #4776e6, #b967ff, #ff6bcb;
  --showcase-speed: 18000ms;
  --showcase-border-width: 2px;
  --showcase-radius: 24px;
  --showcase-surface: transparent;
  --showcase-glow-blur: 72px;

  position: relative;
  display: inline-flex;
  flex-direction: column;
  width: fit-content;
  max-width: 100%;
  isolation: isolate;
  overflow: hidden;
  border-radius: var(--showcase-radius);
  padding: var(--showcase-border-width);
  border: var(--showcase-border-width) solid transparent;
  background:
    linear-gradient(transparent, transparent) padding-box,
    conic-gradient(from var(--showcase-angle), var(--showcase-stops)) border-box;
  animation: rotate-border var(--showcase-speed) linear infinite;
  box-shadow:
    0 24px 80px rgba(15, 19, 39, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.tuff-showcase-container__inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  border-radius: calc(var(--showcase-radius) - var(--showcase-border-width));
  background: var(--showcase-surface);
  border: 0;
  box-shadow: none;
  box-sizing: border-box;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tuff-showcase-container__glow {
  position: absolute;
  inset: -40%;
  z-index: 0;
  pointer-events: none;
  background: conic-gradient(from var(--showcase-angle), var(--showcase-stops));
  opacity: 0.55;
  filter: blur(var(--showcase-glow-blur));
  mix-blend-mode: screen;
}

@keyframes rotate-border {
  to {
    --showcase-angle: 1turn;
  }
}
</style>
