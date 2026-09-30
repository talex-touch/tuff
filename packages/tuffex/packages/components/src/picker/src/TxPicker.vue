<script setup lang="ts">
import type { PickerColumn, PickerEmits, PickerProps, PickerValue } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

defineOptions({ name: 'TxPicker' })

const props = withDefaults(defineProps<PickerProps>(), {
  modelValue: () => [],
  columns: () => [],
  visible: false,
  popup: true,
  title: '',
  showToolbar: true,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  disabled: false,
  itemHeight: 36,
  visibleItemCount: 5,
  closeOnClickMask: true,
  lazyMount: true,
})

const emit = defineEmits<PickerEmits>()

const open = computed({
  get: () => !!props.visible,
  set: v => emit('update:visible', v),
})

const mountedOnce = ref(false)
const popupZIndex = ref(zIndexAllocator.get())

const columns = computed<PickerColumn[]>(() => props.columns ?? [])

const itemHeightPx = computed(() => Math.max(24, props.itemHeight ?? 36))
const visibleCount = computed(() => {
  const n = Math.floor(props.visibleItemCount ?? 5)
  return Math.max(3, n % 2 === 0 ? n + 1 : n)
})

const localValue = ref<PickerValue>([])

function normalizeValue(v: PickerValue): PickerValue {
  const cols = columns.value
  const out: PickerValue = []
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]
    if (!col)
      continue
    const opts = col.options ?? []
    const desired = v[i]

    if (desired !== undefined) {
      const idx = opts.findIndex(o => o.value === desired)
      if (idx >= 0) {
        out[i] = desired
        continue
      }
    }

    const first = opts.find(o => !o.disabled)
    out[i] = first?.value ?? ''
  }
  return out
}

function valuesEqual(a: PickerValue, b: PickerValue): boolean {
  if (a.length !== b.length)
    return false
  return a.every((val, i) => val === b[i])
}

watch(
  () => props.modelValue,
  (v) => {
    localValue.value = normalizeValue(Array.isArray(v) ? v : [])
  },
  { immediate: true },
)

watch(
  columns,
  () => {
    const normalized = normalizeValue(localValue.value)
    localValue.value = normalized
    // A columns change can invalidate the current selection; when normalization actually
    // altered it, push the corrected value back through v-model so the parent doesn't keep
    // a stale/invalid value the picker is no longer displaying.
    const current = Array.isArray(props.modelValue) ? props.modelValue : []
    if (!valuesEqual(normalized, current)) {
      emit('update:modelValue', normalized)
      emit('change', normalized)
    }
  },
  { flush: 'sync' },
)

/*
 * The column is a drum turned by hand, not a scroller with a wheel painted on
 * it.
 *
 * The painted version rotated rows that were still laid out and still had to be
 * clickable where they sat: a row's hit area travels with its transform, so the
 * centre row — pushed toward the viewer and enlarged by the perspective —
 * covered its neighbours and swallowed their clicks. Here the rows are stacked
 * on the centre line and carry no hit area at all; the column owns the pointer,
 * the wheel and the clicks, and reads a row back out of the geometry.
 *
 * Everything is driven by one number per column: `offset`, the position in rows,
 * fractional while it turns.
 */

/**
 * How far the eye sits in front of the drum, in radii. Close enough that rows
 * visibly narrow and flatten as they roll back; far enough that the centre row
 * is not distorted.
 */
const PERSPECTIVE_RADII = 3

/**
 * Where the drum turns out of sight. The eye sits `k + 1` radii from the axis,
 * so its tangent touches the drum at acos(1 / (k + 1)); past that a row faces
 * away from the eye and `backface-visibility` drops it.
 */
const LIMB_RAD = Math.acos(1 / (PERSPECTIVE_RADII + 1))

/**
 * Under this perspective the drum's silhouette reaches r * sqrt(k / (k + 2))
 * from the centre line; that is set to half the column, so the drum fills it
 * and the outer rows are seen rolling over its rim at any `visibleItemCount`.
 */
const LIMB_REACH = Math.sqrt(PERSPECTIVE_RADII / (PERSPECTIVE_RADII + 2))

