import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import { resetRemoteImagePolicy } from '@talex-touch/tuffex/stream-markdown'
import type { Ref } from 'vue'
import { nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { prefersReducedMotion } from '~/composables/useSendChoreography'
import { deriveRestoredTitle } from '~/modules/conversation/conversation-title'
import { createLatestOnly } from '~/modules/conversation/latest-only'
import type { UseAgentWorkspaceReturn } from '~/modules/conversation/useAgentWorkspace'
import type { UseConversationHistoryReturn } from '~/modules/conversation/useConversationHistory'
import type { LeavingHead } from './useLeavingHead'

/** The slice of the project store the restore reads and writes. */
export interface RestoreProjectStore {
  readonly pendingProjectId: string | null | undefined
  consumePendingProjectId: () => string | null
  setActiveProjectId: (id: string | null) => void
}

export interface ConversationRestoreOptions {
  browserLanding: () => boolean
  isHomeRoute: Ref<boolean>
  conversationId: Ref<string | null>
  projectId: Ref<string | null>
  generatedTitle: Ref<string | null>
  workspace: Pick<UseAgentWorkspaceReturn, 'prefetch'>
  history: Pick<UseConversationHistoryReturn, 'load'>
  projectStore: RestoreProjectStore
  /** The composer node whose position the dock animation measures. */
  composer: () => HTMLElement | null
  stream: () => TxConversationStreamInstance | null
  focusInput: () => void
  /** Empties the thread the page mirrors. */
  resetConversation: () => void
  /** A send in flight, a lift, an opening hold: all end when the thread underneath changes. */
  invalidateSubmission: () => void
  invalidateChoreography: () => void
  playComposerFlip: (deltaY: number) => void
  measureLeavingHead: () => LeavingHead | null
  pinLeavingHead: (head: LeavingHead | null) => void
  /** The dictation belongs to the thread it started in; the page decides what that means. */
  onThreadChange: (next: string | null, previous: string | null | undefined) => void
}

/**
 * Which thread is on screen, and how the page gets from one to another: `/home` is a blank
 * conversation, `/home/c/:id` restores a stored one, and a project chosen in the sidebar opens a
 * blank one rooted there. Every path that swaps the thread goes through here, so the guards that
 * keep an overlapping load from landing on top of a newer navigation live in one place.
 */
export function useConversationRestore(options: ConversationRestoreOptions) {
  const route = useRoute()
  const { conversationId, projectId, projectStore } = options

  watch(
    projectId,
    (id) => {
      if (options.browserLanding()) return
      projectStore.setActiveProjectId(id)
    },
    { immediate: true }
  )

  /**
   * Consent is per conversation. Carrying it into the next thread would widen it
   * without asking, and the reader has no way to notice that it happened.
   */
  watch(conversationId, () => resetRemoteImagePolicy())

  /**
   * A dictation belongs to the thread it started in: switching threads abandons it where it stands,
   * without writing the draft back. (A first send never trips this — it waits for dictation to end.)
   */
  watch(conversationId, (next, previous) => options.onThreadChange(next, previous))

  /**
   * Which navigation the watcher is currently serving. Two overlapping restores are not sequenced by
   * anything else, so a slower earlier load used to land after a faster later one and leave the URL
   * naming one thread while the view showed another (#826).
   */
  const restoreSequence = createLatestOnly()

  async function resetBlankConversation(nextProjectId: string | null): Promise<void> {
    options.invalidateSubmission()
    conversationId.value = null
    projectId.value = nextProjectId
    const composerEl = options.composer()
    const first = composerEl?.getBoundingClientRect()
    options.resetConversation()
    options.generatedTitle.value = null
    await nextTick()
    if (!options.browserLanding()) options.focusInput()
    if (composerEl && first && !prefersReducedMotion()) {
      const dy = first.top - composerEl.getBoundingClientRect().top
      if (Math.abs(dy) > 8) options.playComposerFlip(dy)
    }
  }

  /**
   * Restores the thread named by `/home/c/:id`, and resets to a blank one on plain `/home`.
   *
   * Watching the param rather than loading once on mount is what makes the sidebar work: navigating
   * between two stored conversations reuses this component instance, so mount never fires again.
   */
  watch(
    () => [route.path, route.params.id] as const,
    async ([path, id]) => {
      if (options.browserLanding() || (path !== '/home' && !path.startsWith('/home/c/'))) return
      const target = typeof id === 'string' ? id : null
      // Claimed before any await, so a plain /home navigation also invalidates a restore in flight -
      // otherwise it would land on top of the blank thread reset() just produced.
      const isCurrentRestore = restoreSequence.claim()
      if (!target) {
        await resetBlankConversation(projectStore.consumePendingProjectId())
        return
      }
      if (target === conversationId.value) return
      options.invalidateSubmission()

      // The record (title, project) and Main's workspace state are read together, so the thread is
      // on screen in the same update that switches to it.
      const [restored] = await Promise.all([
        options.history.load(target),
        options.workspace.prefetch(target)
      ])
      // A newer navigation started while this load was in flight; it owns the view now.
      if (!isCurrentRestore()) return
      if (!restored) return
      // Opening a thread from the blank home docks the composer — the same
      // journey as a first send, so it gets the same measured spring instead
      // of teleporting. Thread-to-thread hops measure ~0 and stay still.
      const composerEl = options.composer()
      const first = composerEl?.getBoundingClientRect()
      const head = options.measureLeavingHead()
      // A send still in the air lands before its thread is swapped out, rather than flying on to a row
      // that is leaving. Not before the same-thread return above: a first send's own navigation to its
      // new id passes through here and must leave its lift alone.
      options.invalidateChoreography()
      // The workspace mirror follows the id: Main's history replaces the stage in the next flush.
      conversationId.value = target
      projectId.value = restored.projectId
      // A stored title that differs from the opening message is a real one; the working-title
      // persist writes the opening message back, and treating that as custom would block
      // generation forever.
      options.generatedTitle.value = deriveRestoredTitle(
        restored.title,
        restored.messages.find((message) => message.role === 'user')?.content
      )
      // Wholesale replacement doesn't trip the stream's prepend anchoring, and keep-alive
      // reuses this instance — landing at the latest message needs an explicit call. The greeting
      // leaves the flow first, so the scroll lands against the stream's final height.
      await nextTick()
      options.pinLeavingHead(head)
      options.stream()?.scrollToBottom()
      if (composerEl && first && !prefersReducedMotion()) {
        const dy = first.top - composerEl.getBoundingClientRect().top
        if (Math.abs(dy) > 8) options.playComposerFlip(dy)
      }
    },
    { immediate: true }
  )

  watch(
    () => projectStore.pendingProjectId,
    async (pendingProjectId) => {
      if (options.browserLanding() || !options.isHomeRoute.value) return
      if (pendingProjectId === undefined || typeof route.params.id === 'string') return
      restoreSequence.claim()
      await resetBlankConversation(projectStore.consumePendingProjectId())
    }
  )

  return { resetBlankConversation }
}
