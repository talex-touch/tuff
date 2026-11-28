<script setup lang="ts">
import type { PickerColumn, PickerEmits, PickerProps, PickerValue } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import TxEdgeFadeMask from '../../edge-fade-mask/src/TxEdgeFadeMask.vue'

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
    // `flush: 'sync'` can run before the `modelValue` watcher copies a newly
    // updated prop into `localValue`. Reading the latest `props.modelValue`
    // avoids re-emitting the stale value when a parent updates both together.
    const current = Array.isArray(props.modelValue) ? props.modelValue : []
    const source = current.length > 0 ? current : localValue.value
    const normalized = normalizeValue(source)
    localValue.value = normalized
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

/** Top/bottom edge fade depth (px) passed to TxEdgeFadeMask so outer items dissolve cleanly. */
const fadeSizePx = computed(() => Math.round(itemHeightPx.value * Math.max(1.25, (visibleCount.value - 1) / 2.8)))

/** Shared by the inline and popup columns so both render the same drum. */
const columnsStyle = computed(() => ({
  '--tx-picker-item-height': `${itemHeightPx.value}px`,
  '--tx-picker-visible-count': `${visibleCount.value}`,
  '--tx-picker-radius': `${wheelRadiusPx.value}px`,
  '--tx-picker-perspective': `${wheelRadiusPx.value * PERSPECTIVE_RADII}px`,
  '--tx-picker-step': `${Number(((wheelStepRad.value * 180) / Math.PI).toFixed(3))}`,
}))

/** Exponential friction time constant (ms): v(t) = v0 * exp(-t / tau), coast distance = v0 * tau. */
const MOMENTUM_TAU_MS = 260
/** Time window (ms) over which pointer drag samples are averaged for release velocity. */
const VELOCITY_WINDOW_MS = 95
/** Pointer pause threshold (ms): holding still longer than this before release zeroes momentum. */
const VELOCITY_STALE_MS = 85
/** Maximum release velocity (rows/ms) to keep extreme flicks controllable. */
const MAX_VELOCITY = 0.14
/** Soft rubber-band overscroll cap (in rows) past either end of the column. */
const MAX_OVERSCROLL = 1.35
/** Critically-damped spring angular frequency (rad/ms) for snapping and clicks. */
const SNAP_SPRING_OMEGA = 0.024
/** Tighter critically-damped spring angular frequency (rad/ms) for discrete mouse-wheel detents. */
const WHEEL_SPRING_OMEGA = 0.032
/** Idle delay (ms) after the last wheel event before snapping onto the nearest row. */
const WHEEL_SETTLE_DELAY_MS = 65
/** Idle gap (ms) + minimum pixel step used to distinguish discrete mouse clicks from trackpad streams. */
const WHEEL_DISCRETE_GAP_MS = 90
const WHEEL_DISCRETE_MIN_PX = 48
/** Velocity threshold (rows/ms) below which inertial coast hands off to the snap spring. */
const SPRING_HANDOFF_VELOCITY = 0.0028
/** Rubber-band boundary damping time constant (ms) when coasting past min/max bounds. */
const BOUNDS_DAMPING_TAU_MS = 45
const SETTLE_POS_EPSILON = 0.0008
const SETTLE_VEL_EPSILON = 0.00008

const colRefs = ref<Array<HTMLElement | null>>([])
const offsets = ref<number[]>([])

interface WheelState {
  rafId: number | null
  settleId: number | null
  /** The row the running motion is heading to; meaningful while `rafId` is active. */
  target: number
  /** Current angular velocity in rows/ms for C1 continuity across handoffs and retargets. */
  velocity: number
  /** Accumulated fractional target during wheel/trackpad scrolling. */
  wheelTarget: number | null
  /** Un-rubber-banded virtual offset during an active wheel gesture for crisp direction reversals. */
  rawWheelOffset: number | null
  /** Timestamp of the previous wheel event to tell continuous trackpad streams from discrete clicks. */
  lastWheelAt: number
}

const wheelStates = ref<WheelState[]>([])