const wheelRadiusPx = computed(() => {
  const half = (visibleCount.value * itemHeightPx.value) / 2
  return Math.round(half / LIMB_REACH)
})

/** step = 2 * atan((itemHeight / 2) / r): every row is a flat face of the drum, edge to edge with its neighbours. */
const wheelStepRad = computed(() => 2 * Math.atan(itemHeightPx.value / 2 / wheelRadiusPx.value))

/**
 * Rows past the limb are never seen, so only the ones before it are worth
 * rendering. A year column runs 1970..2100; drawing all 131 of them to show
 * eleven is what made the wheel stutter.
 */
const wheelWindow = computed(() => Math.ceil(LIMB_RAD / wheelStepRad.value))

/** Shared by the inline and popup columns so both render the same drum. */
const columnsStyle = computed(() => ({
  '--tx-picker-item-height': `${itemHeightPx.value}px`,
  '--tx-picker-visible-count': `${visibleCount.value}`,
  '--tx-picker-radius': `${wheelRadiusPx.value}px`,
  '--tx-picker-perspective': `${wheelRadiusPx.value * PERSPECTIVE_RADII}px`,
  '--tx-picker-step': `${Number(((wheelStepRad.value * 180) / Math.PI).toFixed(3))}`,
}))

/** How far a flick coasts: velocity in rows/ms times this, in rows. */
const MOMENTUM_MS = 260

const colRefs = ref<Array<HTMLElement | null>>([])
const offsets = ref<number[]>([])

interface WheelState {
  rafId: number | null
  settleId: number | null
  /** The row the running ease is heading to; meaningful only while `rafId` is set. */
  target: number
}

const wheelStates = ref<WheelState[]>([])

function ensureStates() {
  const n = columns.value.length
  if (wheelStates.value.length !== n)
    wheelStates.value = Array.from({ length: n }).map(() => ({ rafId: null, settleId: null, target: 0 }))
  if (offsets.value.length !== n)
    offsets.value = Array.from({ length: n }).map((_, i) => offsets.value[i] ?? 0)
}

function getIndexForValue(colIndex: number, v: any): number {
  const opts = columns.value[colIndex]?.options ?? []
  const idx = opts.findIndex(o => o.value === v)
  return Math.max(0, idx)
}

function clampIndex(colIndex: number, idx: number): number {
  const len = (columns.value[colIndex]?.options ?? []).length
  if (len <= 0)
    return 0
  return Math.min(len - 1, Math.max(0, idx))
}

function offsetOf(colIndex: number): number {
  return offsets.value[colIndex] ?? 0
}

function setOffset(colIndex: number, value: number) {
  ensureStates()
  const next = offsets.value.slice()
  next[colIndex] = value
  offsets.value = next
}

function stopWheel(colIndex: number) {
  const state = wheelStates.value[colIndex]
  if (state?.rafId != null) {
    cancelAnimationFrame(state.rafId)
    state.rafId = null
  }
}

/** Nearest enabled option to `idx`, searching outward; -1 when a column has none. */
function nearestEnabledIndex(colIndex: number, idx: number): number {
  const opts = columns.value[colIndex]?.options ?? []
  if (opts.length === 0)
    return -1
  const start = clampIndex(colIndex, idx)
  if (!opts[start]?.disabled)
    return start
  for (let step = 1; step < opts.length; step++) {
    const after = start + step
    if (after < opts.length && !opts[after]?.disabled)
      return after
    const before = start - step
    if (before >= 0 && !opts[before]?.disabled)
      return before
  }
  return -1
}

function setValueAt(colIndex: number, v: any) {
  if (props.disabled)
    return
  const next = localValue.value.slice()
  next[colIndex] = v
  const normalized = normalizeValue(next)
  if (valuesEqual(normalized, localValue.value))
    return
  localValue.value = normalized

  emit('update:modelValue', localValue.value)
  emit('change', localValue.value)
}

/**
 * Settling and coasting are motion the reader did not make; with reduced
 * motion the column lands on its row directly. Dragging still follows the
 * pointer, since that motion is the reader's own.
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Eases to a row and settles there. Cubic ease-out: quick to leave, slow to
 * arrive, which is the deceleration a flick is supposed to have.
 */
