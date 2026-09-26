<script setup lang="ts" generic="T extends SortableListItem">
import type { ResolvedTransition } from '../../liquid/src/spring'
import type { SortableListEmits, SortableListItem, SortableListLabels, SortableListProps } from './types'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { resolveTransition } from '../../liquid/src/spring'

defineOptions({
  name: 'TxSortableList',
})

/**
 * Type-only props are kept here because the generic `T` is what types the `item`
 * slot, and a runtime props object erases it. The cost is the usual one: a prop
 * added to `types.ts` may not reach a running dev server until it restarts.
 */
const props = withDefaults(defineProps<SortableListProps<T>>(), {
  disabled: false,
  handle: false,
  dragMode: 'pointer',
})

const emit = defineEmits<SortableListEmits<T>>()

defineSlots<{
  item?: (props: {
    item: T
    dragging: boolean
    grabbed: boolean
    index: number
    handleAttrs: Record<string, string>
  }) => any
}>()

const DEFAULT_LABELS: Required<SortableListLabels> = {
  grabbed: '{item}, grabbed. Position {position} of {size}. Use the arrow keys to move it, space to drop, escape to cancel.',
  moved: '{item}, moved to position {position} of {size}.',
  dropped: '{item}, dropped at position {position} of {size}.',
  cancelled: 'Reorder cancelled. {item} is back at position {position} of {size}.',
  handle: 'Reorder {item}',
}

/** Attributes a custom `item` slot spreads onto whatever it wants to be the grip. */
const HANDLE_ATTRS = { 'data-tx-sort-handle': 'true' } as const

/** A press becomes a drag once it has travelled this far, so a click stays a click. */
const DRAG_THRESHOLD = 4
/** Past either end of the list the carried row follows at this fraction of the pointer. */
const OVERSCROLL_RESISTANCE = 0.3
/** How far a carried row is lifted. */
const LIFT_SCALE = 1.02
/**
 * Rows stepping aside for the carried one: quick, with a few percent of
 * overshoot so the list gives way like something elastic rather than sliding
 * on rails.
 */
const ROOM_SPRING = { stiffness: 480, damping: 30 }
/** The carried row lifts and lands on the library's bouncy preset — the "Q 弹". */
const LAND_SPRING = 'bouncy'
/** Form fields keep their own pointer gestures (caret, selection), so they never start a drag. */
const NO_DRAG_TARGET = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

