<script setup lang="ts">
import { getFileTypeFromPath } from '@talex-touch/utils'
import type { FileType, TuffItem, TuffRender } from '@talex-touch/utils'
import dayjs from 'dayjs'
import path from 'path-browserify'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  item: TuffItem
  render: TuffRender
}>()

const sourceType = computed(() => props.item.source.type)

const { t } = useI18n()

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

const fileInfo = computed(() => {
  if (sourceType.value !== 'file' && props.item.kind !== 'file') {
    return null
  }
  const meta = props.item.meta as any
  const file = meta?.file
  if (!file)
    return null

  return file
})

const FILE_TYPE_META: Record<string, { icon: string, key: string }> = {
  'Image': { icon: 'i-ri-image-2-line', key: 'coreBox.fileTypes.image' },
  'Document': { icon: 'i-ri-file-text-line', key: 'coreBox.fileTypes.document' },
  'Audio': { icon: 'i-ri-music-2-line', key: 'coreBox.fileTypes.audio' },
  'Video': { icon: 'i-ri-video-line', key: 'coreBox.fileTypes.video' },
  'Archive': { icon: 'i-ri-archive-line', key: 'coreBox.fileTypes.archive' },
  'Code': { icon: 'i-ri-code-line', key: 'coreBox.fileTypes.code' },
  'Text': { icon: 'i-ri-file-list-3-line', key: 'coreBox.fileTypes.text' },
  'Design': { icon: 'i-ri-palette-line', key: 'coreBox.fileTypes.design' },
  '3D Model': { icon: 'i-ri-cube-line', key: 'coreBox.fileTypes.model3D' },
  'Font': { icon: 'i-ri-english-input', key: 'coreBox.fileTypes.font' },
  'Spreadsheet': { icon: 'i-ri-table-line', key: 'coreBox.fileTypes.spreadsheet' },
  'Presentation': { icon: 'i-ri-slideshow-line', key: 'coreBox.fileTypes.presentation' },
  'Ebook': { icon: 'i-ri-book-3-line', key: 'coreBox.fileTypes.ebook' },
  'Other': { icon: 'i-ri-more-2-line', key: 'coreBox.fileTypes.other' },
}

const fileTypeMeta = computed(() => {
  if (!fileInfo.value)
    return null
  const type = getFileTypeFromPath(fileInfo.value.path) as FileType
  const meta = FILE_TYPE_META[type] || FILE_TYPE_META['Other']
  const translated = t(meta.key)
  const label = translated === meta.key ? type : translated
  return {
    icon: meta.icon,
    label,
  }
})
</script>

<template>
  <p class="text-xs opacity-60 truncate max-w-[90%]">
    <template v-if="fileInfo">
      <div class="flex items-center w-full overflow-hidden gap-x-1.5">
        <span class="flex items-center gap-1">
          <i :class="fileTypeMeta?.icon" />
          <span>{{ fileTypeMeta?.label }}</span>
        </span>
        <span class="opacity-50">&bull;</span>
        <span>
          {{ formatBytes(fileInfo.size ?? 0) }}
        </span>
        <span class="opacity-50">&bull;</span>
        <span>
          {{ dayjs(fileInfo.modified_at).format('YYYY/M/D HH:mm') }}
        </span>
        <span class="opacity-50">&bull;</span>
        <span class="flex flex-1 items-center gap-1">
          <i class="i-carbon-folder" />
          <span class="w-full truncate">{{ path.dirname(fileInfo.path).split('/').pop() }}</span>
        </span>
      </div>
    </template>
    <template v-else>
      {{ render.basic?.subtitle }}
    </template>
  </p>
</template>
