import type { Component } from 'vue'
import type { AiSourceItem } from '../../ai-elements/src/types'
import type { StreamMarkdownProps } from '../../stream-markdown/src/types'
import type { StreamInline, StreamRevealPreset, StreamState } from '../../stream-text/src/types'

/** One item of a list part. */
export interface StreamListItem {
  /** A task item's box: `true` / `false`; absent for a plain item. */
  checked?: boolean
  parts: StreamPart[]
}

/**
 * The blocks a `TxStreamElement` streams. Markdown `content` parses into these;
 * hosts that already hold structure pass them as `parts` directly.
 */
export type StreamPart =
  | { type: 'heading', depth: 1 | 2 | 3 | 4 | 5 | 6, inlines: StreamInline[] }
  /** `tight`: a line of a tight list item, without a paragraph's margins. */
  | { type: 'paragraph', inlines: StreamInline[], tight?: boolean }
  | { type: 'list', ordered: boolean, start?: number, items: StreamListItem[] }
  | { type: 'quote', parts: StreamPart[] }
  | { type: 'rule' }
  | { type: 'code', lang?: string, code: string, filename?: string }
  /** Markdown the element does not render itself (tables, math, mermaid, HTML, images), handed whole to `TxStreamMarkdown`. */
  | { type: 'markdown', raw: string }
  /** Anything else: rendered by the `part-<name>` slot or `renderers[name]`. */
  | { type: 'custom', name: string, props?: Record<string, unknown> }

export interface StreamElementProps {
  /** Markdown: everything received so far. */
  content?: string
  /** Structured alternative to `content`; wins over it. */
  parts?: StreamPart[]
  /** The source is still producing. */
  streaming?: boolean
  /** Resolves `[n]` markers in text into citation chips (`sources[n - 1]`). */
  sources?: AiSourceItem[]
  /** Release one word every `wordMs`. @default 24 */
  wordMs?: number
  /** No word shows later than this after it arrived. @default 600 */
  maxLagMs?: number
  /** Once `streaming` turns false, release the rest within this. @default 320 */
  drainMs?: number
  /** Report `paused` after this long without a new word. @default 400 */
  pauseMs?: number
  /** How a word enters. @default 'aurora' */
  reveal?: StreamRevealPreset
  /** Shows the stream caret at the write head while live. @default true */
  caret?: boolean
  /** Holds the final layout with an invisible copy while complete content plays back. @default false */
  reserve?: boolean
  /** Components for custom parts, by name; the `part-<name>` slot wins over them. */
  renderers?: Record<string, Component>
  /** Forwarded to the `TxStreamMarkdown` blocks that render delegated parts. */
  markdownProps?: Partial<StreamMarkdownProps>
  /** Word segmentation locale for `Intl.Segmenter`. @default 'zh' */
  locale?: string
}

export interface StreamElementEmits {
  'state-change': [state: StreamState]
  /** Once per play-through, when the last word is shown and the source has finished. */
  'done': []
  /** A citation chip was opened. */
  'cite': [source: AiSourceItem]
}