function goToIndex(colIndex: number, idx: number, animated = true) {
  ensureStates()
  const state = wheelStates.value[colIndex]
  if (!state)
    return

  stopWheel(colIndex)
  const to = clampIndex(colIndex, idx)
  state.target = to
  const from = offsetOf(colIndex)

  if (!animated || prefersReducedMotion() || Math.abs(to - from) < 0.001) {
    setOffset(colIndex, to)
    return
  }

  const distance = Math.abs(to - from)
  const duration = Math.min(620, 220 + distance * 55)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const startedAt = now()

  const step = () => {
    const t = Math.min(1, (now() - startedAt) / duration)
    const eased = 1 - (1 - t) ** 3
    setOffset(colIndex, from + (to - from) * eased)

    if (t < 1) {
      state.rafId = requestAnimationFrame(step)
      return
    }
    state.rafId = null
    setOffset(colIndex, to)
  }

  state.rafId = requestAnimationFrame(step)
}

/** Reads the row under the centre line and makes it the value. */
function commitOffset(colIndex: number) {
  const opts = columns.value[colIndex]?.options ?? []
  if (opts.length === 0)
    return
  const idx = nearestEnabledIndex(colIndex, Math.round(offsetOf(colIndex)))
  if (idx < 0)
    return
  setValueAt(colIndex, opts[idx]?.value)
}

/** Lands on the nearest enabled row once a turn stops. */
function settleWheel(colIndex: number) {
  const opts = columns.value[colIndex]?.options ?? []
  const idx = nearestEnabledIndex(colIndex, Math.round(offsetOf(colIndex)))
  if (idx < 0)
    return
  goToIndex(colIndex, idx)
  setValueAt(colIndex, opts[idx]?.value)
}

function scheduleSettle(colIndex: number, delay = 120) {
  ensureStates()
  const state = wheelStates.value[colIndex]
  if (!state)
    return
  if (state.settleId != null)
    window.clearTimeout(state.settleId)
  state.settleId = window.setTimeout(() => {
    state.settleId = null
    settleWheel(colIndex)
  }, delay)
}

interface DragState {
  pointerId: number
  startY: number
  startOffset: number
  lastY: number
  lastAt: number
  /** Rows per millisecond; positive means the column is travelling upward. */
  velocity: number
  moved: boolean
}

const drags = new Map<number, DragState>()
const isDragging = ref(false)

function onPointerDown(colIndex: number, event: PointerEvent) {
  if (props.disabled)
    return
  ensureStates()
  stopWheel(colIndex)

  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)

  drags.set(colIndex, {
    pointerId: event.pointerId,
    startY: event.clientY,
    startOffset: offsetOf(colIndex),
    lastY: event.clientY,
    lastAt: event.timeStamp,
    velocity: 0,
    moved: false,
  })
  isDragging.value = true
}

function onPointerMove(colIndex: number, event: PointerEvent) {
  const drag = drags.get(colIndex)
  if (!drag || drag.pointerId !== event.pointerId)
    return

  const dy = event.clientY - drag.startY
  if (Math.abs(dy) > 2)
    drag.moved = true

  setOffset(colIndex, clampIndex(colIndex, drag.startOffset - dy / itemHeightPx.value))

  const dt = event.timeStamp - drag.lastAt
  if (dt > 0)
    drag.velocity = -(event.clientY - drag.lastY) / itemHeightPx.value / dt
  drag.lastY = event.clientY
  drag.lastAt = event.timeStamp

  commitOffset(colIndex)
}

/**
 * The drum angle drawn at `dy` from the centre line.
 *
 * The front row sits on the screen plane and the eye `k` radii in front of it,
 * so a row turned by `a` is drawn at
 *   y = r * sin(a) * k / (k + 1 - cos(a)).
 * With u = y / r that is k * sin(a) + u * cos(a) = u * (k + 1), a phase-shifted
 * sine, so the angle comes back in closed form. Points beyond the drum's
 * silhouette resolve to its limb.
 */
function angleAt(dy: number): number {
  const k = PERSPECTIVE_RADII
  const u = Math.min(LIMB_REACH, Math.abs(dy) / wheelRadiusPx.value)
  const phase = Math.atan2(u, k)
  const ratio = Math.min(1, (u * (k + 1)) / Math.hypot(k, u))
  return Math.sign(dy) * (Math.asin(ratio) - phase)
}

