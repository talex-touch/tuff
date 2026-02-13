<script setup lang="ts">
import type { ContextMenuProps } from './types'
import { autoUpdate, flip, shift, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({ name: 'TxContextMenu' })

const props = withDefaults(defineProps<ContextMenuProps>(), {
  modelValue: undefined,
  x: 0,
  y: 0,
  width: 220,
  closeOnEsc: true,
  closeOnClickOutside: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open', payload: { x: number, y: number }): void
  (e: 'close'): void
}>()

const internalOpen = ref(false)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v) => {
    if (typeof props.modelValue !== 'boolean')
      internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open', { x: point.value.x, y: point.value.y })
    else
      emit('close')
  },
})

const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const zIndex = ref(getZIndex())
const point = ref({ x: props.x, y: props.y })

const lastOpenedAt = ref(0)

const virtualReference = computed(() => {
  return {
    getBoundingClientRect() {
      return {
        x: point.value.x,
        y: point.value.y,
        top: point.value.y,
        left: point.value.x,
        right: point.value.x,
        bottom: point.value.y,
        width: 0,
        height: 0,
      } as DOMRect
    },
  }
})

const cleanupAutoUpdate = ref<(() => void) | null>(null)

const { floatingStyles, update } = useFloating(virtualReference as any, menuRef, {
  placement: 'bottom-start',
  strategy: 'fixed',
  middleware: [flip({ padding: 8 }), shift({ padding: 8 })],
})

function close() {
  open.value = false
}

provide('txContextMenu', {
  close,
})

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  point.value = { x: e.clientX, y: e.clientY }
  lastOpenedAt.value = performance.now()
  open.value = true
}

watch(
  () => [props.x, props.y],
  ([x, y]) => {
    point.value = { x: x ?? 0, y: y ?? 0 }
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

function handleOutside(e: MouseEvent) {
  if (!props.closeOnClickOutside)
    return
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inTrigger = isEventInside(e, triggerRef.value)
  const inMenu = isEventInside(e, menuRef.value)
  if (!inTrigger && !inMenu)
    close()
}

function handleEsc(e: KeyboardEvent) {
  if (!props.closeOnEsc)
    return
  if (e.key !== 'Escape')
    return
  if (!open.value)
    return
  close()
}

watch(
  open,
  async (v) => {
    if (!v) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      return
    }
    zIndex.value = nextZIndex()
    await nextTick()
    await update()
    if (menuRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(document.documentElement, menuRef.value, () => update())
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})
</script>

<template>
  <div ref="triggerRef" class="tx-context-menu__trigger" @contextmenu="onContextMenu">
    <slot name="trigger">
      <slot />
    </slot>
  </div>

  <Teleport to="body">
    <Transition name="tx-context-menu">
      <div
        v-show="open"
        ref="menuRef"
        class="tx-context-menu"
        :style="[floatingStyles, { width: `${width}px`, zIndex }]"
        role="menu"
      >
        <slot name="menu" />
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-context-menu__trigger {
  display: block;
  width: 100%;
}

.tx-context-menu {
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 92%, transparent);
  box-shadow: var(--tx-box-shadow-dark, 0 16px 48px 16px rgba(0, 0, 0, 0.08));
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}

.tx-context-menu-enter-active,
.tx-context-menu-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.tx-context-menu-enter-from,
.tx-context-menu-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
