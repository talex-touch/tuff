<script lang="ts" setup>
import type { TxFlatDropdownContentSlotProps, TxFlatDropdownProps, TxFlatDropdownTriggerSlotProps } from './types'
import { autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

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

/* ─── floating-ui: position via top/left so `transform` stays free for the scale animation ─── */
const { floatingStyles, placement } = useFloating(referenceRef, floatingRef, {
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
    '--tx-fd-exit-duration': `${Math.max(0, props.exitDuration)}ms`,
  },
])

const teleportTarget = computed(() => (typeof props.teleport === 'string' ? props.teleport : 'body'))
const teleportDisabled = computed(() => props.teleport === false)

/* ─── open / close timing ─── */
let openTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (openTimer != null)
    clearTimeout(openTimer)
  if (closeTimer != null)
    clearTimeout(closeTimer)
  openTimer = null
  closeTimer = null
}

function scheduleOpen() {
  if (props.disabled)
    return
  clearTimers()
  const delay = Math.max(0, props.openDelay)
  // openDelay 0 → open synchronously so the panel appears the instant the pointer lands.
  if (delay === 0) {
    open.value = true
    return
  }
  openTimer = setTimeout(() => {
    open.value = true
  }, delay)
}

function scheduleClose() {
  clearTimers()
  const delay = Math.max(0, props.closeDelay)
  if (delay === 0) {
    open.value = false
    return
  }
  closeTimer = setTimeout(() => {
    open.value = false
  }, delay)
}

/* ─── trigger interactions ─── */
function onTriggerEnter() {
  if (props.trigger !== 'hover')
    return
  scheduleOpen()
}

function onTriggerLeave() {
  if (props.trigger !== 'hover')
    return
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

function onPanelEnter() {
  if (props.trigger !== 'hover')
    return
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
  if (referenceRef.value?.contains(target) || floatingRef.value?.contains(target))
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
    if (props.closeOnClickOutside)
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
    @mouseenter="onTriggerEnter"
    @mouseleave="onTriggerLeave"
    @focusin="onTriggerEnter"
    @focusout="onTriggerLeave"
    @click="onTriggerClick"
  >
    <slot name="trigger" v-bind="triggerSlotProps" />

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="tx-flat-dropdown">
        <div
          v-if="open"
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