/**
 * Which row sits under a point on the drum. Reading the projected geometry is
 * what lets the rows stay inert: the column hit-tests against what it drew,
 * instead of against transformed boxes that overlap each other.
 */
function pickFromPoint(colIndex: number, event: { clientY: number, currentTarget: EventTarget | null }) {
  if (props.disabled)
    return
  const el = event.currentTarget as HTMLElement | null
  if (typeof el?.getBoundingClientRect !== 'function')
    return

  const rect = el.getBoundingClientRect()
  const dy = event.clientY - (rect.top + rect.height / 2)
  const rows = angleAt(dy) / wheelStepRad.value

  const opts = columns.value[colIndex]?.options ?? []
  const idx = nearestEnabledIndex(colIndex, Math.round(offsetOf(colIndex) + rows))
  if (idx < 0)
    return
  goToIndex(colIndex, idx)
  setValueAt(colIndex, opts[idx]?.value)
}

function onPointerUp(colIndex: number, event: PointerEvent) {
  const drag = drags.get(colIndex)
  if (!drag || drag.pointerId !== event.pointerId)
    return
  drags.delete(colIndex)
  isDragging.value = drags.size > 0

  const target = event.currentTarget as HTMLElement | null
  target?.releasePointerCapture?.(event.pointerId)

  if (!drag.moved) {
    // A tap rather than a drag: the row under the finger is the one being asked for.
    pickFromPoint(colIndex, event)
    return
  }

  const opts = columns.value[colIndex]?.options ?? []
  // No coast under reduced motion: it would land rows away with no motion to show why.
  const velocity = prefersReducedMotion() ? 0 : drag.velocity
  const coasted = offsetOf(colIndex) + velocity * MOMENTUM_MS
  const idx = nearestEnabledIndex(colIndex, Math.round(coasted))
  if (idx < 0)
    return
  goToIndex(colIndex, idx)
  setValueAt(colIndex, opts[idx]?.value)
}

function onWheelEvent(colIndex: number, event: WheelEvent) {
  if (props.disabled)
    return
  ensureStates()
  stopWheel(colIndex)

  setOffset(colIndex, clampIndex(colIndex, offsetOf(colIndex) + event.deltaY / itemHeightPx.value))
  commitOffset(colIndex)
  scheduleSettle(colIndex)
}

function onColumnClick(colIndex: number, event: MouseEvent) {
  // A drag finishes through pointerup; only a plain click reaches here.
  if (isDragging.value)
    return
  pickFromPoint(colIndex, event)
}

/**
 * The rows worth drawing, each carrying its real index so the transform and the
 * ARIA position stay true to the whole column.
 */
function visibleRows(colIndex: number) {
  const opts = columns.value[colIndex]?.options ?? []
  const offset = offsetOf(colIndex)
  const first = Math.max(0, Math.floor(offset) - wheelWindow.value)
  const last = Math.min(opts.length - 1, Math.ceil(offset) + wheelWindow.value)

  const rows: Array<{ option: PickerColumn['options'][number], index: number }> = []
  for (let i = first; i <= last; i++) {
    const option = opts[i]
    if (option)
      rows.push({ option, index: i })
  }
  return rows
}

function columnStyle(colIndex: number) {
  return { '--tx-picker-offset': String(offsetOf(colIndex)) }
}

// --- Accessibility: listbox keyboard contract ---
// Each column scroller is a `role="listbox"` and every option a `role="option"`.
// The option buttons are pulled out of the tab sequence (`tabindex="-1"`) so focus
// stays on the listbox and `aria-activedescendant` conveys the active option;
// arrow keys then move the selection instead of stepping through every button.
const pickerId = `tx-picker-${useId()}`

function optionId(colIndex: number, optIndex: number): string {
  return `${pickerId}-c${colIndex}-o${optIndex}`
}

function activeDescendant(colIndex: number): string | undefined {
  const opts = columns.value[colIndex]?.options ?? []
  const idx = opts.findIndex(o => o.value === localValue.value[colIndex])
  return idx >= 0 ? optionId(colIndex, idx) : undefined
}

