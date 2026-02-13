<script setup lang="ts">
import type { FlipOverlayEmits, FlipOverlayProps, FlipOverlaySlotProps } from './types'
import gsap from 'gsap'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({
  name: 'TxFlipOverlay',
})

const props = withDefaults(defineProps<FlipOverlayProps>(), {
  modelValue: false,
  source: null,
  sourceRadius: null,
  duration: 480,
  rotateX: 6,
  rotateY: 8,
  tiltRange: 2,
  perspective: 1200,
  speedBoost: 1.12,
  speedBoostAt: 0.7,
  easeOut: 'back.out(1.25)',
  easeIn: 'back.in(1)',
  maskClosable: true,
  transitionName: 'TxFlipOverlay-Mask',
  maskClass: '',
  cardClass: '',
  randomTilt: true,
})

const emit = defineEmits<FlipOverlayEmits>()

const cardRef = ref<HTMLElement | null>(null)
const visible = ref(Boolean(props.modelValue))
const expanded = ref(typeof props.expanded === 'boolean' ? props.expanded : false)
const animating = ref(typeof props.animating === 'boolean' ? props.animating : false)
const zIndex = ref(getZIndex())
const sourceRect = ref<DOMRect | null>(null)
const sourceRadius = ref<string | null>(null)
const tilt = ref({ x: 0, y: 0 })
let tween: gsap.core.Tween | null = null
let runId = 0

const maskClassName = computed(() => {
  const classes = ['TxFlipOverlay-Mask']
  if (props.maskClass)
    classes.push(props.maskClass)
  return classes
})

const cardClassName = computed(() => {
  const classes: Array<string | Record<string, boolean>> = [
    'TxFlipOverlay-Card',
    { 'is-expanded': expanded.value },
  ]
  if (props.cardClass)
    classes.push(props.cardClass)
  return classes
})

const transitionName = computed(() => props.transitionName || 'TxFlipOverlay-Mask')

function syncExpanded(value: boolean): void {
  if (expanded.value === value)
    return
  expanded.value = value
}

function syncAnimating(value: boolean): void {
  if (animating.value === value)
    return
  animating.value = value
}

watch(
  () => props.expanded,
  (value) => {
    if (typeof value === 'boolean')
      syncExpanded(value)
  },
)

watch(
  () => props.animating,
  (value) => {
    if (typeof value === 'boolean')
      syncAnimating(value)
  },
)

watch(expanded, (value) => emit('update:expanded', value))
watch(animating, (value) => emit('update:animating', value))

function clearTween(): void {
  if (!tween)
    return
  tween.kill()
  tween = null
}

function resolveSource(): void {
  if (!hasWindow()) {
    sourceRect.value = null
    sourceRadius.value = null
    return
  }

  const source = props.source
  if (!source) {
    sourceRect.value = null
    sourceRadius.value = props.sourceRadius ?? null
    return
  }

  if (source instanceof HTMLElement) {
    sourceRect.value = source.getBoundingClientRect()
    sourceRadius.value = props.sourceRadius ?? getComputedStyle(source).borderRadius
    return
  }

  sourceRect.value = source
  sourceRadius.value = props.sourceRadius ?? null
}

function resolveTilt(): void {
  if (!props.randomTilt) {
    tilt.value = { x: 0, y: 0 }
    return
  }
  const tiltX = (Math.random() > 0.5 ? 1 : -1) * (props.rotateX + Math.random() * props.tiltRange)
  const tiltY = (Math.random() > 0.5 ? 1 : -1) * (props.rotateY + Math.random() * props.tiltRange)
  tilt.value = { x: tiltX, y: tiltY }
}

function applySpeedBoost(): void {
  if (!tween)
    return
  if (tween.progress() > props.speedBoostAt)
    tween.timeScale(props.speedBoost)
}

