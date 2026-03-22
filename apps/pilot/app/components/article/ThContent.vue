<script setup lang="ts">
import { normalizeLooseMarkdownForRender } from '@talex-touch/tuff-intelligence/pilot-conversation'
import MilkContent from '~/components/article/MilkContent.vue'

const props = defineProps<{
  modelValue: string
  readonly: boolean
}>()

const emits = defineEmits<{
  (event: 'update:modelValue', data: string): void
}>()

const model = useVModel(props, 'modelValue', emits)
const normalizedModel = computed(() => normalizeLooseMarkdownForRender(model.value))
</script>

<template>
  <MilkContent :content="normalizedModel" :disable-rich="true" :sticky-code-header="false" />
</template>

<style lang="scss">
</style>
