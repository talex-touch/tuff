/**
 * Built-in callers at the module boundary (AC-B5): host TTS and chatLangChain requests that name no
 * caller are counted as `core.app.tts` / `core.app.chat`, an explicit host caller is kept, and a
 * plugin can never present a `core.*` caller — every plugin path is rebound to `plugin:<name>`.
 *
 * Captures the real handlers registered by `IntelligenceModule.registerInvokeChannels` (the
 * permission registrars are bypassed: they gate plugins before these handlers and are covered by
 * their own boundary suites).
 */
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../intelligence-test-harness'
import { IntelligenceModule } from '../intelligence-module'

vi.mock('../../sentry/sentry-service', () => {
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

const runtime = vi.hoisted(() => ({
  invoke: vi.fn(async (_capabilityId: string, _payload: unknown, _options?: unknown) => ({
    result: 'ok',
    provider: 'p',
    model: 'm'
  })),
  stream: vi.fn(async function* (_capabilityId: string, _payload: unknown, _options?: unknown) {
    yield { type: 'end', result: 'ok' }
  }),
  speak: vi.fn(async (_payload: unknown) => ({
    audio: 'data:audio/mpeg;base64,AA==',
    format: 'mp3'
  }))
}))

const intelligenceEventMocks = vi.hoisted(() => {
  const events = (group: string) => {
    const cache: Record<string, { toEventName: () => string }> = {}
    return new Proxy(cache, {
      get: (_target, key: string) => (cache[key] ??= { toEventName: () => `${group}:${key}` })
    })
  }
  return {
    intelligenceApiEvents: events('intelligence:api'),
    intelligenceContextEvents: events('intelligence:context'),
    intelligenceKnowledgeEvents: events('intelligence:knowledge')
  }
})

vi.mock('@talex-touch/utils/transport/sdk/domains/intelligence', () => ({
  ...intelligenceEventMocks
}))
vi.mock('@talex-touch/utils/transport/events/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@talex-touch/utils/transport/events/types')>()),
  isIntelligenceErrorCode: vi.fn(() => false)
}))
vi.mock('../intelligence-sdk', () => ({
  setIntelligenceProviderManager: vi.fn(),
  tuffIntelligence: { invoke: runtime.invoke, stream: runtime.stream }
}))
vi.mock('../intelligence-tts-service', () => ({
  intelligenceTtsService: { speak: runtime.speak }
}))
vi.mock('../intelligence-config', () => ({
  debugPrintConfig: vi.fn(),
  ensureIntelligenceConfigLoaded: vi.fn(),
  getCapabilityOptions: vi.fn(),
  setupConfigUpdateListener: vi.fn()
}))
vi.mock('../home-conversation-injection', () => ({
  applyHomeConversationInjection: vi.fn(async (payload: unknown) => payload)
}))
vi.mock('../../voice/voice-service', () => ({ voiceService: { streamDictation: vi.fn() } }))

type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown
type StreamHandler = (payload: unknown, context: Record<string, unknown>) => Promise<void> | void
type EventLike = TuffEvent<unknown, unknown> & { toEventName: () => string }

interface InvokeRegistrar {
  registerInvokeChannels: (registerSafe: unknown, registerStream: unknown) => void
}

function captureInvokeHandlers() {
  const handlers = new Map<string, Handler>()
  const streams = new Map<string, StreamHandler>()
  const module = new IntelligenceModule() as unknown as InvokeRegistrar
  module.registerInvokeChannels(
    (event: EventLike, _action: string, _permission: string, handler: Handler) =>
      handlers.set(event.toEventName(), handler),
    (event: EventLike, _action: string, _permission: string, handler: StreamHandler) =>
      streams.set(event.toEventName(), handler)
  )
  const get = (name: string) => {
    const handler = handlers.get(`intelligence:api:${name}`)
    if (!handler) throw new Error(`handler ${name} was not registered`)
    return handler
  }
  const stream = streams.get('intelligence:api:stream')
  if (!stream) throw new Error('stream handler was not registered')
  return { get, stream }
}

