<script name="Storagable" setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import { formatBytesShort } from '~/components/plugin/runtime/format'
import { describeFailure } from '~/utils/failure-text'
import { createRendererLogger } from '~/utils/renderer-log'
import PrivacyDataSection from './PrivacyDataSection.vue'

interface StorageUsageNode {
  key: string
  label: string
  path: string
  bytes: number
  fileCount: number
  dirCount: number
}

interface PluginStorageUsage {
  name: string
  bytes: number
  fileCount: number
  dirCount: number
}

interface DatabaseTableUsage {
  name: string
  label: string
  category: string
  bytes: number
  rows: number
  sizeKnown: boolean
}

interface DatabaseUsageReport {
  path: string
  bytes: number
  walBytes: number
  shmBytes: number
  tables: DatabaseTableUsage[]
  tablesLoaded: boolean
}

interface CacheUsage {
  key: string
  label: string
  scope: 'memory' | 'disk' | 'mixed'
  bytes: number
  entries: number
  ttlMs?: number | null
  note?: string
}

interface StorageUsageReport {
  generatedAt: number
  rootPath: string
  totalBytes: number
  totalSource: 'full' | 'modules'
  modules: StorageUsageNode[]
  plugins: PluginStorageUsage[]
  database: DatabaseUsageReport
  caches: CacheUsage[]
}

interface StorageUsageRequest {
  include: {
    modules?: boolean
    plugins?: boolean
    database?: boolean
    databaseTables?: boolean
    caches?: boolean
    includeOther?: boolean
  }
}

interface StorageCleanupResult {
  success: boolean
  removedCount?: number
  removedBytes?: number
  error?: string
}

interface DatabaseCategoryGroup {
  category: string
  label: string
  bytes: number
  rows: number
  sizeKnown: boolean
  tables: DatabaseTableUsage[]
}

interface CleanupConfirm {
  title: string
  message: string
  type?: 'warning' | 'error'
}

interface CleanupAction {
  key: string
  label: string
  channel: string
  payload?: Record<string, unknown>
  confirm: CleanupConfirm
  note?: string
}

const summaryLoading = ref(false)
const pluginsLoading = ref(false)
const dbTablesLoading = ref(false)
const errorMessage = ref<string | null>(null)
const report = ref<StorageUsageReport | null>(null)
const cleaningKey = ref<string | null>(null)
const transport = useTuffTransport()
const downloadSdk = useDownloadSdk()
const storagableLog = createRendererLogger('Storagable')
const { t, te, locale } = useI18n()

/**
 * Mounted inside `SettingsPage` when it backs the storage category, which already supplies the
 * heading, scroll container and edge fades. Rendering its own `ViewTemplate` there would stack
 * two headings and two scrollers.
 */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const shell = computed(() => (props.embedded ? 'div' : ViewTemplate))
function sendRaw<TRequest, TResponse>(eventName: string, payload?: TRequest) {
  const event = defineRawEvent<TRequest, TResponse>(eventName)
  return transport.send(event, payload as TRequest)
}

const moduleTotalBytes = computed(() => {
  return report.value?.modules.reduce((sum, node) => sum + (node.bytes || 0), 0) ?? 0
})

const pluginTotalBytes = computed(() => {
  return report.value?.modules.find((n) => n.key === 'plugins')?.bytes ?? 0
})

const isBusy = computed(() => {
  return (
    summaryLoading.value || pluginsLoading.value || dbTablesLoading.value || !!cleaningKey.value
  )
})

function percentOf(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, (value / total) * 100))
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat(locale.value).format(Math.max(0, Math.floor(value)))
}

function formatCacheScope(scope: CacheUsage['scope']): string {
  if (scope === 'disk') return t('settingStorage.usage.scope.disk')
  if (scope === 'mixed') return t('settingStorage.usage.scope.mixed')
  return t('settingStorage.usage.scope.memory')
}

