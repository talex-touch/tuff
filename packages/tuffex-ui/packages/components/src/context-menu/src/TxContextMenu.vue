<script setup lang="ts">
import { autoUpdate, flip, shift, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ContextMenuProps } from './types'

defineOptions({ name: 'TxContextMenu' })

const props = withDefaults(defineProps<ContextMenuProps>(), {
  modelValue: false,
  x: 0,
  y: 0,
  width: 220,
  closeOnEsc: true,
  closeOnClickOutside: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open', payload: { x: number; y: number }): void
  (e: 'close'): void
}>()

const open = computed({
  get: () => !!props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    if (v)
      emit('open', { x: props.x, y: props.y })
    else
      emit('close')
  },
})

const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const point = ref({ x: props.x, y: props.y })

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

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  point.value = { x: e.clientX, y: e.clientY }
  open.value = true
}

function handleOutside(e: MouseEvent) {
  if (!props.closeOnClickOutside) return
  if (!open.value) return
  const t = e.target as Node | null
  const inTrigger = !!triggerRef.value && !!t && triggerRef.value.contains(t)
  const inMenu = !!menuRef.value && !!t && menuRef.value.contains(t)
  if (!inTrigger && !inMenu) close()
}

function handleEsc(e: KeyboardEvent) {
  if (!props.closeOnEsc) return
  if (e.key !== 'Escape') return
  if (!open.value) return
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
  document.addEventListener('click', handleOutside)
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutside)
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
        :style="[floatingStyles, { width: `${width}px` }]"
        role="menu"
      >
        <slot name="menu" />
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-context-menu__trigger {
  display: inline-block;
}

.tx-context-menu {
  z-index: var(--tx-index-popper, 2000);
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
