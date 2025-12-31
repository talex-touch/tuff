<script setup lang="ts">
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
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
  arrowSize: 12,
  interactive: false,
  closeOnClickOutside: true,
  motion: 'split',
  fusion: false,
  panelVariant: 'solid',
  panelBackground: 'blur',
  panelShadow: 'soft',
  panelRadius: 10,
  panelPadding: 8,
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
    if (v)
      emit('open')
    else
      emit('close')
  },
})

const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const arrowRef = ref<HTMLElement | null>(null)

const cleanupAutoUpdate = ref<(() => void) | null>(null)

const lastOpenedAt = ref(0)

const stablePlacement = ref<string | null>(null)

const { floatingStyles, middlewareData, placement, update } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  transform: false,
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
    arrow({ 
      element: computed(() => arrowRef.value),
      padding: 6 
    }),
  ],
})

const splitX = ref(0)
const splitY = ref(0)

const motion = computed(() => (props.motion === 'fade' ? 'fade' : 'split'))

const tooltipClass = computed(() => {
  return [
    'tx-tooltip',
    `is-variant-${props.panelVariant}`,
    `is-bg-${props.panelBackground}`,
    `is-shadow-${props.panelShadow}`,
    { 'is-fusion': !!props.fusion, 'is-motion-split': motion.value === 'split' },
  ]
})

const tooltipVars = computed<Record<string, string>>(() => {
  const side = String(stablePlacement.value || placement.value || props.placement || 'top').split('-')[0]
  const arrowData = (middlewareData.value as any)?.arrow
  const arrowSize = props.arrowSize || 12

  let fusionX = '50%'
  let fusionY = '50%'

  if (props.showArrow && arrowData) {
    if (side === 'top' || side === 'bottom') {
      if (arrowData.x != null)
        fusionX = `${arrowData.x + arrowSize * 0.5}px`
    }
    else {
      if (arrowData.y != null)
        fusionY = `${arrowData.y + arrowSize * 0.5}px`
    }
  }

  return {
    '--tx-tooltip-radius': `${props.panelRadius}px`,
    '--tx-tooltip-padding': `${props.panelPadding}px`,
    '--tx-tooltip-arrow-size': `${props.arrowSize}px`,
    '--tx-tooltip-split-x': `${splitX.value}px`,
    '--tx-tooltip-split-y': `${splitY.value}px`,
    '--tx-tooltip-fusion-x': fusionX,
    '--tx-tooltip-fusion-y': fusionY,
  }
})

const uid = useId()
const gooFilterId = `tx-tooltip-goo-${uid}`

const gooMatrixValues = computed(() => {
  const alpha = 26
  const alphaOffset = -12
  return `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${alpha} ${alphaOffset}`
})

const fusionVars = computed<Record<string, string>>(() => {
  const out = Math.max(12, (props.offset ?? 8) + (props.arrowSize ?? 12) * 0.8)
  const size = Math.max(26, (props.arrowSize ?? 12) * 3.2)
  return {
    '--tx-tooltip-goo-out': `${out}px`,
    '--tx-tooltip-goo-size': `${size}px`,
  }
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
      stablePlacement.value = null
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      return
    }
    await nextTick()
    await update()
    stablePlacement.value = placement.value
    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(referenceRef.value, floatingRef.value, () => update())
    }
  },
  { flush: 'post' },
)

onMounted(async () => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', onEsc)
  
  // Pre-calculate position even when closed to avoid jump on first open
  await nextTick()
  if (referenceRef.value) {
    await update()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', onEsc)
  clearTimers()
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})

const arrowStyle = computed<Record<string, string>>(() => {
  if (!props.showArrow || !arrowRef.value)
    return { display: 'none' }
    
  const data = (middlewareData.value as any)?.arrow
  
  // Ensure arrow data is stable and valid
  if (!data || (data.x == null && data.y == null)) {
    return { display: 'none' }
  }
  
  const x = data.x
  const y = data.y
  const side = String(placement.value || props.placement || 'top').split('-')[0]
  
  const base: Record<string, string> = {
    display: 'block',
    position: 'absolute',
  }
  
  // Only set position if we have valid coordinates
  if (x != null) base.left = `${x}px`
  if (y != null) base.top = `${y}px`
  
  const staticSide = {
    top: 'bottom',
    right: 'left', 
    bottom: 'top',
    left: 'right',
  }[side] as string

  const half = Math.round((props.arrowSize || 12) / 2)
  base[staticSide] = `calc(-${half}px + 1px)`
  
  return base
})

const arrowSide = computed(() => String(stablePlacement.value || placement.value || props.placement || 'top').split('-')[0])

