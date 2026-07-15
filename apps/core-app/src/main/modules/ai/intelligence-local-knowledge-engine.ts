import type { Client, InValue } from '@libsql/client'
import type {
  BuildContextInput,
  BuildContextResult,
  IndexChunkInput,
  IndexChunkResult,
  IndexDocumentInput,
  IndexDocumentResult,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  KnowledgeSourceType
} from '@talex-touch/utils/types/intelligence'
import crypto from 'node:crypto'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { withSqliteRetry } from '../../db/sqlite-retry'
import { createLogger } from '../../utils/logger'
import { databaseModule } from '../database'

const log = createLogger('IntelligenceKnowledge')
const DEFAULT_CHUNK_SIZE = 1_600
const DEFAULT_SEARCH_LIMIT = 8
const DEFAULT_CONTEXT_MAX_CHUNKS = 8

interface KnowledgeRow {
  chunk_id: string
  document_id: string
  chunk_index: number
  content: string
  chunk_hash: string
  token_estimate: number
  chunk_metadata: string | null
  chunk_created_at: number
  chunk_updated_at: number
  source_type: KnowledgeSourceType
  source_uri: string | null
  title: string
  document_hash: string
  permission_scope: string
  document_metadata: string | null
  document_created_at: number
  document_updated_at: number
  score: number
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 20)}`
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.trim().length / 4))
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function stringifyJson(value: Record<string, unknown> | undefined): string | null {
  if (!value || Object.keys(value).length === 0) return null
  return JSON.stringify(value)
}

function chunkText(content: string, chunkSize: number): string[] {
  const normalized = content.trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length <= chunkSize) {
      current = next
      continue
    }
    if (current) chunks.push(current)
    if (paragraph.length <= chunkSize) {
      current = paragraph
      continue
    }
    for (let index = 0; index < paragraph.length; index += chunkSize) {
      chunks.push(paragraph.slice(index, index + chunkSize))
    }
    current = ''
  }

  if (current) chunks.push(current)
  return chunks
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (!Number.isFinite(limit)) return fallback
  return Math.min(Math.max(Math.floor(Number(limit)), 1), 50)
}

function normalizeSourceTypes(
  sourceType: KnowledgeSearchInput['sourceType']
): KnowledgeSourceType[] {
  if (!sourceType) return []
  return Array.isArray(sourceType) ? sourceType : [sourceType]
}

function normalizeScopes(permissionScope: KnowledgeSearchInput['permissionScope']): string[] {
  if (!permissionScope) return []
  return Array.isArray(permissionScope) ? permissionScope : [permissionScope]
}

function buildFtsQuery(query: string): string {
  const terms = query.trim().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []
  return terms.map((term) => `"${term}"*`).join(' OR ')
}

function rowToHit(row: KnowledgeRow): KnowledgeSearchHit {
  const document: KnowledgeDocument = {
    id: row.document_id,
    sourceType: row.source_type,
    sourceUri: row.source_uri ?? undefined,
    title: row.title,
    contentHash: row.document_hash,
    permissionScope: row.permission_scope,
    metadata: parseJsonRecord(row.document_metadata),
    createdAt: row.document_created_at,
    updatedAt: row.document_updated_at
  }
  const chunk: KnowledgeChunk = {
    id: row.chunk_id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentHash: row.chunk_hash,
    tokenEstimate: row.token_estimate,
    metadata: parseJsonRecord(row.chunk_metadata),
    createdAt: row.chunk_created_at,
    updatedAt: row.chunk_updated_at
  }
  return {
    document,
    chunk,
    score: Number(row.score || 0),
    citation: {
      documentId: document.id,
      chunkId: chunk.id,
      title: document.title,
      sourceUri: document.sourceUri,
      sourceType: document.sourceType,
      updatedAt: document.updatedAt
    }
  }
}

function metadataValueMatches(actual: unknown, expected: string | number | boolean): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => metadataValueMatches(item, expected))
  }

  return (
    (typeof actual === 'string' || typeof actual === 'number' || typeof actual === 'boolean') &&
    actual === expected
  )
}

function readMetadataValue(metadata: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(metadata, key)) {
    return metadata[key]
  }

  const parts = key.split('.').filter(Boolean)
  if (parts.length <= 1) {
    return undefined
  }

  let current: unknown = metadata
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

function matchesMetadataFilters(
  row: KnowledgeRow,
  metadata?: Record<string, string | number | boolean>
): boolean {
  const entries = Object.entries(metadata ?? {})
  if (entries.length === 0) return true

  const documentMetadata = parseJsonRecord(row.document_metadata)
  const chunkMetadata = parseJsonRecord(row.chunk_metadata)
  return entries.every(
    ([key, expected]) =>
      metadataValueMatches(readMetadataValue(chunkMetadata, key), expected) ||
      metadataValueMatches(readMetadataValue(documentMetadata, key), expected)
  )
}

export class LocalKnowledgeEngine {
  private getClient(): Client | null {
    return databaseModule.getClient()
  }

  private requireClient(): Client {
    const client = this.getClient()
    if (!client) {
      throw new Error('LOCAL_KNOWLEDGE_UNAVAILABLE: database client is not ready')
    }
    return client
  }

  private async withDbWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }), {
      priority: 'background',
      maxQueueWaitMs: 8_000
    })
  }

  async indexDocument(input: IndexDocumentInput): Promise<IndexDocumentResult> {
    const content = String(input.content || '').trim()
    if (!content) {
      throw new Error('Invalid knowledge document: content is required')
    }
    const title = String(input.title || '').trim()
    if (!title) {
      throw new Error('Invalid knowledge document: title is required')
    }

    const now = Date.now()
    const contentHash = hashContent(content)
    const documentId =
      input.id || stableId('kdoc', `${input.sourceType}:${input.sourceUri ?? title}:${contentHash}`)
    const chunks = chunkText(content, input.chunkSize ?? DEFAULT_CHUNK_SIZE)
    const client = this.requireClient()

    await this.withDbWrite('intelligence.knowledge.indexDocument', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_knowledge_documents
            (id, source_type, source_uri, title, content_hash, permission_scope, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            source_type = excluded.source_type,
            source_uri = excluded.source_uri,
            title = excluded.title,
            content_hash = excluded.content_hash,
            permission_scope = excluded.permission_scope,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at
        `,
        args: [
          documentId,
          input.sourceType,
          input.sourceUri ?? null,
          title,
          contentHash,
          input.permissionScope ?? 'default',
          stringifyJson(input.metadata),
          now,
          now
        ]
      })
      await client.execute({
        sql: 'DELETE FROM intelligence_knowledge_chunks WHERE document_id = ?',
        args: [documentId]
      })
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index]!
        const chunkHash = hashContent(chunk)
        await client.execute({
          sql: `
            INSERT INTO intelligence_knowledge_chunks
              (id, document_id, chunk_index, content, content_hash, token_estimate, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            stableId('kchunk', `${documentId}:${index}:${chunkHash}`),
            documentId,
            index,
            chunk,
            chunkHash,
            estimateTokens(chunk),
            null,
            now,
            now
          ]
        })
      }
    })

    const document: KnowledgeDocument = {
      id: documentId,
      sourceType: input.sourceType,
      sourceUri: input.sourceUri,
      title,
      contentHash,
      permissionScope: input.permissionScope ?? 'default',
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now
    }

    return {
      document,
      chunks: chunks.map((chunk, index) => ({
        id: stableId('kchunk', `${documentId}:${index}:${hashContent(chunk)}`),
        documentId,
        chunkIndex: index,
        content: chunk,
        contentHash: hashContent(chunk),
        tokenEstimate: estimateTokens(chunk),
        createdAt: now,
        updatedAt: now
      }))
    }
  }

  async indexChunk(input: IndexChunkInput): Promise<IndexChunkResult> {
    const content = String(input.content || '').trim()
    if (!content) {
      throw new Error('Invalid knowledge chunk: content is required')
    }
    const now = Date.now()
    const contentHash = hashContent(content)
    const chunkIndex = Number.isFinite(input.chunkIndex) ? Number(input.chunkIndex) : 0
    const id = input.id || stableId('kchunk', `${input.documentId}:${chunkIndex}:${contentHash}`)
    const client = this.requireClient()

    await this.withDbWrite('intelligence.knowledge.indexChunk', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_knowledge_chunks
            (id, document_id, chunk_index, content, content_hash, token_estimate, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            chunk_index = excluded.chunk_index,
            content = excluded.content,
            content_hash = excluded.content_hash,
            token_estimate = excluded.token_estimate,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at
        `,
        args: [
          id,
          input.documentId,
          chunkIndex,
          content,
          contentHash,
          estimateTokens(content),
          stringifyJson(input.metadata),
          now,
          now
        ]
      })
    })

    return {
      chunk: {
        id,
        documentId: input.documentId,
        chunkIndex,
        content,
        contentHash,
        tokenEstimate: estimateTokens(content),
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now
      }
    }
  }

  async search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult> {
    const query = String(input.query || '').trim()
    if (!query) {
      return { status: 'unavailable', hits: [], degradedReason: 'empty-query' }
    }

    const client = this.getClient()
    if (!client) {
      return { status: 'unavailable', hits: [], degradedReason: 'database-unavailable' }
    }

    const ftsQuery = buildFtsQuery(query)
    if (!ftsQuery) {
      return { status: 'unavailable', hits: [], degradedReason: 'empty-fts-query' }
    }

    const limit = normalizeLimit(input.limit, DEFAULT_SEARCH_LIMIT)
    const sourceTypes = normalizeSourceTypes(input.sourceType)
    const scopes = normalizeScopes(input.permissionScope)
    const filters: string[] = []
    const args: InValue[] = [ftsQuery]

    if (sourceTypes.length > 0) {
      filters.push(`d.source_type IN (${sourceTypes.map(() => '?').join(', ')})`)
      args.push(...sourceTypes)
    }
    if (scopes.length > 0) {
      filters.push(`d.permission_scope IN (${scopes.map(() => '?').join(', ')})`)
      args.push(...scopes)
    }
    if (input.timeRange?.from) {
      filters.push('d.updated_at >= ?')
      args.push(input.timeRange.from)
    }
    if (input.timeRange?.to) {
      filters.push('d.updated_at <= ?')
      args.push(input.timeRange.to)
    }

    const where = filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''
    const queryLimit =
      input.metadata && Object.keys(input.metadata).length > 0 ? Math.min(50, limit * 4) : limit
    args.push(queryLimit)

    try {
      const result = await withSqliteRetry(
        () =>
          client.execute({
            sql: `
              SELECT
                c.id AS chunk_id,
                c.document_id,
                c.chunk_index,
                c.content,
                c.content_hash AS chunk_hash,
                c.token_estimate,
                c.metadata AS chunk_metadata,
                c.created_at AS chunk_created_at,
                c.updated_at AS chunk_updated_at,
                d.source_type,
                d.source_uri,
                d.title,
                d.content_hash AS document_hash,
                d.permission_scope,
                d.metadata AS document_metadata,
                d.created_at AS document_created_at,
                d.updated_at AS document_updated_at,
                bm25(intelligence_knowledge_chunks_fts) * -1 AS score
              FROM intelligence_knowledge_chunks_fts
              JOIN intelligence_knowledge_chunks c ON c.id = intelligence_knowledge_chunks_fts.chunk_id
              JOIN intelligence_knowledge_documents d ON d.id = c.document_id
              WHERE intelligence_knowledge_chunks_fts MATCH ?
              ${where}
              ORDER BY score DESC, c.updated_at DESC
              LIMIT ?
            `,
            args
          }),
        { label: 'intelligence.knowledge.search' }
      )
      const hits = (result.rows as unknown as KnowledgeRow[])
        .filter((row) => matchesMetadataFilters(row, input.metadata))
        .slice(0, limit)
        .map(rowToHit)
      return { status: 'ok', hits }
    } catch (error) {
      log.warn('Local knowledge FTS search degraded', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      return { status: 'degraded', hits: [], degradedReason: 'fts-search-failed' }
    }
  }

  async buildContext(input: BuildContextInput): Promise<BuildContextResult> {
    const searchResult = await this.search({
      ...input,
      limit: input.maxChunks ?? input.limit ?? DEFAULT_CONTEXT_MAX_CHUNKS
    })
    if (searchResult.status === 'unavailable') {
      return {
        status: 'unavailable',
        contextText: '',
        chunks: [],
        tokenEstimate: 0,
        citations: [],
        degradedReason: searchResult.degradedReason
      }
    }

    const budget = Math.max(1, Math.floor(Number(input.tokenBudget || 1)))
    const selected: KnowledgeSearchHit[] = []
    const seenDocuments = new Set<string>()
    let tokenEstimate = 0

    for (const hit of searchResult.hits) {
      if (input.dedupe !== false && seenDocuments.has(hit.document.id)) continue
      const nextEstimate = tokenEstimate + hit.chunk.tokenEstimate
      if (nextEstimate > budget && selected.length > 0) continue
      selected.push(hit)
      seenDocuments.add(hit.document.id)
      tokenEstimate += hit.chunk.tokenEstimate
      if (selected.length >= (input.maxChunks ?? DEFAULT_CONTEXT_MAX_CHUNKS)) break
    }

    return {
      status: searchResult.status,
      contextText: selected
        .map((hit, index) => `[${index + 1}] ${hit.document.title}\n${hit.chunk.content}`)
        .join('\n\n'),
      chunks: selected,
      tokenEstimate,
      citations: selected.map((hit) => hit.citation),
      degradedReason: searchResult.degradedReason
    }
  }
}

export const localKnowledgeEngine = new LocalKnowledgeEngine()