function prefersReducedMotion(): boolean {
  return hasWindow() && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const draggingId = ref<string | null>(null)
const overId = ref<string | null>(null)
/** Index the interaction started at, so `reorder` reports one move, not each step. */
const origin = ref<number | null>(null)

/**
 * The order the component is showing while a native drag or keyboard grab is
 * in flight.
 *
 * The preview cannot read back from `modelValue`: the host only sees it after
 * `update:modelValue` and may write it back a tick later, or (a list mounted
 * without `v-model`) never. Holding the intended order here means the rows move
 * under the pointer either way, and the source of truth goes back to the host
 * the moment the interaction ends.
 */
const pendingOrder = shallowRef<T[] | null>(null)

/**
 * The item held by the keyboard, and the order to restore if Escape lands.
 * `shallowRef` rather than `ref`: the deep unwrapping turns `T[]` into
 * `UnwrapRefSimple<T>[]`, which no longer assigns back to `T[]` for a generic T.
 */
const grabbedId = ref<string | null>(null)
const restoreOrder = shallowRef<T[] | null>(null)

const focusedId = ref<string | null>(null)
const announcement = ref('')

const items = computed(() => pendingOrder.value ?? props.modelValue ?? [])

const listRef = ref<HTMLElement | null>(null)
const rowEls = new Map<string, HTMLElement>()

function setRowEl(id: string, el: unknown): void {
  if (el instanceof HTMLElement)
    rowEls.set(id, el)
  else
    rowEls.delete(id)
}

/**
 * One tab stop for the whole list, the way a listbox behaves: tabbing in lands
 * on the focused row (or the first), and the arrow keys move between rows.
 */
const tabStopId = computed(() => {
  const focused = focusedId.value
  if (focused !== null && items.value.some(item => item.id === focused))
    return focused
  return items.value[0]?.id ?? null
})

function labelOf(item: T): string {
  return props.itemLabel ? props.itemLabel(item) : item.id
}

function announce(kind: keyof SortableListLabels, item: T, index: number): void {
  const template = props.labels?.[kind] ?? DEFAULT_LABELS[kind]
  announcement.value = template
    .replace('{item}', labelOf(item))
    .replace('{position}', String(index + 1))
    .replace('{size}', String(items.value.length))
}

function findIndex(id: string): number {
  return items.value.findIndex(i => i.id === id)
}

function move(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const picked = next.splice(from, 1)[0]
  if (!picked)
    return next
  next.splice(to, 0, picked)
  return next
}

/**
 * Shows a move and tells the host about it. `reorder` is deliberately *not*
 * emitted here: a drag crosses several rows on the way, and a consumer wants
 * "the user moved this from 3 to 1", not one event per row passed.
 */
function applyMove(from: number, to: number): boolean {
  if (from < 0 || to < 0 || from === to)
    return false
  const next = move(items.value, from, to)
  pendingOrder.value = next
  emit('update:modelValue', next)
  return true
}

/** Ends an interaction: hands the order back to the host and reports the move. */
function settle(item: T): void {
  const from = origin.value
  const to = findIndex(item.id)
  const finalOrder = items.value.slice()

  origin.value = null
  pendingOrder.value = null
  restoreOrder.value = null

  if (from === null || to < 0 || to === from)
    return
  emit('reorder', { from, to, items: finalOrder })
}

async function focusItem(id: string): Promise<void> {
  focusedId.value = id
  await nextTick()
  const escape = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  document.querySelector<HTMLElement>(`[data-tx-sort-id="${escape}"]`)?.focus()
}

// --- motion ------------------------------------------------------------------
//
// Rows move on the individual `translate` and `scale` properties, not
// `transform`, because the two need different clocks at once: a carried row's
// translate follows the pointer with no transition while its scale springs up.
// The script owns `transition` on a row for the same reason — which of the two
// animate changes move by move, and a stylesheet rule could not say so.

function transitionFor(reduced: boolean, translate: ResolvedTransition | null, scale: ResolvedTransition | null = null): string {
  const parts = reduced
    ? ['background 120ms ease', 'border-color 120ms ease']
    : ['box-shadow 160ms ease', 'background 120ms ease', 'border-color 120ms ease']
  if (translate && translate.duration > 0)
    parts.push(`translate ${translate.duration}ms ${translate.easing}`)
  if (scale && scale.duration > 0)
    parts.push(`scale ${scale.duration}ms ${scale.easing}`)
  return parts.join(', ')
}

/** Vertical centre of every row as drawn, transforms included. Scale does not move it. */
function readCentres(): Map<string, number> {
  const centres = new Map<string, number>()
  for (const [id, el] of rowEls) {
    const rect = el.getBoundingClientRect()
    centres.set(id, rect.top + rect.height / 2)
  }
  return centres
}

function liftRow(id: string, lifted: boolean): void {
  const el = rowEls.get(id)
  if (!el)
    return
  const reduced = prefersReducedMotion()
  const land = resolveTransition(LAND_SPRING, reduced)
  el.style.transition = transitionFor(reduced, null, land)
  el.style.scale = lifted && !reduced ? String(LIFT_SCALE) : ''
}

/**
 * FLIP after the order changed: every row starts where it was drawn (`before`)
 * and springs to where the layout now puts it. The `carried` row moves on the
 * bouncy spring and, when `land` is set, drops its lift on the way; the rest
 * move on the room spring. Rows the layout already agrees with stay put.
 */
async function flipRows(before: Map<string, number>, carried: string | null = null, land = false): Promise<void> {
  await nextTick()
  const reduced = prefersReducedMotion()
  const room = resolveTransition(ROOM_SPRING, reduced)
  const bouncy = resolveTransition(LAND_SPRING, reduced)

  // Back to the layout position with no transition, then read every row before
  // writing any: one layout pass, not one per row. The carried row keeps its
  // scale transition so a lift still in flight is not cut short.
  for (const [id, el] of rowEls) {
    el.style.transition = transitionFor(reduced, null, id === carried ? bouncy : null)
    el.style.translate = ''
  }
  const moves: Array<{ el: HTMLElement, dy: number, carried: boolean }> = []
  for (const [id, el] of rowEls) {
    const from = before.get(id)
    if (from === undefined)
      continue
    const rect = el.getBoundingClientRect()
    const dy = from - (rect.top + rect.height / 2)
    if (Math.abs(dy) >= 0.5 || id === carried)
      moves.push({ el, dy, carried: id === carried })
  }
  for (const m of moves)
    m.el.style.translate = m.dy ? `0 ${m.dy}px` : ''

  // Commit the start frame, or the transition would run from the natural place.
  void listRef.value?.offsetHeight

  for (const m of moves) {
    m.el.style.transition = m.carried
      ? transitionFor(reduced, bouncy, bouncy)
      : transitionFor(reduced, room)
    m.el.style.translate = ''
    if (m.carried && land)
      m.el.style.scale = ''
  }
}

// --- pointer drag (dragMode: 'pointer') ----------------------------------------
//
// The DOM order does not change while a row is carried: the row follows the
// pointer on `translate`, the rows it passes step aside on theirs, and the order
// is committed once, on release, with a FLIP from where everything was drawn.

interface PointerDrag {
  id: string
  pointerId: number
  startX: number
  startY: number
  lastY: number
  started: boolean
  from: number
  to: number
  /** The list's viewport top when the drag started, to cancel out scrolling. */
  listTop: number
  /** Layout box of every row when the drag started (offsets: transforms excluded). */
  slots: Array<{ id: string, top: number, height: number }>
  /** How far a passed row steps aside: the carried row's height plus the gap. */
  room: number
}

let drag: PointerDrag | null = null

function addWindowListeners(): void {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onDragKeydown, true)
  window.addEventListener('scroll', onDragScroll, { capture: true, passive: true })
}

