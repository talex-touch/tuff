<script lang="ts" setup>
import type { Middleware } from '@floating-ui/vue'
import type { HoverBridgeBox, HoverTransitHandlers } from '../../../../utils/hover-intent'
import type { TxFlatDropdownContentSlotProps, TxFlatDropdownProps, TxFlatDropdownTriggerSlotProps } from './types'
import { autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useAnchorDelay } from '../../../../utils/anchor-delay'
import {
  beginHoverTransit,
  cancelHoverTransit,
  hoverBridgeAt,
  isHoverClaimed,
  settleHoverTransit,
  stopWaitingForHoverTransit,
  waitForHoverTransit,
} from '../../../../utils/hover-intent'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'

defineOptions({ name: 'TxFlatDropdown' })

const props = withDefaults(defineProps<TxFlatDropdownProps>(), {
  modelValue: undefined,
  trigger: 'hover',
  placement: 'bottom-start',
  offset: 10,
  openDelay: 0,
  closeDelay: 600,
  exitDuration: 280,
  disabled: false,
  teleport: 'body',
  matchTriggerWidth: false,
  width: undefined,
  closeOnClickOutside: true,
  closeOnEsc: true,
  closeOnContentClick: false,
  panelClass: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'open': []
  'close': []
}>()

const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const internalOpen = ref(false)

// Stacking is open-order, not mount-order: every open takes the next z so a
// later dropdown always covers an earlier one's closing animation.
const zIndexAllocator = useZIndexAllocator()
const panelZIndex = ref(zIndexAllocator.get())
// Stable id so the trigger can advertise the panel it controls via aria-controls.
const panelId = useId()

const open = computed<boolean>({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (value) => {
    if (props.disabled && value)
      return
    const current = typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value
    if (current === value)
      return
    internalOpen.value = value
    emit('update:modelValue', value)
    if (value)
      emit('open')
    else
      emit('close')
  },
})

/**
 * The hover bridge's geometry (see hoverBridgeAt), laid out as the panel's
 * sibling: the panel's own `transform` belongs to its scale animation, and a
 * host's `panelClass` may clip its overflow. `box` is always written, even as
 * `null` — floating-ui merges middleware data.
 */
const hoverBridgeMiddleware: Middleware = {
  name: 'hoverBridge',
  fn: state => ({ data: { box: hoverBridgeAt(state, false) } }),
}

/* ─── floating-ui: position via top/left so `transform` stays free for the scale animation ─── */
const { floatingStyles, middlewareData, placement } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  transform: false,
  whileElementsMounted: autoUpdate,
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, elements }) {
        const style = elements.floating.style
        style.width = ''
        style.minWidth = ''
        if (props.width != null && props.width !== '') {
          style.width = typeof props.width === 'number' ? `${props.width}px` : String(props.width)
        }
        else if (props.matchTriggerWidth) {
          style.minWidth = `${rects.reference.width}px`
        }
      },
    }),
    hoverBridgeMiddleware,
  ],
})

const side = computed(() => (placement.value?.split('-')[0] ?? 'bottom') as 'top' | 'bottom' | 'left' | 'right')

/* Scale toward the trigger: pin the transform-origin to the edge nearest the reference. */
const transformOrigin = computed(() => {
  const [rawSide, align] = (placement.value ?? 'bottom-start').split('-')
  if (rawSide === 'left' || rawSide === 'right') {
    const x = rawSide === 'right' ? 'left' : 'right'
    const y = align === 'start' ? 'top' : align === 'end' ? 'bottom' : 'center'
    return `${x} ${y}`
  }
  const y = rawSide === 'bottom' ? 'top' : 'bottom'
  const x = align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'
  return `${x} ${y}`
})

const panelStyle = computed(() => [
  floatingStyles.value,
  {
    transformOrigin: transformOrigin.value,
    zIndex: panelZIndex.value,
    '--tx-fd-exit-duration': `${Math.max(0, props.exitDuration)}ms`,
  },
])

const bridgeRef = ref<HTMLElement | null>(null)

/**
 * Hover-only, and only while open: a leaving panel has let the pointer go. It
 * shares the panel's positioning scheme and stacking, so it sits flush with
 * the panel in the same containing block.
 */
