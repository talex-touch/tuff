import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { StreamController } from '@talex-touch/utils/transport'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligencePartEvent,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { ConversationIntelligenceSdk } from './useHomeConversation'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it, vi } from 'vitest'
import { useHomeConversation } from './useHomeConversation'

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => {
    throw new Error('tests must inject a conversation SDK double')
  }
}))

/** Drains the microtask queue so the composable's awaited stream handshake has settled. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function invokeResult(text: string): IntelligenceInvokeResult<string> {
  return {
    result: text,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: 'double',
    latency: 0,
    traceId: 'trace-double',
    provider: 'double'
  }
}

interface SdkDouble {
  sdk: ConversationIntelligenceSdk
  /** Payloads handed to `stream()`, one entry per turn. */
  streamPayloads: IntelligenceChatPayload[]
  /** Fourth argument of `stream()`, one entry per turn — what pins provider and model. */
  invokeOptions: Array<unknown>
  chatPayloads: IntelligenceChatPayload[]
  cancel: ReturnType<typeof vi.fn>
  emit: () => IntelligenceStreamOptions<string>
}

function createSdkDouble(
  overrides: {
    startStream?: () => Promise<StreamController>
    chat?: (payload: IntelligenceChatPayload) => Promise<IntelligenceInvokeResult<string>>
  } = {}
): SdkDouble {
  const streamPayloads: IntelligenceChatPayload[] = []
  const invokeOptions: Array<unknown> = []
  const chatPayloads: IntelligenceChatPayload[] = []
  const cancel = vi.fn()
  let handlers: IntelligenceStreamOptions<string> | null = null

  const controller: StreamController = { cancel, cancelled: false, streamId: 'stream-double' }

  const sdk: ConversationIntelligenceSdk = {
    stream: async (_capabilityId, payload, options, streamInvokeOptions) => {
      streamPayloads.push(payload)
      invokeOptions.push(streamInvokeOptions)
      handlers = options
      if (overrides.startStream) return overrides.startStream()
      return controller
    },
    text: {
      chat: async (payload) => {
        chatPayloads.push(payload)
        if (overrides.chat) return overrides.chat(payload)
        return invokeResult('fallback reply')
      }
    }
  }

  return {
    sdk,
    streamPayloads,
    invokeOptions,
    chatPayloads,
    cancel,
    emit: () => {
      if (!handlers) throw new Error('stream() has not been called yet')
      return handlers
    }
  }
}