function ensureStates() {
  const n = columns.value.length
  if (wheelStates.value.length !== n) {
    wheelStates.value = Array.from({ length: n }).map(() => ({
      rafId: null,
      settleId: null,
      target: 0,
      velocity: 0,
      wheelTarget: null,
      rawWheelOffset: null,
      lastWheelAt: 0,
    }))
  }
  if (offsets.value.length !== n)
    offsets.value = Array.from({ length: n }).map((_, i) => offsets.value[i] ?? 0)
}

function getIndexForValue(colIndex: number, v: any): number {
  const opts = columns.value[colIndex]?.options ?? []
  const idx = opts.findIndex(o => o.value === v)
  return Math.max(0, idx)
}

function maxIndex(colIndex: number): number {
  const len = (columns.value[colIndex]?.options ?? []).length
  return Math.max(0, len - 1)
}

function clampIndex(colIndex: number, idx: number): number {
  const max = maxIndex(colIndex)
  return Math.min(max, Math.max(0, idx))
}

/**
 * Asymptotic iOS-style rubber-band resistance past `[0, maxIndex]`.
 * Derivative is 1 at the boundary (seamless entry) and caps at `MAX_OVERSCROLL`.
 */
function applyRubberBand(colIndex: number, raw: number): number {
  const max = maxIndex(colIndex)
  if (raw < 0) {
    const over = -raw
    return -(over * MAX_OVERSCROLL) / (over + MAX_OVERSCROLL)
  }
  if (raw > max) {
    const over = raw - max
    return max + (over * MAX_OVERSCROLL) / (over + MAX_OVERSCROLL)
  }
  return raw
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

function clearSettleTimer(colIndex: number) {
  const state = wheelStates.value[colIndex]
  if (state?.settleId != null) {
    window.clearTimeout(state.settleId)
    state.settleId = null
  }
}

function stopWheel(colIndex: number, resetVelocity = true) {
  const state = wheelStates.value[colIndex]
  if (state?.rafId != null) {
    cancelAnimationFrame(state.rafId)
    state.rafId = null
  }
  if (state && resetVelocity)
    state.velocity = 0
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

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * Runs frame-rate-independent wheel physics in `requestAnimationFrame`:
 * - Optional inertial coasting with exact exponential friction deceleration
 *   (`v(t) = v0 * exp(-t / MOMENTUM_TAU_MS)`) and soft rubber-band boundary damping;
 * - Seamless C1-continuous handoff into an exact analytical critically-damped
 *   spring (`x'' + 2ω x' + ω² x = 0`) settling cleanly onto `target`.
 */
function startWheelPhysics(
  colIndex: number,
  target: number,
  options: {
    initialVelocity?: number
    coast?: boolean
    omega?: number
    allowOverscrollTarget?: boolean
  } = {},
) {
  ensureStates()
  const state = wheelStates.value[colIndex]
  if (!state)
    return

  const initialVelocity = options.initialVelocity ?? state.velocity
  stopWheel(colIndex, false)

  const resolvedTarget = options.allowOverscrollTarget ? target : clampIndex(colIndex, target)
  state.target = resolvedTarget
  const from = offsetOf(colIndex)

  if (
    prefersReducedMotion()
    || (Math.abs(resolvedTarget - from) < SETTLE_POS_EPSILON && Math.abs(initialVelocity) < SETTLE_VEL_EPSILON)
  ) {
    state.velocity = 0
    setOffset(colIndex, resolvedTarget)
    return
  }

  let pos = from
  let vel = initialVelocity
  const omega = options.omega ?? SNAP_SPRING_OMEGA
  const max = maxIndex(colIndex)
  const overscrolledOutward = (pos < 0 && vel <= 0) || (pos > max && vel >= 0)
  let phase: 'coast' | 'spring' = options.coast && !overscrolledOutward && Math.abs(vel) > SPRING_HANDOFF_VELOCITY
    ? 'coast'
    : 'spring'
  let prevAt = nowMs()

  const step = () => {
    const currentAt = nowMs()
    const dt = Math.min(32, Math.max(1, currentAt - prevAt))
    prevAt = currentAt

    if (phase === 'coast') {
      const decay = Math.exp(-dt / MOMENTUM_TAU_MS)
      pos += vel * MOMENTUM_TAU_MS * (1 - decay)
      vel *= decay

      const outLow = pos < 0
      const outHigh = pos > max
      if (outLow || outHigh) {
        vel *= Math.exp(-dt / BOUNDS_DAMPING_TAU_MS)
        pos = Math.min(max + MAX_OVERSCROLL, Math.max(-MAX_OVERSCROLL, pos))
        const overscroll = outLow ? -pos : pos - max
        const movingBack = (outLow && vel >= 0) || (outHigh && vel <= 0)
        if (movingBack || Math.abs(vel) <= SPRING_HANDOFF_VELOCITY * 1.4 || overscroll >= MAX_OVERSCROLL * 0.72)
          phase = 'spring'
      }
      else {
        const remaining = resolvedTarget - pos
        const movingAway = remaining * vel < 0
        if (movingAway || Math.abs(remaining) <= 0.65 || Math.abs(vel) <= SPRING_HANDOFF_VELOCITY)
          phase = 'spring'
      }
    }
    else {
      // Exact analytical critically-damped harmonic oscillator (zeta = 1).
      const x = pos - resolvedTarget
      const exp = Math.exp(-omega * dt)
      const c2 = vel + omega * x
      pos = resolvedTarget + (x + c2 * dt) * exp
      vel = (vel - omega * c2 * dt) * exp
    }

    state.velocity = vel
    if (
      phase === 'spring'
      && Math.abs(pos - resolvedTarget) < SETTLE_POS_EPSILON
      && Math.abs(vel) < SETTLE_VEL_EPSILON
    ) {
      state.rafId = null
      state.velocity = 0
      setOffset(colIndex, resolvedTarget)
      return
    }

    setOffset(colIndex, pos)
    state.rafId = requestAnimationFrame(step)
  }

  state.rafId = requestAnimationFrame(step)
}

/**
 * Springs to a row and settles there (or jumps immediately when un-animated / reduced motion).
 */
function goToIndex(colIndex: number, idx: number, animated = true) {
  ensureStates()
  const state = wheelStates.value[colIndex]
  if (!state)
    return

  clearSettleTimer(colIndex)
  state.wheelTarget = null
  state.rawWheelOffset = null
  const to = clampIndex(colIndex, idx)
  state.target = to

  if (!animated || prefersReducedMotion()) {
    stopWheel(colIndex)
    setOffset(colIndex, to)
    return
  }

  startWheelPhysics(colIndex, to, { coast: false, omega: SNAP_SPRING_OMEGA })
}

/** Reads the row under the centre line and makes it the value. */
function commitOffset(colIndex: number, sourceOffset = offsetOf(colIndex)) {
  const opts = columns.value[colIndex]?.options ?? []
  if (opts.length === 0)
    return
  const idx = nearestEnabledIndex(colIndex, Math.round(clampIndex(colIndex, sourceOffset)))
  if (idx < 0)
    return
  setValueAt(colIndex, opts[idx]?.value)
}

/** Lands on the nearest enabled row once a turn stops. */
function settleWheel(colIndex: number) {
  ensureStates()
  const state = wheelStates.value[colIndex]
  const opts = columns.value[colIndex]?.options ?? []
  const reference = state?.wheelTarget ?? offsetOf(colIndex)
  const idx = nearestEnabledIndex(colIndex, Math.round(clampIndex(colIndex, reference)))
  if (idx < 0)
    return
  if (state) {
    state.wheelTarget = null
    state.rawWheelOffset = null
    state.velocity = 0
  }
  goToIndex(colIndex, idx)
  setValueAt(colIndex, opts[idx]?.value)
}

function scheduleSettle(colIndex: number, delay = WHEEL_SETTLE_DELAY_MS) {
  ensureStates()
  const state = wheelStates.value[colIndex]
  if (!state)
    return
  clearSettleTimer(colIndex)
  state.settleId = window.setTimeout(() => {
    state.settleId = null
    settleWheel(colIndex)
  }, delay)
}

interface VelocitySample {
  y: number
  t: number
}

interface DragState {
  pointerId: number
  startY: number
  startOffset: number
  samples: VelocitySample[]
  moved: boolean
}

const drags = new Map<number, DragState>()
const isDragging = ref(false)

/** Computes release velocity (rows/ms) from samples within the recent ~95ms window. */
function computeDragVelocity(samples: VelocitySample[], releaseAt: number): number {
  if (samples.length < 2)
    return 0
  const latest = samples[samples.length - 1]!
  if (releaseAt - latest.t > VELOCITY_STALE_MS)
    return 0

  const windowStart = latest.t - VELOCITY_WINDOW_MS
  let oldest = samples[0]!
  for (let i = samples.length - 2; i >= 0; i--) {
    const sample = samples[i]!
    oldest = sample
    if (sample.t <= windowStart)
      break
  }

  const dt = latest.t - oldest.t
  if (dt <= 0)
    return 0

  const rawVel = -(latest.y - oldest.y) / itemHeightPx.value / dt
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, rawVel))
}