function onBeforeEnter(el: Element) {
  if (motion.value !== 'split') {
    splitX.value = 0
    splitY.value = 0
    return
  }

  const node = el as HTMLElement
  const refEl = referenceRef.value
  if (!refEl) return

  const refRect = refEl.getBoundingClientRect()
  const side = arrowSide.value

  const refCx = refRect.left + refRect.width * 0.5
  const refCy = refRect.top + refRect.height * 0.5

  let tipX = refCx
  let tipY = refCy

  const arrowEl = props.showArrow ? arrowRef.value : null
  if (arrowEl) {
    const arrowRect = arrowEl.getBoundingClientRect()
    tipX = arrowRect.left + arrowRect.width * 0.5
    tipY = arrowRect.top + arrowRect.height * 0.5
    if (side === 'top') tipY = arrowRect.bottom
    if (side === 'bottom') tipY = arrowRect.top
    if (side === 'left') tipX = arrowRect.right
    if (side === 'right') tipX = arrowRect.left
  }
  else {
    const floatRect = node.getBoundingClientRect()
    tipX = floatRect.left + floatRect.width * 0.5
    tipY = floatRect.top + floatRect.height * 0.5
  }

  const dx = refCx - tipX
  const dy = refCy - tipY

  const limit = 18
  const clamp = (v: number) => Math.min(limit, Math.max(-limit, v))

  splitX.value = side === 'left' || side === 'right' ? clamp(dx) : 0
  splitY.value = side === 'top' || side === 'bottom' ? clamp(dy) : 0
}
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
    <Transition name="tx-tooltip" @before-enter="onBeforeEnter">
      <div
        v-if="open && !disabled"
        ref="floatingRef"
        :class="tooltipClass"
        :data-side="arrowSide"
        role="tooltip"
        :style="[floatingStyles, tooltipVars]"
        @mouseenter="onFloatingEnter"
        @mouseleave="onFloatingLeave"
      >
        <svg class="tx-tooltip__fusion-filters" width="0" height="0" aria-hidden="true">
          <defs>
            <filter :id="gooFilterId">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
              <feColorMatrix in="blur" mode="matrix" :values="gooMatrixValues" result="goo" />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
        </svg>

        <div
          v-if="props.showArrow"
          ref="arrowRef"
          class="tx-tooltip__arrow"
          :data-side="arrowSide"
          :style="arrowStyle"
          aria-hidden="true"
        />

        <div
          v-if="props.fusion && motion === 'split'"
          class="tx-tooltip__fusion"
          :style="fusionVars"
          aria-hidden="true"
        >
          <div class="tx-tooltip__fusion-goo" :style="{ filter: `url(#${gooFilterId})` }">
            <div class="tx-tooltip__fusion-blob tx-tooltip__fusion-blob--tip" />
            <div class="tx-tooltip__fusion-blob tx-tooltip__fusion-blob--ref" />
          </div>
        </div>

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
  padding: var(--tx-tooltip-padding, 8px);
  border-radius: var(--tx-tooltip-radius, 10px);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
  background: var(--tx-bg-color-overlay, #fff);
  color: var(--tx-text-color-primary, #303133);
  box-shadow: none;
  font-size: 12px;
  line-height: 1.2;
  transform-origin: center;
}

.tx-tooltip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  z-index: 0;
}

.tx-tooltip > :not(.tx-tooltip__arrow):not(.tx-tooltip__fusion):not(.tx-tooltip__fusion-filters) {
  position: relative;
  z-index: 1;
}

.tx-tooltip > .tx-tooltip__arrow {
  z-index: 0;
}

.tx-tooltip.is-variant-solid,
.tx-tooltip.is-variant-dashed {
  border-style: solid;
}

.tx-tooltip.is-variant-dashed {
  border-style: dashed;
}

.tx-tooltip.is-variant-plain {
  border: none;
}

.tx-tooltip.is-bg-mask {
  background: var(--tx-bg-color-overlay, #fff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-tooltip.is-bg-blur {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-tooltip.is-bg-glass {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  border-color: color-mix(in srgb, rgba(255, 255, 255, 0.26) 55%, var(--tx-border-color-light, #e4e7ed));
}

.tx-tooltip.is-bg-glass::before {
  opacity: 0.22;
  background:
    radial-gradient(700px 220px at 0% 0%, rgba(255, 255, 255, 0.55), transparent 55%),
    radial-gradient(600px 260px at 100% 0%, rgba(255, 255, 255, 0.22), transparent 58%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02) 45%, rgba(255, 255, 255, 0) 68%);
}

.tx-tooltip.is-shadow-none {
  box-shadow: none;
}

.tx-tooltip.is-shadow-soft {
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
}

.tx-tooltip.is-shadow-medium {
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.18);
}

