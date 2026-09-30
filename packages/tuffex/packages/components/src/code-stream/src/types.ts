// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { StreamRevealPreset } from '../../stream-text/src/types'

/**
 * How a diff row relates to the previous revision.
 *
 * @public
 */
export type CodeDiffKind = 'context' | 'added' | 'removed'

/**
 * One row of a unified diff.
 *
 * @public
 */
export interface CodeDiffRow {
  /** The row's text, without any `+` / `-` marker — the gutter carries that. */
  content: string

  /**
   * @default 'context'
   */
  kind?: CodeDiffKind

  /**
   * Gutter number. A removed row and the added row replacing it normally share
   * one, which is why this is given per row instead of being counted.
   * Omit to leave the gutter blank for that row.
   */
  number?: number
}

export interface CodeStreamProps {
  code: string
  /** Shiki language id. Empty renders unhighlighted, which is always correct. */
  lang?: string
  /** Header filename, mono. */
  filename?: string
  /** Human language label beside the filename, e.g. `TypeScript`. */
  langLabel?: string
  /**
   * Unified diff rows. When present the component renders these instead of
   * `code`, and the header gains an added/removed tally.
   *
   * `code` stays required and is what the copy button yields: copying a diff
   * with its markers stripped produces a file that is neither revision, so the
   * host says explicitly which text is copyable.
   */
  diff?: CodeDiffRow[]
  /**
   * How many lines are revealed. Omit (or pass -1) to show everything — the
   * host owns the cadence, the component owns the transition.
   */
  revealedLines?: number
  /**
   * Streams `code` itself: pass everything received so far and keep this true
   * while the source is live; the component releases it word by word at a
   * steady pace. Setting it at all — `true` or `false` — without
   * `revealedLines` or `diff` is what selects this mode; omit it for a plain
   * listing. `false` shows the code at once and lets `replay()` play it back.
   */
  streaming?: boolean
  /** Streaming mode: how a word enters. @default 'aurora' */
  reveal?: StreamRevealPreset
  /** Streaming mode: release one word every `wordMs`. @default 24 */
  wordMs?: number
  /** Streaming mode: no word shows later than this after it arrived. @default 600 */
  maxLagMs?: number
  /** Streaming mode: once `streaming` turns false, release the rest within this. @default 320 */
  drainMs?: number
  /** Streaming mode: report `paused` after this long without a new word. @default 400 */
  pauseMs?: number
  /**
   * Streaming mode: while complete code plays back, hold its full height so
   * nothing below moves. Ignored while `streaming`.
   */
  reserve?: boolean
  /**
   * Streaming mode: `false` shows each word the moment it arrives, still with
   * its entrance. `TxStreamElement` paces its parts itself and passes `false`.
   * @default true
   */
  paced?: boolean
  /**
   * Streaming mode: code present at mount enters too, instead of showing as
   * it is. `TxStreamElement` sets it on code that mounts mid-answer. Read at
   * mount. @default false
   */
  appear?: boolean
  /**
   * The caret: after the last revealed line in `revealedLines` mode, the
   * stream caret while streaming mode is live. @default true
   */
  caret?: boolean
  /** @default true */
  lineNumbers?: boolean
  /** @default 'auto' — resolved against the document root. */
  theme?: 'light' | 'dark' | 'auto'
  /** @default true */
  copyable?: boolean
  /** @default 'Copy' */
  copyLabel?: string
  /** @default 'Copied' */
  copiedLabel?: string
  /**
   * Floor for the code area. Defaults to the height of the full listing, so a
   * reveal grows into reserved space instead of pushing the page around.
   */
  minHeight?: number | string
}