const HOST = {} as HandlerContext
const PLUGIN = {
  plugin: { name: 'spoofing-plugin', uniqueKey: 'plugin-key', verified: true }
} as unknown as HandlerContext

function callerOfLastInvoke(): unknown {
  const options = runtime.invoke.mock.calls.at(-1)?.[2] as { metadata?: { caller?: unknown } }
  return options?.metadata?.caller
}

function callerOfLastSpeak(): unknown {
  const payload = runtime.speak.mock.calls.at(-1)?.[0] as { metadata?: { caller?: unknown } }
  return payload?.metadata?.caller
}

describe('built-in callers at the module boundary (AC-B5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts a host TTS request without a caller as core.app.tts', async () => {
    const { get } = captureInvokeHandlers()
    await get('ttsSpeak')({ text: 'read this aloud' }, HOST)
    expect(callerOfLastSpeak()).toBe('core.app.tts')

    await get('ttsSpeak')({ text: 'voice reply', metadata: { caller: 'core.voice.speak' } }, HOST)
    expect(callerOfLastSpeak()).toBe('core.voice.speak')
  })

  it('counts a host chatLangChain request without a caller as core.app.chat', async () => {
    const { get } = captureInvokeHandlers()
    await get('chatLangChain')({ messages: [{ role: 'user', content: 'hi' }] }, HOST)
    expect(callerOfLastInvoke()).toBe('core.app.chat')

    await get('chatLangChain')(
      { messages: [{ role: 'user', content: 'hi' }], metadata: { caller: 'core.settings.probe' } },
      HOST
    )
    expect(callerOfLastInvoke()).toBe('core.settings.probe')
  })

  it('leaves a host invoke without a caller alone (Home is attributed by the SDK)', async () => {
    const { get } = captureInvokeHandlers()
    await get('invoke')(
      {
        capabilityId: 'text.chat',
        payload: {},
        options: { metadata: { surface: 'home-conversation' } }
      },
      HOST
    )
    expect(callerOfLastInvoke()).toBeUndefined()
  })

  it.each([
    'core.home.conversation',
    'core.corebox.context-action',
    'core.app.chat',
    'core.files.embedding'
  ])('a plugin cannot spoof %s on invoke, stream, TTS or chatLangChain', async (spoofed) => {
    const { get, stream } = captureInvokeHandlers()
    const expected = 'plugin:spoofing-plugin'

    await get('invoke')(
      { capabilityId: 'text.chat', payload: {}, options: { metadata: { caller: spoofed } } },
      PLUGIN
    )
    expect(callerOfLastInvoke()).toBe(expected)

    await get('chatLangChain')(
      { messages: [{ role: 'user', content: 'hi' }], metadata: { caller: spoofed } },
      PLUGIN
    )
    expect(callerOfLastInvoke()).toBe(expected)

    await get('ttsSpeak')({ text: 'hi', metadata: { caller: spoofed } }, PLUGIN)
    expect(callerOfLastSpeak()).toBe(expected)

    await stream(
      { capabilityId: 'text.chat', payload: {}, options: { metadata: { caller: spoofed } } },
      {
        plugin: PLUGIN.plugin,
        isCancelled: () => false,
        emit: vi.fn(),
        end: vi.fn(),
        error: vi.fn()
      }
    )
    const streamOptions = runtime.stream.mock.calls.at(-1)?.[2] as {
      metadata?: { caller?: unknown }
    }
    expect(streamOptions?.metadata?.caller).toBe(expected)
  })

  it('binds a plugin that names no caller at all', async () => {
    const { get } = captureInvokeHandlers()
    await get('ttsSpeak')({ text: 'hi' }, PLUGIN)
    expect(callerOfLastSpeak()).toBe('plugin:spoofing-plugin')
    await get('chatLangChain')({ messages: [{ role: 'user', content: 'hi' }] }, PLUGIN)
    expect(callerOfLastInvoke()).toBe('plugin:spoofing-plugin')
  })
})
