<script setup lang="ts">
/**
 * TxProgressBar Component
 *
 * A versatile progress bar component with loading, error, and success states.
 * Supports both determinate and indeterminate progress modes.
 *
 * @example
 * ```vue
 * <TxProgressBar loading />
 * <TxProgressBar :percentage="75" show-text />
 * <TxProgressBar success message="Complete!" />
 * ```
 *
 * @component
 */
import { computed } from 'vue'
import type { ProgressBarProps, ProgressBarEmits } from './types'

defineOptions({
  name: 'TxProgressBar',
})

const props = withDefaults(defineProps<ProgressBarProps>(), {
  loading: false,
  error: false,
  success: false,
  message: '',
  percentage: 0,
  height: '5px',
  showText: false,
  color: '',
})

const emit = defineEmits<ProgressBarEmits>()

/**
 * Computed style variables for the progress bar.
 */
const styleVars = computed(() => {
  const vars: Record<string, string> = {
    '--tx-progress-height': props.height,
  }

  if (props.color) {
    vars['--tx-progress-color'] = props.color
  }

  if (!props.loading && props.percentage !== undefined) {
    vars['--tx-progress-width'] = `${Math.min(100, Math.max(0, props.percentage))}%`
  }

  return vars
})

/**
 * Computed class list for the progress bar.
 */
const classList = computed(() => ({
  'tx-progress-bar--loading': props.loading,
  'tx-progress-bar--error': props.error,
  'tx-progress-bar--success': props.success,
  'tx-progress-bar--determinate': !props.loading && props.percentage !== undefined,
}))

/**
 * Formatted percentage text.
 */
const percentageText = computed(() => {
  return `${Math.round(props.percentage || 0)}%`
})
</script>

<template>
  <div class="tx-progress-bar-wrapper" :style="styleVars">
    <div
      class="tx-progress-bar"
      :class="classList"
      role="progressbar"
      :aria-valuenow="loading ? undefined : percentage"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-label="message || 'Progress'"
    >
      <span v-if="message || showText" class="tx-progress-bar__text">
        {{ message || percentageText }}
      </span>
    </div>
  </div>
</template>

<style lang="scss">
@keyframes tx-progress-loading {
  0% {
    left: -100%;
    width: 0;
  }
  50% {
    width: 50%;
  }
  100% {
    left: 100%;
    width: 100%;
  }
}

.tx-progress-bar-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
}

.tx-progress-bar {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: var(--tx-progress-width, 100%);
  height: var(--tx-progress-height, 5px);
  border-radius: 8px;
  background-color: var(--tx-progress-color, var(--tx-color-primary, #409eff));
  transition: all 0.25s ease;

  &__text {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
  }

  &--loading {
    position: relative;
    width: 100%;
    animation: tx-progress-loading 1.25s infinite ease-in-out;
  }

  &--error {
    height: 30px;
    border-radius: 0;
    background-color: var(--tx-progress-color, var(--tx-color-danger, #f56c6c));
  }

  &--success {
    height: 8px;
    border-radius: 0;
    background-color: var(--tx-progress-color, var(--tx-color-success, #67c23a));
  }

  &--determinate {
    transition: width 0.3s ease;
  }
}
</style>