function removeWindowListeners(): void {
  if (!hasWindow())
    return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
  window.removeEventListener('keydown', onDragKeydown, true)
  window.removeEventListener('scroll', onDragScroll, { capture: true })
}

function onPointerDown(e: PointerEvent, item: T, index: number): void {
  if (props.dragMode !== 'pointer' || props.disabled || drag || grabbedId.value !== null)
    return
  if (!e.isPrimary || e.button !== 0)
    return
  const target = e.target instanceof Element ? e.target : null
  if (target?.closest(NO_DRAG_TARGET))
    return
  if (props.handle && !target?.closest('[data-tx-sort-handle="true"]'))
    return

  drag = {
    id: item.id,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastY: e.clientY,
    started: false,
    from: index,
    to: index,
    listTop: 0,
    slots: [],
    room: 0,
  }
  addWindowListeners()
}

function beginDrag(state: PointerDrag): void {
  state.slots = items.value.map((it) => {
    const el = rowEls.get(it.id)
    return { id: it.id, top: el?.offsetTop ?? 0, height: el?.offsetHeight ?? 0 }
  })
  const own = state.slots[state.from]
  const next = state.slots[state.from + 1]
  const prev = state.slots[state.from - 1]
  let gap = 0
  if (own && next)
    gap = next.top - own.top - own.height
  else if (own && prev)
    gap = own.top - prev.top - prev.height
  state.room = (own?.height ?? 0) + Math.max(0, gap)
  state.listTop = listRef.value?.getBoundingClientRect().top ?? 0
  state.started = true

  // No `--over` mark in this mode: the carried row already shows where it
  // will land, and outlining the row it displaces reads as a second selection.
  draggingId.value = state.id
  origin.value = state.from
  // Text selected on the way past the threshold would stay highlighted.
  window.getSelection?.()?.removeAllRanges()
  liftRow(state.id, true)
}

/**
 * The index the carried row would take if it were dropped now: the one where
 * it would sit centred closest to where it is. So a row takes a neighbour's
 * place once it is past half-way, whatever the two heights — and the last
 * place is reachable without pulling past the end of the list.
 */
function slotAt(state: PointerDrag, centre: number): number {
  const own = state.slots[state.from]
  if (!own)
    return state.from
  let best = state.from
  let bestDistance = Number.POSITIVE_INFINITY
  state.slots.forEach((slot, k) => {
    // Rows between shift by the carried row's height, so it lands top-aligned
    // with a slot above it and bottom-aligned with one below.
    let placed = own.top + own.height / 2
    if (k < state.from)
      placed = slot.top + own.height / 2
    else if (k > state.from)
      placed = slot.top + slot.height - own.height / 2
    const distance = Math.abs(centre - placed)
    if (distance < bestDistance) {
      best = k
      bestDistance = distance
    }
  })
  return best
}

