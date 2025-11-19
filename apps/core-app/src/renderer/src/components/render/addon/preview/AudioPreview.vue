<script setup lang="ts" name="AudioPreview">
import type { TuffItem } from '@talex-touch/utils'

defineProps<{
  item: TuffItem
}>()

function handleError(e: Event): void {
  console.error('Audio load error:', e)
}
</script>

<template>
  <div class="AudioPreview">
    <audio :src="`tfile://${item.meta?.file?.path}`" muted autoplay controls @error="handleError" />
  </div>
</template>

<style lang="scss" scoped>
.AudioPreview {
  width: 100%;
  height: 100%;

  audio {
    width: 100%;
  }
}
</style>
