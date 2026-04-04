import { networkClient } from '@talex-touch/utils/network'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePilotIntent } from '../pilot-intent-resolver'
import { resolvePilotRoutingSelection } from '../pilot-routing-resolver'

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: vi.fn(),
  },
}))

vi.mock('../pilot-routing-resolver', () => ({
  resolvePilotRoutingSelection: vi.fn(),
}))

describe('pilot-intent-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes explicit /image command to image_generate', async () => {
    const result = await resolvePilotIntent({
      event: {} as any,
      message: '/image 画一只猫',
    })

    expect(result.intentType).toBe('image_generate')
    expect(result.strategy).toBe('command')
    expect(result.prompt).toBe('画一只猫')
    expect(result.memoryDecision.shouldStore).toBe(false)
    expect(result.memoryDecision.reason).toBe('intent_skip')
    expect(result.memoryReadDecision).toEqual({
      shouldRead: false,
      reason: 'intent_skip',
    })
    expect(result.toolDecision).toEqual({
      shouldUseTools: false,
      reason: 'intent_skip',
    })
    expect(vi.mocked(resolvePilotRoutingSelection)).not.toHaveBeenCalled()
  })

  it('routes rule-matched prompt to image_generate', async () => {
    const result = await resolvePilotIntent({
      event: {} as any,
      message: '请帮我生成一张科技风产品海报',
    })

    expect(result.intentType).toBe('image_generate')
    expect(result.strategy).toBe('rule')
    expect(result.confidence).toBeGreaterThan(0.8)
    expect(vi.mocked(resolvePilotRoutingSelection)).not.toHaveBeenCalled()
  })

  it('uses nano classifier when command/rule do not match', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockResolvedValue({
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
      },
      channelId: 'default',
      adapter: 'openai',
      transport: 'chat.completions',
      modelId: 'gpt-5.4-nano',
      providerModel: 'gpt-5.4-nano',
      routeComboId: 'intent-auto',
      selectionReason: 'intent-classifier',
      selectionSource: 'model-binding',
      builtinTools: [],
      internet: false,
      thinking: false,
      intentType: 'intent_classification',
      score: 0,
      routeKey: 'default::gpt-5.4-nano',
    } as any)

    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://api.openai.com/v1/chat/completions',
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'image_generate',
                confidence: 0.88,
                reason: 'request to generate image',
                prompt: 'a cinematic cat poster',
              }),
            },
          },
        ],
      },
    } as any)

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '帮我做一个很酷的宣传内容',
      requestedModelId: 'gpt-5.4',
    })

    expect(result.intentType).toBe('image_generate')
    expect(result.strategy).toBe('nano')
    expect(result.prompt).toBe('a cinematic cat poster')
    expect(result.confidence).toBeGreaterThan(0.8)
    expect(vi.mocked(resolvePilotRoutingSelection)).toHaveBeenCalledTimes(1)
  })

  it('nano classifier 会返回读取记忆与工具调用决策', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockResolvedValue({
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
      },
      channelId: 'default',
      adapter: 'openai',
      transport: 'chat.completions',
      modelId: 'gpt-5.4-nano',
      providerModel: 'gpt-5.4-nano',
      routeComboId: 'intent-auto',
      selectionReason: 'intent-classifier',
      selectionSource: 'model-binding',
      builtinTools: [],
      internet: false,
      thinking: false,
      intentType: 'intent_classification',
      score: 0,
      routeKey: 'default::gpt-5.4-nano',
    } as any)

    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://api.openai.com/v1/chat/completions',
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'chat',
                confidence: 0.91,
                reason: 'needs personalized planning',
                prompt: '根据我的偏好帮我规划今天的工作安排',
                needs_websearch: false,
                should_store_memory: false,
                memory_reason: 'no_persistent_fact',
                should_read_memory: true,
                memory_read_reason: 'personalized_request',
                should_use_tools: true,
                tool_reason: 'structured_operation',
              }),
            },
          },
        ],
      },
    } as any)

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '根据我的偏好帮我规划今天的工作安排',
    })

    expect(result.intentType).toBe('chat')
    expect(result.memoryReadDecision).toEqual({
      shouldRead: true,
      reason: 'personalized_request',
    })
    expect(result.toolDecision).toEqual({
      shouldUseTools: true,
      reason: 'structured_operation',
    })
  })

  it('falls back to chat when classifier fails', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '普通聊天问题',
    })

    expect(result.intentType).toBe('chat')
    expect(result.strategy).toBe('fallback')
    expect(result.reason).toBe('classifier_failed')
    expect(result.websearchRequired).toBe(false)
    expect(result.memoryDecision.shouldStore).toBe(false)
    expect(result.memoryDecision.reason).toBe('no_persistent_fact')
  })

  it('marks durable user profile facts as memory-eligible when classifier fails', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '我长期用 Mac，偏好英文界面，请后续都按这个来',
    })

    expect(result.intentType).toBe('chat')
    expect(result.memoryDecision.shouldStore).toBe(true)
    expect(result.memoryDecision.reason).toBe('eligible')
    expect(result.memoryReadDecision.shouldRead).toBe(false)
    expect(result.toolDecision.shouldUseTools).toBe(false)
  })

  it('fallback heuristics 会同时判断是否读取记忆和是否启用工具', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '根据我的偏好帮我查一下适合我的机械键盘',
    })

    expect(result.intentType).toBe('chat')
    expect(result.memoryReadDecision).toEqual({
      shouldRead: true,
      reason: 'personalized_request',
    })
    expect(result.toolDecision).toEqual({
      shouldUseTools: true,
      reason: 'websearch_required',
    })
  })

  it('classifier_failed 遇到今天/最新/查一下会启用联网兜底', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '帮我查一下今天 OpenAI 最新发布了什么',
    })

    expect(result.intentType).toBe('chat')
    expect(result.reason).toBe('classifier_failed')
    expect(result.websearchRequired).toBe(true)
    expect(result.toolDecision).toEqual({
      shouldUseTools: true,
      reason: 'websearch_required',
    })
  })

  it('classifier_failed 时“不要联网”仍优先关闭联网', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '不要联网，直接告诉我 TypeScript 泛型怎么理解',
    })

    expect(result.intentType).toBe('chat')
    expect(result.websearchRequired).toBe(false)
    expect(result.toolDecision.shouldUseTools).toBe(false)
  })

  it('classifier_failed 时会读取姓名类记忆追问', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '我叫什么？',
    })

    expect(result.intentType).toBe('chat')
    expect(result.reason).toBe('classifier_failed')
    expect(result.memoryReadDecision).toEqual({
      shouldRead: true,
      reason: 'explicit_reference',
    })
  })

  it('显式姓名追问会覆盖 classifier 的 not_needed 结果', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockResolvedValue({
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
      },
      channelId: 'default',
      adapter: 'openai',
      transport: 'chat.completions',
      modelId: 'gpt-5.4-nano',
      providerModel: 'gpt-5.4-nano',
      routeComboId: 'intent-auto',
      selectionReason: 'intent-classifier',
      selectionSource: 'model-binding',
      builtinTools: [],
      internet: false,
      thinking: false,
      intentType: 'intent_classification',
      score: 0,
      routeKey: 'default::gpt-5.4-nano',
    } as any)

    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://api.openai.com/v1/chat/completions',
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'chat',
                confidence: 0.83,
                reason: 'general question',
                prompt: '我叫什么？',
                needs_websearch: false,
                should_store_memory: false,
                memory_reason: 'no_persistent_fact',
                should_read_memory: false,
                memory_read_reason: 'not_needed',
                should_use_tools: false,
                tool_reason: 'not_needed',
              }),
            },
          },
        ],
      },
    } as any)

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '我叫什么？',
    })

    expect(result.strategy).toBe('nano')
    expect(result.memoryReadDecision).toEqual({
      shouldRead: true,
      reason: 'explicit_reference',
    })
  })
})
