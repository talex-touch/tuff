<script setup lang="ts">
/**
 * TxBlockInput Component
 *
 * A block container with icon, title, description, and an integrated input control.
 * Based on TxBlockSlot with TxInput integration.
 *
 * @example
 * ```vue
 * <TxBlockInput
 *   v-model="username"
 *   title="Username"
 *   description="Enter your display name"
 *   placeholder="Type here..."
 *   default-icon="i-carbon-user"
 * />
 * ```
 *
 * @component
 */
import type { TxIconSource } from '../../icon'
import { computed, ref } from 'vue'
import TxInput from '../../input/src/TxInput.vue'
import TxBlockSlot from './TxBlockSlot.vue'

type IconValue = TxIconSource | string | null | undefined

defineOptions({
  name: 'TxBlockInput',
})

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  modelValue?: string | number
  defaultIcon?: IconValue
  activeIcon?: IconValue
  disabled?: boolean
  placeholder?: string
  clearable?: boolean
  inputType?: 'text' | 'password' | 'number' | 'email'
  /** @deprecated Use defaultIcon instead. */
  icon?: string
}>(), {
  title: '',
  description: '',
  disabled: false,
  placeholder: '',
  clearable: false,
  inputType: 'text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'input': [value: string | number]
  'focus': [event: FocusEvent]
  'blur': [event: FocusEvent]
}>()

const value = computed({
  get: () => props.modelValue ?? '',
  set: (val: string | number) => {
    emit('update:modelValue', val)
  },
})

const isFocused = ref(false)
const isActive = computed(() => isFocused.value)

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

function handleFocus(e: FocusEvent) {
  isFocused.value = true
  emit('focus', e)
}

function handleBlur(e: FocusEvent) {
  isFocused.value = false
  emit('blur', e)
}

function handleInput(val: string | number) {
  emit('input', val)
}
</script>

<template>
  <TxBlockSlot
    class="tx-block-input"
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
    <slot name="control" :value="value" :focused="isFocused">
      <TxInput
        v-model="value"
        :type="inputType"
        :placeholder="placeholder"
        :disabled="disabled"
        :clearable="clearable"
        class="tx-block-input__input"
        @focus="handleFocus"
        @blur="handleBlur"
        @input="handleInput"
      />
    </slot>
  </TxBlockSlot>
</template>

<style lang="scss">
.tx-block-input {
  .tx-block-input__input {
    width: 180px;
    min-width: 120px;
    flex-shrink: 0;
  }
}
</style>
