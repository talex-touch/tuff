import type { MaybeRefOrGetter } from 'vue'
import type { ListFlipFollower } from './useListFlip'
import { onBeforeUnmount, toValue, watch } from 'vue'

/**
 * The CoreBox list's selection block (design D8): one highlight that moves between rows, in place of
 * every row easing its own background and accent bar in and out, which left a trail of half-faded
 * rows under a held arrow key.
 *
 * - The block is `CoreBoxSelectionBlock`, the list's last child, positioned under the rows. It covers
 *   the selected BoxItem's border box, read from layout offsets (a row mid-FLIP is transformed; the
 *   block aims where the row lands). Its resting position is written to the `translate` property, and
 *   width and height only when they change; nothing here goes through a Vue re-render.
 * - A one-row step glides for SELECTION_STEP_MS. A step that arrives while the previous one would
 *   still be moving lands at once, so a held key never trails, and two motions never run together.
 *   Anything else (a jump, a result update, a resize) lands in place.
 * - The motions are `transform` animations over the `translate` resting position, the same shape a
 *   list FLIP plays on a row. That lets useListFlip carry the block with its row through a re-rank
 *   (`follower`), with the same delta, duration and easing.
 * - While it shows a row, the list carries `data-selection-block`: the block is visible and BoxItem
 *   drops its own active background and accent bar. A custom row, a widget or no selection hides it
 *   and gives the rows their own paint back. The list does not exist in grid mode, where tiles keep
 *   their own highlight.
 * - Scrolling needs nothing: the block lives in the scrolled content.
 *
 * It also owns rule K's `data-pointer-idle`: set from a key press until the pointer really moves, so
 * a resting pointer does not keep a hover on whatever row slides under it.
 */

/** A one-row keyboard step; gone before a fast key repeat arrives. */
export const SELECTION_STEP_MS = 90
/** Ease-out without overshoot, flip-layout's curve: a step and a re-rank decelerate alike. */
const SELECTION_STEP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** On the list while the block shows the selection. */
export const SELECTION_BLOCK_ATTR = 'data-selection-block'
/** On the pointer host from a key press until the pointer moves. */
export const POINTER_IDLE_ATTR = 'data-pointer-idle'

/** The selected default row: a BoxItem directly inside one of the list's rows. */
const ACTIVE_ROW_SELECTOR = ':scope > * > .BoxItem.is-active'
/** Keys that only modify a click or a later key: pressing one does not leave the pointer. */
const MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'FnLock',
  'Hyper',
  'Meta',
  'OS',
  'Shift',
  'Super'
])

type BlockMove = 'step' | 'jump' | 'land'

interface BlockBox {
  left: number
  top: number
  width: number
  height: number
}

export interface SelectionBlockOptions {
  /** The list: the block's containing block (position: relative) and the rows' offsetParent. */
  container: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The block element, the list's last child. */
  block: MaybeRefOrGetter<HTMLElement | null | undefined>
  /** The selected index. */
  focus: () => number
  /** The results; a new array is an update, which lands the block instead of stepping it. */
  items: () => readonly unknown[]
  /** The motion gate: false under reduced motion or on low battery, when every move lands. */
  shouldAnimate: () => boolean
  /** Carries `data-pointer-idle`; an ancestor of every row (the CoreBox wrapper). */
  pointerIdleHost?: MaybeRefOrGetter<HTMLElement | null | undefined>
}

export interface SelectionBlock {
  /** For useListFlip: the block rides its row through a list FLIP. */
  follower: ListFlipFollower
}

/** The element's border box relative to `container`, from layout: transforms are ignored. */
function readLayoutBox(el: HTMLElement, container: HTMLElement): BlockBox {
  let left = el.offsetLeft
  let top = el.offsetTop
  let parent = el.offsetParent
  while (parent instanceof HTMLElement && parent !== container && container.contains(parent)) {
    left += parent.offsetLeft
    top += parent.offsetTop
    parent = parent.offsetParent
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight }
}

function isSameBox(a: BlockBox, b: BlockBox): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

function hasRunningAnimation(el: HTMLElement): boolean {
  if (typeof el.getAnimations !== 'function') return false
  return el.getAnimations().some((animation) => animation.playState === 'running')
}

