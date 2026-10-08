<script setup lang="ts">
import type { Slots } from 'vue'
import type { HoverTransitHandlers } from '../../../../utils/hover-intent'
import type { BaseAnchorProps } from '../../base-anchor/src/types'
import type { TooltipProps } from './types'
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import { useAnchorDelay } from '../../../../utils/anchor-delay'
import {
  beginHoverTransit,
  cancelHoverTransit,
  isHoverClaimed,
  settleHoverTransit,
  stopWaitingForHoverTransit,
  waitForHoverTransit,
} from '../../../../utils/hover-intent'
import { TxBaseAnchor } from '../../base-anchor'

defineOptions({ name: 'TxTooltip' })

const props = withDefaults(defineProps<TooltipProps>(), {
  modelValue: undefined,
  content: '',
  disabled: false,
  trigger: 'hover',
  // Left undefined so the shared `hint` preset supplies them; the preset is
  // seeded from the 200/120 this component used to hardcode.
  openDelay: undefined,
  closeDelay: undefined,
  referenceFullWidth: false,
  interactive: false,
  keepAliveContent: false,
  closeOnClickOutside: undefined,
  toggleOnReferenceClick: undefined,
  layer: 'hint',
  role: 'tooltip',
  unstyled: false,
  anchor: () => ({}),
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

/** Default panel max-height (px), applied only when `maxHeight` is left unset and there is no content slot. */
const DEFAULT_MAX_HEIGHT = 320

const slots: Slots = useSlots()

// Stable id so the reference can point at the tooltip body via aria-describedby.
const uid = getCurrentInstance()?.uid ?? 0
const tooltipId = `tx-tooltip-${uid}`

const internalOpen = ref(false)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v: boolean) => {
    if (props.disabled && v)
      return

    const current = typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value
    if (current === v)
      return

    internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open')
    else
      emit('close')
  },
})

/**
 * Timing and mutual exclusion both live in the shared service now. The delay
 * numbers are unchanged — the `hint` preset is seeded from what this component
 * used to hardcode — but a second tooltip opening can close this one without
 * waiting out its closeDelay, which a per-component timer could never do.
 */
const delay = useAnchorDelay({
  layer: props.layer,
  onOpen: () => { open.value = true },
  onClose: () => { open.value = false },
  openDelay: () => props.openDelay,
  closeDelay: () => props.closeDelay,
  // Read when a nested panel's requestCloseChain walks up through here: only
  // hover-opened anchors close because a hover child left; click-opened ones
  // wait for outside click / Escape / select.
  hoverCloseable: () => props.trigger === 'hover',
})
// The chain node already identifies this anchor uniquely; it doubles as the
// hover transit's owner key.
const transitOwner = delay.node

