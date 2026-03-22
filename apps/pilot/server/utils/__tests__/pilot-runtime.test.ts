import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPilotRuntime,
  PILOT_STRICT_MODE_UNAVAILABLE_CODE,
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
})
