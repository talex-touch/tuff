<script setup lang="ts" generic="T extends SortableListItem">
import type { SortableListEmits, SortableListItem, SortableListLabels, SortableListProps } from './types'
import { computed, nextTick, ref, shallowRef } from 'vue'

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

const draggingId = ref<string | null>(null)
const overId = ref<string | null>(null)
/** Index the interaction started at, so `reorder` reports one move, not each step. */
const origin = ref<number | null>(null)

/**
 * The order the component is showing while a drag or keyboard grab is in flight.
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

// --- pointer drag ----------------------------------------------------------

function canDrag(e: DragEvent): boolean {
  if (props.disabled)
    return false
  if (!props.handle)
    return true

  const target = e.target as HTMLElement | null
  if (!target)
    return false

  return !!target.closest('[data-tx-sort-handle="true"]')
}

function onDragStart(e: DragEvent, id: string): void {
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
  if (props.disabled)
    return
  const fromId = draggingId.value
  if (!fromId)
    return

  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect = 'move'
  overId.value = id

  // Reorder as the pointer crosses rather than only on drop. The list showing
  // where the row will land *is* the drag feedback — without it the only thing
  // that changed on screen was a 0.65 opacity on the row being dragged.
  if (id !== fromId)
    applyMove(findIndex(fromId), findIndex(id))
}

function endDrag(): void {
  draggingId.value = null
  overId.value = null
}

function onDrop(e: DragEvent, id: string): void {
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

// --- keyboard reorder ------------------------------------------------------

function grab(item: T, index: number): void {
  grabbedId.value = item.id
  origin.value = index
  restoreOrder.value = items.value.slice()
  announce('grabbed', item, index)
}

function drop(item: T): void {
  const index = findIndex(item.id)
  grabbedId.value = null
  announce('dropped', item, index)
  settle(item)
}

function cancel(item: T): void {
  const restore = restoreOrder.value
  const back = origin.value ?? 0
  grabbedId.value = null
  origin.value = null
  restoreOrder.value = null

  if (restore) {
    pendingOrder.value = null
    emit('update:modelValue', restore)
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

  applyMove(index, target)
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
  <div class="tx-sortable-list" role="list" :aria-label="ariaLabel || undefined">
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="tx-sortable-list__item"
      :class="{
        'tx-sortable-list__item--dragging': item.id === draggingId,
        'tx-sortable-list__item--over': item.id === overId,
        'tx-sortable-list__item--grabbed': item.id === grabbedId,
        'tx-sortable-list__item--handle': handle,
        'tx-sortable-list__item--disabled': disabled,
      }"
      role="listitem"
      :data-tx-sort-id="item.id"
      :draggable="!disabled"
      :tabindex="disabled ? -1 : (tabStopId === item.id ? 0 : -1)"
      :aria-roledescription="disabled ? undefined : 'Sortable item'"
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

.tx-sortable-list__item {
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  /* Nothing said these rows could be picked up — no grip, no cursor change.
     A row is the grab target unless `handle` narrows it to the grip. */
  cursor: grab;
  transition:
    transform 160ms cubic-bezier(0.32, 0.72, 0.35, 1),
    box-shadow 160ms ease,
    background 120ms ease,
    border-color 120ms ease,
    opacity 120ms ease;

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }
}

.tx-sortable-list__item--handle,
.tx-sortable-list__item--disabled {
  cursor: default;
}

.tx-sortable-list__item--over {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
}

/* The row keeps its place in the list while the pointer carries it — the list
   has already reordered underneath — so it reads as lifted, not as a ghost. */
.tx-sortable-list__item--dragging,
.tx-sortable-list__item--grabbed {
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 6%, var(--tx-fill-color-blank, #fff));
  box-shadow: var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
  transform: scale(1.015);
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

@media (prefers-reduced-motion: reduce) {
  .tx-sortable-list__item {
    transition: background 120ms ease, border-color 120ms ease;
  }

  .tx-sortable-list__item--dragging,
  .tx-sortable-list__item--grabbed {
    transform: none;
  }
}
</style>
