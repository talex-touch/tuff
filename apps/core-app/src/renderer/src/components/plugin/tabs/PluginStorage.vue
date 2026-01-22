<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { StorageStats } from '@talex-touch/utils/types/storage'
import { TxButton, TxProgressBar } from '@talex-touch/tuffex'
import { ElMessageBox } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TouchScroll from '~/components/base/TouchScroll.vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

const emit = defineEmits<{
  (event: 'scroll', info: { scrollTop: number; scrollLeft: number }): void
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
const storagePath = ref('')
const storagePathFull = ref('')

interface StorageEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: number
}

type StorageTreeNode = StorageEntry & { children?: StorageTreeNode[] }

const entries = ref<StorageEntry[]>([])

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

function shortenPath(fullPath: string): string {
  if (!fullPath) return ''
  const parts = fullPath.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 3) return fullPath
  return `.../${parts.slice(-3).join('/')}/`
}

async function loadStoragePath(): Promise<void> {
  try {
    const paths = await pluginSDK.getPaths(props.plugin.name)
    storagePathFull.value = paths?.configPath ?? ''
    storagePath.value = storagePathFull.value ? shortenPath(storagePathFull.value) : ''
  } catch (error) {
    console.warn('[PluginStorage] Failed to load storage path:', error)
    storagePath.value = ''
    storagePathFull.value = ''
  }
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
      entries.value = flattenTree(treeResponse)
    }
  } catch (error) {
    console.error('Failed to load storage data:', error)
    toast.error(t('plugin.storage.message.loadFailed'))
  } finally {
    loading.value = false
  }
}

