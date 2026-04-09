import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MemoryRow {
  id: string
  sessionId: string
  userId: string
  key: string
  value: string
  sourceText: string
  createdAt: string
  updatedAt: string
}

const { rowsByCompositeKey, rowsById, insertRow, mockDb } = vi.hoisted(() => {
  const rowsByCompositeKey = new Map<string, MemoryRow>()
  const rowsById = new Map<string, MemoryRow>()

  function buildCompositeKey(sessionId: string, userId: string, key: string, value: string): string {
    return `${sessionId}::${userId}::${key}::${value}`
  }

  function insertRow(row: MemoryRow) {
    rowsByCompositeKey.set(buildCompositeKey(row.sessionId, row.userId, row.key, row.value), row)
    rowsById.set(row.id, row)
  }

  const mockDb = {
    prepare(sql: string) {
      let params: unknown[] = []
      return {
        bind(...args: unknown[]) {
          params = args
          return this
        },
        async first<T>() {
          if (/SELECT\s+id\s+FROM\s+pilot_chat_memory_facts/i.test(sql)) {
            const compositeKey = buildCompositeKey(
              String(params[0] || ''),
              String(params[1] || ''),
              String(params[2] || ''),
              String(params[3] || ''),
            )
            const row = rowsByCompositeKey.get(compositeKey)
            return row ? ({ id: row.id } as T) : null
          }
          return null
        },
        async run() {
          if (/INSERT\s+INTO\s+pilot_chat_memory_facts/i.test(sql)) {
            const row: MemoryRow = {
              id: String(params[0] || ''),
              sessionId: String(params[1] || ''),
              userId: String(params[2] || ''),
              key: String(params[3] || ''),
              value: String(params[4] || ''),
              sourceText: String(params[5] || ''),
              createdAt: String(params[6] || ''),
              updatedAt: String(params[7] || ''),
            }
            insertRow(row)
          }

          if (/UPDATE\s+pilot_chat_memory_facts/i.test(sql)) {
            const updatedAt = String(params[0] || '')
            const id = String(params[1] || '')
            const row = rowsById.get(id)
            if (row) {
              row.updatedAt = updatedAt
            }
          }

          return {}
        },
        async all<T>() {
          if (/FROM\s+pilot_chat_memory_facts/i.test(sql) && /ORDER\s+BY\s+created_at/i.test(sql)) {
            const userId = String(params[0] || '')
            const limit = Number(params[1] || 0)
            const results = Array.from(rowsById.values())
              .filter(row => row.userId === userId)
              .sort((a, b) => {
                if (a.createdAt === b.createdAt) {
                  return b.updatedAt.localeCompare(a.updatedAt)
                }
                return b.createdAt.localeCompare(a.createdAt)
              })
              .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined)
              .map(row => ({ ...row })) as T[]

            return {
              results,
            }
          }
          return {
            results: [],
          }
        },
      }
    },
  }

  return {
    rowsByCompositeKey,
    rowsById,
    insertRow,
    mockDb,
  }
})

vi.mock('../pilot-store', () => ({
  requirePilotDatabase: vi.fn(() => mockDb as any),
}))

function createEvent() {
  return {
    context: {},
  } as any
}

async function loadTarget() {
  return await import('../pilot-memory-facts')
}

describe('pilot-memory-facts', () => {
  beforeEach(() => {
    rowsByCompositeKey.clear()
    rowsById.clear()
  })

  it('upsert 仅返回本次新增 facts，且 addedCount 与 addedFacts 长度一致', async () => {
    const { upsertPilotMemoryFacts } = await loadTarget()
    const event = createEvent()

    const first = await upsertPilotMemoryFacts(event, {
      sessionId: 'session-1',
      userId: 'user-1',
      sourceText: '用户说自己是男的，也住在上海。',
      facts: [
        { key: 'profile_gender', value: '你是男的。' },
        { key: 'profile_gender', value: '你是男的。' },
        { key: 'profile_city', value: '你住在上海。' },
      ],
    })

    expect(first.addedCount).toBe(2)
    expect(first.keptCount).toBe(2)
    expect(first.addedFacts).toEqual([
      { key: 'profile_gender', value: '你是男的。' },
      { key: 'profile_city', value: '你住在上海。' },
    ])
    expect(first.addedFacts).toHaveLength(first.addedCount)

    const second = await upsertPilotMemoryFacts(event, {
      sessionId: 'session-1',
      userId: 'user-1',
      sourceText: '用户补充说喜欢摄影。',
      facts: [
        { key: 'profile_gender', value: '你是男的。' },
        { key: 'profile_hobby', value: '你喜欢摄影。' },
      ],
    })

    expect(second.addedCount).toBe(1)
    expect(second.keptCount).toBe(2)
    expect(second.addedFacts).toEqual([
      { key: 'profile_hobby', value: '你喜欢摄影。' },
    ])
    expect(second.addedFacts).toHaveLength(second.addedCount)
  })

  it('list 按添加时间倒序返回记忆详情，并保留 createdAt', async () => {
    const { listPilotMemoryFactsByUser } = await loadTarget()
    const event = createEvent()

    insertRow({
      id: 'memory-1',
      sessionId: 'session-1',
      userId: 'user-1',
      key: 'profile_city',
      value: '你住在上海。',
      sourceText: '我住在上海。',
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:00.000Z',
    })
    insertRow({
      id: 'memory-2',
      sessionId: 'session-2',
      userId: 'user-1',
      key: 'profile_hobby',
      value: '你喜欢摄影。',
      sourceText: '我喜欢摄影。',
      createdAt: '2026-04-02T09:00:00.000Z',
      updatedAt: '2026-04-02T09:00:00.000Z',
    })
    insertRow({
      id: 'memory-3',
      sessionId: 'session-3',
      userId: 'user-2',
      key: 'profile_food',
      value: '你喜欢寿司。',
      sourceText: '我喜欢寿司。',
      createdAt: '2026-04-03T09:00:00.000Z',
      updatedAt: '2026-04-03T09:00:00.000Z',
    })

    const result = await listPilotMemoryFactsByUser(event, 'user-1', {
      limit: 10,
    })

    expect(result).toHaveLength(2)
    expect(result.map(item => item.value)).toEqual([
      '你喜欢摄影。',
      '你住在上海。',
    ])
    expect(result[0]?.createdAt).toBe('2026-04-02T09:00:00.000Z')
  })

  it('build memory context system message 仅注入记忆内容，不暴露内部 key', async () => {
    const { buildPilotMemoryContextSystemMessage } = await loadTarget()

    const message = buildPilotMemoryContextSystemMessage('按我的偏好推荐一套桌搭', [
      { key: 'profile_platform', value: '你长期使用 Mac。' },
      { key: 'profile_language', value: '你偏好英文界面。' },
    ])

    expect(message).toContain('[Remembered User Facts For Current Turn]')
    expect(message).toContain('你长期使用 Mac。')
    expect(message).toContain('你偏好英文界面。')
    expect(message).not.toContain('profile_platform')
  })
})
