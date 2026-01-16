<script setup lang="ts">
import { computed } from 'vue'
import TxIcon from './TxIcon.vue'
import type { TxStatusIconProps } from './status-icon'

defineOptions({ name: 'TxStatusIcon' })

const props = withDefaults(defineProps<TxStatusIconProps>(), {
  icon: null,
  name: '',
  alt: '',
  size: 18,
  empty: '',
  colorful: true,
  tone: 'none',
  indicatorSize: undefined,
  indicatorOffset: 0,
})

const indicatorSize = computed(() => {
  if (typeof props.indicatorSize === 'number' && props.indicatorSize > 0) return props.indicatorSize
  const base = Math.round((props.size ?? 18) * 0.32)
  return Math.max(6, Math.min(12, base))
})
</script>

<template>
  <span
    class="tx-status-icon"
    :style="{
      '--tx-status-icon-size': `${size}px`,
      '--tx-status-indicator-size': `${indicatorSize}px`,
      '--tx-status-indicator-offset': `${indicatorOffset}px`,
    }"
  >
    <TxIcon
      class="tx-status-icon__icon"
      :icon="icon"
      :name="name"
      :alt="alt"
      :size="size"
      :empty="empty"
      :colorful="colorful"
    />

    <span
      v-if="tone !== 'none'"
      class="tx-status-icon__indicator"
      :class="`is-${tone}`"
      aria-hidden="true"
    />
  </span>
</template>

<style lang="scss" scoped>
.tx-status-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tx-status-icon-size, 18px);
  height: var(--tx-status-icon-size, 18px);
}

.tx-status-icon__icon {
  width: 100%;
  height: 100%;
}

.tx-status-icon__indicator {
  position: absolute;
  right: var(--tx-status-indicator-offset, 0px);
  bottom: var(--tx-status-indicator-offset, 0px);
  width: var(--tx-status-indicator-size, 8px);
  height: var(--tx-status-indicator-size, 8px);
  border-radius: 999px;
  box-sizing: border-box;
  border: 2px solid var(--tx-bg-color-overlay, #fff);
  background: var(--tx-status-indicator-color, var(--tx-color-info));
}

.tx-status-icon__indicator.is-info {
  --tx-status-indicator-color: #9ca3af;
}

.tx-status-icon__indicator.is-success {
  --tx-status-indicator-color: var(--tx-color-success);
}

.tx-status-icon__indicator.is-warning {
  --tx-status-indicator-color: var(--tx-color-warning);
}

.tx-status-icon__indicator.is-error {
  --tx-status-indicator-color: var(--tx-color-danger);
}

.tx-status-icon__indicator.is-loading {
  --tx-status-indicator-color: var(--tx-color-primary);
}

.tx-status-icon__indicator.is-loading::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  border: 2px solid var(--tx-status-indicator-color);
  opacity: 0.55;
  animation: tx-status-icon-pulse 1.2s ease-out infinite;
  pointer-events: none;
}

@keyframes tx-status-icon-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.55;
  }
  70% {
    transform: scale(2.1);
    opacity: 0;
  }
  100% {
    transform: scale(2.1);
    opacity: 0;
  }
}
</style>

