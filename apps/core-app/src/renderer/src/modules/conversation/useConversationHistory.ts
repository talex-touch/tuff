import type { ConversationMessage } from './useHomeConversation'
import type {
  ConversationRecord,
  ConversationSaveRequest
} from '@talex-touch/utils/transport/sdk/domains/conversation'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createConversationSdk } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { ref, type Ref } from 'vue'

export interface UseConversationHistoryReturn {
  conversations: Ref<ConversationRecord[]>
  loading: Ref<boolean>
  refresh: () => Promise<void>
  load: (id: string) => Promise<ConversationMessage[] | null>
  persist: (id: string, title: string, messages: ConversationMessage[]) => Promise<void>
  remove: (id: string) => Promise<void>
}

/** `crypto.randomUUID` is available in every renderer this ships to; no polyfill path is needed. */
export function createConversationId(): string {
  return crypto.randomUUID()
}

function toSaveRequest(
  id: string,
  title: string,
  messages: ConversationMessage[]
): ConversationSaveRequest {
  return {
    id,
    title,
    /**
     * A streaming placeholder is stored as `failed`, not as `streaming`: the stream cannot survive
     * the write, so a reload would otherwise restore a bubble that waits forever for deltas that
     * will never arrive.
     */
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status === 'streaming' ? 'failed' : message.status,
      meta: message.meta as Record<string, unknown> | undefined
    }))
  }
}

export function useConversationHistory(): UseConversationHistoryReturn {
  const sdk = createConversationSdk(useTuffTransport())
  const conversations = ref<ConversationRecord[]>([])
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      conversations.value = await sdk.list()
    } catch {
      // The sidebar degrades to empty rather than blocking the conversation surface behind it.
      conversations.value = []
    } finally {
      loading.value = false
    }
  }

  async function load(id: string): Promise<ConversationMessage[] | null> {
    const detail = await sdk.get(id)
    if (!detail) return null
    return detail.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      meta: message.meta
    })) as ConversationMessage[]
  }

  async function persist(
    id: string,
    title: string,
    messages: ConversationMessage[]
  ): Promise<void> {
    if (messages.length === 0) return
    await sdk.save(toSaveRequest(id, title, messages))
    await refresh()
  }

  async function remove(id: string): Promise<void> {
    await sdk.remove(id)
    await refresh()
  }

  return { conversations, loading, refresh, load, persist, remove }
}
