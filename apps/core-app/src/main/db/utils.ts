import { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'
import { and, eq, sql } from 'drizzle-orm'

const createDbUtilsInternal = (db: LibSQLDatabase<typeof schema>): DbUtils => {
  return {
    getDb: () => db,

    // Keyword Mappings
    async addKeywordMapping(keyword: string, itemId: string, priority = 1.0) {
      return db.insert(schema.keywordMappings).values({ keyword, itemId, priority }).returning()
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
  addKeywordMapping: (keyword: string, itemId: string, priority?: number) => Promise<any>
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
  addEmbedding: (embedding: typeof schema.embeddings.$inferInsert) => Promise<any>
  addUsageLog: (log: typeof schema.usageLogs.$inferInsert) => Promise<any>
  incrementUsageSummary: (itemId: string) => Promise<any>
  getPluginData: (pluginId: string, key: string) => Promise<any>
  setPluginData: (pluginId: string, key: string, value: any) => Promise<any>
}

export function createDbUtils(db: LibSQLDatabase<typeof schema>): DbUtils {
  return createDbUtilsInternal(db)
}
