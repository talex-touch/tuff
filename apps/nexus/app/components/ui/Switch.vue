<script setup lang="ts">
import { computed } from 'vue'
import { TuffSwitch } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    size?: 'small' | 'default' | 'large'
  }>(),
  {
    modelValue: false,
    disabled: false,
    size: 'default',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

const value = computed({
  get: () => props.modelValue ?? false,
  set: (val: boolean) => emit('update:modelValue', val),
})
</script>

<template>
  <TuffSwitch
    v-model="value"
    :disabled="disabled"
    :size="size"
    v-bind="$attrs"
    @change="(v) => emit('change', v)"
  />
</template>