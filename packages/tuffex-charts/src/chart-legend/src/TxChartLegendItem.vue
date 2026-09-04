<script setup lang="ts">
// Behavior modeled on Cloudflare kumo's ChartLegend (MIT) — see
// research notes in the tuffex-charts task. Divergence: interactive items
// render a native <button> (project a11y guideline) instead of kumo's
// div[role=button], which also makes Enter/Space activation free.

import type { ChartLegendItemProps } from './types'
import { computed, useAttrs } from 'vue'

defineOptions({ name: 'TxChartLegendItem' })

const props = withDefaults(defineProps<ChartLegendItemProps>(), {
  variant: 'small',
  inactive: false,
  loading: false,
})

const attrs = useAttrs()

// A click listener makes the item a real button; a loading placeholder is
// decorative and must never be focusable.
const interactive = computed(() => !props.loading && 'onClick' in attrs)
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="tx-chart-legend-item"
    :class="[
      `tx-chart-legend-item--${props.variant}`,
      { 'is-inactive': props.inactive, 'is-loading': props.loading },
    ]"
    :type="interactive ? 'button' : undefined"
    :aria-hidden="props.loading ? 'true' : undefined"
  >
    <template v-if="props.loading">
      <span class="tx-chart-legend-item__row">
        <span class="tx-chart-legend-item__dot tx-chart-legend-item__dot--placeholder" />
        <span
          class="tx-chart-legend-item__skeleton tx-charts-shimmer"
          :class="props.variant === 'large' ? 'tx-chart-legend-item__skeleton--name-lg' : 'tx-chart-legend-item__skeleton--name'"
        />
        <span
          v-if="props.variant === 'small'"
          class="tx-chart-legend-item__skeleton tx-chart-legend-item__skeleton--value tx-charts-shimmer"
        />
      </span>
      <span
        v-if="props.variant === 'large'"
        class="tx-chart-legend-item__skeleton tx-chart-legend-item__skeleton--metric tx-charts-shimmer"
      />
    </template>

    <template v-else-if="props.variant === 'large'">
      <span class="tx-chart-legend-item__row">
        <span class="tx-chart-legend-item__dot" :style="{ backgroundColor: props.color }" />
        <span class="tx-chart-legend-item__name">{{ props.name }}</span>
      </span>
      <span class="tx-chart-legend-item__metric">
        <span class="tx-chart-legend-item__value">{{ props.value }}</span>
        <span v-if="props.unit" class="tx-chart-legend-item__unit">{{ props.unit }}</span>
      </span>
    </template>

    <template v-else>
      <span class="tx-chart-legend-item__dot" :style="{ backgroundColor: props.color }" />
      <span class="tx-chart-legend-item__name">{{ props.name }}</span>
      <span class="tx-chart-legend-item__value">{{ props.value }}</span>
    </template>
  </component>
</template>

<style lang="scss" scoped>
.tx-chart-legend-item {
  // Reset — the same element renders as <button> when interactive.
  margin: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;

  &--small {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 1rem;
    padding: 0;
  }

  &--large {
    display: inline-flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 10.5rem;
    padding: 0.5rem 0;
  }

  &.is-inactive > * {
    opacity: 0.5;
  }

  &:is(button) {
    cursor: pointer;
  }

  &__row {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  &__dot {
    display: inline-block;
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;

    &--placeholder {
      background-color: var(--tx-skeleton-base-color, #dddddd);
    }
  }

  &__name {
    font-size: 0.75rem;
    line-height: 1rem;
  }

  &--small &__value {
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1rem;
  }

  &__metric {
    display: inline-flex;
    align-items: baseline;
    gap: 0.125rem;
  }

  &--large &__value {
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1;
  }

  &__unit {
    color: var(--tx-chart-text-secondary, #9ca3af);
    font-size: 0.75rem;
    line-height: 1;
  }

  &__skeleton {
    display: inline-block;
    height: 0.75rem;
    border-radius: 0.25rem;

    &--name {
      width: 5ch;
    }

    &--name-lg {
      width: 8ch;
    }

    &--value {
      width: 3ch;
    }

    &--metric {
      height: 1.25rem;
      width: 5ch;
    }
  }
}
</style>
