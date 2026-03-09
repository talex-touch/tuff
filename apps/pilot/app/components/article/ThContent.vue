<script setup lang="ts">
import MilkContent from '~/components/article/MilkContent.vue'

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
  <MilkContent :content="model" :disable-rich="true" />
</template>

<style lang="scss">
</style>
