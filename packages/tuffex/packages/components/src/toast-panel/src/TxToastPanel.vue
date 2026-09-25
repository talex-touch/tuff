<script setup lang="ts">
import type { ToastPanelProps } from './types'
/**
 * TxToastPanel Component
 *
 * An item surfacing beneath the surface it came from — a dashed tether up to
 * its origin, a card, and a hint of more queued behind it.
 *
 * Distinct from `TxToastHost`: that is a global stack of transient
 * notifications driven by `toastStore`. This one is anchored, presentational
 * and fully controlled — the tether is what says "this came from *that*".
 *
 * @example
 * ```vue
 * <TxToastPanel :open="hasLatest" :stack="1">
 *   <TxCardItem :title="latest.name" :subtitle="latest.org" />
 * </TxToastPanel>
 * ```
 *
 * @component
 */
import { computed } from 'vue'

defineOptions({ name: 'TxToastPanel' })

const props = withDefaults(defineProps<ToastPanelProps>(), {
  open: true,
  tether: true,
  tetherLength: 28,
  side: 'below',
  stack: 1,
  ariaLabel: 'Latest item',
  live: 'polite',
})

defineSlots<{
  /** The card's contents. */
  default?: () => any
  /** Replaces the dashed tether. */
  tether?: () => any
}>()

/**
 * A third sliver is under a pixel of visible edge at the default offsets, so
 * it costs a node and a shadow layer to render nothing.
 */
const stackLayers = computed(() => {
  const requested = Math.trunc(props.stack)
  return Math.max(0, Math.min(2, Number.isFinite(requested) ? requested : 0))
})

const rootStyle = computed(() => ({
  '--tx-toast-panel-tether': `${Math.max(0, props.tetherLength)}px`,
}))
</script>

<template>
  <div
    class="tx-toast-panel"
    :class="[`is-${side}`, { 'is-open': open }]"
    :style="rootStyle"
    role="status"
    :aria-live="live === 'off' ? undefined : 'polite'"
    :aria-label="ariaLabel"
  >
    <slot name="tether">
      <span v-if="tether" class="tx-toast-panel__tether" aria-hidden="true" />
    </slot>

    <div class="tx-toast-panel__deck">
      <!-- Behind the card, purely decorative: the stack says "more where this
           came from" and carries no content of its own. -->
      <span
        v-for="layer in stackLayers"
        :key="layer"
        class="tx-toast-panel__layer"
        :style="{ '--tx-toast-panel-depth': layer }"
        aria-hidden="true"
      />
      <div class="tx-toast-panel__card">
        <slot />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-toast-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;

  // Hidden state is opacity + transform, never `display: none`: the panel has
  // to keep its box so the tether above it does not collapse and drag the
  // layout up every time the item changes.
  opacity: 0;
  transform: translateY(-6px);
  transition:
    opacity 0.28s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.34s var(--tx-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));

  &.is-open {
    opacity: 1;
    transform: translateY(0);
  }

  // Above means the tether hangs off the bottom instead, so the order flips.
  &.is-above {
    flex-direction: column-reverse;
    transform: translateY(6px);

    &.is-open {
      transform: translateY(0);
    }
  }

  // A border rather than a pseudo-element: one declaration, and `currentColor`
  // is not involved so it survives a host recolouring the card.
  &__tether {
    flex: none;
    width: 0;
    height: var(--tx-toast-panel-tether, 28px);
    border-left: 1px dashed var(--tx-border-color, #dcdfe6);
  }

  &__deck {
    position: relative;
    width: 100%;
  }

  // Each layer peeks out from under the card by a fixed step, inset from the
  // sides so the edges nest instead of stacking flush.
  &__layer {
    position: absolute;
    right: calc(var(--tx-toast-panel-depth, 1) * 10px);
    bottom: calc(var(--tx-toast-panel-depth, 1) * -6px);
    left: calc(var(--tx-toast-panel-depth, 1) * 10px);
    height: 18px;
    border-radius: 0 0 12px 12px;
    background: var(--tx-bg-color-overlay, #fff);
    // x ≈ y/2, matching the library's single top-left light source. A straight
    // -down shadow is what `shadow-light-source.test.ts` fails on.
    box-shadow: 3px 6px 16px rgba(0, 0, 0, 0.06);
  }

  &__card {
    position: relative;
    // Above the slivers, or the front card's own shadow would be cast over by
    // the layer that is meant to sit behind it.
    z-index: 1;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--tx-bg-color-overlay, #fff);
    box-shadow:
      0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
      4px 8px 24px rgba(0, 0, 0, 0.08);
  }

  // Keep the arrival legible without the travel: the panel still fades, which
  // is what tells a returning eye the content changed.
  @media (prefers-reduced-motion: reduce) {
    transition: opacity 0.28s linear;
    transform: none;

    &.is-above {
      transform: none;
    }
  }
}
</style>
