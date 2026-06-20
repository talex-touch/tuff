<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const props = withDefaults(defineProps<{
  code: string
  lang?: string
  title?: string
  embedded?: boolean
}>(), {
  lang: 'vue',
  title: '',
  embedded: false,
})

const LazyTuffCodeBlockRenderer = defineAsyncComponent(() => import('./TuffCodeBlockRenderer.vue'))
</script>

<template>
  <LazyTuffCodeBlockRenderer v-bind="props" />
</template>
