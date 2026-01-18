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
  if (props.defaultIcon !== undefined)
    return props.defaultIcon
  return props.icon
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
        <span
          v-if="loading"
          class="tx-block-switch__loader i-ri-loader-4-line animate-spin"
          aria-hidden="true"
        />
        <TuffSwitch v-model="value" :disabled="disabled || loading" @change="handleChange" />
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

.tx-block-switch__loader {
  font-size: 18px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-block-switch__guidance {
  font-size: 18px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
