import type { UseConversationHistoryReturn } from '~/modules/conversation/useConversationHistory'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  findTitleExchange,
  generateConversationTitle,
  shouldGenerateTitle
} from '~/modules/conversation/conversation-title'
import type { TitleChatSdk } from '~/modules/conversation/conversation-title'
import { createLatestOnly } from '~/modules/conversation/latest-only'
import { homeLog } from './home-log'

export interface ConversationTitleOptions {
  messages: ComputedRef<ConversationMessage[]>
  conversationId: Ref<string | null>
  /** True while Main runs a turn; the title is considered when it settles. */
  busy: () => boolean
  history: Pick<UseConversationHistoryReturn, 'rename' | 'refresh'>
  sdk: TitleChatSdk
}

/**
 * The opening message is the working title until the model summarises one (#969).
 *
 * Generation is once per conversation, after the first settled turn, and every failure keeps the
 * working title silently — the label is never worth an error surface. `generatedTitle` also carries
 * a stored custom title across restore, so the top bar agrees with the sidebar after a reload.
 */
export function useConversationTitle(options: ConversationTitleOptions) {
  const { t } = useI18n()

  const generatedTitle = ref<string | null>(null)
  /**
   * Which conversation has a title call in flight — an id, not a boolean. This component instance is
   * reused across thread switches, so a flat flag set by conversation A would make conversation B's
   * settled turn skip its own generation window.
   */
  let titleInFlightFor: string | null = null
  const titleSequence = createLatestOnly()
  const titleFailedFor = new Set<string>()

  const firstUserContent = computed(
    () => options.messages.value.find((message) => message.role === 'user')?.content
  )
  const conversationTitle = computed(() => generatedTitle.value ?? firstUserContent.value)

  /**
   * Fire-and-forget: Main created the conversation with its working title, so the thread is durable
   * before the summary call even starts, and a rename upgrades the label when the call lands. A rename
   * carries no messages, so however late it lands it cannot shrink the history Main holds. Claimed
   * against `titleSequence` so switching threads mid-call drops the result instead of stamping it onto
   * the wrong conversation.
   */
  function maybeGenerateTitle(): void {
    // The first reply to the user — never the Home opening a thread can start with, which would
    // title the conversation after the greeting instead of what was asked.
    const firstAssistant = findTitleExchange(options.messages.value).firstAssistantContent
    const idAtStart = options.conversationId.value
    if (!idAtStart) return
    if (
      !shouldGenerateTitle({
        generatedTitle: generatedTitle.value,
        inFlight: titleInFlightFor === idAtStart,
        firstUserContent: firstUserContent.value,
        firstAssistantContent: firstAssistant,
        failed: titleFailedFor.has(idAtStart)
      })
    ) {
      return
    }
    const isCurrent = titleSequence.claim()
    titleInFlightFor = idAtStart
    void (async () => {
      try {
        const title = await generateConversationTitle(
          options.sdk,
          firstUserContent.value ?? '',
          firstAssistant ?? '',
          {
            prompt: t('home.titleGen.prompt'),
            userLabel: t('home.titleGen.userLabel'),
            assistantLabel: t('home.titleGen.assistantLabel')
          }
        )
        if (!title) {
          titleFailedFor.add(idAtStart)
          return
        }
        if (!isCurrent() || options.conversationId.value !== idAtStart) return
        generatedTitle.value = title
        await options.history.rename(idAtStart, title)
      } catch (error) {
        titleFailedFor.add(idAtStart)
        // The working title is already on screen and stored; a label upgrade may fail silently.
        homeLog.warn('Conversation title generation failed', String(error))
      } finally {
        if (titleInFlightFor === idAtStart) titleInFlightFor = null
      }
    })()
  }

  /**
   * Once Main settles a turn the title may be generated. Main persisted the turn itself — this page
   * never writes the thread back, so a stale window can no longer overwrite what Main recorded.
   */
  watch(options.busy, (busy, wasBusy) => {
    if (busy || !wasBusy || !options.conversationId.value) return
    maybeGenerateTitle()
    // The sidebar's order and timestamps follow the turn that just ended.
    void options.history.refresh()
  })

  return { generatedTitle, conversationTitle, firstUserContent }
}
