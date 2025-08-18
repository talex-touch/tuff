<script setup lang="ts" name="VideoPreview">
import { TuffItem } from '@talex-touch/utils'

const props = defineProps<{
  item: TuffItem
}>()
</script>

<template>
  <div class="VideoPreview">
    <video :src="`tfile://${item.meta?.file?.path}`" controls />
  </div>
</template>

<style lang="scss" scoped>
.VideoPreview {
  width: 100%;
  height: 100%;

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}
</style>
