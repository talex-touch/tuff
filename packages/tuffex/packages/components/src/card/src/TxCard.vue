<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRefs } from 'vue'
import TxSpinner from '../../spinner/src/TxSpinner.vue'
import type { TxCardProps } from './types'

defineOptions({ name: 'TxCard' })

const props = withDefaults(defineProps<TxCardProps>(), {
  variant: 'solid',
  background: 'blur',
  shadow: 'none',
  size: 'medium',
  glassBlur: true,
  glassBlurAmount: 22,
  glassOverlay: true,
  glassOverlayOpacity: 0.22,
  clickable: false,
  loading: false,
  disabled: false,
  radius: undefined,
  padding: undefined,
  loadingSpinnerSize: undefined,
  inertial: false,
  inertialMaxOffset: 22,
  inertialRebound: 0.12,
})

const {
  variant,
  background,
  shadow,
  size,
  clickable,
  loading,
  disabled,
  inertial,
  inertialMaxOffset,
  inertialRebound,
  glassBlur,
  glassBlurAmount,
  glassOverlay,
  glassOverlayOpacity,
} = toRefs(props)

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void
}>()

const resolvedRadius = computed(() => {
  if (typeof props.radius === 'number') return props.radius
  return 18
})

const resolvedPadding = computed(() => {
  if (typeof props.padding === 'number') return props.padding
  if (props.size === 'small') return 10
  if (props.size === 'large') return 16
  return 12
})

const resolvedSpinnerSize = computed(() => {
  if (typeof props.loadingSpinnerSize === 'number') return props.loadingSpinnerSize
  return 12
})

const motionX = ref(0)
const motionY = ref(0)

let targetX = 0
let targetY = 0
let velocityX = 0
let velocityY = 0
let lastTs = 0
let rafId: number | null = null
let isReturning = false

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function stopRaf() {
  if (rafId == null) return
  cancelAnimationFrame(rafId)
  rafId = null
}

function tickFrame(ts: number) {
  const dtRaw = lastTs ? (ts - lastTs) / 16.6667 : 1
  lastTs = ts
  const dt = clamp(dtRaw, 0.5, 2)

  const rebound = clamp(props.inertialRebound, 0, 1)

  const followStiffness = 0.085
  const followDamping = 0.90

  const returnStiffness = lerp(0.06, 0.12, rebound)
  const returnDamping = lerp(0.96, 0.84, rebound)

  const stiffness = isReturning ? returnStiffness : followStiffness
  const damping = isReturning ? returnDamping : followDamping

  velocityX += (targetX - motionX.value) * stiffness * dt
  velocityY += (targetY - motionY.value) * stiffness * dt

  const damp = Math.pow(damping, dt)
  velocityX *= damp
  velocityY *= damp

  motionX.value += velocityX
  motionY.value += velocityY

  const closeX = Math.abs(targetX - motionX.value) < 0.08 && Math.abs(velocityX) < 0.08
  const closeY = Math.abs(targetY - motionY.value) < 0.08 && Math.abs(velocityY) < 0.08

  if (closeX && closeY) {
    motionX.value = targetX
    motionY.value = targetY
    velocityX = 0
    velocityY = 0
    lastTs = 0
    rafId = null
    return
  }

  rafId = requestAnimationFrame(tickFrame)
}

function ensureRaf() {
  if (rafId != null) return
  rafId = requestAnimationFrame(tickFrame)
}

function onMouseMove(ev: MouseEvent) {
  if (!props.inertial) return
  if (props.disabled) return
  const el = ev.currentTarget as HTMLElement | null
  if (!el) return

  isReturning = false
  const rect = el.getBoundingClientRect()
  const halfW = rect.width / 2
  const halfH = rect.height / 2
  if (halfW <= 0 || halfH <= 0) return

  const dx = ev.clientX - rect.left - halfW
  const dy = ev.clientY - rect.top - halfH

  const ratioX = clamp(dx / halfW, -1, 1)
  const ratioY = clamp(dy / halfH, -1, 1)

  const easedX = Math.sign(ratioX) * Math.pow(Math.abs(ratioX), 0.85)
  const easedY = Math.sign(ratioY) * Math.pow(Math.abs(ratioY), 0.85)
  const max = props.inertialMaxOffset

  targetX = easedX * max
  targetY = easedY * max
  ensureRaf()
}