// Keeps the registry honest when the state moves without going through the
// service: v-model from the host, Escape, or an outside click.
watch(open, (value) => {
  if (value) {
    delay.openNow()
  }
  else {
    delay.closeNow()
    // Closed some other way mid-trip (Escape, a select, preemption): nothing
    // is left to travel to.
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

const isTooltipRole = computed(() => props.role === 'tooltip')

/** A panel the pointer can travel into: the only kind with a bridge and a safe triangle. */
const hoverIntent = computed(() => props.trigger === 'hover' && props.interactive)

const referenceRef = ref<HTMLElement | null>(null)

/** Whether the pointer is on the trigger right now: a deferred open only proceeds if it still is. */
let pointerOnReference = false

const transitHandlers: HoverTransitHandlers = {
  reference: () => referenceRef.value,
  contains: target => anchorRef.value?.containsFloating?.(target) ?? false,
  panelRect: () => anchorRef.value?.getPanelRect?.() ?? null,
  side: () => anchorRef.value?.getSide?.() ?? 'bottom',
  onStart: () => delay.holdChain(),
  onEnd: (outcome) => {
    // The ancestors' closes deferred during the trip stand only if the pointer
    // gave up on the way; arriving means it never left the chain.
    delay.releaseChain(outcome !== 'arrived')
    if (outcome === 'abandoned')
      scheduleClose()
  },
}

function onEnter(event: MouseEvent) {
  if (props.trigger !== 'hover')
    return
  pointerOnReference = true
  // Back on its own trigger mid-trip: the panel was never given up.
  settleHoverTransit(transitOwner)
  // The pointer is crossing this trigger on its way to another panel. Opening
  // here would yank that panel out from under the pointer aiming at it, so wait
  // for the trip's verdict: stopping here gives the pointer up, and this opens.
  if (!open.value && isHoverClaimed(transitOwner, event)) {
    waitForHoverTransit(transitOwner, () => {
      if (pointerOnReference)
        scheduleOpen()
    })
    return
  }
  scheduleOpen()
}

function onLeave(event: MouseEvent) {
  if (props.trigger !== 'hover')
    return
  pointerOnReference = false
  stopWaitingForHoverTransit(transitOwner)
  // Heading for the open panel: the safe triangle decides when this closes,
  // not the clock. An exit through the far edge falls through to the delay.
  if (hoverIntent.value && open.value && beginHoverTransit(transitOwner, event, transitHandlers))
    return
  scheduleClose()
}

function onFocusIn() {
  // WAI-APG tooltip pattern: keyboard focus opens the tooltip too, so hover-mode
  // tooltips are reachable without a pointer (focus alone, or hover).
  if (props.trigger !== 'hover' && props.trigger !== 'focus')
    return
  scheduleOpen()
}

function onFocusOut() {
  if (props.trigger !== 'hover' && props.trigger !== 'focus')
    return
  scheduleClose()
}

/**
 * Pointer handlers bind to the anchor's whole floating layer — panel box and
 * bridge — not to the content inside the card. Inside the card the panel's own
 * padding was a dead ring: resting on the visible edge of the panel closed it.
 */
function onFloatingEnter() {
  if (!hoverIntent.value)
    return
  settleHoverTransit(transitOwner)
  // Chain-wide: this panel may be a nested submenu whose parent scheduled its
  // own close when the pointer crossed out of it. Landing here proves the
  // pointer never left the chain, so every ancestor's pending close is void.
  delay.cancelChain()
}

function onFloatingLeave() {
  if (!hoverIntent.value)
    return
  // Chain-wide: leaving a nested panel means leaving every panel above it.
  // Hover-opened ancestors close along; click-opened ones are skipped.
  delay.requestCloseChain()
}

const resolvedAnchorProps = computed<BaseAnchorProps>(() => {
  const anchor = props.anchor ?? {}

  const closeOnClickOutside = typeof props.closeOnClickOutside === 'boolean'
    ? props.closeOnClickOutside
    : typeof anchor.closeOnClickOutside === 'boolean'
      ? anchor.closeOnClickOutside
      : props.trigger === 'click'

  const toggleOnReferenceClick = typeof props.toggleOnReferenceClick === 'boolean'
    ? props.toggleOnReferenceClick
    : typeof anchor.toggleOnReferenceClick === 'boolean'
      ? anchor.toggleOnReferenceClick
      : props.trigger === 'click'

  // True tooltips (hint layer) zoom in and out with `boom`; the family's
  // other members riding this component (popover and above) delegate to the
  // anchor's default expand. Hosts refine either through `anchor.animation`.
  const animation = anchor.animation ?? (props.layer === 'hint' ? { type: 'boom' as const } : {})

  // Standalone parity with TxPopover: full-width must also reach the anchor's
  // own reference wrapper, or the inner span's `width: 100%` resolves against
  // a shrink-to-fit parent and the width chain still collapses.
  const referenceClass: BaseAnchorProps['referenceClass'] = props.referenceFullWidth
    ? (anchor.referenceClass != null ? [anchor.referenceClass, { 'is-full-width': true }] : { 'is-full-width': true })
    : anchor.referenceClass

  return {
    placement: 'top',
    offset: 8,
    width: 0,
    minWidth: 0,
    maxWidth: 280,
    matchReferenceWidth: false,
    useCard: true,
    panelVariant: 'solid',
    panelBackground: 'refraction',
    panelShadow: 'soft',
    panelRadius: 10,
    panelPadding: 8,
    // No arrow anywhere in the anchor family unless the host opts in.
    showArrow: false,
    arrowSize: 10,
    keepAliveContent: props.keepAliveContent,
    closeOnEsc: true,
    ...anchor,
    animation,
    referenceClass,
    closeOnClickOutside,
    toggleOnReferenceClick,
    // Not host-overridable: the anchor publishes its floating element under
    // this chain node so ancestors can recognise clicks inside nested panels.
    delayNode: delay.node,
    // Not host-overridable either: the bridge only exists for the trip the
    // safe triangle protects.
    hoverBridge: hoverIntent.value,
  }
})

const tooltipVars = computed<Record<string, string>>(() => {
  const { maxHeight } = props
  let resolved: string
  if (maxHeight === undefined)
    // Unset: let a content slot grow freely, but cap plain-text tooltips.
    resolved = slots.content ? 'none' : `${DEFAULT_MAX_HEIGHT}px`
  else if (maxHeight <= 0)
    resolved = 'none'
  else
    resolved = `${maxHeight}px`

  return {
    '--tx-tooltip-max-height': resolved,
  }
})

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled)
      return
    clearTimers()
    open.value = false
  },
)

