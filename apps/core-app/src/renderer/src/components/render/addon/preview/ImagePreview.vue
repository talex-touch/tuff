<script setup lang="ts" name="ImagePreview">
import { TuffItem } from '@talex-touch/utils'

defineProps<{
  item: TuffItem
}>()
</script>

<template>
  <div class="ImagePreview">
    <img :src="`tfile://${item.meta?.file?.path}`" />
  </div>
</template>

<style lang="scss" scoped>
.ImagePreview {
  width: 100%;
  height: 100%;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}
</style>
