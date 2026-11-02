import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { useTurnFooterState } from '@talex-touch/intelligence-uikit/utils'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { appSetting } from '~/modules/storage/app-storage'

/** Settings are host-owned; the kit owns footer presentation timing. */
export function useTurnMetrics(messages: ComputedRef<ConversationMessage[]>) {
  const showTurnMetrics = computed(() => appSetting.conversation?.showTurnMetrics !== false)
  return { showTurnMetrics, ...useTurnFooterState(messages) }
}
