<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import Milkdown from '~/components/article/MilkdownRender.vue'

const props = defineProps<{
  modelValue: string
  readonly: boolean
}>()

const emits = defineEmits<{
  (event: 'update:modelValue', data: string): void
}>()

const model = useVModel(props, 'modelValue', emits)
</script>

<template>
  <ProsemirrorAdapterProvider>
    <MilkdownProvider>
      <Milkdown :content="model" :readonly="readonly" />
    </MilkdownProvider>
  </ProsemirrorAdapterProvider>
</template>

<style lang="scss">
</style>
