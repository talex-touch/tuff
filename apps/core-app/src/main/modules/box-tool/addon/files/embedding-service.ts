import type { BatchItem } from 'drizzle-orm/batch'
import { tuffIntelligence } from '../../../ai/intelligence-sdk'
import {
  getLocalEmbeddingRuntime,
  type LocalEmbeddingImageInput
} from '../../../ai/local-embedding-runtime'
import { LOCAL_EMBEDDING_MODEL_KEY } from '../../../ai/local-embedding-model'
import { runWithEmbeddingPriority } from '../../../ai/local-embedding-queue'
import type { FileParserChunk } from '@talex-touch/utils/electron/file-parsers'
import { hashFileContentChunk } from './services/file-content-match'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../db/schema'
import { performance } from 'node:perf_hooks'
import { stat } from 'node:fs/promises'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  embeddings as embeddingsSchema,
  fileIndexProgress,
  files as filesSchema
} from '../../../../db/schema'
import { scheduleDbWrite } from '../../../../db/db-write'
import { encodeVectorBlob } from '../../../../db/embedding-vector-codec'
import { onUsageLimitsChanged, readUsageLimitInfo } from '../../../ai/usage-ledger/usage-limits'
import { enterPerfContext } from '../../../../utils/perf-context'
import {
  SearchIndexReadWorkerClient,
  type SearchIndexReadWorkerClientOptions
} from '../../search-engine/workers/search-index-read-worker-client'

const logger = getLogger('EmbeddingService')

const SOURCE_TYPE = 'file'
const MAX_TEXT_LENGTH = 8000
const EMBEDDING_CACHE_TTL = 30 * 60 * 1000 // 30 min
/** In-process only: a text file that keeps failing ends up finished-without-vectors like before. */
const MAX_TEXT_EMBEDDING_ATTEMPTS = 3
/** Tracked failing files; a new one finding the table full is given up on, never swapped in. */
const MAX_TRACKED_TEXT_FAILURES = 4096
/** A "not available" probe answer expires after this long; "available" lasts the process. */
const UNAVAILABLE_RECHECK_MS = 60_000
/**
 * Stable usage-ledger caller for every file-content embedding, the availability probe included
 * (audit rebuild design §1.4). A fresh object per call: options travel by reference.
 */
function filesEmbeddingOptions(): { metadata: { caller: string; localEmbeddingRuntime?: string } } {
  return {
    metadata: {
      caller: 'core.files.embedding',
      ...(getLocalEmbeddingRuntime().isReady() ? { localEmbeddingRuntime: 'llama.cpp' } : {})
    }
  }
}

interface EmbeddingSearchResult {
  sourceId: string
  score: number
  contentHash?: string | null
}

interface CachedEmbedding {
  vector: number[]
  model: string
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
  checkContentCapacity?: () => Promise<boolean>
  recordStorageFailure?: (error: unknown) => boolean
  /** Call-time split decision — mirrors DbUtilsSplitContext.enabled. */
  isSplitEnabled(): boolean
  /** Read connection: the search file when the split is on (falls back to primary until ready). */
  getReadDb(): LibSQLDatabase<typeof schema>
  /** Call-time physical read home; semantic SQL and scoring never execute on the main thread. */
  getDatabasePath(): string
  /** Primary connection: builds compiled statements and runs split-off scheduled writes. */
  getPrimaryDb(): LibSQLDatabase<typeof schema>
  /** Split-on writes: forward compiled statements to the worker — the sole writer of its file. */
  execWrite(
    statements: Array<{ sql: string; args: unknown[] }>,
    mode?: 'single' | 'transaction'
  ): Promise<unknown>
}

type CompilableQuery = BatchItem<'sqlite'> & {
  toSQL(): { sql: string; params: unknown[] }
}

/**
 * File embedding is paused because the user's global AI usage limit is reached (usage-limits task
 * C5). Until `pausedUntil` nothing is sent: batches stop, the availability probe is skipped, and
 * semantic search answers without a query embedding. Read by the file-index diagnostics.
 */
export interface EmbeddingUsageLimitPause {
  reason: 'USAGE_LIMIT_REACHED'
  /** Which limit (`requestsPerDay`, `costUsdPerMonth`, …). */
  limitKey: string
  /** The limit's local reset time; embedding resumes with the first call after it. */
  pausedUntil: number
}

