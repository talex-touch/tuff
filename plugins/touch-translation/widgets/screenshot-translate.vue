<script setup lang="ts">
import { computed } from 'vue'
import ImageTranslateResult from './image-translate-result.vue'
import TranslatePanel from './translate-panel.vue'

const props = defineProps<{
  item: any
  payload?: Record<string, unknown>
}>()

const isImageTranslation = computed(() => props.payload?.mode === 'image-translation')
</script>

<template>
  <ImageTranslateResult v-if="isImageTranslation" :payload="payload" />
  <TranslatePanel v-else :item="item" :payload="payload" />
</template>
