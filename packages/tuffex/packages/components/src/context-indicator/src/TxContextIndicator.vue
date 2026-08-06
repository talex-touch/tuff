<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'TxContextIndicator' })

const props = withDefaults(
  defineProps<{
    usedTokens: number
    maxTokens: number
    /** Accessible label. @default 'Context usage' */
    label?: string
    /** Text next to the ring. @default (used, max) => '12.3K / 200K' */
    formatter?: (used: number, max: number) => string
  }>(),
  {
    label: 'Context usage',
  },
)

const RADIUS = 8
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const ratio = computed(() => {
  if (props.maxTokens <= 0)
    return 0
  return Math.min(1, Math.max(0, props.usedTokens / props.maxTokens))
})

const dashOffset = computed(() => CIRCUMFERENCE * (1 - ratio.value))

const level = computed(() => {
  if (ratio.value > 0.95)
    return 'danger'
  if (ratio.value > 0.8)
    return 'warning'
  return 'ok'
})

function compact(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000)
    return `${(value / 1000).toFixed(1)}K`
  return `${Math.round(value)}`
}

const text = computed(() => {
  const format = props.formatter ?? ((used: number, max: number) => `${compact(used)} / ${compact(max)}`)
  return format(props.usedTokens, props.maxTokens)
})

const percentText = computed(() => `${Math.round(ratio.value * 100)}%`)
</script>

<template>
  <div
    class="tx-context-indicator"
    :data-level="level"
    role="meter"
    :aria-label="label"
    :aria-valuemin="0"
    :aria-valuemax="maxTokens"
    :aria-valuenow="usedTokens"
    :title="`${text} (${percentText})`"
  >
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle class="tx-context-indicator__track" cx="10" cy="10" :r="RADIUS" />
      <circle
        class="tx-context-indicator__arc"
        cx="10"
        cy="10"
        :r="RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <span class="tx-context-indicator__text">{{ text }}</span>
    <slot name="detail" :ratio="ratio" :used="usedTokens" :max="maxTokens" />
  </div>
</template>

<style lang="scss">
.tx-context-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 12px;

  .tx-context-indicator__track {
    fill: none;
    stroke: var(--tx-border-color-light, #e4e7ed);
    stroke-width: 2.5;
  }

  .tx-context-indicator__arc {
    fill: none;
    stroke: var(--tx-color-primary, #409eff);
    stroke-width: 2.5;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset 0.25s ease;
  }

  &[data-level='warning'] .tx-context-indicator__arc {
    stroke: var(--tx-color-warning, #e6a23c);
  }

  &[data-level='danger'] .tx-context-indicator__arc {
    stroke: var(--tx-color-danger, #f56c6c);
  }

  .tx-context-indicator__text {
    font-variant-numeric: tabular-nums;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-context-indicator .tx-context-indicator__arc {
    transition: none;
  }
}
</style>
