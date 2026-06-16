import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextHygieneService } from './intelligence-context-hygiene'

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
    expect(dbMock.client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO intelligence_context_turns'),
        args: expect.arrayContaining(['[redacted:private-context-turn]', 'secret'])
      })
    )
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
})
