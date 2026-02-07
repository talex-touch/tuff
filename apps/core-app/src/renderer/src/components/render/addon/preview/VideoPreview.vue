<script setup lang="ts" name="VideoPreview">
import type { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  item: TuffItem
}>()

const videoSrc = computed(() => buildTfileUrl(props.item.meta?.file?.path ?? ''))
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

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}
</style>
