<script setup lang="ts">
import { TxModal } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
  }>(),
  {
    title: '',
    width: '480px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()
</script>

<template>
  <TxModal
    :model-value="modelValue"
    :title="title"
    :width="width"
    v-bind="$attrs"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @close="() => emit('close')"
  >
    <slot />
    <template #header>
      <slot name="header" />
    </template>
    <template #footer>
      <slot name="footer" />
    </template>
  </TxModal>
</template>
