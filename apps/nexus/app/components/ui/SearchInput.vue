<script setup lang="ts">
import { computed } from 'vue'
import { TxSearchInput } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
    remote?: boolean
    searchDebounce?: number
  }>(),
  {
    modelValue: '',
    placeholder: 'Search',
    disabled: false,
    clearable: true,
    remote: false,
    searchDebounce: 200,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'input', value: string): void
  (e: 'search', value: string): void
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
  <TxSearchInput
    v-model="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :clearable="clearable"
    :remote="remote"
    :search-debounce="searchDebounce"
    v-bind="$attrs"
    @search="(v) => emit('search', v)"
    @focus="(e) => emit('focus', e)"
    @blur="(e) => emit('blur', e)"
    @clear="() => emit('clear')"
  />
</template>