function formatTtl(ttlMs?: number | null): string {
  if (!ttlMs || !Number.isFinite(ttlMs)) return t('settingStorage.usage.ttlNone')
  const seconds = Math.round(ttlMs / 1000)
  if (seconds < 60) return t('settingStorage.usage.ttl', { value: `${seconds}s` })
  const minutes = Math.round(seconds / 60)
  return t('settingStorage.usage.ttl', { value: `${minutes}min` })
}

/**
 * The file-index cleanup reports only a count, downloads report a count and bytes, and updates
 * report neither, so each combination is its own sentence rather than fragments joined together.
 */
function formatCleanupDone(label: string, result: StorageCleanupResult): string {
  const count = result.removedCount ?? 0
  const named = {
    action: label,
    count: formatCount(count),
    bytes: formatBytesShort(result.removedBytes ?? 0)
  }
  const hasCount = Number.isFinite(result.removedCount)
  const hasBytes = Number.isFinite(result.removedBytes)
  if (hasCount && hasBytes) {
    return t('settingStorage.usage.cleanup.doneRemovedFreed', named, count)
  }
  if (hasCount) return t('settingStorage.usage.cleanup.doneRemoved', named, count)
  if (hasBytes) return t('settingStorage.usage.cleanup.doneFreed', named)
  return t('settingStorage.usage.cleanup.done', { action: label })
}

// Cleanup confirmation dialog
const cleanupConfirmVisible = ref(false)
const cleanupConfirmTitle = ref('')
const cleanupConfirmMessage = ref('')
const cleanupConfirmType = ref<'warning' | 'error'>('warning')
const pendingCleanupAction = ref<(() => Promise<void>) | null>(null)

function closeCleanupConfirm() {
  cleanupConfirmVisible.value = false
  pendingCleanupAction.value = null
}

async function executeCleanupConfirm(): Promise<boolean> {
  if (pendingCleanupAction.value) await pendingCleanupAction.value()
  pendingCleanupAction.value = null
  return true
}

async function runCleanup(action: CleanupAction): Promise<void> {
  if (cleaningKey.value) return
  cleanupConfirmTitle.value = action.confirm.title
  cleanupConfirmMessage.value = action.confirm.message
  cleanupConfirmType.value = action.confirm.type ?? 'warning'
  pendingCleanupAction.value = async () => {
    cleaningKey.value = action.key
    try {
      const result = await sendRaw<CleanupAction['payload'], StorageCleanupResult>(
        action.channel,
        action.payload ?? {}
      )
      if (!result || typeof result !== 'object' || !('success' in result)) {
        toast.error(t('settingStorage.usage.cleanup.invalidResponse'))
        return
      }
      if (!result.success) {
        // Main's error is a raw diagnostic (the joined rebuild errors), so it rides along as the
        // description under a headline in the user's language; main's public sentence, when it is
        // all there is, reads in that language too.
        const detail = typeof result.error === 'string' ? describeFailure(result.error, t, '') : ''
        toast.error(t('settingStorage.usage.cleanup.failed'), { description: detail || undefined })
        return
      }
      toast.success(formatCleanupDone(action.label, result))
      await loadAll()
    } catch {
      toast.error(t('settingStorage.usage.cleanup.failedLater'))
    } finally {
      cleaningKey.value = null
    }
  }
  cleanupConfirmVisible.value = true
}

const modulesSorted = computed(() => {
  const items = report.value?.modules ?? []
  return items.slice().sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
})

/** How many plugins the list shows before folding the rest into a count. */
const PLUGIN_LIST_LIMIT = 12

const pluginsSorted = computed(() => {
  const items = report.value?.plugins ?? []
  return items.slice().sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
})

const databaseTotalBytes = computed(() => {
  if (!report.value) return 0
  return (
    (report.value.database?.bytes ?? 0) +
    (report.value.database?.walBytes ?? 0) +
    (report.value.database?.shmBytes ?? 0)
  )
})

const databaseTablesLoaded = computed(() => {
  return report.value?.database?.tablesLoaded ?? false
})

const databaseLogicalBytes = computed(() => {
  const tables = report.value?.database?.tables ?? []
  return tables.reduce((sum, table) => sum + (table.bytes ?? 0), 0)
})

