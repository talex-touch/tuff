import type { Client } from '@libsql/client'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export interface StorageUsageNode {
  key: string
  label: string
  path: string
  bytes: number
  fileCount: number
  dirCount: number
}

export interface PluginStorageUsage {
  name: string
  bytes: number
  fileCount: number
  dirCount: number
}

export interface StorageUsageReport {
  generatedAt: number
  rootPath: string
  totalBytes: number
  totalSource: 'full' | 'modules'
  modules: StorageUsageNode[]
  plugins: PluginStorageUsage[]
  database: DatabaseUsageReport
  caches: CacheUsage[]
}

export interface DatabaseTableUsage {
  name: string
  label: string
  category: string
  bytes: number
  rows: number
  sizeKnown: boolean
}

export interface DatabaseUsageReport {
  path: string
  bytes: number
  walBytes: number
  shmBytes: number
  tables: DatabaseTableUsage[]
  tablesLoaded: boolean
}

export interface CacheUsage {
  key: string
  label: string
  scope: 'memory' | 'disk' | 'mixed'
  bytes: number
  entries: number
  ttlMs?: number | null
  note?: string
}

export interface StorageUsageOptions {
  dbClient?: Client | null
  cacheStats?: Record<string, number | null | undefined>
  include?: StorageUsageIncludeOptions
}

export interface StorageUsageIncludeOptions {
  modules?: boolean
  plugins?: boolean
  database?: boolean
  databaseTables?: boolean
  caches?: boolean
  includeOther?: boolean
}

interface ScanResult {
  bytes: number
  fileCount: number
  dirCount: number
}

async function scanPath(targetPath: string): Promise<ScanResult> {
  let stat: import('node:fs').Stats
  try {
    stat = await fs.stat(targetPath)
  } catch {
    return { bytes: 0, fileCount: 0, dirCount: 0 }
  }

  if (stat.isFile()) {
    return { bytes: stat.size, fileCount: 1, dirCount: 0 }
  }

  if (!stat.isDirectory()) {
    return { bytes: 0, fileCount: 0, dirCount: 0 }
  }

  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true })
  } catch {
    return { bytes: 0, fileCount: 0, dirCount: 1 }
  }

  let bytes = 0
  let fileCount = 0
  let dirCount = 1

  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      const sub = await scanPath(fullPath)
      bytes += sub.bytes
      fileCount += sub.fileCount
      dirCount += sub.dirCount
      continue
    }

    if (!entry.isFile()) continue
    try {
      const s = await fs.stat(fullPath)
      bytes += s.size
      fileCount += 1
    } catch {
      // ignore
    }
  }

  return { bytes, fileCount, dirCount }
}

const cached = new Map<string, { at: number; report: StorageUsageReport }>()
const CACHE_TTL_MS = 5_000

const TABLE_CATALOG: Array<{ name: string; label: string; category: string }> = [
  { name: 'files', label: '文件索引-文件', category: 'file-index' },
  { name: 'file_extensions', label: '文件索引-扩展', category: 'file-index' },
  { name: 'file_index_progress', label: '文件索引-进度', category: 'file-index' },
  { name: 'scan_progress', label: '文件索引-扫描进度', category: 'file-index' },
  { name: 'file_fts', label: '文件索引-FTS', category: 'file-index' },
  { name: 'search_index', label: '搜索索引-FTS', category: 'search-index' },
  { name: 'keyword_mappings', label: '搜索-关键字映射', category: 'search-index' },
  { name: 'query_completions', label: '搜索-补全', category: 'search-index' },
  { name: 'clipboard_history', label: '剪贴板-历史', category: 'clipboard' },
  { name: 'clipboard_history_meta', label: '剪贴板-元数据', category: 'clipboard' },
  { name: 'ocr_jobs', label: 'OCR-任务', category: 'ocr' },
  { name: 'ocr_results', label: 'OCR-结果', category: 'ocr' },
  { name: 'embeddings', label: '向量-内容', category: 'embedding' },
  { name: 'contextual_embeddings', label: '向量-上下文', category: 'embedding' },
  { name: 'usage_logs', label: '使用日志-明细', category: 'usage' },
  { name: 'usage_summary', label: '使用日志-汇总', category: 'usage' },
  { name: 'item_usage_stats', label: '使用日志-项目统计', category: 'usage' },
  { name: 'item_time_stats', label: '使用日志-时间统计', category: 'usage' },
  { name: 'recommendation_cache', label: '推荐-缓存', category: 'recommendation' },
  { name: 'pinned_items', label: '推荐-固定项', category: 'recommendation' },
  { name: 'plugin_data', label: '插件-数据', category: 'plugin' },
  { name: 'config', label: '系统配置表', category: 'config' },
  { name: 'download_tasks', label: '下载-任务', category: 'downloads' },
  { name: 'download_chunks', label: '下载-分片', category: 'downloads' },
  { name: 'download_history', label: '下载-历史', category: 'downloads' },
  { name: 'intelligence_audit_logs', label: '智能-审计日志', category: 'intelligence' },
  { name: 'intelligence_quotas', label: '智能-配额', category: 'intelligence' },
  { name: 'intelligence_usage_stats', label: '智能-用量', category: 'intelligence' },
  { name: 'analytics_snapshots', label: '分析-快照', category: 'analytics' },
  { name: 'plugin_analytics', label: '分析-插件统计', category: 'analytics' },
  { name: 'analytics_report_queue', label: '分析-上报队列', category: 'analytics' },
  { name: 'telemetry_upload_stats', label: '遥测-上传统计', category: 'telemetry' },
  { name: 'app_update_records', label: '更新-记录', category: 'updates' }
]

