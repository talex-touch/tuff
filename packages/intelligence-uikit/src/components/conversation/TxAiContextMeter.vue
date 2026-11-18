<script setup lang="ts">
import type { TxAiContextMeterProps } from '../../types'
import { computed } from 'vue'
import { calculateAiContextPercent, formatAiContextWindow } from '../../utils/composer-state'

defineOptions({ name: 'TxAiContextMeter' })

const props = withDefaults(defineProps<TxAiContextMeterProps>(), {
  usedTokens: 0,
  maxTokens: 0,
  label: 'Context window',
  compact: false,
  warningThreshold: 75,
  dangerThreshold: 90,
})

const percent = computed(() => calculateAiContextPercent(props.usedTokens, props.maxTokens))

const tone = computed<'normal' | 'warning' | 'danger'>(() => {
  if (percent.value >= props.dangerThreshold)
    return 'danger'
  if (percent.value >= props.warningThreshold)
    return 'warning'
  return 'normal'
})

const formattedDetail = computed(() => {
  if (props.detail)
    return props.detail
  return `${formatAiContextWindow(props.usedTokens)} / ${formatAiContextWindow(props.maxTokens)}`
})

const radius = 6.5
const circumference = 2 * Math.PI * radius
const dashOffset = computed(() => circumference * (1 - percent.value / 100))
</script>

<template>
  <div
    v-if="maxTokens > 0"
    class="tx-ai-context-meter"
    :class="[`is-${tone}`, { 'is-compact': compact }]"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :aria-valuetext="`${percent}% (${formattedDetail})`"
    :title="`${label}: ${formattedDetail} (${percent}%)`"
  >
    <svg class="tx-ai-context-meter__ring" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <circle
        cx="9"
        cy="9"
        :r="radius"
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.18"
        stroke-width="2"
      />
      <circle
        class="tx-ai-context-meter__arc"
        cx="9"
        cy="9"
        :r="radius"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <span class="tx-ai-context-meter__pct">{{ percent }}%</span>
    <span v-if="!compact" class="tx-ai-context-meter__detail">{{ formattedDetail }}</span>
  </div>
</template>

<style scoped lang="scss">
.tx-ai-context-meter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--tx-fill-color-lighter, rgba(148, 163, 184, 0.08));
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  user-select: none;

  &.is-warning {
    color: var(--tx-color-warning, #d97706);
  }

  &.is-danger {
    color: var(--tx-color-danger, #dc2626);
  }
}

.tx-ai-context-meter__ring {
  flex: none;
  transform: rotate(-90deg);
}

.tx-ai-context-meter__pct {
  font-weight: 600;
}

.tx-ai-context-meter__detail {
  color: var(--tx-text-color-secondary, #64748b);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-context-meter__arc {
    transition: stroke-dashoffset 0.28s ease;
  }
}
</style>
