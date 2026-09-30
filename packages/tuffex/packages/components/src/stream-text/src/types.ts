import type { AiSourceItem } from '../../ai-elements/src/types'

/**
 * How a streamed word enters. `aurora` (the default) fades it in out of a 4px
 * blur while its colour sweeps blue → violet → pink onto the ink; `hue` is the
 * same sweep without the blur; `blur` drops the colour; `languid` is a slow
 * 900ms rise out of an 8px blur; `none` shows words as they are released.
 */
export type StreamRevealPreset = 'aurora' | 'hue' | 'blur' | 'languid' | 'none'

/**
 * Where a stream is. `idle`: nothing shown and nothing arriving. `streaming`:
 * words are arriving or being released. `paused`: still streaming, but nothing
 * new for `pauseMs`. `draining`: the source has finished and the backlog is
 * being released. `done`: everything is shown and the source has finished.
 */
export type StreamState = 'idle' | 'streaming' | 'paused' | 'draining' | 'done'

export type StreamMark = 'strong' | 'em' | 'del' | 'code'

/** One inline run of a streamed text. */
export type StreamInline =
  | {
    type: 'text'
    text: string
    marks?: StreamMark[]
    /** Rendered as a link only for http(s), mailto, tel, relative and hash URLs. */
    href?: string
  }
  | {
    type: 'citation'
    source: AiSourceItem
    label?: string
    /** The marker's number (`[2]` → 2), passed on to the `citation` slot. */
    index?: number
  }
  | {
    /** Rendered by the `inline` slot, which receives `name` and `props`. */
    type: 'custom'
    name: string
    props?: Record<string, unknown>
  }

export interface StreamTextProps {
  /** Everything received so far: plain text, or inline runs. */
  content: string | StreamInline[]
  /** The source is still producing. While true the last word waits for its end. */
  streaming?: boolean
  /** Release one word every `wordMs`. @default 24 */
  wordMs?: number
  /** Speed up so the display never trails the source by more than this. @default 600 */
  maxLagMs?: number
  /** Once `streaming` turns false, release the backlog within this. @default 320 */
  drainMs?: number
  /** Report `paused` after this long without a new word while streaming. @default 400 */
  pauseMs?: number
  /** @default 'aurora' */
  reveal?: StreamRevealPreset
  /** Show the stream caret while streaming. @default true */
  caret?: boolean
  /**
   * Hold the final layout while a complete content plays back (`replay()`), so
   * nothing reflows. Ignored while `streaming`, when the final text is unknown.
   * @default false
   */
  reserve?: boolean
  /**
   * Pace the release. `false` shows each word as it arrives (still animated):
   * `TxStreamElement` paces all of its parts on one clock and passes `false`.
   * @default true
   */
  paced?: boolean
  /**
   * Content present at mount enters too, instead of showing as it is.
   * `TxStreamElement` sets it on parts that mount mid-answer. Read at mount.
   * @default false
   */
  appear?: boolean
  /** Root element. @default 'span' */
  tag?: string
  /** Word segmentation locale for `Intl.Segmenter`. @default 'zh' */
  locale?: string
}

export interface StreamTextEmits {
  (e: 'state-change', state: StreamState): void
  /** Once per play-through, when the last word is shown and the source has finished. */
  (e: 'done'): void
  /** A citation chip was opened. */
  (e: 'cite', source: AiSourceItem): void
}

export interface StreamCaretProps {
  /** Exposed as `data-state` for styling; the caret looks the same in every live state. */
  state?: StreamState
}
