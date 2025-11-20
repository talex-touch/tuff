import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, eq, inArray, sql } from 'drizzle-orm'
import * as schema from './schema'

function createDbUtilsInternal(db: LibSQLDatabase<typeof schema>): DbUtils {
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
          set: { value },
        })
    },
    async addFileExtensions(extensions: { fileId: number, key: string, value: string }[]) {
      if (extensions.length === 0)
        return
      return db
        .insert(schema.fileExtensions)
        .values(extensions)
        .onConflictDoUpdate({
          target: [schema.fileExtensions.fileId, schema.fileExtensions.key],
          set: { value: sql`excluded.value` },
        })
    },
    async getFileExtensionsByFileIds(fileIds: number[], keys?: string[]) {
      if (fileIds.length === 0)
        return []
      const filters = [inArray(schema.fileExtensions.fileId, fileIds)]
      if (keys && keys.length > 0) {
        filters.push(inArray(schema.fileExtensions.key, keys))
      }
      const condition = filters.length === 1 ? filters[0] : and(...filters)
      return db
        .select({
          fileId: schema.fileExtensions.fileId,
          key: schema.fileExtensions.key,
          value: schema.fileExtensions.value,
        })
        .from(schema.fileExtensions)
        .where(condition)
    },
    async getFileExtensions(fileId: number) {
      return db.select().from(schema.fileExtensions).where(eq(schema.fileExtensions.fileId, fileId))
    },

    async setFileIndexProgress(
      fileId: number,
      data: Partial<Omit<typeof schema.fileIndexProgress.$inferInsert, 'fileId'>>,
    ) {
      const updatePayload = {
        ...data,
        updatedAt: data.updatedAt ?? new Date(),
      }

      return db
        .insert(schema.fileIndexProgress)
        .values({ fileId, ...updatePayload })
        .onConflictDoUpdate({
          target: schema.fileIndexProgress.fileId,
          set: {
            ...updatePayload,
          },
        })
    },

    async getFileIndexProgressByFileIds(fileIds: number[]) {
      if (fileIds.length === 0)
        return []
      return db
        .select()
        .from(schema.fileIndexProgress)
        .where(inArray(schema.fileIndexProgress.fileId, fileIds))
    },

    async getFileIndexProgressByPaths(paths: string[]) {
      if (paths.length === 0)
        return []
      return db
        .select({
          path: schema.files.path,
          progress: schema.fileIndexProgress.progress,
          status: schema.fileIndexProgress.status,
          processedBytes: schema.fileIndexProgress.processedBytes,
          totalBytes: schema.fileIndexProgress.totalBytes,
          updatedAt: schema.fileIndexProgress.updatedAt,
          lastError: schema.fileIndexProgress.lastError,
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
            lastUsed: new Date(),
          },
        })
    },
    async getUsageSummaryByItemIds(itemIds: string[]) {
      if (itemIds.length === 0)
        return []
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
      type: 'search' | 'execute' | 'cancel',
    ) {
      const now = new Date()
      const updateFields: any = {
        updatedAt: now,
      }

      if (type === 'search') {
        updateFields.searchCount = sql`${schema.itemUsageStats.searchCount} + 1`
        updateFields.lastSearched = now
      }
      else if (type === 'execute') {
        updateFields.executeCount = sql`${schema.itemUsageStats.executeCount} + 1`
        updateFields.lastExecuted = now
      }
      else if (type === 'cancel') {
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
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.itemUsageStats.sourceId, schema.itemUsageStats.itemId],
          set: updateFields,
        })
    },

    async getUsageStatsBatch(keys: Array<{ sourceId: string, itemId: string }>) {
      if (keys.length === 0)
        return []

      // 构建 OR 条件查询
      const conditions = keys.map(key =>
        and(
          eq(schema.itemUsageStats.sourceId, key.sourceId),
          eq(schema.itemUsageStats.itemId, key.itemId),
        ),
      )

      // SQLite 的 IN 查询对复合键支持不好，使用 OR 条件
      if (conditions.length === 1) {
        return db.select().from(schema.itemUsageStats).where(conditions[0])
      }

      // 对于多个条件，使用 sql 模板构建查询
      const sourceIds = keys.map(k => k.sourceId)
      const itemIds = keys.map(k => k.itemId)

      // 使用 IN 查询优化（预过滤）
      return db
        .select()
        .from(schema.itemUsageStats)
        .where(
          and(
            inArray(schema.itemUsageStats.sourceId, sourceIds),
            inArray(schema.itemUsageStats.itemId, itemIds),
          ),
        )
    },

    async getUsageStatsBySource(sourceId: string) {
      return db
        .select()
        .from(schema.itemUsageStats)
        .where(eq(schema.itemUsageStats.sourceId, sourceId))
    },

    // Item Time Stats
    async upsertItemTimeStats(stats: typeof schema.itemTimeStats.$inferInsert) {
      return db
        .insert(schema.itemTimeStats)
        .values(stats)
        .onConflictDoUpdate({
          target: [schema.itemTimeStats.sourceId, schema.itemTimeStats.itemId],
          set: {
            hourDistribution: stats.hourDistribution,
            dayOfWeekDistribution: stats.dayOfWeekDistribution,
            timeSlotDistribution: stats.timeSlotDistribution,
            lastUpdated: stats.lastUpdated || new Date(),
          },
        })
    },

    async getItemTimeStatsBatch(keys: Array<{ sourceId: string, itemId: string }>) {
      if (keys.length === 0)
        return []
      
      const sourceIds = keys.map(k => k.sourceId)
      const itemIds = keys.map(k => k.itemId)

      return db
        .select()
        .from(schema.itemTimeStats)
        .where(
          and(
            inArray(schema.itemTimeStats.sourceId, sourceIds),
            inArray(schema.itemTimeStats.itemId, itemIds),
          ),
        )
    },

    async getAllItemTimeStats() {
      return db.select().from(schema.itemTimeStats)
    },

    // Recommendation Cache
    async getRecommendationCache(cacheKey: string) {
      return db
        .select()
        .from(schema.recommendationCache)
        .where(eq(schema.recommendationCache.cacheKey, cacheKey))
        .get()
    },

    async setRecommendationCache(cacheKey: string, items: any[], expiresAt: Date) {
      return db
        .insert(schema.recommendationCache)
        .values({
          cacheKey,
          recommendedItems: JSON.stringify(items),
          createdAt: new Date(),
          expiresAt,
        })
        .onConflictDoUpdate({
          target: schema.recommendationCache.cacheKey,
          set: {
            recommendedItems: JSON.stringify(items),
            createdAt: new Date(),
            expiresAt,
          },
        })
    },

    async cleanExpiredRecommendationCache() {
      const now = new Date()
      return db
        .delete(schema.recommendationCache)
        .where(sql`${schema.recommendationCache.expiresAt} < ${now.getTime()}`)
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
          set: { value: stringValue },
        })
    },
    async deletePluginData(pluginId: string, key?: string) {
      if (key) {
        return db
          .delete(schema.pluginData)
          .where(and(eq(schema.pluginData.pluginId, pluginId), eq(schema.pluginData.key, key)))
      }
      return db.delete(schema.pluginData).where(eq(schema.pluginData.pluginId, pluginId))
    },
  }
}

