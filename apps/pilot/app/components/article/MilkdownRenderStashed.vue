<script setup lang="ts">
import MilkdownRender from '~/components/article/MilkdownRender.vue'

defineProps<{
  content: string
  readonly: boolean
}>()
</script>

<template>
  <MilkdownRender :content="content" :readonly="readonly" />
</template>
