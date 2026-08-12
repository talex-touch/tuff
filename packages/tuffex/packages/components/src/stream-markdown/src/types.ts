import type { Component } from 'vue'

/**
 * A renderable block produced by the incremental stream lexer.
 *
 * `id` is the stable identity across content updates: it is the template key,
 * so a block that keeps its id keeps its DOM node, and only blocks with fresh
 * ids play the reveal animation.
 */
export interface StreamBlock {
  id: number
  type: 'markup' | 'code'
  /** Sanitized HTML for markup blocks; empty string for code blocks. */
  html: string
  /** The exact source slice this block was lexed from. */
  raw: string
  /** Fence language (first word, lowercased); '' for indented or bare fences. */
  lang: string
  /** Inner code text for code blocks. */
  code: string
  /**
   * Whether a fenced block has seen its closing fence. Indented code has no
   * fence and reports false — the component treats any non-tail block as
   * settled regardless.
   */
  fenceClosed: boolean
}

/** Context handed to a registered fenced-block renderer component. */
export interface StreamMarkdownBlockContext {
  lang: string
  code: string
  /** False only for the still-growing tail fence of a streaming document. */
  closed: boolean
  streaming: boolean
  theme: 'light' | 'dark'
}

/** A component rendering a fenced block; receives `StreamMarkdownBlockContext` as props. */
export type StreamMarkdownBlockRenderer = Component

export interface StreamMarkdownProps {
  content: string
  /** Keeps the tail cursor visible and defers tail-fence rendering while true. */
  streaming?: boolean
  /** Sanitizes rendered HTML through dompurify. On by default; keep it on. */
  sanitize?: boolean
  theme?: 'light' | 'dark' | 'auto'
  /** Per-instance fenced-block renderers keyed by language, e.g. `{ mermaid: TxMermaidBlock }`. */
  renderers?: Record<string, StreamMarkdownBlockRenderer>
}
