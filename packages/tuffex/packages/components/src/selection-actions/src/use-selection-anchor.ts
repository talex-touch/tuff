// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// Upstream has no selection tracking at all — its "selection" is a hardcoded
// highlighted span. This is the real-document counterpart, kept separate from
// TxSelectionActions so a host on contenteditable, a virtual list or an iframe
// can feed the bar its own payload instead.
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { SelectionPayload } from './types'
import { useTextSelection } from '@vueuse/core'
import { onBeforeUnmount, ref, toValue, watch } from 'vue'

export interface ResolveSelectionInput {
  text: string
  ranges: Range[]
  /** Only report selections contained by this element. */
  root?: Element | null
  /** Selections shorter than this are ignored. */
  minLength: number
}

function isInside(range: Range, root: Element | null | undefined): boolean {
  if (!root)
    return true

  const node = range.commonAncestorContainer
  return root === node || root.contains(node)
}

/**
 * The whole decision in one pure function: what counts as a selection worth
 * anchoring to, and what the bar gets handed. Exported so the rules can be
 * tested without standing up a live `Selection`.
 */
export function resolveSelectionPayload(input: ResolveSelectionInput): SelectionPayload | null {
  const text = input.text ?? ''
  if (text.trim().length < Math.max(1, input.minLength))
    return null

  const range = input.ranges.find(item => !item.collapsed)
  if (!range || !isInside(range, input.root))
    return null

  const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 || rect.height > 0)
  if (rects.length === 0)
    return null

  // Clone before anything can collapse the live range.
  return { text, rects, range: range.cloneRange() }
}

export interface UseSelectionAnchorOptions {
  /** Confine tracking to one subtree. Omit to watch the whole document. */
  root?: MaybeRefOrGetter<Element | null | undefined>
  /**
   * Settle time for the `selectionchange` stream, in ms. Dragging a selection
   * fires it on every frame. @default 120
   */
  debounce?: number
  /** Minimum trimmed length worth acting on. @default 1 */
  minLength?: number
  /** Stop reporting without unmounting. */
  disabled?: MaybeRefOrGetter<boolean>
  /**
   * Elements whose focus must not count as a deselection — normally the bar
   * itself. Focusing its text field collapses the selection, and without this
   * the bar would retract the instant someone started typing into it.
   */
  ignore?: MaybeRefOrGetter<Array<Element | null | undefined>>
}

export interface UseSelectionAnchorReturn {
  selection: Ref<SelectionPayload | null>
  /** Drop the snapshot — call it once the rewrite has been applied or dropped. */
  clear: () => void
}

export function useSelectionAnchor(options: UseSelectionAnchorOptions = {}): UseSelectionAnchorReturn {
  const { text, ranges } = useTextSelection()
  const selection = ref<SelectionPayload | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function holdsFocus(): boolean {
    if (typeof document === 'undefined')
      return false

    const active = document.activeElement
    if (!active)
      return false

    return (toValue(options.ignore) ?? []).some(element => element && (element === active || element.contains(active)))
  }

  function resolve(): void {
    if (toValue(options.disabled)) {
      selection.value = null
      return
    }

    const next = resolveSelectionPayload({
      text: text.value,
      ranges: ranges.value,
      root: toValue(options.root),
      minLength: options.minLength ?? 1,
    })

    // A collapse while the bar owns focus is the bar's own doing, not the
    // reader walking away — keep the snapshot so the action still has a target.
    if (!next && holdsFocus())
      return

    selection.value = next
  }

  watch([text, ranges], () => {
    cancel()
    timer = setTimeout(resolve, options.debounce ?? 120)
  })

  onBeforeUnmount(cancel)

  return {
    selection,
    clear: () => {
      cancel()
      selection.value = null
    },
  }
}
