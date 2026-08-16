// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { AiSourceItem } from '../../ai-elements/src/types'

export interface InlineCitationProps {
  /** The reference this chip points at. Shares `ai-elements`' source shape. */
  source: AiSourceItem
  /** Chip text. Defaults to the source hostname with a leading `www.` stripped. */
  label?: string
  /**
   * Plays the entrance pop. Turn it off when re-rendering a settled answer, so
   * a whole paragraph of citations does not re-pop on every parent update.
   * @default true
   */
  appear?: boolean
}

export interface InlineCitationEmits {
  /** Opening the source is the host's call — the chip never navigates itself. */
  (e: 'open', source: AiSourceItem): void
}
