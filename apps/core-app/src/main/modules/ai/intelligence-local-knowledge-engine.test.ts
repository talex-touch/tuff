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
      query: 'CoreBox follow-up',
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
        args: ['"CoreBox"* OR "follow"* OR "up"*', 'manual', 'workspace:tuff', 1, 100, 20]
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

  it('skips an oversized first hit and retains a later fitting citation within budget', async () => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-oversized',
          document_id: 'doc-oversized',
          chunk_index: 0,
          content: 'This oversized chunk must never be included or truncated.',
          chunk_hash: 'oversized-hash',
          token_estimate: 9,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://oversized',
          title: 'Oversized Document',
          document_hash: 'oversized-document-hash',
          permission_scope: 'default',
          document_metadata: null,
          document_created_at: 10,
          document_updated_at: 20,
          score: 2
        },
        {
          chunk_id: 'chunk-fitting',
          document_id: 'doc-fitting',
          chunk_index: 0,
          content: 'Fits whole.',
          chunk_hash: 'fitting-hash',
          token_estimate: 4,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://fitting',
          title: 'Fitting Document',
          document_hash: 'fitting-document-hash',
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
      query: 'chunk',
      tokenBudget: 5,
      maxChunks: 2
    })

    expect(result.status).toBe('ok')
    expect(result.tokenEstimate).toBe(4)
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]?.chunk).toMatchObject({
      id: 'chunk-fitting',
      content: 'Fits whole.'
    })
    expect(result.citations).toEqual([
      expect.objectContaining({
        documentId: 'doc-fitting',
        chunkId: 'chunk-fitting',
        title: 'Fitting Document',
        sourceUri: 'note://fitting'
      })
    ])
    expect(result.contextText).toBe('[1] Fitting Document\nFits whole.')
  })

  it('returns an empty token-budget-exhausted result when every hit exceeds budget', async () => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-too-large-1',
          document_id: 'doc-too-large-1',
          chunk_index: 0,
          content: 'First oversized chunk content must not leak into context.',
          chunk_hash: 'too-large-hash-1',
          token_estimate: 6,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://too-large-1',
          title: 'First Oversized Document',
          document_hash: 'too-large-document-hash-1',
          permission_scope: 'default',
          document_metadata: null,
          document_created_at: 10,
          document_updated_at: 20,
          score: 2
        },
        {
          chunk_id: 'chunk-too-large-2',
          document_id: 'doc-too-large-2',
          chunk_index: 0,
          content: 'Second oversized chunk content must not leak into context.',
          chunk_hash: 'too-large-hash-2',
          token_estimate: 7,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://too-large-2',
          title: 'Second Oversized Document',
          document_hash: 'too-large-document-hash-2',
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
      query: 'oversized',
      tokenBudget: 5,
      maxChunks: 2
    })

    expect(result).toEqual({
      status: 'degraded',
      contextText: '',
      chunks: [],
      tokenEstimate: 0,
      citations: [],
      degradedReason: 'token-budget-exhausted'
    })
  })

  it.each([
    { name: 'NaN', tokenBudget: Number.NaN },
    { name: 'positive infinity', tokenBudget: Number.POSITIVE_INFINITY },
    // Intentional runtime-boundary cast: SDK callers are typed, but host inputs can be strings.
    { name: 'runtime numeric string', tokenBudget: '2' as unknown as number }
  ])('fails closed at budget 1 for $name', async ({ tokenBudget }) => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-over-budget',
          document_id: 'doc-over-budget',
          chunk_index: 0,
          content: 'This chunk requires two tokens.',
          chunk_hash: 'over-budget-hash',
          token_estimate: 2,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://over-budget',
          title: 'Over Budget Document',
          document_hash: 'over-budget-document-hash',
          permission_scope: 'default',
          document_metadata: null,
          document_created_at: 10,
          document_updated_at: 20,
          score: 1
        }
      ]
    })

    const result = await new LocalKnowledgeEngine().buildContext({
      query: 'over budget',
      tokenBudget,
      maxChunks: 1
    })

    expect(result).toEqual({
      status: 'degraded',
      contextText: '',
      chunks: [],
      tokenEstimate: 0,
      citations: [],
      degradedReason: 'token-budget-exhausted'
    })
  })

  it('re-evaluates stale CJK estimates before admitting persisted chunks to context', async () => {
    dbMock.client.execute.mockResolvedValueOnce({
      rows: [
        {
          chunk_id: 'chunk-legacy-cjk',
          document_id: 'doc-legacy-cjk',
          chunk_index: 0,
          content: '中文中文中文',
          chunk_hash: 'legacy-cjk-hash',
          token_estimate: 1,
          chunk_metadata: null,
          chunk_created_at: 10,
          chunk_updated_at: 20,
          source_type: 'manual',
          source_uri: 'note://legacy-cjk',
          title: 'Legacy CJK Document',
          document_hash: 'legacy-cjk-document-hash',
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
      query: '中文',
      tokenBudget: 5,
      maxChunks: 1
    })

    expect(result).toEqual({
      status: 'degraded',
      contextText: '',
      chunks: [],
      tokenEstimate: 0,
      citations: [],
      degradedReason: 'token-budget-exhausted'
    })
    expect(dbMock.client.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('UPDATE intelligence_knowledge_chunks')
      })
    )
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
