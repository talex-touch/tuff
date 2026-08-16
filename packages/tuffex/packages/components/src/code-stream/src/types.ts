// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export interface CodeStreamProps {
  code: string
  /** Shiki language id. Empty renders unhighlighted, which is always correct. */
  lang?: string
  /** Header filename, mono. */
  filename?: string
  /** Human language label beside the filename, e.g. `TypeScript`. */
  langLabel?: string
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
