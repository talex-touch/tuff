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

  it('falls back to chat when classifier fails', async () => {
    vi.mocked(resolvePilotRoutingSelection).mockRejectedValue(new Error('route failed'))

    const result = await resolvePilotIntent({
      event: {} as any,
      message: '普通聊天问题',
    })

    expect(result.intentType).toBe('chat')
    expect(result.strategy).toBe('fallback')
    expect(result.reason).toBe('classifier_failed')
  })
})
