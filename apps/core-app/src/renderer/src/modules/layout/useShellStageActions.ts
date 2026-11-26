import type { ConversationTurnMeta } from '~/modules/conversation/useHomeConversation'
import { computed, shallowRef } from 'vue'

export type ShellStageActionSurface = 'home' | 'herdr'

export interface ShellStageActionsHandle {
  /** Which route family owns these controls, so a KeepAlive page can never bleed onto another route. */
  surface: ShellStageActionSurface
  isPanelOpen: () => boolean
  togglePanel: () => void
  showTurnInfo?: () => boolean
  getTurn?: () => ConversationTurnMeta | undefined
  getMessageCount?: () => number
  canBranch?: () => boolean
  isBranching?: () => boolean
  branch?: () => void
}

const activeHandle = shallowRef<ShellStageActionsHandle | null>(null)

/**
 * Shared reactive bridge between the active conversation stage (`HomePage` or
 * `HerdrConversationStage`) and `BrowserTabStrip`, so stage-level trailing controls (branch,
 * turn-info `⋯` menu, right-sidebar toggle) live in the top tab strip without duplicating a
 * second header bar underneath.
 */
export function useShellStageActions() {
  function register(handle: ShellStageActionsHandle): () => void {
    activeHandle.value = handle
    return () => {
      if (activeHandle.value === handle) {
        activeHandle.value = null
      }
    }
  }

  return {
    activeHandle: computed(() => activeHandle.value),
    register
  }
}

export function __resetShellStageActionsForTesting(): void {
  activeHandle.value = null
}
