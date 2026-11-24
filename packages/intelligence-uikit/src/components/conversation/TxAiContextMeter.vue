<script setup lang="ts">
import type { TxAiContextMeterProps } from '../../types'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { computed } from 'vue'
import {
  calculateAiContextPercent,
  formatAiContextWindow,
  formatAiWindowText,
} from '../../utils/composer-state'

defineOptions({ name: 'TxAiContextMeter' })

const props = withDefaults(defineProps<TxAiContextMeterProps>(), {
  variant: 'pill',
  usedTokens: 0,
  maxTokens: 0,
  percent: undefined,
  windowText: undefined,
  valueText: undefined,
  label: 'Context window',
  compact: false,
  warningThreshold: 75,
  dangerThreshold: 90,
})

const rawPercent = computed(() =>
  props.percent !== undefined
    ? props.percent
    : calculateAiContextPercent(props.usedTokens, props.maxTokens),
)

const clampedPercent = computed(() => calculateAiContextPercent(rawPercent.value, 100))

const tone = computed<'normal' | 'warning' | 'danger'>(() => {
  if (clampedPercent.value >= props.dangerThreshold)
    return 'danger'
  if (clampedPercent.value >= props.warningThreshold)
    return 'warning'
  return 'normal'
})

const resolvedWindowText = computed(() =>
  props.windowText !== undefined ? props.windowText : formatAiWindowText(props.maxTokens),
)

const formattedDetail = computed(() => {
  if (props.detail)
    return props.detail
  if (props.percent !== undefined && props.maxTokens <= 0)
    return resolvedWindowText.value
  return `${formatAiContextWindow(props.usedTokens)} / ${formatAiContextWindow(props.maxTokens)}`
})

const fillWidth = computed(() => `${clampedPercent.value}%`)
const labelLeft = computed(
  () => `clamp(2ch, ${fillWidth.value}, calc(100% - ${resolvedWindowText.value.length + 3}ch))`,
)
const barVisible = computed(() => props.percent !== undefined || props.maxTokens > 0)
const pillVisible = computed(() => props.maxTokens > 0 || props.percent !== undefined)
const pillAriaValuenow = computed(() => (props.percent !== undefined ? rawPercent.value : clampedPercent.value))
const pillDisplayPercent = computed(() => (props.percent !== undefined ? rawPercent.value : clampedPercent.value))
const barValueText = computed(() =>
  props.valueText || `${rawPercent.value}% / ${resolvedWindowText.value}`,
)
const pillValueText = computed(() =>
  props.valueText || `${pillDisplayPercent.value}% (${formattedDetail.value})`,
)

const radius = 6.5
const circumference = 2 * Math.PI * radius
const dashOffset = computed(() => circumference * (1 - clampedPercent.value / 100))
</script>

<template>
  <div
    v-if="variant === 'bar' && barVisible"
    class="tx-ai-context-meter-bar"
    role="meter"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="rawPercent"
    :aria-valuetext="barValueText"
  >
    <div class="tx-ai-context-meter-bar__labels" aria-hidden="true">
      <span class="tx-ai-context-meter-bar__percent" :style="{ left: labelLeft }">
        <TxTextMorph :text="`${rawPercent}%`" :duration-ms="420" />
      </span>
      <span class="tx-ai-context-meter-bar__window">{{ resolvedWindowText }}</span>
    </div>
    <div class="tx-ai-context-meter-bar__track">
      <div class="tx-ai-context-meter-bar__fill" :style="{ width: fillWidth }" />
    </div>
  </div>
  <div
    v-else-if="variant === 'pill' && pillVisible"
    class="tx-ai-context-meter"
    :class="[`is-${tone}`, { 'is-compact': compact }]"
    :role="percent !== undefined && maxTokens <= 0 ? 'meter' : 'progressbar'"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="pillAriaValuenow"
    :aria-valuetext="pillValueText"
    :title="`${label}: ${formattedDetail} (${pillDisplayPercent}%)`"
  >
    <svg class="tx-ai-context-meter__ring" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
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
    <span class="tx-ai-context-meter__pct">{{ pillDisplayPercent }}%</span>
    <span v-if="!compact && formattedDetail" class="tx-ai-context-meter__detail">{{ formattedDetail }}</span>
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

.tx-ai-context-meter-bar {
  position: relative;
  width: 100%;
  color: var(--tx-text-color-secondary, #64748b);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  line-height: 1;
}

.tx-ai-context-meter-bar__labels {
  position: relative;
  height: 12px;
  margin-bottom: 3px;
}

.tx-ai-context-meter-bar__percent {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  min-width: 2ch;
  font-variant-numeric: tabular-nums;
}

.tx-ai-context-meter-bar__window {
  position: absolute;
  top: 0;
  right: 0;
}

.tx-ai-context-meter-bar__track {
  height: 2px;
  overflow: hidden;
  border-radius: 1px;
  background: color-mix(in srgb, var(--tx-border-color-light, #e2e8f0) 80%, transparent);
}

.tx-ai-context-meter-bar__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--tx-text-color-secondary, #64748b);
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-context-meter__arc {
    transition: stroke-dashoffset 0.28s ease;
  }

  .tx-ai-context-meter-bar__fill {
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tx-ai-context-meter-bar__percent {
    transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
}
</style>
