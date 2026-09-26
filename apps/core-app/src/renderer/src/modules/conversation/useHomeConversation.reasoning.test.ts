import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceStreamEvent,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { StreamController } from '@talex-touch/utils/transport'
import type { ReasoningEffortSetting } from '@talex-touch/utils/intelligence/reasoning-effort'
import type { ConversationIntelligenceSdk } from './useHomeConversation'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it, vi } from 'vitest'
import { useHomeConversation } from './useHomeConversation'

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => {
    throw new Error('tests must inject a conversation SDK double')
  }
}))

/**
 * The composer's reasoning effort on the send path: on the request only when chosen, the same on
 * the non-streaming fallback, and the decision main reports kept on the turn as flat fields.
 */

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface Double {
  sdk: ConversationIntelligenceSdk
  streamOptions: IntelligenceInvokeOptions[]
  chatOptions: IntelligenceInvokeOptions[]
  emit: () => IntelligenceStreamOptions<string>
}

function createDouble(
  overrides: {
    startStream?: () => Promise<StreamController>
    chat?: () => Promise<IntelligenceInvokeResult<string>>
  } = {}
): Double {
  const streamOptions: IntelligenceInvokeOptions[] = []
  const chatOptions: IntelligenceInvokeOptions[] = []
  let handlers: IntelligenceStreamOptions<string> | null = null
  const controller: StreamController = { cancel: vi.fn(), cancelled: false, streamId: 'stream' }
  return {
    streamOptions,
    chatOptions,
    sdk: {
      stream: async (_capabilityId, _payload: IntelligenceChatPayload, options, invokeOptions) => {
        streamOptions.push(invokeOptions ?? {})
        handlers = options
        return overrides.startStream ? overrides.startStream() : controller
      },
      text: {
        chat: async (_payload, invokeOptions) => {
          chatOptions.push(invokeOptions ?? {})
          if (overrides.chat) return overrides.chat()
          throw new Error('no fallback expected')
        }
      }
    },
    emit: () => {
      if (!handlers) throw new Error('stream() has not been called yet')
      return handlers
    }
  }
}

function conversationWith(double: Double, effort: () => ReasoningEffortSetting | undefined) {
  return useHomeConversation({ sdk: double.sdk, reasoningEffort: effort })
}

