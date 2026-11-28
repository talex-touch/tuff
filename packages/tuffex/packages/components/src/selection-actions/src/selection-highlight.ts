export const TX_SELECTION_HIGHLIGHT_NAME = 'tx-selection-actions'

interface HighlightSetLike {
  add: (range: AbstractRange) => unknown
  delete: (range: AbstractRange) => boolean
  size: number
}

interface HighlightRegistryLike {
  get: (name: string) => HighlightSetLike | undefined
  set: (name: string, highlight: HighlightSetLike) => unknown
  delete: (name: string) => boolean
}

function getHighlightEnv(): {
  registry: HighlightRegistryLike
  HighlightCtor: new (...ranges: AbstractRange[]) => HighlightSetLike
} | null {
  if (typeof globalThis === 'undefined')
    return null
  const cssObj = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } }).CSS
  const HighlightCtor = (globalThis as unknown as {
    Highlight?: new (...ranges: AbstractRange[]) => HighlightSetLike
  }).Highlight
  if (!cssObj?.highlights || typeof HighlightCtor !== 'function')
    return null
  return { registry: cssObj.highlights, HighlightCtor }
}

function isLiveRange(range: Range | null | undefined): range is Range {
  if (!range || range.collapsed)
    return false
  const start = range.startContainer
  const end = range.endContainer
  if (!start || !end)
    return false
  if ('isConnected' in start && !start.isConnected)
    return false
  if ('isConnected' in end && !end.isConnected)
    return false
  return true
}

/**
 * Registers a cloned DOM `Range` into the shared `::highlight(tx-selection-actions)`
 * CSS Custom Highlight so selected prose stays visibly tinted even after focus moves
 * into a prompt input (which collapses the browser's native selection highlight).
 *
 * Uses zero DOM mutations, so it is safe on `contenteditable` editors and undo stacks.
 * Returns an idempotent disposer that removes only this range.
 */
export function registerSelectionHighlight(range: Range | null | undefined): () => void {
  const env = getHighlightEnv()
  if (!env || !isLiveRange(range))
    return () => {}

  const { registry, HighlightCtor } = env
  let bucket = registry.get(TX_SELECTION_HIGHLIGHT_NAME)
  if (!bucket) {
    bucket = new HighlightCtor()
    registry.set(TX_SELECTION_HIGHLIGHT_NAME, bucket)
  }
  bucket.add(range)

  let disposed = false
  return () => {
    if (disposed)
      return
    disposed = true
    const current = registry.get(TX_SELECTION_HIGHLIGHT_NAME)
    if (!current)
      return
    current.delete(range)
    if (current.size === 0)
      registry.delete(TX_SELECTION_HIGHLIGHT_NAME)
  }
}
