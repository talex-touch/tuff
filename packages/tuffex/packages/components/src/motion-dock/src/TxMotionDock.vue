<script setup lang="ts">
// Adapted from Amicro Dock. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import type { MotionDockEmits, MotionDockId, MotionDockItem, MotionDockProps, MotionDockReorder } from './types'
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useId, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { springSteps } from '../../liquid/src/spring'
import { MOTION_DOCK_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxMotionDock' })
const props = withDefaults(defineProps<MotionDockProps>(), {
  reorderable: true, disabled: false, paused: false, size: 'md', distance: 80, showLabels: false,
})
const emit = defineEmits<MotionDockEmits>()
const root = ref<HTMLElement | null>(null)
const { active, present } = useMotionActivity(root, () => !props.paused && !props.disabled)
const instructionsId = useId()
const labels = computed(() => ({ ...MOTION_DOCK_DEFAULT_LABELS, ...props.labels }))
const itemSize = computed(() => props.itemSize !== undefined && Number.isFinite(props.itemSize)
  ? Math.max(16, props.itemSize) : ({ xs: 20, sm: 24, md: 28, lg: 36 })[props.size])
const peakSize = computed(() => props.magnifiedSize !== undefined && Number.isFinite(props.magnifiedSize)
  ? Math.max(itemSize.value, props.magnifiedSize) : itemSize.value * 44 / 28)
const distance = computed(() => Number.isFinite(props.distance) ? Math.max(1, props.distance) : 80)
const rootStyle = computed<CSSProperties>(() => ({ '--tx-motion-dock-base-size': `${itemSize.value}px` }))
const focusId = ref<MotionDockId>()
const localOrder = ref<MotionDockItem[] | null>(null)
const displayedItems = computed(() => localOrder.value ?? props.items)
const draggedId = ref<MotionDockId>()
const dragTranslate = ref(0)
const announcement = ref('')
const elements = new Map<MotionDockId, HTMLElement>()
const springs = new Map<MotionDockId, { position: number, velocity: number, target: number }>()
const spring = { mass: .1, stiffness: 220, damping: 16 }
let raf: number | undefined
let lastFrame: number | undefined
let suppressClick: MotionDockId | undefined
let drag: {
  id: MotionDockId
  pointerId: number
  startX: number
  pointerOffset: number
  moved: boolean
  capture: HTMLElement
  original: MotionDockItem[]
} | undefined

function setItemRef(id: MotionDockId, element: Element | ComponentPublicInstance | null): void {
  if (element && 'style' in element) {
    elements.set(id, element as HTMLElement)
    const state = springs.get(id)
    if (state)
      (element as HTMLElement).style.setProperty('--tx-motion-dock-item-size', `${state.position}px`)
  }
  else {
    elements.delete(id)
  }
}

function stopSpring(): void {
  if (raf !== undefined)
    cancelAnimationFrame(raf)
  raf = undefined
  lastFrame = undefined
}

function rest(): void {
  stopSpring()
  for (const [id, state] of springs) {
    state.position = itemSize.value
    state.target = itemSize.value
    state.velocity = 0
    elements.get(id)?.style.setProperty('--tx-motion-dock-item-size', `${itemSize.value}px`)
  }
}

function frame(time: number): void {
  raf = undefined
  if (!active.value) {
    rest()
    return
  }
  const dt = lastFrame === undefined ? 1 / 60 : Math.min(.1, Math.max(0, (time - lastFrame) / 1000))
  lastFrame = time
  let moving = false
  for (const [id, state] of springs) {
    const [position, velocity] = springSteps(state.position, state.velocity, state.target, spring, dt)
    state.position = position
    state.velocity = velocity
    if (Math.abs(position - state.target) > .02 || Math.abs(velocity) > .02) {
      moving = true
    }
    else {
      state.position = state.target
      state.velocity = 0
    }
    elements.get(id)?.style.setProperty('--tx-motion-dock-item-size', `${state.position}px`)
  }
  if (moving)
    raf = requestAnimationFrame(frame)
  else
    lastFrame = undefined
}

function magnify(clientX: number): void {
  if (!active.value) {
    rest()
    return
  }
  // Read layout only on input, never from the spring frame driver.
  for (const item of displayedItems.value) {
    const element = elements.get(item.id)
    if (!element)
      continue
    const bounds = element.getBoundingClientRect()
    const proximity = item.disabled ? 0 : Math.max(0, 1 - Math.abs(clientX - bounds.left - bounds.width / 2) / distance.value)
    let state = springs.get(item.id)
    if (!state) {
      state = { position: itemSize.value, velocity: 0, target: itemSize.value }
      springs.set(item.id, state)
    }
    state.target = itemSize.value + (peakSize.value - itemSize.value) * proximity
  }
  if (raf === undefined)
    raf = requestAnimationFrame(frame)
}

function leave(): void {
  for (const state of springs.values())
    state.target = itemSize.value
  if (active.value && raf === undefined && springs.size)
    raf = requestAnimationFrame(frame)
}

function focus(item: MotionDockItem): void {
  focusId.value = item.id
  const bounds = elements.get(item.id)?.getBoundingClientRect()
  if (bounds)
    magnify(bounds.left + bounds.width / 2)
}

function select(item: MotionDockItem, index: number, event: MouseEvent): void {
  if (props.disabled || item.disabled || (suppressClick === item.id && event.detail > 0)) {
    event.preventDefault()
    suppressClick = undefined
    return
  }
  suppressClick = undefined
  emit('update:activeId', item.id)
  emit('select', item, index)
}

function announce(item: MotionDockItem, to: number, total: number): void {
  announcement.value = labels.value.reordered.replace('{label}', item.label)
    .replace('{position}', String(to + 1)).replace('{total}', String(total))
}

function commit(items: MotionDockItem[], detail: MotionDockReorder): void {
  if (detail.from === detail.to)
    return
  const item = items[detail.to]
  emit('update:items', items)
  emit('reorder', items, detail)
  if (item)
    announce(item, detail.to, items.length)
}

function cancelDrag(): void {
  if (drag?.capture.hasPointerCapture(drag.pointerId))
    drag.capture.releasePointerCapture(drag.pointerId)
  drag = undefined
  draggedId.value = undefined
  dragTranslate.value = 0
  localOrder.value = null
}

function pointerDown(item: MotionDockItem, event: PointerEvent): void {
  if (!props.reorderable || props.disabled || item.disabled || event.button !== 0 || drag)
    return
  suppressClick = undefined
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  drag = { id: item.id, pointerId: event.pointerId, startX: event.clientX,
    pointerOffset: event.clientX - bounds.left - bounds.width / 2, moved: false,
    capture: element, original: Array.from(props.items) }
  localOrder.value = Array.from(props.items)
  element.setPointerCapture(event.pointerId)
}

async function pointerMove(event: PointerEvent): Promise<void> {
  magnify(event.clientX)
  const current = drag
  if (!current || current.pointerId !== event.pointerId || !localOrder.value)
    return
  if (!current.moved && Math.abs(event.clientX - current.startX) < 4)
    return
  current.moved = true
  draggedId.value = current.id
  event.preventDefault()
  const centre = event.clientX - current.pointerOffset
  const others = localOrder.value.filter(item => item.id !== current.id)
  let insertion = 0
  for (const item of others) {
    const bounds = elements.get(item.id)?.getBoundingClientRect()
    if (bounds && centre > bounds.left + bounds.width / 2)
      insertion++
  }
  const item = localOrder.value.find(entry => entry.id === current.id)
  const from = localOrder.value.findIndex(entry => entry.id === current.id)
  if (item && from !== insertion) {
    others.splice(insertion, 0, item)
    localOrder.value = others
  }
  await nextTick()
  if (drag !== current)
    return
  const bounds = elements.get(current.id)?.getBoundingClientRect()
  if (bounds)
    dragTranslate.value = centre - (bounds.left + bounds.width / 2 - dragTranslate.value)
}

function pointerUp(event: PointerEvent): void {
  if (!drag || drag.pointerId !== event.pointerId)
    return
  const current = drag
  const items = localOrder.value ? Array.from(localOrder.value) : Array.from(props.items)
  if (current.moved) {
    suppressClick = current.id
    commit(items, { id: current.id, from: current.original.findIndex(item => item.id === current.id),
      to: items.findIndex(item => item.id === current.id), source: 'pointer' })
  }
  cancelDrag()
}

async function keyboard(item: MotionDockItem, event: KeyboardEvent): Promise<void> {
  if (event.key === 'Escape' && drag) {
    event.preventDefault()
    suppressClick = drag.id
    cancelDrag()
    return
  }
  if (props.disabled || item.disabled)
    return
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) {
    // Native buttons already activate with Space; links need the same toolbar behavior.
    if (event.key === ' ' && item.href) {
      event.preventDefault()
      elements.get(item.id)?.click()
    }
    return
  }
  event.preventDefault()
  if (event.altKey && props.reorderable && !drag) {
    const items = Array.from(props.items)
    const from = items.findIndex(entry => entry.id === item.id)
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, from + (event.key === 'ArrowLeft' ? -1 : 1)))
    if (from !== to && from >= 0) {
      items.splice(from, 1)
      items.splice(to, 0, item)
      commit(items, { id: item.id, from, to, source: 'keyboard' })
      await nextTick()
      elements.get(item.id)?.focus()
    }
    return
  }
  const enabled = props.items.filter(entry => !entry.disabled)
  const index = enabled.findIndex(entry => entry.id === item.id)
  const target = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1]
    : enabled[(index + (event.key === 'ArrowLeft' ? -1 : 1) + enabled.length) % enabled.length]
  if (target) {
    focusId.value = target.id
    elements.get(target.id)?.focus()
  }
}

