<script setup lang="ts" name="TuffItemPreviewer">
import { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import { ImagePreview, VideoPreview, AudioPreview, TextPreview, DefaultPreview } from './preview'

const props = defineProps<{
  item: TuffItem
}>()

const getFileType = (filePath: string): 'image' | 'video' | 'audio' | 'text' | 'default' => {
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (!extension) return 'default'

  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
    return 'image'
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(extension)) {
    return 'video'
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(extension)) {
    return 'audio'
  }
  if (['txt', 'md', 'json', 'xml', 'csv'].includes(extension)) {
    return 'text'
  }
  return 'default'
}

const previewComponent = computed(() => {
  const filePath = props.item.meta?.file?.path
  if (!filePath) return DefaultPreview

  const fileType = getFileType(filePath)

  switch (fileType) {
    case 'image':
      return ImagePreview
    case 'video':
      return VideoPreview
    case 'audio':
      return AudioPreview
    case 'text':
      return TextPreview
    default:
      return DefaultPreview
  }
})
</script>

<template>
  <div class="TuffItemPreviewer">
    <TouchScroll class="h-full w-full">
      <div class="preview-area">
        <component :is="previewComponent" :item="item" />
      </div>
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-semibold mb-4">Information</h3>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div class="font-semibold">Source</div>
          <div>{{ item?.source.id }}</div>
          <div class="font-semibold">Content type</div>
          <div>{{ item?.kind }}</div>
          <div class="font-semibold">Characters</div>
          <div>{{ item?.render.basic?.title.length }}</div>
          <div class="font-semibold">Words</div>
          <div>{{ item?.render.basic?.title.split(' ').length }}</div>
          <div class="font-semibold">File Size</div>
          <div>{{ item?.meta?.file?.size }} bytes</div>
          <div class="font-semibold">Created At</div>
          <div>{{ item?.meta?.file?.created_at }}</div>
          <div class="font-semibold">Modified At</div>
          <div>{{ item?.meta?.file?.modified_at }}</div>
        </div>
      </div></TouchScroll
    >
  </div>
</template>

<style lang="scss" scoped>
.TuffItemPreviewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  border-radius: 8px;
  background-color: var(--el-bg-color-page);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);

  .preview-area {
    flex: 1;
    overflow: auto;
  }
}
</style>
