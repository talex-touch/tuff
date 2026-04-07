import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listPilotMemoryFactsByUserMock } = vi.hoisted(() => ({
  listPilotMemoryFactsByUserMock: vi.fn(),
}))

vi.mock('../pilot-memory-facts', () => ({
  listPilotMemoryFactsByUser: listPilotMemoryFactsByUserMock,
}))

describe('pilot-memory-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('会优先返回与 query 更相关的记忆内容', async () => {
    listPilotMemoryFactsByUserMock.mockResolvedValue([
      {
        id: 'memory-device',
        sessionId: 'session-1',
        userId: 'user-1',
        key: 'profile_device',
        value: '你长期使用 MacBook Pro。',
        sourceText: '我长期用 MacBook Pro。',
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
      {
        id: 'memory-name',
        sessionId: 'session-1',
        userId: 'user-1',
        key: 'profile_name',
        value: '你的名字是 Talex。',
        sourceText: '我叫 Talex。',
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
    ])

    const { createPilotGetMemoryTool } = await import('../pilot-memory-tool')
    const event = {} as any
    const memoryTool = createPilotGetMemoryTool(event, 'user-1')
    const result = await memoryTool.invoke({
      query: 'what is my name',
      limit: 2,
    })

    expect(listPilotMemoryFactsByUserMock).toHaveBeenCalledWith(event, 'user-1', {
      limit: 50,
    })
    expect(result).toContain('[Pilot Memory Lookup]')
    expect(result).toContain('你的名字是 Talex。')
    expect(result).toContain('(added: 2026-04-01T10:00:00.000Z)')
    expect(result.indexOf('你的名字是 Talex。')).toBeLessThan(result.indexOf('你长期使用 MacBook Pro。'))
  })

  it('query 无直接命中时回退最近记忆', async () => {
    listPilotMemoryFactsByUserMock.mockResolvedValue([
      {
        id: 'memory-latest',
        sessionId: 'session-2',
        userId: 'user-1',
        key: 'profile_city',
        value: '你现在常住上海。',
        sourceText: '我住在上海。',
        createdAt: '2026-04-03T09:00:00.000Z',
        updatedAt: '2026-04-03T09:00:00.000Z',
      },
      {
        id: 'memory-older',
        sessionId: 'session-1',
        userId: 'user-1',
        key: 'profile_language',
        value: '你偏好英文界面。',
        sourceText: '我喜欢英文界面。',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      },
    ])

    const { createPilotGetMemoryTool } = await import('../pilot-memory-tool')
    const memoryTool = createPilotGetMemoryTool({} as any, 'user-1')
    const result = await memoryTool.invoke({
      query: 'favorite database',
      limit: 1,
    })

    expect(result).toContain('你现在常住上海。')
    expect(result).not.toContain('你偏好英文界面。')
  })
})
