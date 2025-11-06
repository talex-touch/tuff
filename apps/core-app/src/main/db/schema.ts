// src/db/schema.ts

import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, primaryKey, real, customType } from 'drizzle-orm/sqlite-core'

// --- 自定义类型 (Custom Types) ---

/**
 * 自定义向量类型，用于在应用代码中的 number[] 数组和
 * SQLite TEXT 列中的 JSON 字符串之间进行转换。
 */
const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'text' // 在数据库中以 TEXT 类型存储
  },
  toDriver(value: number[]): string {
    // 将数组序列化为 JSON 字符串以便存储
    return JSON.stringify(value)
  },
  fromDriver(value: string): number[] {
    // 从数据库读取时，将 JSON 字符串解析回数组
    return JSON.parse(value)
  }
})

// =============================================================================
// 1. 闪电层 (Lightning Layer) - 快速关键词映射
// =============================================================================

/**
 * 存储关键词到具体项目的直接映射，用于极速的、非语义的查询。
 * 这是系统性能和响应速度的关键保障。
 * 数据来源: 插件定义的 keywords、应用别名、用户自定义。
 * e.g., '聊天' -> 'app:core-app-plugin/app/com.tencent.qq'
 */
export const keywordMappings = sqliteTable('keyword_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  keyword: text('keyword').notNull(), // 搜索关键词、标签或别名, e.g., '聊天', 'ps'

  // 映射的目标项目ID，采用 URI 格式，保证全局唯一
  itemId: text('item_id').notNull(),

  // 来源 provider，便于按提供者过滤与排查
  providerId: text('provider_id').notNull().default(''),

  // 用于排序的静态权重，可由插件或用户定义
  priority: real('priority').notNull().default(1.0)
})

// =============================================================================
// 2. 核心内容与实体存储 (Core Content & Entities)
// =============================================================================

/**
 * 存储文件系统的核心元数据。
 * 这是文件搜索、FTS全文检索和内容向量化的基础。
 */
export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(), // 文件的绝对路径
  name: text('name').notNull(),
  displayName: text('display_name'),
  extension: text('extension'),
  size: integer('size'),
  mtime: integer('mtime', { mode: 'timestamp' }).notNull(),
  ctime: integer('ctime', { mode: 'timestamp' }).notNull(),
  lastIndexedAt: integer('last_indexed_at', { mode: 'timestamp' }).notNull().default(new Date(0)),
  isDir: integer('is_dir', { mode: 'boolean' }).notNull().default(false),
  type: text('type').notNull().default('file'), // 'file', 'app', 'url', etc.

  // [AI] 可选的文件内容和向量化状态，用于智能层处理
  content: text('content'), // 仅对需要深度索引的文件类型存储内容
  embeddingStatus: text('embedding_status', { enum: ['none', 'pending', 'completed'] })
    .notNull()
    .default('none')
})

/**
 * 存储文件的扩展属性，如应用的 bundleId, icon 等
 */
export const fileExtensions = sqliteTable(
  'file_extensions',
  {
    fileId: integer('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value')
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fileId, table.key] })
  })
)

export const fileIndexProgress = sqliteTable(
  'file_index_progress',
  {
    fileId: integer('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['pending', 'processing', 'completed', 'skipped', 'failed']
    })
      .notNull()
      .default('pending'),
    progress: integer('progress').notNull().default(0),
    processedBytes: integer('processed_bytes'),
    totalBytes: integer('total_bytes'),
    lastError: text('last_error'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date(0))
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fileId] })
  })
)

// =============================================================================
// 3. 智能层 (Intelligence Layer) - 语义向量存储
// =============================================================================

/**
 * 内容向量表: 存储静态内容的语义向量，用于“语义搜索”。
 * 处理的是 "相关是什么" 的问题。
 */
export const embeddings = sqliteTable('embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceId: text('source_id').notNull(), // 多态关联ID, e.g., files.id
  sourceType: text('source_type').notNull(), // 源类型, e.g., 'file', 'note'
  embedding: vectorType('embedding').notNull(), // 内容的向量表示
  model: text('model').notNull(), // e.g., 'bge-base-zh-v1.5'
  contentHash: text('content_hash'), // 源内容的哈希，用于检测变化以决定是否更新向量
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
})

/**
 * 行为上下文向量表: 存储用户行为序列的语义向量，用于“意图预测”和“主动推荐”。
 * 处理的是 "在什么场景下，想做什么事" 的问题。
 */
export const contextualEmbeddings = sqliteTable('contextual_embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().unique(), // 一次完整用户交互会话的ID

  // 将行为序列转换成的自然语言描述，便于理解、调试和向量化
  // e.g., "用户在 VS Code 中，刚复制了一段代码，然后搜索了'JSON格式化'"
  contextText: text('context_text').notNull(),

  embedding: vectorType('embedding').notNull(), // 行为上下文的向量表示
  model: text('model').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull()
})

// =============================================================================
// 4. 用户行为原始日志与配置 (Usage Logs & Config)
// =============================================================================

/**
 * 存储每一次具体的用户交互，作为最原始、最详细的流水记录。
 * 这是生成 `usageSummary` 和 `contextualEmbeddings` 的数据源。
 */
