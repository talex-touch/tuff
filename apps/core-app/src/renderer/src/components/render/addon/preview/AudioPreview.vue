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
  /**
   * The host `.preview-area` is a fixed 280px stage, so filling it leaves the transport bar - the
   * only thing this preview draws - pinned to the top of a mostly empty box. Centring happens
   * here rather than on the stage because the stage already centres its item along both axes;
   * what it cannot do is centre content *inside* a child that was told to be full height.
   */
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;

  audio {
    width: 100%;
  }
}
</style>
