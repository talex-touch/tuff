<script setup lang="ts" name="VideoPreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'

const props = defineProps<{
  item: TuffItem
  resourceUrl: string
}>()

const videoSrc = computed(() => props.resourceUrl)
</script>

<template>
  <div class="VideoPreview">
    <video :src="videoSrc" controls />
  </div>
</template>

<style lang="scss" scoped>
.VideoPreview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  video {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }
}
</style>
