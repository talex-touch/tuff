import type { ModelRef } from './model-display'
import { computed, type ComputedRef } from 'vue'
import { readRecentModels, toModelRef, writableConversationSettings } from './conversation-settings'
import { sameModelRef } from './model-display'

/** How many picks the model menu's 「最近使用」 keeps (`home-composer` › 最近使用). */
export const RECENT_MODELS_LIMIT = 5

export interface UseRecentModelsReturn {
  /** The most recent picks, newest first, at most `RECENT_MODELS_LIMIT`, invalid entries dropped. */
  recents: ComputedRef<ModelRef[]>
  /** Moves a pick to the front; the list stays deduplicated and bounded. Auto is never recorded. */
  record: (ref: ModelRef) => void
}

/**
 * The model menu's 「最近使用」, read straight from `appSetting.conversation.recentModels` so both
 * pills (the composer's and the top bar's) see the same list. It replaced the hand-curated star
 * filter: the models someone keeps switching between rise to the top on their own. A recent pick
 * whose provider is currently absent is kept in storage; the menu resolves the list against the
 * loaded choices and simply does not show it until it is on offer again.
 */
export function useRecentModels(): UseRecentModelsReturn {
  const recents = computed<ModelRef[]>(() => readRecentModels().slice(0, RECENT_MODELS_LIMIT))

  function record(ref: ModelRef): void {
    const next = [
      toModelRef(ref),
      ...readRecentModels().filter((known) => !sameModelRef(known, ref))
    ].slice(0, RECENT_MODELS_LIMIT)
    // Replacing the array, rather than splicing the stored one, also drops any malformed entries
    // the read side was already ignoring.
    writableConversationSettings().recentModels = next
  }

  return { recents, record }
}
