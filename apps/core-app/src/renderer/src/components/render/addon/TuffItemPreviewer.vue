<script setup lang="ts" name="TuffItemPreviewer">
import type { TuffItem } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { buildTfileUrl } from '~/utils/tfile-url'
import {
  AudioPreview,
  CodePreview,
  DefaultPreview,
  ImagePreview,
  MarkdownPreview,
  TextPreview,
  VideoPreview
} from './preview'

const props = defineProps<{
  item: TuffItem
  searchQuery?: string
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null

type FilePreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'markdown'
  | 'text'
  | 'pdf'
  | 'archive'
  | 'document'
  | 'default'

const CODE_EXTENSIONS = new Set([
  'json',
  'yaml',
  'yml',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'ini',
  'conf',
  'toml'
])

function getFileType(filePath: string): FilePreviewType {
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
  if (extension === 'md') {
    return 'markdown'
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return 'code'
  }
  if (['txt', 'xml', 'csv', 'log', 'html', 'htm', 'env', 'sh', 'bat', 'ps1'].includes(extension)) {
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
    case 'code':
      return CodePreview
    case 'markdown':
      return MarkdownPreview
    case 'text':
      return TextPreview
    default:
      return DefaultPreview
  }
})

const RESOURCE_PREVIEW_TYPES = new Set<FilePreviewType>([
  'image',
  'video',
  'audio',
  'code',
  'markdown',
  'text'
])
const previewResourceUrl = ref('')
const previewResourceReady = ref(false)
let previewRequestVersion = 0

watch(
  () => props.item.meta?.file?.path,
  async (filePath) => {
    const requestVersion = ++previewRequestVersion
    previewResourceUrl.value = ''
    previewResourceReady.value = false

    if (!filePath || !RESOURCE_PREVIEW_TYPES.has(getFileType(filePath))) {
      previewResourceReady.value = true
      return
    }

    if (!isElectronRenderer() || !transport) {
      previewResourceUrl.value = buildTfileUrl(filePath)
      previewResourceReady.value = true
      return
    }

    try {
      const result = await transport.send(AppEvents.fileIndex.previewResource, { path: filePath })
      if (requestVersion !== previewRequestVersion) return
      if (result.success && result.tfileUrl) {
        previewResourceUrl.value = result.tfileUrl
      }
    } catch {
      if (requestVersion === previewRequestVersion) previewResourceUrl.value = ''
    } finally {
      if (requestVersion === previewRequestVersion) previewResourceReady.value = true
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="TuffItemPreviewer">
    <TxScroll class="h-full w-full">
      <div class="preview-area max-h-[60%]">
        <DefaultPreview v-if="previewComponent === DefaultPreview" :item="item" />
        <component
          :is="previewComponent"
          v-else-if="previewResourceReady && previewResourceUrl"
          :key="`${item.id}:${previewResourceUrl}`"
          :item="item"
          :resource-url="previewResourceUrl"
          :search-query="searchQuery"
        />
        <DefaultPreview v-else-if="previewResourceReady" :item="item" />
      </div>
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold mb-4">
          {{ t('fileInfo.title') }}
        </h3>
        <div class="text-xs space-y-2">
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.path') }}
            </div>
            <div class="w-[65%] break-all">
              {{ item?.meta?.file?.path }}
            </div>
          </div>
          <div
            class="flex border-b justify-between gap-2 border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.source') }}
            </div>
            <div class="w-[65%]">
              {{ item?.source.id }}
            </div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.contentType') }}
            </div>
            <div class="w-[65%]">
              {{ item?.meta?.file?.mime_type }}
            </div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.fileSize') }}
            </div>
            <div class="w-[65%]">{{ item?.meta?.file?.size || 0 }} {{ t('fileInfo.bytes') }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.createdAt') }}
            </div>
            <div class="w-[65%]">
              {{ item?.meta?.file?.created_at || '-' }}
            </div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.modifiedAt') }}
            </div>
            <div class="w-[65%]">
              {{ item?.meta?.file?.modified_at || '-' }}
            </div>
          </div>
        </div>
      </div>
    </TxScroll>
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
