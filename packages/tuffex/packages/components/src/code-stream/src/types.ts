// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

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
  /** Draws the accent caret after the last revealed line. @default true */
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
