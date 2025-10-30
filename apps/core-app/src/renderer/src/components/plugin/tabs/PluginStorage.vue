<template>
  <div class="PluginStorage w-full h-full flex flex-col space-y-6">
    <!-- Storage Overview -->
    <div class="PluginStorage-Overview">
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

      <div v-else class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          :value="toMB(storageStats.totalSize || 0)"
          :label="`${t('plugin.storage.stats.totalStorage')} (MB)`"
          icon-class="i-ri-database-line text-6xl text-[var(--el-color-primary)]"
        />
        <StatCard
          :value="String(storageStats.fileCount || 0)"
          :label="t('plugin.storage.stats.files')"
          icon-class="i-ri-file-line text-6xl text-[var(--el-color-success)]"
        />
        <StatCard
          :value="String(storageStats.dirCount || 0)"
          :label="t('plugin.storage.stats.directories')"
          icon-class="i-ri-folder-line text-6xl text-[var(--el-color-info)]"
        />
        <StatCard
          :value="(storageStats.usagePercent || 0).toFixed(2)"
          :label="`${t('plugin.storage.stats.usage')} (%)`"
          :icon-class="`i-ri-pie-chart-line text-6xl ${usageColorClass}`"
        />
      </div>
    </div>

    <!-- File List -->
    <div
      class="flex-1 PluginStorage-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border-[var(--el-border-color-lighter)] rounded-2xl p-6 overflow-hidden flex flex-col"
    >
      <div class="PluginStorage-CardHeader flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <i class="i-ri-file-list-line text-xl text-[var(--el-color-primary)]" />
          <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">
            {{ t('plugin.storage.title') }}
          </h3>
        </div>
        <div class="flex gap-2">
          <el-button size="small" type="primary" plain @click="refreshData">
            <i class="i-ri-refresh-line" />
            {{ t('plugin.storage.actions.refresh') }}
          </el-button>
          <el-button size="small" @click="handleOpenInEditor">
            <i class="i-ri-edit-line" />
            {{ t('plugin.storage.actions.openInEditor') }}
          </el-button>
          <el-button size="small" @click="handleOpenFolder">
            <i class="i-ri-folder-open-line" />
            {{ t('plugin.storage.actions.openFolder') }}
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :loading="clearing"
            @click="handleClearStorage"
          >
            <i v-if="!clearing" class="i-ri-delete-bin-line" />
            {{
              clearing ? t('plugin.storage.actions.clearing') : t('plugin.storage.actions.clearAll')
            }}
          </el-button>
        </div>
      </div>

      <div v-if="loading" class="flex-1 space-y-2">
        <el-skeleton animated>
          <template #template>
            <div
              v-for="i in 6"
              :key="i"
              class="flex items-center gap-3 px-3 py-3 bg-[var(--el-fill-color-light)] rounded-lg"
            >
              <el-skeleton-item variant="circle" style="width: 32px; height: 32px" />
              <div class="flex-1">
                <el-skeleton-item variant="text" style="width: 70%; margin-bottom: 6px" />
                <el-skeleton-item variant="text" style="width: 40%" />
              </div>
              <el-skeleton-item variant="text" style="width: 60px" />
            </div>
          </template>
        </el-skeleton>
      </div>

      <div
        v-else-if="!loading && fileList.length === 0"
        class="flex-1 flex items-center justify-center"
      >
        <el-empty :description="t('plugin.storage.empty')" />
      </div>

      <div v-else class="flex-1 overflow-auto space-y-2">
        <div
          v-for="file in fileList"
          :key="file.path"
          class="flex items-center gap-3 px-3 py-3 bg-[var(--el-fill-color-light)] hover:bg-[var(--el-fill-color)] rounded-lg cursor-pointer transition-colors"
        >
          <i
            class="text-2xl"
            :class="getFileIcon(file.name)"
            :style="{ color: getFileColor(file.name) }"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-[var(--el-text-color-primary)] truncate">
              {{ file.name }}
            </div>
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              {{ formatDate(file.modified) }}
            </div>
          </div>
          <div class="text-sm text-[var(--el-text-color-secondary)]">
            {{ formatSize(file.size) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { StorageStats } from '@talex-touch/utils/types/storage'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import StatCard from '../../base/card/StatCard.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Composables
const { t } = useI18n()

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
const fileList = ref<
  Array<{
    name: string
    path: string
    size: number
    modified: number
  }>
>([])

// Computed
const usageColorClass = computed(() => {
  const percent = storageStats.value.usagePercent
  if (percent >= 90) return 'text-[var(--el-color-danger)]'
  if (percent >= 70) return 'text-[var(--el-color-warning)]'
  return 'text-[var(--el-color-success)]'
})

// Methods
function toMB(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '0.00'
  return (bytes / (1024 * 1024)).toFixed(2)
}

function formatSize(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function loadStorageData(): Promise<void> {
  loading.value = true
  try {
    const [statsResponse, treeResponse] = await Promise.all([
      window.$channel.send('plugin:storage:get-stats', { pluginName: props.plugin.name }),
      window.$channel.send('plugin:storage:get-tree', { pluginName: props.plugin.name })
    ])

    if (statsResponse && typeof statsResponse === 'object') {
      storageStats.value = {
        totalSize: Number(statsResponse.totalSize) || 0,
        fileCount: Number(statsResponse.fileCount) || 0,
        dirCount: Number(statsResponse.dirCount) || 0,
        maxSize: Number(statsResponse.maxSize) || 10 * 1024 * 1024,
        usagePercent: Number(statsResponse.usagePercent) || 0
      }
    }

    if (treeResponse && Array.isArray(treeResponse)) {
      fileList.value = flattenTree(treeResponse)
    }
  } catch (error) {
    console.error('Failed to load storage data:', error)
    ElMessage.error(t('plugin.storage.message.loadFailed'))
  } finally {
    loading.value = false
  }
}

function flattenTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: any[]
): Array<{ name: string; path: string; size: number; modified: number }> {
  const files: Array<{ name: string; path: string; size: number; modified: number }> = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function traverse(nodeList: any[]) {
    for (const node of nodeList) {
      if (node.type === 'file') {
        files.push({
          name: node.name,
          path: node.path,
          size: node.size || 0,
          modified: node.modified || Date.now()
        })
      }
      if (node.children && Array.isArray(node.children)) {
        traverse(node.children)
      }
    }
  }

  traverse(nodes)
  return files
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    json: 'i-ri-file-code-line',
    log: 'i-ri-file-text-line',
    txt: 'i-ri-file-text-line',
    md: 'i-ri-markdown-line',
    png: 'i-ri-image-line',
    jpg: 'i-ri-image-line',
    jpeg: 'i-ri-image-line',
    gif: 'i-ri-image-line',
    webp: 'i-ri-image-line',
    svg: 'i-ri-image-line'
  }
  return iconMap[ext || ''] || 'i-ri-file-line'
}

function getFileColor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const colorMap: Record<string, string> = {
    json: 'var(--el-color-success)',
    log: 'var(--el-color-info)',
    txt: 'var(--el-color-info)',
    md: 'var(--el-color-info)',
    png: 'var(--el-color-primary)',
    jpg: 'var(--el-color-primary)',
    jpeg: 'var(--el-color-primary)',
    gif: 'var(--el-color-primary)',
    webp: 'var(--el-color-primary)',
    svg: 'var(--el-color-primary)'
  }
  return colorMap[ext || ''] || 'var(--el-text-color-secondary)'
}

async function handleOpenInEditor(): Promise<void> {
  try {
    await window.$channel.send('plugin:storage:open-in-editor', {
      pluginName: props.plugin.name
    })
  } catch (error) {
    console.error('Failed to open in editor:', error)
    ElMessage.error(t('plugin.storage.message.openEditorFailed'))
  }
}

async function handleClearStorage(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('plugin.storage.confirm.clearMessage'),
      t('plugin.storage.confirm.clearTitle'),
      {
        confirmButtonText: t('plugin.storage.confirm.clearConfirm'),
        cancelButtonText: t('plugin.storage.confirm.cancel'),
        type: 'error'
      }
    )

    clearing.value = true
    const response = await window.$channel.send('plugin:storage:clear', {
      pluginName: props.plugin.name
    })

    if (response.success) {
      ElMessage.success(t('plugin.storage.message.clearSuccess'))
      await refreshData()
    } else {
      ElMessage.error(response.error || t('plugin.storage.message.clearFailed'))
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(t('plugin.storage.message.clearFailed'))
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
  } catch {
    ElMessage.error(t('plugin.storage.message.openFolderFailed'))
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
