import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntelligenceClient } from '../intelligence/client'

import { intelligence } from '../plugin/sdk/intelligence'

const streamHandlers = new Map<string, (raw: unknown) => void>()

const channel = {
  send: vi.fn(),
  regChannel: vi.fn((eventName: string, handler: (raw: unknown) => void) => {
    streamHandlers.set(eventName, handler)
    return () => {
      streamHandlers.delete(eventName)
    }
  }),
}

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  ensureRendererChannel: vi.fn(() => channel),
  tryGetPluginSdkApi: vi.fn(() => 17),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  tryGetPluginSdkApi: mocks.tryGetPluginSdkApi,
}))

describe('intelligence client hard-cut surface', () => {
  beforeEach(() => {
    streamHandlers.clear()
    mocks.send.mockReset()
    channel.send = mocks.send
    channel.regChannel.mockClear()
    mocks.ensureRendererChannel.mockClear()
    mocks.tryGetPluginSdkApi.mockClear()
    mocks.tryGetPluginSdkApi.mockReturnValue(17)
  })

  it('does not expose the retired client chat alias', () => {
    const channel = {
      send: vi.fn(async () => ({ ok: true, result: null })),
    }
    const client = createIntelligenceClient(channel)

    expect('chat' in client).toBe(false)
    expect(typeof client.chatLangChain).toBe('function')
    expect(typeof client.invoke).toBe('function')
  })

  it('does not expose the retired plugin intelligence chat alias', () => {
    expect('chat' in intelligence).toBe(false)
    expect(typeof intelligence.invoke).toBe('function')
  })

  it('exposes representative plugin methods from the full intelligence SDK without restoring chat', () => {
    expect('chat' in intelligence).toBe(false)

    expect(typeof intelligence.invoke).toBe('function')
    expect(typeof intelligence.getCapabilityStatus).toBe('function')
    expect(typeof intelligence.knowledgeSearch).toBe('function')
    expect(typeof intelligence.contextListMemories).toBe('function')
    expect(typeof intelligence.agentSessionStart).toBe('function')
    expect(typeof intelligence.workflowList).toBe('function')
  })

  it('sends added plugin intelligence methods through the typed channel with sdkapi', async () => {
    mocks.send.mockResolvedValueOnce({
      ok: true,
      result: {
        status: 'ok',
        hits: [],
      },
    })

    await expect(
      intelligence.knowledgeSearch({
        query: 'renderer plugin channel',
        limit: 3,
        permissionScope: 'plugin:demo',
      }),
    ).resolves.toEqual({
      status: 'ok',
      hits: [],
    })

    expect(mocks.send).toHaveBeenCalledWith(
      'intelligence:knowledge:search',
      {
        query: 'renderer plugin channel',
        limit: 3,
        permissionScope: 'plugin:demo',
        _sdkapi: 17,
      },
    )
  })

  it('starts intelligence streams on a stream-capable plugin channel with sdkapi', async () => {
    const onStart = vi.fn()
    const onDelta = vi.fn()
    const onEnd = vi.fn()

    mocks.send.mockResolvedValueOnce(undefined)

    const controller = await intelligence.stream(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      { onStart, onDelta, onEnd },
      { preferredProviderId: 'openai-main' },
    )

    expect(mocks.send).toHaveBeenCalledWith(
      'intelligence:api:stream:stream:start',
      {
        streamId: controller.streamId,
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'hello' }] },
        options: { preferredProviderId: 'openai-main', stream: true },
        _sdkapi: 17,
      },
    )
    expect(channel.regChannel).toHaveBeenCalledWith(
      `intelligence:api:stream:stream:data:${controller.streamId}`,
      expect.any(Function),
    )
    expect(channel.regChannel).toHaveBeenCalledWith(
      `intelligence:api:stream:stream:end:${controller.streamId}`,
      expect.any(Function),
    )
    expect(channel.regChannel).toHaveBeenCalledWith(
      `intelligence:api:stream:stream:error:${controller.streamId}`,
      expect.any(Function),
    )

    streamHandlers.get(`intelligence:api:stream:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { type: 'start', capabilityId: 'text.chat' } },
    })
    streamHandlers.get(`intelligence:api:stream:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { type: 'delta', capabilityId: 'text.chat', delta: 'hi' } },
    })
    streamHandlers.get(`intelligence:api:stream:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { type: 'end', capabilityId: 'text.chat' } },
    })
    streamHandlers.get(`intelligence:api:stream:stream:end:${controller.streamId}`)?.({})

    expect(onStart).toHaveBeenCalledWith({ type: 'start', capabilityId: 'text.chat' })
    expect(onDelta).toHaveBeenCalledWith('hi', { type: 'delta', capabilityId: 'text.chat', delta: 'hi' })
    expect(onEnd).toHaveBeenCalledWith({ type: 'end', capabilityId: 'text.chat' })
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('exposes read-only plugin capability discovery without restoring retired chat', async () => {
    mocks.send
      .mockResolvedValueOnce({
        ok: true,
        result: {
          capabilityId: 'text.chat',
          available: true,
          providerIds: ['openai-main'],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: [
          {
            providerId: 'openai-main',
            providerName: 'OpenAI Main',
            providerType: 'openai',
            models: ['gpt-4.1-mini'],
            defaultModel: 'gpt-4.1-mini',
            capabilities: ['text.chat'],
            available: true,
          },
        ],
      })

    expect('chat' in intelligence).toBe(false)
    expect(typeof intelligence.getCapabilityStatus).toBe('function')
    expect(typeof intelligence.getProviderModelOptions).toBe('function')

    await expect(
      intelligence.getCapabilityStatus({ capabilityId: 'text.chat' }),
    ).resolves.toEqual({
      capabilityId: 'text.chat',
      available: true,
      providerIds: ['openai-main'],
    })
    await expect(
      intelligence.getProviderModelOptions({ capabilityId: 'text.chat' }),
    ).resolves.toEqual([
      {
        providerId: 'openai-main',
        providerName: 'OpenAI Main',
        providerType: 'openai',
        models: ['gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
        capabilities: ['text.chat'],
        available: true,
      },
    ])

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      'intelligence:api:get-capability-status',
      { capabilityId: 'text.chat', _sdkapi: 17 },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      'intelligence:api:get-provider-model-options',
      { capabilityId: 'text.chat', _sdkapi: 17 },
    )
  })
})
