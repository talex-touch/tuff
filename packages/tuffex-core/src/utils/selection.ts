import type { ShallowRef } from '@vue/reactivity'
import { shallowRef } from '@vue/reactivity'
import { hasDocument, hasWindow } from './env'

export interface TextSelectionTracker {
  text: ShallowRef<string>
  ranges: ShallowRef<Range[]>
  selection: ShallowRef<Selection | null>
  sync: () => void
  destroy: () => void
}

function getRangesFromSelection(selection: Selection | null): Range[] {
  if (!selection)
    return []
  const ranges: Range[] = []
  for (let i = 0; i < selection.rangeCount; i++) {
    ranges.push(selection.getRangeAt(i))
  }
  return ranges
}

/**
 * Framework-agnostic native `selectionchange` tracker backed by `@vue/reactivity`.
 * Drop-in replacement for `@vueuse/core`'s `useTextSelection`.
 */
export function createTextSelectionTracker(doc?: Document | null): TextSelectionTracker {
  const targetDoc = doc ?? (hasDocument() ? document : null)
  const selection = shallowRef<Selection | null>(null)
  const text = shallowRef('')
  const ranges = shallowRef<Range[]>([])

  function sync(): void {
    const win = targetDoc?.defaultView ?? (hasWindow() ? window : null)
    const current = win?.getSelection?.() ?? null
    selection.value = current
    text.value = current?.toString() ?? ''
    ranges.value = getRangesFromSelection(current)
  }

  const onSelectionChange = () => {
    sync()
  }

  if (targetDoc) {
    sync()
    targetDoc.addEventListener('selectionchange', onSelectionChange)
  }

  function destroy(): void {
    if (targetDoc)
      targetDoc.removeEventListener('selectionchange', onSelectionChange)
  }

  return {
    text,
    ranges,
    selection,
    sync,
    destroy,
  }
}
