<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { TuffLogoStrokeProps } from './types'
import { computed, useId } from 'vue'

defineOptions({
  name: 'TxTuffLogoStroke',
})

const props = withDefaults(defineProps<TuffLogoStrokeProps>(), {
  size: 120,
  mode: 'once',
  durationMs: 2200,
  strokeColor: '#4C4CFF',
  fillStartColor: '#199FFE',
  fillEndColor: '#810DC6',
  outerStartColor: '#D73E4D',
  outerEndColor: '#7F007F',
})

const resolvedMode = computed<'once' | 'breathe' | 'hover'>(() => {
  if (props.mode === 'loop')
    return 'breathe'
  return props.mode
})

const componentId = `tx-tuff-logo-stroke-${useId()}`
const fillGradientId = `${componentId}-fill`
const outerGradientId = `${componentId}-outer`
const blurFilterId = `${componentId}-blur`

function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

const rootStyle = computed<CSSProperties>(() => ({
  width: toCssUnit(props.size),
  height: toCssUnit(props.size),
  '--tx-tuff-logo-duration': `${props.durationMs}ms`,
}))

const modeClass = computed(() => ({
  'is-once': resolvedMode.value === 'once',
  'is-breathe': resolvedMode.value === 'breathe',
  'is-hover': resolvedMode.value === 'hover',
}))
</script>

<template>
  <svg
    class="tx-tuff-logo-stroke"
    :class="modeClass"
    :style="rootStyle"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Tuff logo stroke animation"
  >
    <defs>
      <linearGradient :id="fillGradientId" gradientTransform="rotate(45)">
        <stop offset="0%" :stop-color="fillStartColor" />
        <stop offset="100%" :stop-color="fillEndColor" />
      </linearGradient>
      <radialGradient :id="outerGradientId" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" :stop-color="outerStartColor" stop-opacity="0.4" />
        <stop offset="100%" :stop-color="outerEndColor" stop-opacity="0.4" />
      </radialGradient>
      <filter :id="blurFilterId" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
      </filter>
    </defs>

    <rect
      class="tx-tuff-logo-stroke__outline"
      x="15"
      y="15"
      width="70"
      height="70"
      rx="30"
      fill="none"
      :stroke="strokeColor"
      stroke-width="2"
      pathLength="100"
      :filter="`url(#${blurFilterId})`"
    />
    <circle
      class="tx-tuff-logo-stroke__ring"
      cx="50"
      cy="50"
      r="32"
      fill="none"
      :stroke="`url(#${outerGradientId})`"
      stroke-width="4"
      pathLength="100"
    />
    <path
      class="tx-tuff-logo-stroke__core-stroke"
      d="M30,70 C35,65 45,65 50,70 Q55,75 60,70 L70,60 C75,55 75,45 70,40 L60,30 Q55,25 50,30 Q45,35 40,30 L30,40 C25,45 25,55 30,60 Z"
      fill="none"
      :stroke="`url(#${fillGradientId})`"
      stroke-width="2.5"
      pathLength="100"
    />
    <path
      class="tx-tuff-logo-stroke__core-fill"
      d="M30,70 C35,65 45,65 50,70 Q55,75 60,70 L70,60 C75,55 75,45 70,40 L60,30 Q55,25 50,30 Q45,35 40,30 L30,40 C25,45 25,55 30,60 Z"
      :fill="`url(#${fillGradientId})`"
      :filter="`url(#${blurFilterId})`"
    />
  </svg>
</template>

<style scoped lang="scss">
.tx-tuff-logo-stroke {
  display: inline-block;
  overflow: visible;
  transform-origin: center;
}

.tx-tuff-logo-stroke__outline,
.tx-tuff-logo-stroke__ring,
.tx-tuff-logo-stroke__core-stroke {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tx-tuff-logo-stroke.is-once .tx-tuff-logo-stroke__outline {
  animation: tx-tuff-logo-outline var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-once .tx-tuff-logo-stroke__ring {
  animation: tx-tuff-logo-ring var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-once .tx-tuff-logo-stroke__core-stroke {
  animation: tx-tuff-logo-core var(--tx-tuff-logo-duration, 2200ms) cubic-bezier(0.65, 0, 0.35, 1) forwards;
}

.tx-tuff-logo-stroke__core-fill {
  opacity: 0;
}

.tx-tuff-logo-stroke.is-once .tx-tuff-logo-stroke__core-fill {
  animation: tx-tuff-logo-fill var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-breathe {
  animation: tx-tuff-logo-breathe calc(var(--tx-tuff-logo-duration, 2200ms) * 1.2) ease-in-out infinite;
  animation-delay: calc(var(--tx-tuff-logo-duration, 2200ms) * 0.82);
  animation-fill-mode: both;
}

.tx-tuff-logo-stroke.is-breathe .tx-tuff-logo-stroke__outline {
  animation: tx-tuff-logo-outline var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-breathe .tx-tuff-logo-stroke__ring {
  animation: tx-tuff-logo-ring var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-breathe .tx-tuff-logo-stroke__core-stroke {
  animation: tx-tuff-logo-core var(--tx-tuff-logo-duration, 2200ms) cubic-bezier(0.65, 0, 0.35, 1) forwards;
}

.tx-tuff-logo-stroke.is-breathe .tx-tuff-logo-stroke__core-fill {
  animation: tx-tuff-logo-fill var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-hover {
  cursor: pointer;
}

.tx-tuff-logo-stroke.is-hover .tx-tuff-logo-stroke__core-fill {
  opacity: 0.14;
}

.tx-tuff-logo-stroke.is-hover:hover .tx-tuff-logo-stroke__outline {
  animation: tx-tuff-logo-outline var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-hover:hover .tx-tuff-logo-stroke__ring {
  animation: tx-tuff-logo-ring var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

.tx-tuff-logo-stroke.is-hover:hover .tx-tuff-logo-stroke__core-stroke {
  animation: tx-tuff-logo-core var(--tx-tuff-logo-duration, 2200ms) cubic-bezier(0.65, 0, 0.35, 1) forwards;
}

.tx-tuff-logo-stroke.is-hover:hover .tx-tuff-logo-stroke__core-fill {
  animation: tx-tuff-logo-fill var(--tx-tuff-logo-duration, 2200ms) ease forwards;
}

@keyframes tx-tuff-logo-outline {
  0% {
    stroke-dashoffset: 100;
  }
  45% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes tx-tuff-logo-ring {
  0%,
  20% {
    stroke-dashoffset: 100;
  }
  70% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes tx-tuff-logo-core {
  0%,
  40% {
    stroke-dashoffset: 100;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes tx-tuff-logo-fill {
  0%,
  60% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes tx-tuff-logo-breathe {
  0%,
  100% {
    transform: scale(1);
    filter: brightness(1) saturate(1);
  }
  50% {
    transform: scale(1.03);
    filter: brightness(1.08) saturate(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-tuff-logo-stroke__outline,
  .tx-tuff-logo-stroke__ring,
  .tx-tuff-logo-stroke__core-stroke {
    animation: none !important;
    stroke-dashoffset: 0;
  }

  .tx-tuff-logo-stroke__core-fill {
    animation: none !important;
    opacity: 1;
  }

  .tx-tuff-logo-stroke {
    animation: none !important;
    transform: none;
    filter: none;
  }
}
</style>