function makeRoom(state: PointerDrag): void {
  const reduced = prefersReducedMotion()
  const room = resolveTransition(ROOM_SPRING, reduced)
  const { from, to } = state
  state.slots.forEach((slot, i) => {
    const el = rowEls.get(slot.id)
    if (!el || i === from)
      return
    let shift = 0
    if (from < to && i > from && i <= to)
      shift = -state.room
    else if (to < from && i >= to && i < from)
      shift = state.room
    el.style.transition = transitionFor(reduced, room)
    el.style.translate = shift ? `0 ${shift}px` : ''
  })
}

function track(state: PointerDrag): void {
  const own = state.slots[state.from]
  const first = state.slots[0]
  const last = state.slots[state.slots.length - 1]
  if (!own || !first || !last)
    return

  // Exactly where the pointer goes — less however far the list scrolled under
  // it — until the row passes an end of the list; past that it follows with
  // resistance instead of leaving.
  const listTop = listRef.value?.getBoundingClientRect().top ?? state.listTop
  let dy = state.lastY - state.startY - (listTop - state.listTop)
  const minDy = first.top - own.top
  const maxDy = last.top + last.height - own.top - own.height
  if (dy < minDy)
    dy = minDy + (dy - minDy) * OVERSCROLL_RESISTANCE
  else if (dy > maxDy)
    dy = maxDy + (dy - maxDy) * OVERSCROLL_RESISTANCE

  const el = rowEls.get(state.id)
  if (el)
    el.style.translate = `0 ${dy}px`

  const to = slotAt(state, own.top + own.height / 2 + dy)
  if (to === state.to)
    return
  state.to = to
  makeRoom(state)
}

function onPointerMove(e: PointerEvent): void {
  const state = drag
  if (!state || e.pointerId !== state.pointerId)
    return
  if (!state.started) {
    if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < DRAG_THRESHOLD)
      return
    beginDrag(state)
  }
  e.preventDefault()
  state.lastY = e.clientY
  track(state)
}

function onDragScroll(): void {
  if (drag?.started)
    track(drag)
}

/**
 * The release that ends a drag would also click whatever it lands on — often
 * the carried row itself. The press was a drag, so that click is swallowed.
 */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

function finishPointerDrag(commit: boolean): void {
  const state = drag
  drag = null
  removeWindowListeners()
  if (!state?.started)
    return

  const before = readCentres()
  const item = items.value.find(it => it.id === state.id)
  draggingId.value = null

  if (commit && item) {
    // `settle` hands the order back to the host; a list without `v-model` gets
    // its old order back, and the FLIP below animates that too.
    applyMove(state.from, state.to)
    settle(item)
  }
  else {
    origin.value = null
    pendingOrder.value = null
  }
  void flipRows(before, state.id, true)
}

function onPointerUp(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId)
    return
  if (drag.started)
    swallowNextClick()
  finishPointerDrag(true)
}

function onPointerCancel(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId)
    return
  finishPointerDrag(false)
}

function onDragKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !drag?.started)
    return
  e.preventDefault()
  e.stopPropagation()
  finishPointerDrag(false)
}

onBeforeUnmount(() => {
  drag = null
  removeWindowListeners()
})

// --- native drag (dragMode: 'native') ------------------------------------------

function canDrag(e: DragEvent): boolean {
  if (props.disabled || props.dragMode !== 'native')
    return false
  if (!props.handle)
    return true

  const target = e.target as HTMLElement | null
  if (!target)
    return false

  return !!target.closest('[data-tx-sort-handle="true"]')
}

function onDragStart(e: DragEvent, id: string): void {
  // In pointer mode this also stops an image or link inside a row from
  // starting the browser's own drag, which would cancel the pointer stream.
  if (!canDrag(e)) {
    e.preventDefault()
    return
  }

  draggingId.value = id
  overId.value = id
  origin.value = findIndex(id)
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer)
    e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent, id: string): void {
  if (props.disabled || props.dragMode !== 'native')
    return
  const fromId = draggingId.value
  if (!fromId)
    return

  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect = 'move'
  overId.value = id

  // Reorder as the pointer crosses rather than only on drop. The list showing
  // where the row will land *is* the drag feedback. No FLIP here: hit-testing
  // follows transforms, so a row still sliding away would keep catching the
  // pointer and swap straight back.
  if (id !== fromId)
    applyMove(findIndex(fromId), findIndex(id))
}

