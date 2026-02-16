<script setup lang="ts">
import type { BaseAnchorProps } from './types'
import { arrow, autoUpdate, flip, offset as offsetMw, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({ name: 'TxBaseAnchor' })

const props = withDefaults(defineProps<BaseAnchorProps>(), {
  modelValue: false,
  disabled: false,
  placement: 'bottom-start',
  offset: 8,
  width: 0,
  minWidth: 0,
  maxWidth: 360,
  maxHeight: 420,
  matchReferenceWidth: false,
  referenceFullWidth: false,
  motion: 'split',
  autoResize: false,
  autoResizeWidth: true,
  autoResizeHeight: true,
  closeOnClickOutside: true,
  closeOnEsc: true,
  transition: 'tx-base-anchor',
  referenceAs: 'span',
  floatingAs: 'div',
  referenceProps: undefined,
  floatingProps: undefined,
  referenceClass: undefined,
  floatingClass: undefined,
  floatingStyle: undefined,
  showArrow: false,
  arrowSize: 12,
  virtualRef: undefined,
  onBeforeEnter: undefined,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
  (e: 'before-enter', el: Element): void
}>()

const open = computed({
  get: () => !!props.modelValue,
  set: (v) => {
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
const zIndex = ref(getZIndex())
const cleanupAutoUpdate = ref<(() => void) | null>(null)
const lastOpenedAt = ref(0)
const stablePlacement = ref<string | null>(null)
const splitX = ref(0)
const splitY = ref(0)

const motion = computed(() => (props.motion === 'fade' ? 'fade' : 'split'))
const referenceEl = computed(() => (props.virtualRef ?? referenceRef.value) as any)

function getPlacementSide(v: string): string {
  return v.split('-')[0] ?? 'bottom'
}

const { floatingStyles, middlewareData, placement, update } = useFloating(referenceEl, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  transform: false,
  middleware: [
    offsetMw(() => props.offset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        const baseW = rects.reference.width
        const minW = Math.max(0, props.minWidth ?? 0)
        const maxW = Math.max(0, props.maxWidth ?? 0)
        const maxH = Math.min(availableHeight, props.maxHeight ?? 420)

        const style = elements.floating.style
        style.width = ''
        style.minWidth = ''
        style.maxWidth = ''
        style.maxHeight = ''

        if (props.width > 0) {
          style.width = `${props.width}px`
        }
        else if (props.matchReferenceWidth) {
          const w = Math.max(baseW, minW)
          style.width = `${w}px`
        }
        else if (minW > 0) {
          style.minWidth = `${minW}px`
        }

        if (maxW > 0)
          style.maxWidth = `${maxW}px`

        style.maxHeight = `${maxH}px`
        style.setProperty('--tx-base-anchor-max-height', `${maxH}px`)
      },
    }),
    arrow({
      element: computed(() => (props.showArrow ? arrowRef.value : null)),
      padding: 6,
    }),
  ],
})

const arrowSide = computed(() => getPlacementSide(String(stablePlacement.value || placement.value || props.placement || 'bottom')))
const arrowData = computed(() => ((middlewareData.value as any)?.arrow ?? null))

const arrowStyle = computed<Record<string, string>>(() => {
  if (!props.showArrow || !arrowRef.value)
    return { display: 'none' }

  const data = (middlewareData.value as any)?.arrow
  if (!data || (data.x == null && data.y == null))
    return { display: 'none' }

  const base: Record<string, string> = {
    display: 'block',
    position: 'absolute',
  }

  if (data.x != null)
    base.left = `${data.x}px`
  if (data.y != null)
    base.top = `${data.y}px`

  const staticSideMap = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  } as const

  const staticSide = staticSideMap[arrowSide.value as keyof typeof staticSideMap] ?? 'top'
  const half = Math.round((props.arrowSize || 12) / 2)
  base[staticSide] = `calc(-${half}px + 1px)`

  return base
})

const isVisible = computed(() => open.value && !props.disabled)

const mergedReferenceProps = computed(() => props.referenceProps ?? {})
const mergedFloatingProps = computed(() => props.floatingProps ?? {})
const mergedFloatingClass = computed(() => [props.floatingClass, { 'is-motion-split': motion.value === 'split' }])
const floatingStyle = computed(() => {
  const side = getPlacementSide(String(stablePlacement.value || placement.value || props.placement || 'bottom'))
  const currentArrowData = (middlewareData.value as any)?.arrow
  const arrowSize = props.arrowSize || 12
  let crackX = '50%'
  let crackY = '50%'

  if (props.showArrow && currentArrowData) {
    if ((side === 'top' || side === 'bottom') && currentArrowData.x != null)
      crackX = `${currentArrowData.x + arrowSize * 0.5}px`
    if ((side === 'left' || side === 'right') && currentArrowData.y != null)
      crackY = `${currentArrowData.y + arrowSize * 0.5}px`
  }

  const splitVars = {
    '--tx-base-anchor-split-x': `${splitX.value}px`,
    '--tx-base-anchor-split-y': `${splitY.value}px`,
    '--tx-base-anchor-crack-size': `${props.arrowSize || 12}px`,
    '--tx-base-anchor-crack-x': crackX,
    '--tx-base-anchor-crack-y': crackY,
  } as const
  return [splitVars, props.floatingStyle]
})

function syncSplitOffset(el: Element) {
  if (motion.value !== 'split') {
    splitX.value = 0
    splitY.value = 0
    return
  }

  const referenceNode = (props.virtualRef ?? referenceRef.value) as BaseAnchorProps['virtualRef'] | HTMLElement | null
  if (!referenceNode || typeof referenceNode.getBoundingClientRect !== 'function') {
    splitX.value = 0
    splitY.value = 0
    return
  }

  const node = el as HTMLElement
  const refRect = referenceNode.getBoundingClientRect()
  const floatRect = node.getBoundingClientRect()
  const side = getPlacementSide(String(stablePlacement.value || placement.value || props.placement || 'bottom'))

  const refCx = refRect.left + refRect.width * 0.5
  const refCy = refRect.top + refRect.height * 0.5
  let tipX = floatRect.left + floatRect.width * 0.5
  let tipY = floatRect.top + floatRect.height * 0.5

  const arrowEl = props.showArrow ? arrowRef.value : null
  if (arrowEl) {
    const arrowRect = arrowEl.getBoundingClientRect()
    tipX = arrowRect.left + arrowRect.width * 0.5
    tipY = arrowRect.top + arrowRect.height * 0.5
    if (side === 'top')
      tipY = arrowRect.bottom
    if (side === 'bottom')
      tipY = arrowRect.top
    if (side === 'left')
      tipX = arrowRect.right
    if (side === 'right')
      tipX = arrowRect.left
  }

  const dx = refCx - tipX
  const dy = refCy - tipY
  const limit = 18
  const clamp = (v: number) => Math.min(limit, Math.max(-limit, v))

  splitX.value = side === 'left' || side === 'right' ? clamp(dx) : 0
  splitY.value = side === 'top' || side === 'bottom' ? clamp(dy) : 0
}

function handleBeforeEnter(el: Element) {
  syncSplitOffset(el)
  emit('before-enter', el)
  props.onBeforeEnter?.(el)
}

function close() {
  open.value = false
}

function toggle() {
  if (props.disabled)
    return
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

function handleOutside(e: Event) {
  if (!props.closeOnClickOutside)
    return
  if (!open.value)
    return
  if (performance.now() - lastOpenedAt.value < 60)
    return

  const inRef = isEventInside(e, referenceRef.value)
  const inFloat = isEventInside(e, floatingRef.value)
  if (!inRef && !inFloat)
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
      stablePlacement.value = null
      splitX.value = 0
      splitY.value = 0
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      return
    }

    zIndex.value = nextZIndex()
    lastOpenedAt.value = performance.now()
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
  document.addEventListener('keydown', handleEsc)

  await nextTick()
  if (referenceRef.value)
    await update()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('keydown', handleEsc)
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})