function onPointerDown(colIndex: number, event: PointerEvent) {
  if (props.disabled)
    return
  ensureStates()
  clearSettleTimer(colIndex)
  stopWheel(colIndex)
  const state = wheelStates.value[colIndex]
  if (state) {
    state.wheelTarget = null
    state.rawWheelOffset = null
  }

  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)

  drags.set(colIndex, {
    pointerId: event.pointerId,
    startY: event.clientY,
    startOffset: offsetOf(colIndex),
    samples: [{ y: event.clientY, t: event.timeStamp }],
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

  setOffset(colIndex, applyRubberBand(colIndex, drag.startOffset - dy / itemHeightPx.value))

  drag.samples.push({ y: event.clientY, t: event.timeStamp })
  const cutoff = event.timeStamp - VELOCITY_WINDOW_MS
  while (drag.samples.length > 2 && drag.samples[1]!.t < cutoff)
    drag.samples.shift()

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
  const current = offsetOf(colIndex)
  // No coast under reduced motion: it would land rows away with no motion to show why.
  const velocity = prefersReducedMotion() ? 0 : computeDragVelocity(drag.samples, event.timeStamp)
  const projected = current + velocity * MOMENTUM_TAU_MS
  const idx = nearestEnabledIndex(colIndex, Math.round(clampIndex(colIndex, projected)))
  if (idx < 0)
    return

  if (prefersReducedMotion()) {
    goToIndex(colIndex, idx, false)
  }
  else {
    startWheelPhysics(colIndex, idx, {
      initialVelocity: velocity,
      coast: Math.abs(velocity) > SPRING_HANDOFF_VELOCITY,
      omega: SNAP_SPRING_OMEGA,
    })
  }
  setValueAt(colIndex, opts[idx]?.value)
}

function normalizeWheelRows(event: WheelEvent): number {
  let deltaPx = event.deltaY
  if (event.deltaMode === 1)
    deltaPx *= itemHeightPx.value
  else if (event.deltaMode === 2)
    deltaPx *= itemHeightPx.value * visibleCount.value
  return deltaPx / itemHeightPx.value
}

function clampRawWheelOffset(colIndex: number, raw: number): number {
  const max = maxIndex(colIndex)
  const cap = MAX_OVERSCROLL * 3
  return Math.min(max + cap, Math.max(-cap, raw))
}

function onWheelEvent(colIndex: number, event: WheelEvent) {
  if (props.disabled)
    return
  ensureStates()
  const state = wheelStates.value[colIndex]
  if (!state)
    return

  const now = event.timeStamp || nowMs()
  const dt = state.lastWheelAt > 0 ? now - state.lastWheelAt : Number.POSITIVE_INFINITY
  state.lastWheelAt = now

  const deltaRows = normalizeWheelRows(event)
  const isDiscreteWheel = event.deltaMode !== 0
    || (dt > WHEEL_DISCRETE_GAP_MS && Math.abs(event.deltaY) >= WHEEL_DISCRETE_MIN_PX && Number.isInteger(event.deltaY))

  if (isDiscreteWheel) {
    const base = state.wheelTarget ?? offsetOf(colIndex)
    const nextRaw = clampRawWheelOffset(colIndex, base + deltaRows)
    const nextTarget = applyRubberBand(colIndex, nextRaw)
    state.rawWheelOffset = nextRaw
    state.wheelTarget = nextTarget

    if (prefersReducedMotion()) {
      stopWheel(colIndex)
      setOffset(colIndex, clampIndex(colIndex, nextTarget))
    }
    else {
      startWheelPhysics(colIndex, nextTarget, {
        coast: false,
        omega: WHEEL_SPRING_OMEGA,
        allowOverscrollTarget: true,
      })
    }

    commitOffset(colIndex, nextTarget)
    scheduleSettle(colIndex, 80)
    return
  }

  // Continuous trackpad / high-res wheel stream: apply directly on the exact frame
  // so the drum stays glued 1:1 to the fingers (OS provides native pixel inertia)
  // and only engage the snap spring once the gesture pauses.
  stopWheel(colIndex, false)
  const baseRaw = state.rawWheelOffset ?? offsetOf(colIndex)
  const nextRaw = clampRawWheelOffset(colIndex, baseRaw + deltaRows)
  const nextOffset = prefersReducedMotion()
    ? clampIndex(colIndex, nextRaw)
    : applyRubberBand(colIndex, nextRaw)

  state.rawWheelOffset = nextRaw
  state.wheelTarget = nextOffset
  state.velocity = dt > 0 && dt < 64
    ? Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, deltaRows / dt))
    : 0

  setOffset(colIndex, nextOffset)
  commitOffset(colIndex, nextOffset)
  scheduleSettle(colIndex, WHEEL_SETTLE_DELAY_MS)
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
  const opts = columns.value[colIndex]?.options ?? []
  const state = wheelStates.value[colIndex]
  if (drags.has(colIndex) || state?.settleId != null) {
    const reference = state?.wheelTarget ?? offsetOf(colIndex)
    return nearestEnabledIndex(colIndex, Math.round(clampIndex(colIndex, reference))) === idx
  }
  if (state?.rafId != null) {
    if (state.target < 0 || state.target > opts.length - 1)
      return false
    return nearestEnabledIndex(colIndex, Math.round(state.target)) === idx
  }
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
    if (state.rafId != null) {
      cancelAnimationFrame(state.rafId)
      state.rafId = null
    }
    if (state.settleId != null) {
      window.clearTimeout(state.settleId)
      state.settleId = null
    }
    state.velocity = 0
    state.wheelTarget = null
    state.rawWheelOffset = null
  }
  drags.clear()
  isDragging.value = false
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
        <TxEdgeFadeMask
          class="tx-picker__mask"
          axis="vertical"
          :size="fadeSizePx"
          always
          :observe-resize="false"
        >
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
        </TxEdgeFadeMask>
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
              <TxEdgeFadeMask
                class="tx-picker__mask"
                axis="vertical"
                :size="fadeSizePx"
                always
                :observe-resize="false"
              >
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
              </TxEdgeFadeMask>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

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
  font-weight: var(--tx-font-weight-semibold, 600);
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
  height: 100%;
}

.tx-picker__mask {
  width: 100%;
  height: 100%;
}

/*
 * The drum. It owns the pointer, the wheel and the clicks, so `touch-action`
 * hands the vertical axis over completely — the page must not scroll while a
 * column is being turned. Top and bottom fade transitions are owned by the
 * surrounding `TxEdgeFadeMask`.
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
  transition: color 0.1s ease;

  &.is-selected {
    color: var(--tx-text-color-primary, #303133);
    font-weight: var(--tx-font-weight-semibold, 600);
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

// High contrast: the panel, its toolbar and the popup sheet are opaque, and nothing behind them
// is frosted.
.tx-picker,
.tx-picker__toolbar,
.tx-picker-popup__panel {
  @include tx-when-high-contrast {
    background: var(--tx-bg-color-overlay, #fff);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
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
