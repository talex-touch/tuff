// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { IconChipTone } from '../../icon-chip'

export type ContextChunkTone = IconChipTone

export interface ContextChunkSource {
  /** Display name, e.g. `Dairy Onboarding SOP.pdf`. */
  name: string
  /** Short file-type badge, e.g. `PDF`. Omit to drop the badge plate. */
  badge?: string
  /** Badge fill. @default 'neutral' */
  tone?: ContextChunkTone
  /**
   * Makes the row an anchor. The component never navigates on its own — it
   * emits `open` and the host decides, matching `TxSources`.
   */
  href?: string
}

export interface ContextChunk {
  id: string
  title: string
  /** Retrieved text. */
  body?: string
  /**
   * Pre-formatted size line, e.g. `290 characters`. Number formatting is the
   * host's call — this library ships no i18n.
   */
  chars?: string
  source?: ContextChunkSource
}

export interface ContextChunkOpenPayload {
  chunk: ContextChunk
  source: ContextChunkSource
}

export interface ContextChunkProps {
  chunk: ContextChunk
  /**
   * Entrance animation. `false` renders the settled state — use it for lists
   * that re-render often, so existing cards do not re-play.
   * @default true
   */
  appear?: boolean
  /** Delay before the card fades up, in ms. @default 0 */
  enterDelay?: number
  /**
   * Delay before the source chip resolves in, in ms. The gap after the card is
   * deliberate: the chunk lands first, its provenance a beat later.
   * @default 700
   */
  chipDelay?: number
}

export interface ContextChunkEmits {
  /** The source row was activated. Opening the target is the host's job. */
  (e: 'open', payload: ContextChunkOpenPayload): void
}

export interface ContextCardsProps {
  chunks: ContextChunk[]
  /** Header label. @default 'All chunks' */
  title?: string
  /**
   * Header count capsule. This is the size of the whole corpus, **not**
   * `chunks.length` — upstream shows `32` above two rendered chunks. Omit to
   * drop the capsule.
   */
  total?: number | string
  /** @default true */
  appear?: boolean
  /** Per-card entrance stagger, in ms. @default 100 */
  staggerStep?: number
  /** Delay before the first source chip resolves in, in ms. @default 700 */
  chipDelay?: number
  /** Per-card stagger for the source chips, in ms. @default 80 */
  chipStaggerStep?: number
}

export interface ContextCardsEmits {
  (e: 'open', payload: ContextChunkOpenPayload): void
}
