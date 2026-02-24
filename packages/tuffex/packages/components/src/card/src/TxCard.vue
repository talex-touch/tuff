<script setup lang="ts">
import type { TxCardProps } from './types'
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import TxSpinner from '../../spinner/src/TxSpinner.vue'

defineOptions({ name: 'TxCard' })

const props = withDefaults(defineProps<TxCardProps>(), {
  variant: 'solid',
  background: 'pure',
  shadow: 'none',
  size: 'medium',
  glassBlur: true,
  glassBlurAmount: 22,
  glassOverlay: true,
  glassOverlayOpacity: 0.18,
  maskOpacity: 0.75,
  fallbackMaskOpacity: 0.26,
  surfaceMoving: false,
  refractionStrength: 62,
  refractionProfile: 'filmic',
  refractionTone: 'vivid',
  refractionAngle: -24,
  refractionLightFollowMouse: false,
  refractionLightFollowIntensity: 0.45,
  refractionLightSpring: true,
  refractionLightSpringStiffness: 0.18,
  refractionLightSpringDamping: 0.84,
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

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void
}>()

const variant = toRef(props, 'variant')
const background = toRef(props, 'background')
const shadow = toRef(props, 'shadow')
const size = toRef(props, 'size')
const clickable = toRef(props, 'clickable')
const loading = toRef(props, 'loading')
const disabled = toRef(props, 'disabled')
const inertial = toRef(props, 'inertial')
const glassBlur = toRef(props, 'glassBlur')
const glassBlurAmount = toRef(props, 'glassBlurAmount')
const glassOverlay = toRef(props, 'glassOverlay')
const glassOverlayOpacity = toRef(props, 'glassOverlayOpacity')
const maskOpacity = toRef(props, 'maskOpacity')
const fallbackMaskOpacity = toRef(props, 'fallbackMaskOpacity')
const externalSurfaceMoving = toRef(props, 'surfaceMoving')
const refractionStrength = toRef(props, 'refractionStrength')
const refractionProfile = toRef(props, 'refractionProfile')
const refractionTone = toRef(props, 'refractionTone')
const refractionAngle = toRef(props, 'refractionAngle')
const refractionLightFollowMouse = toRef(props, 'refractionLightFollowMouse')
const refractionLightFollowIntensity = toRef(props, 'refractionLightFollowIntensity')
const refractionLightSpring = toRef(props, 'refractionLightSpring')
const refractionLightSpringStiffness = toRef(props, 'refractionLightSpringStiffness')
const refractionLightSpringDamping = toRef(props, 'refractionLightSpringDamping')
const motionX = ref(0)
const motionY = ref(0)
const surfaceMoving = ref(false)
const lightPointX = ref(0.5)
const lightPointY = ref(0.5)
const lightRatioX = ref(0)
const lightRatioY = ref(0)

const resolvedRadius = computed(() => {
  if (typeof props.radius === 'number')
    return props.radius
  return 18
})

const resolvedPadding = computed(() => {
  if (typeof props.padding === 'number')
    return props.padding
  if (props.size === 'small')
    return 10
  if (props.size === 'large')
    return 16
  return 12
})

const resolvedSpinnerSize = computed(() => {
  if (typeof props.loadingSpinnerSize === 'number')
    return props.loadingSpinnerSize
  return 12
})

const surfaceMode = computed<'pure' | 'mask' | 'blur' | 'glass' | 'refraction'>(() => {
  return background.value
})

const surfaceRefractionProfile = computed<'soft' | 'filmic' | 'cinematic' | undefined>(() => {
  if (background.value !== 'refraction')
    return undefined
  return refractionProfile.value
})

const surfaceRefractionTone = computed<'mist' | 'balanced' | 'vivid' | undefined>(() => {
  if (background.value !== 'refraction')
    return undefined
  return refractionTone.value
})

const surfaceBlur = computed(() => {
  if (background.value === 'blur')
    return 30
  if (background.value === 'glass' || background.value === 'refraction')
    return glassBlur.value ? glassBlurAmount.value : 0
  return 0
})

const surfaceOverlayOpacity = computed(() => {
  if (background.value !== 'glass' && background.value !== 'refraction')
    return 0
  return glassOverlay.value ? glassOverlayOpacity.value : 0
})

const surfaceRefractionStrength = computed<number | undefined>(() => {
  if (background.value !== 'refraction')
    return undefined
  const baseStrength = clamp(refractionStrength.value, 0, 100)
  if (!refractionLightFollowMouse.value) {
    return baseStrength
  }
  const intensity = clamp(refractionLightFollowIntensity.value, 0, 1)
  const distance = clamp(Math.hypot(lightRatioX.value, lightRatioY.value), 0, 1)
  return clamp(baseStrength + distance * 16 * intensity, 0, 100)
})

const surfaceRefractionAngle = computed<number | undefined>(() => {
  if (background.value !== 'refraction')
    return undefined
  const baseAngle = normalizeAngleDeg(refractionAngle.value)
  if (!refractionLightFollowMouse.value) {
    return baseAngle
  }
  if (Math.abs(lightRatioX.value) < 0.01 && Math.abs(lightRatioY.value) < 0.01) {
    return baseAngle
  }
  const intensity = clamp(refractionLightFollowIntensity.value, 0, 1)
  const pointerAngle = Math.atan2(lightRatioY.value, lightRatioX.value) * (180 / Math.PI)
  return lerpAngleDeg(baseAngle, pointerAngle, intensity)
})

const surfaceRefractionLightX = computed<number | undefined>(() => {
  if (background.value !== 'refraction' || !refractionLightFollowMouse.value) {
    return undefined
  }
  return lightPointX.value
})

const surfaceRefractionLightY = computed<number | undefined>(() => {
  if (background.value !== 'refraction' || !refractionLightFollowMouse.value) {
    return undefined
  }
  return lightPointY.value
})

const surfaceColor = computed(() => {
  if (background.value !== 'mask')
    return undefined
  return 'var(--tx-card-fake-background, var(--tx-bg-color-overlay, #fff))'
})

const surfaceOpacity = computed<number | undefined>(() => {
  if (background.value === 'mask')
    return clamp(maskOpacity.value, 0, 1)
  return undefined
})

const mergedSurfaceMoving = computed(() => {
  return surfaceMoving.value || !!externalSurfaceMoving.value
})

let targetX = 0
let targetY = 0
let lightTargetX = 0.5
let lightTargetY = 0.5
let velocityX = 0
let velocityY = 0
let lightVelocityX = 0
let lightVelocityY = 0
let lastTs = 0
let rafId: number | null = null
let isReturning = false

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function normalizeAngleDeg(angle: number) {
  return ((angle + 180) % 360 + 360) % 360 - 180
}

function lerpAngleDeg(from: number, to: number, t: number) {
  const delta = normalizeAngleDeg(to - from)
  return normalizeAngleDeg(from + delta * t)
}

function stopRaf() {
  if (rafId == null)
    return
  cancelAnimationFrame(rafId)
  rafId = null
}

function tickFrame(ts: number) {
  const dtRaw = lastTs ? (ts - lastTs) / 16.6667 : 1
  lastTs = ts
  const dt = clamp(dtRaw, 0.5, 2)

  let motionSettled = true
  let lightSettled = true

  if (props.inertial) {
    const rebound = clamp(props.inertialRebound, 0, 1)
    const followStiffness = 0.085
    const followDamping = 0.9
    const returnStiffness = lerp(0.06, 0.12, rebound)
    const returnDamping = lerp(0.96, 0.84, rebound)
    const stiffness = isReturning ? returnStiffness : followStiffness
    const damping = isReturning ? returnDamping : followDamping

    velocityX += (targetX - motionX.value) * stiffness * dt
    velocityY += (targetY - motionY.value) * stiffness * dt

    const damp = damping ** dt
    velocityX *= damp
    velocityY *= damp

    motionX.value += velocityX
    motionY.value += velocityY

    const closeX = Math.abs(targetX - motionX.value) < 0.08 && Math.abs(velocityX) < 0.08
    const closeY = Math.abs(targetY - motionY.value) < 0.08 && Math.abs(velocityY) < 0.08
    motionSettled = closeX && closeY
    if (motionSettled) {
      motionX.value = targetX
      motionY.value = targetY
      velocityX = 0
      velocityY = 0
    }
  }

  if (refractionLightFollowMouse.value && background.value === 'refraction') {
    if (refractionLightSpring.value) {
      const springStiffness = clamp(refractionLightSpringStiffness.value, 0.01, 0.55)
      const springDamping = clamp(refractionLightSpringDamping.value, 0.55, 0.99)

      lightVelocityX += (lightTargetX - lightPointX.value) * springStiffness * dt
      lightVelocityY += (lightTargetY - lightPointY.value) * springStiffness * dt

      const lightDamp = springDamping ** dt
      lightVelocityX *= lightDamp
      lightVelocityY *= lightDamp

      lightPointX.value = clamp(lightPointX.value + lightVelocityX, 0, 1)
      lightPointY.value = clamp(lightPointY.value + lightVelocityY, 0, 1)
    }
    else {
      lightPointX.value = lightTargetX
      lightPointY.value = lightTargetY
      lightVelocityX = 0
      lightVelocityY = 0
    }

    lightRatioX.value = clamp(lightPointX.value * 2 - 1, -1, 1)
    lightRatioY.value = clamp(lightPointY.value * 2 - 1, -1, 1)

    const closeLightX = Math.abs(lightTargetX - lightPointX.value) < 0.002 && Math.abs(lightVelocityX) < 0.002
    const closeLightY = Math.abs(lightTargetY - lightPointY.value) < 0.002 && Math.abs(lightVelocityY) < 0.002
    lightSettled = closeLightX && closeLightY
  }

  if (motionSettled && lightSettled) {
    if (props.inertial) {
      surfaceMoving.value = false
    }
    lastTs = 0
    rafId = null
    return
  }

  rafId = requestAnimationFrame(tickFrame)
}

function ensureRaf() {
  if (rafId != null)
    return
  rafId = requestAnimationFrame(tickFrame)
}

function updateRefractionLight(ev: MouseEvent) {
  if (!refractionLightFollowMouse.value)
    return
  if (background.value !== 'refraction')
    return

  const el = ev.currentTarget as HTMLElement | null
  if (!el)
    return

  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return

  const localX = clamp(ev.clientX - rect.left, 0, rect.width)
  const localY = clamp(ev.clientY - rect.top, 0, rect.height)
  lightTargetX = localX / rect.width
  lightTargetY = localY / rect.height
  if (!refractionLightSpring.value) {
    lightPointX.value = lightTargetX
    lightPointY.value = lightTargetY
    lightRatioX.value = clamp(lightPointX.value * 2 - 1, -1, 1)
    lightRatioY.value = clamp(lightPointY.value * 2 - 1, -1, 1)
    lightVelocityX = 0
    lightVelocityY = 0
  }
  ensureRaf()
}

function onMouseMove(ev: MouseEvent) {
  if (props.disabled)
    return
  updateRefractionLight(ev)

  if (!props.inertial)
    return
  const el = ev.currentTarget as HTMLElement | null
  if (!el)
    return

  isReturning = false
  const rect = el.getBoundingClientRect()
  const halfW = rect.width / 2
  const halfH = rect.height / 2
  if (halfW <= 0 || halfH <= 0)
    return

  const dx = ev.clientX - rect.left - halfW
  const dy = ev.clientY - rect.top - halfH

  const ratioX = clamp(dx / halfW, -1, 1)
  const ratioY = clamp(dy / halfH, -1, 1)

  const easedX = Math.sign(ratioX) * Math.abs(ratioX) ** 0.85
  const easedY = Math.sign(ratioY) * Math.abs(ratioY) ** 0.85
  const max = props.inertialMaxOffset

  surfaceMoving.value = true
  targetX = easedX * max
  targetY = easedY * max
  ensureRaf()
}

function onMouseLeave() {
  if (refractionLightFollowMouse.value && background.value === 'refraction') {
    lightTargetX = 0.5
    lightTargetY = 0.5
    if (!refractionLightSpring.value) {
      lightPointX.value = 0.5
      lightPointY.value = 0.5
      lightRatioX.value = 0
      lightRatioY.value = 0
      lightVelocityX = 0
      lightVelocityY = 0
    }
    ensureRaf()
  }

  if (!props.inertial)
    return
  const rebound = clamp(props.inertialRebound, 0, 1)
  surfaceMoving.value = true
  isReturning = true
  velocityX *= rebound
  velocityY *= rebound
  targetX = 0
  targetY = 0
  ensureRaf()
}

function resetRefractionLightState() {
  lightTargetX = 0.5
  lightTargetY = 0.5
  lightPointX.value = 0.5
  lightPointY.value = 0.5
  lightRatioX.value = 0
  lightRatioY.value = 0
  lightVelocityX = 0
  lightVelocityY = 0
}

watch([background, refractionLightFollowMouse], ([bg, follow]) => {
  if (bg !== 'refraction' || !follow) {
    resetRefractionLightState()
  }
})

watch(inertial, (enabled) => {
  if (!enabled) {
    surfaceMoving.value = false
    motionX.value = 0
    motionY.value = 0
    targetX = 0
    targetY = 0
    velocityX = 0
    velocityY = 0
  }
})

onBeforeUnmount(() => {
  stopRaf()
})

function onClick(ev: MouseEvent) {
  if (props.disabled)
    return
  if (!props.clickable)
    return
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
      '--tx-surface-refraction-mask-color': 'var(--tx-card-fake-background, var(--tx-bg-color-overlay, #fff))',
    }"
    @click="onClick"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <TxBaseSurface
      class="tx-card__surface"
      :mode="surfaceMode"
      preset="card"
      :moving="mergedSurfaceMoving"
      :fallback-mask-opacity="fallbackMaskOpacity"
      :radius="resolvedRadius"
      :color="surfaceColor"
      :opacity="surfaceOpacity"
      :blur="surfaceBlur"
      :overlay-opacity="surfaceOverlayOpacity"
      :refraction-strength="surfaceRefractionStrength"
      :refraction-profile="surfaceRefractionProfile"
      :refraction-tone="surfaceRefractionTone"
      :refraction-angle="surfaceRefractionAngle"
      :refraction-light-x="surfaceRefractionLightX"
      :refraction-light-y="surfaceRefractionLightY"
      aria-hidden="true"
    />

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

  &.is-bg-glass,
  &.is-bg-refraction {
    border-color: color-mix(in srgb, rgba(255, 255, 255, 0.26) 55%, var(--tx-border-color-light, #e4e7ed));
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

.tx-card__surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: var(--tx-card-radius, 14px);
  pointer-events: none;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
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
  width: 100%;
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