describe('useHomeConversation', () => {
  it('accumulates streamed deltas into the assistant message', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('  hello  ')
    await flush()

    expect(conversation.isStreaming.value).toBe(true)
    expect(conversation.messages.value[0]).toMatchObject({
      role: 'user',
      content: 'hello',
      status: 'complete'
    })

    double.emit().onDelta?.('Hel', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onDelta?.('lo!', { type: 'delta', capabilityId: 'text.chat' })
    expect(conversation.messages.value[1]).toMatchObject({ content: 'Hello!', status: 'streaming' })

    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(conversation.messages.value[1]).toMatchObject({ content: 'Hello!', status: 'complete' })
    expect(conversation.isStreaming.value).toBe(false)
    expect(double.chatPayloads).toHaveLength(0)
  })

  it('sends only settled turns as provider context', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const first = conversation.send('first')
    await flush()
    double.emit().onDelta?.('answer', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await first

    const second = conversation.send('second')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await second

    // The streaming placeholder of the second turn must not travel as an empty assistant message.
    expect(double.streamPayloads[1]?.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second' }
    ])
  })

  it('keeps produced content when the user stops the stream', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    double.emit().onDelta?.('partial', { type: 'delta', capabilityId: 'text.chat' })

    conversation.stop()
    await turn

    expect(double.cancel).toHaveBeenCalledTimes(1)
    expect(conversation.messages.value[1]).toMatchObject({
      content: 'partial',
      status: 'complete'
    })
    expect(conversation.isStreaming.value).toBe(false)
  })

  it('drops the placeholder when stopped before any content arrives', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    conversation.stop()
    await turn

    expect(conversation.messages.value).toHaveLength(1)
    expect(conversation.messages.value[0]?.role).toBe('user')
  })

  it('falls back to a non-streaming call when the stream fails before any delta', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    double
      .emit()
      .onError?.(new Error('[CAPABILITY_UNSUPPORTED:text.chat] does not support streaming'))
    await turn

    expect(double.chatPayloads).toHaveLength(1)
    expect(conversation.messages.value[1]).toMatchObject({
      content: 'fallback reply',
      status: 'complete'
    })
  })

  it('falls back when the stream never starts', async () => {
    const double = createSdkDouble({
      startStream: () => Promise.reject(new TypeError('stream-capable transport required'))
    })
    const conversation = useHomeConversation({ sdk: double.sdk })

    await conversation.send('hello')

    expect(double.chatPayloads).toHaveLength(1)
    expect(conversation.messages.value[1]).toMatchObject({
      content: 'fallback reply',
      status: 'complete'
    })
  })

  it('does not fall back once deltas landed, to avoid duplicating them', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    double.emit().onDelta?.('half ', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onError?.(new Error('[NETWORK_FAILURE:text.chat] socket hang up'))
    await turn

    expect(double.chatPayloads).toHaveLength(0)
    expect(conversation.messages.value[1]).toMatchObject({
      content: 'half ',
      status: 'failed',
      error: { code: 'NETWORK_FAILURE', detail: 'socket hang up' }
    })
  })

  it('reports the fallback failure when both paths fail', async () => {
    const double = createSdkDouble({
      chat: () => Promise.reject(new Error('[PROVIDER_UNAVAILABLE:text.chat] No enabled providers'))
    })
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    double.emit().onError?.(new Error('[UNKNOWN:text.chat] stream broke'))
    await turn

    expect(conversation.messages.value[1]).toMatchObject({
      status: 'failed',
      error: { code: 'PROVIDER_UNAVAILABLE', detail: 'No enabled providers' }
    })
    expect(conversation.isStreaming.value).toBe(false)
  })

  it('marks an empty reply as failed instead of leaving a blank bubble', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    double.emit().onDelta?.('   ', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(conversation.messages.value[1]).toMatchObject({
      status: 'failed',
      error: { code: 'EMPTY_RESPONSE' }
    })
  })

  it('ignores empty input and refuses a second send while streaming', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    await conversation.send('   ')
    expect(conversation.messages.value).toHaveLength(0)
    expect(conversation.isEmpty.value).toBe(true)

    const turn = conversation.send('hello')
    await flush()
    await conversation.send('second')

    expect(double.streamPayloads).toHaveLength(1)
    expect(conversation.messages.value).toHaveLength(2)

    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn
  })

  it('retries the failed turn without duplicating the user message', async () => {
    // Both paths must fail for the turn to end up `failed`, so the non-streaming fallback rejects.
    const double = createSdkDouble({
      chat: () => Promise.reject(new Error('[PROVIDER_UNAVAILABLE:text.chat] No enabled providers'))
    })
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    double.emit().onError?.(new Error('[PROVIDER_UNAVAILABLE:text.chat] No enabled providers'))
    await turn
    double.emit().onDelta?.('ignored after settle', { type: 'delta', capabilityId: 'text.chat' })

    expect(conversation.messages.value[1]).toMatchObject({ status: 'failed', content: '' })

    const retry = conversation.retry()
    await flush()
    double.emit().onDelta?.('second attempt', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await retry

    expect(conversation.messages.value).toHaveLength(2)
    expect(conversation.messages.value[1]).toMatchObject({
      content: 'second attempt',
      status: 'complete',
      error: undefined
    })
    expect(double.streamPayloads[1]?.messages).toEqual([{ role: 'user', content: 'hello' }])
  })
})

