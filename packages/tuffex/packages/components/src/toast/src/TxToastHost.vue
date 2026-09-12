<script setup lang="ts">
import type { ComponentPublicInstance, PropType } from 'vue'
import type { TxToastItem, TxToastVariant } from '../../../../utils/toast'
import type { TxToastPosition } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dismissToast, pauseToasts, resumeToasts, toastStore } from '../../../../utils/toast'
import { TxIcon } from '../../icon'
import { claimToastHost, ownsToastHost, releaseToastHost } from './host-registry'

defineOptions({
  name: 'TxToastHost',
})

/**
 * Declared as a runtime object rather than `defineProps<TxToastHostProps>()`:
 * the SFC compiler does not re-resolve a sibling `types.ts` when it changes, so
 * a prop added there ships as an unknown attribute until the dev server
 * restarts. `TxToastHostProps` stays the public type; this is the wiring.
 */
const props = defineProps({
  position: { type: String as PropType<TxToastPosition>, default: 'bottom-right' },
  visibleToasts: { type: Number, default: 3 },
  expand: { type: Boolean, default: false },
  gap: { type: Number, default: 14 },
  offset: { type: Number, default: 16 },
  swipeToDismiss: { type: Boolean, default: true },
})

const GLYPHS: Record<TxToastVariant, string> = {
  default: '',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
}

const hostRef = ref<ComponentPublicInstance | null>(null)
const hovered = ref(false)
const focused = ref(false)

/** Measured natural height per toast id, keyed so it survives re-ordering. */
const heights = ref<Record<string, number>>({})

/**
 * Identity for the single-owner claim. A second host on the page renders its
 * container but no toasts, so the queue is never drawn twice.
 */
const token = Symbol('tx-toast-host')
// Derived rather than latched, so a second host takes over the moment the first
// one unmounts instead of leaving the page with no stack at all.
const owns = computed(() => ownsToastHost(token))

const items = computed(() => (owns.value ? toastStore.items : []))
const isTop = computed(() => props.position.startsWith('top'))
/** Which way the stack grows: down from a top edge, up from a bottom one. */
const lift = computed(() => (isTop.value ? 1 : -1))
const expanded = computed(() => props.expand || hovered.value || focused.value)

/**
 * Position of every toast in the stack, newest first. `depth` 0 is the toast in
 * front; `offset` is how far back it sits once the stack expands, which is the
 * running total of the heights ahead of it plus one gap each.
 */
const geometry = computed(() => {
  const list = items.value
  const map: Record<string, { depth: number, offset: number, height: number }> = {}
  let running = 0

  // Walk the store backwards: the last item pushed is the card in front.
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (!item)
      continue
    const height = heights.value[item.id] ?? 0
    map[item.id] = { depth: list.length - 1 - i, offset: running, height }
    running += height + props.gap
  }

  return map
})

/**
 * The host is the hover target, so it has to cover exactly what the stack
 * occupies — no more, or it would swallow clicks meant for the page behind it.
 */
const stackHeight = computed(() => {
  const list = items.value
  if (!list.length)
    return 0

  const shown = Math.min(list.length, props.visibleToasts)
  const map = geometry.value

  if (expanded.value) {
    const deepest = map[list[list.length - shown]?.id ?? '']
    return deepest ? deepest.offset + deepest.height : 0
  }

  const front = map[list[list.length - 1]?.id ?? '']
  return front ? front.height + (shown - 1) * props.gap : 0
})

const hostStyle = computed(() => ({
  zIndex: toastStore.zIndex,
  height: `${stackHeight.value}px`,
  '--tx-toast-gap': `${props.gap}px`,
  '--tx-toast-edge': `${props.offset}px`,
  '--tx-toast-shift': isTop.value ? '-100%' : '100%',
}))

const swipe = ref<{ id: string, pointerId: number, startY: number, dy: number, startedAt: number } | null>(null)

function toastStyle(item: TxToastItem): Record<string, string | number> {
  const { depth, offset, height } = geometry.value[item.id] ?? { depth: 0, offset: 0, height: 0 }
  const front = geometry.value[items.value[items.value.length - 1]?.id ?? '']

  // Until the resize observer reports a height, leave the box to lay itself
  // out — clamping it to 0 would keep it from ever having one to measure.
  const collapsedHeight = front?.height ? `${front.height}px` : 'auto'
  const naturalHeight = height ? `${height}px` : 'auto'

  return {
    zIndex: items.value.length - depth,
    height: expanded.value || depth === 0 ? naturalHeight : collapsedHeight,
    transformOrigin: isTop.value ? 'top center' : 'bottom center',
    '--tx-toast-y': `${lift.value * (expanded.value ? offset : depth * props.gap)}px`,
    '--tx-toast-scale': expanded.value ? 1 : Math.max(0, 1 - depth * 0.05),
    '--tx-toast-swipe': swipe.value?.id === item.id ? `${swipe.value.dy}px` : '0px',
  }
}

