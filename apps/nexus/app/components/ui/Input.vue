<script setup lang="ts">
import { TuffInput } from '@talex-touch/tuffex'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    type?: 'text' | 'password' | 'textarea'
    disabled?: boolean
    readonly?: boolean
    clearable?: boolean
    rows?: number
  }>(),
  {
    modelValue: '',
    placeholder: '',
    type: 'text',
    disabled: false,
    readonly: false,
    clearable: false,
    rows: 3,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'input', value: string): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
  (e: 'clear'): void
}>()

const value = computed({
  get: () => props.modelValue ?? '',
  set: (val: string) => {
    emit('update:modelValue', val)
    emit('input', val)
  },
})
</script>

<template>
  <TuffInput
    v-model="value"
    :placeholder="placeholder"
    :type="type"
    :disabled="disabled"
    :readonly="readonly"
    :clearable="clearable"
    :rows="rows"
    v-bind="$attrs"
    @focus="(e) => emit('focus', e)"
    @blur="(e) => emit('blur', e)"
    @clear="() => emit('clear')"
  >
    <template #prefix>
      <slot name="prefix" />
    </template>
    <template #suffix>
      <slot name="suffix" />
    </template>
  </TuffInput>
</template>
