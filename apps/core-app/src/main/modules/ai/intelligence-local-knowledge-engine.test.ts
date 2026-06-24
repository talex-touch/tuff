import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalKnowledgeEngine } from './intelligence-local-knowledge-engine'

const dbMock = vi.hoisted(() => ({
  client: {
    execute: vi.fn()
  }
}))

vi.mock('../database', () => ({
  databaseModule: {
    getClient: () => dbMock.client
  }
}))

vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation())
  }
}))

describe('LocalKnowledgeEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('indexes a document into document and chunk rows', async () => {
    dbMock.client.execute.mockResolvedValue({ rows: [] })
    const engine = new LocalKnowledgeEngine()

    const result = await engine.indexDocument({
      sourceType: 'manual',
      title: 'Project AI Notes',
      content: 'alpha beta\n\nsecond paragraph',
      permissionScope: 'workspace:tuff',
      metadata: { workspace: 'tuff' }
    })

    expect(result.document.title).toBe('Project AI Notes')
    expect(result.document.permissionScope).toBe('workspace:tuff')
    expect(result.chunks).toHaveLength(1)
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_knowledge_documents')
      })
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_knowledge_chunks')
      })
    )
  })

  it('searches FTS with metadata filters and returns citations', async () => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          content: 'CoreBox AI uses text.chat.',
          chunk_hash: 'chunk-hash',
          token_estimate: 8,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://ai',
          title: 'AI Notes',
          document_hash: 'doc-hash',
          permission_scope: 'workspace:tuff',
          document_metadata: '{"area":"ai"}',
          document_created_at: 10,
          document_updated_at: 20,
          score: 1.2
        },
        {
          chunk_id: 'chunk-2',
          document_id: 'doc-2',
          chunk_index: 0,
          content: 'CoreBox plugin note.',
          chunk_hash: 'chunk-hash-2',
          token_estimate: 5,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://plugin',
          title: 'Plugin Notes',
          document_hash: 'doc-hash-2',
          permission_scope: 'workspace:tuff',
          document_metadata: '{"area":"plugin"}',
          document_created_at: 10,
          document_updated_at: 20,
          score: 1
        }
      ]
    })
    const engine = new LocalKnowledgeEngine()

    const result = await engine.search({
      query: 'CoreBox AI',
      sourceType: 'manual',
      permissionScope: 'workspace:tuff',
      timeRange: { from: 1, to: 100 },
      metadata: { area: 'ai' },
      limit: 5
    })

    expect(result.status).toBe('ok')
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]?.citation).toMatchObject({
      documentId: 'doc-1',
      chunkId: 'chunk-1',
      title: 'AI Notes',
      sourceType: 'manual'
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['CoreBox* OR AI*', 'manual', 'workspace:tuff', 1, 100, 20]
      })
    )
  })

  it('matches nested metadata paths and scalar values inside metadata arrays', async () => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          content: 'Local knowledge retrieval keeps citations.',
          chunk_hash: 'chunk-hash',
          token_estimate: 8,
          chunk_metadata: '{"tags":["retrieval","citation"]}',
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://knowledge',
          title: 'Knowledge Notes',
          document_hash: 'doc-hash',
          permission_scope: 'workspace:tuff',
          document_metadata: '{"area":{"team":"ai"}}',
          document_created_at: 10,
          document_updated_at: 20,
          score: 1.2
        },
        {
          chunk_id: 'chunk-2',
          document_id: 'doc-2',
          chunk_index: 0,
          content: 'Other note.',
          chunk_hash: 'chunk-hash-2',
          token_estimate: 5,
          chunk_metadata: '{"tags":["catalog"]}',
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://catalog',
          title: 'Catalog Notes',
          document_hash: 'doc-hash-2',
          permission_scope: 'workspace:tuff',
          document_metadata: '{"area":{"team":"i18n"}}',
          document_created_at: 10,
          document_updated_at: 20,
          score: 1
        }
      ]
    })
    const engine = new LocalKnowledgeEngine()

    const result = await engine.search({
      query: 'knowledge',
      metadata: {
        'area.team': 'ai',
        tags: 'retrieval'
      },
      limit: 5
    })

    expect(result.status).toBe('ok')
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]?.citation).toMatchObject({
      documentId: 'doc-1',
      chunkId: 'chunk-1',
      title: 'Knowledge Notes'
    })
  })

  it('builds context within budget and dedupes by document', async () => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          chunk_index: 0,
          content: 'first hit',
          chunk_hash: 'a',
          token_estimate: 3,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: null,
          title: 'Doc 1',
          document_hash: 'doc-hash',
          permission_scope: 'default',
          document_metadata: null,
          document_created_at: 10,
          document_updated_at: 20,
          score: 2
        },
        {
          chunk_id: 'chunk-2',
          document_id: 'doc-1',
          chunk_index: 1,
          content: 'duplicate document',
          chunk_hash: 'b',
          token_estimate: 3,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: null,
          title: 'Doc 1',
          document_hash: 'doc-hash',
          permission_scope: 'default',
          document_metadata: null,
          document_created_at: 10,
          document_updated_at: 20,
          score: 1
        }
      ]
    })
    const engine = new LocalKnowledgeEngine()

    const result = await engine.buildContext({
      query: 'hit',
      tokenBudget: 8,
      maxChunks: 4,
      dedupe: true
    })

    expect(result.status).toBe('ok')
    expect(result.chunks).toHaveLength(1)
    expect(result.contextText).toContain('[1] Doc 1')
    expect(result.citations).toHaveLength(1)
  })

  it('returns degraded instead of fake success when FTS fails', async () => {
    dbMock.client.execute.mockRejectedValueOnce(
      new Error('no such table: intelligence_knowledge_chunks_fts')
    )
    const engine = new LocalKnowledgeEngine()

    const result = await engine.search({ query: 'missing' })

    expect(result).toMatchObject({
      status: 'degraded',
      hits: [],
      degradedReason: 'fts-search-failed'
    })
  })
})
