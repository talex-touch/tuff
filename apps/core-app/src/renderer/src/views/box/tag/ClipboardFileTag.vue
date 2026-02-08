<script name="ClipboardFileTag" setup lang="ts">
import { computed } from 'vue'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  data: { content: string } // clipboard data with files
}>()

// Parse file paths
const filePaths = computed(() => {
  try {
    return JSON.parse(props.data.content) as string[]
  } catch {
    return []
  }
})

const fileCount = computed(() => filePaths.value.length)

// Get first file name
const firstFileName = computed(() => {
  if (filePaths.value.length === 0) return ''
  const path = filePaths.value[0]
  return path.split(/[\\/]/).pop() || path
})

// Use tfile:// protocol for file icon
const fileIconUrl = computed(() => {
  if (filePaths.value.length === 0) return null
  return buildTfileUrl(filePaths.value[0])
})
</script>

<template>
  <div class="ClipboardFileTag">
    <div class="icon-container">
      <img v-if="fileIconUrl" :src="fileIconUrl" class="file-icon" alt="file icon" />
      <i v-else class="ri-file-line file-icon-fallback" />
    </div>
    <span class="name">{{ firstFileName }}</span>
    <span v-if="fileCount > 1" class="badge">{{ fileCount }}</span>
  </div>
</template>

<style lang="scss" scoped>
.ClipboardFileTag {
  position: relative;
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  align-items: center;
  border-radius: 8px;
  background: var(--el-fill-color-light);

  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .file-icon {
    height: 28px;
    width: 28px;
    object-fit: contain;
  }

  .file-icon-fallback {
    font-size: 28px;
    color: var(--el-text-color-secondary);
  }

  .name {
    flex: 1;
    font-size: 14px;
    color: var(--el-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }

  .badge {
    display: flex;
    padding: 0 0.5rem;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 22px;
    border-radius: 11px;
    background-color: var(--el-color-primary);
    color: white;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }
}
</style>
