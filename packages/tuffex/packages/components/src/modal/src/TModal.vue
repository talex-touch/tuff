<script lang="ts" setup>
import TxModal from './TxModal.vue'

defineOptions({
  name: 'TModal',
})

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
  'update:modelValue': [value: boolean]
  'close': []
}>()
</script>

<template>
  <TxModal
    v-bind="$attrs"
    :model-value="props.modelValue"
    :title="props.title"
    :width="props.width"
    @update:model-value="v => emit('update:modelValue', v)"
    @close="() => emit('close')"
  >
    <template #header>
      <slot name="header" />
    </template>

    <slot />

    <template #footer>
      <slot name="footer" />
    </template>
  </TxModal>
</template>
