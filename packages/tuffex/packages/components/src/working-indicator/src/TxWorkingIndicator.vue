<!-- Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT. -->
<script setup lang="ts">
import type { WorkingIndicatorProps } from './types'
import { computed } from 'vue'
import { formatElapsed, useElapsed } from './use-elapsed'

defineOptions({ name: 'TxWorkingIndicator' })

const props = withDefaults(defineProps<WorkingIndicatorProps>(), {
  label: 'Working',
  variant: 'drive',
  showElapsed: true,
})

defineSlots<{
  label?: () => any
}>()

const elapsedMs = useElapsed({
  startedAt: () => props.startedAt,
  active: () => props.showElapsed,
})

const elapsedText = computed(() => (props.elapsedFormatter ?? formatElapsed)(elapsedMs.value))
</script>

<template>
  <span
    class="tx-bui-working-indicator"
    :class="`is-${variant}`"
    role="status"
    :aria-label="ariaLabel"
  >
    <span class="tx-bui-working-indicator__grid" aria-hidden="true">
      <span v-for="cell in 9" :key="cell" class="tx-bui-working-indicator__cell" />
    </span>

    <span class="tx-bui-working-indicator__label">
      <slot name="label">{{ label }}</slot>
    </span>

    <!-- Hidden from assistive tech on purpose: this ticks ten times a second,
         and inside the status live region every tick would be announced. The
         label carries the announcement; the duration is a visual readout. -->
    <span
      v-if="showElapsed"
      class="tx-bui-working-indicator__elapsed"
      aria-hidden="true"
    >{{ elapsedText }}</span>
  </span>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pixel-on;
@include bui-keyframes-shimmer-text;

.tx-bui-working-indicator {
  @include bui-scope;

  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;

  .tx-bui-working-indicator__grid {
    display: grid;
    grid-template-columns: repeat(3, 4px);
    gap: 1.5px;
  }

  .tx-bui-working-indicator__cell {
    width: 4px;
    height: 4px;
    border-radius: 1px;
    background: var(--tx-bui-ink, #1f2124);
    opacity: 0.15;
  }

  &.is-dots .tx-bui-working-indicator__cell {
    border-radius: 999px;
  }

  // Wavefront offsets live in CSS rather than on inline styles: one
  // `animation: none` then switches the whole grid off for reduced motion,
  // which an inline style would outrank.
  //
  // `(column + |row - 1|) * 90ms` — a chevron front travelling right.
  &.is-drive .tx-bui-working-indicator__cell,
  &.is-dots .tx-bui-working-indicator__cell {
    animation: tx-bui-pixel-on 650ms ease-in-out infinite;

    &:nth-child(1) { animation-delay: 90ms; }
    &:nth-child(2) { animation-delay: 180ms; }
    &:nth-child(3) { animation-delay: 270ms; }
    &:nth-child(4) { animation-delay: 0ms; }
    &:nth-child(5) { animation-delay: 90ms; }
    &:nth-child(6) { animation-delay: 180ms; }
    &:nth-child(7) { animation-delay: 90ms; }
    &:nth-child(8) { animation-delay: 180ms; }
    &:nth-child(9) { animation-delay: 270ms; }
  }

  // Perimeter order 0,1,2,5,8,7,6,3 at 110ms apart.
  &.is-orbit .tx-bui-working-indicator__cell {
    animation: tx-bui-pixel-on 950ms ease-in-out infinite;

    &:nth-child(1) { animation-delay: 0ms; }
    &:nth-child(2) { animation-delay: 110ms; }
    &:nth-child(3) { animation-delay: 220ms; }
    &:nth-child(4) { animation-delay: 770ms; }

    // The centre is the hole the comet laps around — dimmer still, never lit.
    &:nth-child(5) {
      opacity: 0.07;
      animation: none;
    }

    &:nth-child(6) { animation-delay: 330ms; }
    &:nth-child(7) { animation-delay: 660ms; }
    &:nth-child(8) { animation-delay: 550ms; }
    &:nth-child(9) { animation-delay: 440ms; }
  }

  .tx-bui-working-indicator__label {
    @include bui-shimmer-text;

    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }

  .tx-bui-working-indicator__elapsed {
    @include bui-tabular-nums;

    color: var(--tx-bui-ink-3, #9a9da3);
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  // Freezes the grid in its dim state — the resting opacity is already 0.15,
  // so stopping the animation is the entire behaviour. The variant class is
  // repeated here to match the specificity of the rules above; a plainer
  // selector would lose to them and leave the grid running.
  //
  // The elapsed timer deliberately keeps ticking: it reports progress on real
  // work, which is information, not decoration.
  .tx-bui-working-indicator.is-drive .tx-bui-working-indicator__cell,
  .tx-bui-working-indicator.is-dots .tx-bui-working-indicator__cell,
  .tx-bui-working-indicator.is-orbit .tx-bui-working-indicator__cell {
    animation: none;
  }
}
</style>