const bridgeStyle = computed<Record<string, string | number> | null>(() => {
  if (props.trigger !== 'hover' || !open.value)
    return null
  const box = (middlewareData.value as { hoverBridge?: { box?: HoverBridgeBox | null } })?.hoverBridge?.box
  if (!box)
    return null
  return {
    position: 'fixed',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    clipPath: box.clipPath,
    zIndex: panelZIndex.value,
  }
})

const teleportTarget = computed(() => (typeof props.teleport === 'string' ? props.teleport : 'body'))
const teleportDisabled = computed(() => props.teleport === false)

/* ─── open / close timing: shared anchor-delay service ─── */
// Registering as a `menu` buys what per-component timers never could: opening
// this dropdown dismisses tooltips and sibling menus, and other menus dismiss
// it. The component's own openDelay/closeDelay defaults keep their values as
// per-anchor overrides. The service defers uniformly (a 0 delay opens on the
// next tick, not synchronously) — that is its documented scheduling model.
const delay = useAnchorDelay({
  layer: 'menu',
  onOpen: () => { open.value = true },
  onClose: () => { open.value = false },
  openDelay: () => props.openDelay,
  closeDelay: () => props.closeDelay,
})
// The chain node already identifies this dropdown uniquely; it doubles as the
// hover transit's owner key.
const transitOwner = delay.node

// Keeps the registry honest when the state moves without the service:
// v-model from the host, Escape, outside click, and the imperative API.
watch(open, (value) => {
  if (value) {
    panelZIndex.value = zIndexAllocator.next()
    delay.openNow()
  }
  else {
    delay.closeNow()
    cancelHoverTransit(transitOwner)
  }
})

function clearTimers() {
  delay.cancel()
}

function scheduleOpen() {
  if (props.disabled)
    return
  delay.requestOpen()
}

function scheduleClose() {
  delay.requestClose()
}

/* ─── hover intent: the pointer's trip to the panel (see utils/hover-intent) ─── */
/** Whether the pointer is on the trigger right now: a deferred open only proceeds if it still is. */
let pointerOnTrigger = false

const transitHandlers: HoverTransitHandlers = {
  reference: () => referenceRef.value,
  contains: target => !!(floatingRef.value?.contains(target) || bridgeRef.value?.contains(target)),
  panelRect: () => floatingRef.value?.getBoundingClientRect() ?? null,
  side: () => side.value,
  onStart: () => delay.holdChain(),
  onEnd: (outcome) => {
    delay.releaseChain(outcome !== 'arrived')
    if (outcome === 'abandoned')
      scheduleClose()
  },
}

/* ─── trigger interactions ─── */
// Focus shares these handlers; only a pointer travels, so only a MouseEvent
// takes part in the trip.
function onTriggerEnter(event: Event) {
  if (props.trigger !== 'hover')
    return
  if (event instanceof MouseEvent) {
    pointerOnTrigger = true
    settleHoverTransit(transitOwner)
    // Crossing on the way to another panel: wait for that trip's verdict.
    if (!open.value && isHoverClaimed(transitOwner, event)) {
      waitForHoverTransit(transitOwner, () => {
        if (pointerOnTrigger)
          scheduleOpen()
      })
      return
    }
  }
  scheduleOpen()
}

function onTriggerLeave(event: Event) {
  if (props.trigger !== 'hover')
    return
  if (event instanceof MouseEvent) {
    pointerOnTrigger = false
    stopWaitingForHoverTransit(transitOwner)
    if (open.value && beginHoverTransit(transitOwner, event, transitHandlers))
      return
  }
  scheduleClose()
}

function onTriggerClick(event: MouseEvent) {
  if (props.trigger !== 'click' || props.disabled)
    return
  // Ignore clicks bubbling up from the panel when rendered inline (teleport off).
  const target = event.target as Node | null
  if (target && floatingRef.value?.contains(target))
    return
  clearTimers()
  open.value = !open.value
}

// The bridge shares these: entering it is entering the panel.
function onPanelEnter() {
  if (props.trigger !== 'hover')
    return
  settleHoverTransit(transitOwner)
  clearTimers()
}

