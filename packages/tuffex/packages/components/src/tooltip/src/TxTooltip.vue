<script setup lang="ts">
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TooltipProps } from './types'

defineOptions({ name: 'TxTooltip' })

const props = withDefaults(defineProps<TooltipProps>(), {
  modelValue: undefined,
  content: '',
  disabled: false,
  trigger: 'hover',
  placement: 'top',
  offset: 8,
  openDelay: 200,
  closeDelay: 120,
  maxWidth: 280,
  showArrow: false,
  interactive: false,
  closeOnClickOutside: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const internalOpen = ref(false)
const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v: boolean) => {
    if (props.disabled)
      return
    internalOpen.value = v
    emit('update:modelValue', v)
    emit(v ? 'open' : 'close')
  },
})

const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const arrowRef = ref<HTMLElement | null>(null)

const cleanupAutoUpdate = ref<(() => void) | null>(null)

const lastOpenedAt = ref(0)

const { floatingStyles, middlewareData, placement, update } = useFloating(referenceRef, floatingRef, {
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
    arrow({ element: arrowRef, padding: 6 }),
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
    lastOpenedAt.value = performance.now()
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
  if (props.trigger !== 'hover')
    return
  scheduleOpen()
}

function onLeave() {
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

function onFloatingEnter(): void {
  if (!props.interactive)
    return
  if (props.trigger !== 'hover')
    return
  clearTimers()
}

function onFloatingLeave(): void {
  if (!props.interactive)
    return
  if (props.trigger !== 'hover')
    return
  scheduleClose()
}

function onFocusIn() {
  if (props.trigger !== 'focus')
    return
  scheduleOpen()
}

function onFocusOut() {
  if (props.trigger !== 'focus')
    return
  scheduleClose()
}

function onClickToggle(): void {
  if (props.trigger !== 'click')
    return
  clearTimers()
  if (!open.value)
    lastOpenedAt.value = performance.now()
  open.value = !open.value
}

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

function handleOutside(e: Event): void {
  if (!props.closeOnClickOutside)
    return
  if (props.trigger !== 'click')
    return
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
    open.value = false
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
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', onEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', onEsc)
  clearTimers()
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})

const arrowStyle = computed<Record<string, string>>(() => {
  if (!props.showArrow)
    return {}
  const data = (middlewareData.value as any)?.arrow
  const x = data?.x
  const y = data?.y
  const side = String(placement.value || 'top').split('-')[0]
  const base: Record<string, string> = {
    left: x != null ? `${x}px` : '',
    top: y != null ? `${y}px` : '',
  }

  const staticSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[side] as string

  base[staticSide] = '-5px'
  return base
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
    @click.capture="onClickToggle"
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
        @mouseenter="onFloatingEnter"
        @mouseleave="onFloatingLeave"
      >
        <div v-if="props.showArrow" ref="arrowRef" class="tx-tooltip__arrow" :style="arrowStyle" aria-hidden="true" />
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

.tx-tooltip__arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  transform: rotate(45deg);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent);
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  box-sizing: border-box;
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
