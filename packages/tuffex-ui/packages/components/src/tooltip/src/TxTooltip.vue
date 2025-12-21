<script setup lang="ts">
import { autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TooltipProps } from './types'

defineOptions({ name: 'TxTooltip' })

const props = withDefaults(defineProps<TooltipProps>(), {
  content: '',
  disabled: false,
  placement: 'top',
  offset: 8,
  openDelay: 200,
  closeDelay: 120,
  maxWidth: 280,
})

const open = ref(false)
const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)

const cleanupAutoUpdate = ref<(() => void) | null>(null)

const { floatingStyles, update } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ elements }) {
        Object.assign(elements.floating.style, {
          maxWidth: `${props.maxWidth}px`,
        })
      },
    }),
  ],
})

let openTimer: number | null = null
let closeTimer: number | null = null

function clearTimers() {
  if (openTimer) window.clearTimeout(openTimer)
  if (closeTimer) window.clearTimeout(closeTimer)
  openTimer = null
  closeTimer = null
}

function scheduleOpen() {
  if (props.disabled) return
  clearTimers()
  openTimer = window.setTimeout(async () => {
    open.value = true
    await nextTick()
    await update()
  }, props.openDelay)
}

function scheduleClose() {
  clearTimers()
  closeTimer = window.setTimeout(() => {
    open.value = false
  }, props.closeDelay)
}

function onEnter() {
  scheduleOpen()
}

function onLeave() {
  scheduleClose()
}

function onFocusIn() {
  scheduleOpen()
}

function onFocusOut() {
  scheduleClose()
}

function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (!open.value) return
  open.value = false
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
    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(referenceRef.value, floatingRef.value, () => update())
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  document.addEventListener('keydown', onEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEsc)
  clearTimers()
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})
</script>

<template>
  <span
    ref="referenceRef"
    class="tx-tooltip__reference"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <slot />
  </span>

  <Teleport to="body">
    <Transition name="tx-tooltip">
      <div
        v-show="open && !disabled"
        ref="floatingRef"
        class="tx-tooltip"
        role="tooltip"
        :style="floatingStyles"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
      >
        <slot name="content">
          {{ content }}
        </slot>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-tooltip__reference {
  display: inline-flex;
  align-items: center;
}

.tx-tooltip {
  z-index: var(--tx-index-popper, 2000);
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent);
  color: var(--tx-text-color-primary, #303133);
  box-shadow: var(--tx-box-shadow-light, 0 2px 12px rgba(0, 0, 0, 0.1));
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  font-size: 12px;
  line-height: 1.2;
}

.tx-tooltip-enter-active,
.tx-tooltip-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.tx-tooltip-enter-from,
.tx-tooltip-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
</style>