.tx-tooltip.is-fusion {
  filter: saturate(1.35) contrast(1.08);
}

.tx-tooltip.is-fusion::before {
  opacity: 0.08;
  background:
    radial-gradient(520px 220px at 50% 0%, rgba(255, 255, 255, 0.22), transparent 66%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 60%);
  filter: blur(16px);
}

.tx-tooltip.is-fusion.is-motion-split::after {
  content: none;
  position: absolute;
  pointer-events: none;
  z-index: 0;
  opacity: 0.06;
  width: calc(var(--tx-tooltip-arrow-size, 12px) * 3.6);
  height: calc(var(--tx-tooltip-arrow-size, 12px) * 2.6);
  border-radius: 999px;
  mix-blend-mode: soft-light;
  filter: blur(3px) saturate(1.22);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.46),
    inset 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent),
    0 0 0 1px color-mix(in srgb, rgba(255, 255, 255, 0.52) 62%, transparent),
    0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent),
    0 14px 34px rgba(0, 0, 0, 0.10);
  transition: opacity 0.16s ease, transform 0.16s ease, filter 0.16s ease, border-radius 0.16s ease;
}

.tx-tooltip.is-fusion.is-motion-split[data-side='top']::after {
  left: var(--tx-tooltip-fusion-x, 50%);
  bottom: 0;
  transform: translate3d(-50%, 70%, 0) scale(0.65);
}

.tx-tooltip.is-fusion.is-motion-split[data-side='bottom']::after {
  left: var(--tx-tooltip-fusion-x, 50%);
  top: 0;
  transform: translate3d(-50%, -70%, 0) scale(0.65);
}

.tx-tooltip.is-fusion.is-motion-split[data-side='left']::after {
  top: var(--tx-tooltip-fusion-y, 50%);
  right: 0;
  transform: translate3d(70%, -50%, 0) scale(0.65);
}

.tx-tooltip.is-fusion.is-motion-split[data-side='right']::after {
  top: var(--tx-tooltip-fusion-y, 50%);
  left: 0;
  transform: translate3d(-70%, -50%, 0) scale(0.65);
}

