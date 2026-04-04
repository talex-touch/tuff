import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPilotRuntime,
  PILOT_COZE_LOCAL_TOOLS_UNSUPPORTED_CODE,
  PILOT_STRICT_MODE_UNAVAILABLE_CODE,
  PilotCozeLocalToolsUnsupportedError,
  PilotStrictModeUnavailableError,
} from '../pilot-runtime'

vi.mock('@talex-touch/tuff-intelligence/pilot', () => {
  class MockAbstractAgentRuntime {
    constructor(public deps: any) {}
  }
  class MockCapabilityRegistry {
    register() {}
  }
  class MockDecisionDispatcher {
    constructor(public options: any) {}
  }
  class MockDeepAgentEngine {
    readonly id = 'deepagent-engine'
    constructor(public options: any) {}
  }
  class MockDefaultDecisionAdapter {}

  return {
    AbstractAgentRuntime: MockAbstractAgentRuntime,
    CapabilityRegistry: MockCapabilityRegistry,
    DecisionDispatcher: MockDecisionDispatcher,
    DeepAgentLangChainEngineAdapter: MockDeepAgentEngine,
    DefaultDecisionAdapter: MockDefaultDecisionAdapter,
  }
})

vi.mock('../pilot-langgraph-engine', () => ({
  LangGraphLocalServerEngineAdapter: class MockLangGraphEngine {
    readonly id = 'langgraph-local-engine'
    constructor(public options: any) {}
  },
}))

vi.mock('../pilot-coze-engine', () => ({
  PilotCozeEngineAdapter: class MockPilotCozeEngine {
    readonly id = 'pilot-coze-engine'
    constructor(public options: any) {}
  },
}))

vi.mock('../pilot-store', () => ({
  createPilotStoreAdapter: vi.fn(() => ({
    runtime: {
      ensureSchema: vi.fn(),
    },
  })),
}))

