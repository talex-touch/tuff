import type { ConversationMessage } from './useHomeConversation'
import type {
  ConversationRecord,
  ConversationSaveRequest
} from '@talex-touch/utils/transport/sdk/domains/conversation'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createConversationSdk } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { ref, toRaw, type Ref } from 'vue'

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

/** Caps stored tool output/log/text spans so one verbose tool cannot bloat the row. */
const STORED_PART_TEXT_LIMIT = 8 * 1024

/**
 * Parts survive persistence inside `meta.parts`. The JSON round-trip both
 * detaches from the reactive proxies (structuredClone rejects them) and
 * guarantees the payload is plain data; long fields are truncated afterwards.
 */
function toStoredParts(parts: ConversationMessage['parts']): unknown[] | undefined {
  if (!parts || parts.length === 0) return undefined
  const plain = JSON.parse(JSON.stringify(parts)) as Array<Record<string, unknown>>
  for (const part of plain) {
    for (const key of ['text', 'output', 'logs', 'input', 'error'] as const) {
      const value = part[key]
      if (typeof value === 'string' && value.length > STORED_PART_TEXT_LIMIT) {
        part[key] = `${value.slice(0, STORED_PART_TEXT_LIMIT)}…`
      }
    }
  }
  return plain
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
    messages: messages.map((message) => {
      const storedParts = toStoredParts(message.parts)
      // `toRaw`: reading `meta` off a reactive message returns a Proxy, and the transport's
      // structuredClone rejects proxies — every save would fail. The spread keeps the stored
      // object detached from the live one.
      const meta =
        message.meta || storedParts
          ? ({
              ...(message.meta ? toRaw(message.meta) : {}),
              ...(storedParts ? { parts: storedParts } : {})
            } as Record<string, unknown>)
          : undefined
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status === 'streaming' ? 'failed' : message.status,
        meta
      }
    })
  }
}

/**
 * Module-scoped on purpose: HomePage persists while ShellConversationList
 * renders, and both must read the same list — per-call refs would leave the
 * sidebar stale after every send, since `persist` refreshes only its own copy.
 */
const conversations = ref<ConversationRecord[]>([])
const loading = ref(false)

export function useConversationHistory(): UseConversationHistoryReturn {
  const sdk = createConversationSdk(useTuffTransport())

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
    return detail.messages.map((message) => {
      // Parts ride inside meta for storage; pull them back out so the meta the
      // side panel reads stays the plain turn metadata it always was.
      const { parts, ...meta } = (message.meta ?? {}) as Record<string, unknown>
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status,
        meta: Object.keys(meta).length ? meta : undefined,
        ...(Array.isArray(parts) && parts.length > 0 ? { parts } : {})
      }
    }) as ConversationMessage[]
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
