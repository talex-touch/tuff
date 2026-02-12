import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../db/schema'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { eq, and, sql } from 'drizzle-orm'
import { getLogger } from '@talex-touch/utils/common/logger'
import { embeddings as embeddingsSchema } from '../../../../db/schema'
import { dbWriteScheduler } from '../../../../db/db-write-scheduler'
import { withSqliteRetry } from '../../../../db/sqlite-retry'
import { ai } from '../../../ai/intelligence-sdk'

const logger = getLogger('EmbeddingService')

const SOURCE_TYPE = 'file'
const MAX_TEXT_LENGTH = 8000
const BATCH_SIZE = 5
const EMBEDDING_CACHE_TTL = 30 * 60 * 1000 // 30 min

interface EmbeddingSearchResult {
  sourceId: string
  score: number
}

interface CachedEmbedding {
  vector: number[]
  timestamp: number
}

export class EmbeddingService {
  private available: boolean | null = null
  private queryCache = new Map<string, CachedEmbedding>()

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  /**
   * Check if the embedding capability is available.
   * Caches the result to avoid repeated probing.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available

    try {
      const result = await ai.embedding.generate({ text: 'test' })
      this.available = Array.isArray(result?.result) && result.result.length > 0
    } catch {
      this.available = false
    }

    logger.info(`Embedding capability available: ${this.available}`)
    return this.available
  }

  /** Reset availability cache (e.g. after config change). */
  resetAvailability(): void {
    this.available = null
  }

  /**
   * Generate and store embedding for a single file.
   * Skips if content hash hasn't changed.
   */
  async indexFile(fileId: string, content: string): Promise<void> {
    if (!(await this.isAvailable())) return
    if (!content?.trim()) return

    const truncated = content.slice(0, MAX_TEXT_LENGTH)
    const contentHash = this.hashContent(truncated)

    // Check if embedding already exists with same hash
    const existing = await this.db
      .select({ id: embeddingsSchema.id, contentHash: embeddingsSchema.contentHash })
      .from(embeddingsSchema)
      .where(
        and(eq(embeddingsSchema.sourceId, fileId), eq(embeddingsSchema.sourceType, SOURCE_TYPE))
      )
      .limit(1)

    if (existing.length > 0 && existing[0].contentHash === contentHash) {
      return // Content unchanged, skip
    }

    try {
      const result = await ai.embedding.generate({ text: truncated })
      const vector = result.result

      await dbWriteScheduler.schedule('embedding.index', () =>
        withSqliteRetry(
          async () => {
            // Upsert: delete old then insert new
            await this.db
              .delete(embeddingsSchema)
              .where(
                and(
                  eq(embeddingsSchema.sourceId, fileId),
                  eq(embeddingsSchema.sourceType, SOURCE_TYPE)
                )
              )

            await this.db.insert(embeddingsSchema).values({
              sourceId: fileId,
              sourceType: SOURCE_TYPE,
              embedding: vector,
              model: result.model || 'unknown',
              contentHash
            })
          },
          { label: 'embedding.index' }
        )
      )
    } catch (err) {
      logger.warn(`Failed to index embedding for file ${fileId}: ${err}`)
    }
  }

  /**
   * Batch index multiple files. Processes in chunks to avoid overloading.
   */
  async indexFiles(
    files: Array<{ fileId: string; content: string }>
  ): Promise<{ indexed: number; skipped: number; failed: number }> {
    if (!(await this.isAvailable())) {
      return { indexed: 0, skipped: files.length, failed: 0 }
    }

    const start = performance.now()
    let indexed = 0
    let skipped = 0
    let failed = 0

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(({ fileId, content }) => this.indexFile(fileId, content))
      )

      for (const r of results) {
        if (r.status === 'fulfilled') indexed++
        else failed++
      }
    }

    skipped = files.length - indexed - failed
    logger.info(
      `Batch embedding: ${indexed} indexed, ${skipped} skipped, ${failed} failed ` +
        `in ${(performance.now() - start).toFixed(0)}ms`
    )
    return { indexed, skipped, failed }
  }

  /**
   * Remove embeddings for given file IDs.
   */
  async removeFiles(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return

    await dbWriteScheduler.schedule('embedding.remove', () =>
      withSqliteRetry(
        async () => {
          for (const fileId of fileIds) {
            await this.db
              .delete(embeddingsSchema)
              .where(
                and(
                  eq(embeddingsSchema.sourceId, fileId),
                  eq(embeddingsSchema.sourceType, SOURCE_TYPE)
                )
              )
          }
        },
        { label: 'embedding.remove' }
      )
    )
  }

  /**
   * Semantic search: embed the query, then find top-K similar files
   * using cosine similarity computed in application code.
   */
  async semanticSearch(query: string, limit = 20): Promise<EmbeddingSearchResult[]> {
    if (!(await this.isAvailable())) return []
    if (!query?.trim()) return []

    const start = performance.now()

    // Generate query embedding (with cache)
    const queryVector = await this.getQueryEmbedding(query)
    if (!queryVector) return []

    // Load all file embeddings from DB
    const rows = await this.db
      .select({
        sourceId: embeddingsSchema.sourceId,
        embedding: embeddingsSchema.embedding
      })
      .from(embeddingsSchema)
      .where(eq(embeddingsSchema.sourceType, SOURCE_TYPE))

    if (rows.length === 0) return []

    // Compute cosine similarity for each
    const scored: EmbeddingSearchResult[] = []
    for (const row of rows) {
      const score = cosineSimilarity(queryVector, row.embedding)
      if (score > 0.3) {
        scored.push({ sourceId: row.sourceId, score })
      }
    }

    // Sort by score descending, take top-K
    scored.sort((a, b) => b.score - a.score)
    const results = scored.slice(0, limit)

    logger.debug(
      `Semantic search: "${query}" → ${results.length}/${rows.length} matches ` +
        `in ${(performance.now() - start).toFixed(0)}ms`
    )
    return results
  }

  /**
   * Get embedding count for monitoring.
   */
  async getEmbeddingCount(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(embeddingsSchema)
      .where(eq(embeddingsSchema.sourceType, SOURCE_TYPE))
    return result[0]?.count ?? 0
  }

  private async getQueryEmbedding(query: string): Promise<number[] | null> {
    const cacheKey = query.trim().toLowerCase()
    const cached = this.queryCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < EMBEDDING_CACHE_TTL) {
      return cached.vector
    }

    try {
      const result = await ai.embedding.generate({ text: query })
      const vector = result.result

      this.queryCache.set(cacheKey, { vector, timestamp: Date.now() })

      // Evict old cache entries
      if (this.queryCache.size > 100) {
        const oldest = [...this.queryCache.entries()]
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, 20)
        for (const [key] of oldest) {
          this.queryCache.delete(key)
        }
      }

      return vector
    } catch (err) {
      logger.warn(`Failed to generate query embedding: ${err}`)
      return null
    }
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
  }
}

/**
 * Cosine similarity between two vectors.
 * Returns value in [-1, 1], higher = more similar.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
