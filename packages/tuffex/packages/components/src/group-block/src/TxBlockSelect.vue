<script setup lang="ts">
/**
 * TxBlockSelect Component
 *
 * A block container with icon, title, description, and an integrated select control.
 * Based on TxBlockSlot with TxSelect integration.
 *
 * @example
 * ```vue
 * <TxBlockSelect
 *   v-model="selected"
 *   title="Language"
 *   description="Choose your preferred language"
 *   default-icon="i-carbon-language"
 * >
 *   <TxSelectItem value="en" label="English" />
 *   <TxSelectItem value="zh" label="中文" />
 * </TxBlockSelect>
 * ```
 *
 * @component
 */
import type { TxIconSource } from '../../icon'
import { computed } from 'vue'
import TxSelect from '../../select/src/TxSelect.vue'
import TxBlockSlot from './TxBlockSlot.vue'

type IconValue = TxIconSource | string | null | undefined

defineOptions({
  name: 'TxBlockSelect',
})

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  modelValue?: string | number
  defaultIcon?: IconValue
  activeIcon?: IconValue
  disabled?: boolean
  placeholder?: string
  /** @deprecated Use defaultIcon instead. */
  icon?: string
}>(), {
  title: '',
  description: '',
  disabled: false,
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'change': [value: string | number]
}>()

const value = computed({
  get: () => props.modelValue ?? '',
  set: (val: string | number) => {
    emit('update:modelValue', val)
    emit('change', val)
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
</script>

<template>
  <TxBlockSlot
    class="tx-block-select"
    :title="title"
    :description="description"
    :default-icon="resolvedDefaultIcon"
    :active-icon="resolvedActiveIcon"
    :active="isActive"
    :disabled="disabled"
  >
    <template #tags>
      <slot name="tags" />
    </template>
    <TxSelect
      v-model="value"
      :placeholder="placeholder"
      :disabled="disabled"
      class="tx-block-select__select"
    >
      <slot />
    </TxSelect>
  </TxBlockSlot>
</template>

<style lang="scss">
.tx-block-select {
  .tx-block-select__select {
    width: 180px;
    min-width: 120px;
    flex-shrink: 0;
  }
}
</style>
