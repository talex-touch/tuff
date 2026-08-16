<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { SignalMeterProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxSignalMeter' })

const props = withDefaults(defineProps<SignalMeterProps>(), {
  max: 3,
  tone: 'currentColor',
  barHeight: 10,
  barWidth: 4,
})

const bars = computed(() => Math.max(0, Math.trunc(props.max)))
const filled = computed(() => Math.min(bars.value, Math.max(0, Math.trunc(props.value))))
</script>

<template>
  <span
    class="tx-bui-signal-meter"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :style="{
      '--tx-bui-signal-meter-height': `${barHeight}px`,
      '--tx-bui-signal-meter-width': `${barWidth}px`,
      '--tx-bui-signal-meter-tone': tone,
    }"
  >
    <span
      v-for="bar in bars"
      :key="bar"
      class="tx-bui-signal-meter__bar"
      :class="{ 'is-filled': bar <= filled }"
    />
  </span>
</template>

<style lang="scss">
.tx-bui-signal-meter {
  display: inline-flex;
  flex: none;
  align-items: flex-end;
  gap: 2px;

  .tx-bui-signal-meter__bar {
    width: var(--tx-bui-signal-meter-width, 4px);
    height: var(--tx-bui-signal-meter-height, 10px);
    background: var(--tx-bui-line-strong, #e0e2e5);
    border-radius: 999px;
    transition: background-color 0.3s ease;
  }

  .tx-bui-signal-meter__bar.is-filled {
    background: var(--tx-bui-signal-meter-tone, currentColor);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-bui-signal-meter .tx-bui-signal-meter__bar {
    transition: none;
  }
}
</style>
