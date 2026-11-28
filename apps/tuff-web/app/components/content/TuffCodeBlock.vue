<script setup lang="ts">
import TuffCodeBlockRenderer from './TuffCodeBlockRenderer.vue'

const props = withDefaults(defineProps<{
  code: string
  codeHtml?: string
  lang?: string
  title?: string
  embedded?: boolean
}>(), {
  codeHtml: '',
  lang: 'vue',
  title: '',
  embedded: false,
})
</script>

<template>
  <TuffCodeBlockRenderer v-bind="props" />
</template>