describe('attachments on the wire', () => {
  const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='
  const image: AiAttachment = { kind: 'image', id: 'att-1', url: PNG_DATA_URL, name: 'shot.png' }
  const carried = [{ type: 'image', dataUrl: PNG_DATA_URL, name: 'shot.png' }]

  it('carries the sent images on the turn the model is answering', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('what is this', [image])
    await flush()
    double.emit().onDelta?.('a cat', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(double.streamPayloads[0]?.messages).toEqual([
      { role: 'user', content: 'what is this', attachments: carried }
    ])
  })

  it('hands over a payload the IPC boundary can clone', async () => {
    // Attachments read off a reactive message come back as a Proxy, which structuredClone refuses —
    // the SDK double in these tests would never notice, but every real send would fail.
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('what is this', [image])
    await flush()
    double.emit().onDelta?.('a cat', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(() => structuredClone(double.streamPayloads[0])).not.toThrow()
  })

  it('re-sends the same images when the turn is retried', async () => {
    // The composer let go of the attachments at send time, so a retry that rebuilt the payload from
    // the tray would silently ask the model about an image it can no longer see.
    const double = createSdkDouble({
      chat: () => Promise.reject(new Error('[PROVIDER_UNAVAILABLE:text.chat] No enabled providers'))
    })
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('what is this', [image])
    await flush()
    double.emit().onError?.(new Error('[PROVIDER_UNAVAILABLE:text.chat] No enabled providers'))
    await turn

    const retry = conversation.retry()
    await flush()
    double.emit().onDelta?.('a cat', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await retry

    expect(double.streamPayloads[1]?.messages).toEqual([
      { role: 'user', content: 'what is this', attachments: carried }
    ])
  })

  it('leaves the images behind once their turn has been answered', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const first = conversation.send('what is this', [image])
    await flush()
    double.emit().onDelta?.('a cat', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await first

    const second = conversation.send('and its colour?')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await second

    expect(double.streamPayloads[1]?.messages).toEqual([
      { role: 'user', content: 'what is this' },
      { role: 'assistant', content: 'a cat' },
      { role: 'user', content: 'and its colour?' }
    ])
  })

  it('sends a plain turn when nothing attached can reach the model', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })
    const file: AiAttachment = { kind: 'file', id: 'att-2', name: 'notes.pdf', size: 12 }

    const turn = conversation.send('read this', [file])
    await flush()
    double.emit().onDelta?.('cannot', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(double.streamPayloads[0]?.messages).toEqual([{ role: 'user', content: 'read this' }])
    // The bubble still shows it; the absence of `modelAttachments` is what the view reads as
    // "this one stayed local" and keeps the hint under the message.
    expect(conversation.messages.value[0]?.attachments).toEqual([file])
    expect(conversation.messages.value[0]?.modelAttachments).toBeUndefined()
  })
})

describe('turn metadata', () => {
  it('records provider, model, usage and latency for a streamed turn', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hi')
    await flush()

    double.emit().onStart?.({
      type: 'start',
      capabilityId: 'text.chat',
      provider: 'pi-cli-default',
      model: 'gpt-5.6-terra'
    })
    double.emit().onDelta?.('ok', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({
      type: 'end',
      capabilityId: 'text.chat',
      usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 }
    })
    await turn

    expect(conversation.lastTurn.value).toMatchObject({
      provider: 'pi-cli-default',
      model: 'gpt-5.6-terra',
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10
    })
    expect(typeof conversation.lastTurn.value?.latencyMs).toBe('number')
  })

  it('keeps an earlier provider when a later event omits it', async () => {
    // `end` carries no provider on some transports; merging rather than replacing is what keeps the
    // side panel from blanking out the moment the turn settles.
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hi')
    await flush()
    double.emit().onStart?.({
      type: 'start',
      capabilityId: 'text.chat',
      provider: 'pi-cli-default',
      model: 'gpt-5.6-terra'
    })
    double.emit().onDelta?.('ok', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(conversation.lastTurn.value?.provider).toBe('pi-cli-default')
  })

  it('records metadata from the non-streaming fallback too', async () => {
    const double = createSdkDouble({
      startStream: () => Promise.reject(new Error('no stream transport'))
    })
    const conversation = useHomeConversation({ sdk: double.sdk })

    await conversation.send('hi')

    expect(conversation.lastTurn.value).toMatchObject({ provider: 'double', model: 'double' })
  })
})

describe('routing', () => {
  it('pins the chosen provider and model onto the request', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({
      sdk: double.sdk,
      routing: () => ({ providerId: 'pi-cli-default', model: 'gpt-5.6-terra' })
    })

    const turn = conversation.send('hi')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(double.invokeOptions[0]).toEqual({
      preferredProviderId: 'pi-cli-default',
      modelPreference: ['gpt-5.6-terra'],
      metadata: { surface: INTELLIGENCE_HOME_SURFACE, autoContext: true }
    })
  })

  it('sends no routing options when nothing is pinned, leaving the backend to choose', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk, routing: () => ({}) })

    const turn = conversation.send('hi')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    // The surface marker still goes out — it is what separates a user turn from a capability test.
    expect(double.invokeOptions[0]).toEqual({
      metadata: { surface: INTELLIGENCE_HOME_SURFACE, autoContext: true }
    })
  })
})

