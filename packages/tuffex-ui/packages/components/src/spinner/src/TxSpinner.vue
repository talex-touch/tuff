<script setup lang="ts">
import { computed } from 'vue'
import type { SpinnerProps } from './types'

defineOptions({
  name: 'TxSpinner',
})

const props = withDefaults(defineProps<SpinnerProps>(), {
  size: 16,
  strokeWidth: 2,
})

const styleVars = computed(() => ({
  '--tx-spinner-size': `${props.size}px`,
  '--tx-spinner-stroke': String(props.strokeWidth),
}))
</script>

<template>
  <span class="tx-spinner" :style="styleVars" aria-busy="true" aria-live="polite">
    <svg class="tx-spinner__svg" viewBox="0 0 24 24" :width="size" :height="size">
      <circle
        class="tx-spinner__circle"
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        stroke-dasharray="31.416"
        stroke-dashoffset="31.416"
      />
    </svg>
  </span>
</template>

<style lang="scss">
@keyframes tx-spinner-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-spinner-dash {
  0% {
    stroke-dashoffset: 31.416;
  }
  50% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -31.416;
  }
}

.tx-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tx-spinner-size, 16px);
  height: var(--tx-spinner-size, 16px);
  color: var(--tx-text-color-secondary, #909399);

  &__svg {
    width: 100%;
    height: 100%;
    animation: tx-spinner-rotate 1s linear infinite;
  }

  &__circle {
    animation: tx-spinner-dash 1.5s ease-in-out infinite;
  }
}
</style>
