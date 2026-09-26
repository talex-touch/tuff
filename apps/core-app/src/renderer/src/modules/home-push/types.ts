import type { ChoiceOption, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import type { LocalAiSessionTarget } from '~/modules/conversation/local-ai-session-entry'

/** The guide's first-page categories, in display order (see `HOME_GUIDE_CATEGORY_IDS`). */
export type HomeGuideCategoryId = 'work' | 'files' | 'writing' | 'research' | 'automation'

/**
 * What choosing a card row does. The pure builders attach one to every row; `useHomePush` runs it.
 *
 * - `choose-category` — guide page 1: remember the category and turn to page 2.
 * - `send` — a starter task: the text goes through the composer's normal send path.
 * - `focus-composer` — 「我自己说」: nothing is written, the composer takes focus.
 * - `prefill` — the clipboard row: the text lands in the composer, focused, and is never sent for
 *   the user — they see exactly what would go out first.
 * - `open-conversation` / `continue-session` / `enter-project` — navigation, no text involved.
 */
export type HomePushAction =
  | { kind: 'choose-category'; category: HomeGuideCategoryId }
  | { kind: 'send'; text: string }
  | { kind: 'focus-composer' }
  | { kind: 'prefill'; text: string }
  | { kind: 'open-conversation'; conversationId: string }
  | { kind: 'continue-session'; session: LocalAiSessionTarget }
  | { kind: 'enter-project'; projectId: string }

/** A card row plus what choosing it does. The action never reaches the card component. */
export interface HomePushOption extends ChoiceOption {
  action: HomePushAction
}

export interface HomePushStep extends ChoiceStep {
  options: HomePushOption[]
}

/**
 * Which card the blank conversation shows: the two-page guide when there is no history to work
 * from, 「为你准备」 once there is (and the guide again whenever that list comes out empty).
 */
export type HomePushMode = 'guide' | 'feed'