watch(() => props.items.map(item => [item.id, item.disabled] as const), (items) => {
  const ids = new Set(items.map(([id]) => id))
  for (const id of springs.keys()) {
    if (!ids.has(id))
      springs.delete(id)
  }
  if (drag && !ids.has(drag.id))
    cancelDrag()
  if (!props.items.some(item => item.id === focusId.value && !item.disabled))
    focusId.value = props.items.find(item => !item.disabled)?.id
}, { immediate: true })
watch(() => props.items, () => {
  // Never overwrite a caller's replacement array with a stale pointer snapshot.
  if (drag)
    cancelDrag()
})
watch([active, itemSize, peakSize], rest)
watch([present, () => props.disabled, () => props.reorderable], ([visible, disabled, reorderable]) => {
  if (!visible || disabled || !reorderable)
    cancelDrag()
})
onDeactivated(() => { cancelDrag(); rest() })
onBeforeUnmount(() => { cancelDrag(); stopSpring(); springs.clear(); elements.clear() })
</script>

<template>
  <div ref="root" class="tx-motion-dock" :style="rootStyle" :data-dragging="draggedId !== undefined">
    <div
class="tx-motion-dock__items" role="toolbar" aria-orientation="horizontal" :aria-label="labels.dock" :aria-describedby="instructionsId"
      @pointermove="pointerMove" @pointerleave="leave" @pointerup="pointerUp" @pointercancel="cancelDrag"
      @lostpointercapture="drag?.pointerId === $event.pointerId && cancelDrag()"
      @focusout="!root?.contains($event.relatedTarget as Node | null) && leave()"
