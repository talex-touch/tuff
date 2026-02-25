<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { StorageStats } from '@talex-touch/utils/types/storage'
import {
  TxBottomDialog,
  TxButton,
  TxFlipOverlay,
  TxProgressBar,
  TxStatCard
} from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const emit = defineEmits<{
  (event: 'scroll', info: { scrollTop: number; scrollLeft: number }): void
}>()

const { t, locale } = useI18n()
const transport = useTuffTransport()

const loading = ref(false)
const clearing = ref(false)
const detailsVisible = ref(false)
const detailsSource = ref<HTMLElement | null>(null)
const storageStats = ref<StorageStats>({
  totalSize: 0,
  fileCount: 0,
  dirCount: 0,
  maxSize: 10 * 1024 * 1024,
  usagePercent: 0
})

interface PluginPaths {
  pluginPath: string
  dataPath: string
  configPath: string
  logsPath: string
  tempPath: string
}

const pluginPaths = ref<PluginPaths | null>(null)

interface StorageEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: number
}

type StorageTreeNode = StorageEntry & { children?: StorageTreeNode[] }
type PluginPathType = 'plugin' | 'data' | 'config' | 'logs'

const entries = ref<StorageEntry[]>([])

const usageColorClass = computed(() => {
  const percent = storageStats.value.usagePercent
  if (percent >= 90) return 'text-[var(--tx-color-danger)]'
  if (percent >= 70) return 'text-[var(--tx-color-warning)]'
  return 'text-[var(--tx-color-success)]'
})

const storagePathFull = computed(() => pluginPaths.value?.configPath ?? '')
const storagePath = computed(() =>
  storagePathFull.value ? getDisplayPath('config', storagePathFull.value) : ''
)

const pathItems = computed(() => [
  {
    key: 'pluginPath',
    titleKey: 'plugin.storage.configuration.pluginPath',
    defaultIcon: 'i-carbon-folder-details',
    pathType: 'plugin' as PluginPathType,
    path: pluginPaths.value?.pluginPath ?? ''
  },
  {
    key: 'dataPath',
    titleKey: 'plugin.storage.configuration.dataDirectory',
    defaultIcon: 'i-carbon-data-base',
    pathType: 'data' as PluginPathType,
    path: pluginPaths.value?.dataPath ?? ''
  },
  {
    key: 'configPath',
    titleKey: 'plugin.storage.configuration.configDirectory',
    defaultIcon: 'i-carbon-settings',
    pathType: 'config' as PluginPathType,
    path: pluginPaths.value?.configPath ?? ''
  },
  {
    key: 'logsPath',
    titleKey: 'plugin.storage.configuration.logsDirectory',
    defaultIcon: 'i-carbon-document',
    pathType: 'logs' as PluginPathType,
    path: pluginPaths.value?.logsPath ?? ''
  }
])

function toMB(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '0.00'
  return (bytes / (1024 * 1024)).toFixed(2)
}