/** What one `indexFileOutcome` call did; `paused` files count as skipped. */
type IndexFileOutcome = 'done' | 'paused' | 'skipped' | 'failed'

export interface EmbeddingFileInput {
  fileId: string
  /** Text payload; image inputs intentionally carry no content. */
  content?: string | null
  chunks?: FileParserChunk[]
  fileVersion?: number
  fileSize?: number | null
  image?: LocalEmbeddingImageInput
}

export type FileEmbeddingGenerator = (
  text: string,
  signal?: AbortSignal,
  purpose?: 'document' | 'query'
) => Promise<{ vector: number[]; model: string }>

async function generateFileEmbedding(
  text: string,
  signal?: AbortSignal,
  purpose: 'document' | 'query' = 'document'
): Promise<{ vector: number[]; model: string }> {
  const options = { ...filesEmbeddingOptions(), signal }
  // EmbeddingGemma's retrieval task prompt is part of query encoding, not document content.
  const input =
    purpose === 'query' && options.metadata.localEmbeddingRuntime === 'llama.cpp'
      ? `task: search result | query: ${text}`
      : text
  const result = await tuffIntelligence.embedding.generate({ text: input }, options)
  return { vector: result.result, model: result.model || 'unknown' }
}

function usableVector(vector: number[]): boolean {
  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(Number.isFinite) &&
    vector.some((value) => value !== 0)
  )
}

export class EmbeddingService {
  private available: boolean | null = null
  private lastProbeAt = 0
  private queryCache = new Map<string, CachedEmbedding>()
  private usageLimitPause: EmbeddingUsageLimitPause | null = null
  private imageOperationController = new AbortController()
  private readonly failedTextAttempts = new Map<string, number>()
  private semanticReader: { path: string; client: SearchIndexReadWorkerClient } | null = null
  private closed = false

  /** Lightweight media capability probe; never starts or upgrades the runtime. */
  isImageReady(): boolean {
    return getLocalEmbeddingRuntime().isImageReady()
  }

  /** Abort in-flight text/image generation when content indexing is disabled or shutting down. */
  cancelPending(): void {
    this.imageOperationController.abort(new Error('FILE_EMBEDDING_CANCELLED'))
    this.imageOperationController = new AbortController()
  }

  constructor(
    private readonly routing: EmbeddingDbRouting,
    private readonly generate: FileEmbeddingGenerator = generateFileEmbedding,
    private readonly readerOptions: SearchIndexReadWorkerClientOptions = {}
  ) {
    // Raising or clearing the limit is the user saying "go on": the pause lifts now, not at the
    // reset time. If a limit still binds, the next call is refused before any provider work and
    // pauses again — one refusal, no loop.
    onUsageLimitsChanged(() => this.liftUsageLimitPause())
  }

  async close(): Promise<void> {
    this.closed = true
    this.cancelPending()
    const reader = this.semanticReader
    this.semanticReader = null
    this.queryCache.clear()
    await reader?.client.close()
  }

  private getSemanticReader(): SearchIndexReadWorkerClient {
    if (this.closed) throw new Error('FILE_EMBEDDING_SERVICE_CLOSED')
    const path = this.routing.getDatabasePath()
    if (this.semanticReader?.path === path) return this.semanticReader.client
    void this.semanticReader?.client.close()
    const client = new SearchIndexReadWorkerClient(path, {
      ...this.readerOptions,
      lane: 'semantic'
    })
    this.semanticReader = { path, client }
    return client
  }

  /** Lifts a usage-limit pause because the limits changed; a no-op when none is held. */
  private liftUsageLimitPause(): void {
    if (!this.usageLimitPause) return
    this.usageLimitPause = null
    logger.info('File embedding resumes: the AI usage limits changed')
  }

  /** The usage-limit pause in force, or null; a pause whose reset time has passed is lifted here. */
  getUsageLimitPause(now: number = Date.now()): EmbeddingUsageLimitPause | null {
    const pause = this.usageLimitPause
    if (!pause) return null
    if (now >= pause.pausedUntil) {
      this.usageLimitPause = null
      logger.info('File embedding resumes: the AI usage limit has reset')
      return null
    }
    return { ...pause }
  }

