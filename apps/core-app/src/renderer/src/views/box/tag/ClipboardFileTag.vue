<script name="ClipboardFileTag" setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

const props = defineProps<{
  data: any // clipboard data with files
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

// Fetch icon for first file
const fileIcon = computed(() => {
  // We'll fetch this on mount
  return null
})

// Load file icon
const iconDataUrl = ref<string | null>(null)

onMounted(async () => {
  if (filePaths.value.length > 0) {
    try {
      const buffer = await touchChannel.send('file:extract-icon', {
        path: filePaths.value[0]
      })

      if (buffer) {
        const bytes = new Uint8Array(buffer)
        let storeData = ''
        for (let i = 0; i < bytes.length; i++) {
          storeData += String.fromCharCode(bytes[i])
        }
        iconDataUrl.value = 'data:image/png;base64,' + window.btoa(storeData)
      }
    } catch (error) {
      console.debug('Failed to load file icon:', error)
    }
  }
})
</script>

<template>
  <div class="ClipboardFileTag">
    <div class="icon-container">
      <img v-if="iconDataUrl" :src="iconDataUrl" class="file-icon" alt="file icon" />
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

