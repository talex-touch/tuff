import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncPilotQuotaConversationFromRuntime } from '../pilot-quota-history-sync'
import {
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
  upsertPilotQuotaSession,
} from '../pilot-quota-session'
import { buildQuotaConversationSnapshot } from '../quota-conversation-snapshot'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
  upsertQuotaHistory,
} from '../quota-history-store'

vi.mock('../pilot-quota-session', () => ({
  ensurePilotQuotaSessionSchema: vi.fn(),
  getPilotQuotaSessionByChatId: vi.fn(),
  upsertPilotQuotaSession: vi.fn(),
}))

vi.mock('../quota-conversation-snapshot', () => ({
  buildQuotaConversationSnapshot: vi.fn(),
}))

vi.mock('../quota-history-store', () => ({
  ensureQuotaHistorySchema: vi.fn(),
  getQuotaHistory: vi.fn(),
  upsertQuotaHistory: vi.fn(),
}))

function createEvent(): H3Event {
  return {
    context: {},
  } as H3Event
}

describe('pilot-quota-history-sync', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会把 runtime 标题与 trace 快照同步回 quota history / session 映射', async () => {
    const previous = {
      chatId: 'chat-1',
      userId: 'user-1',
      topic: '旧标题',
      value: '{"messages":[]}',
      meta: '{"sync":"ok"}',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    }
    const persisted = {
      ...previous,
      topic: '同步后的标题',
      updatedAt: '2026-04-08T00:00:01.000Z',
    }

    vi.mocked(getQuotaHistory).mockResolvedValue(previous)
    vi.mocked(getPilotQuotaSessionByChatId).mockResolvedValue({
      chatId: 'chat-1',
      userId: 'user-1',
      runtimeSessionId: 'runtime-1',
      channelId: 'route-1',
      topic: '旧标题',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    })
    vi.mocked(buildQuotaConversationSnapshot).mockReturnValue({
      topic: '同步后的标题',
      value: '{"messages":[{"role":"assistant","content":"done"}]}',
      payload: {},
    })
    vi.mocked(upsertQuotaHistory).mockResolvedValue(persisted)
    vi.mocked(upsertPilotQuotaSession).mockResolvedValue({
      chatId: 'chat-1',
      userId: 'user-1',
      runtimeSessionId: 'runtime-1',
      channelId: 'route-1',
      topic: '同步后的标题',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:01.000Z',
    })

    const listMessages = vi.fn().mockResolvedValue([
      {
        role: 'user',
        content: '请帮我汇总这次对话',
        metadata: {
          local: true,
        },
      },
    ])
    const listTrace = vi.fn().mockResolvedValue([
      {
        seq: 21,
        type: 'turn.started',
        payload: {},
      },
      {
        seq: 22,
        type: 'intent.completed',
        payload: {
          intentType: 'summary',
        },
      },
    ])

    const result = await syncPilotQuotaConversationFromRuntime(createEvent(), {
      userId: 'user-1',
      chatId: 'chat-1',
      storeRuntime: {
        getSession: vi.fn().mockResolvedValue({
          title: 'runtime 标题',
          lastSeq: 22,
        }),
        listMessages,
        listTrace,
      },
    })

    expect(ensureQuotaHistorySchema).toHaveBeenCalledTimes(1)
    expect(ensurePilotQuotaSessionSchema).toHaveBeenCalledTimes(1)
    expect(listMessages).toHaveBeenCalledWith('runtime-1')
    expect(listTrace).toHaveBeenCalledWith('runtime-1', 1, 2000)
    expect(buildQuotaConversationSnapshot).toHaveBeenCalledWith({
      chatId: 'chat-1',
      messages: [
        {
          role: 'user',
          content: '请帮我汇总这次对话',
          metadata: {
            local: true,
          },
        },
      ],
      runtimeTraces: [
        {
          seq: 21,
          type: 'turn.started',
          payload: {},
        },
        {
          seq: 22,
          type: 'intent.completed',
          payload: {
            intentType: 'summary',
          },
        },
      ],
      assistantReply: '',
      topicHint: 'runtime 标题',
      previousValue: '{"messages":[]}',
    })
    expect(upsertQuotaHistory).toHaveBeenCalledWith(expect.anything(), {
      chatId: 'chat-1',
      userId: 'user-1',
      topic: '同步后的标题',
      value: '{"messages":[{"role":"assistant","content":"done"}]}',
      meta: '{"sync":"ok"}',
    })
    expect(upsertPilotQuotaSession).toHaveBeenCalledWith(expect.anything(), {
      chatId: 'chat-1',
      userId: 'user-1',
      runtimeSessionId: 'runtime-1',
      channelId: 'route-1',
      topic: '同步后的标题',
    })
    expect(result).toEqual(persisted)
  })

  it('runtime 会话缺失时仅返回已有历史，不重复写入', async () => {
    const previous = {
      chatId: 'chat-2',
      userId: 'user-2',
      topic: '保留原历史',
      value: '{"messages":[]}',
      meta: '',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    }

    vi.mocked(getQuotaHistory).mockResolvedValue(previous)
    vi.mocked(getPilotQuotaSessionByChatId).mockResolvedValue(null)

    const result = await syncPilotQuotaConversationFromRuntime(createEvent(), {
      userId: 'user-2',
      chatId: 'chat-2',
      storeRuntime: {
        getSession: vi.fn().mockResolvedValue(null),
        listMessages: vi.fn(),
      },
    })

    expect(buildQuotaConversationSnapshot).not.toHaveBeenCalled()
    expect(upsertQuotaHistory).not.toHaveBeenCalled()
    expect(upsertPilotQuotaSession).not.toHaveBeenCalled()
    expect(result).toEqual(previous)
  })

  it('长 turn 回写 quota 快照时会向前补批，避免只剩 tool trace', async () => {
    const previous = {
      chatId: 'chat-3',
      userId: 'user-3',
      topic: '旧快照',
      value: '{"messages":[]}',
      meta: '',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    }

    vi.mocked(getQuotaHistory).mockResolvedValue(previous)
    vi.mocked(getPilotQuotaSessionByChatId).mockResolvedValue(null)
    vi.mocked(buildQuotaConversationSnapshot).mockReturnValue({
      topic: '当前 turn 完整快照',
      value: '{"messages":[{"role":"assistant","content":"ok"}]}',
      payload: {},
    })
    vi.mocked(upsertQuotaHistory).mockResolvedValue({
      ...previous,
      topic: '当前 turn 完整快照',
      value: '{"messages":[{"role":"assistant","content":"ok"}]}',
    })
    vi.mocked(upsertPilotQuotaSession).mockResolvedValue({
      chatId: 'chat-3',
      userId: 'user-3',
      runtimeSessionId: 'chat-3',
      channelId: 'default',
      topic: '当前 turn 完整快照',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:01.000Z',
    })

    const listTrace = vi.fn()
      .mockResolvedValueOnce([
        {
          seq: 2_501,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.started',
            toolName: 'websearch',
          },
        },
        {
          seq: 2_502,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.completed',
            toolName: 'websearch',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          seq: 501,
          type: 'turn.started',
          payload: {},
        },
        {
          seq: 502,
          type: 'intent.completed',
          payload: {
            intentType: 'code_analysis',
            confidence: 0.92,
          },
        },
      ])

    await syncPilotQuotaConversationFromRuntime(createEvent(), {
      userId: 'user-3',
      chatId: 'chat-3',
      storeRuntime: {
        getSession: vi.fn().mockResolvedValue({
          title: 'runtime turn',
          lastSeq: 2_502,
        }),
        listMessages: vi.fn().mockResolvedValue([
          {
            role: 'user',
            content: '请继续处理',
          },
        ]),
        listTrace,
      },
    })

    expect(listTrace).toHaveBeenNthCalledWith(1, 'chat-3', 503, 2000)
    expect(listTrace).toHaveBeenNthCalledWith(2, 'chat-3', 1, 502)
    expect(buildQuotaConversationSnapshot).toHaveBeenCalledWith({
      chatId: 'chat-3',
      messages: [
        {
          role: 'user',
          content: '请继续处理',
          metadata: undefined,
        },
      ],
      runtimeTraces: [
        {
          seq: 501,
          type: 'turn.started',
          payload: {},
        },
        {
          seq: 502,
          type: 'intent.completed',
          payload: {
            intentType: 'code_analysis',
            confidence: 0.92,
          },
        },
        {
          seq: 2_501,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.started',
            toolName: 'websearch',
          },
        },
        {
          seq: 2_502,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.completed',
            toolName: 'websearch',
          },
        },
      ],
      assistantReply: '',
      topicHint: 'runtime turn',
      previousValue: '{"messages":[]}',
    })
  })
})
