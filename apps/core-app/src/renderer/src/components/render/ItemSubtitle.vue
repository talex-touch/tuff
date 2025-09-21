<script setup lang="ts">
import { TuffItem, TuffRender } from '@talex-touch/utils'
import { computed } from 'vue'
import dayjs from 'dayjs'

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

  const parts: string[] = []
  if (file.kind) {
    parts.push(file.kind)
  }
  if (file.size) {
    parts.push(formatBytes(file.size))
  }
  if (file.lastModified) {
    parts.push(dayjs(file.lastModified).format('YYYY/MM/DD HH:mm'))
  }

  return parts.join(' · ')
})
</script>

<template>
  <p class="text-xs opacity-60 truncate max-w-[90%]">
    <template v-if="fileInfo">
      {{ fileInfo }}
    </template>
    <template v-else>
      {{ render.basic?.subtitle }}
    </template>
  </p>
</template>