describe('pilot-runtime strict mode', () => {
  const eventStub = {
    node: {
      req: {
        headers: {
          'user-agent': 'VitestAgent/1.0',
          'x-forwarded-for': '127.0.0.1',
        },
      },
    },
  } as any

  const channelStub = {
    channelId: 'ch_openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'key',
    model: 'gpt-5.2',
    adapter: 'openai' as const,
    transport: 'responses' as const,
    timeoutMs: 30_000,
    builtinTools: ['write_todos'] as Array<'write_todos'>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strict 模式在 LangGraph 不可用时直接失败，不回退 deepagent', () => {
    expect(() => createPilotRuntime({
      event: eventStub,
      userId: 'user_1',
      strictPilotMode: true,
      channel: {
        ...channelStub,
        builtinTools: ['write_todos'],
      },
      orchestrator: {
        mode: 'deepagent',
        reason: 'pilot_mode_graph_combo_missing_or_disabled',
      },
    })).toThrowError(PilotStrictModeUnavailableError)

    try {
      createPilotRuntime({
        event: eventStub,
        userId: 'user_1',
        strictPilotMode: true,
        channel: {
          ...channelStub,
          builtinTools: ['write_todos'],
        },
        orchestrator: {
          mode: 'deepagent',
          reason: 'pilot_mode_graph_combo_missing_or_disabled',
        },
      })
    }
    catch (error) {
      const row = error as PilotStrictModeUnavailableError
      expect(row.code).toBe(PILOT_STRICT_MODE_UNAVAILABLE_CODE)
      expect(row.statusCode).toBe(503)
      expect(row.data.reason).toBe('pilot_mode_graph_combo_missing_or_disabled')
    }
  })

  it('strict 模式在 LangGraph 可用时不创建 fallback engine', () => {
    const { runtime } = createPilotRuntime({
      event: eventStub,
      userId: 'user_2',
      strictPilotMode: true,
      channel: {
        ...channelStub,
        builtinTools: ['write_todos'],
      },
      orchestrator: {
        mode: 'langgraph-local',
        endpoint: 'http://127.0.0.1:2024',
        assistantId: 'assistant_1',
        graphProfile: 'default',
      },
    })

    expect((runtime as any).deps.engine.id).toBe('langgraph-local-engine')
  })

  it('非 strict 模式维持 fallback adapter 行为', () => {
    const { runtime } = createPilotRuntime({
      event: eventStub,
      userId: 'user_3',
      strictPilotMode: false,
      channel: {
        ...channelStub,
        builtinTools: ['write_todos'],
      },
      orchestrator: {
        mode: 'langgraph-local',
        endpoint: 'http://127.0.0.1:2024',
        assistantId: 'assistant_2',
        graphProfile: 'default',
      },
    })

    expect((runtime as any).deps.engine.id).toBe('pilot-fallback-engine')
  })

  it('可显式关闭默认 builtinTools 注入', () => {
    const { runtime } = createPilotRuntime({
      event: eventStub,
      userId: 'user_4',
      strictPilotMode: false,
      channel: {
        ...channelStub,
        builtinTools: [],
        disableDefaultBuiltinTools: true,
      },
      orchestrator: {
        mode: 'deepagent',
        reason: 'tool_gate_disabled',
      },
    })

    expect((runtime as any).deps.engine.options.builtinTools).toEqual([])
  })

  it('strict pre-read memory 下不再向 deepagent 注入 getmemory 工具', () => {
    const { runtime } = createPilotRuntime({
      event: eventStub,
      userId: 'user_memory_tool',
      memoryEnabled: true,
      strictPilotMode: false,
      channel: {
        ...channelStub,
        builtinTools: ['write_todos'],
      },
      orchestrator: {
        mode: 'deepagent',
        reason: 'memory_enabled',
      },
    })

    expect((runtime as any).deps.engine.options.tools).toEqual([])
    expect(String((runtime as any).deps.engine.options.systemPrompt || '').toLowerCase()).not.toContain('getmemory')
  })

  it('coze 渠道会创建独立 coze engine', () => {
    const { runtime } = createPilotRuntime({
      event: eventStub,
      userId: 'user_coze_1',
      strictPilotMode: true,
      channel: {
        channelId: 'ch_coze',
        baseUrl: 'https://api.coze.cn',
        apiKey: '',
        model: 'bot_123',
        providerTargetType: 'coze_bot',
        adapter: 'coze',
        transport: 'coze.openapi',
        region: 'cn',
        cozeAuthMode: 'oauth_client',
        oauthClientId: 'client_id',
        oauthClientSecret: 'client_secret',
        oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
        timeoutMs: 30_000,
        builtinTools: [],
      },
    })

    expect((runtime as any).deps.engine.id).toBe('pilot-coze-engine')
  })

  it('coze 服务身份凭证会透传给 coze engine', () => {
    const { runtime } = createPilotRuntime({
      event: eventStub,
      userId: 'user_coze_jwt',
      strictPilotMode: true,
      channel: {
        channelId: 'ch_coze_jwt',
        baseUrl: 'https://api.coze.cn',
        apiKey: '',
        model: 'bot_jwt',
        providerTargetType: 'coze_bot',
        adapter: 'coze',
        transport: 'coze.openapi',
        region: 'cn',
        cozeAuthMode: 'jwt_service',
        oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
        jwtAppId: 'app_id',
        jwtKeyId: 'key_id',
        jwtAudience: 'https://api.coze.cn',
        jwtPrivateKey: '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----',
        timeoutMs: 30_000,
        builtinTools: [],
      },
    })

    expect((runtime as any).deps.engine.id).toBe('pilot-coze-engine')
    expect((runtime as any).deps.engine.options).toMatchObject({
      cozeAuthMode: 'jwt_service',
      jwtAppId: 'app_id',
      jwtKeyId: 'key_id',
      jwtAudience: 'https://api.coze.cn',
    })
  })

  it('coze 渠道配置本地 builtinTools 时显式拒绝', () => {
    expect(() => createPilotRuntime({
      event: eventStub,
      userId: 'user_coze_2',
      strictPilotMode: false,
      channel: {
        channelId: 'ch_coze',
        baseUrl: 'https://api.coze.cn',
        apiKey: '',
        model: 'bot_123',
        providerTargetType: 'coze_bot',
        adapter: 'coze',
        transport: 'coze.openapi',
        region: 'cn',
        cozeAuthMode: 'oauth_client',
        oauthClientId: 'client_id',
        oauthClientSecret: 'client_secret',
        oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
        timeoutMs: 30_000,
        builtinTools: ['write_todos'],
      },
    })).toThrowError(PilotCozeLocalToolsUnsupportedError)

    try {
      createPilotRuntime({
        event: eventStub,
        userId: 'user_coze_2',
        strictPilotMode: false,
        channel: {
          channelId: 'ch_coze',
          baseUrl: 'https://api.coze.cn',
          apiKey: '',
          model: 'bot_123',
          providerTargetType: 'coze_bot',
          adapter: 'coze',
          transport: 'coze.openapi',
          region: 'cn',
          cozeAuthMode: 'oauth_client',
          oauthClientId: 'client_id',
          oauthClientSecret: 'client_secret',
          oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
          timeoutMs: 30_000,
          builtinTools: ['write_todos'],
        },
      })
    }
    catch (error) {
      const row = error as PilotCozeLocalToolsUnsupportedError
      expect(row.code).toBe(PILOT_COZE_LOCAL_TOOLS_UNSUPPORTED_CODE)
      expect(row.statusCode).toBe(422)
      expect(row.data.channelId).toBe('ch_coze')
      expect(row.data.builtinTools).toEqual(['write_todos'])
    }
  })
})