async function safeStat(targetPath: string): Promise<number> {
  try {
    const stat = await fs.stat(targetPath)
    return stat.isFile() ? stat.size : 0
  } catch {
    return 0
  }
}

async function getDatabaseTables(client: Client | null | undefined): Promise<DatabaseTableUsage[]> {
  const tables: DatabaseTableUsage[] = []
  if (!client) {
    return TABLE_CATALOG.map((table) => ({
      ...table,
      bytes: 0,
      rows: 0,
      sizeKnown: false
    }))
  }

  const existing = new Set<string>()
  try {
    const tableRows = await client.execute(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
    )
    for (const row of tableRows.rows) {
      const name = typeof row.name === 'string' ? row.name : String(row.name ?? '')
      if (name) existing.add(name)
    }
  } catch {
    // ignore
  }

  let sizeMap = new Map<string, number>()
  let sizeKnown = true
  try {
    const statRows = await client.execute(
      'SELECT name, SUM(pgsize) as bytes FROM dbstat GROUP BY name'
    )
    sizeMap = new Map(
      statRows.rows.map((row) => {
        const name = typeof row.name === 'string' ? row.name : String(row.name ?? '')
        const bytesValue =
          typeof row.bytes === 'number' ? row.bytes : Number.parseInt(String(row.bytes ?? '0'), 10)
        return [name, Number.isFinite(bytesValue) ? bytesValue : 0]
      })
    )
  } catch {
    sizeKnown = false
  }

  for (const table of TABLE_CATALOG) {
    const exists = existing.has(table.name)
    let rows = 0
    if (exists) {
      try {
        const result = await client.execute(`SELECT COUNT(*) as count FROM ${table.name}`)
        const value = result.rows?.[0]?.count
        rows = typeof value === 'number' ? value : Number.parseInt(String(value ?? '0'), 10)
        if (!Number.isFinite(rows)) rows = 0
      } catch {
        rows = 0
      }
    }

    tables.push({
      ...table,
      bytes: sizeMap.get(table.name) ?? 0,
      rows: exists ? rows : 0,
      sizeKnown
    })
  }

  return tables
}

