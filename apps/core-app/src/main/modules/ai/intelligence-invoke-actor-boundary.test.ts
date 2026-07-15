import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceTtsService } from './intelligence-tts-service'

vi.mock('../sentry/sentry-service', () => {
  class SentryServiceModule {
    isTelemetryEnabled = vi.fn(() => false)
    isEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
  }

  const service = new SentryServiceModule()
  return {
    SentryServiceModule,
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

const intelligenceSdkMocks = vi.hoisted(() => ({
  invoke: vi.fn(
    async (): Promise<{
      provider: string
      model: string
      result?: { audio: string; format: string }
    }> => ({ provider: 'test-provider', model: 'test-model' })
  ),
  stream: vi.fn(async function* () {
    yield { type: 'text-delta', text: 'streamed response' }
  }),
  updateConfig: vi.fn()
}))
const intelligenceEventMocks = vi.hoisted(() => {
  const event = (name: string) => ({ toEventName: () => name })
  return {
    intelligenceApiEvents: {
      invoke: event('intelligence:api:invoke'),
      stream: event('intelligence:api:stream'),
      ttsSpeak: event('intelligence:api:tts-speak'),
      chatLangChain: event('intelligence:api:chat-langchain')
    },
    intelligenceContextEvents: {
      execute: event('intelligence:context:execute'),
      stream: event('intelligence:context:stream')
    }
  }
})

vi.mock('@talex-touch/utils/transport/sdk/domains/intelligence', () => ({
  ...intelligenceEventMocks,
  intelligenceKnowledgeEvents: {}
}))
vi.mock('@talex-touch/utils/transport/events/types', () => ({
  isIntelligenceErrorCode: vi.fn(() => false)
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: intelligenceSdkMocks
}))

type InvokeHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown
type StreamHandler = (payload: unknown, context: StreamContext<unknown>) => Promise<void> | void

interface InvokeChannelRegistrar {
  registerInvokeChannels: (registerInvoke: unknown, registerStream: unknown) => void
}

async function registerInvokeHandlers() {
  const { IntelligenceModule } = await import('./intelligence-module')
  const { intelligenceApiEvents } =
    await import('@talex-touch/utils/transport/sdk/domains/intelligence')
  const invokeHandlers = new Map<string, InvokeHandler>()
  const streamHandlers = new Map<string, StreamHandler>()
  const registerInvoke = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      _permissionId: string,
      handler: InvokeHandler
    ) => {
      invokeHandlers.set(event.toEventName(), handler)
    }
  )
  const registerStream = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      _permissionId: string,
      handler: StreamHandler
    ) => {
      streamHandlers.set(event.toEventName(), handler)
    }
  )

  const module = new IntelligenceModule() as unknown as InvokeChannelRegistrar
  module.registerInvokeChannels(registerInvoke, registerStream)
  return { intelligenceApiEvents, invokeHandlers, streamHandlers }
}

function pluginContext(): HandlerContext {
  return {
    plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
  } as HandlerContext
}