  /**
   * True when `error` is the usage-limit refusal, which pauses embedding until the limit resets:
   * logged once per pause, never retried. Any other failure is left to the caller.
   */
  private pauseOnUsageLimit(error: unknown): boolean {
    const info = readUsageLimitInfo(error)
    if (!info) return false
    const current = this.usageLimitPause
    this.usageLimitPause = {
      reason: 'USAGE_LIMIT_REACHED',
      limitKey: info.key,
      pausedUntil: Math.max(current?.pausedUntil ?? 0, info.resetsAt)
    }
    if (!current) {
      logger.warn(
        `File embedding paused: AI usage limit ${info.key} reached; resumes after ${new Date(
          this.usageLimitPause.pausedUntil
        ).toISOString()}`
      )
    }
    return true
  }

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
  ): Promise<number> {
    if (queries.length === 0) return 0
    if (
      label === 'embedding.index' &&
      this.routing.checkContentCapacity &&
      !(await this.routing.checkContentCapacity())
    )
      throw new Error('FILE_CONTENT_STORAGE_PAUSED')

    if (this.routing.isSplitEnabled()) {
      const statements = queries.map((query) => {
        const compiled = query.toSQL()
        return { sql: compiled.sql, args: compiled.params }
      })
      return this.lastWriteCount(await this.routing.execWrite(statements, mode))
    }

    return await scheduleDbWrite(label, async () => {
      if (
        label === 'embedding.index' &&
        this.routing.checkContentCapacity &&
        !(await this.routing.checkContentCapacity())
      )
        throw new Error('FILE_CONTENT_STORAGE_PAUSED')
      const [first, ...rest] = queries
      if (!first) return 0
      if (mode === 'transaction') {
        return this.lastWriteCount(await this.routing.getPrimaryDb().batch([first, ...rest]))
      }
      const results = []
      for (const query of queries) results.push(await query)
      return this.lastWriteCount(results)
    })
  }

  private lastWriteCount(result: unknown): number {
    if (!Array.isArray(result) || result.length === 0) return 0
    const last: unknown = result[result.length - 1]
    if (!last || typeof last !== 'object' || !('rowsAffected' in last)) return 0
    return typeof last.rowsAffected === 'number' ? last.rowsAffected : 0
  }

  /**
   * Check if the embedding capability is available.
   * Caches the result to avoid repeated probing: "available" for the process, "not available" for
   * `UNAVAILABLE_RECHECK_MS`.
   */
  async isAvailable(): Promise<boolean> {
    // Paused by the usage limit: unavailable until the reset, without probing (a probe is a call).
    if (this.getUsageLimitPause()) return false
    if (this.available === true) return true
    const now = Date.now()
    if (this.available === false && now - this.lastProbeAt < UNAVAILABLE_RECHECK_MS) return false
    // Stamped before probing so a probe that throws without an answer is not repeated per caller.
    this.lastProbeAt = now

    try {
      const disposeCheck = enterPerfContext('Embedding.isAvailable', { textLength: 4 })
      try {
        const result = await this.generate('test')
        this.available = usableVector(result.vector)
      } finally {
        disposeCheck()
      }
    } catch (error) {
      // Not cached: the limit says nothing about whether embedding works once it resets.
      if (this.pauseOnUsageLimit(error)) return false
      if (this.routing.recordStorageFailure?.(error)) return false
      this.available = false
    }

    logger.info(`Embedding capability available: ${this.available}`)
    return this.available
  }

  /** Reset availability cache (e.g. after config change). */
  resetAvailability(): void {
    this.available = null
    this.queryCache.clear()
  }

  /**
   * Generate and store embedding for a single file.
   * Skips if content hash hasn't changed.
   */
  async indexFile(fileId: string, content: string): Promise<void> {
    const outcome = await this.indexFileOutcome({ fileId, content })
    if (outcome === 'failed') throw new Error('FILE_EMBEDDING_INDEX_FAILED')
  }

  private async indexFileOutcome(
    input: EmbeddingFileInput,
    signal?: AbortSignal
  ): Promise<IndexFileOutcome> {
    if (input.image) return await this.indexImageFileOutcome(input, signal)
    if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
      return 'paused'
    if (!(await this.isAvailable())) return this.usageLimitPause ? 'paused' : 'skipped'
    if (!input.content?.trim()) return 'skipped'
    const { fileId, content } = input
    const allChunks = input.chunks?.length
      ? input.chunks
      : [{ text: content.slice(0, MAX_TEXT_LENGTH) }]
    const chunks = allChunks.slice(0, 16)
    const hashes = chunks.map(hashFileContentChunk)
    try {
      if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
        return 'paused'
      const first = await this.generate(chunks[0].text, signal)
      if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
        return 'paused'
      if (!usableVector(first.vector) || !first.model)
        throw new Error('FILE_EMBEDDING_INVALID_VECTOR')

      const existing = await this.routing
        .getReadDb()
        .select({
          contentHash: embeddingsSchema.contentHash,
          model: embeddingsSchema.model,
          embedding: embeddingsSchema.embedding
        })
        .from(embeddingsSchema)
        .where(
          and(eq(embeddingsSchema.sourceId, fileId), eq(embeddingsSchema.sourceType, SOURCE_TYPE))
        )
      if (
        existing.length === hashes.length &&
        existing.every(
          (row, index) => row.model === first.model && row.contentHash === hashes[index]
        )
      )
        return 'done'
      const existingByHash = new Map<string, { vector: number[]; model: string }>()
      for (const row of existing) {
        if (row.contentHash && row.model) {
          const vec = Array.isArray(row.embedding)
            ? row.embedding
            : typeof row.embedding === 'string'
              ? JSON.parse(row.embedding)
              : null
          if (usableVector(vec)) {
            existingByHash.set(row.contentHash, { vector: vec, model: row.model })
          }
        }
      }

      const generated = [first]
      for (let index = 1; index < chunks.length; index++) {
        if (this.getUsageLimitPause()) return 'paused'
        if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
          return 'paused'

        const cached = existingByHash.get(hashes[index]!)
        let result: { vector: number[]; model: string }
        if (
          cached &&
          cached.model === first.model &&
          cached.vector.length === first.vector.length
        ) {
          result = cached
        } else {
          result = await this.generate(chunks[index].text, signal)
          if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
            return 'paused'
          if (
            !usableVector(result.vector) ||
            result.model !== first.model ||
            result.vector.length !== first.vector.length
          ) {
            throw new Error('FILE_EMBEDDING_MODEL_CHANGED')
          }
        }
        generated.push(result)
      }
      const fileFence = and(
        eq(filesSchema.id, Number(fileId)),
        eq(filesSchema.content, content),
        input.fileVersion == null ? undefined : eq(filesSchema.mtime, new Date(input.fileVersion)),
        input.fileSize == null ? undefined : eq(filesSchema.size, input.fileSize)
      )
      const current = await this.routing
        .getReadDb()
        .select({ id: filesSchema.id })
        .from(filesSchema)
        .where(fileFence)
        .limit(1)
      if (current.length === 0) return 'skipped'
      const writeDb = this.routing.getPrimaryDb()
      const exists = sql`EXISTS (SELECT 1 FROM ${filesSchema} WHERE ${fileFence})`
      // SQL SELECT follows the embeddings schema column order, including its
      // generated id and created_at. Each insert checks the fence in the writer,
      // not just in the earlier read, so queued cleanup cannot be undone.
      const written = await this.runWrite(
        'embedding.index',
        [
          writeDb
            .delete(embeddingsSchema)
            .where(
              and(
                eq(embeddingsSchema.sourceId, fileId),
                eq(embeddingsSchema.sourceType, SOURCE_TYPE),
                exists
              )
            ),
          ...generated.map((result, index) =>
            writeDb.insert(embeddingsSchema).select(sql`
          SELECT NULL, ${fileId}, ${SOURCE_TYPE}, ${encodeVectorBlob(result.vector)},
            ${result.model}, ${hashes[index]}, strftime('%s', 'now')
          FROM ${filesSchema} WHERE ${fileFence}
        `)
          ),
          writeDb.update(filesSchema).set({ embeddingStatus: 'completed' }).where(fileFence)
        ],
        'transaction'
      )
      return written > 0 ? 'done' : 'skipped'
    } catch (error) {
      if (this.pauseOnUsageLimit(error)) return 'paused'
      if (
        this.routing.recordStorageFailure?.(error) ||
        (error instanceof Error && error.message === 'FILE_CONTENT_STORAGE_PAUSED')
      )
        return 'paused'
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'FILE_EMBEDDING_INDEX_FAILED'
      logger.warn('File embedding failed', { code })
      return 'failed'
    }
  }

  private async indexImageFileOutcome(
    input: EmbeddingFileInput,
    signal?: AbortSignal
  ): Promise<IndexFileOutcome> {
    const image = input.image
    if (!image || !this.isImageReady() || signal?.aborted) return 'skipped'
    if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
      return 'paused'
    const operationSignal = AbortSignal.any([
      this.imageOperationController.signal,
      ...(signal ? [signal] : [])
    ])
    if (operationSignal.aborted) return 'skipped'
    try {
      const generated = await tuffIntelligence.embedding.generateLocalImage(image, {
        signal: operationSignal,
        metadata: { caller: 'core.files.embedding' }
      })
      if (operationSignal.aborted) return 'skipped'
      if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity()))
        return 'paused'
      if (generated.model !== LOCAL_EMBEDDING_MODEL_KEY || !usableVector(generated.result))
        throw new Error('FILE_EMBEDDING_IMAGE_INVALID_VECTOR')
      const currentImage = await stat(image.path)
      if (
        !currentImage.isFile() ||
        currentImage.mtimeMs !== image.mtime ||
        currentImage.size !== image.size
      )
        return 'skipped'
      const fileId = input.fileId
      const fileFence = and(
        eq(filesSchema.id, Number(fileId)),
        eq(filesSchema.path, image.path),
        eq(filesSchema.mtime, new Date(input.fileVersion ?? image.mtime)),
        eq(filesSchema.size, image.size),
        isNull(filesSchema.content),
        eq(filesSchema.embeddingStatus, 'pending')
      )
      const current = await this.routing
        .getReadDb()
        .select({ id: filesSchema.id })
        .from(filesSchema)
        .where(fileFence)
        .limit(1)
      if (current.length === 0 || operationSignal.aborted) return 'skipped'
      const writeDb = this.routing.getPrimaryDb()
      const exists = sql`EXISTS (SELECT 1 FROM ${filesSchema} WHERE ${fileFence})`
      const written = await this.runWrite(
        'embedding.index',
        [
          writeDb
            .delete(embeddingsSchema)
            .where(
              and(
                eq(embeddingsSchema.sourceId, fileId),
                eq(embeddingsSchema.sourceType, SOURCE_TYPE),
                exists
              )
            ),
          writeDb.insert(embeddingsSchema).select(sql`
            SELECT NULL, ${fileId}, ${SOURCE_TYPE}, ${encodeVectorBlob(generated.result)},
              ${generated.model}, NULL, strftime('%s', 'now')
            FROM ${filesSchema} WHERE ${fileFence}
          `),
          writeDb
            .update(fileIndexProgress)
            .set({
              status: 'completed',
              progress: 100,
              lastError: null,
              updatedAt: new Date()
            })
            .where(and(eq(fileIndexProgress.fileId, Number(fileId)), exists)),
          writeDb.update(filesSchema).set({ embeddingStatus: 'completed' }).where(fileFence)
        ],
        'transaction'
      )
      return written > 0 && !operationSignal.aborted ? 'done' : 'skipped'
    } catch (error) {
      if (operationSignal.aborted) return 'skipped'
      if (this.routing.recordStorageFailure?.(error)) return 'paused'
      logger.warn('File image embedding failed', {
        code: error instanceof Error ? error.message : 'FILE_EMBEDDING_IMAGE_FAILED'
      })
      return 'failed'
    }
  }

  /**
   * Batch index multiple files. Processes in chunks to avoid overloading.
   */
  async indexFiles(
    files: EmbeddingFileInput[],
    signal?: AbortSignal
  ): Promise<{ indexed: number; skipped: number; failed: number; retryFileIds?: string[] }> {
    if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity())) {
      return { indexed: 0, skipped: files.length, failed: 0 }
    }
    const hasText = files.some((file) => !file.image)
    if (hasText && !(await this.isAvailable()))
      return { indexed: 0, skipped: files.length, failed: 0 }
    const operationSignal = AbortSignal.any([
      this.imageOperationController.signal,
      ...(signal ? [signal] : [])
    ])
    const start = performance.now()
    let indexed = 0
    let failed = 0
    const retryFileIds: string[] = []
    // One file's vectors at a time; chunks must commit atomically, not multiply
    // the retained model buffers by concurrent files.
    for (const file of files) {
      if (operationSignal.aborted || this.getUsageLimitPause()) break
      if (this.routing.checkContentCapacity && !(await this.routing.checkContentCapacity())) break
      const outcome = await this.indexFileOutcome(file, operationSignal)
      if (outcome === 'done') indexed++
      if (outcome === 'failed') failed++
      if (!file.image && this.shouldRetryText(file.fileId, outcome)) retryFileIds.push(file.fileId)
    }
    const skipped = files.length - indexed - failed
    logger.info('Batch embedding finished', {
      indexed,
      skipped,
      failed,
      durationMs: Math.round(performance.now() - start)
    })
    return { indexed, skipped, failed, ...(retryFileIds.length > 0 ? { retryFileIds } : {}) }
  }

  /** A failed text file is reported for the enrichment retry lane until it has used its attempts. */
  private shouldRetryText(fileId: string, outcome: IndexFileOutcome): boolean {
    if (outcome !== 'failed') {
      this.failedTextAttempts.delete(fileId)
      return false
    }
    const counted = this.failedTextAttempts.get(fileId)
    // Evicting restarts a count, so a batch bigger than the table would never finish.
    if (counted === undefined && this.failedTextAttempts.size >= MAX_TRACKED_TEXT_FAILURES)
      return false
    const attempts = (counted ?? 0) + 1
    if (attempts >= MAX_TEXT_EMBEDDING_ATTEMPTS) {
      this.failedTextAttempts.delete(fileId)
      return false
    }
    this.failedTextAttempts.set(fileId, attempts)
    return true
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

  /** Embed the query locally/configured-provider, then read and score on an independent worker. */
  async semanticSearch(
    query: string,
    limit = 20,
    signal?: AbortSignal
  ): Promise<EmbeddingSearchResult[]> {
    const resultLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
    if (
      this.closed ||
      !query?.trim() ||
      resultLimit === 0 ||
      signal?.aborted ||
      this.getUsageLimitPause()
    )
      return []
    const disposeSearch = enterPerfContext('Embedding.semanticSearch', {
      queryLength: query.length,
      limit: resultLimit
    })
    try {
      const queryEmbedding = await this.getQueryEmbedding(query, signal)
      if (this.closed || !queryEmbedding || signal?.aborted) return []
      const reader = this.getSemanticReader()
      if (signal?.aborted) return []
      try {
        return await reader.semanticSearch(
          queryEmbedding.vector,
          queryEmbedding.model,
          resultLimit,
          signal
        )
      } catch (error) {
        if (signal?.aborted) return []
        throw error
      }
    } finally {
      disposeSearch()
    }
  }

  /**
   * Get embedding count for monitoring.
   */
  async getEmbeddingCount(): Promise<number> {
    const reader = this.getSemanticReader()
    const result = await reader.all<{ count: number }>(
      sql`SELECT count(*) AS count FROM embeddings WHERE source_type = ${SOURCE_TYPE}`
    )
    return result[0]?.count ?? 0
  }

  private async getQueryEmbedding(
    query: string,
    signal?: AbortSignal
  ): Promise<CachedEmbedding | null> {
    const localKey = getLocalEmbeddingRuntime().isReady()
      ? LOCAL_EMBEDDING_MODEL_KEY
      : 'configured-provider'
    const cacheKey = `${localKey}:${query.trim().toLowerCase()}`
    const cached = this.queryCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < EMBEDDING_CACHE_TTL) return cached
    try {
      const result = await runWithEmbeddingPriority('interactive', () =>
        this.generate(query, signal, 'query')
      )
      if (!usableVector(result.vector) || !result.model) return null
      const entry = { vector: result.vector, model: result.model, timestamp: Date.now() }
      this.queryCache.set(cacheKey, entry)
      if (this.queryCache.size > 100) {
        const oldest = this.queryCache.keys().next().value
        if (oldest != null) this.queryCache.delete(oldest)
      }
      return entry
    } catch (error) {
      if (this.pauseOnUsageLimit(error)) return null
      logger.warn('Query embedding failed')
      return null
    }
  }
}
