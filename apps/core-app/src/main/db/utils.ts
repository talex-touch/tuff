import { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'
import { and, eq, inArray, sql } from 'drizzle-orm'

const createDbUtilsInternal = (db: LibSQLDatabase<typeof schema>): DbUtils => {
  return {
    getDb: () => db,

    // Keyword Mappings
    async addKeywordMapping(keyword: string, itemId: string, providerId: string, priority = 1.0) {
      return db
        .insert(schema.keywordMappings)
        .values({ keyword, itemId, providerId, priority })
        .returning()
    },
    async getKeywordMapping(keyword: string) {
      return db
        .select()
        .from(schema.keywordMappings)
        .where(eq(schema.keywordMappings.keyword, keyword))
    },
    async removeKeywordMapping(keyword: string) {
      return db.delete(schema.keywordMappings).where(eq(schema.keywordMappings.keyword, keyword))
    },

    // Files
    async addFile(file: typeof schema.files.$inferInsert) {
      return db.insert(schema.files).values(file).returning()
    },
    async getFileByPath(path: string) {
      return db.select().from(schema.files).where(eq(schema.files.path, path)).get()
    },
    async updateFile(path: string, data: Partial<typeof schema.files.$inferInsert>) {
      return db.update(schema.files).set(data).where(eq(schema.files.path, path)).returning()
    },
    async removeFile(path: string) {
      return db.delete(schema.files).where(eq(schema.files.path, path))
    },
    async getAllFiles() {
      return db.select().from(schema.files)
    },
    async getFilesByType(type: string) {
      return db.select().from(schema.files).where(eq(schema.files.type, type))
    },
    async clearFilesByType(type: string) {
      return db.delete(schema.files).where(eq(schema.files.type, type))
    },

    // File Extensions
    async addFileExtension(fileId: number, key: string, value: string) {
      return db
        .insert(schema.fileExtensions)
        .values({ fileId, key, value })
        .onConflictDoUpdate({
          target: [schema.fileExtensions.fileId, schema.fileExtensions.key],
          set: { value }
        })
    },
    async addFileExtensions(extensions: { fileId: number; key: string; value: string }[]) {
      if (extensions.length === 0) return
      return db
        .insert(schema.fileExtensions)
        .values(extensions)
        .onConflictDoUpdate({
          target: [schema.fileExtensions.fileId, schema.fileExtensions.key],
          set: { value: sql`excluded.value` }
        })
    },
    async getFileExtensions(fileId: number) {
      return db.select().from(schema.fileExtensions).where(eq(schema.fileExtensions.fileId, fileId))
    },

    async setFileIndexProgress(
      fileId: number,
      data: Partial<Omit<typeof schema.fileIndexProgress.$inferInsert, 'fileId'>>
    ) {
      const updatePayload = {
        ...data,
        updatedAt: data.updatedAt ?? new Date()
      }

      return db
        .insert(schema.fileIndexProgress)
        .values({ fileId, ...updatePayload })
        .onConflictDoUpdate({
          target: schema.fileIndexProgress.fileId,
          set: {
            ...updatePayload
          }
        })
    },

    async getFileIndexProgressByFileIds(fileIds: number[]) {
      if (fileIds.length === 0) return []
      return db
        .select()
        .from(schema.fileIndexProgress)
        .where(inArray(schema.fileIndexProgress.fileId, fileIds))
    },

    async getFileIndexProgressByPaths(paths: string[]) {
      if (paths.length === 0) return []
      return db
        .select({
          path: schema.files.path,
          progress: schema.fileIndexProgress.progress,
          status: schema.fileIndexProgress.status,
          processedBytes: schema.fileIndexProgress.processedBytes,
          totalBytes: schema.fileIndexProgress.totalBytes,
          updatedAt: schema.fileIndexProgress.updatedAt,
          lastError: schema.fileIndexProgress.lastError
        })
        .from(schema.files)
        .leftJoin(schema.fileIndexProgress, eq(schema.files.id, schema.fileIndexProgress.fileId))
        .where(inArray(schema.files.path, paths))
    },

    // Embeddings
    async addEmbedding(embedding: typeof schema.embeddings.$inferInsert) {
      return db.insert(schema.embeddings).values(embedding).returning()
    },

    // Usage Logs
    async addUsageLog(log: typeof schema.usageLogs.$inferInsert) {
      return db.insert(schema.usageLogs).values(log).returning()
    },

    // Usage Summary
    async incrementUsageSummary(itemId: string) {
      return db
        .insert(schema.usageSummary)
        .values({ itemId, clickCount: 1, lastUsed: new Date() })
        .onConflictDoUpdate({
          target: schema.usageSummary.itemId,
          set: {
            clickCount: sql`${schema.usageSummary.clickCount} + 1`,
            lastUsed: new Date()
          }
        })
    },
    async getUsageSummaryByItemIds(itemIds: string[]) {
      if (itemIds.length === 0) return []
      return db
        .select()
        .from(schema.usageSummary)
        .where(inArray(schema.usageSummary.itemId, itemIds))
    },

    // Item Usage Stats (source + item 组合键统计)
    async incrementUsageStats(
      sourceId: string,
      itemId: string,
      sourceType: string,
      type: 'search' | 'execute' | 'cancel'
    ) {
      const now = new Date()
      const updateFields: any = {
        updatedAt: now
      }

      if (type === 'search') {
        updateFields.searchCount = sql`${schema.itemUsageStats.searchCount} + 1`
        updateFields.lastSearched = now
      } else if (type === 'execute') {
        updateFields.executeCount = sql`${schema.itemUsageStats.executeCount} + 1`
        updateFields.lastExecuted = now
      } else if (type === 'cancel') {
        updateFields.cancelCount = sql`${schema.itemUsageStats.cancelCount} + 1`
        updateFields.lastCancelled = now
      }

      return db
        .insert(schema.itemUsageStats)
        .values({
          sourceId,
          itemId,
          sourceType,
          searchCount: type === 'search' ? 1 : 0,
          executeCount: type === 'execute' ? 1 : 0,
          cancelCount: type === 'cancel' ? 1 : 0,
          lastSearched: type === 'search' ? now : null,
          lastExecuted: type === 'execute' ? now : null,
          lastCancelled: type === 'cancel' ? now : null,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [schema.itemUsageStats.sourceId, schema.itemUsageStats.itemId],
          set: updateFields
        })
    },

    async getUsageStatsBatch(keys: Array<{ sourceId: string; itemId: string }>) {
      if (keys.length === 0) return []

      // 构建 OR 条件查询
      const conditions = keys.map((key) =>
        and(
          eq(schema.itemUsageStats.sourceId, key.sourceId),
          eq(schema.itemUsageStats.itemId, key.itemId)
        )
      )

      // SQLite 的 IN 查询对复合键支持不好，使用 OR 条件
      if (conditions.length === 1) {
        return db.select().from(schema.itemUsageStats).where(conditions[0])
      }

      // 对于多个条件，使用 sql 模板构建查询
      const sourceIds = keys.map((k) => k.sourceId)
      const itemIds = keys.map((k) => k.itemId)

      // 使用 IN 查询优化（预过滤）
      return db
        .select()
        .from(schema.itemUsageStats)
        .where(
          and(
            inArray(schema.itemUsageStats.sourceId, sourceIds),
            inArray(schema.itemUsageStats.itemId, itemIds)
          )
        )
    },

    async getUsageStatsBySource(sourceId: string) {
      return db
        .select()
        .from(schema.itemUsageStats)
        .where(eq(schema.itemUsageStats.sourceId, sourceId))
    },

    // Plugin Data
    async getPluginData(pluginId: string, key: string) {
      return db
        .select()
        .from(schema.pluginData)
        .where(and(eq(schema.pluginData.pluginId, pluginId), eq(schema.pluginData.key, key)))
        .get()
    },
    async setPluginData(pluginId: string, key: string, value: any) {
      const stringValue = JSON.stringify(value)
      return db
        .insert(schema.pluginData)
        .values({ pluginId, key, value: stringValue })
        .onConflictDoUpdate({
          target: [schema.pluginData.pluginId, schema.pluginData.key],
          set: { value: stringValue }
        })
    }
  }
}

export type DbUtils = {
  getDb: () => LibSQLDatabase<typeof schema>
  addKeywordMapping: (
    keyword: string,
    itemId: string,
    providerId: string,
    priority?: number
  ) => Promise<any>
  getKeywordMapping: (keyword: string) => Promise<any>
  removeKeywordMapping: (keyword: string) => Promise<any>
  addFile: (file: typeof schema.files.$inferInsert) => Promise<any>
  getFileByPath: (path: string) => Promise<any>
  updateFile: (path: string, data: Partial<typeof schema.files.$inferInsert>) => Promise<any>
  removeFile: (path: string) => Promise<any>
  getAllFiles: () => Promise<any[]>
  getFilesByType: (type: string) => Promise<any[]>
  clearFilesByType: (type: string) => Promise<any>
  addFileExtension: (fileId: number, key: string, value: string) => Promise<any>
  addFileExtensions: (extensions: { fileId: number; key: string; value: string }[]) => Promise<any>
  getFileExtensions: (fileId: number) => Promise<any[]>
  setFileIndexProgress: (
    fileId: number,
    data: Partial<Omit<typeof schema.fileIndexProgress.$inferInsert, 'fileId'>>
  ) => Promise<any>
  getFileIndexProgressByFileIds: (fileIds: number[]) => Promise<any[]>
  getFileIndexProgressByPaths: (paths: string[]) => Promise<
    Array<{
      path: string
      progress: number | null
      status: string | null
      processedBytes: number | null
      totalBytes: number | null
      updatedAt: Date | null
      lastError: string | null
    }>
  >
  addEmbedding: (embedding: typeof schema.embeddings.$inferInsert) => Promise<any>
  addUsageLog: (log: typeof schema.usageLogs.$inferInsert) => Promise<any>
  incrementUsageSummary: (itemId: string) => Promise<any>
  getUsageSummaryByItemIds: (
    itemIds: string[]
  ) => Promise<(typeof schema.usageSummary.$inferSelect)[]>
  incrementUsageStats: (
    sourceId: string,
    itemId: string,
    sourceType: string,
    type: 'search' | 'execute' | 'cancel'
  ) => Promise<any>
  getUsageStatsBatch: (
    keys: Array<{ sourceId: string; itemId: string }>
  ) => Promise<(typeof schema.itemUsageStats.$inferSelect)[]>
  getUsageStatsBySource: (
    sourceId: string
  ) => Promise<(typeof schema.itemUsageStats.$inferSelect)[]>
  getPluginData: (pluginId: string, key: string) => Promise<any>
  setPluginData: (pluginId: string, key: string, value: any) => Promise<any>
}

export function createDbUtils(db: LibSQLDatabase<typeof schema>): DbUtils {
  return createDbUtilsInternal(db)
}
