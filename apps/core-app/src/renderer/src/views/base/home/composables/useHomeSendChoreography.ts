import type { ComputedRef, Ref } from 'vue'
import type { LiftOverlay } from '~/composables/useSendChoreography'
import type { UseAgentWorkspaceReturn } from '~/modules/conversation/useAgentWorkspace'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { UseSendStateReturn } from './useSendState'
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { prefersReducedMotion, useSendChoreography } from '~/composables/useSendChoreography'
import { useConversationLoading } from '~/modules/conversation/useConversationLoading'
import { deriveSendState, isAwaitingFirstToken } from '../composer/send-state'

export interface UseHomeSendChoreographyOptions {
  browserLanding: () => boolean
  isHomeRoute: Ref<boolean>
  isEmpty: Ref<boolean>
  isStreaming: Ref<boolean>
  messages: ComputedRef<ConversationMessage[]>
  conversationId: Ref<string | null>
  draft: Ref<string>
  browserNavigating: Ref<boolean>
  dictationActive: () => boolean
  workspace: Pick<UseAgentWorkspaceReturn, 'loading' | 'loadError' | 'busy' | 'state'>
  pendingTool: () => unknown
  submitState: UseSendStateReturn
  host: () => HTMLElement | null
  composerGroup: () => HTMLElement | null
  composer: () => HTMLElement | null
  liftOverlay: () => LiftOverlay | null
}

/**
 * Coordinates Home's send readiness/state derivation, sidebar loading indicator sync, WAAPI send
 * choreography lifecycle, and appended-message entrance triggers.
 */
export function useHomeSendChoreography(options: UseHomeSendChoreographyOptions) {
  const route = useRoute()
  const { setConversationLoading } = useConversationLoading()

  watch(
    [
      () => (typeof route.params.id === 'string' ? route.params.id : options.conversationId.value),
      options.isStreaming,
      options.submitState.sending
    ],
    ([id, streaming, isSending]) => {
      if (id) setConversationLoading(id, Boolean(streaming || isSending))
    },
    { immediate: true }
  )

  const canSend = computed(
    () =>
      options.draft.value.trim().length > 0 &&
      options.isHomeRoute.value &&
      (typeof route.params.id !== 'string' || route.params.id === options.conversationId.value) &&
      !options.dictationActive() &&
      !options.submitState.sending.value &&
      !options.browserNavigating.value &&
      !options.workspace.loading.value &&
      !options.workspace.loadError.value
  )

  const sendQueues = computed(
    () => options.workspace.busy.value || (options.workspace.state.value?.queue.length ?? 0) > 0
  )

  const sendState = computed(() =>
    deriveSendState({
      hasText: options.draft.value.trim().length > 0,
      streaming: options.isStreaming.value,
      awaitingFirstToken: isAwaitingFirstToken(options.messages.value.at(-1)),
      blocked: Boolean(options.pendingTool()) || Boolean(options.workspace.state.value?.pendingRun),
      dictating: options.dictationActive()
    })
  )

  const composerBeamActive = computed(
    () =>
      !options.browserLanding() &&
      options.isHomeRoute.value &&
      options.isEmpty.value &&
      !options.isStreaming.value &&
      !options.dictationActive()
  )

  const choreography = useSendChoreography({
    host: options.host,
    scroller: () =>
      options.host()?.querySelector<HTMLElement>('.tx-conversation-stream__scroller') ?? null,
    composerGroup: options.composerGroup,
    composer: options.composer,
    liftOverlay: options.liftOverlay
  })

  onBeforeUnmount(() => {
    choreography.cancel()
  })

  watch(
    () => options.messages.value.length,
    (length, previous) => {
      const claimed = options.submitState.consumeChoreographedSend()
      if (!options.isStreaming.value || prefersReducedMotion()) return
      const appended = options.messages.value.slice(previous ?? 0, length)
      choreography.markEntering(appended.map((message) => message.id))
      if (claimed && appended.some((message) => message.role === 'user')) return
      void nextTick(() => {
        for (const message of appended) {
          choreography.playEntrance(message.id, message.role === 'user' ? 0.8 : 0.6)
        }
      })
    }
  )

  return {
    choreography,
    enteringMessages: choreography.enteringMessages,
    canSend,
    sendQueues,
    sendState,
    composerBeamActive,
    setConversationLoading
  }
}
