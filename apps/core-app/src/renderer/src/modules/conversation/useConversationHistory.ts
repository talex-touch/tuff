import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { Ref } from 'vue'
import type { ConversationMessage } from './useHomeConversation'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  ConversationEvents,
  createConversationSdk
} from '@talex-touch/utils/transport/sdk/domains/conversation'
import { ref } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'

export interface UseConversationHistoryReturn {
  conversations: Ref<ConversationRecord[]>
  loading: Ref<boolean>
  refresh: () => Promise<void>
  /**
   * Title rides along because a stored custom title (#969) has to survive restore: HomePage
   * recomputes the working title from the opening message, and without the stored one the top bar
   * and the sidebar would disagree after a reload.
   */
  load: (
    id: string
  ) => Promise<{ title: string; messages: ConversationMessage[]; projectId: string | null } | null>
  /**
   * Retitles a stored conversation without touching its messages — the only write Home makes to a
   * thread Main owns, so a title upgrade can never overwrite the history with an older snapshot.
   */
  rename: (id: string, title: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

const conversationHistoryLog = createRendererLogger('ConversationHistory')

/** `crypto.randomUUID` is available in every renderer this ships to; no polyfill path is needed. */
export function createConversationId(): string {
  return crypto.randomUUID()
}

/**
 * Module-scoped on purpose: HomePage refreshes after Main settles a turn while
 * ShellConversationList renders, and both must read the same list — per-call refs
 * would leave the sidebar stale, since `refresh` updates only its own copy.
 */
const conversations = ref<ConversationRecord[]>([])
const loading = ref(false)

let conversationChangeCleanup: (() => void) | null = null
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

  if (!conversationChangeCleanup) {
    conversationChangeCleanup = useTuffTransport().on(ConversationEvents.changed, (event) => {
      if (event.source === 'sync') void refresh()
    })
  }

  async function load(
    id: string
  ): Promise<{ title: string; messages: ConversationMessage[]; projectId: string | null } | null> {
    let detail: Awaited<ReturnType<typeof sdk.get>>
    try {
      detail = await sdk.get(id)
    } catch (error) {
      // Degrades to "nothing to restore", the same policy refresh() already uses. Without this the
      // rejection escaped through HomePage's async route watcher, where Vue can only log it as an
      // unhandled rejection (#827).
      conversationHistoryLog.error(`Failed to load conversation ${id}`, error)
      return null
    }
    if (!detail) return null
    // Threads stored while ids were per-conversation counters can carry
    // duplicates (a dropped turn plus the restore-time reseed re-minted an
    // id). Ids key the stream's `v-for` and its height cache, where a
    // duplicate corrupts the keyed diff — suffix survivors once on the way
    // in; the next persist then stores the repaired ids.
    const seen = new Set<string>()
    const messages = detail.messages.map((message) => {
      let messageId = message.id
      while (seen.has(messageId)) messageId = `${messageId}-r`
      seen.add(messageId)
      // Parts ride inside meta for storage; pull them back out so the meta the
      // side panel reads stays the plain turn metadata it always was.
      const { parts, ...meta } = (message.meta ?? {}) as Record<string, unknown>
      return {
        id: messageId,
        role: message.role,
        content: message.content,
        status: message.status,
        meta: Object.keys(meta).length ? meta : undefined,
        ...(Array.isArray(parts) && parts.length > 0 ? { parts } : {})
      }
    }) as ConversationMessage[]
    return { title: detail.title ?? '', messages, projectId: detail.projectId }
  }

  async function rename(id: string, title: string): Promise<void> {
    await sdk.rename(id, title)
    await refresh()
  }

  async function remove(id: string): Promise<void> {
    await sdk.remove(id)
    await refresh()
  }

  return { conversations, loading, refresh, load, rename, remove }
}
