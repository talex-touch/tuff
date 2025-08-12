<script setup lang="ts" name="TuffItemPreviewer">
import { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import {
  ImagePreview,
  VideoPreview,
  AudioPreview,
  TextPreview,
  DefaultPreview,
  IconPreview
} from './preview'

const props = defineProps<{
  item: TuffItem
}>()

const getFileType = (
  filePath: string
): 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'archive' | 'document' | 'default' => {
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
  if (['txt', 'md', 'json', 'xml', 'csv', 'log'].includes(extension)) {
    return 'text'
  }
  if (['pdf'].includes(extension)) {
    return 'pdf'
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return 'archive'
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
    return 'document'
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
      <div class="preview-area max-h-[60%]">
        <component :is="previewComponent" :item="item" />
      </div>
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold mb-4">Information</h3>
        <div class="text-xs space-y-2">
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Path</div>
            <div class="w-[65%] break-all">{{ item?.meta?.file?.path }}</div>
          </div>
          <div
            class="flex border-b justify-between gap-2 border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Source</div>
            <div class="w-[65%]">{{ item?.source.id }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Content type</div>
            <div class="w-[65%]">{{ item?.meta?.file?.mime_type }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Characters</div>
            <div class="w-[65%]">{{ item?.render.basic?.title?.length || 0 }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Words</div>
            <div class="w-[65%]">{{ item?.render.basic?.title.split(' ').length || 0 }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">File Size</div>
            <div class="w-[65%]">{{ item?.meta?.file?.size || 0 }} bytes</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Created At</div>
            <div class="w-[65%]">{{ item?.meta?.file?.created_at || '-' }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">Modified At</div>
            <div class="w-[65%]">{{ item?.meta?.file?.modified_at || '-' }}</div>
          </div>
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
  padding: 0.5rem;

  .preview-area {
    flex-shrink: 0;
    max-height: 70%;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;

    & > :deep(img),
    & > :deep(video) {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  }
}
</style>
