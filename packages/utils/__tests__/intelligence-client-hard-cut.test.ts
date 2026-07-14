import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntelligenceClient } from '../intelligence/client'
import { createIntelligenceContextExecutionRequest } from '../intelligence/context-execution'

import { intelligence } from '../plugin/sdk/intelligence'

const streamHandlers = new Map<string, (raw: unknown) => void>()

const channel = {
  send: vi.fn(),
  regChannel: vi.fn((eventName: string, handler: (raw: unknown) => void) => {
    streamHandlers.set(eventName, handler)
    return () => channel.unRegChannel(eventName, handler)
  }),
  unRegChannel: vi.fn((eventName: string, handler: (raw: unknown) => void) => {
    if (streamHandlers.get(eventName) !== handler) {
      return false
    }
    streamHandlers.delete(eventName)
    return true
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

type MockPluginChannel = {
  send: (eventName: string, payload?: unknown) => Promise<unknown>
  regChannel: (eventName: string, handler: (raw: unknown) => void) => () => void
  unRegChannel: (eventName: string, handler: (raw: unknown) => void) => boolean
}

type MockStreamEvent = {
  toEventName: () => string
}

type MockStreamOptions = {
  onData: (chunk: unknown) => void
  onError?: (error: Error) => void
  onEnd?: () => void
}

function unwrapStreamPayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }

  const record = raw as Record<string, unknown>
  const payload = 'data' in record && 'header' in record ? record.data : raw
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
}

vi.mock('../transport', () => {
  let streamIndex = 0

  return {
    createPluginTuffTransport(channel: MockPluginChannel) {
      return {
        send(event: MockStreamEvent, payload?: unknown) {
          return channel.send(event.toEventName(), payload)
        },
        async stream(event: MockStreamEvent, payload: unknown, options: MockStreamOptions) {
          const streamId = `mock-stream-${++streamIndex}`
          const eventName = event.toEventName()
          let cancelled = false
          let cleaned = false

          const cleanups: Array<() => void> = []
          const cleanup = () => {
            if (cleaned) {
              return
            }
            cleaned = true
            cleanups.forEach(cleanup => cleanup())
          }
          const register = (suffix: 'data' | 'end' | 'error', handler: (raw: unknown) => void) => {
            const channelName = `${eventName}:stream:${suffix}:${streamId}`
            channel.regChannel(channelName, handler)
            cleanups.push(() => channel.unRegChannel(channelName, handler))
          }

          register('data', (raw) => {
            if (cancelled) {
              return
            }
            const data = unwrapStreamPayload(raw)
            if (typeof data?.error === 'string') {
              options.onError?.(new Error(data.error))
              return
            }
            if (data?.chunk !== undefined) {
              options.onData(data.chunk)
            }
          })
          register('end', () => {
            if (cancelled) {
              return
            }
            options.onEnd?.()
            cleanup()
          })
          register('error', (raw) => {
            if (cancelled) {
              return
            }
            const data = unwrapStreamPayload(raw)
            options.onError?.(new Error(typeof data?.error === 'string' ? data.error : 'Stream error'))
            cleanup()
          })

          const controller = {
            cancel: () => {
              if (cancelled) {
                return
              }
              cancelled = true
              void channel.send(`${eventName}:stream:cancel`, { streamId })
              cleanup()
            },
            get cancelled() {
              return cancelled
            },
            streamId,
          }

          await channel.send(`${eventName}:stream:start`, {
            streamId,
            ...(payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}),
          })
          return controller
        },
      }
    },
  }
})

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

  it('exposes plugin-safe methods without host-only management or diagnostics', () => {
    const runtimeSurface = intelligence as unknown as Record<string, unknown>

    expect('chat' in intelligence).toBe(false)
    expect(typeof intelligence.invoke).toBe('function')
    expect(typeof intelligence.getCapabilityStatus).toBe('function')
    expect(typeof intelligence.knowledgeSearch).toBe('function')
    expect(typeof intelligence.contextInvoke).toBe('function')
    expect(typeof intelligence.contextStream).toBe('function')
    expect(typeof intelligence.contextEvaluateMemory).toBe('function')
    expect(typeof intelligence.agentSessionStart).toBe('function')
    expect(typeof intelligence.workflowList).toBe('function')

    for (const method of [
      'contextPrepareTurn',
      'contextCreateCompressionSnapshot',
      'contextListCompressionSnapshots',
      'contextGetLatestCompressionSnapshot',
      'contextListMemories',
      'contextSaveMemory',
      'contextReplaceMemory',
      'contextSetMemoryEnabled',
      'contextDeleteMemory',
    ]) {
      expect(method in intelligence).toBe(false)
      expect(runtimeSurface[method]).toBeUndefined()
    }

    const enumerableMethods = Object.keys(runtimeSurface)
    for (const method of [
      'getQuota',
      'setQuota',
      'deleteQuota',
      'getAllQuotas',
      'checkQuota',
      'getCurrentUsage',
      'testProvider',
      'testCapability',
      'fetchModels',
      'getAuditLogs',
      'getTodayStats',
      'getMonthStats',
      'getUsageStats',
      'getLocalEnvironment',
    ]) {
      expect(method in intelligence).toBe(false)
      expect(runtimeSurface[method]).toBeUndefined()
      expect(enumerableMethods).not.toContain(method)
    }
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

  it('sends host-owned context execution through the typed plugin channel', async () => {
    const request = {
      capabilityId: 'text.chat',
      input: 'summarize this',
      payload: { messages: [{ role: 'user' as const, content: 'summarize this' }] },
      context: { mode: 'new' as const, scope: 'retrieval' as const, tokenBudget: 800 },
    }
    mocks.send.mockResolvedValueOnce({
      ok: true,
      result: {
        invocation: { result: 'summary', provider: 'local', model: 'qwen' },
        context: {
          mode: 'new',
          scope: 'retrieval',
          itemCount: 1,
          tokenBudget: 800,
          tokenEstimate: 4,
          sourceTypes: ['current_input'],
          citationCount: 0,
        },
      },
    })

    await expect(intelligence.contextInvoke(request)).resolves.toMatchObject({
      invocation: { result: 'summary' },
      context: { mode: 'new', itemCount: 1 },
    })
    expect(mocks.send).toHaveBeenCalledWith('intelligence:context:execute', {
      ...request,
      _sdkapi: 17,
    })
  })

  it('maps entrypoint policy onto the host-owned context request', () => {
    const request = createIntelligenceContextExecutionRequest({
      capabilityId: 'text.chat',
      input: 'current workflow input',
      payload: { messages: [{ role: 'user', content: 'current workflow input' }] },
      options: { metadata: { workflowRunId: 'run-1' } },
      policy: {
        entrypointId: ' workflow.use-model ',
        owner: 'workflow',
        mode: 'continue',
        sessionId: ' workflow-context.run-1 ',
        scope: 'session',
        objective: ' Run one ',
        traceId: ' trace-1 '
      }
    })

    expect(request).toMatchObject({
      capabilityId: 'text.chat',
      input: 'current workflow input',
      options: {
        metadata: {
          workflowRunId: 'run-1',
          contextEntrypoint: {
            id: 'workflow.use-model',
            owner: 'workflow',
            mode: 'continue'
          }
        }
      },
      context: {
        mode: 'continue',
        owner: 'workflow',
        sessionId: 'workflow-context.run-1',
        scope: 'session',
        objective: 'Run one',
        traceId: 'trace-1'
      }
    })
  })

  it('starts host-owned context streams without exposing raw packages', async () => {
    const request = {
      capabilityId: 'text.chat',
      input: 'continue',
      payload: { messages: [{ role: 'user' as const, content: 'continue' }] },
      context: { mode: 'continue' as const, sessionId: 'session-1' },
    }
    const onStart = vi.fn()
    const onEnd = vi.fn()
    mocks.send.mockResolvedValueOnce(undefined)

    const controller = await intelligence.contextStream(request, { onStart, onEnd })

    expect(mocks.send).toHaveBeenCalledWith(
      'intelligence:context:stream:stream:start',
      {
        streamId: controller.streamId,
        ...request,
        _sdkapi: 17,
      },
    )
    const dataEvent = `intelligence:context:stream:stream:data:${controller.streamId}`
    const safeContext = {
      mode: 'continue',
      scope: 'retrieval',
      sessionId: 'session-1',
      packageId: 'package-1',
      itemCount: 2,
      tokenBudget: 800,
      tokenEstimate: 12,
      sourceTypes: ['current_input', 'retrieval'],
      citationCount: 1,
    }
    streamHandlers.get(dataEvent)?.({
      header: { status: 'request' },
      data: { chunk: { type: 'start', capabilityId: 'text.chat', context: safeContext } },
    })
    streamHandlers.get(dataEvent)?.({
      header: { status: 'request' },
      data: { chunk: { type: 'end', capabilityId: 'text.chat', context: safeContext } },
    })

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ packageId: 'package-1', citationCount: 1 }),
    }))
    expect(onStart.mock.calls[0]?.[0].context).not.toHaveProperty('items')
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ sessionId: 'session-1' }),
    }))
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