describe('auto context', () => {
  it('reports the switch as it stands at send time, so a mid-conversation flip applies next turn', async () => {
    const double = createSdkDouble()
    let enabled = true
    const conversation = useHomeConversation({ sdk: double.sdk, autoContext: () => enabled })

    const first = conversation.send('hi')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await first

    enabled = false
    const second = conversation.send('again')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await second

    expect(
      double.invokeOptions.map((options) => (options as IntelligenceInvokeOptions).metadata)
    ).toEqual([
      { surface: INTELLIGENCE_HOME_SURFACE, autoContext: true },
      { surface: INTELLIGENCE_HOME_SURFACE, autoContext: false }
    ])
  })
})

describe('reset and restore', () => {
  it('clears the thread and cancels a turn in flight', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    void conversation.send('hi')
    await flush()
    expect(conversation.isStreaming.value).toBe(true)

    conversation.reset()

    expect(conversation.messages.value).toEqual([])
    expect(conversation.isEmpty.value).toBe(true)
    expect(conversation.isStreaming.value).toBe(false)
    expect(double.cancel).toHaveBeenCalled()
  })

  it('replaces the thread with a stored one', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    conversation.restore([
      { id: 'u1', role: 'user', content: 'stored', status: 'complete' },
      { id: 'a1', role: 'assistant', content: 'reply', status: 'complete' }
    ])

    expect(conversation.messages.value.map((message) => message.content)).toEqual([
      'stored',
      'reply'
    ])
    expect(conversation.isEmpty.value).toBe(false)
  })

  it('gives a new turn an id that cannot collide with restored ones', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    // The two-cancel shape that broke the old counter: dropped assistants
    // leave seq gaps, so `seq = restored.length` re-minted `user-5`.
    conversation.restore([
      { id: 'user-1', role: 'user', content: 'one', status: 'complete' },
      { id: 'assistant-2', role: 'assistant', content: 'reply', status: 'complete' },
      { id: 'user-3', role: 'user', content: 'two', status: 'complete' },
      { id: 'user-5', role: 'user', content: 'three', status: 'complete' }
    ])
    void conversation.send('next')
    await flush()

    const ids = conversation.messages.value.map((message) => message.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mints distinct ids across composable instances', () => {
    // Ids key the shared stream's height cache; two threads minting the same
    // id would inherit each other's measured heights.
    const a = useHomeConversation({ sdk: createSdkDouble().sdk })
    const b = useHomeConversation({ sdk: createSdkDouble().sdk })
    void a.send('hello')
    void b.send('hello')

    const ids = [...a.messages.value, ...b.messages.value].map((message) => message.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sends a restored thread back as provider context', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    conversation.restore([
      { id: 'u1', role: 'user', content: 'stored', status: 'complete' },
      { id: 'a1', role: 'assistant', content: 'reply', status: 'complete' }
    ])
    void conversation.send('next')
    await flush()

    expect(double.streamPayloads[0]?.messages.map((message) => message.content)).toEqual([
      'stored',
      'reply',
      'next'
    ])
  })
})

describe('attachments', () => {
  it('attaches files to the user message without leaking them into the provider payload', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const attachment = { kind: 'image' as const, id: 'att-1', url: 'blob:img', name: 'shot.png' }
    const turn = conversation.send('look at this', [attachment])
    await flush()

    expect(conversation.messages.value[0]?.attachments).toEqual([attachment])

    // `IntelligenceMessage` is `{ role, content }` only — the degrade the PRD asks for
    // holds by construction, so the payload must carry no attachment residue at all.
    const payload = double.streamPayloads[0]
    expect(payload?.messages).toEqual([{ role: 'user', content: 'look at this' }])

    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn
  })

  it('leaves the user message bare when no attachments ride along', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('plain', [])
    await flush()

    expect('attachments' in (conversation.messages.value[0] ?? {})).toBe(false)

    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn
  })
})

