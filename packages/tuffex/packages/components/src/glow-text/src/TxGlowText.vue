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
  blendMode: 'screen',
  radius: 10,
  repeat: true,
})

const styleVars = computed<CSSProperties>(() => {
  return {
    '--tx-glow-duration': `${props.durationMs}ms`,
    '--tx-glow-delay': `${props.delayMs}ms`,
    '--tx-glow-angle': `${props.angle}deg`,
    '--tx-glow-band': `${props.bandSize}%`,
    '--tx-glow-color': props.color,
    '--tx-glow-opacity': String(props.opacity),
    '--tx-glow-radius': `${props.radius}px`,
    '--tx-glow-blend-mode': props.blendMode,
  } as CSSProperties
})
</script>

<template>
  <component
    :is="tag"
    class="tx-glow-text"
    :class="{ 'is-inactive': !active, 'is-once': !repeat }"
    :style="styleVars"
  >
    <span class="tx-glow-text__content">
      <slot />
    </span>
    <span class="tx-glow-text__shine" aria-hidden="true" />
  </component>
</template>

<style scoped lang="scss">
.tx-glow-text {
  position: relative;
  display: inline-block;
  border-radius: var(--tx-glow-radius, 10px);
  overflow: hidden;
}

.tx-glow-text__content {
  position: relative;
  z-index: 1;
}

.tx-glow-text__shine {
  position: absolute;
  inset: -30%;
  z-index: 2;
  opacity: var(--tx-glow-opacity, 0.75);
  pointer-events: none;
  mix-blend-mode: var(--tx-glow-blend-mode, screen);

  background: linear-gradient(
    var(--tx-glow-angle, 20deg),
    transparent 0%,
    transparent calc(50% - var(--tx-glow-band, 38%) / 2),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) 50%,
    transparent calc(50% + var(--tx-glow-band, 38%) / 2),
    transparent 100%
  );

  transform: translateX(-140%);
  animation: tx-glow-sweep var(--tx-glow-duration, 1400ms) linear infinite;
  animation-delay: var(--tx-glow-delay, 0ms);
}

.tx-glow-text.is-once .tx-glow-text__shine {
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

.tx-glow-text.is-inactive .tx-glow-text__shine {
  display: none;
}

@keyframes tx-glow-sweep {
  0% {
    transform: translateX(-140%);
  }
  100% {
    transform: translateX(140%);
  }
}
</style>
