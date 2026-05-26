<script setup lang="ts">
import type { ContextMenuOpenTarget, ContextMenuPoint, ContextMenuProps } from './types'
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'
import TxContextMenuPanel from './TxContextMenuPanel.vue'

defineOptions({ name: 'TxContextMenu' })

const props = withDefaults(defineProps<ContextMenuProps>(), {
  modelValue: undefined,
  x: 0,
  y: 0,
  width: 220,
  minWidth: 0,
  maxWidth: 360,
  maxHeight: 420,
  unlimitedHeight: false,
  disabled: false,
  eager: false,
  trigger: 'contextmenu',
  anchorMode: 'pointer',
  preventDefault: true,
  placement: 'bottom-start',
  offset: 2,
  closeOnEsc: true,
  closeOnClickOutside: true,
  closeOnTriggerPointerDown: true,
  closeOnAnyPointerDown: false,
  closeOnSelect: true,
  showArrow: false,
  arrowSize: 10,
  animation: () => ({}),
  duration: 160,
  keepAliveContent: true,
  panelVariant: 'solid',
  panelBackground: 'refraction',
  panelShadow: 'medium',
  panelRadius: 14,
  panelPadding: 6,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open', payload: { x: number, y: number }): void
  (e: 'close'): void
}>()

const internalOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const anchorRef = ref<InstanceType<typeof TxBaseAnchor> | null>(null)
const point = ref<ContextMenuPoint>({ x: props.x, y: props.y })
const lastOpenedAt = ref(0)
const openedByContextMenu = ref(false)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v) => {
    if (props.disabled && v)
      return
    if (typeof props.modelValue !== 'boolean')
      internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open', { x: point.value.x, y: point.value.y })
    else
      emit('close')
  },
})

function getPointerRect(): DOMRect {
  const { x, y } = point.value
  return {
    x,
    y,
    top: y,
    left: x,
    right: x,
    bottom: y,
    width: 0,
    height: 0,
  } as DOMRect
}

const virtualReference = markRaw({
  getBoundingClientRect() {
    if (props.anchorMode === 'reference')
      return triggerRef.value?.getBoundingClientRect() ?? getPointerRect()
    return getPointerRect()
  },
})

function close() {
  open.value = false
}

function readPoint(target?: ContextMenuOpenTarget): ContextMenuPoint {
  if (!target)
    return point.value
  if ('clientX' in target && 'clientY' in target) {
    return {
      x: Math.round(target.clientX),
      y: Math.round(target.clientY),
    }
  }
  return {
    x: Math.round(target.x),
    y: Math.round(target.y),
  }
}

async function syncPosition() {
  await nextTick()
  await anchorRef.value?.updatePosition?.()
}

function openAt(target?: ContextMenuOpenTarget) {
  if (props.disabled)
    return
  point.value = readPoint(target)
  lastOpenedAt.value = performance.now()
  open.value = true
  void syncPosition()
}

function openFromEvent(e: MouseEvent | PointerEvent) {
  openAt(e)
}

function isContextMenuTriggerEnabled() {
  return props.trigger === 'contextmenu' || props.trigger === 'both'
}

function isClickTriggerEnabled() {
  return props.trigger === 'click' || props.trigger === 'both'
}

function onContextMenu(e: MouseEvent) {
  if (!isContextMenuTriggerEnabled())
    return
  if (props.preventDefault)
    e.preventDefault()
  openedByContextMenu.value = true
  openFromEvent(e)
}

function onClick(e: MouseEvent) {
  if (!isClickTriggerEnabled())
    return
  openedByContextMenu.value = false
  openFromEvent(e)
}

function shouldCloseFromTriggerPointerDown(e: MouseEvent) {
  if (!props.closeOnTriggerPointerDown)
    return false
  if (isClickTriggerEnabled())
    return false
  if (!openedByContextMenu.value)
    return false
  if (e.button !== 0)
    return false
  return true
}

