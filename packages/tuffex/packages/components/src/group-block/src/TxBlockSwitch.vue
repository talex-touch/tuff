<script setup lang="ts">
import type { BlockSwitchEmits, BlockSwitchProps } from './types'
/**
 * TxBlockSwitch Component
 *
 * A block container with icon, title, description, and an integrated switch control.
 * Supports guidance mode for navigation items.
 *
 * @example
 * ```vue
 * <TxBlockSwitch
 *   v-model="enabled"
 *   title="Notifications"
 *   description="Enable push notifications"
 *   icon="i-carbon-notification"
 * />
 * ```
 *
 * @component
 */
import { computed } from 'vue'

defineOptions({
  name: 'TxBlockSwitch',
})

const props = withDefaults(defineProps<BlockSwitchProps>(), {
  disabled: false,
  guidance: false,
})

const emit = defineEmits<BlockSwitchEmits>()

/**
 * Two-way binding for the switch value.
 */
const value = computed({
  get: () => props.modelValue,
  set: (val: boolean) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

/**
 * Toggles the switch value.
 */
function toggle(): void {
  if (!props.disabled && !props.guidance) {
    value.value = !value.value
  }
}
</script>

<template>
  <div
    class="tx-block-switch"
    :class="{ 'tx-block-switch--disabled': disabled }"
  >
    <div class="tx-block-switch__content" @click="toggle">
      <i v-if="icon" :class="icon" class="tx-block-switch__icon" aria-hidden="true" />
      <div class="tx-block-switch__label">
        <h3 class="tx-block-switch__title">
          {{ title }}
        </h3>
        <p class="tx-block-switch__description">
          {{ description }}
        </p>
      </div>
    </div>

    <!-- Switch control -->
    <div v-if="!guidance" class="tx-block-switch__control">
      <button
        type="button"
        role="switch"
        :aria-checked="value"
        :disabled="disabled"
        class="tx-block-switch__toggle"
        :class="{ 'tx-block-switch__toggle--active': value }"
        @click="toggle"
      >
        <span class="tx-block-switch__thumb" />
      </button>
    </div>

    <!-- Guidance arrow -->
    <div v-else class="tx-block-switch__guidance">
      <i class="i-ri-arrow-right-s-line" aria-hidden="true" />
    </div>
  </div>
</template>

<style lang="scss">
.tx-block-switch {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 4px 16px;
  width: 100%;
  height: 56px;
  user-select: none;
  border-radius: 12px;
  box-sizing: border-box;
  background: var(--tx-fill-color-light, #f5f7fa);
  transition: background-color 0.25s ease;

  &:hover {
    background: var(--tx-fill-color, #f0f2f5);
  }

  &--disabled {
    .tx-block-switch__control {
      opacity: 0.5;
      pointer-events: none;
    }
  }

  &__content {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    cursor: pointer;
    gap: 16px;
  }

  &__icon {
    font-size: 24px;
    color: var(--tx-text-color-primary, #303133);
  }

  &__label {
    flex: 1;
  }

  &__title {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--tx-text-color-primary, #303133);
  }

  &__description {
    margin: 0;
    font-size: 12px;
    font-weight: 400;
    opacity: 0.5;
    color: var(--tx-text-color-secondary, #909399);
  }

  &__control {
    display: flex;
    align-items: center;
  }

  &__toggle {
    position: relative;
    width: 44px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 12px;
    background: var(--tx-border-color, #dcdfe6);
    cursor: pointer;
    transition: all 0.25s ease;

    &:hover {
      box-shadow: 0 0 16px 1px var(--tx-color-primary-light-3, #79bbff);
    }

    &:active .tx-block-switch__thumb {
      transform: scale(0.85);
    }

    &--active {
      background: var(--tx-color-primary, #409eff);

      .tx-block-switch__thumb {
        left: calc(100% - 20px);
        filter: brightness(2);
      }
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: var(--tx-text-color-secondary, #909399);
    transition: all 0.25s ease;
  }

  &__guidance {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 32px;
    height: 32px;
    font-size: 20px;
    color: var(--tx-text-color-secondary, #909399);
  }
}
</style>