const databaseLogicalOnly = computed(() => {
  return (
    databaseTablesLoaded.value && databaseLogicalBytes.value > 0 && databaseTotalBytes.value === 0
  )
})

const totalLabel = computed(() => {
  if (report.value?.totalSource === 'full') return t('settingStorage.usage.totalFull')
  return t('settingStorage.usage.totalModules')
})

const totalDisplayBytes = computed(() => {
  if (report.value?.totalSource === 'full') {
    return report.value?.totalBytes ?? 0
  }
  return moduleTotalBytes.value
})

const databaseGroups = computed<DatabaseCategoryGroup[]>(() => {
  const tables = report.value?.database?.tables ?? []
  const categoryLabels: Record<string, string> = {
    'file-index': t('settingStorage.usage.categories.fileIndex'),
    'search-index': t('settingStorage.usage.categories.searchIndex'),
    clipboard: t('settingStorage.usage.categories.clipboard'),
    ocr: t('settingStorage.usage.categories.ocr'),
    embedding: t('settingStorage.usage.categories.embedding'),
    usage: t('settingStorage.usage.categories.usage'),
    recommendation: t('settingStorage.usage.categories.recommendation'),
    plugin: t('settingStorage.usage.categories.plugin'),
    config: t('settingStorage.usage.categories.config'),
    downloads: t('settingStorage.usage.categories.downloads'),
    intelligence: t('settingStorage.usage.categories.intelligence'),
    analytics: t('settingStorage.usage.categories.analytics'),
    telemetry: t('settingStorage.usage.categories.telemetry'),
    updates: t('settingStorage.usage.categories.updates'),
    voice: t('settingStorage.usage.categories.voice'),
    projects: t('settingStorage.usage.categories.projects'),
    conversations: t('settingStorage.usage.categories.conversations'),
    'local-ai-cli': t('settingStorage.usage.categories.localAiCli')
  }

  const map = new Map<string, DatabaseTableUsage[]>()
  for (const table of tables) {
    if (!map.has(table.category)) map.set(table.category, [])
    map.get(table.category)?.push(table)
  }

  const groups: DatabaseCategoryGroup[] = []
  for (const [category, items] of map.entries()) {
    const bytes = items.reduce((sum, item) => sum + (item.bytes ?? 0), 0)
    const rows = items.reduce((sum, item) => sum + (item.rows ?? 0), 0)
    const sizeKnown = items.every((item) => item.sizeKnown)
    groups.push({
      category,
      label: categoryLabels[category] ?? category,
      bytes,
      rows,
      sizeKnown,
      tables: items
        .map((item) => ({ ...item, label: tableLabel(item) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale.value))
    })
  }

  return groups.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
})

/**
 * Main labels tables, modules and caches in Chinese and keys them by id, so the page translates
 * by id. Main's label stays the fallback for an id added there before it is added here.
 */
function tableLabel(table: DatabaseTableUsage): string {
  const key = `settingStorage.usage.tables.${table.name}`
  return te(key) ? t(key) : table.label
}

const moduleLabels = computed<Record<string, string>>(() => ({
  plugins: t('settingStorage.usage.modules.plugins'),
  config: t('settingStorage.usage.modules.config'),
  database: t('settingStorage.usage.modules.database'),
  logs: t('settingStorage.usage.modules.logs'),
  temp: t('settingStorage.usage.modules.temp'),
  other: t('settingStorage.usage.modules.other')
}))

const cacheLabels = computed<Record<string, string>>(() => ({
  'clipboard.memory': t('settingStorage.usage.caches.clipboardMemory'),
  'storage.lru': t('settingStorage.usage.caches.storageLru'),
  'storage.plugins': t('settingStorage.usage.caches.storagePlugins'),
  'update.cache': t('settingStorage.usage.caches.updateCache'),
  'ai.quota': t('settingStorage.usage.caches.aiQuota')
}))

function moduleLabel(node: StorageUsageNode): string {
  return moduleLabels.value[node.key] ?? node.label
}

function cacheLabel(cache: CacheUsage): string {
  return cacheLabels.value[cache.key] ?? cache.label
}

const cacheList = computed(() => {
  const items = report.value?.caches ?? []
  return items.slice()
})

const databaseSizeKnown = computed(() => {
  const tables = report.value?.database?.tables ?? []
  return tables.every((table) => table.sizeKnown)
})

const DOWNLOAD_CLEANUP_DAYS = 30

// Privacy-owned categories are managed exclusively through PrivacyDataSection's
// typed preview/cleanup/delete flows. Keep only unrelated maintenance actions here.
const databaseGroupActions = computed<Record<string, CleanupAction[]>>(() => ({
  'file-index': [
    {
      key: 'file-index-clear',
      label: t('settingStorage.usage.actions.fileIndexClear'),
      channel: 'storage:cleanup:file-index',
      payload: { clearSearchIndex: true },
      confirm: {
        title: t('settingStorage.usage.actions.fileIndexClearTitle'),
        message: t('settingStorage.usage.actions.fileIndexClearMessage'),
        type: 'warning'
      }
    },
    {
      key: 'file-index-rebuild',
      label: t('settingStorage.usage.actions.fileIndexRebuild'),
      channel: 'storage:cleanup:file-index',
      payload: { clearSearchIndex: true, rebuild: true },
      confirm: {
        title: t('settingStorage.usage.actions.fileIndexRebuildTitle'),
        message: t('settingStorage.usage.actions.fileIndexRebuildMessage'),
        type: 'warning'
      },
      note: t('settingStorage.usage.actions.fileIndexRebuildNote')
    }
  ],
  downloads: [
    {
      key: 'downloads-30d',
      label: t('settingStorage.usage.actions.downloadsOld', { days: DOWNLOAD_CLEANUP_DAYS }),
      channel: 'storage:cleanup:downloads',
      payload: { beforeDays: DOWNLOAD_CLEANUP_DAYS },
      confirm: {
        title: t('settingStorage.usage.actions.downloadsOldTitle'),
        message: t('settingStorage.usage.actions.downloadsOldMessage', {
          days: DOWNLOAD_CLEANUP_DAYS
        }),
        type: 'warning'
      }
    },
    {
      key: 'downloads-all',
      label: t('settingStorage.usage.actions.downloadsAll'),
      channel: 'storage:cleanup:downloads',
      confirm: {
        title: t('settingStorage.usage.actions.downloadsAllTitle'),
        message: t('settingStorage.usage.actions.downloadsAllMessage'),
        type: 'error'
      }
    }
  ],
  updates: [
    {
      key: 'updates-all',
      label: t('settingStorage.usage.actions.updatesAll'),
      channel: 'storage:cleanup:updates',
      confirm: {
        title: t('settingStorage.usage.actions.updatesAllTitle'),
        message: t('settingStorage.usage.actions.updatesAllMessage'),
        type: 'warning'
      }
    }
  ]
}))

async function loadSummary(): Promise<void> {
  summaryLoading.value = true
  errorMessage.value = null
  try {
    const res = await sendRaw<StorageUsageRequest, StorageUsageReport>('system:get-storage-usage', {
      include: {
        modules: true,
        plugins: false,
        database: true,
        databaseTables: false,
        caches: true,
        includeOther: false
      }
    })
    report.value = res as StorageUsageReport
  } catch (error) {
    errorMessage.value = describeFailure(error, t, t('common.failures.operationFailed'))
  } finally {
    summaryLoading.value = false
  }
}

async function loadPlugins(): Promise<void> {
  if (pluginsLoading.value) return
  pluginsLoading.value = true
  try {
    const res = await sendRaw<StorageUsageRequest, StorageUsageReport>('system:get-storage-usage', {
      include: {
        modules: false,
        plugins: true,
        database: false,
        databaseTables: false,
        caches: false,
        includeOther: false
      }
    })
    const data = res as StorageUsageReport
    // A partial payload must never seed the whole report: if the summary load
    // failed, plugins-only data would paint every other section as zero next
    // to the error banner.
    if (!report.value) return
    report.value = { ...report.value, plugins: data.plugins ?? [] }
  } catch (error) {
    storagableLog.warn('Plugin storage scan failed', error)
  } finally {
    pluginsLoading.value = false
  }
}

async function loadDatabaseTables(): Promise<void> {
  if (dbTablesLoading.value) return
  dbTablesLoading.value = true
  try {
    const res = await sendRaw<StorageUsageRequest, StorageUsageReport>('system:get-storage-usage', {
      include: {
        modules: false,
        plugins: false,
        database: true,
        databaseTables: true,
        caches: false,
        includeOther: false
      }
    })
    const data = res as StorageUsageReport
    if (!report.value) return
    report.value = {
      ...report.value,
      database: {
        ...report.value.database,
        tables: data.database?.tables ?? [],
        tablesLoaded: data.database?.tablesLoaded ?? true
      }
    }
  } catch (error) {
    storagableLog.warn('Database table scan failed', error)
  } finally {
    dbTablesLoading.value = false
  }
}

async function loadAll(): Promise<void> {
  await loadSummary()
  void loadPlugins()
  void loadDatabaseTables()
}

/**
 * The chunk cache path comes from the download module rather than the storage report, which only
 * walks the app data root. Failing to read it just leaves the row showing a dash.
 */
const tempDirPath = ref('')

async function loadTempDirPath(): Promise<void> {
  try {
    const response = await downloadSdk.getConfig()
    if (response.success && response.config) {
      tempDirPath.value = response.config.storage.tempDir
    }
  } catch {
    // Non-critical: the row degrades to a dash.
  }
}

onMounted(() => {
  void loadAll()
  void loadTempDirPath()
})
</script>

<template>
  <div class="Storagable-Page">
    <component :is="shell" v-bind="embedded ? {} : { title: '$I18n:router.storagable' }">
      <div class="Storagable-Container">
        <PrivacyDataSection />

        <div class="header">
          <div class="title">{{ t('settingStorage.usage.title') }}</div>
          <div class="actions">
            <TxButton variant="bare" class="btn" :disabled="summaryLoading" @click="loadAll">
              {{ t('common.refresh') }}
            </TxButton>
          </div>
        </div>

        <div v-if="errorMessage" class="error">
          {{ errorMessage }}
        </div>

        <!--
          Reuses `.summary` and `.card`, so the three tiles occupy the grid the
          report will fill. The `!report` guard was already right: it is what
          keeps a manual refresh from replacing figures already on screen.
        -->
        <div v-if="!report && summaryLoading" class="summary" aria-hidden="true">
          <div v-for="i in 3" :key="i" class="card">
            <div class="label"><TxSkeleton :width="64" :height="11" :radius="4" /></div>
            <div class="value"><TxSkeleton :width="88" :height="18" :radius="4" /></div>
            <div class="sub"><TxSkeleton width="76%" :height="10" :radius="4" /></div>
          </div>
        </div>

        <template v-if="report">
          <div class="summary">
            <div class="card">
              <div class="label">
                {{ totalLabel }}
              </div>
              <div class="value">
                {{ formatBytesShort(totalDisplayBytes) }}
              </div>
              <div class="sub">
                {{ report.rootPath }}
              </div>
            </div>
            <div class="card">
              <div class="label">{{ t('settingStorage.usage.modules.plugins') }}</div>
              <div class="value">
                {{ formatBytesShort(pluginTotalBytes) }}
              </div>
              <div class="sub">config/plugins</div>
            </div>
            <div class="card">
              <div class="label">{{ t('settingStorage.usage.databaseContent') }}</div>
              <div class="value">
                {{
                  !databaseTablesLoaded
                    ? t('settingStorage.usage.calculating')
                    : databaseSizeKnown
                      ? formatBytesShort(databaseLogicalBytes)
                      : t('settingStorage.usage.unknown')
                }}
              </div>
              <div class="sub">{{ t('settingStorage.usage.basedOnTableStats') }}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <div class="section-title">{{ t('settingStorage.usage.modulesTitle') }}</div>
            </div>
            <div class="list">
              <div v-for="node in modulesSorted" :key="node.key" class="row">
                <div class="row-head">
                  <div class="row-head-main">
                    <div class="name">
                      {{ moduleLabel(node) }}
                    </div>
                    <div class="meta">
                      <span>{{ formatBytesShort(node.bytes) }}</span>
                      <span class="sep">·</span>
                      <span>{{
                        t(
                          'settingStorage.usage.fileCount',
                          { count: formatCount(node.fileCount) },
                          node.fileCount
                        )
                      }}</span>
                      <span class="sep">·</span>
                      <span>{{
                        t(
                          'settingStorage.usage.dirCount',
                          { count: formatCount(node.dirCount) },
                          node.dirCount
                        )
                      }}</span>
                    </div>
                  </div>
                </div>
                <div class="bar">
                  <div
                    class="fill"
                    :style="{ width: `${percentOf(node.bytes, report.totalBytes).toFixed(2)}%` }"
                  />
                </div>
                <div class="path">
                  {{ node.path }}
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <div class="section-title">{{ t('settingStorage.usage.pluginsTitle') }}</div>
              <div v-if="pluginsLoading" class="section-meta">{{ t('common.loading') }}</div>
            </div>
            <div v-if="pluginsSorted.length === 0" class="muted">
              {{ pluginsLoading ? t('common.loading') : t('settingStorage.usage.pluginsEmpty') }}
            </div>
            <div v-else class="list">
              <div v-for="p in pluginsSorted.slice(0, PLUGIN_LIST_LIMIT)" :key="p.name" class="row">
                <div class="row-head">
                  <div class="name">
                    {{ p.name }}
                  </div>
                  <div class="meta">
                    <span>{{ formatBytesShort(p.bytes) }}</span>
                    <span class="sep">·</span>
                    <span>{{
                      t(
                        'settingStorage.usage.fileCount',
                        { count: formatCount(p.fileCount) },
                        p.fileCount
                      )
                    }}</span>
                    <span class="sep">·</span>
                    <span>{{
                      t(
                        'settingStorage.usage.dirCount',
                        { count: formatCount(p.dirCount) },
                        p.dirCount
                      )
                    }}</span>
                  </div>
                </div>
                <div class="bar">
                  <div
                    class="fill"
                    :style="{ width: `${percentOf(p.bytes, pluginTotalBytes).toFixed(2)}%` }"
                  />
                </div>
              </div>
              <div v-if="pluginsSorted.length > PLUGIN_LIST_LIMIT" class="muted">
                {{
                  t('settingStorage.usage.pluginsCollapsed', {
                    limit: PLUGIN_LIST_LIMIT,
                    count: pluginsSorted.length - PLUGIN_LIST_LIMIT
                  })
                }}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <div class="section-title">{{ t('settingStorage.usage.databaseTitle') }}</div>
              <div v-if="dbTablesLoading" class="section-meta">
                {{ t('settingStorage.usage.tableStatsLoading') }}
              </div>
            </div>
            <div class="db-grid">
              <div class="card">
                <div class="label">{{ t('settingStorage.usage.databaseFile') }}</div>
                <div class="value">
                  {{ formatBytesShort(report.database.bytes) }}
                </div>
                <div class="sub">
                  {{ report.database.path }}
                </div>
              </div>
              <div class="card">
                <div class="label">WAL</div>
                <div class="value">
                  {{ formatBytesShort(report.database.walBytes) }}
                </div>
                <div class="sub">database.db-wal</div>
              </div>
              <div class="card">
                <div class="label">SHM</div>
                <div class="value">
                  {{ formatBytesShort(report.database.shmBytes) }}
                </div>
                <div class="sub">database.db-shm</div>
              </div>
              <div class="card">
                <div class="label">{{ t('settingStorage.usage.databaseTotal') }}</div>
                <div class="value">
                  {{ formatBytesShort(databaseTotalBytes) }}
                </div>
                <div class="sub">db + wal + shm</div>
              </div>
            </div>

            <div v-if="databaseTablesLoaded && !databaseSizeKnown" class="muted db-note">
              {{ t('settingStorage.usage.dbstatUnavailable') }}
            </div>

            <div v-if="databaseLogicalOnly" class="muted db-note">
              {{ t('settingStorage.usage.logicalOnly') }}
            </div>

            <div v-if="!databaseTablesLoaded" class="muted db-note">
              {{
                dbTablesLoading
                  ? t('settingStorage.usage.tableUsageLoading')
                  : t('settingStorage.usage.tableUsageNotLoaded')
              }}
            </div>

            <div v-else class="db-groups">
              <div v-for="group in databaseGroups" :key="group.category" class="row">
                <div class="row-head">
                  <div class="row-head-main">
                    <div class="name">
                      {{ group.label }}
                    </div>
                    <div class="meta">
                      <span>{{
                        group.sizeKnown
                          ? formatBytesShort(group.bytes)
                          : t('settingStorage.usage.unknown')
                      }}</span>
                      <span class="sep">·</span>
                      <span>{{
                        t(
                          'settingStorage.usage.rowCount',
                          { count: formatCount(group.rows) },
                          group.rows
                        )
                      }}</span>
                    </div>
                  </div>
                  <div class="row-actions">
                    <TxButton
                      v-for="action in databaseGroupActions[group.category] || []"
                      :key="action.key"
                      variant="bare"
                      class="btn action"
                      :class="{ danger: action.confirm.type === 'error' }"
                      :disabled="isBusy"
                      @click="runCleanup(action)"
                    >
                      {{
                        cleaningKey === action.key
                          ? t('settingStorage.usage.processing')
                          : action.label
                      }}
                    </TxButton>
                  </div>
                </div>
                <template
                  v-for="action in databaseGroupActions[group.category] || []"
                  :key="`${action.key}-note`"
                >
                  <div v-if="action.note" class="muted note">
                    {{ action.note }}
                  </div>
                </template>
                <div class="table-list">
                  <div v-for="table in group.tables" :key="table.name" class="table-row">
                    <div class="table-head">
                      <div class="table-name">
                        {{ table.label }}
                      </div>
                      <div class="meta">
                        <span>{{
                          table.sizeKnown
                            ? formatBytesShort(table.bytes)
                            : t('settingStorage.usage.unknown')
                        }}</span>
                        <span class="sep">·</span>
                        <span>{{
                          t(
                            'settingStorage.usage.rowCount',
                            { count: formatCount(table.rows) },
                            table.rows
                          )
                        }}</span>
                      </div>
                    </div>
                    <div class="path">
                      {{ t('settingStorage.usage.tableName', { name: table.name }) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <div class="section-title">{{ t('settingStorage.usage.cachesTitle') }}</div>
            </div>
            <div class="list">
              <div v-for="cache in cacheList" :key="cache.key" class="row">
                <div class="row-head">
                  <div class="name">
                    {{ cacheLabel(cache) }}
                  </div>
                  <div class="meta">
                    <span>{{ formatBytesShort(cache.bytes) }}</span>
                    <span class="sep">·</span>
                    <span>{{
                      t(
                        'settingStorage.usage.entryCount',
                        { count: formatCount(cache.entries) },
                        cache.entries
                      )
                    }}</span>
                    <span class="sep">·</span>
                    <span>{{ formatCacheScope(cache.scope) }}</span>
                    <span class="sep">·</span>
                    <span>{{ formatTtl(cache.ttlMs) }}</span>
                  </div>
                </div>
                <div v-if="cache.note" class="path">
                  {{ cache.note }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="Object.keys(databaseGroupActions).length > 0" class="section">
            <div class="section-head">
              <div class="section-title">{{ t('settingStorage.usage.cleanupNoteTitle') }}</div>
            </div>
            <div class="muted">
              {{ t('settingStorage.usage.cleanupNote') }}
            </div>
          </div>
        </template>

        <!--
          Paths live here rather than on the downloads page: the chunk cache is an engine-internal
          location, and "where does this app keep things on disk" is the question this page answers.
          The downloads page points here for it.
        -->
        <div class="section">
          <div class="section-head">
            <div class="section-title">{{ t('settingStorage.usage.locationsTitle') }}</div>
          </div>
          <div class="path-rows">
            <div class="path-row">
              <div class="path-text">
                <div class="path-label">{{ t('settingStorage.usage.dataDir') }}</div>
                <div class="muted">{{ t('settingStorage.usage.dataDirDesc') }}</div>
              </div>
              <code class="path-value">{{ report?.rootPath || '—' }}</code>
            </div>
            <div class="path-row">
              <div class="path-text">
                <div class="path-label">{{ t('settingStorage.usage.tempDir') }}</div>
                <div class="muted">{{ t('settingStorage.usage.tempDirDesc') }}</div>
              </div>
              <code class="path-value">{{ tempDirPath || '—' }}</code>
            </div>
          </div>
        </div>
      </div>
    </component>

    <TxBottomDialog
      v-if="cleanupConfirmVisible"
      :title="cleanupConfirmTitle"
      :message="cleanupConfirmMessage"
      :close-label="t('common.close')"
      :btns="[
        { content: t('common.cancel'), type: 'info', onClick: () => true },
        {
          content: t('settingStorage.usage.continue'),
          type: cleanupConfirmType === 'error' ? 'error' : 'warning',
          onClick: executeCleanupConfirm
        }
      ]"
      :close="closeCleanupConfirm"
    />
  </div>
</template>

<style lang="scss" scoped>
.Storagable-Page {
  height: 100%;
}

.Storagable-Container {
  position: relative;

  height: 100%;
  width: 100%;
  /* SettingsPage-Column already carries the page inset; adding padding here
     indented this page 58px where every sibling sits at 40px. */
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 18px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid var(--tx-border-color);
  background: var(--tx-bg-color);
  border-radius: 12px;
  padding: 12px 14px;
}

.label {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
.value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
}
.sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  word-break: break-all;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
}

.section-meta {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.db-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.db-note {
  margin-bottom: 12px;
}

.db-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.table-list {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed color-mix(in srgb, var(--tx-border-color) 60%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-row {
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-color-primary) 4%, transparent);
  padding: 8px 10px;
}

.table-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.table-name {
  font-weight: 600;
  font-size: 12px;
}

.row {
  border: 1px solid var(--tx-border-color);
  background: var(--tx-bg-color);
  border-radius: 12px;
  padding: 10px 12px;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.row-head-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.name {
  font-weight: 600;
  font-size: 13px;
}

.meta {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
}
.sep {
  margin: 0 6px;
  opacity: 0.6;
}

.bar {
  margin-top: 8px;
  height: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-color-primary) 12%, transparent);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 8px;
  background: var(--tx-color-primary);
  transition: width 0.4s ease;
}

.path {
  margin-top: 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  word-break: break-all;
  opacity: 0.85;
}

.muted {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.path-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.path-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.path-label {
  font-size: 13px;
}

.path-value {
  // Wraps rather than ellipsises: a truncated path cannot be read back, and these are long enough
  // that truncation would hit every time.
  flex: 0 1 auto;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-secondary);
  word-break: break-all;
  font-size: 11px;
}

.btn.action {
  padding: 6px 10px;
  font-size: 12px;
}

.btn.action.danger {
  border-color: color-mix(in srgb, var(--tx-color-danger) 60%, transparent);
  color: var(--tx-color-danger);
}

.note {
  margin-top: 2px;
}

.error {
  border: 1px solid color-mix(in srgb, var(--tx-color-danger) 35%, transparent);
  background: color-mix(in srgb, var(--tx-color-danger) 12%, transparent);
  color: var(--tx-color-danger);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  word-break: break-word;
}
</style>
