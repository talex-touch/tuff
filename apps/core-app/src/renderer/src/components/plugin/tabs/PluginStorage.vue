<template>
  <div class="PluginStorage w-full h-full flex flex-col space-y-6">
    <!-- Storage Overview -->
    <div class="PluginStorage-Overview">
      <!-- Skeleton for stats cards -->
      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          v-for="i in 4"
          :key="i"
          class="bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border-[var(--el-border-color-lighter)] rounded-2xl p-6 h-32"
        >
          <el-skeleton animated>
            <template #template>
              <div class="flex items-center gap-4">
                <el-skeleton-item variant="circle" style="width: 60px; height: 60px" />
                <div class="flex-1">
                  <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 8px" />
                  <el-skeleton-item variant="text" style="width: 40%" />
                </div>
              </div>
            </template>
          </el-skeleton>
        </div>
      </div>

      <!-- Real stats cards -->
      <div v-else class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          :value="formatSize(storageStats.totalSize)"
          label="Total Storage"
          icon-class="i-ri-database-line text-6xl text-[var(--el-color-primary)]"
        />
        <StatCard
          :value="String(storageStats.fileCount)"
          label="Files"
          icon-class="i-ri-file-line text-6xl text-[var(--el-color-success)]"
        />
        <StatCard
          :value="String(storageStats.dirCount)"
          label="Directories"
          icon-class="i-ri-folder-line text-6xl text-[var(--el-color-info)]"
        />
        <StatCard
          :value="`${storageStats.usagePercent.toFixed(1)}%`"
          :label="`Usage (${formatSize(storageStats.maxSize)} limit)`"
          :icon-class="`i-ri-pie-chart-line text-6xl ${usageColorClass}`"
        />
      </div>
    </div>

    <!-- Storage Info Card -->
    <div
      class="flex-1 PluginStorage-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border-[var(--el-border-color-lighter)] rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-6"
    >
      <div class="text-6xl">
        <i class="i-ri-folder-2-line text-[var(--el-color-primary)]" />
      </div>
      <div class="space-y-2">
        <h3 class="text-2xl font-semibold text-[var(--el-text-color-primary)]">
          Plugin Storage Directory
        </h3>
        <p class="text-[var(--el-text-color-secondary)] max-w-md">
          This plugin is using {{ formatSize(storageStats.totalSize) }} of storage space with {{ storageStats.fileCount }} files and {{ storageStats.dirCount }} directories.
        </p>
      </div>
      <div class="flex gap-3">
        <el-button type="primary" @click="handleOpenFolder">
          <i class="i-ri-folder-open-line" />
          Open in File Manager
        </el-button>
        <el-button @click="handleOpenInEditor">
          <i class="i-ri-edit-line" />
          Open in Editor
        </el-button>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="PluginStorage-Actions flex flex-wrap gap-3">
      <button
        class="PluginStorage-ActionButton bg-[var(--el-color-danger-light-9)] text-[var(--el-color-danger)] border border-[var(--el-color-danger-light-8)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        :disabled="clearing"
        @click="handleClearStorage"
      >
        <i v-if="!clearing" class="i-ri-delete-bin-line" />
        <i v-else class="i-ri-loader-4-line animate-spin" />
        {{ clearing ? 'Clearing...' : 'Clear All Storage' }}
      </button>
      <button
        class="PluginStorage-ActionButton bg-[var(--el-fill-color-light)] text-[var(--el-text-color-primary)] border border-[var(--el-border-color-lighter)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="handleOpenFolder"
      >
        <i class="i-ri-folder-open-line" />
        Open Storage Folder
      </button>
      <button
        class="PluginStorage-ActionButton bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)] border border-[var(--el-color-primary-light-8)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="refreshData"
      >
        <i class="i-ri-refresh-line" />
        Refresh Data
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { StorageStats } from '@talex-touch/utils/types/storage'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import StatCard from '../../base/card/StatCard.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// State
const loading = ref(false)
const clearing = ref(false)
const storageStats = ref<StorageStats>({
  totalSize: 0,
  fileCount: 0,
  dirCount: 0,
  maxSize: 10 * 1024 * 1024,
  usagePercent: 0
})

// Computed
const usageColorClass = computed(() => {
  const percent = storageStats.value.usagePercent
  if (percent >= 90) return 'text-[var(--el-color-danger)]'
  if (percent >= 70) return 'text-[var(--el-color-warning)]'
  return 'text-[var(--el-color-success)]'
})

// Methods
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

async function loadStorageData(): Promise<void> {
  loading.value = true
  try {
    // Get stats
    const statsResponse = await window.$channel.send('plugin:storage:get-stats', {
      pluginName: props.plugin.name
    })
    console.log('Storage stats response:', statsResponse)
    if (statsResponse && typeof statsResponse === 'object') {
      storageStats.value = {
        totalSize: statsResponse.totalSize || 0,
        fileCount: statsResponse.fileCount || 0,
        dirCount: statsResponse.dirCount || 0,
        maxSize: statsResponse.maxSize || (10 * 1024 * 1024),
        usagePercent: statsResponse.usagePercent || 0
      }
    }
  } catch (error) {
    console.error('Failed to load storage data:', error)
    ElMessage.error('Failed to load storage data')
  } finally {
    loading.value = false
  }
}

async function handleOpenInEditor(): Promise<void> {
  try {
    await window.$channel.send('plugin:storage:open-in-editor', {
      pluginName: props.plugin.name
    })
  } catch (error) {
    console.error('Failed to open in editor:', error)
    ElMessage.error('Failed to open storage folder in editor')
  }
}

async function handleClearStorage(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      'Are you sure you want to clear ALL storage for this plugin? This action cannot be undone and will delete all files and directories.',
      'Clear Storage',
      {
        confirmButtonText: 'Clear All',
        cancelButtonText: 'Cancel',
        type: 'error'
      }
    )

    clearing.value = true
    const response = await window.$channel.send('plugin:storage:clear', {
      pluginName: props.plugin.name
    })

    if (response.success) {
      ElMessage.success('Storage cleared successfully')
      await refreshData()
    } else {
      ElMessage.error(response.error || 'Failed to clear storage')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to clear storage:', error)
      ElMessage.error('Failed to clear storage')
    }
  } finally {
    clearing.value = false
  }
}

async function handleOpenFolder(): Promise<void> {
  try {
    await window.$channel.send('plugin:storage:open-folder', {
      pluginName: props.plugin.name
    })
  } catch (error) {
    console.error('Failed to open folder:', error)
    ElMessage.error('Failed to open storage folder')
  }
}

async function refreshData(): Promise<void> {
  await loadStorageData()
}

// Lifecycle
onMounted(() => {
  loadStorageData()
})
</script>

<style lang="scss" scoped>
.PluginStorage-ProgressBar {
  transition: width 0.3s ease;
}

.PluginStorage-ActionButton {
  transition: all 0.2s ease;

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
