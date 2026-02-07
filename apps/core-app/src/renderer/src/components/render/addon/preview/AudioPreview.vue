<script setup lang="ts" name="AudioPreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  item: TuffItem
}>()

const audioSrc = computed(() => buildTfileUrl(props.item.meta?.file?.path ?? ''))

function handleError(e: Event): void {
  console.error('Audio load error:', e)
}
</script>

<template>
  <div class="AudioPreview">
    <audio :src="audioSrc" muted autoplay controls @error="handleError" />
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