// Nearest non-disabled option walking from `from` in `step` direction; -1 if none.
function findEnabledIndex(colIndex: number, from: number, step: number): number {
  const opts = columns.value[colIndex]?.options ?? []
  for (let i = from; i >= 0 && i < opts.length; i += step) {
    if (!opts[i]?.disabled)
      return i
  }
  return -1
}

function onKeydown(colIndex: number, event: KeyboardEvent) {
  // Mirror the scroll path's disabled guard: an inert picker never moves.
  if (props.disabled)
    return

  const opts = columns.value[colIndex]?.options ?? []
  if (opts.length === 0)
    return

  const current = getIndexForValue(colIndex, localValue.value[colIndex])
  let target = -1

  switch (event.key) {
    case 'ArrowDown':
      target = findEnabledIndex(colIndex, current + 1, 1)
      break
    case 'ArrowUp':
      target = findEnabledIndex(colIndex, current - 1, -1)
      break
    case 'Home':
      target = findEnabledIndex(colIndex, 0, 1)
      break
    case 'End':
      target = findEnabledIndex(colIndex, opts.length - 1, -1)
      break
    default:
      return
  }

  // Arrow/Home/End scroll the listbox and the page natively; consume them even at
  // a boundary so the surrounding page never scrolls under the picker.
  event.preventDefault()

  if (target < 0 || target === current)
    return

  goToIndex(colIndex, target)
  setValueAt(colIndex, opts[target]?.value)
}

/**
 * Whether a column is already turning onto `idx` by itself: easing there, or
 * held by a drag or a wheel that has committed it. A controlled parent echoes
 * every value the picker emits back through `modelValue`; re-placing the column
 * on that echo would cancel the turn that produced it and snap the drum flat.
 */
function isTurningTo(colIndex: number, idx: number): boolean {
  const state = wheelStates.value[colIndex]
  if (state?.rafId != null)
    return state.target === idx
  if (drags.has(colIndex) || state?.settleId != null)
    return nearestEnabledIndex(colIndex, Math.round(offsetOf(colIndex))) === idx
  return false
}

/** Puts every column on its selected row, leaving alone the ones already turning there. */
async function syncOffsets(animated = false) {
  await nextTick()
  ensureStates()

  const v = localValue.value
  for (let i = 0; i < columns.value.length; i++) {
    const idx = getIndexForValue(i, v[i])
    if (!isTurningTo(i, idx))
      goToIndex(i, idx, animated)
  }
}

watch(
  open,
  async (v) => {
    if (v) {
      if (props.popup)
        popupZIndex.value = zIndexAllocator.next()
      emit('open')
      mountedOnce.value = true
      await syncOffsets()
      return
    }

    emit('close')
  },
  { flush: 'post' },
)

watch(
  () => props.modelValue,
  () => {
    if (!open.value && props.popup)
      return
    syncOffsets()
  },
)

watch(
  columns,
  () => {
    if (!open.value && props.popup)
      return
    syncOffsets()
  },
)

function close() {
  open.value = false
}

function onMaskClick() {
  if (!props.closeOnClickMask)
    return
  close()
}

function onCancel() {
  emit('cancel')
  close()
}

function onConfirm() {
  emit('confirm', localValue.value)
  close()
}

defineExpose({
  open: () => (open.value = true),
  close,
  toggle: () => (open.value = !open.value),
})

onMounted(() => {
  // Popup mode syncs on open via the `open` watcher; inline mode has no such
  // trigger, so a picker mounted with a non-first modelValue would render the
  // highlight over the wrong option without this initial sync.
  if (!props.popup)
    syncOffsets()
})

onBeforeUnmount(() => {
  for (const state of wheelStates.value) {
    if (state.rafId != null)
      cancelAnimationFrame(state.rafId)
    if (state.settleId != null)
      window.clearTimeout(state.settleId)
  }
  drags.clear()
})
</script>