function flattenTree(nodes: StorageTreeNode[]): StorageEntry[] {
  const items: StorageEntry[] = []

  function traverse(nodeList: StorageTreeNode[]) {
    for (const node of nodeList) {
      const type = node.type === 'directory' ? 'directory' : 'file'
      items.push({
        name: node.name,
        path: node.path,
        type,
        size: node.size || 0,
        modified: node.modified || Date.now()
      })
      if (node.children && Array.isArray(node.children)) {
        traverse(node.children)
      }
    }
  }

  traverse(nodes)
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
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

function getEntryIcon(entry: StorageEntry): string {
  if (entry.type === 'directory') return 'i-ri-folder-2-line'
  return getFileIcon(entry.name)
}

function getEntryColor(entry: StorageEntry): string {
  if (entry.type === 'directory') return 'var(--el-color-warning)'
  return getFileColor(entry.name)
}

function getEntryTypeLabel(entry: StorageEntry): string {
  if (entry.type === 'directory') return 'DIR'
  const ext = entry.name.split('.').pop()?.toUpperCase()
  return ext || 'FILE'
}

async function handleOpenInEditor(): Promise<void> {
  try {
    await window.$channel.send('plugin:storage:open-in-editor', {
      pluginName: props.plugin.name
    })
  } catch (error) {
    console.error('Failed to open in editor:', error)
    toast.error(t('plugin.storage.message.openEditorFailed'))
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
      toast.success(t('plugin.storage.message.clearSuccess'))
      await refreshData()
    } else {
      toast.error(response.error || t('plugin.storage.message.clearFailed'))
    }
  } catch (error) {
    if (error !== 'cancel') {
      toast.error(t('plugin.storage.message.clearFailed'))
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
    toast.error(t('plugin.storage.message.openFolderFailed'))
  }
}

async function refreshData(): Promise<void> {
  await loadStorageData()
}

// Lifecycle
onMounted(() => {
  loadStorageData()
  loadStoragePath()
})

watch(
  () => props.plugin.name,
  () => {
    entries.value = []
    loadStorageData()
    loadStoragePath()
  }
)
</script>

<template>
  <div class="PluginStorage w-full h-full flex flex-col gap-6">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="PluginStorage-StatCard">
        <div
          class="PluginStorage-StatIcon bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300"
        >
          <i class="i-ri-database-2-line" />
        </div>
        <div class="min-w-0">
          <div class="PluginStorage-StatValue">
            {{ loading ? '--' : toMB(storageStats.totalSize || 0) }}
          </div>
          <div class="PluginStorage-StatLabel">STORAGE (MB)</div>
        </div>
      </div>
      <div class="PluginStorage-StatCard">
        <div
          class="PluginStorage-StatIcon bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300"
        >
          <i class="i-ri-file-2-line" />
        </div>
        <div class="min-w-0">
          <div class="PluginStorage-StatValue">
            {{ loading ? '--' : String(storageStats.fileCount || 0) }}
          </div>
          <div class="PluginStorage-StatLabel">TOTAL FILES</div>
        </div>
      </div>
      <div class="PluginStorage-StatCard">
        <div
          class="PluginStorage-StatIcon bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300"
        >
          <i class="i-ri-folder-2-line" />
        </div>
        <div class="min-w-0">
          <div class="PluginStorage-StatValue">
            {{ loading ? '--' : String(storageStats.dirCount || 0) }}
          </div>
          <div class="PluginStorage-StatLabel">DIRECTORIES</div>
        </div>
      </div>
      <div class="PluginStorage-StatCard">
        <div
          class="PluginStorage-StatIcon bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300"
        >
          <i class="i-ri-pie-chart-2-line" />
        </div>
        <div class="min-w-0">
          <div class="PluginStorage-StatValue" :class="usageColorClass">
            {{ loading ? '--' : (storageStats.usagePercent || 0).toFixed(1) }}%
          </div>
          <div class="PluginStorage-StatLabel">USAGE RATE</div>
        </div>
      </div>
    </div>

    <div class="PluginStorage-Card flex-1 overflow-hidden flex flex-col">
      <div class="PluginStorage-CardHeader flex items-center justify-between">
        <div class="flex items-center gap-2 min-w-0">
          <i class="i-ri-folder-5-line text-xl text-[var(--el-color-primary)]" />
          <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">Storage Files</h3>
          <span v-if="storagePath" class="PluginStorage-Path" :title="storagePathFull">
            {{ storagePath }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <TxButton
            size="small"
            type="primary"
            plain
            icon="i-ri-refresh-line"
            :loading="loading"
            @click="refreshData"
          >
            Refresh
          </TxButton>
          <TxButton
            size="small"
            plain
            icon="i-ri-edit-line"
            :disabled="loading"
            @click="handleOpenInEditor"
          >
            Open in Editor
          </TxButton>
          <TxButton
            size="small"
            plain
            icon="i-ri-folder-open-line"
            :disabled="loading"
            @click="handleOpenFolder"
          >
            Open Folder
          </TxButton>
          <TxButton
            size="small"
            type="danger"
            plain
            icon="i-ri-delete-bin-2-line"
            :loading="clearing"
            :disabled="loading"
            @click="handleClearStorage"
          >
            Clear All
          </TxButton>
        </div>
      </div>

      <div class="flex-1 mt-4 overflow-hidden">
        <div
          v-if="loading"
          class="h-full flex items-center justify-center text-sm text-[var(--el-text-color-secondary)]"
        >
          <i class="i-ri-loader-4-line animate-spin mr-2" />
          {{ t('plugin.storage.actions.refresh') }}...
        </div>

        <div
          v-else-if="entries.length === 0"
          class="PluginStorage-Empty h-full flex items-center justify-center border border-dashed border-[var(--el-border-color-lighter)] rounded-2xl"
        >
          <div class="flex flex-col items-center text-center px-6">
            <div class="PluginStorage-EmptyIcon">
              <i class="i-ri-inbox-archive-line" />
            </div>
            <div class="text-sm font-semibold text-[var(--el-text-color-primary)]">
              No storage files found
            </div>
            <div class="text-xs text-[var(--el-text-color-secondary)] mt-1">
              Start using the plugin to generate data
            </div>
          </div>
        </div>

        <div v-else class="h-full flex flex-col overflow-hidden">
          <div class="PluginStorage-TableHeader">
            <div>NAME</div>
            <div>TYPE</div>
            <div>SIZE</div>
            <div>LAST MODIFIED</div>
            <div class="text-right">ACTIONS</div>
          </div>
          <TouchScroll no-padding class="flex-1" @scroll="emit('scroll', $event)">
            <div class="divide-y divide-[var(--el-border-color-lighter)]">
              <div v-for="entry in entries" :key="entry.path" class="PluginStorage-Row">
                <div class="flex items-center gap-3 min-w-0">
                  <i
                    class="text-lg"
                    :class="getEntryIcon(entry)"
                    :style="{ color: getEntryColor(entry) }"
                  />
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-[var(--el-text-color-primary)] truncate">
                      {{ entry.name }}
                    </div>
                    <div class="text-xs text-[var(--el-text-color-secondary)] truncate">
                      {{ entry.path }}
                    </div>
                  </div>
                </div>
                <div class="text-xs text-[var(--el-text-color-secondary)]">
                  {{ getEntryTypeLabel(entry) }}
                </div>
                <div class="text-xs text-[var(--el-text-color-secondary)]">
                  {{ entry.type === 'directory' ? '--' : formatSize(entry.size) }}
                </div>
                <div class="text-xs text-[var(--el-text-color-secondary)]">
                  {{ formatDate(entry.modified) }}
                </div>
                <div class="text-xs text-right text-[var(--el-text-color-secondary)]">--</div>
              </div>
            </div>
          </TouchScroll>
        </div>
      </div>

      <div
        class="PluginStorage-Footer flex items-center justify-between mt-4 pt-3 border-t border-[var(--el-border-color-lighter)]"
      >
        <div class="flex items-center gap-3 text-xs text-[var(--el-text-color-secondary)]">
          <span class="flex items-center gap-1">
            <i class="i-ri-checkbox-circle-fill text-[var(--el-color-success)] text-[10px]" />
            Service Ready
          </span>
          <span>UTF-8</span>
        </div>
        <div class="flex items-center gap-3 text-xs text-[var(--el-text-color-secondary)]">
          <span>
            Space: {{ (storageStats.usagePercent || 0).toFixed(1) }}% /
            {{ formatSize(storageStats.maxSize) }}
          </span>
          <TxProgressBar
            class="w-36"
            :percentage="storageStats.usagePercent"
            height="6px"
            indicator-effect="sparkle"
            hover-effect="glow"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.PluginStorage-StatCard {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 16px;
  min-height: 92px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.PluginStorage-StatIcon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 22px;
  }
}

.PluginStorage-StatValue {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.1;
}

.PluginStorage-StatLabel {
  margin-top: 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
  opacity: 0.8;
}

.PluginStorage-Card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 24px;
}

.PluginStorage-Path {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  padding: 4px 10px;
  border-radius: 999px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PluginStorage-EmptyIcon {
  width: 76px;
  height: 76px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;

  i {
    font-size: 32px;
    color: var(--el-text-color-secondary);
    opacity: 0.6;
  }
}

.PluginStorage-TableHeader {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr 0.6fr;
  gap: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.PluginStorage-Row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr 0.6fr;
  gap: 12px;
  padding: 12px;
  align-items: center;
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