.tx-tooltip.is-bg-mask.is-fusion.is-motion-split::after {
  background:
    radial-gradient(circle at 38% 52%, rgba(255, 255, 255, 0.52), transparent 58%),
    radial-gradient(circle at 62% 48%, color-mix(in srgb, var(--tx-color-primary, #409eff) 38%, rgba(255, 255, 255, 0.44)), transparent 58%),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.16), transparent 74%),
    var(--tx-bg-color-overlay, #fff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-tooltip.is-bg-blur.is-fusion.is-motion-split::after {
  background:
    radial-gradient(circle at 38% 52%, rgba(255, 255, 255, 0.44), transparent 58%),
    radial-gradient(circle at 62% 48%, color-mix(in srgb, var(--tx-color-primary, #409eff) 36%, rgba(255, 255, 255, 0.34)), transparent 58%),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.14), transparent 74%),
}

.tx-tooltip__arrow {
  position: absolute;
  width: var(--tx-tooltip-arrow-size, 12px);
  height: var(--tx-tooltip-arrow-size, 12px);
  pointer-events: none;
  background: transparent;
  z-index: 0;
}

.tx-tooltip__arrow::before,
.tx-tooltip__arrow::after {
  content: '';
  position: absolute;
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

.tx-tooltip__arrow::before {
  inset: -1px;
  background: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
  z-index: 0;
}

.tx-tooltip__arrow::after {
  inset: 0;
  background: var(--tx-bg-color-overlay, #fff);
  z-index: 1;
}

.tx-tooltip.is-bg-mask .tx-tooltip__arrow::after {
  background: var(--tx-bg-color-overlay, #fff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-tooltip.is-bg-blur .tx-tooltip__arrow::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-tooltip.is-bg-glass .tx-tooltip__arrow::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
}

.tx-tooltip__arrow[data-side='top'] {
  transform: rotate(180deg);
}

.tx-tooltip__arrow[data-side='bottom'] {
  transform: rotate(0deg);
}

.tx-tooltip__arrow[data-side='left'] {
  transform: rotate(90deg);
}

.tx-tooltip__arrow[data-side='right'] {
  transform: rotate(-90deg);
}

.tx-tooltip-enter-active,
.tx-tooltip-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tx-tooltip-enter-from,
.tx-tooltip-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

.tx-tooltip.is-motion-split.tx-tooltip-enter-from,
.tx-tooltip.is-motion-split.tx-tooltip-leave-to {
  transform: translate3d(var(--tx-tooltip-split-x, 0px), var(--tx-tooltip-split-y, 0px), 0) scale(0.92);
}

.tx-tooltip__fusion {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.18;
  transition: opacity 0.16s ease, filter 0.16s ease;
}

.tx-tooltip__fusion-goo {
  position: absolute;
  inset: 0;
}

.tx-tooltip__fusion-blob {
  position: absolute;
  width: var(--tx-tooltip-goo-size, 38px);
  height: var(--tx-tooltip-goo-size, 38px);
  border-radius: 999px;
  background:
    radial-gradient(circle at 38% 52%, rgba(255, 255, 255, 0.52), transparent 58%),
    radial-gradient(circle at 62% 48%, color-mix(in srgb, var(--tx-color-primary, #409eff) 36%, rgba(255, 255, 255, 0.42)), transparent 58%),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.16), transparent 74%);
  filter: saturate(1.22);
  mix-blend-mode: screen;
  box-shadow:
    0 0 0 1px color-mix(in srgb, rgba(255, 255, 255, 0.52) 60%, transparent),
    0 16px 42px rgba(0, 0, 0, 0.10);
}

.tx-tooltip[data-side='top'] .tx-tooltip__fusion-blob--tip {
  left: var(--tx-tooltip-fusion-x, 50%);
  top: 100%;
  transform: translate3d(-50%, -50%, 0) scale(0.78);
}

.tx-tooltip[data-side='top'] .tx-tooltip__fusion-blob--ref {
  left: var(--tx-tooltip-fusion-x, 50%);
  top: calc(100% + var(--tx-tooltip-goo-out, 18px));
  transform: translate3d(-50%, -50%, 0) scale(0.88);
}

.tx-tooltip[data-side='bottom'] .tx-tooltip__fusion-blob--tip {
  left: var(--tx-tooltip-fusion-x, 50%);
  top: 0;
  transform: translate3d(-50%, -50%, 0) scale(0.78);
}

.tx-tooltip[data-side='bottom'] .tx-tooltip__fusion-blob--ref {
  left: var(--tx-tooltip-fusion-x, 50%);
  top: calc(0px - var(--tx-tooltip-goo-out, 18px));
  transform: translate3d(-50%, -50%, 0) scale(0.88);
}

.tx-tooltip[data-side='left'] .tx-tooltip__fusion-blob--tip {
  left: 100%;
  top: var(--tx-tooltip-fusion-y, 50%);
  transform: translate3d(-50%, -50%, 0) scale(0.78);
}

.tx-tooltip[data-side='left'] .tx-tooltip__fusion-blob--ref {
  left: calc(100% + var(--tx-tooltip-goo-out, 18px));
  top: var(--tx-tooltip-fusion-y, 50%);
  transform: translate3d(-50%, -50%, 0) scale(0.88);
}

.tx-tooltip[data-side='right'] .tx-tooltip__fusion-blob--tip {
  left: 0;
  top: var(--tx-tooltip-fusion-y, 50%);
  transform: translate3d(-50%, -50%, 0) scale(0.78);
}

.tx-tooltip[data-side='right'] .tx-tooltip__fusion-blob--ref {
  left: calc(0px - var(--tx-tooltip-goo-out, 18px));
  top: var(--tx-tooltip-fusion-y, 50%);
  transform: translate3d(-50%, -50%, 0) scale(0.88);
}

.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-enter-from .tx-tooltip__fusion,
.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-leave-to .tx-tooltip__fusion {
  opacity: 1;
  filter: saturate(1.35) contrast(1.12);
}

.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-enter-from[data-side='top']::after,
.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-leave-to[data-side='top']::after {
  border-radius: 52% 48% 62% 38% / 54% 46% 58% 42%;
  transform: translate3d(-50%, 104%, 0) rotate(6deg) scaleX(1.58) scaleY(1.18);
}

.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-enter-from[data-side='bottom']::after,
.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-leave-to[data-side='bottom']::after {
  border-radius: 46% 54% 40% 60% / 42% 58% 46% 54%;
  transform: translate3d(-50%, -104%, 0) rotate(-6deg) scaleX(1.58) scaleY(1.18);
}

.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-enter-from[data-side='left']::after,
.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-leave-to[data-side='left']::after {
  border-radius: 58% 42% 52% 48% / 44% 56% 40% 60%;
  transform: translate3d(104%, -50%, 0) rotate(-6deg) scaleX(1.18) scaleY(1.58);
}

.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-enter-from[data-side='right']::after,
.tx-tooltip.is-fusion.is-motion-split.tx-tooltip-leave-to[data-side='right']::after {
  border-radius: 44% 56% 38% 62% / 60% 40% 56% 44%;
  transform: translate3d(-104%, -50%, 0) rotate(6deg) scaleX(1.18) scaleY(1.58);
}
</style>
