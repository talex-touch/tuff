import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeepAgentLangChainEngineAdapter } from '../../../../../packages/tuff-intelligence/src/adapters/deepagent-engine'

const { createDeepAgentMock, directStreamMock } = vi.hoisted(() => ({
  createDeepAgentMock: vi.fn(),
  directStreamMock: vi.fn(),
}))

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    async stream() {
      directStreamMock()
      return (async function *() {})()
    }
  },
}))

vi.mock('deepagents', () => ({
  createDeepAgent: createDeepAgentMock,
}))

function createState() {
  return {
    sessionId: 'session-test',
    turnId: 'turn-test',
    done: false,
    seq: 0,
    events: [],
    messages: [
      { role: 'user', content: 'what is my name' },
    ],
  }
}

describe('deepagent custom tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDeepAgentMock.mockImplementation(({ tools }: { tools?: unknown[] }) => ({
      invoke: vi.fn(),
      streamEvents: async function *() {
        yield {
          event: 'on_chat_model_stream',
          data: {
            chunk: {
              content: 'memory result',
            },
          },
        }
      },
      stream: vi.fn(),
      tools,
    }))
  })

  it('存在 custom tools 时跳过 direct stream，并透传给 deepagent', async () => {
    const audits: Array<{ type: string, payload: Record<string, unknown> }> = []
    const customTool = { name: 'getmemory' } as any
    const adapter = new DeepAgentLangChainEngineAdapter({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.2',
      transport: 'responses',
      tools: [customTool],
      onAudit: (record) => {
        audits.push(record)
      },
    })

    const chunks: any[] = []
    for await (const item of adapter.runStream(createState() as any)) {
      chunks.push(item)
    }

    expect(directStreamMock).not.toHaveBeenCalled()
    expect(createDeepAgentMock).toHaveBeenCalledTimes(1)
    expect(createDeepAgentMock.mock.calls[0]?.[0]?.tools).toEqual([customTool])
    expect(audits).toContainEqual(expect.objectContaining({
      type: 'upstream.direct_stream_skipped',
      payload: expect.objectContaining({
        reason: 'custom_tools_present',
        customToolNames: ['getmemory'],
      }),
    }))
    expect(chunks.some(item => item?.text === 'memory result')).toBe(true)
  })
})
