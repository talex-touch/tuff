<script setup lang="ts">
import { TuffItem, TuffRender } from '@talex-touch/utils'
import { computed } from 'vue'
import { getFileTypeFromPath } from '@talex-touch/utils'
import dayjs from 'dayjs'
import path from 'path-browserify'

const props = defineProps<{
  item: TuffItem
  render: TuffRender
}>()

const sourceType = computed(() => props.item.source.type)

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

const fileInfo = computed(() => {
  if (sourceType.value !== 'file' && props.item.kind !== 'file') {
    return null
  }
  const meta = props.item.meta as any
  const file = meta?.file
  if (!file) return null

  return file
})
</script>

<template>
  <p class="text-xs opacity-60 truncate max-w-[90%]">
    <template v-if="fileInfo">
      <div class="flex items-center w-full overflow-hidden gap-x-1.5">
        <span>
          {{ getFileTypeFromPath(fileInfo.path) }}
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