describe('intelligenceModule invoke actor boundary', () => {
  beforeEach(() => {
    intelligenceSdkMocks.invoke.mockClear()
    intelligenceSdkMocks.stream.mockClear()
    intelligenceTtsService.clear()
  })

  it('binds missing and spoofed plugin invoke callers without losing request options', async () => {
    const { intelligenceApiEvents, invokeHandlers } = await registerInvokeHandlers()
    const handler = invokeHandlers.get(intelligenceApiEvents.invoke.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('Invoke handler was not registered')
    }

    const sharedOptions = {
      preferredProviderId: 'approved-provider',
      modelPreference: ['approved-model'],
      timeout: 4_000,
      metadata: { traceId: 'plugin-trace-1', requestKind: 'completion' }
    }
    await handler(
      { capabilityId: 'text.chat', payload: { messages: [] }, options: sharedOptions },
      pluginContext()
    )
    await handler(
      {
        capabilityId: 'text.chat',
        payload: { messages: [] },
        options: {
          ...sharedOptions,
          metadata: { ...sharedOptions.metadata, caller: 'host:spoofed' }
        }
      },
      pluginContext()
    )

    expect(intelligenceSdkMocks.invoke).toHaveBeenNthCalledWith(
      1,
      'text.chat',
      { messages: [] },
      {
        ...sharedOptions,
        metadata: { ...sharedOptions.metadata, caller: 'plugin:third-party-plugin' }
      }
    )
    expect(intelligenceSdkMocks.invoke).toHaveBeenNthCalledWith(
      2,
      'text.chat',
      { messages: [] },
      {
        ...sharedOptions,
        metadata: { ...sharedOptions.metadata, caller: 'plugin:third-party-plugin' }
      }
    )
  })

  it('binds the authenticated plugin caller for streams while preserving options', async () => {
    const { intelligenceApiEvents, streamHandlers } = await registerInvokeHandlers()
    const handler = streamHandlers.get(intelligenceApiEvents.stream.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('Stream handler was not registered')
    }

    const streamContext = {
      ...pluginContext(),
      emit: vi.fn(),
      end: vi.fn(),
      isCancelled: vi.fn(() => false)
    } as unknown as StreamContext<unknown>
    await handler(
      {
        capabilityId: 'text.chat',
        payload: { messages: [] },
        options: {
          preferredProviderId: 'approved-provider',
          timeout: 2_000,
          metadata: { caller: 'plugin:other-plugin', traceId: 'plugin-stream-trace' }
        }
      },
      streamContext
    )

    expect(intelligenceSdkMocks.stream).toHaveBeenCalledWith(
      'text.chat',
      { messages: [] },
      {
        preferredProviderId: 'approved-provider',
        timeout: 2_000,
        metadata: { caller: 'plugin:third-party-plugin', traceId: 'plugin-stream-trace' }
      }
    )
  })

  it('binds missing and spoofed plugin chat callers while retaining provider and prompt metadata', async () => {
    const { intelligenceApiEvents, invokeHandlers } = await registerInvokeHandlers()
    const handler = invokeHandlers.get(intelligenceApiEvents.chatLangChain.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('LangChain chat handler was not registered')
    }

    const requests = [
      {
        messages: [{ role: 'user', content: 'Explain caller binding.' }],
        providerId: 'approved-chat-provider',
        model: 'approved-chat-model',
        promptTemplate: 'Respond about {subject} in a {tone} style.',
        promptVariables: { subject: 'caller binding', tone: 'precise' },
        metadata: { traceId: 'plugin-chat-missing', requestKind: 'langchain' }
      },
      {
        messages: [{ role: 'user', content: 'Reject spoofed caller.' }],
        providerId: 'approved-chat-provider',
        model: 'approved-chat-model',
        promptTemplate: 'Respond about {subject} in a {tone} style.',
        promptVariables: { subject: 'caller binding', tone: 'precise' },
        metadata: {
          caller: 'host:spoofed',
          traceId: 'plugin-chat-spoofed',
          requestKind: 'langchain'
        }
      }
    ]

    for (const request of requests) {
      await handler(request, pluginContext())
    }

    for (const [index, request] of requests.entries()) {
      expect(intelligenceSdkMocks.invoke).toHaveBeenNthCalledWith(
        index + 1,
        'text.chat',
        { messages: request.messages },
        {
          preferredProviderId: request.providerId,
          modelPreference: [request.model],
          metadata: {
            ...request.metadata,
            caller: 'plugin:third-party-plugin',
            promptTemplate: request.promptTemplate,
            promptVariables: request.promptVariables
          }
        }
      )
    }
  })

  it('binds missing and spoofed plugin TTS callers through the audio runtime', async () => {
    const { intelligenceApiEvents, invokeHandlers } = await registerInvokeHandlers()
    const handler = invokeHandlers.get(intelligenceApiEvents.ttsSpeak.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('TTS speak handler was not registered')
    }

    intelligenceSdkMocks.invoke
      .mockResolvedValueOnce({
        result: { audio: 'ZmFrZS1hdWRpbw==', format: 'mp3' },
        provider: 'tts-provider',
        model: 'tts-model'
      })
      .mockResolvedValueOnce({
        result: { audio: 'ZmFrZS1hdWRpbw==', format: 'mp3' },
        provider: 'tts-provider',
        model: 'tts-model'
      })

    const requests = [
      {
        text: 'Speak under the authenticated caller.',
        voice: 'nova',
        language: 'en-US',
        speed: 1.2,
        pitch: -1,
        format: 'ogg' as const,
        quality: 'hd' as const,
        sourceTraceId: 'plugin-tts-missing',
        providerId: 'approved-tts-provider',
        model: 'approved-tts-model',
        metadata: { traceId: 'plugin-tts-missing', requestKind: 'speech' }
      },
      {
        text: 'Replace a spoofed TTS caller.',
        voice: 'nova',
        language: 'en-US',
        speed: 1.2,
        pitch: -1,
        format: 'ogg' as const,
        quality: 'hd' as const,
        sourceTraceId: 'plugin-tts-spoofed',
        providerId: 'approved-tts-provider',
        model: 'approved-tts-model',
        metadata: {
          caller: 'host:spoofed',
          traceId: 'plugin-tts-spoofed',
          requestKind: 'speech'
        }
      }
    ]

    for (const request of requests) {
      await handler(request, pluginContext())
    }

    for (const [index, request] of requests.entries()) {
      expect(intelligenceSdkMocks.invoke).toHaveBeenNthCalledWith(
        index + 1,
        'audio.tts',
        {
          text: request.text,
          voice: request.voice,
          language: request.language,
          speed: request.speed,
          pitch: request.pitch,
          format: request.format,
          quality: request.quality
        },
        {
          preferredProviderId: request.providerId,
          modelPreference: [request.model],
          metadata: {
            ...request.metadata,
            caller: 'plugin:third-party-plugin',
            entry: 'tts-speak',
            sourceTraceId: request.sourceTraceId
          }
        }
      )
    }
  })

  it('preserves frozen host chat payload metadata and caller', async () => {
    const { intelligenceApiEvents, invokeHandlers } = await registerInvokeHandlers()
    const handler = invokeHandlers.get(intelligenceApiEvents.chatLangChain.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('LangChain chat handler was not registered')
    }

    const metadata = Object.freeze({ caller: 'host:corebox', traceId: 'host-chat-trace' })
    const promptVariables = Object.freeze({ subject: 'host identity' })
    const payload = Object.freeze({
      messages: [{ role: 'user', content: 'Keep host caller.' }],
      providerId: 'host-chat-provider',
      model: 'host-chat-model',
      promptTemplate: 'Discuss {subject}.',
      promptVariables,
      metadata
    })

    await handler(payload, {} as HandlerContext)

    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledWith(
      'text.chat',
      { messages: payload.messages },
      {
        preferredProviderId: payload.providerId,
        modelPreference: [payload.model],
        metadata: {
          ...metadata,
          promptTemplate: payload.promptTemplate,
          promptVariables
        }
      }
    )
    expect(payload.metadata).toBe(metadata)
    expect(payload.promptVariables).toBe(promptVariables)
  })

  it('preserves frozen host TTS payload metadata and caller through the audio runtime', async () => {
    const { intelligenceApiEvents, invokeHandlers } = await registerInvokeHandlers()
    const handler = invokeHandlers.get(intelligenceApiEvents.ttsSpeak.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('TTS speak handler was not registered')
    }

    intelligenceSdkMocks.invoke.mockResolvedValueOnce({
      result: { audio: 'ZmFrZS1hdWRpbw==', format: 'mp3' },
      provider: 'tts-provider',
      model: 'tts-model'
    })
    const metadata = Object.freeze({ caller: 'host:corebox', traceId: 'host-tts-trace' })
    const payload = Object.freeze({
      text: 'Keep the host caller.',
      voice: 'alloy',
      language: 'en-US',
      speed: 0.9,
      pitch: 2,
      format: 'wav' as const,
      quality: 'standard' as const,
      sourceTraceId: 'host-tts-source-trace',
      providerId: 'host-tts-provider',
      model: 'host-tts-model',
      metadata
    })

    await handler(payload, {} as HandlerContext)

    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledWith(
      'audio.tts',
      {
        text: payload.text,
        voice: payload.voice,
        language: payload.language,
        speed: payload.speed,
        pitch: payload.pitch,
        format: payload.format,
        quality: payload.quality
      },
      {
        preferredProviderId: payload.providerId,
        modelPreference: [payload.model],
        metadata: {
          ...metadata,
          entry: 'tts-speak',
          sourceTraceId: payload.sourceTraceId
        }
      }
    )
    expect(payload.metadata).toBe(metadata)
  })

  it('fails closed for autonomous generic plugin requests while text chat remains callable', async () => {
    const { intelligenceApiEvents, invokeHandlers, streamHandlers } = await registerInvokeHandlers()
    const invokeHandler = invokeHandlers.get(intelligenceApiEvents.invoke.toEventName())
    const streamHandler = streamHandlers.get(intelligenceApiEvents.stream.toEventName())

    expect(invokeHandler).toBeDefined()
    expect(streamHandler).toBeDefined()
    if (!invokeHandler || !streamHandler) {
      throw new Error('Generic intelligence handlers were not registered')
    }

    const streamContext = {
      ...pluginContext(),
      emit: vi.fn(),
      end: vi.fn(),
      isCancelled: vi.fn(() => false)
    } as unknown as StreamContext<unknown>
    const unavailableAgentsPermission = {
      name: 'Error',
      message: "Permission runtime is unavailable for 'intelligence.agents'",
      code: 'INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE',
      permissionId: 'intelligence.agents',
      pluginId: 'third-party-plugin'
    }

    await expect(
      invokeHandler({ capabilityId: 'agent.run', payload: {}, options: {} }, pluginContext())
    ).rejects.toMatchObject(unavailableAgentsPermission)
    await expect(
      streamHandler({ capabilityId: 'workflow.execute', payload: {}, options: {} }, streamContext)
    ).rejects.toMatchObject(unavailableAgentsPermission)

    expect(intelligenceSdkMocks.invoke).not.toHaveBeenCalled()
    expect(intelligenceSdkMocks.stream).not.toHaveBeenCalled()

    await expect(
      invokeHandler(
        { capabilityId: 'text.chat', payload: { messages: [] }, options: {} },
        pluginContext()
      )
    ).resolves.toEqual({ provider: 'test-provider', model: 'test-model' })
    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledOnce()
  })

  it('preserves host invoke options and caller exactly', async () => {
    const { intelligenceApiEvents, invokeHandlers } = await registerInvokeHandlers()
    const handler = invokeHandlers.get(intelligenceApiEvents.invoke.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('Invoke handler was not registered')
    }

    const options = {
      preferredProviderId: 'approved-provider',
      metadata: { caller: 'host:corebox', traceId: 'host-trace-1' }
    }
    await handler(
      { capabilityId: 'text.chat', payload: { messages: [] }, options },
      {} as HandlerContext
    )

    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledWith('text.chat', { messages: [] }, options)
  })
})
