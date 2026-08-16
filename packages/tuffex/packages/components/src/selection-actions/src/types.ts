// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/**
 * A snapshot of what the reader highlighted.
 *
 * It is a snapshot on purpose: focusing the bar's own input collapses the live
 * selection, so anything derived from `window.getSelection()` at action time
 * would already be gone. Take it once when the bar appears and act on it later.
 */
export interface SelectionPayload {
  /** The highlighted text. */
  text: string
  /** Client rects of the selection, in document order. The last one anchors the bar. */
  rects: DOMRect[]
  /** Cloned range, for a host that needs to write the rewrite back in place. */
  range?: Range
}

export type SelectionActionState = 'idle' | 'thinking' | 'streaming' | 'result'

export interface SelectionActionItem {
  /** `explain` / `improve` / `shorten` / `tone` / `grammar` get a built-in glyph. */
  id: string
  label: string
  /** Fold behind the chevron instead of showing inline. */
  more?: boolean
  /** Present-tense wording while running, e.g. `Improving`. */
  busyLabel?: string
}

export interface SelectionActionsProps {
  /** Null or absent retracts the bar. */
  selection?: SelectionPayload | null
  /**
   * The host owns the machine — this component never calls a model.
   * @default 'idle'
   */
  state?: SelectionActionState
  /** Defaults to Explain / Improve, with Shorten / Tone / Grammar folded away. */
  actions?: SelectionActionItem[]
  /** Id of the action currently running; picks the busy wording. */
  activeActionId?: string
  /** `v-model:expanded` — the folded actions. */
  expanded?: boolean
  /** `v-model:prompt` — the free-text instruction. */
  prompt?: string
  /** Hide the free-text field and its send control. @default false */
  hidePrompt?: boolean
  placeholder?: string
  /** Accessible name of the bar. @default 'Selection actions' */
  ariaLabel?: string
  keepLabel?: string
  discardLabel?: string
  retryLabel?: string
  sendLabel?: string
  expandLabel?: string
  collapseLabel?: string
  /** Busy wording when the running action has none. @default 'Editing' */
  busyLabel?: string
  /** Distance from the last selected line, in px. @default 8 */
  offset?: number
}

export interface SelectionActionsEmits {
  (e: 'action', payload: { id: string, action: SelectionActionItem, selection: SelectionPayload }): void
  (e: 'submit', payload: { prompt: string, selection: SelectionPayload }): void
  (e: 'keep'): void
  (e: 'discard'): void
  (e: 'retry'): void
  (e: 'update:expanded', expanded: boolean): void
  (e: 'update:prompt', prompt: string): void
}