function endDrag(): void {
  draggingId.value = null
  overId.value = null
}

function onDrop(e: DragEvent, id: string): void {
  if (props.dragMode !== 'native')
    return
  if (props.disabled) {
    endDrag()
    origin.value = null
    pendingOrder.value = null
    return
  }

  e.preventDefault()

  const fromId = draggingId.value
  if (!fromId) {
    endDrag()
    return
  }

  // A browser always fires `dragover` before `drop`, so the preview has normally
  // already landed the row and re-applying the move here would overshoot. Only
  // fall back to the drop target when no preview ran at all — a host that
  // handles `dragover` itself, or a synthetic drop in a test.
  if (pendingOrder.value === null && id !== fromId)
    applyMove(findIndex(fromId), findIndex(id))

  const dragged = items.value.find(item => item.id === fromId)
  endDrag()
  if (dragged)
    settle(dragged)
}

function onDragEnd(): void {
  if (props.dragMode !== 'native')
    return
  // Also fires when a drop lands outside the list. The preview stands as the
  // result there — the rows already moved, and snapping them back would undo a
  // reorder the user watched happen.
  const fromId = draggingId.value
  endDrag()

  if (!fromId)
    return
  const dragged = items.value.find(item => item.id === fromId)
  if (dragged)
    settle(dragged)
}

// --- keyboard reorder ----------------------------------------------------------

function grab(item: T, index: number): void {
  grabbedId.value = item.id
  origin.value = index
  restoreOrder.value = items.value.slice()
  liftRow(item.id, true)
  announce('grabbed', item, index)
}

function drop(item: T): void {
  const index = findIndex(item.id)
  grabbedId.value = null
  liftRow(item.id, false)
  announce('dropped', item, index)
  settle(item)
}

function cancel(item: T): void {
  const restore = restoreOrder.value
  const back = origin.value ?? 0
  grabbedId.value = null
  origin.value = null
  restoreOrder.value = null
  liftRow(item.id, false)

  if (restore) {
    const before = readCentres()
    pendingOrder.value = null
    emit('update:modelValue', restore)
    void flipRows(before, item.id)
  }
  announce('cancelled', item, back)
}

function onKeydown(e: KeyboardEvent, item: T, index: number): void {
  if (props.disabled)
    return

  const held = grabbedId.value === item.id

  if (e.key === ' ' || e.key === 'Enter') {
    // Space scrolls the page by default, and Enter would submit a surrounding
    // form; both are the reorder control here.
    e.preventDefault()
    if (held)
      drop(item)
    else
      grab(item, index)
    return
  }

  if (e.key === 'Escape' && held) {
    e.preventDefault()
    cancel(item)
    return
  }

  const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
  if (step === 0)
    return

  e.preventDefault()
  const target = index + step
  if (target < 0 || target >= items.value.length)
    return

  if (!held) {
    const next = items.value[target]
    if (next)
      void focusItem(next.id)
    return
  }

  const before = readCentres()
  applyMove(index, target)
  void flipRows(before, item.id)
  announce('moved', item, target)
  void focusItem(item.id)
}

function onBlur(item: T): void {
  // Losing focus mid-reorder would otherwise strand the item held with no way
  // to put it down.
  if (grabbedId.value === item.id)
    drop(item)
}
</script>