/**
 * A tooltip that mounts already open — pinned by the host, restored from saved
 * state — gets no `open` transition, so the watcher above never registers it
 * with the service. It would then be invisible to `hint` preempting `hint`: the
 * next tooltip to open could not displace it, and two would sit on screen at
 * once, which is the one thing that policy exists to prevent.
 */
onMounted(() => {
  if (open.value)
    delay.openNow()
})

onBeforeUnmount(() => {
  clearTimers()
  cancelHoverTransit(transitOwner)
  stopWaitingForHoverTransit(transitOwner)
})

const anchorRef = ref<InstanceType<typeof TxBaseAnchor> | null>(null)

defineExpose({
  updatePosition: () => anchorRef.value?.updatePosition?.(),
})
</script>

<template>
  <TxBaseAnchor
    ref="anchorRef"
    v-model="open"
    :disabled="props.disabled"
    v-bind="resolvedAnchorProps"
    @floating-enter="onFloatingEnter"
    @floating-leave="onFloatingLeave"
  >
    <template #reference>
      <span
        ref="referenceRef"
        class="tx-tooltip__reference"
        :class="{ 'is-full-width': props.referenceFullWidth }"
        :aria-describedby="open && isTooltipRole ? tooltipId : undefined"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
      >
        <slot />
      </span>
    </template>

    <template #default="{ side }">
      <div
        :id="tooltipId"
        :class="props.unstyled ? undefined : 'tx-tooltip'"
        :data-side="side"
        :role="props.role"
        :style="props.unstyled ? undefined : tooltipVars"
        @focusin="onFloatingEnter"
        @focusout="onFloatingLeave"
      >
        <template v-if="props.unstyled">
          <slot name="content" :side="side">
            {{ props.content }}
          </slot>
        </template>
        <div v-else class="tx-tooltip__content">
          <slot name="content" :side="side">
            {{ props.content }}
          </slot>
        </div>
      </div>
    </template>
  </TxBaseAnchor>
</template>

<style scoped>
.tx-tooltip__reference {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tx-tooltip__reference.is-full-width {
  width: 100%;
}

.tx-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  color: var(--tx-text-color-primary, #303133);
  font-size: 12px;
  line-height: 1.35;
  max-height: var(--tx-tooltip-max-height, 320px);
  overflow: auto;
}

.tx-tooltip__content {
  position: relative;
  z-index: 1;
}
</style>
