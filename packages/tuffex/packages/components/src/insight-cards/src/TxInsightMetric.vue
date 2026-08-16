<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { InsightMetricProps, InsightMetricTone } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxInsightMetric' })

const props = withDefaults(defineProps<InsightMetricProps>(), {
  color: undefined,
  value: undefined,
  delta: undefined,
  unit: '%',
  precision: 2,
  detail: undefined,
  tone: undefined,
  formatter: undefined,
})

defineSlots<{
  /** Replaces the mono detail line. */
  detail?: () => any
}>()

const resolvedTone = computed<InsightMetricTone>(() => {
  if (props.tone)
    return props.tone
  if (props.value === undefined || props.value === 0)
    return 'neutral'
  return props.value > 0 ? 'positive' : 'negative'
})

const headline = computed(() => {
  if (props.delta !== undefined)
    return props.delta
  if (props.value === undefined)
    return ''
  if (props.formatter)
    return props.formatter(props.value)

  // U+2212 MINUS SIGN, not the ASCII hyphen upstream emits through `toFixed`:
  // the family's signed figures line up under `tabular-nums`, and the hyphen is
  // both narrower and set too high to sit on that grid.
  const magnitude = Math.abs(props.value).toFixed(props.precision)
  const sign = props.value > 0 ? '+' : props.value < 0 ? '−' : ''
  return `${sign}${magnitude}${props.unit}`
})
</script>

<template>
  <div class="tx-bui-insight-metric" :class="`is-${resolvedTone}`">
    <span class="tx-bui-insight-metric__label">
      <span
        v-if="color"
        class="tx-bui-insight-metric__dot"
        aria-hidden="true"
        :style="{ background: color }"
      />
      {{ label }}
    </span>
    <span v-if="headline" class="tx-bui-insight-metric__value">{{ headline }}</span>
    <code v-if="$slots.detail || detail" class="tx-bui-insight-metric__detail">
      <slot name="detail">{{ detail }}</slot>
    </code>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-insight-metric {
  @include bui-scope;

  flex: 1;
  min-width: 0;
}

.tx-bui-insight-metric__label {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11.5px;
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-insight-metric__dot {
  flex: 0 0 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.tx-bui-insight-metric__value {
  @include bui-tabular-nums;

  display: block;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-insight-metric__detail {
  @include bui-tabular-nums;

  font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
  font-size: 11.5px;
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-insight-metric.is-positive {
  .tx-bui-insight-metric__value,
  .tx-bui-insight-metric__detail {
    color: var(--tx-bui-green, #189a4d);
  }
}

.tx-bui-insight-metric.is-negative {
  .tx-bui-insight-metric__value,
  .tx-bui-insight-metric__detail {
    color: var(--tx-bui-red, #e3474c);
  }
}
</style>