>
      <component
        :is="item.href ? 'a' : 'button'" v-for="(item, index) in displayedItems" :key="item.id"
        :ref="(element: Element | ComponentPublicInstance | null) => setItemRef(item.id, element)" class="tx-motion-dock__item"
        :class="{ 'is-active': activeId === item.id, 'is-dragging': draggedId === item.id, 'is-disabled': disabled || item.disabled, 'is-fixed': !reorderable }"
        :type="item.href ? undefined : 'button'" :href="disabled || item.disabled ? undefined : item.href"
        :disabled="!item.href && (disabled || item.disabled)" :aria-disabled="disabled || item.disabled || undefined"
        :role="item.href ? 'link' : undefined"
        :aria-label="item.label" :aria-pressed="!item.href && activeId !== undefined ? activeId === item.id : undefined"
        :aria-current="item.href && activeId === item.id ? 'page' : undefined"
        :tabindex="!disabled && !item.disabled && focusId === item.id ? 0 : -1"
        :style="draggedId === item.id ? { transform: `translateX(${dragTranslate}px)` } : undefined"
        :title="item.label" @focus="focus(item)" @click="select(item, index, $event)" @keydown="keyboard(item, $event)"
        @pointerdown="pointerDown(item, $event)" @dragstart.prevent
      >
        <slot name="item" :item="item" :index="index" :active="activeId === item.id" :dragging="draggedId === item.id">
          <span class="tx-motion-dock__icon" aria-hidden="true"><slot name="icon" :item="item" :index="index">{{ item.label.slice(0, 1) }}</slot></span>
          <span v-if="showLabels" class="tx-motion-dock__label"><slot name="label" :item="item" :index="index">{{ item.label }}</slot></span>
        </slot>
      </component>
    </div>
    <span :id="instructionsId" class="tx-motion-dock__sr">{{ labels.instructions }}</span>
    <span class="tx-motion-dock__sr" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</span>
  </div>
