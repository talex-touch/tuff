<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { ResizeBoxProps, ResizeBoxSize } from './types'
import { computed, onBeforeUnmount, ref, useAttrs, watch } from 'vue'

defineOptions({
  name: 'TxResizeBox',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<ResizeBoxProps>(), {
  as: 'div',
  width: undefined,
  height: undefined,
  duration: 300,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  disabled: false,
  clip: true,
})

const emit = defineEmits<{
  'resize-start': []
  'resize-end': []
}>()

const attrs = useAttrs()

const rootEl = ref<HTMLElement | null>(null)
const animating = ref(false)

// `transitionrun`/`transitionend` fire once per property, and a resize can animate one
// axis or both, so the settle point is "the last running size transition ended" rather
// than "a transition ended".
let running = 0
let safetyTimer: ReturnType<typeof setTimeout> | undefined
let settleTimer: ReturnType<typeof setTimeout> | undefined

function toCssSize(value?: ResizeBoxSize): string | undefined {
  if (value === undefined || value === null)
    return undefined
  if (typeof value === 'number')
    return Number.isFinite(value) ? `${value}px` : undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const resolvedWidth = computed(() => toCssSize(props.width))
const resolvedHeight = computed(() => toCssSize(props.height))

function clearSafety() {
  if (safetyTimer === undefined)
    return
  clearTimeout(safetyTimer)
  safetyTimer = undefined
}

function clearSettle() {
  if (settleTimer === undefined)
    return
  clearTimeout(settleTimer)
  settleTimer = undefined
}

function armSafety() {
  clearSafety()
  // A size change does not guarantee a transition: the box may be detached or display:none,
  // and percentage targets can resolve to the same used value. Without this backstop those
  // cases would leave `animating` (and its will-change hint) latched forever.
  safetyTimer = setTimeout(finish, Math.max(props.duration, 0) + 60)
}

function finish() {
  clearSafety()
  clearSettle()
  running = 0
  if (!animating.value)
    return
  animating.value = false
  emit('resize-end')
}

function isOwnSizeTransition(event: TransitionEvent) {
  return event.target === event.currentTarget
    && (event.propertyName === 'width' || event.propertyName === 'height')
}

function onTransitionRun(event: TransitionEvent) {
  if (!animating.value || !isOwnSizeTransition(event))
    return
  clearSettle()
  running += 1
}

function onTransitionSettle(event: TransitionEvent) {
  if (!animating.value || !isOwnSizeTransition(event))
    return
  running = Math.max(0, running - 1)
  if (running !== 0)
    return

  // Retargeting an active CSS transition queues `transitioncancel` for the old
  // transition and `transitionrun` for the replacement in the same event batch.
  // Defer settlement so the replacement can keep the current lifecycle alive.
  clearSettle()
  settleTimer = setTimeout(() => {
    settleTimer = undefined
    if (running === 0)
      finish()
  }, 0)
}

// Runs pre-flush, so the will-change hint lands in the same patch as the new size instead
// of a frame after the tween already started.
watch([resolvedWidth, resolvedHeight], ([width, height], [prevWidth, prevHeight]) => {
  if (props.disabled)
    return
  if (width === prevWidth && height === prevHeight)
    return

  clearSettle()
  if (!animating.value) {
    animating.value = true
    emit('resize-start')
  }
  armSafety()
})

watch(() => props.disabled, (disabled) => {
  if (disabled)
    finish()
})

onBeforeUnmount(() => {
  clearSafety()
  clearSettle()
})

const rootClass = computed(() => {
  return [
    'tx-resize-box',
    {
      'tx-resize-box--clip': props.clip,
      'tx-resize-box--animating': animating.value,
      'tx-resize-box--static': props.disabled,
    },
    attrs.class,
  ] as any
})

const rootStyle = computed<StyleValue>(() => {
  return [
    {
      '--tx-resize-box-duration': `${props.duration}ms`,
      '--tx-resize-box-easing': props.easing,
      width: resolvedWidth.value,
      height: resolvedHeight.value,
    },
    attrs.style,
  ] as any
})

const passThroughAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

defineExpose({
  rootEl,
  animating,
})
</script>

<template>
  <component
    :is="as"
    ref="rootEl"
    :class="rootClass"
    :style="rootStyle"
    v-bind="passThroughAttrs"
    @transitionrun="onTransitionRun"
    @transitionend="onTransitionSettle"
    @transitioncancel="onTransitionSettle"
  >
    <slot />
  </component>
</template>

<style lang="scss">
.tx-resize-box {
  --tx-resize-box-duration: 300ms;
  --tx-resize-box-easing: cubic-bezier(0.22, 1, 0.36, 1);

  box-sizing: border-box;
  transition:
    width var(--tx-resize-box-duration) var(--tx-resize-box-easing),
    height var(--tx-resize-box-duration) var(--tx-resize-box-easing);
}

.tx-resize-box--clip {
  overflow: hidden;
}

// Scoped to the tween instead of the element's whole life: a permanent will-change keeps
// the browser holding optimisations for a box that is idle most of the time.
.tx-resize-box--animating {
  will-change: width, height;
}

.tx-resize-box--static {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .tx-resize-box {
    transition-duration: 0.01ms;
  }
}
</style>