defineExpose({
  open: () => (open.value = true),
  close,
  toggle,
  update,
  referenceRef,
  floatingRef,
})
</script>

<template>
  <component
    :is="props.referenceAs"
    ref="referenceRef"
    class="tx-base-anchor__reference"
    :class="[props.referenceClass, { 'is-full-width': props.referenceFullWidth }]"
    v-bind="mergedReferenceProps"
  >
    <slot name="reference" />
  </component>

  <Teleport to="body">
    <Transition v-if="props.transition" :name="props.transition" @before-enter="handleBeforeEnter">
      <component
        v-if="isVisible"
        :is="props.floatingAs"
        ref="floatingRef"
        class="tx-base-anchor"
        :class="mergedFloatingClass"
        :data-side="arrowSide"
        :style="[floatingStyles, floatingStyle, { zIndex }]"
        v-bind="mergedFloatingProps"
      >
        <TxAutoSizer
          v-if="props.autoResize"
          outer-class="tx-base-anchor__sizer"
          :width="props.autoResizeWidth"
          :height="props.autoResizeHeight"
        >
          <slot
            name="content"
            :arrow-style="arrowStyle"
            :arrow-side="arrowSide"
            :arrow-ref="arrowRef"
            :arrow-data="arrowData"
          >
            <slot />
          </slot>
        </TxAutoSizer>
        <slot
          v-else
          name="content"
          :arrow-style="arrowStyle"
          :arrow-side="arrowSide"
          :arrow-ref="arrowRef"
          :arrow-data="arrowData"
        >
          <slot />
        </slot>
      </component>
    </Transition>
    <component
      v-else-if="isVisible"
      :is="props.floatingAs"
      ref="floatingRef"
      class="tx-base-anchor"
      :class="mergedFloatingClass"
      :data-side="arrowSide"
      :style="[floatingStyles, floatingStyle, { zIndex }]"
      v-bind="mergedFloatingProps"
    >
      <TxAutoSizer
        v-if="props.autoResize"
        outer-class="tx-base-anchor__sizer"
        :width="props.autoResizeWidth"
        :height="props.autoResizeHeight"
      >
        <slot
          name="content"
          :arrow-style="arrowStyle"
          :arrow-side="arrowSide"
          :arrow-ref="arrowRef"
          :arrow-data="arrowData"
        >
          <slot />
        </slot>
      </TxAutoSizer>
      <slot
        v-else
        name="content"
        :arrow-style="arrowStyle"
        :arrow-side="arrowSide"
        :arrow-ref="arrowRef"
        :arrow-data="arrowData"
      >
        <slot />
      </slot>
    </component>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-base-anchor__reference {
  display: inline-flex;
  align-items: center;
  width: fit-content;

  &.is-full-width {
    width: 100%;
  }
}