describe('part assembly', () => {
  it('assembles reasoning, tool lifecycle and text into ordered parts', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('find the file')
    await flush()
    const handlers = double.emit()

    handlers.onPartEvent?.({ kind: 'reasoning-start' }, { type: 'part', capabilityId: 'text.chat' })
    handlers.onPartEvent?.(
      { kind: 'reasoning-delta', delta: 'thinking about it' },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onPartEvent?.({ kind: 'reasoning-end' }, { type: 'part', capabilityId: 'text.chat' })
    handlers.onPartEvent?.(
      { kind: 'tool-start', callId: 'c1', name: 'tuff_search_files' },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onPartEvent?.(
      { kind: 'tool-input-delta', callId: 'c1', delta: '{"query":' },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onPartEvent?.(
      { kind: 'tool-input-end', callId: 'c1', input: { query: 'report' } },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onPartEvent?.(
      {
        kind: 'tool-result',
        callId: 'c1',
        name: 'tuff_search_files',
        output: '3 hits',
        isError: false
      },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onDelta?.('Found three files.', { type: 'delta', capabilityId: 'text.chat' })
    handlers.onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    const assistant = conversation.messages.value[1]
    expect(assistant?.status).toBe('complete')
    expect(assistant?.content).toBe('Found three files.')

    const parts = assistant?.parts ?? []
    expect(parts.map((part) => part.type)).toEqual(['reasoning', 'tool-call', 'text'])

    expect(parts[0]).toMatchObject({ type: 'reasoning', text: 'thinking about it', done: true })
    expect(parts[1]).toMatchObject({
      type: 'tool-call',
      id: 'c1',
      status: 'done',
      output: '3 hits'
    })
    expect((parts[1] as { input?: string }).input).toContain('"query"')
    // Streaming input logs clear once the input settles.
    expect((parts[1] as { logs?: string }).logs).toBeUndefined()
    expect(parts[2]).toMatchObject({ type: 'text', text: 'Found three files.' })
  })

  it('upgrades to parts mode mid-turn without losing leading text', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    const handlers = double.emit()

    handlers.onDelta?.('Let me check. ', { type: 'delta', capabilityId: 'text.chat' })
    handlers.onPartEvent?.(
      { kind: 'tool-start', callId: 'c9', name: 'read' },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onPartEvent?.(
      { kind: 'tool-result', callId: 'c9', name: 'read', output: 'ok', isError: false },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onDelta?.('Done.', { type: 'delta', capabilityId: 'text.chat' })
    handlers.onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    const parts = conversation.messages.value[1]?.parts ?? []
    expect(parts.map((part) => part.type)).toEqual(['text', 'tool-call', 'text'])
    expect(parts[0]).toMatchObject({ text: 'Let me check. ' })
    expect(parts[2]).toMatchObject({ text: 'Done.' })
  })

  it('flags failed tool results as errors', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('do it')
    await flush()
    const handlers = double.emit()

    handlers.onPartEvent?.(
      { kind: 'tool-start', callId: 'cx', name: 'read' },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onPartEvent?.(
      { kind: 'tool-result', callId: 'cx', name: 'read', output: 'User denied', isError: true },
      { type: 'part', capabilityId: 'text.chat' }
    )
    handlers.onDelta?.('Understood.', { type: 'delta', capabilityId: 'text.chat' })
    handlers.onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(conversation.messages.value[1]?.parts?.[0]).toMatchObject({
      type: 'tool-call',
      status: 'error',
      error: 'User denied'
    })
  })

  it('settles dangling spans when the turn is stopped mid-tool', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    void conversation.send('long task')
    await flush()
    const handlers = double.emit()

    handlers.onDelta?.('Working. ', { type: 'delta', capabilityId: 'text.chat' })
    handlers.onPartEvent?.({ kind: 'reasoning-start' }, { type: 'part', capabilityId: 'text.chat' })
    handlers.onPartEvent?.(
      { kind: 'tool-start', callId: 'c2', name: 'read' },
      { type: 'part', capabilityId: 'text.chat' }
    )
    conversation.stop()
    await flush()

    const parts = conversation.messages.value[1]?.parts ?? []
    const reasoning = parts.find((part) => part.type === 'reasoning')
    const tool = parts.find((part) => part.type === 'tool-call')
    expect(reasoning).toMatchObject({ done: true })
    expect(tool).toMatchObject({ status: 'error', error: 'Interrupted' })
  })

  it('clears parts on retry', async () => {
    const double = createSdkDouble({
      startStream: async () => {
        throw new Error('boom')
      },
      chat: async () => {
        throw new Error('boom')
      }
    })
    const conversation = useHomeConversation({ sdk: double.sdk })

    await conversation.send('will fail')
    expect(conversation.messages.value[1]?.status).toBe('failed')
    conversation.messages.value[1]!.parts = [{ type: 'text', text: 'stale' }]

    void conversation.retry()
    await flush()
    expect(conversation.messages.value[1]?.parts).toBeUndefined()
  })
})

/**
 * `pi` retries a failed message inside the same run and cannot recall the deltas it already sent,
 * so the stream says which text it stands behind: `message-commit` settles a message, `text-reset`
 * withdraws everything since the last one.
 */
describe('withdrawn attempts', () => {
  function events(handlers: IntelligenceStreamOptions<string>) {
    return {
      delta: (text: string) =>
        handlers.onDelta?.(text, { type: 'delta', capabilityId: 'text.chat' }),
      part: (partEvent: IntelligencePartEvent) =>
        handlers.onPartEvent?.(partEvent, { type: 'part', capabilityId: 'text.chat' })
    }
  }

  it('shows only the attempt that survived', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('introduce yourself')
    await flush()
    const emit = events(double.emit())

    emit.delta('I was trained on text. ')
    emit.part({ kind: 'text-reset' })
    emit.delta('I was trained on text and code.')
    emit.part({ kind: 'message-commit' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(conversation.messages.value[1]).toMatchObject({
      content: 'I was trained on text and code.',
      status: 'complete'
    })
  })

  it('keeps the committed text and tool card when the message after them is rewritten', async () => {
    // pi deletes only the last assistant message of the turn. Clearing the bubble instead of
    // rolling back to the last commit would take the lead-in and the tool card with it — and a
    // long answer failing after a tool result is the common way this happens.
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('find the file')
    await flush()
    const emit = events(double.emit())

    emit.delta('Checking. ')
    emit.part({ kind: 'tool-start', callId: 'c1', name: 'read' })
    emit.part({ kind: 'tool-input-end', callId: 'c1', input: { path: '/tmp/x' } })
    emit.part({ kind: 'message-commit' })
    emit.part({ kind: 'tool-result', callId: 'c1', name: 'read', output: 'ok', isError: false })
    emit.delta('half an ans')
    emit.part({ kind: 'text-reset' })
    emit.delta('Done.')
    emit.part({ kind: 'message-commit' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    const assistant = conversation.messages.value[1]
    expect(assistant?.content).toBe('Checking. Done.')

    const parts = assistant?.parts ?? []
    expect(parts.map((part) => part.type)).toEqual(['text', 'tool-call', 'text'])
    expect(parts[0]).toMatchObject({ text: 'Checking. ' })
    expect(parts[1]).toMatchObject({ id: 'c1', status: 'done', output: 'ok' })
    expect(parts[2]).toMatchObject({ text: 'Done.' })
  })

  it('drops the whole message when nothing had been committed yet', async () => {
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('do it')
    await flush()
    const emit = events(double.emit())

    emit.delta('Working. ')
    emit.part({ kind: 'reasoning-start' })
    emit.part({ kind: 'reasoning-delta', delta: 'half a thought' })
    emit.part({ kind: 'text-reset' })
    emit.delta('Answer.')
    emit.part({ kind: 'message-commit' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    const assistant = conversation.messages.value[1]
    expect(assistant?.content).toBe('Answer.')
    // The abandoned reasoning span went with the text it belonged to.
    expect(assistant?.parts?.map((part) => part.type)).toEqual(['text'])
  })

  it('leaves a plain turn out of parts mode, commit or no commit', async () => {
    // Every healthy turn ends in a commit, so treating it as a structured event would put every
    // message into the parts view and change how a plain answer renders.
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hi')
    await flush()
    const emit = events(double.emit())

    emit.delta('Hello.')
    emit.part({ kind: 'message-commit' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(conversation.messages.value[1]?.parts).toBeUndefined()
  })

  it('still falls back to a plain call when every attempt was withdrawn', async () => {
    // The rolled-back deltas are not an answer, so the turn is still eligible for the
    // non-streaming path rather than settling as an empty bubble.
    const double = createSdkDouble()
    const conversation = useHomeConversation({ sdk: double.sdk })

    const turn = conversation.send('hello')
    await flush()
    const emit = events(double.emit())

    emit.part({ kind: 'text-reset' })
    double.emit().onError?.(new Error('[UNKNOWN:text.chat] pi ended the run without an answer'))
    await turn

    expect(double.chatPayloads).toHaveLength(1)
    expect(conversation.messages.value[1]).toMatchObject({
      content: 'fallback reply',
      status: 'complete'
    })
  })
})
