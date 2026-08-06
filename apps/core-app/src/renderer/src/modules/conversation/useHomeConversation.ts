import type { AiAttachment, AiMessagePart, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { StreamController } from '@talex-touch/utils/transport'
import type {
  IntelligenceChatPayload,
  IntelligenceHomeSurfaceMetadata,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligencePartEvent,
  IntelligenceStreamOptions,
  IntelligenceUsageInfo
} from '@talex-touch/utils/types/intelligence'
import type { ComputedRef } from 'vue'
import type { ConversationError } from './conversation-error-display'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import {
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  resolveConversationError
} from './conversation-error-display'

/**
 * `text.chat` is registered as `IntelligenceCapabilityType.CHAT`, and main's
 * `resolveCapabilityMethod` only hands out `chatStream` for the `chat` type — every other
 * capability id falls back to a non-streaming method, so this is the one id that can stream.
 */
const CHAT_CAPABILITY_ID = 'text.chat'

export type ConversationRole = 'user' | 'assistant'
export type ConversationMessageStatus = 'complete' | 'streaming' | 'failed'

/**
 * What the backend reported about the turn that produced a message. Everything here arrives on the
 * stream events themselves, so recording it costs nothing extra and is what the side panel shows.
 */
export interface ConversationTurnMeta {
  provider?: string
  model?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  latencyMs?: number
}

export interface ConversationMessage {
  id: string
  role: ConversationRole
  content: string
  status: ConversationMessageStatus
  error?: ConversationError
  meta?: ConversationTurnMeta
  /**
   * UI-only for now: providers take a plain string (`IntelligenceMessage.content`), so
   * `toProviderMessages` never reads this, and `toSaveRequest`'s explicit field mapping never
   * stores it — the degrade the PRD asks for holds by construction, not by filtering.
   */
  attachments?: AiAttachment[]
  /**
   * Heterogeneous content assembled from stream part events (reasoning spans,
   * tool calls) interleaved with text. `content` stays the plain-text
   * concatenation — the provider context, title source and fallback rendering.
   */
  parts?: AiMessagePart[]
}

/** Provider / model the next turn should run on, as chosen in the model pill. */
export interface ConversationRouting {
  providerId?: string
  model?: string
}

/**
 * The slice of the intelligence SDK this conversation needs. Declared structurally rather than
 * imported wholesale so tests can pass a two-method double instead of stubbing the full domain SDK.
 */
export interface ConversationIntelligenceSdk {
  stream: (
    capabilityId: string,
    payload: IntelligenceChatPayload,
    options: IntelligenceStreamOptions<string>,
    invokeOptions?: IntelligenceInvokeOptions
  ) => Promise<StreamController>
  text: {
    chat: (
      payload: IntelligenceChatPayload,
      options?: IntelligenceInvokeOptions
    ) => Promise<IntelligenceInvokeResult<string>>
  }
}

export interface UseHomeConversationOptions {
  /** Injectable for tests; defaults to the renderer intelligence SDK. */
  sdk?: ConversationIntelligenceSdk
  /** Read at send time, not at setup, so changing the model mid-conversation takes effect. */
  routing?: () => ConversationRouting | undefined
  /**
   * Whether main may add the user's imported skills and rules to this turn — the composer's Auto
   * Context switch. A getter for the same reason routing is one, and defaulted on to match
   * `appSetting.tools.autoContext`.
   */
  autoContext?: () => boolean
}

export interface UseHomeConversationReturn {
  messages: ComputedRef<ConversationMessage[]>
  isStreaming: ComputedRef<boolean>
  isEmpty: ComputedRef<boolean>
  /** Metadata of the most recent settled assistant turn, for the side panel. */
  lastTurn: ComputedRef<ConversationTurnMeta | undefined>
  send: (text: string, attachments?: AiAttachment[]) => Promise<void>
  stop: () => void
  retry: () => Promise<void>
  /** Drops the thread and cancels any turn in flight — used when navigating to a blank `/home`. */
  reset: () => void
  /** Replaces the thread with a stored one. */
  restore: (restored: ConversationMessage[]) => void
}

export function useHomeConversation(
  options: UseHomeConversationOptions = {}
): UseHomeConversationReturn {
  const sdk = options.sdk ?? useIntelligenceSdk()
  const messages = ref<ConversationMessage[]>([])
  const streaming = ref(false)

  function resolveInvokeOptions(): IntelligenceInvokeOptions {
    const routing = options.routing?.()
    const metadata: IntelligenceHomeSurfaceMetadata = {
      surface: INTELLIGENCE_HOME_SURFACE,
      autoContext: options.autoContext?.() !== false
    }
    // The surface marker rides every turn, pinned model or not: it is what tells main this is a
    // user conversation rather than a capability test running on the same `text.chat` id.
    return {
      ...(routing?.providerId ? { preferredProviderId: routing.providerId } : {}),
      ...(routing?.model ? { modelPreference: [routing.model] } : {}),
      metadata
    }
  }

  let activeController: StreamController | null = null
  let activeTurn: { cancel: () => void } | null = null
  let messageSeq = 0

  function createMessage(
    role: ConversationRole,
    content: string,
    status: ConversationMessageStatus
  ): ConversationMessage {
    messageSeq += 1
    return { id: `${role}-${messageSeq}`, role, content, status }
  }

  /**
   * Only settled turns are context. A `streaming` placeholder is empty by definition and a `failed`
   * one never carried an answer, so sending either would teach the model that blanks are valid
   * replies.
   */
  function toProviderMessages(): IntelligenceMessage[] {
    return messages.value
      .filter((message) => message.status === 'complete')
      .map((message) => ({ role: message.role, content: message.content }))
  }

  function dropMessage(target: ConversationMessage): void {
    const index = messages.value.findIndex((message) => message.id === target.id)
    if (index >= 0) {
      messages.value.splice(index, 1)
    }
  }

  async function runTurn(assistant: ConversationMessage): Promise<void> {
    const payload: IntelligenceChatPayload = { messages: toProviderMessages() }
    const invokeOptions = resolveInvokeOptions()
    const startedAt = Date.now()
    streaming.value = true

    /**
     * Merged rather than replaced: provider and model land on the first event, usage only on the
     * last, and a later event that omits a field must not erase what an earlier one reported.
     */
    const recordMeta = (patch: ConversationTurnMeta): void => {
      const next: ConversationTurnMeta = { ...(assistant.meta ?? {}) }
      // Only defined values are copied. Spreading the patch wholesale would let an `end` event that
      // omits `provider` overwrite the one `start` reported, blanking the side panel on completion.
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          ;(next as Record<string, unknown>)[key] = value
        }
      }
      assistant.meta = next
    }

    const recordUsage = (usage: IntelligenceUsageInfo | undefined): void => {
      if (!usage) return
      recordMeta({
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens
      })
    }

    // ------------------------------------------------------------------
    // Part assembly. Stream part events interleave with text deltas; each
    // handler mutates the reactive message so the view tracks every update.
    // ------------------------------------------------------------------

    const ensureParts = (): AiMessagePart[] => (assistant.parts ??= [])
    let reasoningStartedAt: number | null = null

    const appendTextPart = (delta: string): void => {
      const parts = ensureParts()
      const last = parts[parts.length - 1]
      if (last?.type === 'text') {
        last.text += delta
      } else {
        parts.push({ type: 'text', text: delta })
      }
    }

    const findOpenReasoning = () => {
      const parts = ensureParts()
      for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index]
        if (part?.type === 'reasoning' && !part.done) return part
      }
      return undefined
    }

    const findToolCall = (callId: string): AiToolCallPart | undefined => {
      const parts = ensureParts()
      for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index]
        if (part?.type === 'tool-call' && part.id === callId) return part
      }
      return undefined
    }

    const handlePartEvent = (event: IntelligencePartEvent): void => {
      const parts = ensureParts()
      switch (event.kind) {
        case 'reasoning-start':
          reasoningStartedAt = Date.now()
          parts.push({ type: 'reasoning', text: '', done: false })
          break
        case 'reasoning-delta': {
          const reasoning = findOpenReasoning()
          if (reasoning) reasoning.text += event.delta
          break
        }
        case 'reasoning-end': {
          const reasoning = findOpenReasoning()
          if (reasoning) {
            reasoning.done = true
            reasoning.durationMs =
              event.durationMs ??
              (reasoningStartedAt !== null ? Date.now() - reasoningStartedAt : undefined)
          }
          reasoningStartedAt = null
          break
        }
        case 'tool-start':
          parts.push({ type: 'tool-call', id: event.callId, name: event.name, status: 'running' })
          break
        case 'tool-input-delta': {
          const tool = findToolCall(event.callId)
          // Streaming argument JSON doubles as the "live" log line until the
          // input settles.
          if (tool) tool.logs = (tool.logs ?? '') + event.delta
          break
        }
        case 'tool-input-end': {
          const tool = findToolCall(event.callId)
          if (tool) {
            tool.input =
              typeof event.input === 'string' ? event.input : JSON.stringify(event.input, null, 2)
            tool.logs = undefined
          }
          break
        }
        case 'tool-result': {
          const tool = findToolCall(event.callId)
          if (tool) {
            tool.status = event.isError ? 'error' : 'done'
            if (event.isError) tool.error = event.output
            else tool.output = event.output
          }
          break
        }
      }
    }

    let settle: (() => void) | null = null
    const finished = new Promise<void>((resolve) => {
      settle = resolve
    })

    let settled = false
    let received = false

    const conclude = (): void => {
      settled = true
      // A turn can end (complete, fail or cancel) with spans still open — a
      // reasoning block mid-thought or a tool that never reported back. Leaving
      // them "active" would render spinners on a dead turn forever.
      for (const part of assistant.parts ?? []) {
        if (part.type === 'reasoning' && !part.done) part.done = true
        if (part.type === 'tool-call' && (part.status === 'running' || part.status === 'pending')) {
          part.status = 'error'
          part.error = 'Interrupted'
        }
      }
      recordMeta({ latencyMs: Date.now() - startedAt })
      activeController = null
      activeTurn = null
      streaming.value = false
      settle?.()
    }

    const complete = (): void => {
      if (settled) return
      if (assistant.content.trim()) {
        assistant.status = 'complete'
      } else {
        // A stream that ends without text leaves an empty bubble, which reads as a frozen UI.
        assistant.status = 'failed'
        assistant.error = { code: CONVERSATION_ERROR_EMPTY_RESPONSE, detail: '' }
      }
      conclude()
    }

    const fail = (error: unknown): void => {
      if (settled) return
      assistant.status = 'failed'
      assistant.error = resolveConversationError(error)
      conclude()
    }

    /**
     * Streaming fails in ways plain invocation survives — a provider without `chatStream` raises
     * before the first delta. Retrying after deltas landed would duplicate them into the same
     * message, so the zero-delta condition is what makes this safe, not the error's shape.
     */
    const fallback = async (streamError: unknown): Promise<void> => {
      try {
        const result = await sdk.text.chat(payload, invokeOptions)
        if (settled) return
        assistant.content = typeof result?.result === 'string' ? result.result : ''
        recordMeta({ provider: result?.provider, model: result?.model })
        recordUsage(result?.usage)
        complete()
      } catch (fallbackError) {
        // The fallback ran the same request without streaming, so its failure describes the
        // request better; the stream error only stands in when the fallback said nothing.
        fail(fallbackError ?? streamError)
      }
    }

    const handlers: IntelligenceStreamOptions<string> = {
      onStart: (event) => {
        recordMeta({ provider: event.provider, model: event.model })
      },
      onDelta: (delta, event) => {
        if (settled || !delta) return
        received = true
        assistant.content += delta
        // Only messages that carry structured parts maintain the parallel
        // parts view — a plain text turn stays a plain `content` string.
        if (assistant.parts) appendTextPart(delta)
        // The routed backend can only name the effective provider once it has picked one, which for
        // a fallback chain is after the first delta rather than at `start`.
        if (!assistant.meta?.model) recordMeta({ provider: event.provider, model: event.model })
      },
      onPartEvent: (partEvent) => {
        if (settled) return
        received = true
        // The first structured event upgrades the message to parts mode; the
        // text accumulated so far becomes the leading text part.
        if (!assistant.parts && assistant.content) {
          assistant.parts = [{ type: 'text', text: assistant.content }]
        }
        handlePartEvent(partEvent)
      },
      onUsage: (usage) => {
        recordUsage(usage)
      },
      onEnd: (event) => {
        recordMeta({ provider: event?.provider, model: event?.model })
        recordUsage(event?.usage)
        complete()
      },
      onError: (error) => {
        if (settled) return
        if (received) {
          fail(error)
          return
        }
        void fallback(error)
      }
    }

    activeTurn = {
      cancel: () => {
        if (settled) return
        activeController?.cancel()
        if (assistant.content.trim()) {
          assistant.status = 'complete'
        } else {
          // Cancelled before anything arrived — an empty bubble is worse than no bubble.
          dropMessage(assistant)
        }
        conclude()
      }
    }

    try {
      activeController = await sdk.stream(CHAT_CAPABILITY_ID, payload, handlers, invokeOptions)
    } catch (error) {
      // `stream()` rejects when the stream never starts (no stream-capable transport, handshake
      // failure). Nothing was emitted, so the non-streaming path is still worth trying.
      await fallback(error)
      return
    }

    await finished
  }

  async function send(rawText: string, attachments?: AiAttachment[]): Promise<void> {
    const text = rawText.trim()
    if (!text || streaming.value) return

    const user = createMessage('user', text, 'complete')
    if (attachments && attachments.length > 0) user.attachments = attachments
    messages.value.push(user)
    messages.value.push(createMessage('assistant', '', 'streaming'))

    // Mutating the pushed object directly would bypass the array's reactive proxy, so the streaming
    // deltas would never reach the view. Read the placeholder back to get the tracked instance.
    const assistant = messages.value[messages.value.length - 1]
    if (!assistant) return

    await runTurn(assistant)
  }

  async function retry(): Promise<void> {
    if (streaming.value) return

    const last = messages.value[messages.value.length - 1]
    if (!last || last.role !== 'assistant' || last.status !== 'failed') return

    last.content = ''
    last.error = undefined
    last.parts = undefined
    last.status = 'streaming'

    await runTurn(last)
  }

  function stop(): void {
    activeTurn?.cancel()
  }

  /**
   * Cancels before clearing, in both cases: a turn left running would keep appending deltas to a
   * message that is no longer in the list, and its `conclude` would flip `streaming` back off under
   * whatever thread had replaced it.
   */
  function discardActiveTurn(): void {
    activeController?.cancel()
    activeController = null
    activeTurn = null
    streaming.value = false
  }

  function reset(): void {
    discardActiveTurn()
    messages.value = []
  }

  function restore(restored: ConversationMessage[]): void {
    discardActiveTurn()
    messages.value = restored.map((message) => ({ ...message }))
    // Ids come back from storage, so the counter has to clear them or a new turn would collide.
    messageSeq = restored.length
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      activeController?.cancel()
      activeController = null
      activeTurn = null
    })
  }

  return {
    messages: computed(() => messages.value),
    isStreaming: computed(() => streaming.value),
    isEmpty: computed(() => messages.value.length === 0),
    lastTurn: computed(() => {
      for (let index = messages.value.length - 1; index >= 0; index -= 1) {
        const message = messages.value[index]
        if (message?.role === 'assistant' && message.meta) return message.meta
      }
      return undefined
    }),
    send,
    stop,
    retry,
    reset,
    restore
  }
}
