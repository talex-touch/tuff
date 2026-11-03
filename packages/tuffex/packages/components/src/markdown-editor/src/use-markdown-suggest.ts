import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { MarkdownEmoji } from './emoji'
import type { RichSurface } from './rich-surface'
import type { MarkdownEditorSelection } from './types'
import type { MarkdownBox } from './use-markdown-overlay'
import { computed, nextTick, shallowRef } from 'vue'
import { composeMarkdownEmoji, markdownEmojiText, peekMarkdownEmoji, rememberMarkdownEmoji, searchMarkdownEmoji } from './emoji'
import { shortcodeBefore } from './markdown-selection'
import { boxIn, virtualReference } from './use-markdown-overlay'

/**
 * `:shortcode` completion on the rich surface. The source mode completes
 * through CodeMirror's own autocompletion.
 */

export interface MarkdownSuggestOptions {
  /** The rich surface, while completion applies to it: active, editable, emoji on. */
  surface: () => RichSurface | null
  /** The element the list is anchored in. */
  page: () => HTMLElement | null
  track: (selection: MarkdownEditorSelection) => MarkdownEditorSelection
  untrack: (range: MarkdownEditorSelection) => void
  /** Asks for the emoji index, which loads on first use. */
  load: () => void
  /** The host's custom emoji packs, searched alongside the built-in set. */
  packs: () => readonly TxEmojiPack[] | undefined
  /** The list's anchor moved. */
  reposition: () => void
}

interface SuggestState {
  /** The `:query` being completed, kept in step with edits. */
  range: MarkdownEditorSelection
  query: string
  items: MarkdownEmoji[]
  active: number
}

export function useMarkdownSuggest(options: MarkdownSuggestOptions) {
  const suggest = shallowRef<SuggestState | null>(null)
  const box = shallowRef<MarkdownBox | null>(null)
  const reference = virtualReference(options.page, () => box.value)

  const open = computed({
    get: () => suggest.value !== null,
    set: (value: boolean) => {
      if (!value)
        close()
    },
  })

  function close(): void {
    if (!suggest.value)
      return
    options.untrack(suggest.value.range)
    suggest.value = null
  }

  /** After typing (`typed`) a list may open; a moved caret only refines or closes an open one. */
  function update(typed: boolean): void {
    const surface = options.surface()
    if (!surface || surface.isComposing) {
      close()
      return
    }
    const before = surface.textBeforeCaret()
    if (typed && before?.text.endsWith(':'))
      options.load()
    const query = before ? shortcodeBefore(before.text) : null
    const base = peekMarkdownEmoji()
    const index = base ? composeMarkdownEmoji(base, options.packs()) : null
    const items = before && query && index && (typed || suggest.value) ? searchMarkdownEmoji(index, query, 8) : []
    if (!before || !query || !items.length) {
      close()
      return
    }
    const start = before.offset - query.length - 1
    const [from, to] = surface.textRange(before.node, start, before.offset)
    const kept = suggest.value?.query === query ? suggest.value.active : 0
    if (suggest.value)
      options.untrack(suggest.value.range)
    suggest.value = { range: options.track({ anchor: from, head: to }), query, items, active: Math.min(kept, items.length - 1) }
    // Anchored at the colon, so the list stays put while the query grows.
    const range = before.node.ownerDocument.createRange()
    range.setStart(before.node, start)
    range.setEnd(before.node, before.offset)
    const measured = range.getBoundingClientRect()
    const rect = measured.height > 0 ? measured : surface.selectionRect()
    const page = options.page()
    box.value = page && rect ? boxIn(page, rect) : null
    void nextTick(options.reposition)
  }

  /** The surface's keydown, while a list is open; true when the list took it. */
  function keydown(event: KeyboardEvent): boolean {
    const state = suggest.value
    if (!state || event.isComposing)
      return false
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey
    if (plain && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const step = event.key === 'ArrowDown' ? 1 : -1
      suggest.value = { ...state, active: (state.active + step + state.items.length) % state.items.length }
      return true
    }
    if (plain && !event.shiftKey && (event.key === 'Enter' || event.key === 'Tab')) {
      pick(state.active)
      return true
    }
    if (event.key === 'Escape') {
      close()
      return true
    }
    return false
  }

  function pick(position: number): void {
    const item = suggest.value?.items[position]
    const surface = options.surface()
    if (!item || !surface)
      return
    surface.flush()
    // Read after the flush: it may have moved the range.
    const range = suggest.value?.range
    close()
    if (!range)
      return
    const text = markdownEmojiText(item)
    rememberMarkdownEmoji(text)
    surface.replaceRange(range.anchor, range.head, text)
  }

  function hover(position: number): void {
    if (suggest.value)
      suggest.value = { ...suggest.value, active: position }
  }

  return { suggest, open, reference, close, update, keydown, pick, hover }
}
