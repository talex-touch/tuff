<script lang="ts" setup>
import { computed } from 'vue'

defineOptions({
  name: 'TuffProgress',
})

const props = withDefaults(
  defineProps<{
    percentage?: number
    status?: 'success' | 'error' | 'warning' | ''
    strokeWidth?: number
    showText?: boolean
    indeterminate?: boolean
    format?: (percentage: number) => string
  }>(),
  {
    percentage: 0,
    status: '',
    strokeWidth: 6,
    showText: true,
    indeterminate: false,
  }
)

const barStyle = computed(() => ({
  width: props.indeterminate ? '' : `${props.percentage}%`,
  height: `${props.strokeWidth}px`,
}))

const displayText = computed(() => {
  if (props.format) {
    return props.format(props.percentage)
  }
  return `${props.percentage}%`
})
</script>

<template>
  <div class="tuff-progress">
    <div class="tx-progress__bar">
      <div class="tx-progress__track" :style="{ height: `${strokeWidth}px` }">
        <div
          :class="[
            'tx-progress__inner',
            {
              'is-indeterminate': indeterminate,
              [`is-${status}`]: status,
            },
          ]"
          :style="barStyle"
        />
      </div>
    </div>
    <span v-if="showText && !indeterminate" class="tx-progress__text">
      {{ displayText }}
    </span>
  </div>
</template>

<style lang="scss" scoped>
@keyframes tuff-progress-indeterminate {
  0% {
    left: -100%;
    width: 50%;
  }
  100% {
    left: 100%;
    width: 50%;
  }
}

.tuff-progress {
  display: flex;
  align-items: center;
  width: 100%;

  &__bar {
    flex: 1;
    margin-right: 8px;
  }

  &__track {
    position: relative;
    width: 100%;
    border-radius: 100px;
    background-color: var(--tx-fill-color, #f0f2f5);
    overflow: hidden;
  }

  &__inner {
    position: relative;
    height: 100%;
    border-radius: 100px;
    background-color: var(--tx-color-primary, #409eff);
    transition: width 0.3s ease;

    &.is-indeterminate {
      animation: tuff-progress-indeterminate 1.5s infinite ease-in-out;
    }

    &.is-success {
      background-color: var(--tx-color-success, #67c23a);
    }

    &.is-error {
      background-color: var(--tx-color-danger, #f56c6c);
    }

    &.is-warning {
      background-color: var(--tx-color-warning, #e6a23c);
    }
  }

  &__text {
    min-width: 36px;
    font-size: 12px;
    color: var(--tx-text-color-regular, #606266);
    text-align: right;
  }
}
</style>
