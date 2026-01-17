<script name="UnifiedFileTag" setup lang="ts">
import path from 'path-browserify'
import { computed } from 'vue'

/**
 * Unified file tag component that handles both FILE mode and clipboard files
 * Uses ClipboardFileTag's visual style for consistency
 */
const props = defineProps<{
  /** Direct file paths (FILE mode) */
  paths?: string[] | null
  /** Icon path for FILE mode */
  iconPath?: string | null
  /** Clipboard data object (clipboard files) */
  clipboardData?: any | null
}>()

/**
 * Validate if a string is a valid file path
 * Filters out IDs, placeholders, and malformed paths
 */
function isValidFilePath(str: string): boolean {
  if (!str || typeof str !== 'string') return false

  // Reject file IDs and placeholders
  if (str.includes('file/id=') || str.includes('/.file/id=')) return false

  // Must be an absolute path or valid relative path
  const trimmed = str.trim()
  return trimmed.length > 0 && !trimmed.includes('/id=')
}

/**
 * Unified file paths from either source
 */
const filePaths = computed(() => {
  // Priority 1: Direct paths (FILE mode)
  if (props.paths && props.paths.length > 0) {
    return props.paths.filter(isValidFilePath)
  }

  // Priority 2: Parse clipboard data
  if (props.clipboardData?.content) {
    try {
      const parsed = JSON.parse(props.clipboardData.content)
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidFilePath)
      }
    } catch (error) {
      console.error('[UnifiedFileTag] Failed to parse clipboard file data:', error)
    }
  }

  return []
})

/**
 * Total file count
 */
const fileCount = computed(() => filePaths.value.length)

/**
 * First file name for display
 */
const firstFileName = computed(() => {
  if (filePaths.value.length === 0) return '文件准备中...'
  return path.basename(filePaths.value[0])
})

/**
 * File icon using tfile:// protocol
 */
const fileIconUrl = computed(() => {
  // Priority 1: Explicit icon path (for FILE mode)
  if (props.iconPath && isValidFilePath(props.iconPath)) {
    return `tfile://${props.iconPath}`
  }

  // Priority 2: First file path
  if (filePaths.value.length > 0) {
    return `tfile://${filePaths.value[0]}`
  }

  return null
})

/**
 * Whether files are still loading/unavailable
 */
const isLoading = computed(() => {
  return fileCount.value === 0 && (props.paths !== null || props.clipboardData !== null)
})

/**
 * Thumbnail from clipboard data (for video files, etc.)
 */
const thumbnail = computed(() => {
  return props.clipboardData?.thumbnail || null
})
</script>

<template>
  <div class="UnifiedFileTag" :class="{ loading: isLoading }">
    <div class="icon-container">
      <!-- Priority 1: Clipboard thumbnail (for videos) -->
      <img
        v-if="thumbnail && !isLoading"
        :src="thumbnail"
        class="file-icon thumbnail"
        alt="file thumbnail"
      />
      <!-- Priority 2: File icon via tfile:// protocol -->
      <img
        v-else-if="fileIconUrl && !isLoading"
        :src="fileIconUrl"
        class="file-icon"
        alt="file icon"
      />
      <!-- Priority 3: Fallback icon -->
      <i v-else class="ri-file-line file-icon-fallback" />
    </div>
    <span class="name">{{ firstFileName }}</span>
    <span v-if="fileCount > 1" class="badge">{{ fileCount }}</span>
  </div>
</template>

<style lang="scss" scoped>
.UnifiedFileTag {
  position: relative;
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  align-items: center;
  border-radius: 8px;
  background: var(--el-fill-color-light);

  &.loading {
    opacity: 0.6;

    .name {
      font-style: italic;
      color: var(--el-text-color-secondary);
    }
  }

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
