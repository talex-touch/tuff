<script setup lang="ts">
import TranslatePanel from './translate-panel.vue'

defineProps<{
  item: any
  payload?: Record<string, unknown>
}>()
</script>

<template>
  <TranslatePanel :item="item" :payload="payload" />
</template>
