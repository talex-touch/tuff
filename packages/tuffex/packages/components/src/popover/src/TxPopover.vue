<script setup lang="ts">
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TxCard from '../../card/src/TxCard.vue'
import type { PopoverProps } from './types'

defineOptions({ name: 'TxPopover' })

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: false,
  disabled: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  referenceFullWidth: false,
  showArrow: false,
  arrowSize: 12,
  motion: 'split',
  fusion: false,
  panelVariant: 'solid',
  panelBackground: 'blur',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 10,
  closeOnClickOutside: true,
  closeOnEsc: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const open = computed({
  get: () => !!props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    emit(v ? 'open' : 'close')
  },
})

const referenceRef = ref<HTMLElement | null>(null)
const floatingRef = ref<HTMLElement | null>(null)
const arrowRef = ref<HTMLElement | null>(null)
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)

const splitX = ref(0)
const splitY = ref(0)

const motion = computed(() => (props.motion === 'fade' ? 'fade' : 'split'))

const popoverVars = computed<Record<string, string>>(() => {
  return {
    '--tx-popover-arrow-size': `${props.arrowSize}px`,
    '--tx-popover-radius': `${props.panelRadius}px`,
    '--tx-popover-split-x': `${splitX.value}px`,
    '--tx-popover-split-y': `${splitY.value}px`,
  }
})

const { floatingStyles, middlewareData, placement, update } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        const baseW = rects.reference.width
        const minW = Math.max(0, props.minWidth ?? 0)
        const w = props.width > 0 ? props.width : Math.max(baseW, minW)
        const maxH = Math.min(availableHeight, 420)
        Object.assign(elements.floating.style, {
          width: `${w}px`,
          maxWidth: `${props.maxWidth}px`,
        })

        elements.floating.style.setProperty('--tx-popover-max-height', `${maxH}px`)
      },
    }),
    arrow({ 
      element: computed(() => arrowRef.value),
      padding: 6 
    }),
  ],
})

const arrowSide = computed(() => String(placement.value || props.placement || 'bottom').split('-')[0])

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
  const side = arrowSide.value
  
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
  const side = String(placement.value || props.placement || 'bottom').split('-')[0]

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

  splitX.value = side === 'left' || side === 'right' ? dx : 0
  splitY.value = side === 'top' || side === 'bottom' ? dy : 0
}

function toggle() {
  if (props.disabled) return
  if (!open.value)
    lastOpenedAt.value = performance.now()
  open.value = !open.value
}

function close() {
  open.value = false
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

function handleOutside(e: Event) {
  if (!props.closeOnClickOutside) return
  if (!open.value) return

  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
    close()
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

    lastOpenedAt.value = performance.now()
    await nextTick()
    await update()
    if (referenceRef.value && floatingRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(referenceRef.value, floatingRef.value, () => update())
    }
  },
  { flush: 'post' },
)

onMounted(async () => {
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('keydown', handleEsc)
  
  // Pre-calculate position even when closed to avoid jump on first open
  await nextTick()
  if (referenceRef.value) {
    await update()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})
</script>

<template>
  <div
    ref="referenceRef"
    class="tx-popover__reference"
    :class="{ 'is-full-width': referenceFullWidth }"
    @click.capture="toggle"
  >
    <slot name="reference" />
  </div>

  <Teleport to="body">
    <Transition name="tx-popover" @before-enter="onBeforeEnter">
      <div
        v-if="open && !disabled"
        ref="floatingRef"
        class="tx-popover"
        :class="[
          `is-bg-${panelBackground}`,
          { 'is-fusion': !!props.fusion, 'is-motion-split': motion === 'split' },
        ]"
        :style="[floatingStyles, popoverVars]"
      >
        <div
          v-if="props.showArrow"
          ref="arrowRef"
          class="tx-popover__arrow"
          :data-side="arrowSide"
          :style="arrowStyle"
          aria-hidden="true"
        />
        <TxCard
          class="tx-popover__card"
          :variant="panelVariant"
          :background="panelBackground"
          :shadow="panelShadow"
          :radius="panelRadius"
          :padding="panelPadding"
        >
          <slot />
        </TxCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-popover__reference {
  display: inline-flex;
  align-items: center;
  width: fit-content;

  &.is-full-width {
    width: 100%;
  }
}

.tx-popover {
  z-index: var(--tx-index-popper, 2000);
  padding: 0;
  background: transparent;
  border: none;
  overflow: visible;
}

.tx-popover::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--tx-popover-radius, 18px);
  pointer-events: none;
  opacity: 0;
  z-index: 0;
}

.tx-popover > * {
  position: relative;
  z-index: 1;
}

.tx-popover.is-fusion {
  filter: saturate(1.28) contrast(1.06);
}

.tx-popover.is-fusion::before {
  opacity: 0.45;
  background:
    radial-gradient(600px 240px at 15% 8%, color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent), transparent 65%),
    radial-gradient(500px 280px at 85% 0%, rgba(255, 255, 255, 0.42), transparent 70%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.15), transparent 60%);
  filter: blur(18px) saturate(1.2);
  mix-blend-mode: soft-light;
}

.tx-popover__card {
  width: 100%;
  max-height: var(--tx-popover-max-height, 420px);
  overflow: auto;
}

.tx-popover__arrow {
  position: absolute;
  width: var(--tx-popover-arrow-size, 12px);
  height: var(--tx-popover-arrow-size, 12px);
  pointer-events: none;
  background: transparent;
}

.tx-popover__arrow::before,
.tx-popover__arrow::after {
  content: '';
  position: absolute;
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

.tx-popover__arrow::before {
  inset: -1px;
  background: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
  z-index: 0;
}

.tx-popover__arrow::after {
  inset: 0;
  background: var(--tx-bg-color-overlay, #fff);
  z-index: 1;
}

.tx-popover.is-bg-mask {
  background: transparent;
}

.tx-popover.is-bg-mask .tx-popover__arrow::after {
  background: var(--tx-bg-color-overlay, #fff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-popover.is-bg-blur .tx-popover__arrow::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-popover.is-bg-glass .tx-popover__arrow::after {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
}

.tx-popover__arrow[data-side='top'] {
  transform: rotate(180deg);
}

.tx-popover__arrow[data-side='bottom'] {
  transform: rotate(0deg);
}

.tx-popover__arrow[data-side='left'] {
  transform: rotate(90deg);
}

.tx-popover__arrow[data-side='right'] {
  transform: rotate(-90deg);
}

.tx-popover-enter-active,
.tx-popover-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tx-popover-enter-from,
.tx-popover-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

.tx-popover.is-motion-split.tx-popover-enter-from,
.tx-popover.is-motion-split.tx-popover-leave-to {
  transform: translate3d(var(--tx-popover-split-x, 0px), var(--tx-popover-split-y, 0px), 0) scale(0.92);
}
</style>