export interface DbUtils {
  getDb: () => LibSQLDatabase<typeof schema>
  addKeywordMapping: (
    keyword: string,
    itemId: string,
    providerId: string,
    priority?: number,
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
  addFileExtensions: (extensions: { fileId: number, key: string, value: string }[]) => Promise<any>
  getFileExtensionsByFileIds: (
    fileIds: number[],
    keys?: string[],
  ) => Promise<
    Array<{
      fileId: number
      key: string
      value: string | null
    }>
  >
  getFileExtensions: (fileId: number) => Promise<any[]>
  setFileIndexProgress: (
    fileId: number,
    data: Partial<Omit<typeof schema.fileIndexProgress.$inferInsert, 'fileId'>>,
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
    itemIds: string[],
  ) => Promise<(typeof schema.usageSummary.$inferSelect)[]>
  incrementUsageStats: (
    sourceId: string,
    itemId: string,
    sourceType: string,
    type: 'search' | 'execute' | 'cancel',
  ) => Promise<any>
  getUsageStatsBatch: (
    keys: Array<{ sourceId: string, itemId: string }>,
  ) => Promise<(typeof schema.itemUsageStats.$inferSelect)[]>
  getUsageStatsBySource: (
    sourceId: string,
  ) => Promise<(typeof schema.itemUsageStats.$inferSelect)[]>
  upsertItemTimeStats: (stats: typeof schema.itemTimeStats.$inferInsert) => Promise<any>
  getItemTimeStatsBatch: (
    keys: Array<{ sourceId: string, itemId: string }>,
  ) => Promise<(typeof schema.itemTimeStats.$inferSelect)[]>
  getAllItemTimeStats: () => Promise<(typeof schema.itemTimeStats.$inferSelect)[]>
  getRecommendationCache: (cacheKey: string) => Promise<typeof schema.recommendationCache.$inferSelect | undefined>
  setRecommendationCache: (cacheKey: string, items: any[], expiresAt: Date) => Promise<any>
  cleanExpiredRecommendationCache: () => Promise<any>
  getPluginData: (pluginId: string, key: string) => Promise<any>
  setPluginData: (pluginId: string, key: string, value: any) => Promise<any>
  deletePluginData: (pluginId: string, key?: string) => Promise<any>
}

export function createDbUtils(db: LibSQLDatabase<typeof schema>): DbUtils {
  return createDbUtilsInternal(db)
}