<template>
  <div
    ref="listRef"
    class="tx-sortable-list"
    :class="{ 'tx-sortable-list--carrying': draggingId !== null && dragMode === 'pointer' }"
    role="list"
    :aria-label="ariaLabel || undefined"
  >
    <div
      v-for="(item, index) in items"
      :key="item.id"
      :ref="el => setRowEl(item.id, el)"
      class="tx-sortable-list__item"
      :class="{
        'tx-sortable-list__item--dragging': item.id === draggingId,
        'tx-sortable-list__item--over': item.id === overId,
        'tx-sortable-list__item--grabbed': item.id === grabbedId,
        'tx-sortable-list__item--handle': handle,
        'tx-sortable-list__item--disabled': disabled,
        'tx-sortable-list__item--pointer': dragMode === 'pointer' && !disabled,
      }"
      role="listitem"
      :data-tx-sort-id="item.id"
      :draggable="dragMode === 'native' && !disabled"
      :tabindex="disabled ? -1 : (tabStopId === item.id ? 0 : -1)"
      :aria-roledescription="disabled ? undefined : 'Sortable item'"
      @pointerdown="onPointerDown($event, item, index)"
      @dragstart="onDragStart($event, item.id)"
      @dragover="onDragOver($event, item.id)"
      @drop="onDrop($event, item.id)"
      @dragend="onDragEnd"
      @keydown="onKeydown($event, item, index)"
      @focus="focusedId = item.id"
      @blur="onBlur(item)"
    >
      <slot
        name="item"
        :item="item"
        :dragging="item.id === draggingId"
        :grabbed="item.id === grabbedId"
        :index="index"
        :handle-attrs="HANDLE_ATTRS"
      >
        <div class="tx-sortable-list__default">
          <span
            v-if="handle"
            class="tx-sortable-list__grip"
            v-bind="HANDLE_ATTRS"
            :aria-label="(labels?.handle ?? DEFAULT_LABELS.handle).replace('{item}', labelOf(item))"
            role="img"
          >
            <svg viewBox="0 0 16 16" width="12" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M5 2.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM14 2.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM14 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
              />
            </svg>
          </span>
          {{ item.id }}
        </div>
      </slot>
    </div>

    <!-- Keyboard reordering is silent otherwise: the rows swap, and a screen
         reader user has no way to tell it happened. -->
    <span class="tx-sortable-list__status" role="status" aria-live="polite">{{ announcement }}</span>
  </div>
</template>

<style scoped lang="scss">
.tx-sortable-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// A sweep of the pointer while a row is carried must not select the text it
// passes over, and the grabbing hand stays on wherever the pointer wanders.
.tx-sortable-list--carrying {
  user-select: none;
  cursor: grabbing;

  .tx-sortable-list__item {
    will-change: translate;
  }
}

// `translate` / `scale` and their transitions are written by the script, row
// by row (see "motion" there); this is only the resting transition list, the
// one the script writes back too.
.tx-sortable-list__item {
  position: relative;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  /* Nothing said these rows could be picked up — no grip, no cursor change.
     A row is the grab target unless `handle` narrows it to the grip. */
  cursor: grab;
  transition:
    box-shadow 160ms ease,
    background 120ms ease,
    border-color 120ms ease;

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }
}

// Pointer mode owns the whole gesture, so the browser must not turn it into a
// scroll first. With `handle`, only the grip is claimed and the rest of the row
// still scrolls the page on touch.
.tx-sortable-list__item--pointer:not(.tx-sortable-list__item--handle),
.tx-sortable-list__item--pointer :deep([data-tx-sort-handle='true']) {
  touch-action: none;
}

.tx-sortable-list__item--handle,
.tx-sortable-list__item--disabled {
  cursor: default;
}

.tx-sortable-list__item--over {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
}

/* The carried (or keyboard-held) row rides above the others, lifted; its scale
   and position are written by the script so the lift travels with it. It
   passes over other rows on the way, so it sits on the opaque overlay surface:
   `--tx-fill-color-blank` is transparent in the dark theme, and the rows it
   crossed showed through it. */
.tx-sortable-list__item--dragging,
.tx-sortable-list__item--grabbed {
  z-index: 2;
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 6%, var(--tx-bg-color-overlay, #fff));
  box-shadow: var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
}

.tx-sortable-list__default {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--tx-text-color-primary, #111827);
}

.tx-sortable-list__grip {
  flex: none;
  display: inline-flex;
  align-items: center;
  margin: -4px 0 -4px -2px;
  padding: 4px 2px;
  border-radius: 6px;
  color: var(--tx-text-color-placeholder, #9ca3af);
  cursor: grab;

  &:hover {
    color: var(--tx-text-color-secondary, #909399);
  }
}

.tx-sortable-list__item--disabled .tx-sortable-list__grip {
  cursor: default;
}

/* Visible to assistive tech, not on screen. `display: none` would stop it being
   announced at all. */
.tx-sortable-list__status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

// The springs resolve to zero length under reduced motion (the script asks
// `resolveTransition` for the reduced curve) and the lift is skipped; this is
// the resting list's share. The carried row still follows the pointer — that
// is direct manipulation, not animation.
@media (prefers-reduced-motion: reduce) {
  .tx-sortable-list__item {
    transition: background 120ms ease, border-color 120ms ease;
  }
}
</style>