.tx-base-anchor {
  padding: 0;
  background: transparent;
  border: none;
  overflow: visible;
}

.tx-base-anchor.is-motion-split {
  --tx-base-anchor-crack-size: 12px;
  filter: saturate(1.04);
}

.tx-base-anchor.is-motion-split::before {
  content: '';
  position: absolute;
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease;
  background:
    radial-gradient(circle at 38% 52%, rgba(255, 255, 255, 0.48), transparent 58%),
    radial-gradient(circle at 62% 48%, color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, rgba(255, 255, 255, 0.34)), transparent 58%),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.14), transparent 74%);
  mix-blend-mode: soft-light;
  filter: blur(3px) saturate(1.16);
  border-radius: 999px;
  width: calc(var(--tx-base-anchor-crack-size, 12px) * 3.6);
  height: calc(var(--tx-base-anchor-crack-size, 12px) * 2.4);
}

.tx-base-anchor.is-motion-split[data-side='top']::before {
  left: var(--tx-base-anchor-crack-x, 50%);
  bottom: 0;
  transform: translate3d(-50%, 70%, 0) scale(0.7);
}

.tx-base-anchor.is-motion-split[data-side='bottom']::before {
  left: var(--tx-base-anchor-crack-x, 50%);
  top: 0;
  transform: translate3d(-50%, -70%, 0) scale(0.7);
}