function startOpenAnimation(currentRunId: number): void {
  const card = cardRef.value
  const from = sourceRect.value
  if (!card || !hasWindow()) {
    syncExpanded(true)
    syncAnimating(false)
    emit('opened')
    return
  }

  if (!from) {
    gsap.set(card, {
      autoAlpha: 1,
      xPercent: -50,
      yPercent: -50,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    })
    syncExpanded(true)
    syncAnimating(false)
    emit('opened')
    return
  }

  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const viewportCenterX = window.innerWidth / 2
  const viewportCenterY = window.innerHeight / 2
  const translateX = fromCenterX - viewportCenterX
  const translateY = fromCenterY - viewportCenterY
  const to = card.getBoundingClientRect()
  const scaleX = from.width / to.width
  const scaleY = from.height / to.height
  const targetRadius = getComputedStyle(card).borderRadius
  const initialRadius = sourceRadius.value || targetRadius
  const tiltValue = tilt.value

  clearTween()
  syncAnimating(true)
  gsap.set(card, {
    xPercent: -50,
    yPercent: -50,
    x: translateX,
    y: translateY,
    scaleX,
    scaleY,
    rotateX: tiltValue.x,
    rotateY: tiltValue.y,
    transformPerspective: props.perspective,
    borderRadius: initialRadius,
    autoAlpha: 1,
  })
  syncExpanded(true)
  tween = gsap.to(card, {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotateX: 0,
    rotateY: 0,
    borderRadius: targetRadius,
    duration: props.duration / 1000,
    ease: props.easeOut,
    overwrite: true,
    onUpdate: applySpeedBoost,
    onComplete: () => {
      if (currentRunId !== runId)
        return
      syncAnimating(false)
      tween = null
      emit('opened')
    },
  })
  tween.timeScale(1)
}

function startCloseAnimation(currentRunId: number): void {
  const card = cardRef.value
  const from = sourceRect.value
  if (!card || !hasWindow() || !from) {
    visible.value = false
    syncAnimating(false)
    if (props.modelValue)
      emit('update:modelValue', false)
    emit('closed')
    return
  }

  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const viewportCenterX = window.innerWidth / 2
  const viewportCenterY = window.innerHeight / 2
  const translateX = fromCenterX - viewportCenterX
  const translateY = fromCenterY - viewportCenterY
  const to = card.getBoundingClientRect()
  const scaleX = from.width / to.width
  const scaleY = from.height / to.height
  const tiltValue = tilt.value

  clearTween()
  syncAnimating(true)
  tween = gsap.to(card, {
    x: translateX,
    y: translateY,
    scaleX,
    scaleY,
    rotateX: tiltValue.x,
    rotateY: tiltValue.y,
    borderRadius: sourceRadius.value || getComputedStyle(card).borderRadius,
    duration: props.duration / 1000,
    ease: props.easeIn,
    overwrite: true,
    onUpdate: applySpeedBoost,
    onComplete: () => {
      if (currentRunId !== runId)
        return
      visible.value = false
      syncAnimating(false)
      tween = null
      emit('update:modelValue', false)
      emit('closed')
    },
  })
  tween.timeScale(1)
}

function requestOpen(): void {
  zIndex.value = nextZIndex()
  if (!hasWindow()) {
    visible.value = true
    syncExpanded(true)
    emit('opened')
    return
  }
  visible.value = true
  runId += 1
  const currentRunId = runId
  resolveSource()
  resolveTilt()
  syncExpanded(false)
  emit('open')
  nextTick(() => {
    if (currentRunId !== runId)
      return
    startOpenAnimation(currentRunId)
  })
}

function requestClose(): void {
  if (!visible.value)
    return
  runId += 1
  const currentRunId = runId
  syncExpanded(false)
  emit('close')
  nextTick(() => {
    if (currentRunId !== runId)
      return
    startCloseAnimation(currentRunId)
  })
}

function handleMaskClick(): void {
  if (!props.maskClosable)
    return
  requestClose()
}

watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      requestOpen()
    }
    else if (visible.value) {
      requestClose()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearTween()
})

defineExpose({
  close: requestClose,
})

const slotProps = computed<FlipOverlaySlotProps>(() => ({
  close: requestClose,
  expanded: expanded.value,
  animating: animating.value,
}))
</script>

<template>
  <Transition :name="transitionName">
    <div v-if="visible" :class="maskClassName" :style="{ zIndex }" @click="handleMaskClick">
      <div ref="cardRef" :class="cardClassName" @click.stop>
        <slot v-bind="slotProps" />
      </div>
    </div>
  </Transition>
</template>

<style lang="scss">
.TxFlipOverlay-Mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.TxFlipOverlay-Card {
  position: fixed;
  left: 50%;
  top: 50%;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform, opacity;
}
</style>
