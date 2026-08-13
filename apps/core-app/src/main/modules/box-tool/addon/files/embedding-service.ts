import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../db/schema'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { eq, and, sql } from 'drizzle-orm'
import { getLogger } from '@talex-touch/utils/common/logger'
import { embeddings as embeddingsSchema } from '../../../../db/schema'
import { scheduleDbWrite } from '../../../../db/db-write'
import { tuffIntelligence } from '../../../ai/intelligence-sdk'
import { enterPerfContext } from '../../../../utils/perf-context'

const logger = getLogger('EmbeddingService')

const SOURCE_TYPE = 'file'
const MAX_TEXT_LENGTH = 8000
const BATCH_SIZE = 5
const EMBEDDING_CACHE_TTL = 30 * 60 * 1000 // 30 min
const SEMANTIC_SEARCH_SCAN_LIMIT = 1000

interface EmbeddingSearchResult {
  sourceId: string
  score: number
}

interface CachedEmbedding {
  vector: number[]
  timestamp: number
}

/**
 * Split-aware database routing for embeddings, mirroring the dbUtils split
 * context (db/utils.ts, issue #295): embeddings are a split-routed table, so
 * they must have exactly ONE home — the worker-owned search file when the
 * split is on, the primary file when it is off. Every member is resolved PER
 * CALL, never captured at construction, so late fallbacks (the aux
 * resolver-timing trap class) cannot leave this service writing a stale file.
 */
export interface EmbeddingDbRouting {
  /** Call-time split decision — mirrors DbUtilsSplitContext.enabled. */
  isSplitEnabled(): boolean
  /** Read connection: the search file when the split is on (falls back to primary until ready). */
  getReadDb(): LibSQLDatabase<typeof schema>
  /** Primary connection: builds compiled statements and runs split-off scheduled writes. */
  getPrimaryDb(): LibSQLDatabase<typeof schema>
  /** Split-on writes: forward compiled statements to the worker — the sole writer of its file. */
  execWrite(
    statements: Array<{ sql: string; args: unknown[] }>,
    mode?: 'single' | 'transaction'
  ): Promise<unknown>
}

interface CompilableQuery {
  toSQL(): { sql: string; params: unknown[] }
}

export class EmbeddingService {
  private available: boolean | null = null
  private queryCache = new Map<string, CachedEmbedding>()

  constructor(private readonly routing: EmbeddingDbRouting) {}

  /**
   * Mirror of dbUtils' split-aware runWrite (db/utils.ts): split on → compile
   * the drizzle builders and forward them to the worker; split off → await the
   * builders on the primary db under the shared write scheduler
   * (scheduleDbWrite keeps the existing labels and busy-retry semantics).
   */
  private async runWrite(
    label: string,
    queries: CompilableQuery[],
    mode: 'single' | 'transaction' = 'single'
  ): Promise<void> {
    if (queries.length === 0) return

    if (this.routing.isSplitEnabled()) {
      const statements = queries.map((query) => {
        const compiled = query.toSQL()
        return { sql: compiled.sql, args: compiled.params }
      })
      await this.routing.execWrite(statements, mode)
      return
    }

    await scheduleDbWrite(label, async () => {
      for (const query of queries) {
        await (query as unknown as Promise<unknown>)
      }
    })
  }

  /**
   * Check if the embedding capability is available.
   * Caches the result to avoid repeated probing.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available

    try {
      const disposeCheck = enterPerfContext('Embedding.isAvailable', { textLength: 4 })
      try {
        const result = await tuffIntelligence.embedding.generate({ text: 'test' })
        this.available = Array.isArray(result?.result) && result.result.length > 0
      } finally {
        disposeCheck()
      }
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
    const existing = await this.routing
      .getReadDb()
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
      const result = await tuffIntelligence.embedding.generate({ text: truncated })
      const vector = result.result

      // Upsert: delete old then insert new (one atomic transaction on the
      // worker path so the delete/insert pair cannot tear).
      const writeDb = this.routing.getPrimaryDb()
      await this.runWrite(
        'embedding.index',
        [
          writeDb
            .delete(embeddingsSchema)
            .where(
              and(
                eq(embeddingsSchema.sourceId, fileId),
                eq(embeddingsSchema.sourceType, SOURCE_TYPE)
              )
            ),
          writeDb.insert(embeddingsSchema).values({
            sourceId: fileId,
            sourceType: SOURCE_TYPE,
            embedding: vector,
            model: result.model || 'unknown',
            contentHash
          })
        ],
        'transaction'
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

    const writeDb = this.routing.getPrimaryDb()
    await this.runWrite(
      'embedding.remove',
      fileIds.map((fileId) =>
        writeDb
          .delete(embeddingsSchema)
          .where(
            and(eq(embeddingsSchema.sourceId, fileId), eq(embeddingsSchema.sourceType, SOURCE_TYPE))
          )
      )
    )
  }

  /**
   * Semantic search: embed the query, then find top-K similar files
   * using cosine similarity computed in application code.
   */
  async semanticSearch(query: string, limit = 20): Promise<EmbeddingSearchResult[]> {
    const disposeSearch = enterPerfContext('Embedding.semanticSearch', {
      queryLength: query?.length ?? 0,
      limit
    })
    try {
      if (!(await this.isAvailable())) return []
      if (!query?.trim()) return []

      const start = performance.now()

      // Generate query embedding (with cache)
      const queryVector = await this.getQueryEmbedding(query)
      if (!queryVector) return []

      // Bound best-effort semantic recall. The local SQLite vector store has
      // no ANN index, so scoring every persisted file embedding can spike CPU
      // and memory on large file indexes.
      const scanLimit = Math.max(limit, SEMANTIC_SEARCH_SCAN_LIMIT)
      const rows = await this.routing
        .getReadDb()
        .select({
          sourceId: embeddingsSchema.sourceId,
          embedding: embeddingsSchema.embedding
        })
        .from(embeddingsSchema)
        .where(eq(embeddingsSchema.sourceType, SOURCE_TYPE))
        .limit(scanLimit)

      if (rows.length === 0) return []

      // Compute cosine similarity for each
      const disposeScore = enterPerfContext('Embedding.semanticScore', { rows: rows.length })
      const scored: EmbeddingSearchResult[] = []
      try {
        for (const row of rows) {
          const score = cosineSimilarity(queryVector, row.embedding)
          if (score > 0.3) {
            scored.push({ sourceId: row.sourceId, score })
          }
        }
      } finally {
        disposeScore()
      }

      // Sort by score descending, take top-K
      scored.sort((a, b) => b.score - a.score)
      const results = scored.slice(0, limit)

      logger.debug(
        `Semantic search: "${query}" → ${results.length}/${rows.length} matches ` +
          `in ${(performance.now() - start).toFixed(0)}ms`
      )
      return results
    } finally {
      disposeSearch()
    }
  }

  /**
   * Get embedding count for monitoring.
   */
  async getEmbeddingCount(): Promise<number> {
    const result = await this.routing
      .getReadDb()
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
      const result = await tuffIntelligence.embedding.generate({ text: query })
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