.tx-base-anchor.is-motion-split[data-side='left']::before {
  top: var(--tx-base-anchor-crack-y, 50%);
  right: 0;
  transform: translate3d(70%, -50%, 0) scale(0.7);
}

.tx-base-anchor.is-motion-split[data-side='right']::before {
  top: var(--tx-base-anchor-crack-y, 50%);
  left: 0;
  transform: translate3d(-70%, -50%, 0) scale(0.7);
}

.tx-base-anchor-enter-active,
.tx-base-anchor-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  will-change: opacity, transform;
}

.tx-base-anchor-enter-from,
.tx-base-anchor-leave-to {
  opacity: 0;
  transform: translate3d(0, 6px, 0) scale(0.96);
}

.tx-base-anchor-enter-from[data-side='top'],
.tx-base-anchor-leave-to[data-side='top'] {
  transform: translate3d(0, -6px, 0) scale(0.96);
}

.tx-base-anchor-enter-from[data-side='left'],
.tx-base-anchor-leave-to[data-side='left'] {
  transform: translate3d(-6px, 0, 0) scale(0.96);
}

.tx-base-anchor-enter-from[data-side='right'],
.tx-base-anchor-leave-to[data-side='right'] {
  transform: translate3d(6px, 0, 0) scale(0.96);
}

.tx-base-anchor.is-motion-split.tx-base-anchor-enter-from,
.tx-base-anchor.is-motion-split.tx-base-anchor-leave-to {
  transform: translate3d(var(--tx-base-anchor-split-x, 0px), var(--tx-base-anchor-split-y, 0px), 0) scale(0.9);
}

.tx-base-anchor.is-motion-split.tx-base-anchor-enter-from::before,
.tx-base-anchor.is-motion-split.tx-base-anchor-leave-to::before {
  opacity: 0.9;
  filter: blur(5px) saturate(1.24);
}

.tx-base-anchor.is-motion-split.tx-base-anchor-enter-from[data-side='top']::before,
.tx-base-anchor.is-motion-split.tx-base-anchor-leave-to[data-side='top']::before {
  border-radius: 52% 48% 62% 38% / 54% 46% 58% 42%;
  transform: translate3d(-50%, 104%, 0) rotate(6deg) scaleX(1.52) scaleY(1.16);
}

.tx-base-anchor.is-motion-split.tx-base-anchor-enter-from[data-side='bottom']::before,
.tx-base-anchor.is-motion-split.tx-base-anchor-leave-to[data-side='bottom']::before {
  border-radius: 46% 54% 40% 60% / 42% 58% 46% 54%;
  transform: translate3d(-50%, -104%, 0) rotate(-6deg) scaleX(1.52) scaleY(1.16);
}

.tx-base-anchor.is-motion-split.tx-base-anchor-enter-from[data-side='left']::before,
.tx-base-anchor.is-motion-split.tx-base-anchor-leave-to[data-side='left']::before {
  border-radius: 58% 42% 52% 48% / 44% 56% 40% 60%;
  transform: translate3d(104%, -50%, 0) rotate(-6deg) scaleX(1.16) scaleY(1.52);
}

.tx-base-anchor.is-motion-split.tx-base-anchor-enter-from[data-side='right']::before,
.tx-base-anchor.is-motion-split.tx-base-anchor-leave-to[data-side='right']::before {
  border-radius: 44% 56% 38% 62% / 60% 40% 56% 44%;
  transform: translate3d(-104%, -50%, 0) rotate(6deg) scaleX(1.16) scaleY(1.52);
}
</style>
