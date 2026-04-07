import { beforeEach, describe, expect, it, vi } from 'vitest'

const cozeMocks = vi.hoisted(() => {
  const chatStream = vi.fn()
  const workflowStream = vi.fn()
  const filesUpload = vi.fn()

  class MockCozeAPI {
    readonly chat = {
      stream: chatStream,
    }

    readonly workflows = {
      chat: {
        stream: workflowStream,
      },
    }

    readonly files = {
      upload: filesUpload,
    }

    constructor(public options: any) {}
  }

  return {
    chatStream,
    workflowStream,
    filesUpload,
    MockCozeAPI,
  }
})

const authMocks = vi.hoisted(() => ({
  getPilotCozeAccessToken: vi.fn().mockResolvedValue('coze_token'),
  invalidatePilotCozeAccessToken: vi.fn(),
}))

vi.mock('@coze/api', () => ({
  ChatEventType: {
    CONVERSATION_CHAT_CREATED: 'conversation.chat.created',
    CONVERSATION_CHAT_IN_PROGRESS: 'conversation.chat.in_progress',
    CONVERSATION_CHAT_FAILED: 'conversation.chat.failed',
    CONVERSATION_CHAT_REQUIRES_ACTION: 'conversation.chat.requires_action',
    CONVERSATION_MESSAGE_DELTA: 'conversation.message.delta',
    CONVERSATION_MESSAGE_COMPLETED: 'conversation.message.completed',
    DONE: 'done',
    ERROR: 'error',
  },
  CozeAPI: cozeMocks.MockCozeAPI,
  RoleType: {
    Assistant: 'assistant',
    User: 'user',
  },
}))

vi.mock('../pilot-coze-auth', () => ({
  getPilotCozeAccessToken: authMocks.getPilotCozeAccessToken,
  invalidatePilotCozeAccessToken: authMocks.invalidatePilotCozeAccessToken,
  PilotCozeAuthError: class MockPilotCozeAuthError extends Error {
    readonly statusCode = 502
    readonly data: Record<string, unknown>

    constructor(message: string, data: Record<string, unknown>) {
      super(message)
      this.name = 'PilotCozeAuthError'
      this.data = data
    }
  },
  PilotCozeOAuthError: class MockPilotCozeOAuthError extends Error {
    readonly statusCode = 502
    readonly data: Record<string, unknown>

    constructor(message: string, data: Record<string, unknown>) {
      super(message)
      this.name = 'PilotCozeOAuthError'
      this.data = data
    }
  },
}))

function createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async* [Symbol.asyncIterator]() {
      for (const item of items) {
        yield item
      }
    },
  }
}

async function loadTarget() {
  return await import('../pilot-coze-engine')
}

describe('pilot-coze-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('coze_bot 流式输出会映射为 text / thinking / done', async () => {
    cozeMocks.chatStream.mockResolvedValue(createAsyncIterable([
      {
        event: 'conversation.chat.created',
        data: {
          status: 'created',
        },
      },
      {
        event: 'conversation.message.delta',
        data: {
          content: 'Hello',
          reasoning_content: 'Think',
        },
      },
      {
        event: 'conversation.message.completed',
        data: {
          content: 'Hello world',
          reasoning_content: 'Thinking',
        },
      },
      {
        event: 'done',
        data: null,
      },
    ]))

    const { PilotCozeEngineAdapter } = await loadTarget()
    const audits: Array<Record<string, unknown>> = []
    const adapter = new PilotCozeEngineAdapter({
      channelId: 'channel_coze_bot',
      baseUrl: 'https://api.coze.cn',
      providerModel: 'bot_123',
      providerTargetType: 'coze_bot',
      oauthClientId: 'client_id',
      oauthClientSecret: 'client_secret',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      userId: 'user_1',
      timeoutMs: 30_000,
      onAudit: async (record) => {
        audits.push(record as Record<string, unknown>)
      },
    })

    const chunks: any[] = []
    for await (const item of adapter.runStream({
      sessionId: 'session_1',
      turnId: 'turn_1',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello there' },
      ],
      attachments: [
        {
          id: 'att_1',
          type: 'image',
          providerFileId: 'file_image_1',
        },
      ],
    } as any)) {
      chunks.push(item)
    }

    expect(cozeMocks.chatStream).toHaveBeenCalledTimes(1)
    expect(cozeMocks.workflowStream).not.toHaveBeenCalled()
    expect(cozeMocks.chatStream.mock.calls[0]?.[0]).toMatchObject({
      bot_id: 'bot_123',
      user_id: 'user_1',
      conversation_id: 'session_1',
    })
    expect(cozeMocks.chatStream.mock.calls[0]?.[0]?.additional_messages).toHaveLength(1)
    expect(cozeMocks.chatStream.mock.calls[0]?.[0]?.additional_messages?.[0]).toMatchObject({
      role: 'user',
      content_type: 'object_string',
    })
    expect(cozeMocks.chatStream.mock.calls[0]?.[0]?.additional_messages?.[0]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
        }),
        expect.objectContaining({
          type: 'image',
          file_id: 'file_image_1',
        }),
      ]),
    )

    expect(chunks).toEqual([
      {
        thinking: 'Think',
        thinkingDone: false,
        done: false,
      },
      {
        text: 'Hello',
        done: false,
      },
      {
        thinking: 'ing',
        thinkingDone: false,
        done: false,
      },
      {
        text: ' world',
        done: false,
      },
      {
        text: 'Hello world',
        thinking: 'Thinking',
        thinkingDone: true,
        done: true,
      },
    ])
    expect(audits.map(item => item.type)).toEqual(expect.arrayContaining([
      'coze.request.started',
      'coze.request.progress',
      'coze.request.completed',
    ]))
  })

  it('coze_workflow 会走 workflow chat stream', async () => {
    cozeMocks.workflowStream.mockResolvedValue(createAsyncIterable([
      {
        event: 'conversation.message.delta',
        data: {
          content: 'workflow reply',
        },
      },
      {
        event: 'done',
        data: null,
      },
    ]))

    const { PilotCozeEngineAdapter } = await loadTarget()
    const adapter = new PilotCozeEngineAdapter({
      channelId: 'channel_coze_workflow',
      baseUrl: 'https://api.coze.cn',
      providerModel: 'workflow_123',
      providerTargetType: 'coze_workflow',
      oauthClientId: 'client_id',
      oauthClientSecret: 'client_secret',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      userId: 'user_2',
      timeoutMs: 30_000,
    })

    const chunks: any[] = []
    for await (const item of adapter.runStream({
      sessionId: 'session_2',
      turnId: 'turn_2',
      messages: [
        { role: 'system', content: 'workflow system prompt' },
        { role: 'user', content: 'run workflow' },
      ],
      attachments: [],
    } as any)) {
      chunks.push(item)
    }

    expect(cozeMocks.workflowStream).toHaveBeenCalledTimes(1)
    expect(cozeMocks.chatStream).not.toHaveBeenCalled()
    expect(cozeMocks.workflowStream.mock.calls[0]?.[0]).toMatchObject({
      workflow_id: 'workflow_123',
      conversation_id: 'session_2',
      ext: {
        session_id: 'session_2',
        turn_id: 'turn_2',
      },
    })
    expect(cozeMocks.workflowStream.mock.calls[0]?.[0]?.additional_messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('run workflow'),
        content_type: 'text',
      }),
    ])
    expect(chunks).toEqual([
      {
        text: 'workflow reply',
        done: false,
      },
      {
        text: 'workflow reply',
        thinking: undefined,
        thinkingDone: undefined,
        done: true,
      },
    ])
  })
})