function formatSize(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getAliasPath(pathType: PluginPathType): string {
  if (pathType === 'plugin') return '~/'
  if (pathType === 'data') return '~/data/'
  if (pathType === 'config') return '~/data/config/'
  if (pathType === 'logs') return '~/data/logs/'
  return '~/'
}

function getDisplayPath(pathType: PluginPathType, fullPath: string): string {
  if (!fullPath) return '...'
  return getAliasPath(pathType)
}

async function loadPluginPaths(): Promise<void> {
  try {
    pluginPaths.value = await pluginSDK.getPaths(props.plugin.name)
  } catch (error) {
    console.warn('[PluginStorage] Failed to load plugin paths:', error)
    pluginPaths.value = null
  }
}

async function loadStorageData(): Promise<void> {
  loading.value = true
  try {
    const [statsResponse, treeResponse] = await Promise.all([
      transport.send(PluginEvents.storage.getStats, { pluginName: props.plugin.name }),
      transport.send(PluginEvents.storage.getTree, { pluginName: props.plugin.name })
    ])

    if (statsResponse && typeof statsResponse === 'object') {
      const stats = statsResponse as Partial<StorageStats>
      storageStats.value = {
        totalSize: Number(stats.totalSize) || 0,
        fileCount: Number(stats.fileCount) || 0,
        dirCount: Number(stats.dirCount) || 0,
        maxSize: Number(stats.maxSize) || 10 * 1024 * 1024,
        usagePercent: Number(stats.usagePercent) || 0
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
  return date.toLocaleString(locale.value || undefined)
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
    json: 'var(--tx-color-success)',
    log: 'var(--tx-color-info)',
    txt: 'var(--tx-color-info)',
    md: 'var(--tx-color-info)',
    png: 'var(--tx-color-primary)',
    jpg: 'var(--tx-color-primary)',
    jpeg: 'var(--tx-color-primary)',
    gif: 'var(--tx-color-primary)',
    webp: 'var(--tx-color-primary)',
    svg: 'var(--tx-color-primary)'
  }
  return colorMap[ext || ''] || 'var(--tx-text-color-secondary)'
}

function getEntryIcon(entry: StorageEntry): string {
  if (entry.type === 'directory') return 'i-ri-folder-2-line'
  return getFileIcon(entry.name)
}

function getEntryColor(entry: StorageEntry): string {
  if (entry.type === 'directory') return 'var(--tx-color-warning)'
  return getFileColor(entry.name)
}

function getEntryTypeLabel(entry: StorageEntry): string {
  if (entry.type === 'directory') return t('plugin.storage.table.directoryTag')
  const ext = entry.name.split('.').pop()?.toUpperCase()
  return ext || t('plugin.storage.table.fileTag')
}

async function handleOpenInEditor(): Promise<void> {
  try {
    await transport.send(PluginEvents.storage.openInEditor, {
      pluginName: props.plugin.name
    })
  } catch (error) {
    console.error('Failed to open in editor:', error)
    toast.error(t('plugin.storage.message.openEditorFailed'))
  }
}

const clearConfirmVisible = ref(false)

function requestClearStorage(): void {
  clearConfirmVisible.value = true
}

function closeClearConfirm(): void {
  clearConfirmVisible.value = false
}

async function confirmClearStorage(): Promise<boolean> {
  clearing.value = true
  try {
    const response = await transport.send(PluginEvents.storage.clear, {
      pluginName: props.plugin.name
    })

    if (response.success) {
      toast.success(t('plugin.storage.message.clearSuccess'))
      await refreshData()
    } else {
      toast.error(response.error || t('plugin.storage.message.clearFailed'))
    }
  } catch {
    toast.error(t('plugin.storage.message.clearFailed'))
  } finally {
    clearing.value = false
  }
  return true
}

async function handleClearStorage(): Promise<void> {
  requestClearStorage()
}

async function handleOpenFolder(): Promise<void> {
  try {
    await transport.send(PluginEvents.storage.openFolder, {
      pluginName: props.plugin.name
    })
  } catch {
    toast.error(t('plugin.storage.message.openFolderFailed'))
  }
}

async function openPath(pathType: PluginPathType): Promise<void> {
  const result = await pluginSDK.openPath(props.plugin.name, pathType)
  if (!result.success) {
    toast.error(t('plugin.storage.message.openPathFailed'))
  }
}

function openStorageDetails(event?: MouseEvent): void {
  if (event?.currentTarget instanceof HTMLElement) {
    detailsSource.value = event.currentTarget
  }
  detailsVisible.value = true
}

async function refreshData(): Promise<void> {
  await loadStorageData()
  await loadPluginPaths()
}

onMounted(() => {
  void loadStorageData()
  void loadPluginPaths()
})

watch(
  () => props.plugin.name,
  () => {
    entries.value = []
    detailsVisible.value = false
    void loadStorageData()
    void loadPluginPaths()
  }
)
</script>

<template>
  <div class="PluginStorage w-full h-full min-h-0 flex flex-col gap-6">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <TxStatCard
        :value="loading ? '--' : toMB(storageStats.totalSize || 0)"
        :label="t('plugin.storage.stats.totalStorageMb')"
        icon-class="i-ri-database-2-line text-6xl text-[var(--tx-color-primary)]"
      >
        <template #value>
          <span>{{ loading ? '--' : toMB(storageStats.totalSize || 0) }}</span>
        </template>
      </TxStatCard>

      <TxStatCard
        :value="loading ? '--' : String(storageStats.fileCount || 0)"
        :label="t('plugin.storage.stats.totalFiles')"
        icon-class="i-ri-file-2-line text-6xl text-[var(--tx-color-success)]"
      >
        <template #value>
          <span>{{ loading ? '--' : String(storageStats.fileCount || 0) }}</span>
        </template>
      </TxStatCard>

      <TxStatCard
        :value="loading ? '--' : String(storageStats.dirCount || 0)"
        :label="t('plugin.storage.stats.directories')"
        icon-class="i-ri-folder-2-line text-6xl text-[var(--tx-color-warning)]"
      >
        <template #value>
          <span>{{ loading ? '--' : String(storageStats.dirCount || 0) }}</span>
        </template>
      </TxStatCard>

      <TxStatCard
        variant="progress"
        :value="loading ? '--' : `${(storageStats.usagePercent || 0).toFixed(1)}%`"
        :label="t('plugin.storage.stats.usageRate')"
        :progress="storageStats.usagePercent"
        :meta="
          t('plugin.storage.footer.space', {
            percent: (storageStats.usagePercent || 0).toFixed(1),
            maxSize: formatSize(storageStats.maxSize)
          })
        "
        icon-class="i-ri-pie-chart-2-line text-[var(--tx-color-primary)]"
      >
        <template #value>
          <span :class="usageColorClass">
            {{ loading ? '--' : `${(storageStats.usagePercent || 0).toFixed(1)}%` }}
          </span>
        </template>
      </TxStatCard>
    </div>

    <TuffGroupBlock
      :name="t('plugin.storage.configuration.title')"
      :description="t('plugin.storage.configuration.description')"
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder-open"
      memory-name="plugin-storage-config"
    >
      <TuffBlockSlot
        :title="t('plugin.storage.configuration.detailsTitle')"
        :description="t('plugin.storage.configuration.detailsDesc')"
        default-icon="i-carbon-data-table"
      >
        <TxButton variant="flat" icon="i-ri-information-2-line" @click.stop="openStorageDetails">
          {{ t('plugin.storage.actions.details') }}
        </TxButton>
      </TuffBlockSlot>

      <TuffBlockSlot
        v-for="item in pathItems"
        :key="item.key"
        :title="t(item.titleKey)"
        :default-icon="item.defaultIcon"
        @click="openPath(item.pathType)"
      >
        <template #label>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-medium">{{ t(item.titleKey) }}</span>
            <code class="PluginStorage-ConfigPath" :title="item.path">
              {{ getDisplayPath(item.pathType, item.path) }}
            </code>
          </div>
        </template>
        <TxButton
          variant="flat"
          class="PluginStorage-PathActionBtn"
          @click.stop="openPath(item.pathType)"
        >
          <i class="i-carbon-folder-open text-lg text-[var(--tx-color-primary)]" />
        </TxButton>
      </TuffBlockSlot>
    </TuffGroupBlock>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="detailsVisible"
        :source="detailsSource"
        :header-title="t('plugin.storage.details.title')"
        :header-desc="
          t('plugin.storage.details.description', {
            files: storageStats.fileCount || 0,
            directories: storageStats.dirCount || 0
          })
        "
      >
        <template #default>
          <div class="PluginStorageDetails-Panel">
            <div class="PluginStorageDetails-Body">
              <div class="PluginStorage-Card flex-1 min-h-0 overflow-hidden flex flex-col">
                <div class="PluginStorage-CardHeader flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <i class="i-ri-folder-5-line text-xl text-[var(--tx-color-primary)]" />
                    <h3 class="text-lg font-semibold text-[var(--tx-text-color-primary)]">
                      {{ t('plugin.storage.title') }}
                    </h3>
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
                      {{ t('plugin.storage.actions.refresh') }}
                    </TxButton>
                    <TxButton
                      size="small"
                      plain
                      icon="i-ri-edit-line"
                      :disabled="loading"
                      @click="handleOpenInEditor"
                    >
                      {{ t('plugin.storage.actions.openInEditor') }}
                    </TxButton>
                    <TxButton
                      size="small"
                      plain
                      icon="i-ri-folder-open-line"
                      :disabled="loading"
                      @click="handleOpenFolder"
                    >
                      {{ t('plugin.storage.actions.openFolder') }}
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
                      {{ t('plugin.storage.actions.clearAll') }}
                    </TxButton>
                  </div>
                </div>

                <div class="PluginStorageDetails-TableWrap mt-4 flex-1 min-h-0">
                  <div
                    v-if="loading"
                    class="h-full flex items-center justify-center text-sm text-[var(--tx-text-color-secondary)]"
                  >
                    <i class="i-ri-loader-4-line animate-spin mr-2" />
                    {{ t('plugin.storage.loading') }}
                  </div>

                  <div
                    v-else-if="entries.length === 0"
                    class="PluginStorage-Empty h-full flex items-center justify-center border border-dashed border-[var(--tx-border-color-lighter)] rounded-2xl"
                  >
                    <div class="flex flex-col items-center text-center px-6">
                      <div class="PluginStorage-EmptyIcon">
                        <i class="i-ri-inbox-archive-line" />
                      </div>
                      <div class="text-sm font-semibold text-[var(--tx-text-color-primary)]">
                        {{ t('plugin.storage.empty.title') }}
                      </div>
                      <div class="text-xs text-[var(--tx-text-color-secondary)] mt-1">
                        {{ t('plugin.storage.empty.description') }}
                      </div>
                    </div>
                  </div>

                  <div v-else class="h-full flex flex-col overflow-hidden">
                    <div class="PluginStorage-TableHeader">
                      <div>{{ t('plugin.storage.table.name') }}</div>
                      <div>{{ t('plugin.storage.table.type') }}</div>
                      <div>{{ t('plugin.storage.table.size') }}</div>
                      <div>{{ t('plugin.storage.table.lastModified') }}</div>
                      <div class="text-right">{{ t('plugin.storage.table.actions') }}</div>
                    </div>
                    <TouchScroll no-padding class="flex-1" @scroll="emit('scroll', $event)">
                      <div class="divide-y divide-[var(--tx-border-color-lighter)]">
                        <div v-for="entry in entries" :key="entry.path" class="PluginStorage-Row">
                          <div class="flex items-center gap-3 min-w-0">
                            <i
                              class="text-lg"
                              :class="getEntryIcon(entry)"
                              :style="{ color: getEntryColor(entry) }"
                            />
                            <div class="min-w-0">
                              <div
                                class="text-sm font-medium text-[var(--tx-text-color-primary)] truncate"
                              >
                                {{ entry.name }}
                              </div>
                              <div class="text-xs text-[var(--tx-text-color-secondary)] truncate">
                                {{ entry.path }}
                              </div>
                            </div>
                          </div>
                          <div class="text-xs text-[var(--tx-text-color-secondary)]">
                            {{ getEntryTypeLabel(entry) }}
                          </div>
                          <div class="text-xs text-[var(--tx-text-color-secondary)]">
                            {{ entry.type === 'directory' ? '--' : formatSize(entry.size) }}
                          </div>
                          <div class="text-xs text-[var(--tx-text-color-secondary)]">
                            {{ formatDate(entry.modified) }}
                          </div>
                          <div class="text-xs text-right text-[var(--tx-text-color-secondary)]">
                            --
                          </div>
                        </div>
                      </div>
                    </TouchScroll>
                  </div>
                </div>

                <div
                  class="PluginStorage-Footer flex items-center justify-between mt-4 pt-3 border-t border-[var(--tx-border-color-lighter)]"
                >
                  <div
                    class="flex items-center gap-3 text-xs text-[var(--tx-text-color-secondary)]"
                  >
                    <span class="flex items-center gap-1">
                      <i
                        class="i-ri-checkbox-circle-fill text-[var(--tx-color-success)] text-[10px]"
                      />
                      {{ t('plugin.storage.footer.serviceReady') }}
                    </span>
                    <span>{{ t('plugin.storage.footer.encoding') }}</span>
                  </div>
                  <div
                    class="flex items-center gap-3 text-xs text-[var(--tx-text-color-secondary)]"
                  >
                    <span>
                      {{
                        t('plugin.storage.footer.space', {
                          percent: (storageStats.usagePercent || 0).toFixed(1),
                          maxSize: formatSize(storageStats.maxSize)
                        })
                      }}
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
          </div>
        </template>
      </TxFlipOverlay>
    </Teleport>

    <TxBottomDialog
      v-if="clearConfirmVisible"
      :title="t('plugin.storage.confirm.clearTitle')"
      :message="t('plugin.storage.confirm.clearMessage')"
      :btns="[
        { content: t('plugin.storage.confirm.cancel'), type: 'info', onClick: () => true },
        {
          content: t('plugin.storage.confirm.clearConfirm'),
          type: 'error',
          onClick: confirmClearStorage
        }
      ]"
      :close="closeClearConfirm"
    />
  </div>
</template>

<style lang="scss" scoped>
.PluginStorage-Card {
  border-radius: 16px;
  padding: 24px;
}

.PluginStorage-Path {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color-light);
  border: 1px solid var(--tx-border-color-lighter);
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
  background: var(--tx-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;

  i {
    font-size: 32px;
    color: var(--tx-text-color-secondary);
    opacity: 0.6;
  }
}

.PluginStorage-TableHeader {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr 0.6fr;
  gap: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.PluginStorage-Row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.5fr 0.6fr;
  gap: 12px;
  padding: 12px;
  align-items: center;
}

.PluginStorage-ConfigPath {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 420px;
}

.PluginStorage-PathActionBtn :deep(.tx-button) {
  min-width: 36px;
  width: 36px;
  height: 36px;
  padding: 0;
}

.PluginStorageDetails-Panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.PluginStorageDetails-Body {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
}

.PluginStorageDetails-TableWrap {
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  min-height: 420px;
  overflow: hidden;
  background: var(--tx-bg-color-overlay);
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