function depthOf(item: TxToastItem): number {
  return geometry.value[item.id]?.depth ?? 0
}

function isInteractive(item: TxToastItem): boolean {
  const depth = depthOf(item)
  if (depth >= props.visibleToasts)
    return false
  return expanded.value || depth === 0
}

// --- measurement -----------------------------------------------------------

let observer: ResizeObserver | null = null
const observed = new Map<string, Element>()

function measure(id: string, node: Element): void {
  // `offsetHeight` and the observer both report the *layout* box, so the stack's
  // own `scale()` does not feed back into the number. `getBoundingClientRect()`
  // would, and every toast behind the front one is scaled down.
  heights.value[id] = (node as HTMLElement).offsetHeight
}

function registerToast(id: string, el: Element | ComponentPublicInstance | null): void {
  const node = (el as ComponentPublicInstance | null)?.$el ?? (el as Element | null)
  const previous = observed.get(id)
  if (previous === node)
    return

  if (previous) {
    observer?.unobserve(previous)
    observed.delete(id)
  }

  if (!node) {
    delete heights.value[id]
    return
  }

  observed.set(id, node)
  observer?.observe(node)
  measure(id, node)
}

onMounted(() => {
  const claimed = claimToastHost(token)

  if (!claimed && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[TxToastHost] A toast host is already mounted. Toasts render once, from the first '
      + 'host, so this one stays empty — mount a single host near the app root.',
    )
  }

  if (typeof ResizeObserver === 'undefined')
    return

  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const id = [...observed.entries()].find(([, node]) => node === entry.target)?.[0]
      if (!id)
        continue
      const box = entry.borderBoxSize?.[0]
      heights.value[id] = box ? box.blockSize : (entry.target as HTMLElement).offsetHeight
    }
  })

  observed.forEach(node => observer?.observe(node))
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  observed.clear()
  releaseToastHost(token)
  // A host that unmounts while hovered would otherwise leave every countdown
  // held for the rest of the session. Only the host doing the holding lifts it,
  // so a second host tearing down cannot resume the first one's stack.
  if (held.value)
    resumeToasts()
})

// --- hover / focus ---------------------------------------------------------

const held = computed(() => hovered.value || focused.value)

watch(held, (value) => {
  if (value)
    pauseToasts()
  else
    resumeToasts()
})

function leftHost(event: PointerEvent | FocusEvent): boolean {
  const next = event.relatedTarget as Node | null
  const host = hostRef.value?.$el as HTMLElement | undefined
  return !next || !host?.contains(next)
}

function onPointerOver(): void {
  hovered.value = true
}

function onPointerOut(event: PointerEvent): void {
  if (leftHost(event))
    hovered.value = false
}

function onFocusIn(): void {
  focused.value = true
}

function onFocusOut(event: FocusEvent): void {
  if (leftHost(event))
    focused.value = false
}

// --- swipe -----------------------------------------------------------------

const SWIPE_DISTANCE = 45
const SWIPE_VELOCITY = 0.32
/** A flick still has to travel far enough to be a flick and not a twitch. */
const SWIPE_FLICK_DISTANCE = 12

/** Positive along this axis means "toward the edge the stack is anchored to". */
function towardEdge(dy: number): number {
  return isTop.value ? -dy : dy
}

function onSwipeStart(item: TxToastItem, event: PointerEvent): void {
  if (!props.swipeToDismiss || !isInteractive(item))
    return
  if (event.pointerType === 'mouse' && event.button !== 0)
    return
  // Buttons keep their own click; a drag has to start on the card itself.
  if ((event.target as HTMLElement | null)?.closest('button'))
    return

  const el = event.currentTarget as HTMLElement
  el.setPointerCapture?.(event.pointerId)
  swipe.value = { id: item.id, pointerId: event.pointerId, startY: event.clientY, dy: 0, startedAt: event.timeStamp }
}

function onSwipeMove(event: PointerEvent): void {
  const active = swipe.value
  if (!active || active.pointerId !== event.pointerId)
    return

  const raw = event.clientY - active.startY
  // Dragging away from the edge resists, so the card never detaches upward.
  active.dy = towardEdge(raw) >= 0 ? raw : raw / 5
}

