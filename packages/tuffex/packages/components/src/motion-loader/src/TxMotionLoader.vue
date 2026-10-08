<script setup lang="ts">
// Ported from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MotionLoaderLabels, MotionLoaderProps } from './types'
import { computed, ref, useId } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import LoaderScene from './LoaderScene'
import { getLoaderScene } from './scenes'

defineOptions({ name: 'TxMotionLoader' })

const props = withDefaults(defineProps<MotionLoaderProps>(), {
  variant: 'classic-spinner',
  playing: true,
  size: 'md',
  speed: 1,
  showLabel: true,
})
const root = ref<HTMLElement | null>(null)
const instanceId = `tx-motion-loader-${useId().replace(/[^\w-]/g, '-')}`
const { active } = useMotionActivity(root, () => props.playing)
const scene = computed(() => getLoaderScene(props.variant))
const playbackSpeed = computed(() => Number.isFinite(props.speed) && props.speed > 0 ? props.speed : 1)
const copy = computed<Required<MotionLoaderLabels>>(() => ({
  loading: props.labels?.loading ?? 'Loading',
  thinking: props.labels?.thinking ?? 'Thinking',
  waiting: props.labels?.waiting ?? 'Wait',
  unlock: props.labels?.unlock ?? 'Slide to unlock',
  terminal: props.labels?.terminal ?? 'loading...',
  paused: props.labels?.paused ?? 'Paused',
}))
const statusLabel = computed(() => props.label ?? copy.value.loading)
</script>

<template>
  <div
    ref="root"
    class="tx-motion-loader"
    :class="`tx-motion-loader--${size}`"
    :data-variant="variant"
    :data-playing="active"
    role="status"
    aria-live="polite"
    aria-busy="true"
    :aria-label="statusLabel"
  >
    <div class="tx-motion-loader__stage" aria-hidden="true">
      <LoaderScene
        :key="variant"
        :scene="scene"
        :active="active"
        :speed="playbackSpeed"
        :labels="copy"
        :instance-id="instanceId"
      />
    </div>
    <span class="tx-motion-loader__label" :class="{ 'tx-motion-loader__label--hidden': !showLabel }">
      {{ playing ? statusLabel : `${statusLabel} · ${copy.paused}` }}
    </span>
  </div>
</template>

<style lang="scss">
.tx-motion-loader {
  --tx-motion-loader-scale: 1;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  line-height: 1.4;
  vertical-align: middle;

  &--xs { --tx-motion-loader-scale: 0.65; }
  &--sm { --tx-motion-loader-scale: 0.85; }
  &--lg { --tx-motion-loader-scale: 1.25; }

  &__stage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 140px;
    min-height: 90px;
    zoom: var(--tx-motion-loader-scale);
  }

  &__scene {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 140px;

    *, *::before, *::after {
      box-sizing: border-box;
      border-width: 0;
      border-style: solid;
      border-color: var(--tx-border-color);
    }

    svg { display: block; }

    // Placeholder geometry is always the existing TxSkeleton. The source scene
    // owns its pulse/sweep; do not start a second unowned skeleton CSS loop.
    .tx-skeleton__item {
      animation: none;
    }
  }

  &__label {
    color: var(--tx-text-color-regular);
    font-size: 13px;
    text-align: center;
  }

  &__label--hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}
</style>