</template>

<style scoped>
.tx-motion-dock { display: inline-flex; box-sizing: border-box; max-width: 100%; padding: 6px; border-radius: 12px; background: var(--tx-fill-color-light, #f5f7fa); box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); color: var(--tx-text-color-regular, #606266); font-size: 13px; }
.tx-motion-dock__items { display: flex; align-items: flex-end; gap: 5px; min-height: var(--tx-motion-dock-base-size); padding-top: 16px; }
.tx-motion-dock__item { position: relative; display: grid; place-items: center; flex: none; box-sizing: border-box; width: var(--tx-motion-dock-item-size, var(--tx-motion-dock-base-size)); height: var(--tx-motion-dock-item-size, var(--tx-motion-dock-base-size)); padding: 2px; border: 0; border-radius: 10px; background: var(--tx-bg-color, #ffffff); box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); color: inherit; font: inherit; text-decoration: none; cursor: grab; user-select: none; touch-action: pan-y; }
.tx-motion-dock__item.is-fixed:not(.is-disabled) { cursor: pointer; }
.tx-motion-dock__item:hover:not(.is-disabled) { background: var(--tx-fill-color, #f0f2f5); }
.tx-motion-dock__item:focus-visible { outline: 2px solid var(--tx-color-primary, #409eff); outline-offset: 3px; }
.tx-motion-dock__item.is-active { box-shadow: inset 0 0 0 2px var(--tx-color-primary, #409eff); }
.tx-motion-dock__item.is-dragging { z-index: 1; cursor: grabbing; }
.tx-motion-dock__item.is-disabled { cursor: not-allowed; opacity: .5; }
.tx-motion-dock__icon { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 8px; background: var(--tx-color-primary-light-9, #ecf5ff); font-weight: 500; }
.tx-motion-dock__label { position: absolute; top: calc(100% + 8px); left: 50%; translate: -50% 0; white-space: nowrap; line-height: 1.5; }
.tx-motion-dock:has(.tx-motion-dock__label) { margin-bottom: 28px; }
.tx-motion-dock__sr { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .tx-motion-dock__item { transition: none; } }
</style>