describe('reasoning effort on the request', () => {
  it('puts nothing on the request on auto — the exact pre-setting shape', async () => {
    const double = createDouble()
    const conversation = conversationWith(double, () => 'auto')

    const turn = conversation.send('hi')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(double.streamOptions[0]).toEqual({
      metadata: {
        surface: INTELLIGENCE_HOME_SURFACE,
        operation: INTELLIGENCE_HOME_SURFACE,
        autoContext: true
      }
    })
  })

  it('carries a chosen level, read at send time', async () => {
    const double = createDouble()
    let effort: ReasoningEffortSetting = 'high'
    const conversation = conversationWith(double, () => effort)

    const first = conversation.send('first')
    await flush()
    double.emit().onDelta?.('a', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await first

    effort = 'low'
    const second = conversation.send('second')
    await flush()
    double.emit().onDelta?.('b', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await second

    expect(double.streamOptions.map((options) => options.reasoningEffort)).toEqual(['high', 'low'])
  })

  it('never forwards a value the setting does not know', async () => {
    const double = createDouble()
    const conversation = conversationWith(double, () => 'extreme' as ReasoningEffortSetting)

    const turn = conversation.send('hi')
    await flush()
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await turn

    expect(double.streamOptions[0]).not.toHaveProperty('reasoningEffort')
  })

  it('carries the same level on the non-streaming fallback', async () => {
    const double = createDouble({
      startStream: async () => {
        throw new Error('no stream-capable transport')
      },
      chat: async () => ({
        result: 'fallback reply',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'gpt-5.5',
        latency: 1,
        traceId: 'trace',
        provider: 'openai',
        reasoningEffort: { requested: 'max', applied: 'xhigh', status: 'applied' }
      })
    })
    const conversation = conversationWith(double, () => 'max')

    await conversation.send('hi')

    expect(double.chatOptions[0]?.reasoningEffort).toBe('max')
    expect(conversation.lastTurn.value).toMatchObject({
      reasoningRequested: 'max',
      reasoningApplied: 'xhigh',
      reasoningStatus: 'applied'
    })
  })
})

describe('the decision on the turn', () => {
  it('records start, then lets end replace it whole', async () => {
    const double = createDouble()
    const conversation = conversationWith(double, () => 'high')

    const turn = conversation.send('hi')
    await flush()
    double.emit().onStart?.({
      type: 'start',
      capabilityId: 'text.chat',
      provider: 'openai',
      reasoningEffort: { requested: 'high', applied: 'high', status: 'applied' }
    })
    expect(conversation.messages.value[1]?.meta).toMatchObject({
      reasoningRequested: 'high',
      reasoningApplied: 'high',
      reasoningStatus: 'applied'
    })

    double.emit().onDelta?.('ok', { type: 'delta', capabilityId: 'text.chat' })
    // A fallback provider that took no effort: the level `start` named must not survive.
    double.emit().onEnd?.({
      type: 'end',
      capabilityId: 'text.chat',
      provider: 'siliconflow',
      reasoningEffort: { requested: 'high', applied: null, status: 'unsupported-provider' }
    })
    await turn

    const meta = conversation.lastTurn.value
    expect(meta).toMatchObject({
      reasoningRequested: 'high',
      reasoningStatus: 'unsupported-provider'
    })
    expect(meta).not.toHaveProperty('reasoningApplied')
  })

  it('ignores a malformed decision and stores only primitives', async () => {
    const double = createDouble()
    const conversation = conversationWith(double, () => 'high')

    const turn = conversation.send('hi')
    await flush()
    // "Applied" with nothing applied: a record that contradicts itself is not half-recorded.
    const malformed = {
      type: 'start',
      capabilityId: 'text.chat',
      reasoningEffort: { requested: 'high', applied: null, status: 'applied' }
    } as unknown as IntelligenceStreamEvent<string>
    double.emit().onStart?.(malformed)
    expect(conversation.messages.value[1]?.meta ?? {}).not.toHaveProperty('reasoningStatus')
    double.emit().onDelta?.('ok', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({
      type: 'end',
      capabilityId: 'text.chat',
      reasoningEffort: { requested: 'high', applied: 'high', status: 'applied' }
    })
    await turn

    const meta = conversation.lastTurn.value
    expect(meta).toMatchObject({
      reasoningRequested: 'high',
      reasoningApplied: 'high',
      reasoningStatus: 'applied'
    })
    // What the history save does to a message's meta: it must survive structured cloning.
    expect(() => structuredClone({ ...meta })).not.toThrow()
    for (const value of Object.values(meta ?? {})) expect(typeof value).not.toBe('object')
  })

  it("drops a retried turn's old decision when the retry runs on auto", async () => {
    const double = createDouble()
    let effort: ReasoningEffortSetting = 'high'
    const conversation = conversationWith(double, () => effort)

    const turn = conversation.send('hi')
    await flush()
    double.emit().onStart?.({
      type: 'start',
      capabilityId: 'text.chat',
      reasoningEffort: { requested: 'high', applied: 'high', status: 'applied' }
    })
    double.emit().onDelta?.('partial', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onError?.(new Error('provider dropped the stream'))
    await turn
    expect(conversation.messages.value[1]?.status).toBe('failed')

    effort = 'auto'
    const retry = conversation.retry()
    await flush()
    double.emit().onDelta?.('fresh', { type: 'delta', capabilityId: 'text.chat' })
    double.emit().onEnd?.({ type: 'end', capabilityId: 'text.chat' })
    await retry

    const meta = conversation.lastTurn.value ?? {}
    expect(meta).not.toHaveProperty('reasoningRequested')
    expect(meta).not.toHaveProperty('reasoningStatus')
    expect(double.streamOptions[1]).not.toHaveProperty('reasoningEffort')
  })
})
