import type { SelectionActionItem, SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import { useSelectionAnchor } from '@talex-touch/tuffex/selection-actions'
import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export interface PassageSelectionOptions {
  /** The scrolling transcript column: the subtree a text selection is scoped to. */
  body: Ref<HTMLElement | null>
  /** The floating bar itself; focusing it must not read as a deselection. */
  bar: Ref<unknown>
  /** The composer field a quoted passage lands in. */
  input: Ref<HTMLTextAreaElement | null>
  draft: Ref<string>
  /** Switching thread retracts the bar. */
  conversationId: Ref<string | null>
  autoGrow: () => void
}

function extractDomNode(value: unknown): Node | null {
  if (value instanceof Node) return value
  if (value && typeof value === 'object') {
    if ('$el' in value && value.$el instanceof Node) return value.$el
    if ('el' in value && value.el instanceof Node) return value.el
  }
  return null
}

/**
 * Highlighting a passage in the transcript raises a bar over it: copy it, or quote it into the
 * composer. The bar is about one passage in one thread, so it must not outlive either.
 */
export function usePassageSelection(options: PassageSelectionOptions) {
  const { t } = useI18n()

  /**
   * A snapshot of what the reader highlighted inside the transcript. Scoped to the
   * scrolling column so a selection in the composer or the side panel never raises the bar,
   * and kept as a snapshot because focusing the bar collapses the live range.
   */
  const { selection: passageSelection, clear: clearPassageSelection } = useSelectionAnchor({
    root: options.body,
    ignore: () => {
      const node = extractDomNode(options.bar.value)
      return node instanceof Element ? [node] : []
    },
    minLength: 2
  })

  const passageActions = computed<SelectionActionItem[]>(() => [
    { id: 'copy', label: t('home.copy') },
    { id: 'quote', label: t('home.quote') }
  ])

  /** Drops the live highlight as well as the snapshot: the bar is gone, the mark should go too. */
  function dismissPassage(): void {
    clearPassageSelection()
    window.getSelection()?.removeAllRanges()
  }

  /** Quotes the passage into the composer as a blockquote, leaving the caret after it. */
  function quotePassage(text: string): void {
    const quoted = text
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    const existing = options.draft.value.replace(/\s+$/, '')
    options.draft.value = existing ? `${existing}\n\n${quoted}\n\n` : `${quoted}\n\n`
    void nextTick(() => {
      const input = options.input.value
      if (!input) return
      input.focus()
      input.selectionStart = input.value.length
      input.selectionEnd = input.value.length
      options.autoGrow()
    })
  }

  async function runPassageAction(payload: {
    id: string
    selection: SelectionPayload
  }): Promise<void> {
    if (payload.id === 'copy') {
      try {
        await navigator.clipboard.writeText(payload.selection.text)
      } catch {
        // A denied clipboard is not worth an error state in the transcript.
      }
    } else if (payload.id === 'quote') {
      quotePassage(payload.selection.text)
    }
    dismissPassage()
  }

  /**
   * The bar is about one passage in one thread, so it must not outlive either:
   * a click anywhere outside the highlight retracts it, and switching
   * conversation retracts it outright. Without this it stayed pinned over the
   * new thread's messages, still holding a snapshot of text that is no longer
   * on screen.
   *
   * `pointerdown`, not `click`: pressing a message's own action button would
   * otherwise collapse the highlight first and the click would land on nothing.
   */
  function onDocumentPointerDown(event: PointerEvent): void {
    if (!passageSelection.value) return
    const target = event.target
    if (!(target instanceof Node)) return
    const barNode = extractDomNode(options.bar.value)
    if (barNode?.contains(target)) return

    // Any press outside the floating bar retracts the previous passage highlight.
    // If the reader starts a new drag, selectionchange will resolve the fresh range.
    dismissPassage()
  }

  function onWindowBlur(): void {
    if (passageSelection.value) {
      dismissPassage()
    }
  }

  function onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && passageSelection.value) {
      dismissPassage()
    }
  }

  function onSelectionChange(): void {
    if (!passageSelection.value) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      clearPassageSelection()
    }
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onDocumentKeyDown)
    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('blur', onWindowBlur)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeyDown)
    document.removeEventListener('selectionchange', onSelectionChange)
    window.removeEventListener('blur', onWindowBlur)
  })
  watch(options.conversationId, () => dismissPassage())

  return { passageSelection, passageActions, runPassageAction }
}
