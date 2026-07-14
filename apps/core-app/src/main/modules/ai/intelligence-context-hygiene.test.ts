import type {
  CompressionSnapshotDraft,
  CompressionSnapshotMetadata,
  ContextPackage,
  MemoryItem,
} from '@talex-touch/utils/types/intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextHygieneService, isMemoryUsableForContext } from './intelligence-context-hygiene'
import { localKnowledgeEngine } from './intelligence-local-knowledge-engine'

interface FakeRow extends Record<string, unknown> {}

const dbMock = vi.hoisted(() => ({
  client: {
    execute: vi.fn(),
  },
}))

vi.mock('../database', () => ({
  databaseModule: {
    getClient: () => dbMock.client,
  },
}))

vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation()),
  },
}))

vi.mock('./intelligence-local-knowledge-engine', () => ({
  localKnowledgeEngine: {
    buildContext: vi.fn(async () => ({
      status: 'ok',
      contextText: '',
      chunks: [],
      tokenEstimate: 0,
      citations: [],
    })),
  },
}))

function rows(value: FakeRow[] = [], rowsAffected = 0) {
  return { rows: value, rowsAffected }
}

function compressionSessionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: 'session-1',
    owner: 'corebox',
    status: 'active',
    objective: 'Ship context hygiene',
    summary: 'legacy summary',
    metadata: null,
    created_at: 1,
    updated_at: 100,
    archived_at: null,
    ...overrides,
  }
}

function compressionSnapshotRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: 'snapshot-1',
    session_id: 'session-1',
    goal: 'Ship context hygiene',
    current_state: 'Memory governance is complete',
    decisions: JSON.stringify(['Keep host ownership']),
    constraints: JSON.stringify(['Never persist secrets']),
    artifacts: JSON.stringify(['apps/core-app']),
    open_questions: JSON.stringify(['How much history is needed?']),
    source_turn_from: 'turn-1',
    source_turn_to: 'turn-2',
    metadata: JSON.stringify({
      privacyLevel: 'normal',
      factState: 'confirmed',
      confidence: 0.9,
      checkpointId: 'checkpoint-1',
    }),
    created_at: 90,
    ...overrides,
  }
}

function mockPrepareTurnWithCompressionSnapshot(
  snapshot: FakeRow,
  tombstonedMemoryId?: string,
  sourcePrivacy: 'normal' | 'sensitive' | 'secret' = 'normal',
): void {
  dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
    const sql = typeof statement === 'string' ? statement : statement.sql
    if (sql.includes('SELECT * FROM intelligence_context_sessions'))
      return rows([compressionSessionRow({ updated_at: Date.now() })])
    if (sql.includes('FROM intelligence_compression_snapshots'))
      return rows([snapshot])
    if (sql.includes('(id = ? OR id = ?)')) {
      return rows([
        { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
        { id: 'turn-2', privacy_level: sourcePrivacy, created_at: 20 },
      ])
    }
    if (sql.includes('created_at >= ?')) {
      return rows([
        { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
        { id: 'turn-2', privacy_level: sourcePrivacy, created_at: 20 },
      ])
    }
    if (sql.includes('FROM intelligence_memory_tombstones'))
      return tombstonedMemoryId ? rows([{ memory_id: tombstonedMemoryId }]) : rows([])
    if (sql.includes('SELECT * FROM intelligence_context_turns')) {
      return rows([
        {
          id: 'turn-2',
          session_id: 'session-1',
          role: 'assistant',
          content: 'prior normal turn',
          privacy_level: 'normal',
          token_estimate: 4,
          metadata: null,
          created_at: 80,
        },
      ])
    }
    return rows([])
  })
}

