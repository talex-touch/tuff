import type { MaybeRefOrGetter } from 'vue'
import type { FlipRect } from './flip-layout'
import { nextTick, toValue, watch } from 'vue'
import { playFlip } from './flip-layout'

/**
 * FLIP for the CoreBox result list (design G).
 *
 * A streamed batch or a refresh re-ranks the list in one DOM update; without this, the rows under an
 * insertion jump down at once. Rows are read before the update (pre-flush) and, once it has landed,
 * the ones that existed and moved play from where they were with a translate. New rows are not
 * animated: they are there at once and opaque, as ready results must be.
 *
 * - Only rows on screen or within one viewport of it are read, so a long list costs a handful of
 *   rect reads, not one per row.
 * - Positions are measured against the list container, not the window: a scroll between the two
 *   reads (a new query scrolls back to the top) is not a move.
 * - The play runs after the whole flush (`nextTick` from the pre-flush capture), so whatever lands in
 *   post-flush watchers, such as the selection block, is in place before the rects are compared.
 * - A batch that lands while the previous one's slides still run restarts those rows from where
 *   they are drawn, not from where they rest.
 *
 * Rows opt in with `data-flip-key`. flip-layout's `playFlip` does the animating, with its
 * non-overshooting ease-out and this module's shorter duration.
 */

/** Short enough to finish before the next streamed batch usually lands. */
export const LIST_FLIP_DURATION_MS = 160

/** Sub-pixel differences are layout rounding, not a move; `computeFlipDelta` ignores them too. */
const MIN_MOVE_PX = 0.5

/**
 * Something that sits on a row and must travel with it through the FLIP: the selection block.
 * It is a flip participant itself (`data-flip-key`, `data-flip="move"`) whose resting position is
 * not held in `transform`, so the FLIP's `transform` composes on top of it.
 */
export interface ListFlipFollower {
  /** The follower element, inside the list. Never read as a row, shown or not. */
  element: () => HTMLElement | null
  /** The flip-keyed row it sits on; null while it shows nothing, when it does not travel. */
  row: () => HTMLElement | null
}

export interface ListFlipOptions {
  /** The list; its children carrying `data-flip-key` are the rows. */
  container: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The scrolling viewport, which decides which rows are near enough to read. */
  viewport: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The results; a new array is an update. */
  items: () => readonly unknown[]
  /** The setting that turns list motion on (`resultTransition`, off on low battery). */
  enabled: () => boolean
  /** The motion gate: false under reduced motion or on low battery. */
  shouldAnimate: () => boolean
  /** Played with the delta of the row it sits on. */
  follower?: ListFlipFollower
  duration?: number
}

interface PendingListFlip {
  container: HTMLElement
  /** The container's box at capture; rows are compared against it, not against the window. */
  origin: FlipRect
  rects: Map<string, FlipRect>
}

function readRect(el: Element): FlipRect {
  const rect = el.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * Cancels the slides a previous FLIP left running on `el`. Only script animations: a CSS animation
 * or transition carries the `animationName` / `transitionProperty` it comes from, and is left alone.
 */
function cancelSlides(el: HTMLElement): void {
  if (typeof el.getAnimations !== 'function') return
  for (const animation of el.getAnimations()) {
    if (!('animationName' in animation) && !('transitionProperty' in animation)) {
      animation.cancel()
    }
  }
}

function flipKeyedRows(container: HTMLElement, exclude: HTMLElement | null): HTMLElement[] {
  const rows: HTMLElement[] = []
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement && child !== exclude && child.dataset.flipKey) rows.push(child)
  }
  return rows
}

/** Rows within one viewport above and below the visible part of the list, keyed by flip key. */
function captureNearViewport(
  container: HTMLElement,
  viewport: HTMLElement,
  exclude: HTMLElement | null
): Map<string, FlipRect> {
  const rects = new Map<string, FlipRect>()
  const rows = flipKeyedRows(container, exclude)
  if (rows.length === 0) return rects

  const view = viewport.getBoundingClientRect()
  const reachTop = view.top - view.height
  const reachBottom = view.bottom + view.height

  // Rows stack top to bottom, so the first one that reaches into the window is found by bisection.
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (rows[middle].getBoundingClientRect().bottom > reachTop) high = middle
    else low = middle + 1
  }

  for (let index = low; index < rows.length; index += 1) {
    const rect = readRect(rows[index])
    if (rect.top >= reachBottom) break
    rects.set(rows[index].dataset.flipKey!, rect)
  }
  return rects
}

export function useListFlip(options: ListFlipOptions): void {
  let pending: PendingListFlip | null = null

  const allowed = (): boolean => options.enabled() && options.shouldAnimate()

  function capture(): void {
    // Several updates in one tick play once, from the positions before the first of them.
    if (pending || !allowed()) return
    const container = toValue(options.container)
    const viewport = toValue(options.viewport)
    if (!container || !viewport) return

    const rects = captureNearViewport(container, viewport, options.follower?.element() ?? null)
    if (rects.size === 0) return
    pending = { container, origin: readRect(container), rects }
    void nextTick(play)
  }

  function play(): void {
    const entry = pending
    pending = null
    if (!entry || !allowed()) return
    const { container } = entry
    // The list was swapped out (list ↔ grid): its old rows are gone.
    if (toValue(options.container) !== container || !container.isConnected) return

    const rows = new Map<string, HTMLElement>()
    for (const row of flipKeyedRows(container, options.follower?.element() ?? null)) {
      rows.set(row.dataset.flipKey!, row)
    }
    // A row still sliding from the previous batch was read where it is drawn, and its new slide
    // starts there. The old one goes before the row's new place is read: left running, it is part
    // of that read, and the new slide, which replaces it, would start short by what it had left.
    for (const key of entry.rects.keys()) {
      const row = rows.get(key)
      if (row) cancelSlides(row)
    }

    const origin = readRect(container)
    const shiftX = origin.left - entry.origin.left
    const shiftY = origin.top - entry.origin.top

    // Only rows that exist on both sides and moved within the list: a width change alone (the
    // preview pane opening in the same update) is not a move. What `playFlip` gets is the old
    // position at the current size, so it plays a translate and nothing else.
    const moved = new Map<string, FlipRect>()
    for (const [key, before] of entry.rects) {
      const row = rows.get(key)
      if (!row) continue
      const after = readRect(row)
      const dx = before.left + shiftX - after.left
      const dy = before.top + shiftY - after.top
      if (Math.abs(dx) < MIN_MOVE_PX && Math.abs(dy) < MIN_MOVE_PX) continue
      moved.set(key, {
        left: after.left + dx,
        top: after.top + dy,
        width: after.width,
        height: after.height
      })
    }
    if (moved.size === 0) return

    addFollower(moved)
    playFlip(container, { rects: moved }, options.duration ?? LIST_FLIP_DURATION_MS)
  }

  /** The follower starts off by its row's delta, so the one `playFlip` moves both alike. */
  function addFollower(moved: Map<string, FlipRect>): void {
    const element = options.follower?.element()
    const row = options.follower?.row()
    const key = element?.dataset.flipKey
    const rowKey = row?.dataset.flipKey
    if (!element || !row || !key || !rowKey) return
    const rowBefore = moved.get(rowKey)
    if (!rowBefore) return

    const rowAfter = readRect(row)
    const after = readRect(element)
    moved.set(key, {
      left: after.left + rowBefore.left - rowAfter.left,
      top: after.top + rowBefore.top - rowAfter.top,
      width: after.width,
      height: after.height
    })
  }

  watch(options.items, capture, { flush: 'pre' })
}
