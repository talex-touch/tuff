<script setup lang="ts" name="AudioPreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'

const props = defineProps<{
  item: TuffItem
  resourceUrl: string
}>()

const audioPreviewLog = createRendererLogger('AudioPreview')
const audioSrc = computed(() => props.resourceUrl)

function handleError(e: Event): void {
  audioPreviewLog.error('Audio load error:', e)
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