export const usageLogs = sqliteTable('usage_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'), // 关联到 contextualEmbeddings
  itemId: text('item_id').notNull(), // 全局唯一的项目ID
  source: text('source').notNull(), // e.g., 'files', 'clipboard_history'
  action: text('action').notNull(), // e.g., 'click', 'execute'
  keyword: text('keyword'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  // 以JSON字符串形式存储更多上下文信息
  context: text('context') // e.g., { "prev_app": "com.figma.Desktop", "window_title": "..." }
})

/**
 * 行为频率汇总表，用于聚合与重排层快速获取常用项和最近使用项。
 * 避免了实时计算，是性能优化的关键。
 */
export const usageSummary = sqliteTable('usage_summary', {
  itemId: text('item_id').primaryKey(),
  clickCount: integer('click_count').notNull().default(0),
  lastUsed: integer('last_used', { mode: 'timestamp' }).notNull()
})

/**
 * 基于 source + item 组合键的使用统计表。
 * 用于更精确地统计不同来源下相同项目的使用频率，支持搜索和执行的独立统计。
 * 这是智能排序和推荐的核心数据基础。
 */
export const itemUsageStats = sqliteTable(
  'item_usage_stats',
  {
    sourceId: text('source_id').notNull(), // 来源标识符 (source.id)
    itemId: text('item_id').notNull(), // 项目标识符 (item.id)
    sourceType: text('source_type').notNull(), // 来源类型 (source.type)
    searchCount: integer('search_count').notNull().default(0), // 搜索次数
    executeCount: integer('execute_count').notNull().default(0), // 执行次数
    cancelCount: integer('cancel_count').notNull().default(0), // 取消/失败次数
    lastSearched: integer('last_searched', { mode: 'timestamp' }), // 最后搜索时间
    lastExecuted: integer('last_executed', { mode: 'timestamp' }), // 最后执行时间
    lastCancelled: integer('last_cancelled', { mode: 'timestamp' }), // 最后取消时间
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sourceId, table.itemId] })
  })
)

/**
 * 查询前缀完成表
 * 存储用户的查询前缀与实际执行的项目的映射关系
 * 用于自动完成优化和动态匹配权重调整
 */
export const queryCompletions = sqliteTable('query_completions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  prefix: text('prefix').notNull(), // 查询前缀（规范化后）
  sourceId: text('source_id').notNull(), // 执行项的来源ID
  itemId: text('item_id').notNull(), // 执行项的ID
  completionCount: integer('completion_count').notNull().default(1), // 完成次数
  lastCompleted: integer('last_completed', { mode: 'timestamp' }).notNull(), // 最后完成时间
  avgQueryLength: real('avg_query_length').notNull().default(0), // 平均查询长度
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
})

/**
 * 为插件提供统一的、隔离的持久化键值对存储能力。
 */
export const pluginData = sqliteTable(
  'plugin_data',
  {
    pluginId: text('plugin_id').notNull(),
    key: text('key').notNull(),
    value: text('value') // 存储为 JSON string
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pluginId, table.key] })
  })
)

/**
 * 存储 Tuff 自身的全局配置项。
 */
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value') // 存储为 JSON string
})

/**
 * 记录全量扫描的进度，用于断点续传。
 */
export const scanProgress = sqliteTable('scan_progress', {
  path: text('path').primaryKey(), // 已经完成全量扫描的目录路径
  lastScanned: integer('last_scanned', { mode: 'timestamp' }).notNull().default(new Date(0))
})

/**
 * 存储剪贴板历史记录。
 * 这是剪贴板增强功能（如历史搜索、自动粘贴）的核心数据来源。
 */
export const clipboardHistory = sqliteTable('clipboard_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // 内容核心
  type: text('type', { enum: ['text', 'image', 'files'] }).notNull(),
  content: text('content').notNull(), // 纯文本内容, 或文件路径的 JSON 数组
  rawContent: text('raw_content'), // 可选的原始富文本内容 (e.g., HTML)
  thumbnail: text('thumbnail'), // 可选的图片 Base64 缩略图 (Data URL)

  // 上下文信息
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  sourceApp: text('source_app'), // 来源应用 (macOS only, best-effort)

  // 用户交互与元数据
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  metadata: text('metadata') // 存储其他元数据 (JSON string)
})

/**
 * 扩展的剪贴板元数据表。
 * 每条记录代表一个 key-value 元数据项，用于存储 OCR 结果等扩展信息。
 */
export const clipboardHistoryMeta = sqliteTable('clipboard_history_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clipboardId: integer('clipboard_id')
    .notNull()
    .references(() => clipboardHistory.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
})

/**
 * OCR 任务队列表，用于跟踪后台识别的生命周期。
 */
export const ocrJobs = sqliteTable('ocr_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clipboardId: integer('clipboard_id').references(() => clipboardHistory.id, {
    onDelete: 'cascade'
  }),
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled']
  })
    .notNull()
    .default('pending'),
  priority: integer('priority').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  payloadHash: text('payload_hash'),
  meta: text('meta'),
  queuedAt: integer('queued_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' })
})

/**
 * OCR 结果表，存储识别文本和置信度等信息。
 */
export const ocrResults = sqliteTable('ocr_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id')
    .notNull()
    .references(() => ocrJobs.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  confidence: real('confidence'),
  language: text('language'),
  checksum: text('checksum'),
  extra: text('extra'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
})