function onSwipeEnd(item: TxToastItem, event: PointerEvent): void {
  const active = swipe.value
  if (!active || active.pointerId !== event.pointerId)
    return

  const travelled = towardEdge(active.dy)
  const elapsed = Math.max(1, event.timeStamp - active.startedAt)

  const flicked = travelled > SWIPE_FLICK_DISTANCE && travelled / elapsed > SWIPE_VELOCITY

  if (travelled > SWIPE_DISTANCE || flicked) {
    // The toast leaves from where the drag left it: the element keeps this
    // render's inline offset once it drops out of the list, and the leave class
    // adds the rest of the distance on top.
    dismissToast(item.id)
  }

  swipe.value = null
}

function onSwipeCancel(): void {
  swipe.value = null
}

function runAction(item: TxToastItem): void {
  item.action?.onClick?.(item.id)
  if (item.action?.dismiss !== false)
    dismissToast(item.id)
}

defineExpose({ pause: pauseToasts, resume: resumeToasts, expanded })
</script>

<template>
  <teleport to="body">
    <TransitionGroup
      ref="hostRef"
      tag="div"
      name="tx-toast"
      move-class="tx-toast-move"
      class="tx-toast-host"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      :data-position="position"
      :data-expanded="expanded ? 'true' : 'false'"
      :style="hostStyle"
      @pointerover="onPointerOver"
      @pointerout="onPointerOut"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
    >
      <div
        v-for="t in items"
        :key="t.id"
        class="tx-toast"
        :class="`tx-toast--${t.variant || 'default'}`"
        :style="toastStyle(t)"
        :data-front="depthOf(t) === 0 ? 'true' : 'false'"
        :data-visible="depthOf(t) < visibleToasts ? 'true' : 'false'"
        :data-swiping="swipe?.id === t.id ? 'true' : 'false'"
        :role="t.variant === 'danger' ? 'alert' : undefined"
        @pointerdown="onSwipeStart(t, $event)"
        @pointermove="onSwipeMove"
        @pointerup="onSwipeEnd(t, $event)"
        @pointercancel="onSwipeCancel"
      >
        <div :ref="el => registerToast(t.id, el)" class="tx-toast__inner">
          <span v-if="GLYPHS[t.variant || 'default']" class="tx-toast__icon">
            <TxIcon :name="GLYPHS[t.variant || 'default']" />
          </span>

          <div class="tx-toast__content">
            <div v-if="t.title" class="tx-toast__title">
              {{ t.title }}
            </div>
            <div v-if="t.description" class="tx-toast__desc">
              {{ t.description }}
            </div>
          </div>

          <button
            v-if="t.action"
            class="tx-toast__action"
            type="button"
            @click="runAction(t)"
          >
            {{ t.action.label }}
          </button>

          <button
            class="tx-toast__close"
            type="button"
            aria-label="Dismiss notification"
            @click="dismissToast(t.id)"
          >
            <TxIcon name="close" />
          </button>
        </div>
      </div>
    </TransitionGroup>
  </teleport>
</template>

<style lang="scss">
.tx-toast-host {
  --tx-toast-width: 364px;
  --tx-toast-ease: cubic-bezier(0.21, 1.02, 0.73, 1);

  position: fixed;
  width: min(var(--tx-toast-width), calc(100vw - var(--tx-toast-edge) * 2));
  // Collapsed, only the front card is a target, so the empty column above it
  // stays clickable. Expanded, the whole region takes the pointer, otherwise
  // crossing a gap between two cards would read as leaving the stack.
  pointer-events: none;
  transition: height 0.4s var(--tx-toast-ease);

  &[data-expanded='true'] {
    pointer-events: auto;
  }

  &[data-position$='-right'] {
    right: var(--tx-toast-edge);
  }

  &[data-position$='-left'] {
    left: var(--tx-toast-edge);
  }

  &[data-position$='-center'] {
    left: 50%;
    margin-left: calc(min(var(--tx-toast-width), calc(100vw - var(--tx-toast-edge) * 2)) / -2);
  }

  &[data-position^='top-'] {
    top: var(--tx-toast-edge);
  }

  &[data-position^='bottom-'] {
    bottom: var(--tx-toast-edge);
  }
}

