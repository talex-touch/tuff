import type { StreamController } from '@talex-touch/utils/transport'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceStreamOptions
} from '@talex-touch/utils/types/intelligence'
import type { ComputedRef } from 'vue'
import type { ConversationError } from './conversation-error-display'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
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

export interface ConversationMessage {
  id: string
  role: ConversationRole
  content: string
  status: ConversationMessageStatus
  error?: ConversationError
}

/**
 * The slice of the intelligence SDK this conversation needs. Declared structurally rather than
 * imported wholesale so tests can pass a two-method double instead of stubbing the full domain SDK.
 */
export interface ConversationIntelligenceSdk {
  stream: (
    capabilityId: string,
    payload: IntelligenceChatPayload,
    options: IntelligenceStreamOptions<string>
  ) => Promise<StreamController>
  text: {
    chat: (payload: IntelligenceChatPayload) => Promise<IntelligenceInvokeResult<string>>
  }
}

export interface UseHomeConversationOptions {
  /** Injectable for tests; defaults to the renderer intelligence SDK. */
  sdk?: ConversationIntelligenceSdk
}

export interface UseHomeConversationReturn {
  messages: ComputedRef<ConversationMessage[]>
  isStreaming: ComputedRef<boolean>
  isEmpty: ComputedRef<boolean>
  send: (text: string) => Promise<void>
  stop: () => void
  retry: () => Promise<void>
}

export function useHomeConversation(
  options: UseHomeConversationOptions = {}
): UseHomeConversationReturn {
  const sdk = options.sdk ?? useIntelligenceSdk()
  const messages = ref<ConversationMessage[]>([])
  const streaming = ref(false)

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
    streaming.value = true

    let settle: (() => void) | null = null
    const finished = new Promise<void>((resolve) => {
      settle = resolve
    })

    let settled = false
    let received = false

    const conclude = (): void => {
      settled = true
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
        const result = await sdk.text.chat(payload)
        if (settled) return
        assistant.content = typeof result?.result === 'string' ? result.result : ''
        complete()
      } catch (fallbackError) {
        // The fallback ran the same request without streaming, so its failure describes the
        // request better; the stream error only stands in when the fallback said nothing.
        fail(fallbackError ?? streamError)
      }
    }

    const handlers: IntelligenceStreamOptions<string> = {
      onDelta: (delta) => {
        if (settled || !delta) return
        received = true
        assistant.content += delta
      },
      onEnd: () => {
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
      activeController = await sdk.stream(CHAT_CAPABILITY_ID, payload, handlers)
    } catch (error) {
      // `stream()` rejects when the stream never starts (no stream-capable transport, handshake
      // failure). Nothing was emitted, so the non-streaming path is still worth trying.
      await fallback(error)
      return
    }

    await finished
  }

  async function send(rawText: string): Promise<void> {
    const text = rawText.trim()
    if (!text || streaming.value) return

    messages.value.push(createMessage('user', text, 'complete'))
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
    last.status = 'streaming'

    await runTurn(last)
  }

  function stop(): void {
    activeTurn?.cancel()
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
    send,
    stop,
    retry
  }
}