function onMouseLeave() {
  if (!props.inertial) return
  const rebound = clamp(props.inertialRebound, 0, 1)
  isReturning = true
  velocityX *= rebound
  velocityY *= rebound
  targetX = 0
  targetY = 0
  ensureRaf()
}

onBeforeUnmount(() => {
  stopRaf()
})

function onClick(ev: MouseEvent) {
  if (props.disabled) return
  if (!props.clickable) return
  emit('click', ev)
}
</script>

<template>
  <div
    class="tx-card"
    :class="[
      `is-${variant}`,
      `is-bg-${background}`,
      `is-shadow-${shadow}`,
      `is-${size}`,
      {
        'is-clickable': clickable,
        'is-loading': loading,
        'is-disabled': disabled,
        'is-inertial': inertial,
      },
    ]"
    :style="{
      '--tx-card-radius': `${resolvedRadius}px`,
      '--tx-card-padding': `${resolvedPadding}px`,
      '--tx-card-dx': `${motionX}px`,
      '--tx-card-dy': `${motionY}px`,
      '--tx-card-glass-blur': `${glassBlur ? glassBlurAmount : 0}px`,
      '--tx-card-glass-overlay-opacity': `${glassOverlay ? glassOverlayOpacity : 0}`,
    }"
    @click="onClick"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <div v-if="$slots.cover" class="tx-card__cover">
      <slot name="cover" />
    </div>

    <div v-if="$slots.header" class="tx-card__header">
      <slot name="header" />
    </div>

    <div class="tx-card__body">
      <slot />
    </div>

    <div v-if="$slots.footer" class="tx-card__footer">
      <slot name="footer" />
    </div>

    <div v-if="loading" class="tx-card__loading" aria-hidden="true">
      <TxSpinner :size="resolvedSpinnerSize" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: var(--tx-card-radius, 14px);
  padding: var(--tx-card-padding, 12px);
  box-sizing: border-box;
  transition: box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  transform: translate3d(var(--tx-card-dx, 0px), var(--tx-card-dy, 0px), 0);
  will-change: transform;
  touch-action: pan-y;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    z-index: 0;
  }

  &.is-solid,
  &.is-dashed {
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
  }

  &.is-dashed {
    border-style: dashed;
  }

  &.is-plain {
    border: none;
  }

  &.is-bg-mask {
    background: var(--tx-card-fake-background, var(--tx-bg-color-overlay, #fff));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  &.is-bg-blur {
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
    backdrop-filter: blur(18px) saturate(150%);
    -webkit-backdrop-filter: blur(18px) saturate(150%);
  }

  &.is-bg-glass {
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
    backdrop-filter: blur(var(--tx-card-glass-blur, 22px)) saturate(185%) contrast(1.08);
    -webkit-backdrop-filter: blur(var(--tx-card-glass-blur, 22px)) saturate(185%) contrast(1.08);
    border-color: color-mix(in srgb, rgba(255, 255, 255, 0.26) 55%, var(--tx-border-color-light, #e4e7ed));

    &::before {
      opacity: var(--tx-card-glass-overlay-opacity, 0.22);
      background:
        radial-gradient(700px 220px at 0% 0%, rgba(255, 255, 255, 0.55), transparent 55%),
        radial-gradient(600px 260px at 100% 0%, rgba(255, 255, 255, 0.22), transparent 58%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02) 45%, rgba(255, 255, 255, 0) 68%);
    }
  }

  &.is-shadow-none {
    box-shadow: none;
  }

  &.is-shadow-soft {
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
  }

  &.is-shadow-medium {
    box-shadow: 0 22px 56px rgba(0, 0, 0, 0.18);
  }

  &:hover:not(.is-disabled):not(.is-plain) {
    border-color: color-mix(
      in srgb,
      var(--tx-color-primary, #409eff) 36%,
      color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent)
    );
  }

  &.is-clickable {
    cursor: pointer;
  }

  &.is-disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
}

.tx-card__cover {
  position: relative;
  z-index: 1;
  margin: calc(var(--tx-card-padding, 12px) * -1);
  margin-bottom: var(--tx-card-padding, 12px);
  border-radius: var(--tx-card-radius, 14px);
  overflow: hidden;
}

.tx-card__header {
  position: relative;
  z-index: 1;
  padding-bottom: 10px;
}

.tx-card__body {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.tx-card__footer {
  position: relative;
  z-index: 1;
  padding-top: 10px;
}

.tx-card__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--tx-card-radius, 14px);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 50%, transparent);
  z-index: 2;
}
</style>
