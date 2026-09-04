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
 *   default-icon="i-carbon-notification"
 * />
 * ```
 *
 * @component
 */
import { computed } from 'vue'
import TuffSwitch from '../../switch'
import TxBlockSlot from './TxBlockSlot.vue'

defineOptions({
  name: 'TxBlockSwitch',
})

const props = withDefaults(defineProps<BlockSwitchProps>(), {
  disabled: false,
  guidance: false,
  loading: false,
})

const emit = defineEmits<BlockSwitchEmits>()

const value = computed({
  get: () => props.modelValue,
  set: (val: boolean) => {
    emit('update:modelValue', val)
  },
})

const isActive = computed(() => !!value.value)

const resolvedDefaultIcon = computed(() => {
  return props.defaultIcon
})

const resolvedActiveIcon = computed(() => {
  if (props.activeIcon !== undefined)
    return props.activeIcon
  return undefined
})

function handleChange(val: boolean): void {
  emit('change', val)
}

function handleClick(event: MouseEvent): void {
  if (props.guidance)
    emit('click', event)
}
</script>

<template>
  <TxBlockSlot
    class="tx-block-switch"
    :class="{ 'tx-block-switch--loading': loading, 'tx-block-switch--disabled': disabled }"
    :title="title"
    :description="description"
    :default-icon="resolvedDefaultIcon"
    :active-icon="resolvedActiveIcon"
    :active="isActive"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <template #tags>
      <slot name="tags" />
    </template>
    <template v-if="!guidance">
      <div class="tx-block-switch__actions">
        <!-- The switch owns the busy affordance (thumb -> ring); the row only
             adds the shimmer, so there is no second spinner beside it. -->
        <TuffSwitch
          v-model="value"
          :disabled="disabled"
          :loading="loading"
          @change="handleChange"
        />
      </div>
    </template>
    <template v-else>
      <i class="tx-block-switch__guidance i-carbon-chevron-right" aria-hidden="true" />
    </template>
  </TxBlockSlot>
</template>

<style lang="scss">
.tx-block-switch__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

// TxBlockSlot dims any `disabled` row to 0.5, and loading rows pass that flag in
// to freeze pointer events. A busy row is not a dead one though, so the dim is
// taken back here — the extra class beats the slot's own rule on specificity, so
// stylesheet order does not matter.
.tx-block-switch.tx-block-switch--loading:not(.tx-block-switch--disabled) {
  opacity: 1;
}

.tx-block-switch.tx-block-switch--loading::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.72;
  border-radius: var(--fake-radius, 12px);
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 0%,
    transparent 34%,
    color-mix(in srgb, var(--tx-color-white, #fff) 52%, transparent) 50%,
    transparent 66%,
    transparent 100%
  );
  background-size: 260% 100%;
  animation: tx-block-switch-loading-shimmer 1.35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes tx-block-switch-loading-shimmer {
  0% {
    background-position: 160% 0;
    opacity: 0;
  }

  18%,
  76% {
    opacity: 0.72;
  }

  100% {
    background-position: -160% 0;
    opacity: 0;
  }
}

.tx-block-switch__guidance {
  font-size: 18px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