function onTriggerPointerDown(e: PointerEvent) {
  if (!open.value)
    return
  if (!shouldCloseFromTriggerPointerDown(e as unknown as MouseEvent))
    return
  close()
}

watch(
  () => [props.x, props.y],
  ([x, y]) => {
    point.value = { x: x ?? 0, y: y ?? 0 }
  },
)

watch(
  () => [point.value.x, point.value.y],
  () => {
    if (!open.value)
      return
    void syncPosition()
  },
)

function isEventInside(e: Event, el: HTMLElement | null): boolean {
  if (!el)
    return false
  const anyE = e as any
  const path: EventTarget[] | undefined = typeof anyE.composedPath === 'function' ? anyE.composedPath() : undefined
  if (path && path.length)
    return path.includes(el)
  const t = (e.target ?? null) as Node | null
  return !!t && el.contains(t)
}

function isEventInsideMenuLayer(e: Event): boolean {
  const anyE = e as any
  const path: EventTarget[] | undefined = typeof anyE.composedPath === 'function' ? anyE.composedPath() : undefined
  const nodes = path && path.length ? path : [(e.target ?? null) as EventTarget | null]
  return nodes.some((node) => {
    if (!(node instanceof HTMLElement))
      return false
    return !!node.closest('[data-tx-context-menu-layer="true"]')
  })
}

function handlePointerDown(e: MouseEvent) {
  if (!props.closeOnAnyPointerDown && !props.closeOnTriggerPointerDown)
    return
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return

  if (isEventInsideMenuLayer(e))
    return

  const inTrigger = isEventInside(e, triggerRef.value)
  if (props.closeOnAnyPointerDown || (inTrigger && shouldCloseFromTriggerPointerDown(e)))
    close()
}

function onAnchorUpdate(v: boolean) {
  open.value = v
}

function onAnchorOpen() {}

function onAnchorClose() {}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled)
      close()
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown, true)
})

defineExpose({
  close,
  openAt,
  openFromEvent,
  updatePosition: () => anchorRef.value?.updatePosition?.(),
})
</script>

<template>
  <div
    ref="triggerRef"
    class="tx-context-menu__trigger"
    :class="{ 'is-disabled': disabled }"
    @contextmenu="onContextMenu"
    @pointerdown="onTriggerPointerDown"
    @click="onClick"
  >
    <slot name="trigger">
      <slot />
    </slot>
  </div>

  <TxBaseAnchor
    ref="anchorRef"
    class="tx-context-menu"
    :model-value="open"
    :disabled="disabled"
    :eager="eager"
    :virtual-reference="virtualReference"
    :placement="placement"
    :offset="offset"
    :width="width"
    :min-width="minWidth"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :unlimited-height="unlimitedHeight"
    :match-reference-width="false"
    :animation="animation"
    :duration="duration"
    :use-card="true"
    :panel-variant="panelVariant"
    :panel-background="panelBackground"
    :panel-shadow="panelShadow"
    :panel-radius="panelRadius"
    :panel-padding="panelPadding"
    :panel-card="panelCard"
    :show-arrow="showArrow"
    :arrow-size="arrowSize"
    :keep-alive-content="keepAliveContent"
    :close-on-click-outside="closeOnClickOutside"
    :close-on-esc="closeOnEsc"
    :toggle-on-reference-click="false"
    @update:model-value="onAnchorUpdate"
    @open="onAnchorOpen"
    @close="onAnchorClose"
  >
    <template #reference>
      <span aria-hidden="true" />
    </template>

    <template #default>
      <TxContextMenuPanel
        :close="close"
        :close-on-select="closeOnSelect"
      >
        <slot name="menu" />
      </TxContextMenuPanel>
    </template>
  </TxBaseAnchor>
</template>

<style lang="scss" scoped>
.tx-context-menu__trigger {
  display: block;
  width: 100%;
}

.tx-context-menu__trigger.is-disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

:global(.tx-context-menu.tx-base-anchor) {
  --tx-card-fake-background: var(--tx-bg-color-overlay, #fff);
}
</style>
