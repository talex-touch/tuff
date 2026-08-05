import type { StreamController } from '@talex-touch/utils/transport'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeResult,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { ConversationIntelligenceSdk } from './useHomeConversation'
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
  const chatPayloads: IntelligenceChatPayload[] = []
  const cancel = vi.fn()
  let handlers: IntelligenceStreamOptions<string> | null = null

  const controller: StreamController = { cancel, cancelled: false, streamId: 'stream-double' }

  const sdk: ConversationIntelligenceSdk = {
    stream: async (_capabilityId, payload, options) => {
      streamPayloads.push(payload)
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