.tx-toast {
  --tx-toast-y: 0px;
  --tx-toast-swipe: 0px;
  --tx-toast-scale: 1;

  position: absolute;
  left: 0;
  right: 0;
  overflow: hidden;
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 88%, transparent);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  // The hairline is an inset ring rather than a border so the card's border box
  // matches the measured content height exactly, with no 2px to reconcile.
  box-shadow:
    inset 0 0 0 1px var(--tx-toast-ring, var(--tx-border-color-light, #e4e7ed)),
    var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
  pointer-events: none;
  touch-action: pan-x;
  transform: translateY(calc(var(--tx-toast-y) + var(--tx-toast-swipe))) scale(var(--tx-toast-scale));
  transition:
    transform 0.4s var(--tx-toast-ease),
    height 0.4s var(--tx-toast-ease),
    opacity 0.3s var(--tx-toast-ease);

  &[data-front='true'] {
    pointer-events: auto;
  }

  &[data-visible='false'] {
    opacity: 0;
    pointer-events: none;
  }

  &[data-swiping='true'] {
    transition: none;
    cursor: grabbing;
    user-select: none;
  }
}

.tx-toast-host[data-position^='top-'] .tx-toast {
  top: 0;
}

.tx-toast-host[data-position^='bottom-'] .tx-toast {
  bottom: 0;
}

.tx-toast-host[data-expanded='true'] .tx-toast[data-visible='true'] {
  pointer-events: auto;
}

// `hasCSSTransform` decides whether TransitionGroup runs its FLIP pass by
// cloning a child with this class and asking whether `transform` is in the
// transition list. Without an override it would inherit `.tx-toast`'s, and the
// inline translate that FLIP writes would fight the stack's own transform every
// time the list re-indexes. The cards are absolutely positioned, so there is no
// layout move to correct in the first place.
.tx-toast-move {
  transition: none;
}

// Ordered after the swiping rule so a card released past the threshold keeps
// animating out instead of inheriting `transition: none` and vanishing.
.tx-toast.tx-toast-enter-active,
.tx-toast.tx-toast-leave-active {
  transition:
    transform 0.4s var(--tx-toast-ease),
    opacity 0.3s var(--tx-toast-ease);
}

.tx-toast.tx-toast-enter-from,
.tx-toast.tx-toast-leave-to {
  opacity: 0;
  transform:
    translateY(calc(var(--tx-toast-y) + var(--tx-toast-swipe) + var(--tx-toast-shift, 100%)))
    scale(var(--tx-toast-scale));
}

.tx-toast__inner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
}

.tx-toast__icon {
  flex: none;
  display: inline-flex;
  margin-top: 1px;
  font-size: 16px;
  color: var(--tx-toast-accent, var(--tx-text-color-secondary, #909399));
}

.tx-toast__content {
  flex: 1;
  min-width: 0;
}

.tx-toast__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--tx-text-color-primary, #303133);
}

.tx-toast__desc {
  margin-top: 3px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--tx-text-color-secondary, #909399);
  word-break: break-word;
}

.tx-toast__action {
  flex: none;
  align-self: center;
  height: 26px;
  padding: 0 11px;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-bg-color, #fff);
  background: var(--tx-toast-accent, var(--tx-text-color-primary, #303133));
  cursor: pointer;

  &:hover {
    opacity: 0.88;
  }
}

.tx-toast__close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: -1px -4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.2s, background-color 0.2s;

  &:hover,
  &:focus-visible {
    opacity: 1;
    background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 70%, transparent);
  }
}

// Variants colour the glyph and tint the hairline. The card itself stays
// neutral so a stack of mixed statuses still reads as one surface.
.tx-toast--info {
  --tx-toast-accent: var(--tx-color-primary, #409eff);
}

.tx-toast--success {
  --tx-toast-accent: var(--tx-color-success, #67c23a);
}

.tx-toast--warning {
  --tx-toast-accent: var(--tx-color-warning, #e6a23c);
}

.tx-toast--danger {
  --tx-toast-accent: var(--tx-color-danger, #f56c6c);
}

.tx-toast--info,
.tx-toast--success,
.tx-toast--warning,
.tx-toast--danger {
  --tx-toast-ring: color-mix(in srgb, var(--tx-toast-accent) 28%, var(--tx-border-color-light, #e4e7ed));
}

@media (prefers-reduced-motion: reduce) {
  .tx-toast-host,
  .tx-toast,
  .tx-toast.tx-toast-enter-active,
  .tx-toast.tx-toast-leave-active {
    transition: opacity 0.01s linear;
  }

  .tx-toast.tx-toast-enter-from,
  .tx-toast.tx-toast-leave-to {
    transform: translateY(var(--tx-toast-y)) scale(var(--tx-toast-scale));
  }
}
</style>
