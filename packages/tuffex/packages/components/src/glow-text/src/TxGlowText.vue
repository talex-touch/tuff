<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { GlowTextProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxGlowText' })

const props = withDefaults(defineProps<GlowTextProps>(), {
  tag: 'span',
  active: true,
  durationMs: 1400,
  delayMs: 0,
  angle: 20,
  bandSize: 38,
  color: 'rgba(255, 255, 255, 0.9)',
  opacity: 0.75,
  mode: 'adaptive',
  radius: 10,
  repeat: true,
})

const rootClasses = computed(() => {
  return {
    'is-inactive': !props.active,
    'is-once': !props.repeat,
    'is-adaptive': props.mode === 'adaptive',
    'has-custom-blend': Boolean(props.blendMode),
    'has-custom-backdrop': Boolean(props.backdrop),
  }
})

const styleVars = computed<CSSProperties>(() => {
  const vars: CSSProperties = {
    '--tx-glow-duration': `${props.durationMs}ms`,
    '--tx-glow-delay': `${props.delayMs}ms`,
    '--tx-glow-angle': `${props.angle}deg`,
    '--tx-glow-band': `${props.bandSize}%`,
    '--tx-glow-color': props.color,
    '--tx-glow-opacity': String(props.opacity),
    '--tx-glow-radius': `${props.radius}px`,
  }

  if (props.blendMode)
    vars['--tx-glow-blend-mode'] = props.blendMode

  if (props.backdrop)
    vars['--tx-glow-backdrop'] = props.backdrop

  return vars
})
</script>

<template>
  <component
    :is="tag"
    class="tx-glow-text"
    :class="rootClasses"
    :style="styleVars"
  >
    <slot />
    <span class="tx-glow-text__shine" aria-hidden="true" />
  </component>
</template>

<style scoped lang="scss">
.tx-glow-text {
  position: relative;
  display: inline-block;
  border-radius: var(--tx-glow-radius, 10px);
  overflow: hidden;
  isolation: isolate;
}

.tx-glow-text > * {
  position: relative;
  z-index: 1;
}

.tx-glow-text.is-adaptive:not(.has-custom-blend) {
  --tx-glow-blend-mode: screen;
}

@supports (mix-blend-mode: plus-lighter) {
  .tx-glow-text.is-adaptive:not(.has-custom-blend) {
    --tx-glow-blend-mode: plus-lighter;
  }
}

@supports (backdrop-filter: blur(0)) {
  .tx-glow-text.is-adaptive:not(.has-custom-backdrop) {
    --tx-glow-backdrop: brightness(1.18) saturate(1.12);
  }
}

.tx-glow-text__shine {
  position: absolute;
  inset: -40%;
  z-index: 2;
  opacity: var(--tx-glow-opacity, 0.75);
  pointer-events: none;
  mix-blend-mode: var(--tx-glow-blend-mode, screen);
  -webkit-backdrop-filter: var(--tx-glow-backdrop, none);
  backdrop-filter: var(--tx-glow-backdrop, none);
  --tx-glow-band-size: var(--tx-glow-band, 38%);
  --tx-glow-band-half: calc(var(--tx-glow-band-size) / 2);
  --tx-glow-band-soft: calc(var(--tx-glow-band-size) / 3);

  background: linear-gradient(
    var(--tx-glow-angle, 20deg),
    transparent 0%,
    transparent calc(50% - var(--tx-glow-band-half)),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) calc(50% - var(--tx-glow-band-soft)),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) 50%,
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) calc(50% + var(--tx-glow-band-soft)),
    transparent calc(50% + var(--tx-glow-band-half)),
    transparent 100%
  );

  transform: translateX(-160%);
  filter: blur(0.4px);
  animation: tx-glow-sweep var(--tx-glow-duration, 1400ms) var(--tx-glow-ease, cubic-bezier(0.4, 0, 0.2, 1)) infinite;
  animation-delay: var(--tx-glow-delay, 0ms);
  will-change: transform, opacity, filter;
}

.tx-glow-text.is-once .tx-glow-text__shine {
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

.tx-glow-text.is-inactive .tx-glow-text__shine {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .tx-glow-text__shine {
    animation: none;
    transform: translateX(0);
    filter: none;
  }
}

@keyframes tx-glow-sweep {
  0% {
    transform: translateX(-160%);
    opacity: 0;
  }
  20%,
  80% {
    opacity: var(--tx-glow-opacity, 0.75);
  }
  100% {
    transform: translateX(160%);
    opacity: 0;
  }
}
</style>
