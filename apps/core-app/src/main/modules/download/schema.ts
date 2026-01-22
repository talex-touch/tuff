import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const downloadTasksSchema = sqliteTable(
  'download_tasks',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    destination: text('destination').notNull(),
    filename: text('filename').notNull(),
    priority: integer('priority').notNull(),
    module: text('module').notNull(),
    status: text('status').notNull(),
    totalSize: integer('total_size'),
    downloadedSize: integer('downloaded_size').default(0),
    checksum: text('checksum'),
    metadata: text('metadata'), // JSON string
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    completedAt: integer('completed_at'),
    error: text('error')
  },
  (table) => ({
    statusIdx: index('idx_tasks_status').on(table.status),
    createdAtIdx: index('idx_tasks_created').on(table.createdAt),
    priorityIdx: index('idx_tasks_priority').on(table.priority),
    statusPriorityIdx: index('idx_tasks_status_priority').on(table.status, table.priority)
  })
)

export const downloadChunksSchema = sqliteTable(
  'download_chunks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => downloadTasksSchema.id),
    index: integer('index').notNull(),
    start: integer('start').notNull(),
    end: integer('end').notNull(),
    size: integer('size').notNull(),
    downloaded: integer('downloaded').default(0),
    status: text('status').notNull(),
    filePath: text('file_path').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    taskIdIdx: index('idx_chunks_task').on(table.taskId),
    taskIdIndexIdx: index('idx_chunks_task_index').on(table.taskId, table.index)
  })
)

export const downloadHistorySchema = sqliteTable(
  'download_history',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    url: text('url').notNull(),
    filename: text('filename').notNull(),
    module: text('module').notNull(),
    status: text('status').notNull(),
    totalSize: integer('total_size'),
    downloadedSize: integer('downloaded_size'),
    duration: integer('duration'), // seconds
    averageSpeed: integer('average_speed'), // bytes/s
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at')
  },
  (table) => ({
    createdAtIdx: index('idx_history_created').on(table.createdAt),
    completedAtIdx: index('idx_history_completed').on(table.completedAt)
  })
)

export const downloadTasksRelations = relations(downloadTasksSchema, ({ many }) => ({
  chunks: many(downloadChunksSchema)
}))

export const downloadChunksRelations = relations(downloadChunksSchema, ({ one }) => ({
  task: one(downloadTasksSchema, {
    fields: [downloadChunksSchema.taskId],
    references: [downloadTasksSchema.id]
  })
}))

export type DownloadTask = typeof downloadTasksSchema.$inferSelect
export type DownloadChunk = typeof downloadChunksSchema.$inferSelect
export type DownloadHistory = typeof downloadHistorySchema.$inferSelect

export type NewDownloadTask = typeof downloadTasksSchema.$inferInsert
export type NewDownloadChunk = typeof downloadChunksSchema.$inferInsert
export type NewDownloadHistory = typeof downloadHistorySchema.$inferInsert
