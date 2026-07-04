import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextHygieneService } from './intelligence-context-hygiene'
import { localKnowledgeEngine } from './intelligence-local-knowledge-engine'

interface FakeRow extends Record<string, unknown> {}

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

vi.mock('./intelligence-local-knowledge-engine', () => ({
  localKnowledgeEngine: {
    buildContext: vi.fn(async () => ({
      status: 'ok',
      contextText: '',
      chunks: [],
      tokenEstimate: 0,
      citations: []
    }))
  }
}))

function rows(value: FakeRow[] = []) {
  return { rows: value }
}

describe('ContextHygieneService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.TUFF_INTELLIGENCE_CONTEXT_COREBOX_ONLY
  })

  it('creates a CoreBox session and checkpoint with light context by default', async () => {
    dbMock.client.execute.mockResolvedValueOnce(rows([])).mockResolvedValue(rows([]))

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Summarize current clipboard',
      tokenBudget: 120,
      traceId: 'trace-1'
    })

    expect(result.session.owner).toBe('corebox')
    expect(result.checkpoint).toMatchObject({
      type: 'session_start',
      contextScope: 'light'
    })
    expect(result.package.items.map((item) => item.sourceType)).toEqual(['current_input'])
    expect(result.package.items[0]).toMatchObject({
      reason: 'current user input'
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_context_sessions')
      })
    )
  })

  it('uses explicit session continuation for normal recent turns', async () => {
    const now = Date.now()
    dbMock.client.execute
      .mockResolvedValueOnce(
        rows([
          {
            id: 'session-1',
            owner: 'corebox',
            status: 'active',
            objective: null,
            summary: null,
            metadata: null,
            created_at: now - 1000,
            updated_at: now,
            archived_at: null
          }
        ])
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'turn-old',
            session_id: 'session-1',
            role: 'user',
            content: 'previous task detail',
            privacy_level: 'normal',
            token_estimate: 5,
            metadata: null,
            created_at: now - 500
          }
        ])
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValue(rows([]))

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      input: 'continue it',
      tokenBudget: 120
    })

    expect(result.session.id).toBe('session-1')
    expect(result.checkpoint).toBeUndefined()
    expect(result.package.scope).toBe('session')
    expect(result.package.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'recent_turn',
          sourceId: 'turn-old',
          reason: 'explicit session continuation'
        })
      ])
    )
  })

  it('rejects secret memory before persistence', async () => {
    const service = new ContextHygieneService()

    await expect(
      service.saveMemory({
        type: 'preference',
        scope: 'global',
        content: 'api_key = sk-test-secret-value'
      })
    ).rejects.toThrow('MEMORY_POLICY_REJECTED_SECRET')

    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('suggests explicit memory candidates without persistence', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: '老板喜欢默认使用中文回复。',
      type: 'preference',
      scope: 'workspace',
      tags: [' language ', 'language', 'preference'],
      confidence: 1.8,
      sourceSessionId: 'session-1',
      sourceTurnId: 'turn-1'
    })

    expect(result).toEqual({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      candidate: {
        type: 'preference',
        scope: 'workspace',
        summary: '老板喜欢默认使用中文回复。',
        tags: ['language', 'preference'],
        confidence: 1,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal'
      }
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('rejects secret memory candidates without persistence', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: 'api_key = sk-test-secret-value'
    })

    expect(result).toEqual({
      status: 'rejected',
      reason: 'secret_detected'
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('honors explicit memory opt-out before suggesting candidates', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: '请不要记住这个临时偏好。'
    })

    expect(result).toEqual({
      status: 'rejected',
      reason: 'user_opt_out'
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('keeps sensitive memory candidates in review state', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: 'My private project detail',
      privacyLevel: 'sensitive'
    })

    expect(result).toEqual({
      status: 'needs_review',
      reason: 'sensitive_content'
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('lists only normal non-tombstoned memories by default', async () => {
    dbMock.client.execute.mockResolvedValueOnce(
      rows([
        {
          id: 'mem-1',
          type: 'preference',
          scope: 'workspace',
          content: 'Use Chinese replies',
          summary: 'Use Chinese replies',
          tags: JSON.stringify(['language']),
          confidence: 0.9,
          source_session_id: 'session-1',
          source_turn_id: 'turn-1',
          privacy_level: 'normal',
          ttl: null,
          enabled: 1,
          created_at: 10,
          updated_at: 20,
          last_used_at: null,
          usage_count: 0
        }
      ])
    )

    const service = new ContextHygieneService()
    const result = await service.listMemories({
      scope: 'workspace',
      type: 'preference',
      limit: 10
    })

    expect(result.memories).toEqual([
      {
        id: 'mem-1',
        type: 'preference',
        scope: 'workspace',
        content: 'Use Chinese replies',
        summary: 'Use Chinese replies',
        tags: ['language'],
        confidence: 0.9,
        sourceSessionId: 'session-1',
        sourceTurnId: 'turn-1',
        privacyLevel: 'normal',
        ttl: undefined,
        enabled: true,
        createdAt: 10,
        updatedAt: 20,
        lastUsedAt: undefined,
        usageCount: 0
      }
    ])
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('m.privacy_level = ?')
      })
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('t.memory_id IS NULL'),
        args: ['normal', 'workspace', 'preference', 10]
      })
    )
  })

  it('redacts secret turns before writing them to SQLite', async () => {
    dbMock.client.execute.mockResolvedValueOnce(rows([])).mockResolvedValue(rows([]))

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'api_key = sk-test-secret-value',
      tokenBudget: 120
    })

    expect(result.turn).toMatchObject({
      privacyLevel: 'secret',
      content: '[redacted:private-context-turn]'
    })
    expect(result.package.items).toEqual([])
    expect(result.package.metadata).toMatchObject({
      excluded: [
        {
          sourceType: 'current_input',
          sourceId: result.turn.id,
          reason: 'secret-policy-blocked',
          tokenEstimate: expect.any(Number)
        }
      ]
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_context_turns'),
        args: expect.arrayContaining(['[redacted:private-context-turn]', 'secret'])
      })
    )
    const packageLogCall = dbMock.client.execute.mock.calls.find(([arg]) => {
      return String(arg.sql).includes('INSERT INTO intelligence_context_package_logs')
    })
    expect(JSON.parse(String(packageLogCall?.[0].args?.[7]))).toMatchObject({
      excluded: [
        {
          sourceType: 'current_input',
          sourceId: result.turn.id,
          reason: 'secret-policy-blocked'
        }
      ]
    })
  })

  it('carries retrieval citations into context package items and the package log', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const localKnowledgeEngineMock = vi.mocked(localKnowledgeEngine)
    localKnowledgeEngineMock.buildContext.mockResolvedValueOnce({
      status: 'ok',
      contextText: '[1] Knowledge Notes\nretrieval citation evidence',
      chunks: [
        {
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            chunkIndex: 0,
            content: 'retrieval citation evidence',
            contentHash: 'chunk-hash',
            tokenEstimate: 6,
            createdAt: 10,
            updatedAt: 20
          },
          document: {
            id: 'doc-1',
            sourceType: 'manual',
            sourceUri: 'note://knowledge',
            title: 'Knowledge Notes',
            contentHash: 'doc-hash',
            permissionScope: 'workspace:tuff',
            createdAt: 10,
            updatedAt: 20
          },
          score: 1.2,
          citation: {
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            title: 'Knowledge Notes',
            sourceUri: 'note://knowledge',
            sourceType: 'manual',
            updatedAt: 20
          }
        }
      ],
      tokenEstimate: 6,
      citations: [
        {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          title: 'Knowledge Notes',
          sourceUri: 'note://knowledge',
          sourceType: 'manual',
          updatedAt: 20
        }
      ]
    })

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Use local knowledge retrieval',
      explicitScope: 'retrieval',
      tokenBudget: 120,
      traceId: 'trace-retrieval'
    })

    const retrievalItem = result.package.items.find((item) => item.sourceType === 'retrieval')
    expect(result.package.metadata).toMatchObject({
      retrieval: {
        status: 'ok',
        chunkCount: 1,
        citationCount: 1
      }
    })
    expect(retrievalItem).toMatchObject({
      sourceId: 'chunk-1',
      metadata: {
        citation: {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          title: 'Knowledge Notes'
        },
        documentId: 'doc-1',
        sourceType: 'manual',
        sourceUri: 'note://knowledge',
        status: 'ok'
      }
    })

    const packageLogCall = dbMock.client.execute.mock.calls.find(([arg]) => {
      return String(arg.sql).includes('INSERT INTO intelligence_context_package_logs')
    })
    expect(packageLogCall).toBeTruthy()
    const persistedItems = JSON.parse(String(packageLogCall?.[0].args?.[6]))
    expect(persistedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'retrieval',
          sourceId: 'chunk-1',
          metadata: expect.objectContaining({
            citation: expect.objectContaining({
              documentId: 'doc-1',
              chunkId: 'chunk-1'
            }),
            status: 'ok'
          })
        })
      ])
    )
  })

  it('records token budget pruned retrieval sources without storing content in metadata', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const localKnowledgeEngineMock = vi.mocked(localKnowledgeEngine)
    localKnowledgeEngineMock.buildContext.mockResolvedValueOnce({
      status: 'ok',
      contextText: 'large retrieval',
      chunks: [
        {
          chunk: {
            id: 'chunk-large',
            documentId: 'doc-large',
            chunkIndex: 0,
            content: 'large retrieval content',
            contentHash: 'chunk-hash',
            tokenEstimate: 500,
            createdAt: 10,
            updatedAt: 20
          },
          document: {
            id: 'doc-large',
            sourceType: 'manual',
            title: 'Large Notes',
            contentHash: 'doc-hash',
            permissionScope: 'workspace:tuff',
            createdAt: 10,
            updatedAt: 20
          },
          score: 1,
          citation: {
            documentId: 'doc-large',
            chunkId: 'chunk-large',
            title: 'Large Notes',
            sourceType: 'manual',
            updatedAt: 20
          }
        }
      ],
      tokenEstimate: 500,
      citations: [
        {
          documentId: 'doc-large',
          chunkId: 'chunk-large',
          title: 'Large Notes',
          sourceType: 'manual',
          updatedAt: 20
        }
      ]
    })

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Use local knowledge retrieval',
      explicitScope: 'retrieval',
      tokenBudget: 20
    })

    expect(result.package.items.some((item) => item.sourceId === 'chunk-large')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      excluded: [
        {
          sourceType: 'retrieval',
          sourceId: 'chunk-large',
          reason: 'token-budget-pruned',
          tokenEstimate: 500
        }
      ]
    })
    expect(JSON.stringify(result.package.metadata)).not.toContain('large retrieval content')
  })

  it('records retrieval degraded reason when no retrieval item is injected', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const localKnowledgeEngineMock = vi.mocked(localKnowledgeEngine)
    localKnowledgeEngineMock.buildContext.mockResolvedValueOnce({
      status: 'degraded',
      contextText: '',
      chunks: [],
      tokenEstimate: 0,
      citations: [],
      degradedReason: 'fts-unavailable'
    })

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Need unavailable retrieval',
      explicitScope: 'retrieval',
      tokenBudget: 120,
      metadata: { source: 'test' }
    })

    expect(result.package.items.some((item) => item.sourceType === 'retrieval')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      source: 'test',
      retrieval: {
        status: 'degraded',
        degradedReason: 'fts-unavailable',
        chunkCount: 0,
        citationCount: 0
      }
    })

    const packageLogCall = dbMock.client.execute.mock.calls.find(([arg]) => {
      return String(arg.sql).includes('INSERT INTO intelligence_context_package_logs')
    })
    expect(packageLogCall).toBeTruthy()
    expect(JSON.parse(String(packageLogCall?.[0].args?.[7]))).toMatchObject({
      source: 'test',
      retrieval: {
        status: 'degraded',
        degradedReason: 'fts-unavailable',
        chunkCount: 0,
        citationCount: 0
      }
    })
  })

  it('lists metadata-only context package logs by session or trace', async () => {
    dbMock.client.execute.mockResolvedValueOnce(
      rows([
        {
          id: 'ctxpkg-1',
          session_id: 'session-1',
          scope: 'retrieval',
          trace_id: 'trace-1',
          token_budget: 120,
          token_estimate: 10,
          items: JSON.stringify([
            {
              sourceType: 'retrieval',
              sourceId: 'chunk-1',
              reason: 'local knowledge match: Knowledge Notes',
              tokenEstimate: 4,
              metadata: {
                citation: {
                  documentId: 'doc-1',
                  chunkId: 'chunk-1',
                  title: 'Knowledge Notes'
                },
                status: 'ok'
              }
            }
          ]),
          metadata: JSON.stringify({
            retrieval: {
              status: 'ok',
              chunkCount: 1,
              citationCount: 1
            }
          }),
          created_at: 20
        }
      ])
    )
    const service = new ContextHygieneService()

    const result = await service.listPackageLogs({
      sessionId: 'session-1',
      traceId: 'trace-1',
      limit: 100
    })

    expect(result.logs[0]).toMatchObject({
      id: 'ctxpkg-1',
      sessionId: 'session-1',
      traceId: 'trace-1',
      scope: 'retrieval',
      items: [
        {
          sourceType: 'retrieval',
          sourceId: 'chunk-1',
          reason: 'local knowledge match: Knowledge Notes',
          tokenEstimate: 4,
          metadata: {
            citation: {
              documentId: 'doc-1',
              chunkId: 'chunk-1'
            },
            status: 'ok'
          }
        }
      ],
      metadata: {
        retrieval: {
          status: 'ok',
          chunkCount: 1,
          citationCount: 1
        }
      }
    })
    expect('content' in result.logs[0]!.items[0]!).toBe(false)
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('FROM intelligence_context_package_logs'),
        args: ['session-1', 'trace-1', 50]
      })
    )
  })

  it('lists metadata-only context checkpoints by session and type', async () => {
    dbMock.client.execute.mockResolvedValueOnce(
      rows([
        {
          id: 'ctxcp-1',
          session_id: 'session-1',
          type: 'session_start',
          reason: 'new-session',
          summary: null,
          context_scope: 'retrieval',
          metadata: JSON.stringify({ source: 'test' }),
          created_at: 20
        }
      ])
    )
    const service = new ContextHygieneService()

    const result = await service.listCheckpoints({
      sessionId: 'session-1',
      type: 'session_start',
      limit: 100
    })

    expect(result.checkpoints).toEqual([
      {
        id: 'ctxcp-1',
        sessionId: 'session-1',
        type: 'session_start',
        reason: 'new-session',
        summary: undefined,
        contextScope: 'retrieval',
        metadata: { source: 'test' },
        createdAt: 20
      }
    ])
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('FROM intelligence_context_checkpoints'),
        args: ['session-1', 'session_start', 50]
      })
    )
  })

  it('requires a session before listing checkpoints', async () => {
    const service = new ContextHygieneService()

    await expect(service.listCheckpoints({ sessionId: '' })).rejects.toThrow(
      'sessionId is required'
    )
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('requires a session or trace filter before listing package logs', async () => {
    const service = new ContextHygieneService()

    await expect(service.listPackageLogs({})).rejects.toThrow('sessionId or traceId is required')
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('writes a tombstone when deleting memory', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const service = new ContextHygieneService()

    const tombstone = await service.deleteMemory('memory-1', 'user-request')

    expect(tombstone).toMatchObject({
      memoryId: 'memory-1',
      reason: 'user-request'
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('UPDATE intelligence_memory_items SET enabled = 0')
      })
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_memory_tombstones')
      })
    )
  })

  it('updates normal non-tombstoned memory enabled state', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const service = new ContextHygieneService()

    const result = await service.setMemoryEnabled('memory-1', false)

    expect(result).toMatchObject({
      memoryId: 'memory-1',
      enabled: false
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('SET enabled = ?'),
        args: [0, expect.any(Number), 'memory-1']
      })
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("privacy_level = 'normal'")
      })
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('intelligence_memory_tombstones')
      })
    )
  })
})