function onPanelLeave() {
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

function onPanelClick() {
  if (props.closeOnContentClick)
    hide()
}

/* ─── imperative API ─── */
function show() {
  clearTimers()
  open.value = true
}

function hide() {
  clearTimers()
  open.value = false
}

function toggle() {
  if (open.value)
    hide()
  else show()
}

const triggerSlotProps = computed<TxFlatDropdownTriggerSlotProps>(() => ({
  open: open.value,
  toggle,
  show,
  hide,
}))

const contentSlotProps = computed<TxFlatDropdownContentSlotProps>(() => ({
  open: open.value,
  close: hide,
  side: side.value,
}))

/* ─── dismissal: outside click + escape ─── */
function onDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target)
    return
  if (referenceRef.value?.contains(target) || floatingRef.value?.contains(target) || bridgeRef.value?.contains(target))
    return
  hide()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.closeOnEsc)
    hide()
}

watch(open, (value) => {
  if (typeof document === 'undefined')
    return
  if (value) {
    // `manual` hands closing entirely to the host — outside clicks must not dismiss it.
    if (props.closeOnClickOutside && props.trigger !== 'manual')
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
    if (props.closeOnEsc)
      document.addEventListener('keydown', onDocumentKeydown)
  }
  else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
})

watch(() => props.disabled, (disabled) => {
  if (disabled)
    hide()
})

onBeforeUnmount(() => {
  clearTimers()
  cancelHoverTransit(transitOwner)
  stopWaitingForHoverTransit(transitOwner)
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-flat-dropdown"
    :class="{ 'is-open': open, 'is-disabled': disabled }"
    aria-haspopup="true"
    :aria-expanded="open"
    :aria-controls="panelId"
    @mouseenter="onTriggerEnter"
    @mouseleave="onTriggerLeave"
    @focusin="onTriggerEnter"
    @focusout="onTriggerLeave"
    @click="onTriggerClick"
  >
    <slot name="trigger" v-bind="triggerSlotProps" />

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <!--
        Hover bridge: the trough between the trigger and the panel, entered and
        left like the panel itself, so crossing the gap never leaves it.
      -->
      <div
        v-if="bridgeStyle"
        ref="bridgeRef"
        class="tx-flat-dropdown__bridge"
        :style="bridgeStyle"
        aria-hidden="true"
        @mouseenter="onPanelEnter"
        @mouseleave="onPanelLeave"
      />
      <Transition name="tx-flat-dropdown">
        <div
          v-if="open"
          :id="panelId"
          ref="floatingRef"
          class="tx-flat-dropdown__panel"
          :class="panelClass"
          :style="panelStyle"
          :data-side="side"
          @mouseenter="onPanelEnter"
          @mouseleave="onPanelLeave"
          @click="onPanelClick"
        >
          <slot v-bind="contentSlotProps" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.tx-flat-dropdown {
  display: inline-flex;
  width: fit-content;
  /*
   * The wrapper *is* the trigger — hover, focus and click all land here, and the
   * `#trigger` slot may be nothing more than a span of text. `cursor` inherits,
   * so declaring it here reaches whatever the host put inside without the
   * component having to touch slot content. `.is-disabled` needs no override: it
   * sets `pointer-events: none`, so the cursor never resolves against this
   * element at all.
   */
  cursor: pointer;

  &.is-disabled {
    pointer-events: none;
  }
}

.tx-flat-dropdown__panel {
  z-index: var(--tx-fd-z-index, 10020);
  will-change: transform, filter, opacity;
}

/*
 * Asymmetric motion:
 *  - enter is quick and crisp (no blur) so the panel reads as "instant" on hover.
 *  - leave scales down to 0.8 and blurs out to 12px (the delay before it even
 *    starts is handled in JS via `closeDelay`, default 600ms).
 */
.tx-flat-dropdown-enter-active {
  transition:
    opacity 120ms ease,
    transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tx-flat-dropdown-leave-active {
  transition:
    opacity var(--tx-fd-exit-duration, 280ms) ease,
    transform var(--tx-fd-exit-duration, 280ms) cubic-bezier(0.4, 0, 0.2, 1),
    filter var(--tx-fd-exit-duration, 280ms) ease;
}

.tx-flat-dropdown-enter-from {
  opacity: 0;
  transform: scale(0.96);
}

.tx-flat-dropdown-leave-to {
  opacity: 0;
  transform: scale(0.8);
  filter: blur(12px);
}

@media (prefers-reduced-motion: reduce) {
  .tx-flat-dropdown-enter-active,
  .tx-flat-dropdown-leave-active {
    transition-duration: 1ms;
  }

  .tx-flat-dropdown-enter-from,
  .tx-flat-dropdown-leave-to {
    filter: none;
    transform: none;
  }
}
</style>