export async function getStorageUsageReport(
  options?: StorageUsageOptions
): Promise<StorageUsageReport> {
  const now = Date.now()
  const include: Required<StorageUsageIncludeOptions> = {
    modules: options?.include?.modules !== false,
    plugins: options?.include?.plugins !== false,
    database: options?.include?.database !== false,
    databaseTables: options?.include?.databaseTables !== false,
    caches: options?.include?.caches !== false,
    includeOther: options?.include?.includeOther !== false
  }

  const cacheKey = JSON.stringify(include)
  const cachedEntry = cached.get(cacheKey)
  if (cachedEntry && now - cachedEntry.at < CACHE_TTL_MS) {
    return cachedEntry.report
  }

  const rootPath = app.getPath('userData')
  const configPath = path.join(rootPath, 'config')
  const pluginConfigPath = path.join(configPath, 'plugins')
  const databasePath = path.join(rootPath, 'database')
  const logsPath = app.getPath('logs')
  const tempPath = path.join(rootPath, 'temp')

  let modules: StorageUsageNode[] = []
  let totalBytes = 0
  let totalSource: StorageUsageReport['totalSource'] = 'modules'

  if (include.modules) {
    const [configScan, pluginScan, databaseScan, logsScan, tempScan] = await Promise.all([
      scanPath(configPath),
      scanPath(pluginConfigPath),
      scanPath(databasePath),
      scanPath(logsPath),
      scanPath(tempPath)
    ])

    const configWithoutPlugins: ScanResult = {
      bytes: Math.max(0, configScan.bytes - pluginScan.bytes),
      fileCount: Math.max(0, configScan.fileCount - pluginScan.fileCount),
      dirCount: Math.max(0, configScan.dirCount - pluginScan.dirCount)
    }

    modules = [
      {
        key: 'plugins',
        label: '插件配置',
        path: pluginConfigPath,
        ...pluginScan
      },
      {
        key: 'config',
        label: '应用配置',
        path: configPath,
        ...configWithoutPlugins
      },
      {
        key: 'database',
        label: '数据库',
        path: databasePath,
        ...databaseScan
      },
      {
        key: 'logs',
        label: '日志',
        path: logsPath,
        ...logsScan
      },
      {
        key: 'temp',
        label: '临时文件',
        path: tempPath,
        ...tempScan
      }
    ]

    if (include.includeOther) {
      const rootScan = await scanPath(rootPath)
      const accountedBytes = modules.reduce((sum, node) => sum + node.bytes, 0)
      const otherBytes = Math.max(0, rootScan.bytes - accountedBytes)
      const other: StorageUsageNode = {
        key: 'other',
        label: '其他',
        path: rootPath,
        bytes: otherBytes,
        fileCount: 0,
        dirCount: 0
      }
      modules.push(other)
      totalBytes = rootScan.bytes
      totalSource = 'full'
    } else {
      totalBytes = modules.reduce((sum, node) => sum + node.bytes, 0)
      totalSource = 'modules'
    }
  }

  const plugins: PluginStorageUsage[] = []
  if (include.plugins) {
    try {
      const pluginDirs = await fs.readdir(pluginConfigPath, { withFileTypes: true })
      for (const entry of pluginDirs) {
        if (!entry.isDirectory()) continue
        const pluginName = entry.name
        const pluginPath = path.join(pluginConfigPath, pluginName)
        const usage = await scanPath(pluginPath)
        plugins.push({ name: pluginName, ...usage })
      }
    } catch {
      // ignore
    }
    plugins.sort((a, b) => b.bytes - a.bytes)
  }

  const databaseFile = path.join(databasePath, 'database.db')
  const databaseWal = `${databaseFile}-wal`
  const databaseShm = `${databaseFile}-shm`

  const [dbBytes, walBytes, shmBytes] = include.database
    ? await Promise.all([safeStat(databaseFile), safeStat(databaseWal), safeStat(databaseShm)])
    : [0, 0, 0]

  const tables = include.databaseTables ? await getDatabaseTables(options?.dbClient ?? null) : []

  const caches: CacheUsage[] = include.caches
    ? [
        {
          key: 'clipboard.memory',
          label: '剪贴板内存缓存',
          scope: 'memory',
          bytes: 0,
          entries: Number(options?.cacheStats?.['clipboard.memory'] ?? 0),
          ttlMs: null
        },
        {
          key: 'storage.lru',
          label: '配置 LRU 缓存',
          scope: 'memory',
          bytes: 0,
          entries: Number(options?.cacheStats?.['storage.lru'] ?? 0),
          ttlMs: null
        },
        {
          key: 'storage.plugins',
          label: '插件配置缓存',
          scope: 'memory',
          bytes: 0,
          entries: Number(options?.cacheStats?.['storage.plugins'] ?? 0),
          ttlMs: null
        },
        {
          key: 'update.cache',
          label: '更新检查缓存',
          scope: 'memory',
          bytes: 0,
          entries: Number(options?.cacheStats?.['update.cache'] ?? 0),
          ttlMs: null
        },
        {
          key: 'ai.quota',
          label: '智能配额缓存',
          scope: 'memory',
          bytes: 0,
          entries: Number(options?.cacheStats?.['ai.quota'] ?? 0),
          ttlMs: 10_000
        }
      ]
    : []

  const report: StorageUsageReport = {
    generatedAt: now,
    rootPath,
    totalBytes,
    totalSource,
    modules,
    plugins,
    database: {
      path: databaseFile,
      bytes: dbBytes,
      walBytes,
      shmBytes,
      tables,
      tablesLoaded: include.databaseTables
    },
    caches
  }

  cached.set(cacheKey, { at: now, report })
  return report
}