describe('contextHygieneService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.client.execute.mockReset()
    delete process.env.TUFF_INTELLIGENCE_CONTEXT_COREBOX_ONLY
  })

  it('fails closed for invalid, expired, and unscoped memories', () => {
    const now = 10_000
    const baseMemory: MemoryItem = {
      id: 'memory-1',
      type: 'preference',
      scope: 'global',
      content: 'Use concise answers',
      summary: 'Use concise answers',
      tags: [],
      confidence: 1,
      privacyLevel: 'normal',
      enabled: true,
      createdAt: 1_000,
      updatedAt: 9_000,
      usageCount: 0,
    }

    expect(isMemoryUsableForContext(baseMemory, 'session-1', now)).toBe(true)
    expect(
      isMemoryUsableForContext(
        { ...baseMemory, scope: 'session', sourceSessionId: 'session-1' },
        'session-1',
        now,
      ),
    ).toBe(true)
    expect(
      isMemoryUsableForContext(
        { ...baseMemory, scope: 'session', sourceSessionId: 'session-2' },
        'session-1',
        now,
      ),
    ).toBe(false)
    expect(isMemoryUsableForContext({ ...baseMemory, scope: 'workspace' }, 'session-1', now)).toBe(
      false,
    )
    expect(isMemoryUsableForContext({ ...baseMemory, scope: 'project' }, 'session-1', now)).toBe(
      false,
    )
    expect(isMemoryUsableForContext({ ...baseMemory, enabled: false }, 'session-1', now)).toBe(
      false,
    )
    expect(
      isMemoryUsableForContext({ ...baseMemory, privacyLevel: 'sensitive' }, 'session-1', now),
    ).toBe(false)
    expect(isMemoryUsableForContext({ ...baseMemory, ttl: 1_000 }, 'session-1', now)).toBe(false)
    expect(isMemoryUsableForContext({ ...baseMemory, ttl: 1_001 }, 'session-1', now)).toBe(true)
  })

  it('creates a CoreBox session and checkpoint with light context by default', async () => {
    dbMock.client.execute.mockResolvedValueOnce(rows([])).mockResolvedValue(rows([]))

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Summarize current clipboard',
      tokenBudget: 120,
      traceId: 'trace-1',
    })

    expect(result.session.owner).toBe('corebox')
    expect(result.checkpoint).toMatchObject({
      type: 'session_start',
      contextScope: 'light',
    })
    expect(result.package.items.map(item => item.sourceType)).toEqual(['current_input'])
    expect(result.package.items[0]).toMatchObject({
      reason: 'current user input',
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_context_sessions'),
      }),
    )
  })

  it('keeps the current input while stateless mode excludes prior context', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Answer without history',
      explicitScope: 'none',
      startNewSession: true,
      metadata: { contextActorId: 'touch-intelligence' },
    })

    expect(result.package.scope).toBe('none')
    expect(result.package.items).toHaveLength(1)
    expect(result.package.items[0]).toMatchObject({
      sourceType: 'current_input',
      content: 'Answer without history',
    })
    expect(result.checkpoint).toMatchObject({
      type: 'session_start',
      contextScope: 'none',
    })
  })

  it('keeps retrieval scope but excludes session history when noHistory is requested', async () => {
    const now = Date.now()
    dbMock.client.execute
      .mockResolvedValueOnce(
        rows([
          {
            id: 'session-1',
            owner: 'corebox',
            status: 'active',
            objective: null,
            summary: 'prior summary must not enter stateless execution',
            metadata: null,
            created_at: now - 1000,
            updated_at: now,
            archived_at: null,
          },
        ]),
      )
      .mockResolvedValue(rows([]))
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      input: 'Use retrieval without history',
      explicitScope: 'retrieval',
      metadata: { noHistory: true },
    })

    expect(result.package.scope).toBe('retrieval')
    expect(result.package.items).toHaveLength(1)
    expect(result.package.items[0]).toMatchObject({
      sourceType: 'current_input',
      content: 'Use retrieval without history',
    })
    expect(JSON.stringify(result.package.items)).not.toContain('prior summary')
  })

  it('rejects continuation across context actors', async () => {
    dbMock.client.execute.mockResolvedValueOnce(
      rows([
        {
          id: 'session-owned-by-a',
          owner: 'corebox',
          status: 'active',
          objective: null,
          summary: null,
          metadata: JSON.stringify({ contextActorId: 'plugin-a' }),
          created_at: 1,
          updated_at: 2,
          archived_at: null,
        },
      ]),
    )
    const service = new ContextHygieneService()

    await expect(
      service.prepareTurn({
        owner: 'corebox',
        sessionId: 'session-owned-by-a',
        input: 'Read another plugin session',
        explicitScope: 'retrieval',
        continueSession: true,
        metadata: { contextActorId: 'plugin-b' },
      }),
    ).rejects.toThrow('CONTEXT_SESSION_SCOPE_MISMATCH')
    expect(dbMock.client.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects continuation across entrypoint owners', async () => {
    dbMock.client.execute.mockResolvedValueOnce(
      rows([
        {
          id: 'workflow-context.run-a',
          owner: 'workflow',
          status: 'active',
          objective: null,
          summary: null,
          metadata: JSON.stringify({ contextActorId: 'workflow:one' }),
          created_at: 1,
          updated_at: 2,
          archived_at: null
        }
      ])
    )
    const service = new ContextHygieneService()

    await expect(
      service.prepareTurn({
        owner: 'assistant',
        sessionId: 'workflow-context.run-a',
        input: 'Attempt cross-entrypoint continuation',
        explicitScope: 'light',
        continueSession: true,
        metadata: { contextActorId: 'workflow:one' }
      })
    ).rejects.toThrow('CONTEXT_SESSION_SCOPE_MISMATCH')
    expect(dbMock.client.execute).toHaveBeenCalledTimes(1)
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
            archived_at: null,
          },
        ]),
      )
      .mockResolvedValueOnce(rows([]))
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
            created_at: now - 500,
          },
        ]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValue(rows([]))

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      input: 'continue it',
      tokenBudget: 120,
    })

    expect(result.session.id).toBe('session-1')
    expect(result.checkpoint).toBeUndefined()
    expect(result.package.scope).toBe('session')
    expect(result.package.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'recent_turn',
          sourceId: 'turn-old',
          reason: 'explicit session continuation',
        }),
      ]),
    )
  })

  it('continues an archived session in a fresh checkpointed session with only its safe snapshot', async () => {
    const writes: Array<{ sql: string, args: unknown[] }> = []
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string, args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      const args = typeof statement === 'string' ? [] : (statement.args ?? [])
      if (sql.includes('SELECT * FROM intelligence_context_sessions')) {
        return rows([compressionSessionRow({
          id: 'archived-source',
          status: 'archived',
          summary: 'legacy summary must lose to the snapshot',
          archived_at: 10,
        })])
      }
      if (sql.includes('FROM intelligence_compression_snapshots'))
        return args[0] === 'archived-source'
          ? rows([compressionSnapshotRow({ session_id: 'archived-source' })])
          : rows([])
      if (sql.includes('(id = ? OR id = ?)')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'normal', created_at: 20 },
        ])
      }
      if (sql.includes('created_at >= ? AND created_at <= ?')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'normal', created_at: 20 },
        ])
      }
      if (sql.includes('SELECT * FROM intelligence_context_turns')) {
        return args[0] === 'archived-source'
          ? rows([{
              id: 'source-raw-turn',
              session_id: 'archived-source',
              role: 'assistant',
              content: 'source raw history must never continue',
              privacy_level: 'normal',
              token_estimate: 8,
              metadata: null,
              created_at: 20,
            }])
          : rows([])
      }
      if (sql.includes('INSERT INTO intelligence_context_sessions')
        || sql.includes('INSERT INTO intelligence_context_checkpoints')) {
        writes.push({ sql, args })
      }
      return rows([])
    })

    const result = await new ContextHygieneService().prepareTurn({
      owner: 'corebox',
      sessionId: 'archived-source',
      continueSession: true,
      input: 'Continue safely from the archive',
      explicitScope: 'session',
      tokenBudget: 1_200,
    })

    expect(result.session.id).not.toBe('archived-source')
    expect(result.checkpoint).toMatchObject({
      type: 'session_start',
      reason: 'archived-session-continuation',
      metadata: {
        continuedFromSessionId: 'archived-source',
        continuationReason: 'archived-session-continuation',
      },
    })
    expect(result.continuation).toEqual({
      sourceSessionId: 'archived-source',
      reason: 'archived-session-continuation',
      status: 'included',
      summarySourceType: 'compression_snapshot',
      summarySourceId: 'snapshot-1',
    })
    expect(result.package.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'summary',
        sourceId: 'snapshot-1',
      }),
      expect.objectContaining({
        sourceType: 'current_input',
        content: 'Continue safely from the archive',
      }),
    ]))
    expect(JSON.stringify(result.package.items)).not.toContain('source raw history')
    expect(JSON.stringify(result.package.items)).not.toContain('legacy summary must lose to the snapshot')
    expect(result.package.items.filter(item => item.sourceType === 'summary')).toHaveLength(1)
    expect(result.package.items.some(item => item.sourceType === 'recent_turn')).toBe(false)
    expect(writes.find(write => write.sql.includes('INSERT INTO intelligence_context_sessions'))?.args[0])
      .not.toBe('archived-source')
    expect(writes.find(write => write.sql.includes('INSERT INTO intelligence_context_checkpoints'))?.args)
      .toEqual(expect.arrayContaining([
        result.checkpoint?.id,
        result.session.id,
        'session_start',
        'archived-session-continuation',
      ]))
    expect(writes.find(write => write.sql.includes('INSERT INTO intelligence_context_checkpoints'))?.args.at(-2))
      .toBe(JSON.stringify({
        continuedFromSessionId: 'archived-source',
        continuationReason: 'archived-session-continuation',
      }))
  })

  it.each([
    {
      name: 'blocked legacy summary',
      sourceSessionId: 'blocked-source',
      source: compressionSessionRow({
        id: 'blocked-source',
        status: 'archived',
        summary: 'token = source-summary-secret',
        archived_at: 10,
      }),
      reason: 'archived-session-continuation',
      status: 'excluded',
      degradedReason: 'summary-content-blocked',
      summarySourceType: 'session_summary',
      summarySourceId: 'blocked-source',
    },
    {
      name: 'missing source session',
      sourceSessionId: 'missing-source',
      source: null,
      reason: 'continuation-session-missing',
      status: 'unavailable',
      degradedReason: 'continuation-source-session-missing',
    },
  ])('keeps current input while continuation is unavailable for $name', async ({
    sourceSessionId,
    source,
    reason,
    status,
    degradedReason,
    summarySourceType,
    summarySourceId,
  }) => {
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string, args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows(source ? [source] : [])
      if (sql.includes('FROM intelligence_compression_snapshots'))
        return rows([])
      return rows([])
    })

    const result = await new ContextHygieneService().prepareTurn({
      owner: 'corebox',
      sessionId: sourceSessionId,
      continueSession: true,
      input: 'Keep only the current question',
      explicitScope: 'session',
    })

    expect(result.session.id).not.toBe(sourceSessionId)
    expect(result.package.items).toEqual([
      expect.objectContaining({
        sourceType: 'current_input',
        content: 'Keep only the current question',
      }),
    ])
    expect(result.continuation).toMatchObject({
      sourceSessionId,
      reason,
      status,
      degradedReason,
      ...(summarySourceType ? { summarySourceType, summarySourceId } : {}),
    })
    expect(JSON.stringify({ checkpoint: result.checkpoint, continuation: result.continuation }))
      .not.toContain('source-summary-secret')
  })

  it('writes a validated compression snapshot, checkpoint, and session CAS atomically', async () => {
    const statements: string[] = []
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      statements.push(sql)
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows([compressionSessionRow()])
      if (sql.includes('(id = ? OR id = ?)')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'normal', created_at: 20 },
        ])
      }
      if (sql.includes('created_at >= ?')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'normal', created_at: 20 },
        ])
      }
      if (sql.includes('UPDATE intelligence_context_sessions'))
        return rows([], 1)
      return rows([])
    })
    const service = new ContextHygieneService()
    const snapshot = {
      goal: 'Ship context hygiene',
      currentState: 'Compression is validated',
      decisions: ['Keep source turns'],
      constraints: ['No secret content'],
      artifacts: ['apps/core-app'],
      openQuestions: ['How much context is enough?'],
      sourceTurnFrom: 'turn-1',
      sourceTurnTo: 'turn-2',
      metadata: {
        privacyLevel: 'normal' as const,
        factState: 'confirmed' as const,
        confidence: 0.9,
        memoryIds: ['memory-1'],
        ignoredField: 'not-persisted',
      },
      ignoredField: 'not-persisted',
    } satisfies CompressionSnapshotDraft & {
      ignoredField: string
      metadata: CompressionSnapshotMetadata & { ignoredField: string }
    }

    const result = await service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot,
    })

    expect(result.status).toBe('created')
    if (result.status !== 'created')
      throw new Error('expected created compression snapshot')
    expect(result.snapshot).toMatchObject({
      sessionId: 'session-1',
      sourceTurnFrom: 'turn-1',
      sourceTurnTo: 'turn-2',
      metadata: {
        privacyLevel: 'normal',
        factState: 'confirmed',
        confidence: 0.9,
        memoryIds: ['memory-1'],
        checkpointId: result.checkpoint.id,
      },
    })
    expect(result.snapshot.metadata).not.toHaveProperty('ignoredField')
    expect(result.checkpoint).toMatchObject({
      type: 'compression_snapshot',
      reason: 'compression-snapshot-created',
      metadata: {
        snapshotId: result.snapshot.id,
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-2',
      },
    })
    expect(statements[0]).toBe('BEGIN IMMEDIATE')
    expect(statements.at(-1)).toBe('COMMIT')
    expect(statements).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO intelligence_compression_snapshots'),
      expect.stringContaining('INSERT INTO intelligence_context_checkpoints'),
      expect.stringContaining('UPDATE intelligence_context_sessions'),
    ]))
    expect(statements.some(sql => /\bDELETE\b/.test(sql))).toBe(false)
  })

  it('maps persisted compression snapshots without unknown metadata fields', async () => {
    dbMock.client.execute.mockResolvedValueOnce(rows([
      compressionSnapshotRow({
        metadata: JSON.stringify({
          privacyLevel: 'normal',
          factState: 'confirmed',
          confidence: 0.9,
          checkpointId: 'checkpoint-1',
          unknown: 'drop-me',
        }),
      }),
    ]))
    const service = new ContextHygieneService()

    const result = await service.listCompressionSnapshots({ sessionId: 'session-1', limit: 5 })

    expect(result.snapshots[0]).toMatchObject({
      id: 'snapshot-1',
      sessionId: 'session-1',
      decisions: ['Keep host ownership'],
      metadata: {
        privacyLevel: 'normal',
        factState: 'confirmed',
        checkpointId: 'checkpoint-1',
      },
    })
    expect(result.snapshots[0]?.metadata).not.toHaveProperty('unknown')
    expect(dbMock.client.execute).toHaveBeenCalledWith(expect.objectContaining({
      args: ['session-1', 5],
    }))
  })

  it.each([
    ['missing-range', { currentState: 'State', sourceTurnFrom: '', sourceTurnTo: '' }],
    ['oversized', { currentState: 'x'.repeat(4_001), sourceTurnFrom: 'turn-1', sourceTurnTo: 'turn-2' }],
    ['malformed-array', { decisions: ['valid', 42], sourceTurnFrom: 'turn-1', sourceTurnTo: 'turn-2' }],
  ])('rejects %s compression input before persistence', async (_name, snapshot) => {
    const service = new ContextHygieneService()

    await expect(service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot: snapshot as unknown as CompressionSnapshotDraft,
    })).rejects.toThrow('COMPRESSION_SNAPSHOT_INVALID')
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it.each([
    ['secret', { currentState: 'token = hidden-secret', sourceTurnFrom: 'turn-1', sourceTurnTo: 'turn-2' }],
    ['sensitive', {
      currentState: 'Sensitive state',
      sourceTurnFrom: 'turn-1',
      sourceTurnTo: 'turn-2',
      metadata: { privacyLevel: 'sensitive' as const },
    }],
    ['user-rejected', {
      currentState: 'Rejected state',
      sourceTurnFrom: 'turn-1',
      sourceTurnTo: 'turn-2',
      metadata: { factState: 'user-rejected' as const },
    }],
    ['low-confidence', {
      currentState: 'Uncertain state',
      sourceTurnFrom: 'turn-1',
      sourceTurnTo: 'turn-2',
      metadata: { confidence: 0.2 },
    }],
  ])('rejects %s snapshot policy input before persistence', async (_name, snapshot) => {
    const service = new ContextHygieneService()

    await expect(service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot,
    })).rejects.toThrow('COMPRESSION_SNAPSHOT_INVALID')
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('returns a stable degraded result when the session CAS version is stale', async () => {
    const statements: string[] = []
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      statements.push(sql)
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows([compressionSessionRow({ updated_at: 101 })])
      return rows([])
    })
    const service = new ContextHygieneService()

    const result = await service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot: {
        currentState: 'Stale compression result',
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-2',
      },
    })

    expect(result).toEqual({
      status: 'degraded',
      degradedReason: 'cas-conflict',
      sessionUpdatedAt: 101,
    })
    expect(statements).toEqual([
      'BEGIN IMMEDIATE',
      'SELECT * FROM intelligence_context_sessions WHERE id = ? LIMIT 1',
      'ROLLBACK',
    ])
    expect(statements.some(sql => sql.includes('INSERT INTO'))).toBe(false)
    expect(statements.some(sql => /\bDELETE\b/.test(sql))).toBe(false)
  })

  it('rolls back snapshot and checkpoint writes when the final CAS loses', async () => {
    const statements: string[] = []
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      statements.push(sql)
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows([compressionSessionRow()])
      if (sql.includes('(id = ? OR id = ?)')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'normal', created_at: 20 },
        ])
      }
      if (sql.includes('created_at >= ?')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'normal', created_at: 20 },
        ])
      }
      return rows([])
    })
    const service = new ContextHygieneService()

    const result = await service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot: {
        currentState: 'Concurrent result',
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-2',
      },
    })

    expect(result).toMatchObject({ status: 'degraded', degradedReason: 'cas-conflict' })
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(statements).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO intelligence_compression_snapshots'),
      expect.stringContaining('INSERT INTO intelligence_context_checkpoints'),
    ]))
    expect(statements.some(sql => /\bDELETE\b/.test(sql))).toBe(false)
  })

  it('rejects private source ranges and keeps every turn untouched', async () => {
    const statements: string[] = []
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      statements.push(sql)
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows([compressionSessionRow()])
      if (sql.includes('(id = ? OR id = ?)')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'secret', created_at: 20 },
        ])
      }
      if (sql.includes('created_at >= ?')) {
        return rows([
          { id: 'turn-1', privacy_level: 'normal', created_at: 10 },
          { id: 'turn-2', privacy_level: 'secret', created_at: 20 },
        ])
      }
      return rows([])
    })
    const service = new ContextHygieneService()

    await expect(service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot: {
        currentState: 'Private range',
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-2',
      },
    })).rejects.toThrow('COMPRESSION_SNAPSHOT_INVALID:source-range-privacy')
    expect(statements).toContain('ROLLBACK')
    expect(statements.some(sql => sql.includes('INSERT INTO'))).toBe(false)
    expect(statements.some(sql => /\bDELETE\b/.test(sql))).toBe(false)
  })

  it('rejects a persisted source range with a missing endpoint', async () => {
    const statements: string[] = []
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      statements.push(sql)
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows([compressionSessionRow()])
      if (sql.includes('(id = ? OR id = ?)'))
        return rows([{ id: 'turn-1', privacy_level: 'normal', created_at: 10 }])
      return rows([])
    })
    const service = new ContextHygieneService()

    await expect(service.createCompressionSnapshot({
      sessionId: 'session-1',
      expectedSessionUpdatedAt: 100,
      snapshot: {
        currentState: 'Missing endpoint',
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-missing',
      },
    })).rejects.toThrow('COMPRESSION_SNAPSHOT_INVALID:source-range-missing')
    expect(statements).toContain('ROLLBACK')
    expect(statements.some(sql => sql.includes('INSERT INTO'))).toBe(false)
    expect(statements.some(sql => /\bDELETE\b/.test(sql))).toBe(false)
  })

  it('injects the latest valid snapshot with metadata-only provenance', async () => {
    mockPrepareTurnWithCompressionSnapshot(compressionSnapshotRow())
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      explicitScope: 'session',
      input: 'continue with the plan',
      tokenBudget: 500,
    })

    const summary = result.package.items.find(item => item.sourceType === 'summary')
    expect(summary).toMatchObject({
      sourceId: 'snapshot-1',
      reason: 'validated compression snapshot',
      metadata: {
        snapshotId: 'snapshot-1',
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-2',
        checkpointId: 'checkpoint-1',
      },
    })
    expect(summary?.content).toContain('Current state: Memory governance is complete')
    expect(summary?.content).toContain('Decisions:\n- Keep host ownership')
    expect(result.package.metadata).toMatchObject({
      compression: {
        status: 'included',
        snapshotId: 'snapshot-1',
        checkpointId: 'checkpoint-1',
      },
    })
    expect(JSON.stringify(result.package.metadata)).not.toContain('prior normal turn')
  })

  it('excludes a snapshot that references tombstoned memory', async () => {
    mockPrepareTurnWithCompressionSnapshot(
      compressionSnapshotRow({
        metadata: JSON.stringify({
          privacyLevel: 'normal',
          factState: 'confirmed',
          confidence: 0.9,
          memoryIds: ['memory-1'],
          checkpointId: 'checkpoint-1',
        }),
      }),
      'memory-1',
    )
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      explicitScope: 'session',
      input: 'continue with the plan',
      tokenBudget: 500,
    })

    expect(result.package.items.some(item => item.sourceId === 'snapshot-1')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      compression: {
        status: 'excluded',
        degradedReason: 'snapshot-memory-tombstoned',
      },
      excluded: expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'summary',
          sourceId: 'snapshot-1',
          reason: 'snapshot-memory-tombstoned',
        }),
      ]),
    })
  })

  it.each([
    [
      'sensitive',
      compressionSnapshotRow({ metadata: JSON.stringify({ privacyLevel: 'sensitive' }) }),
      'snapshot-sensitive-blocked',
    ],
    [
      'user-rejected',
      compressionSnapshotRow({ metadata: JSON.stringify({ factState: 'user-rejected' }) }),
      'snapshot-user-rejected',
    ],
    [
      'secret',
      compressionSnapshotRow({ current_state: 'token = hidden-snapshot-secret' }),
      'snapshot-content-blocked',
    ],
  ])('excludes %s snapshot content from context packages', async (_name, snapshot, reason) => {
    mockPrepareTurnWithCompressionSnapshot(snapshot)
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      explicitScope: 'session',
      input: 'continue safely',
      tokenBudget: 500,
    })

    expect(result.package.items.some(item => item.sourceId === 'snapshot-1')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      compression: { status: 'excluded', degradedReason: reason },
    })
  })

  it('excludes snapshots whose stored source range became private', async () => {
    mockPrepareTurnWithCompressionSnapshot(compressionSnapshotRow(), undefined, 'sensitive')
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      explicitScope: 'session',
      input: 'continue safely',
      tokenBudget: 500,
    })

    expect(result.package.items.some(item => item.sourceId === 'snapshot-1')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      compression: {
        status: 'excluded',
        degradedReason: 'snapshot-source-privacy-blocked',
      },
    })
  })

  it('degrades to recent turns when the latest snapshot cannot be read', async () => {
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      if (sql.includes('SELECT * FROM intelligence_context_sessions'))
        return rows([compressionSessionRow()])
      if (sql.includes('FROM intelligence_compression_snapshots'))
        throw new Error('snapshot read failed')
      if (sql.includes('SELECT * FROM intelligence_context_turns')) {
        return rows([{
          id: 'turn-2',
          session_id: 'session-1',
          role: 'assistant',
          content: 'prior normal turn',
          privacy_level: 'normal',
          token_estimate: 4,
          metadata: null,
          created_at: 80,
        }])
      }
      return rows([])
    })
    const service = new ContextHygieneService()

    const result = await service.prepareTurn({
      owner: 'corebox',
      sessionId: 'session-1',
      continueSession: true,
      explicitScope: 'session',
      input: 'continue safely',
      tokenBudget: 500,
    })

    expect(result.package.items.some(item => item.sourceType === 'summary')).toBe(false)
    expect(result.package.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'recent_turn', sourceId: 'turn-2' }),
    ]))
    expect(result.package.metadata).toMatchObject({
      compression: { status: 'degraded', degradedReason: 'snapshot-read-failed' },
    })
  })

  it('rejects secret memory before persistence', async () => {
    const service = new ContextHygieneService()

    await expect(
      service.saveMemory({
        type: 'preference',
        scope: 'global',
        content: 'api_key = sk-test-secret-value',
      }),
    ).rejects.toThrow('MEMORY_POLICY_REJECTED_SECRET')

    await expect(
      service.saveMemory({
        type: 'preference',
        scope: 'global',
        content: 'Safe content',
        summary: 'token = hidden-summary-secret',
      }),
    ).rejects.toThrow('MEMORY_POLICY_REJECTED_SECRET')

    await expect(
      service.saveMemory({
        type: 'preference',
        scope: 'global',
        content: 'Safe content',
        tags: ['api_key = hidden-tag-secret'],
      }),
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
      sourceTurnId: 'turn-1',
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
        privacyLevel: 'normal',
        ttl: undefined,
      },
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('rejects secret memory candidates without persistence', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: 'api_key = sk-test-secret-value',
    })

    expect(result).toEqual({
      status: 'rejected',
      reason: 'secret_detected',
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('honors explicit memory opt-out before suggesting candidates', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: '请不要记住这个临时偏好。',
    })

    expect(result).toEqual({
      status: 'rejected',
      reason: 'user_opt_out',
    })
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('keeps sensitive memory candidates in review state', () => {
    const service = new ContextHygieneService()

    const result = service.evaluateMemory({
      content: 'My private project detail',
      privacyLevel: 'sensitive',
    })

    expect(result).toEqual({
      status: 'needs_review',
      reason: 'sensitive_content',
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
          usage_count: 0,
        },
      ]),
    )

    const service = new ContextHygieneService()
    const result = await service.listMemories({
      scope: 'workspace',
      type: 'preference',
      limit: 10,
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
        replacesMemoryId: undefined,
        privacyLevel: 'normal',
        ttl: undefined,
        enabled: true,
        createdAt: 10,
        updatedAt: 20,
        lastUsedAt: undefined,
        usageCount: 0,
      },
    ])
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('m.privacy_level = ?'),
      }),
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('t.memory_id IS NULL'),
        args: ['normal', 'workspace', 'preference', 11, 0],
      }),
    )
    expect(result).toMatchObject({ offset: 0, limit: 10, hasMore: false })
  })

  it('searches and paginates memories with stable status filtering', async () => {
    dbMock.client.execute.mockResolvedValueOnce(
      rows([
        {
          id: 'mem-replacement',
          type: 'knowledge',
          scope: 'project',
          content: 'Use 100% local_index',
          summary: 'Local index policy',
          tags: JSON.stringify(['search']),
          confidence: 0.8,
          source_session_id: null,
          source_turn_id: null,
          privacy_level: 'normal',
          ttl: null,
          enabled: 0,
          created_at: 10,
          updated_at: 30,
          last_used_at: 25,
          usage_count: 2,
          replaces_memory_id: 'mem-original',
        },
        {
          id: 'mem-next-page',
          type: 'knowledge',
          scope: 'project',
          content: 'Next page',
          summary: 'Next page',
          tags: '[]',
          confidence: 1,
          source_session_id: null,
          source_turn_id: null,
          privacy_level: 'normal',
          ttl: null,
          enabled: 0,
          created_at: 9,
          updated_at: 20,
          last_used_at: null,
          usage_count: 0,
        },
      ]),
    )

    const service = new ContextHygieneService()
    const result = await service.listMemories({
      query: '100% local_index',
      status: 'disabled',
      offset: 20,
      limit: 1,
    })

    expect(result).toMatchObject({ offset: 20, limit: 1, hasMore: true })
    expect(result.memories).toHaveLength(1)
    expect(result.memories[0]).toMatchObject({
      id: 'mem-replacement',
      replacesMemoryId: 'mem-original',
      enabled: false,
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('ORDER BY m.updated_at DESC, m.id ASC'),
        args: [
          'normal',
          '%100\\% local\\_index%',
          '%100\\% local\\_index%',
          '%100\\% local\\_index%',
          2,
          20,
        ],
      }),
    )
  })

  it('atomically saves a replacement and tombstones the original memory', async () => {
    const originalRow = {
      id: 'mem-original',
      type: 'preference',
      scope: 'workspace',
      content: 'Use English replies',
      summary: 'Use English replies',
      tags: '[]',
      confidence: 0.7,
      source_session_id: 'session-1',
      source_turn_id: 'turn-1',
      privacy_level: 'normal',
      ttl: null,
      enabled: 1,
      created_at: 10,
      updated_at: 20,
      last_used_at: null,
      usage_count: 1,
    }
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      return sql.includes('SELECT m.*') ? rows([originalRow]) : rows([])
    })
    const service = new ContextHygieneService()
    const replacement = {
      type: 'preference' as const,
      scope: 'workspace' as const,
      content: 'Use Chinese replies',
      summary: 'Use Chinese replies',
      tags: ['language'],
      confidence: 0.9,
      sourceSessionId: 'session-1',
      sourceTurnId: 'turn-1',
      privacyLevel: 'normal' as const,
      enabled: true,
    }
    const evaluation = service.evaluateMemory(replacement)

    const result = await service.replaceMemory({
      memoryId: 'mem-original',
      expectedUpdatedAt: 20,
      evaluationFingerprint: evaluation.fingerprint!,
      replacement,
    })

    expect(result.memory).toMatchObject({
      content: 'Use Chinese replies',
      replacesMemoryId: 'mem-original',
      sourceSessionId: 'session-1',
      sourceTurnId: 'turn-1',
    })
    expect(result.tombstone).toMatchObject({
      memoryId: 'mem-original',
      reason: `replaced-by:${result.memory.id}`,
    })
    const statements = dbMock.client.execute.mock.calls.map(([statement]) =>
      typeof statement === 'string' ? statement : statement.sql,
    )
    expect(statements[0]).toBe('BEGIN IMMEDIATE')
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('INSERT INTO intelligence_memory_items'),
        expect.stringContaining('UPDATE intelligence_memory_items SET enabled = 0'),
        expect.stringContaining('INSERT INTO intelligence_memory_tombstones'),
        'COMMIT',
      ]),
    )
  })

  it('rejects a stale replacement and rolls back without writing either side', async () => {
    const originalRow = {
      id: 'mem-original',
      type: 'preference',
      scope: 'workspace',
      content: 'Changed concurrently',
      summary: 'Changed concurrently',
      tags: '[]',
      confidence: 1,
      source_session_id: null,
      source_turn_id: null,
      privacy_level: 'normal',
      ttl: null,
      enabled: 1,
      created_at: 10,
      updated_at: 21,
      last_used_at: null,
      usage_count: 0,
    }
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      return sql.includes('SELECT m.*') ? rows([originalRow]) : rows([])
    })
    const service = new ContextHygieneService()
    const replacement = {
      type: 'preference' as const,
      scope: 'workspace' as const,
      content: 'Use Chinese replies',
    }
    const evaluation = service.evaluateMemory(replacement)

    await expect(
      service.replaceMemory({
        memoryId: 'mem-original',
        expectedUpdatedAt: 20,
        evaluationFingerprint: evaluation.fingerprint!,
        replacement,
      }),
    ).rejects.toThrow('MEMORY_REPLACE_CONFLICT')

    const statements = dbMock.client.execute.mock.calls.map(([statement]) =>
      typeof statement === 'string' ? statement : statement.sql,
    )
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(statements.some(sql => sql.includes('INSERT INTO intelligence_memory_items'))).toBe(false)
    expect(statements.some(sql => sql.includes('INSERT INTO intelligence_memory_tombstones'))).toBe(false)
  })

  it('rolls back the replacement when the new memory cannot be persisted', async () => {
    const originalRow = {
      id: 'mem-original',
      type: 'preference',
      scope: 'workspace',
      content: 'Use English replies',
      summary: 'Use English replies',
      tags: '[]',
      confidence: 1,
      source_session_id: null,
      source_turn_id: null,
      privacy_level: 'normal',
      ttl: null,
      enabled: 1,
      created_at: 10,
      updated_at: 20,
      last_used_at: null,
      usage_count: 0,
    }
    dbMock.client.execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      if (sql.includes('SELECT m.*'))
        return rows([originalRow])
      if (sql.includes('INSERT INTO intelligence_memory_items'))
        throw new Error('persist failed')
      return rows([])
    })
    const service = new ContextHygieneService()
    const replacement = {
      type: 'preference' as const,
      scope: 'workspace' as const,
      content: 'Use Chinese replies',
    }
    const evaluation = service.evaluateMemory(replacement)

    await expect(
      service.replaceMemory({
        memoryId: 'mem-original',
        expectedUpdatedAt: 20,
        evaluationFingerprint: evaluation.fingerprint!,
        replacement,
      }),
    ).rejects.toThrow('persist failed')

    const statements = dbMock.client.execute.mock.calls.map(([statement]) =>
      typeof statement === 'string' ? statement : statement.sql,
    )
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(statements.some(sql => sql.includes('INSERT INTO intelligence_memory_tombstones'))).toBe(false)
  })

  it('rejects replacement fields changed after evaluation before opening a transaction', async () => {
    const service = new ContextHygieneService()
    const evaluation = service.evaluateMemory({
      type: 'preference',
      scope: 'workspace',
      content: 'Use Chinese replies',
      summary: 'Chinese replies',
    })

    await expect(
      service.replaceMemory({
        memoryId: 'mem-original',
        expectedUpdatedAt: 20,
        evaluationFingerprint: evaluation.fingerprint!,
        replacement: {
          type: 'preference',
          scope: 'workspace',
          content: 'Use Chinese replies',
          summary: 'Changed after evaluation',
        },
      }),
    ).rejects.toThrow('MEMORY_REPLACE_EVALUATION_MISMATCH')
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('redacts secret turns before writing them to SQLite', async () => {
    dbMock.client.execute.mockResolvedValueOnce(rows([])).mockResolvedValue(rows([]))

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'api_key = sk-test-secret-value',
      tokenBudget: 120,
    })

    expect(result.turn).toMatchObject({
      privacyLevel: 'secret',
      content: '[redacted:private-context-turn]',
    })
    expect(result.package.items).toEqual([])
    expect(result.package.metadata).toMatchObject({
      excluded: [
        {
          sourceType: 'current_input',
          sourceId: result.turn.id,
          reason: 'secret-policy-blocked',
          tokenEstimate: expect.any(Number),
        },
      ],
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_context_turns'),
        args: expect.arrayContaining(['[redacted:private-context-turn]', 'secret']),
      }),
    )
    const packageLogCall = dbMock.client.execute.mock.calls.find(([arg]) => {
      return String(arg.sql).includes('INSERT INTO intelligence_context_package_logs')
    })
    expect(JSON.parse(String(packageLogCall?.[0].args?.[7]))).toMatchObject({
      excluded: [
        {
          sourceType: 'current_input',
          sourceId: result.turn.id,
          reason: 'secret-policy-blocked',
        },
      ],
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
            updatedAt: 20,
          },
          document: {
            id: 'doc-1',
            sourceType: 'manual',
            sourceUri: 'note://knowledge',
            title: 'Knowledge Notes',
            contentHash: 'doc-hash',
            permissionScope: 'workspace:tuff',
            createdAt: 10,
            updatedAt: 20,
          },
          score: 1.2,
          citation: {
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            title: 'Knowledge Notes',
            sourceUri: 'note://knowledge',
            sourceType: 'manual',
            updatedAt: 20,
          },
        },
      ],
      tokenEstimate: 6,
      citations: [
        {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          title: 'Knowledge Notes',
          sourceUri: 'note://knowledge',
          sourceType: 'manual',
          updatedAt: 20,
        },
      ],
    })

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Use local knowledge retrieval',
      explicitScope: 'retrieval',
      tokenBudget: 120,
      traceId: 'trace-retrieval',
    })

    const retrievalItem = result.package.items.find(item => item.sourceType === 'retrieval')
    expect(result.package.metadata).toMatchObject({
      retrieval: {
        status: 'ok',
        chunkCount: 1,
        citationCount: 1,
      },
    })
    expect(retrievalItem).toMatchObject({
      sourceId: 'chunk-1',
      metadata: {
        citation: {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          title: 'Knowledge Notes',
        },
        documentId: 'doc-1',
        sourceType: 'manual',
        sourceUri: 'note://knowledge',
        status: 'ok',
      },
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
              chunkId: 'chunk-1',
            }),
            status: 'ok',
          }),
        }),
      ]),
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
            updatedAt: 20,
          },
          document: {
            id: 'doc-large',
            sourceType: 'manual',
            title: 'Large Notes',
            contentHash: 'doc-hash',
            permissionScope: 'workspace:tuff',
            createdAt: 10,
            updatedAt: 20,
          },
          score: 1,
          citation: {
            documentId: 'doc-large',
            chunkId: 'chunk-large',
            title: 'Large Notes',
            sourceType: 'manual',
            updatedAt: 20,
          },
        },
      ],
      tokenEstimate: 500,
      citations: [
        {
          documentId: 'doc-large',
          chunkId: 'chunk-large',
          title: 'Large Notes',
          sourceType: 'manual',
          updatedAt: 20,
        },
      ],
    })

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Use local knowledge retrieval',
      explicitScope: 'retrieval',
      tokenBudget: 20,
    })

    expect(result.package.items.some(item => item.sourceId === 'chunk-large')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      excluded: [
        {
          sourceType: 'retrieval',
          sourceId: 'chunk-large',
          reason: 'token-budget-pruned',
          tokenEstimate: 500,
        },
      ],
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
      degradedReason: 'fts-unavailable',
    })

    const service = new ContextHygieneService()
    const result = await service.prepareTurn({
      owner: 'corebox',
      input: 'Need unavailable retrieval',
      explicitScope: 'retrieval',
      tokenBudget: 120,
      metadata: { source: 'test' },
    })

    expect(result.package.items.some(item => item.sourceType === 'retrieval')).toBe(false)
    expect(result.package.metadata).toMatchObject({
      source: 'test',
      retrieval: {
        status: 'degraded',
        degradedReason: 'fts-unavailable',
        chunkCount: 0,
        citationCount: 0,
      },
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
        citationCount: 0,
      },
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
                  title: 'Knowledge Notes',
                },
                status: 'ok',
              },
            },
          ]),
          metadata: JSON.stringify({
            retrieval: {
              status: 'ok',
              chunkCount: 1,
              citationCount: 1,
            },
          }),
          created_at: 20,
        },
      ]),
    )
    const service = new ContextHygieneService()

    const result = await service.listPackageLogs({
      sessionId: 'session-1',
      traceId: 'trace-1',
      limit: 100,
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
              chunkId: 'chunk-1',
            },
            status: 'ok',
          },
        },
      ],
      metadata: {
        retrieval: {
          status: 'ok',
          chunkCount: 1,
          citationCount: 1,
        },
      },
    })
    expect('content' in result.logs[0]!.items[0]!).toBe(false)
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('FROM intelligence_context_package_logs'),
        args: ['session-1', 'trace-1', 50],
      }),
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
          created_at: 20,
        },
      ]),
    )
    const service = new ContextHygieneService()

    const result = await service.listCheckpoints({
      sessionId: 'session-1',
      type: 'session_start',
      limit: 100,
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
        createdAt: 20,
      },
    ])
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('FROM intelligence_context_checkpoints'),
        args: ['session-1', 'session_start', 50],
      }),
    )
  })

  it('requires a session before listing checkpoints', async () => {
    const service = new ContextHygieneService()

    await expect(service.listCheckpoints({ sessionId: '' })).rejects.toThrow(
      'sessionId is required',
    )
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('requires a session or trace filter before listing package logs', async () => {
    const service = new ContextHygieneService()

    await expect(service.listPackageLogs({})).rejects.toThrow('sessionId or traceId is required')
    expect(dbMock.client.execute).not.toHaveBeenCalled()
  })

  it('removes memory tombstoned after package preparation before provider invocation', async () => {
    const now = Date.now()
    let tombstoned = false
    const memoryRow = {
      id: 'memory-1',
      type: 'preference',
      scope: 'global',
      content: 'Use concise answers',
      summary: 'Use concise answers',
      tags: '[]',
      confidence: 1,
      source_session_id: null,
      source_turn_id: null,
      privacy_level: 'normal',
      ttl: null,
      enabled: 1,
      created_at: now - 1_000,
      updated_at: now,
      last_used_at: null,
      usage_count: 0,
    }
    dbMock.client.execute.mockImplementation(async (statement: { sql: string }) => {
      if (statement.sql.includes('INSERT INTO intelligence_memory_tombstones')) {
        tombstoned = true
      }
      if (statement.sql.includes('t.memory_id AS tombstone_memory_id')) {
        return rows([
          {
            ...memoryRow,
            tombstone_memory_id: tombstoned ? 'memory-1' : null,
          },
        ])
      }
      return rows([])
    })

    const preparedPackage: ContextPackage = {
      id: 'package-1',
      sessionId: 'session-1',
      scope: 'session',
      tokenBudget: 100,
      tokenEstimate: 8,
      items: [
        {
          sourceType: 'current_input',
          sourceId: 'turn-1',
          reason: 'current user input',
          content: 'Continue',
          tokenEstimate: 2,
        },
        {
          sourceType: 'memory',
          sourceId: 'memory-1',
          reason: 'usable global memory',
          content: 'Use concise answers',
          tokenEstimate: 6,
        },
      ],
      createdAt: now,
    }
    const service = new ContextHygieneService()

    await expect(service.revalidatePackageMemories(preparedPackage)).resolves.toBe(preparedPackage)
    await service.deleteMemory('memory-1', 'user-request')
    const finalPackage = await service.revalidatePackageMemories(preparedPackage)

    expect(finalPackage.items).toEqual([preparedPackage.items[0]])
    expect(finalPackage.tokenEstimate).toBe(2)
    expect(finalPackage.metadata).toMatchObject({
      excluded: [
        {
          sourceType: 'memory',
          sourceId: 'memory-1',
          reason: 'memory-tombstoned',
          tokenEstimate: 6,
        },
      ],
      memoryRevalidation: { checkedCount: 1, excludedCount: 1 },
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('UPDATE intelligence_context_package_logs'),
        args: [
          2,
          expect.not.stringContaining('Use concise answers'),
          expect.stringContaining('memory-tombstoned'),
          'package-1',
          'session-1',
        ],
      }),
    )
  })

  it('writes a tombstone when deleting memory', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const service = new ContextHygieneService()

    const tombstone = await service.deleteMemory('memory-1', 'user-request')

    expect(tombstone).toMatchObject({
      memoryId: 'memory-1',
      reason: 'user-request',
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('UPDATE intelligence_memory_items SET enabled = 0'),
      }),
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_memory_tombstones'),
      }),
    )
  })

  it('updates normal non-tombstoned memory enabled state', async () => {
    dbMock.client.execute.mockResolvedValue(rows([]))
    const service = new ContextHygieneService()

    const result = await service.setMemoryEnabled('memory-1', false)

    expect(result).toMatchObject({
      memoryId: 'memory-1',
      enabled: false,
    })
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('SET enabled = ?'),
        args: [0, expect.any(Number), 'memory-1'],
      }),
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('privacy_level = \'normal\''),
      }),
    )
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('intelligence_memory_tombstones'),
      }),
    )
  })
})
