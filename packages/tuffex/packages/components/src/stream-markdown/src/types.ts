import type { Component } from 'vue'
import type { StreamRevealPreset } from '../../stream-text/src/types'

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

/** A settled markup fence the host is asked to show, when inline preview is off. */
export interface StreamMarkdownCodePreview {
  lang: string
  code: string
  /** Markup for a frame with `sandbox=""` as its `srcdoc`; nothing in it runs. */
  srcdoc: string
}

export interface StreamMarkdownProps {
  content: string
  /** Keeps the tail cursor visible and defers tail-fence rendering while true. */
  streaming?: boolean
  /**
   * How newly streamed text enters: the StreamElement family's presets.
   * `languid` loses its rise here, because a streamed chunk runs across words
   * and has to stay inline. @default 'aurora'
   */
  reveal?: StreamRevealPreset
  /** Shows the Tuff caret at the write head while streaming. @default true */
  caret?: boolean
  /** Sanitizes rendered HTML through dompurify. On by default; keep it on. */
  sanitize?: boolean
  theme?: 'light' | 'dark' | 'auto'
  /** Per-instance fenced-block renderers keyed by language, e.g. `{ mermaid: TxMermaidBlock }`. */
  renderers?: Record<string, StreamMarkdownBlockRenderer>
  /**
   * Holds back remote images until the reader asks for them. On by default: an
   * image fetches without a click, so an unreviewed `src` reports the reader's
   * IP to whoever wrote the markdown.
   */
  blockRemoteImages?: boolean
  /**
   * Placeholder wording. TuffEx carries no i18n, so the host passes localized
   * strings and these English defaults are the fallback.
   */
  blockedImageText?: string
  loadImageOnceText?: string
  allowSessionImagesText?: string
  copyTableText?: string
  copiedTableText?: string
  /**
   * Wording of the built-in fence renderers, `TxCodeBlock` and `TxMermaidBlock`,
   * and handed only to them: any other renderer receives
   * `StreamMarkdownBlockContext` alone. Unset, each keeps its English default.
   */
  codePreviewText?: string
  codeSourceText?: string
  /**
   * Renders a settled HTML, SVG or XML fence's preview below its header. Off, the
   * preview button emits `code-preview` with the markup and the host shows it.
   * @default true
   */
  inlineCodePreview?: boolean
  /** Builds the code preview frame's accessible name. @default (lang) => `${lang} preview` */
  codeFrameLabelFormatter?: (lang: string) => string
  copyCodeText?: string
  copiedCodeText?: string
  diagramZoomLabel?: string
  diagramPreviewLabel?: string
  diagramCloseLabel?: string
  diagramErrorText?: string
  diagramDownloadLabel?: string
  diagramCopyFailedText?: string
}