<template>
  <div v-if="!popup" class="tx-picker" :class="{ 'is-disabled': disabled }">
    <div v-if="showToolbar" class="tx-picker__toolbar">
      <button type="button" class="tx-picker__btn" :disabled="disabled" @click="onCancel">
        {{ cancelText }}
      </button>
      <div class="tx-picker__title">
        {{ title }}
      </div>
      <button type="button" class="tx-picker__btn is-primary" :disabled="disabled" @click="onConfirm">
        {{ confirmText }}
      </button>
    </div>

    <div class="tx-picker__columns" :style="columnsStyle">
      <div class="tx-picker__highlight" aria-hidden="true" />

      <div v-for="(col, colIndex) in columns" :key="col.key ?? colIndex" class="tx-picker__col">
        <div
          :ref="(el) => (colRefs[colIndex] = el as HTMLElement)"
          class="tx-picker__wheel"
          role="listbox"
          :tabindex="disabled ? -1 : 0"
          :aria-activedescendant="activeDescendant(colIndex)"
          :style="columnStyle(colIndex)"
          @keydown="onKeydown(colIndex, $event)"
          @pointerdown="onPointerDown(colIndex, $event)"
          @pointermove="onPointerMove(colIndex, $event)"
          @pointerup="onPointerUp(colIndex, $event)"
          @pointercancel="onPointerUp(colIndex, $event)"
          @wheel.prevent="onWheelEvent(colIndex, $event)"
          @click="onColumnClick(colIndex, $event)"
        >
          <div
            v-for="row in visibleRows(colIndex)"
            :id="optionId(colIndex, row.index)"
            :key="String(row.option.value)"
            class="tx-picker__item"
            role="option"
            :aria-selected="localValue[colIndex] === row.option.value"
            :aria-disabled="row.option.disabled || undefined"
            :aria-setsize="col.options.length"
            :aria-posinset="row.index + 1"
            :class="{ 'is-disabled': !!row.option.disabled, 'is-selected': localValue[colIndex] === row.option.value }"
            :style="{ '--tx-picker-index': row.index }"
          >
            {{ row.option.label }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport v-else to="body">
    <Transition name="tx-picker-popup">
      <div v-if="open && (!lazyMount || mountedOnce)" class="tx-picker-popup" :style="{ zIndex: popupZIndex }">
        <div class="tx-picker-popup__mask" @click="onMaskClick" />

        <div class="tx-picker-popup__panel" :class="{ 'is-disabled': disabled }">
          <div v-if="showToolbar" class="tx-picker__toolbar">
            <button type="button" class="tx-picker__btn" :disabled="disabled" @click="onCancel">
              {{ cancelText }}
            </button>
            <div class="tx-picker__title">
              {{ title }}
            </div>
            <button type="button" class="tx-picker__btn is-primary" :disabled="disabled" @click="onConfirm">
              {{ confirmText }}
            </button>
          </div>

          <div class="tx-picker__columns" :style="columnsStyle">
            <div class="tx-picker__highlight" aria-hidden="true" />

            <div v-for="(col, colIndex) in columns" :key="col.key ?? colIndex" class="tx-picker__col">
              <div
                :ref="(el) => (colRefs[colIndex] = el as HTMLElement)"
                class="tx-picker__wheel"
                role="listbox"
                :tabindex="disabled ? -1 : 0"
                :aria-activedescendant="activeDescendant(colIndex)"
                :style="columnStyle(colIndex)"
                @keydown="onKeydown(colIndex, $event)"
                @pointerdown="onPointerDown(colIndex, $event)"
                @pointermove="onPointerMove(colIndex, $event)"
                @pointerup="onPointerUp(colIndex, $event)"
                @pointercancel="onPointerUp(colIndex, $event)"
                @wheel.prevent="onWheelEvent(colIndex, $event)"
                @click="onColumnClick(colIndex, $event)"
              >
                <div
                  v-for="row in visibleRows(colIndex)"
                  :id="optionId(colIndex, row.index)"
                  :key="String(row.option.value)"
                  class="tx-picker__item"
                  role="option"
                  :aria-selected="localValue[colIndex] === row.option.value"
                  :aria-disabled="row.option.disabled || undefined"
                  :aria-setsize="col.options.length"
                  :aria-posinset="row.index + 1"
                  :class="{ 'is-disabled': !!row.option.disabled, 'is-selected': localValue[colIndex] === row.option.value }"
                  :style="{ '--tx-picker-index': row.index }"
                >
                  {{ row.option.label }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-picker {
  --tx-picker-item-height: 36px;

  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 72%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent);
}

.tx-picker__toolbar {
  display: grid;
  grid-template-columns: 88px 1fr 88px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 60%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 70%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-picker__title {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-picker__btn {
  border: none;
  background: transparent;
  padding: 6px 8px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &.is-primary {
    color: var(--tx-color-primary, #409eff);
  }
}

.tx-picker__columns {
  position: relative;
  display: flex;
  width: 100%;
  height: calc(var(--tx-picker-item-height) * var(--tx-picker-visible-count, 5));
}

.tx-picker__col {
  flex: 1;
  min-width: 0;
}

/*
 * The drum. It owns the pointer, the wheel and the clicks, so `touch-action`
 * hands the vertical axis over completely — the page must not scroll while a
 * column is being turned.
 */
.tx-picker__wheel {
  position: relative;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  // The eye sits a few radii in front of the drum (set in script, with the
  // radius), close enough that rows narrow as they roll back over the rim.
  perspective: var(--tx-picker-perspective, 348px);
  perspective-origin: 50% 50%;
  // The drum fills the column, so height here is angle on the drum: the fade
  // darkens the surface toward its rim instead of cutting the side rows off.
  mask-image: linear-gradient(
    to bottom,
    rgb(0 0 0 / 0.1) 0%,
    rgb(0 0 0 / 0.55) 12%,
    #000 32%,
    #000 68%,
    rgb(0 0 0 / 0.55) 88%,
    rgb(0 0 0 / 0.1) 100%
  );

  &:active {
    cursor: grabbing;
  }
}

/*
 * Rows are stacked on the centre line and placed on the drum from there, so
 * none of them carries a layout offset that a rotation would swing it away
 * from. `pointer-events: none` is the other half of the fix: transformed rows
 * overlap, and the enlarged centre row used to swallow the clicks meant for its
 * neighbours. The column hit-tests against the geometry instead.
 *
 * Read right to left: out to the surface, round by the row's angle, then the
 * whole drum back by one radius. That last step keeps the front row on the
 * screen plane — exactly one row high, under the highlight — so the others
 * recede from it rather than the drum swelling toward the viewer.
 */
.tx-picker__item {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--tx-picker-item-height);
  margin-top: calc(var(--tx-picker-item-height) / -2);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
  pointer-events: none;
  user-select: none;
  backface-visibility: hidden;
  transform:
    translateZ(calc(var(--tx-picker-radius, 116px) * -1))
    rotateX(calc((var(--tx-picker-offset, 0) - var(--tx-picker-index, 0)) * var(--tx-picker-step, 17.641) * 1deg))
    translateZ(var(--tx-picker-radius, 116px));
  transition: color 0.18s ease, font-weight 0.18s ease;

  &.is-selected {
    color: var(--tx-text-color-primary, #303133);
    font-weight: 600;
  }

  &.is-disabled {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-picker__item {
    transition: none;
  }
}

.tx-picker__highlight {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 50%;
  height: var(--tx-picker-item-height);
  transform: translateY(-50%);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);
  pointer-events: none;
}

.tx-picker-popup {
  position: fixed;
  inset: 0;
}

.tx-picker-popup__mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}

.tx-picker-popup__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 18px 18px 0 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 78%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 60%, transparent);
}

.tx-picker-popup-enter-active,
.tx-picker-popup-leave-active {
  transition: opacity 0.18s ease;
}

.tx-picker-popup-enter-from,
.tx-picker-popup-leave-to {
  opacity: 0;
}

.tx-picker-popup-enter-active .tx-picker-popup__panel,
.tx-picker-popup-leave-active .tx-picker-popup__panel {
  transition: transform 0.22s ease;
}

.tx-picker-popup-enter-from .tx-picker-popup__panel,
.tx-picker-popup-leave-to .tx-picker-popup__panel {
  transform: translateY(18px);
}

.is-disabled {
  opacity: 0.7;
}

.is-disabled .tx-picker__wheel {
  pointer-events: none;
  cursor: not-allowed;
}
</style>