/** `data-pointer-idle` from a key press until the pointer moves; returns the teardown. */
function trackPointerIdle(host: MaybeRefOrGetter<HTMLElement | null | undefined>): () => void {
  let pointerX = Number.NaN
  let pointerY = Number.NaN

  function onKeyDown(event: KeyboardEvent): void {
    if (MODIFIER_KEYS.has(event.key)) return
    toValue(host)?.setAttribute(POINTER_IDLE_ATTR, '')
  }

  function onMouseMove(event: MouseEvent): void {
    // Chromium can re-send a move at the same spot after a scroll or a re-layout; that is not the
    // pointer coming back.
    if (event.screenX === pointerX && event.screenY === pointerY) return
    pointerX = event.screenX
    pointerY = event.screenY
    const el = toValue(host)
    if (el?.hasAttribute(POINTER_IDLE_ATTR)) el.removeAttribute(POINTER_IDLE_ATTR)
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('mousemove', onMouseMove, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('mousemove', onMouseMove, true)
  }
}

export function useSelectionBlock(options: SelectionBlockOptions): SelectionBlock {
  /** The row the block shows; null while it is hidden. */
  let shownRow: HTMLElement | null = null
  /** What is written on `styledBlock`; null until the first write. */
  let placed: BlockBox | null = null
  let styledBlock: HTMLElement | null = null
  let stepAnimation: Animation | null = null
  /** When the selection last moved on its own (not with a result update). */
  let lastStepAt = Number.NEGATIVE_INFINITY

  function stopMotion(block: HTMLElement): void {
    stepAnimation?.cancel()
    stepAnimation = null
    // A list FLIP animates the block as well; a new position must not start under it.
    if (typeof block.getAnimations === 'function') {
      for (const animation of block.getAnimations()) animation.cancel()
    }
  }

  function hide(container: HTMLElement, block: HTMLElement): void {
    stopMotion(block)
    container.removeAttribute(SELECTION_BLOCK_ATTR)
    shownRow = null
  }

  function write(block: HTMLElement, box: BlockBox): void {
    const previous = placed
    if (!previous || previous.left !== box.left || previous.top !== box.top) {
      block.style.setProperty('translate', `${box.left}px ${box.top}px`)
    }
    if (!previous || previous.width !== box.width) {
      block.style.setProperty('width', `${box.width}px`)
    }
    if (!previous || previous.height !== box.height) {
      block.style.setProperty('height', `${box.height}px`)
    }
    placed = box
  }

  function sync(move: BlockMove): void {
    const container = toValue(options.container)
    const block = toValue(options.block)
    if (!container || !block) {
      shownRow = null
      return
    }
    if (block !== styledBlock) {
      // A remounted list brings a new block that carries none of the writes.
      styledBlock = block
      placed = null
      shownRow = null
      stepAnimation = null
    }

    const item = container.querySelector<HTMLElement>(ACTIVE_ROW_SELECTOR)
    const row = item?.parentElement ?? null
    const box = item ? readLayoutBox(item, container) : null
    if (!row || !box || box.width <= 0 || box.height <= 0) {
      hide(container, block)
      return
    }

    const from = shownRow ? placed : null
    // A resize or a refresh that moved nothing leaves a step in flight alone.
    if (move === 'land' && row === shownRow && from && isSameBox(from, box)) return

    const now = performance.now()
    const glide =
      move === 'step' &&
      from !== null &&
      options.shouldAnimate() &&
      now - lastStepAt >= SELECTION_STEP_MS &&
      !hasRunningAnimation(block) &&
      typeof block.animate === 'function'
    if (move !== 'land') lastStepAt = now

    stopMotion(block)
    write(block, box)
    if (!container.hasAttribute(SELECTION_BLOCK_ATTR)) {
      container.setAttribute(SELECTION_BLOCK_ATTR, '')
    }
    shownRow = row

    if (!glide || !from) return
    const dx = from.left - box.left
    const dy = from.top - box.top
    if (dx === 0 && dy === 0) return
    stepAnimation = block.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
      { duration: SELECTION_STEP_MS, easing: SELECTION_STEP_EASING }
    )
  }

  watch(
    [() => options.focus(), () => options.items()],
    ([focus, items], [previousFocus, previousItems]) => {
      if (items !== previousItems) sync('land')
      else sync(Math.abs(focus - previousFocus) === 1 ? 'step' : 'jump')
    },
    { flush: 'post' }
  )

  let resizeObserver: ResizeObserver | null = null
  watch(
    [() => toValue(options.container), () => toValue(options.block)],
    ([container], [previousContainer]) => {
      if (container !== previousContainer) {
        resizeObserver?.disconnect()
        resizeObserver = null
        if (container && typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(() => sync('land'))
          resizeObserver.observe(container)
        }
      }
      sync('land')
    },
    { flush: 'post' }
  )

  const stopPointerIdle = options.pointerIdleHost ? trackPointerIdle(options.pointerIdleHost) : null

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    stopPointerIdle?.()
    const block = toValue(options.block)
    if (block) stopMotion(block)
  })

  return {
    follower: {
      element: () => toValue(options.block) ?? null,
      row: () => shownRow
    }
  }
}
