<script name="Storagable" setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import { formatBytesShort } from '~/components/plugin/runtime/format'

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
  return Math.max(0, Math.floor(value)).toLocaleString()
}

function formatCacheScope(scope: CacheUsage['scope']): string {
  if (scope === 'disk') return '磁盘'
  if (scope === 'mixed') return '混合'
  return '内存'
}

function formatTtl(ttlMs?: number | null): string {
  if (!ttlMs || !Number.isFinite(ttlMs)) return '无'
  const seconds = Math.round(ttlMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes}min`
}

function formatCleanupResult(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const data = result as { removedCount?: number; removedBytes?: number }
  const parts: string[] = []
  if (Number.isFinite(data.removedCount)) {
    parts.push(`删除 ${formatCount(data.removedCount ?? 0)} 项`)
  }
  if (Number.isFinite(data.removedBytes)) {
    parts.push(`释放 ${formatBytesShort(data.removedBytes ?? 0)}`)
  }
  return parts.length > 0 ? `（${parts.join('，')}）` : ''
}

async function runCleanup(action: CleanupAction): Promise<void> {
  if (cleaningKey.value) return
  try {
    await ElMessageBox.confirm(action.confirm.message, action.confirm.title, {
      confirmButtonText: '继续',
      cancelButtonText: '取消',
      type: action.confirm.type ?? 'warning'
    })
    cleaningKey.value = action.key
    const result = await sendRaw<CleanupAction['payload'], StorageCleanupResult>(
      action.channel,
      action.payload ?? {}
    )
    if (!result || typeof result !== 'object' || !('success' in result)) {
      ElMessage.error('清理失败：返回数据异常')
      return
    }
    if (!(result as { success: boolean }).success) {
      ElMessage.error('清理失败，请重试')
      return
    }
    const detail = formatCleanupResult(result)
    ElMessage.success(`${action.label}完成${detail}`)
    await loadAll()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清理失败，请稍后重试')
    }
  } finally {
    cleaningKey.value = null
  }
}

const modulesSorted = computed(() => {
  const items = report.value?.modules ?? []
  return items.slice().sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
})

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
  if (report.value?.totalSource === 'full') return '总占用'
  return '目录合计'
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
    'file-index': '文件索引',
    'search-index': '搜索索引',
    clipboard: '剪贴板',
    ocr: 'OCR',
    embedding: '向量/嵌入',
    usage: '使用统计',
    recommendation: '推荐/固定',
    plugin: '插件数据',
    config: '系统配置',
    downloads: '下载任务',
    intelligence: '智能/配额',
    analytics: '分析/上报',
    telemetry: '遥测',
    updates: '更新记录'
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
      tables: items.slice().sort((a, b) => a.label.localeCompare(b.label))
    })
  }

  return groups.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
})

const cacheList = computed(() => {
  const items = report.value?.caches ?? []
  return items.slice()
})

const databaseSizeKnown = computed(() => {
  const tables = report.value?.database?.tables ?? []
  return tables.every((table) => table.sizeKnown)
})

const moduleRowActions: Record<string, CleanupAction[]> = {
  logs: [
    {
      key: 'logs-30d',
      label: '清理 30 天前',
      channel: 'storage:cleanup:logs',
      payload: { beforeDays: 30 },
      confirm: {
        title: '清理日志',
        message: '将删除 30 天前的日志文件，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'logs-all',
      label: '全部清空',
      channel: 'storage:cleanup:logs',
      confirm: {
        title: '清空日志',
        message: '将删除全部日志文件，是否继续？',
        type: 'error'
      }
    }
  ],
  temp: [
    {
      key: 'temp-all',
      label: '清空临时文件',
      channel: 'storage:cleanup:temp',
      confirm: {
        title: '清空临时文件',
        message: '将删除所有临时文件，可能影响正在使用的内容，是否继续？',
        type: 'warning'
      }
    }
  ]
}

const databaseGroupActions: Record<string, CleanupAction[]> = {
  'file-index': [
    {
      key: 'file-index-clear',
      label: '清理索引',
      channel: 'storage:cleanup:file-index',
      payload: { clearSearchIndex: true },
      confirm: {
        title: '清理文件索引',
        message: '将删除文件索引与搜索索引数据，可能需要重新扫描，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'file-index-rebuild',
      label: '清理并重建',
      channel: 'storage:cleanup:file-index',
      payload: { clearSearchIndex: true, rebuild: true },
      confirm: {
        title: '重建文件索引',
        message: '将清理索引并触发重建，过程可能较久，是否继续？',
        type: 'warning'
      },
      note: '重建会在后台执行'
    }
  ],
  clipboard: [
    {
      key: 'clipboard-7d',
      label: '清理 7 天前',
      channel: 'storage:cleanup:clipboard',
      payload: { beforeDays: 7, type: 'all' },
      confirm: {
        title: '清理剪贴板数据',
        message: '将删除 7 天前的剪贴板记录与对应图片文件，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'clipboard-30d',
      label: '清理 30 天前',
      channel: 'storage:cleanup:clipboard',
      payload: { beforeDays: 30, type: 'all' },
      confirm: {
        title: '清理剪贴板数据',
        message: '将删除 30 天前的剪贴板记录与对应图片文件，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'clipboard-all',
      label: '全部清空',
      channel: 'storage:cleanup:clipboard',
      payload: { type: 'all' },
      confirm: {
        title: '清空剪贴板数据',
        message: '将删除全部剪贴板记录与图片文件，是否继续？',
        type: 'error'
      }
    }
  ],
  ocr: [
    {
      key: 'ocr-30d',
      label: '清理 30 天前',
      channel: 'storage:cleanup:ocr',
      payload: { beforeDays: 30 },
      confirm: {
        title: '清理 OCR 数据',
        message: '将删除 30 天前的 OCR 任务与结果，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'ocr-all',
      label: '全部清空',
      channel: 'storage:cleanup:ocr',
      confirm: {
        title: '清空 OCR 数据',
        message: '将删除全部 OCR 任务与结果，是否继续？',
        type: 'error'
      }
    }
  ],
  downloads: [
    {
      key: 'downloads-30d',
      label: '清理 30 天前',
      channel: 'storage:cleanup:downloads',
      payload: { beforeDays: 30 },
      confirm: {
        title: '清理下载记录',
        message: '将删除 30 天前的下载任务与分片数据，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'downloads-all',
      label: '全部清空',
      channel: 'storage:cleanup:downloads',
      confirm: {
        title: '清空下载记录',
        message: '将删除全部下载记录与分片数据，是否继续？',
        type: 'error'
      }
    }
  ],
  analytics: [
    {
      key: 'analytics-30d',
      label: '清理 30 天前',
      channel: 'storage:cleanup:analytics',
      payload: { beforeDays: 30 },
      confirm: {
        title: '清理分析数据',
        message: '将删除 30 天前的分析与遥测数据，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'analytics-all',
      label: '全部清空',
      channel: 'storage:cleanup:analytics',
      confirm: {
        title: '清空分析数据',
        message: '将删除全部分析与遥测数据，是否继续？',
        type: 'error'
      }
    }
  ],
  usage: [
    {
      key: 'usage-all',
      label: '全部清空',
      channel: 'storage:cleanup:usage',
      confirm: {
        title: '清空使用统计',
        message: '将删除全部使用统计与推荐缓存，是否继续？',
        type: 'error'
      }
    }
  ],
  intelligence: [
    {
      key: 'intelligence-30d',
      label: '清理 30 天前',
      channel: 'storage:cleanup:intelligence',
      payload: { beforeDays: 30 },
      confirm: {
        title: '清理智能数据',
        message: '将删除 30 天前的智能日志与用量数据，是否继续？',
        type: 'warning'
      }
    },
    {
      key: 'intelligence-all',
      label: '全部清空',
      channel: 'storage:cleanup:intelligence',
      confirm: {
        title: '清空智能数据',
        message: '将删除全部智能日志与用量数据，是否继续？',
        type: 'error'
      }
    }
  ],
  updates: [
    {
      key: 'updates-all',
      label: '清空记录',
      channel: 'storage:cleanup:updates',
      confirm: {
        title: '清空更新记录',
        message: '将删除全部更新记录，是否继续？',
        type: 'warning'
      }
    }
  ]
}

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
    errorMessage.value = error instanceof Error ? error.message : String(error)
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
    if (!report.value) {
      report.value = data
    } else {
      report.value = { ...report.value, plugins: data.plugins ?? [] }
    }
  } catch {
    // ignore
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
    if (!report.value) {
      report.value = data
    } else {
      report.value = {
        ...report.value,
        database: {
          ...report.value.database,
          tables: data.database?.tables ?? [],
          tablesLoaded: data.database?.tablesLoaded ?? true
        }
      }
    }
  } catch {
    // ignore
  } finally {
    dbTablesLoading.value = false
  }
}

async function loadAll(): Promise<void> {
  await loadSummary()
  void loadPlugins()
  void loadDatabaseTables()
}

onMounted(() => {
  void loadAll()
})
</script>

<template>
  <ViewTemplate title="Storagable">
    <div class="Storagable-Container">
      <div class="header">
        <div class="title">存储占用</div>
        <div class="actions">
          <TxButton variant="bare" class="btn" :disabled="summaryLoading" @click="loadAll">
            刷新
          </TxButton>
        </div>
      </div>

      <div v-if="errorMessage" class="error">
        {{ errorMessage }}
      </div>

      <div v-if="!report && summaryLoading" class="loading">加载中…</div>

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
            <div class="label">插件配置</div>
            <div class="value">
              {{ formatBytesShort(pluginTotalBytes) }}
            </div>
            <div class="sub">config/plugins</div>
          </div>
          <div class="card">
            <div class="label">数据库内容</div>
            <div class="value">
              {{
                !databaseTablesLoaded
                  ? '计算中'
                  : databaseSizeKnown
                    ? formatBytesShort(databaseLogicalBytes)
                    : '未知'
              }}
            </div>
            <div class="sub">基于表级统计</div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div class="section-title">模块/目录占用</div>
          </div>
          <div class="list">
            <div v-for="node in modulesSorted" :key="node.key" class="row">
              <div class="row-head">
                <div class="row-head-main">
                  <div class="name">
                    {{ node.label }}
                  </div>
                  <div class="meta">
                    <span>{{ formatBytesShort(node.bytes) }}</span>
                    <span class="sep">·</span>
                    <span>{{ node.fileCount }} files</span>
                    <span class="sep">·</span>
                    <span>{{ node.dirCount }} dirs</span>
                  </div>
                </div>
                <div class="row-actions">
                  <TxButton
                    v-for="action in moduleRowActions[node.key] || []"
                    :key="action.key"
                    variant="bare"
                    class="btn action"
                    :class="{ danger: action.confirm.type === 'error' }"
                    :disabled="isBusy"
                    @click="runCleanup(action)"
                  >
                    {{ cleaningKey === action.key ? '处理中…' : action.label }}
                  </TxButton>
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
            <div class="section-title">插件占用（config/plugins）</div>
            <div v-if="pluginsLoading" class="section-meta">加载中…</div>
          </div>
          <div v-if="pluginsSorted.length === 0" class="muted">
            {{ pluginsLoading ? '加载中…' : '暂无插件配置目录或无数据。' }}
          </div>
          <div v-else class="list">
            <div v-for="p in pluginsSorted.slice(0, 12)" :key="p.name" class="row">
              <div class="row-head">
                <div class="name">
                  {{ p.name }}
                </div>
                <div class="meta">
                  <span>{{ formatBytesShort(p.bytes) }}</span>
                  <span class="sep">·</span>
                  <span>{{ p.fileCount }} files</span>
                  <span class="sep">·</span>
                  <span>{{ p.dirCount }} dirs</span>
                </div>
              </div>
              <div class="bar">
                <div
                  class="fill"
                  :style="{ width: `${percentOf(p.bytes, pluginTotalBytes).toFixed(2)}%` }"
                />
              </div>
            </div>
            <div v-if="pluginsSorted.length > 12" class="muted">
              仅展示前 12 个插件；其余 {{ pluginsSorted.length - 12 }} 个已折叠。
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div class="section-title">数据库占用</div>
            <div v-if="dbTablesLoading" class="section-meta">表级统计中…</div>
          </div>
          <div class="db-grid">
            <div class="card">
              <div class="label">数据库文件</div>
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
              <div class="label">数据库合计</div>
              <div class="value">
                {{ formatBytesShort(databaseTotalBytes) }}
              </div>
              <div class="sub">db + wal + shm</div>
            </div>
          </div>

          <div v-if="databaseTablesLoaded && !databaseSizeKnown" class="muted db-note">
            当前 SQLite 未启用 dbstat，表级占用显示为未知。
          </div>

          <div v-if="databaseLogicalOnly" class="muted db-note">
            数据库内容为逻辑占用，未计入目录合计。
          </div>

          <div v-if="!databaseTablesLoaded" class="muted db-note">
            {{ dbTablesLoading ? '表级占用加载中…' : '表级占用未加载' }}
          </div>

          <div v-else class="db-groups">
            <div v-for="group in databaseGroups" :key="group.category" class="row">
              <div class="row-head">
                <div class="row-head-main">
                  <div class="name">
                    {{ group.label }}
                  </div>
                  <div class="meta">
                    <span>{{ group.sizeKnown ? formatBytesShort(group.bytes) : '未知' }}</span>
                    <span class="sep">·</span>
                    <span>{{ formatCount(group.rows) }} rows</span>
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
                    {{ cleaningKey === action.key ? '处理中…' : action.label }}
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
                      <span>{{ table.sizeKnown ? formatBytesShort(table.bytes) : '未知' }}</span>
                      <span class="sep">·</span>
                      <span>{{ formatCount(table.rows) }} rows</span>
                    </div>
                  </div>
                  <div class="path">表名：{{ table.name }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div class="section-title">缓存占用</div>
          </div>
          <div class="list">
            <div v-for="cache in cacheList" :key="cache.key" class="row">
              <div class="row-head">
                <div class="name">
                  {{ cache.label }}
                </div>
                <div class="meta">
                  <span>{{ formatBytesShort(cache.bytes) }}</span>
                  <span class="sep">·</span>
                  <span>{{ formatCount(cache.entries) }} entries</span>
                  <span class="sep">·</span>
                  <span>{{ formatCacheScope(cache.scope) }}</span>
                  <span class="sep">·</span>
                  <span>TTL {{ formatTtl(cache.ttlMs) }}</span>
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
            <div class="section-title">清理说明</div>
          </div>
          <div class="muted">
            部分清理会影响索引、统计与历史数据；执行后请根据提示重新扫描或等待后台重建。
          </div>
        </div>
      </template>
    </div>
  </ViewTemplate>
</template>

<style lang="scss" scoped>
.Storagable-Container {
  position: relative;

  height: 100%;
  width: 100%;
  padding: 16px 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
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
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 12px 14px;
}

.label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
}
.sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
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
  border-top: 1px dashed color-mix(in srgb, var(--el-border-color) 60%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-row {
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
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
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
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
  color: var(--el-text-color-secondary);
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
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 8px;
  background: var(--el-color-primary);
  transition: width 0.4s ease;
}

.path {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  opacity: 0.85;
}

.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.btn.action {
  padding: 6px 10px;
  font-size: 12px;
}

.btn.action.danger {
  border-color: color-mix(in srgb, var(--el-color-danger) 60%, transparent);
  color: var(--el-color-danger);
}

.note {
  margin-top: 2px;
}

.error {
  border: 1px solid color-mix(in srgb, var(--el-color-danger) 35%, transparent);
  background: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
  color: var(--el-color-danger);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  word-break: break-word;
}

.loading {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
