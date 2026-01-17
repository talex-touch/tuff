<script setup lang="ts">
import type { SliderEmits, SliderProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({
  name: 'TxSlider',
})

const props = withDefaults(defineProps<SliderProps>(), {
  modelValue: 0,
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  showValue: false,
  showTooltip: true,
  tooltipTrigger: 'drag',
  tooltipPlacement: 'top',
  tooltipTilt: false,
  tooltipTiltMaxDeg: 18,
  tooltipOffsetMaxPx: 28,
  tooltipAccelBoost: 0.65,
  tooltipSpringStiffness: 320,
  tooltipSpringDamping: 24,
  tooltipMotion: 'blur',
  tooltipMotionDuration: 160,
  tooltipMotionBlurPx: 10,
  tooltipDistortSkewDeg: 8,
  tooltipJelly: true,
  tooltipJellyFrequency: 8.5,
  tooltipJellyDecay: 10,
  tooltipJellyRotateDeg: 10,
  tooltipJellySkewDeg: 12,
  tooltipJellySquash: 0.16,
  tooltipJellyTriggerAccel: 2800,
})

const emit = defineEmits<SliderEmits>()

const inputRef = ref<HTMLInputElement | null>(null)
const mainRef = ref<HTMLDivElement | null>(null)
const tooltipRef = ref<HTMLDivElement | null>(null)

const mainWidth = ref(0)
const thumbSizePx = ref(14)
const tooltipWidth = ref(0)

const dragging = ref(false)
const hovering = ref(false)
const lastInputTs = ref<number | null>(null)
const lastInputValue = ref<number | null>(null)
const velocity = ref(0)
const acceleration = ref(0)

const lastPointerTs = ref<number | null>(null)
const lastPointerX = ref<number | null>(null)
const pointerVelocity = ref(0)
const pointerAcceleration = ref(0)
const hadPointerMove = ref(false)

const tooltipTiltDeg = ref(0)
const tooltipOffsetX = ref(0)
const tooltipTargetTiltDeg = ref(0)
const tooltipTargetOffsetX = ref(0)
const tooltipTiltVel = ref(0)
const tooltipOffsetVel = ref(0)
const tooltipFollowX = ref(0)
const tooltipFollowVel = ref(0)
const tooltipTargetFollowX = ref(0)
const tooltipSquash = ref(0)
const tooltipSkewDeg = ref(0)
const tooltipJellyAmp = ref(0)
const tooltipJellyPhase = ref(0)
const tooltipJellyDir = ref(1)
const tooltipJellyWobble = ref(0)
let tooltipRafId: number | null = null
let tooltipLastRafTs: number | null = null
let resizeObserver: ResizeObserver | null = null
let tooltipResizeObserver: ResizeObserver | null = null

const clampedValue = computed(() => {
  const v = Number.isFinite(props.modelValue) ? props.modelValue : props.min
  return Math.min(props.max, Math.max(props.min, v))
})

const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0)
    return 0
  return ((clampedValue.value - props.min) / range) * 100
})

const thumbCenterPx = computed(() => {
  if (mainWidth.value <= 0)
    return 0
  const edge = thumbSizePx.value / 2
  const inner = Math.max(0, mainWidth.value - thumbSizePx.value)
  return edge + inner * (percent.value / 100)
})

const fillWidthStyle = computed(() => {
  if (mainWidth.value <= 0)
    return { width: `${percent.value}%` }
  return { width: `${thumbCenterPx.value}px` }
})

const displayValue = computed(() => {
  return props.formatValue ? props.formatValue(clampedValue.value) : String(clampedValue.value)
})

const tooltipText = computed(() => {
  if (props.tooltipFormatter)
    return props.tooltipFormatter(clampedValue.value)
  return displayValue.value
})

const shouldShowTooltip = computed(() => {
  if (!props.showTooltip)
    return false
  if (props.disabled)
    return false
  if (props.tooltipTrigger === 'always')
    return true
  if (props.tooltipTrigger === 'hover')
    return hovering.value || dragging.value
  return dragging.value
})

const tooltipTransitionStyle = computed<Record<string, string>>(() => {
  const duration = Math.max(0, props.tooltipMotionDuration)
  const blur = Math.max(0, props.tooltipMotionBlurPx)
  return {
    '--tx-slider-tooltip-motion-duration': `${duration}ms`,
    '--tx-slider-tooltip-motion-blur': `${blur}px`,
  }
})

const tooltipStyle = computed(() => {
  const baseX = props.tooltipTilt ? tooltipFollowX.value : thumbCenterPx.value
  const offsetX = props.tooltipTilt ? tooltipOffsetX.value : 0
  const baseRotate = props.tooltipTilt ? tooltipTiltDeg.value : 0
  const baseSquash = props.tooltipTilt ? tooltipSquash.value : 0
  const baseSkew = props.tooltipTilt ? tooltipSkewDeg.value : 0

  const wobble = props.tooltipTilt && props.tooltipJelly ? tooltipJellyWobble.value : 0
  const wobbleDir = props.tooltipTilt && props.tooltipJelly ? tooltipJellyDir.value : 1
  const wobbleRotate = wobble * wobbleDir * Math.max(0, props.tooltipJellyRotateDeg)
  const wobbleSkew = wobble * wobbleDir * Math.max(0, props.tooltipJellySkewDeg)
  const wobbleAbs = Math.abs(wobble)
  const wobbleSquash = wobbleAbs * Math.max(0, props.tooltipJellySquash)

  const rotate = baseRotate + wobbleRotate
  const skew = baseSkew + wobbleSkew
  const scaleX = 1 + baseSquash * 0.16 + wobbleSquash * 0.28
  const scaleY = 1 - baseSquash * 0.1 - wobbleSquash * 0.18

  // Clamp position to prevent overflow
  const half = tooltipWidth.value > 0 ? tooltipWidth.value / 2 : 40 // fallback width
  const safe = 8
  const min = half + safe
  const max = Math.max(min, mainWidth.value - half - safe)
  const clampedX = Math.min(max, Math.max(min, baseX + offsetX))

  const y = props.tooltipPlacement === 'bottom' ? 28 : -28
  const origin = props.tooltipPlacement === 'bottom' ? '50% 0%' : '50% 100%'

  const useMotion = props.tooltipMotion !== 'none'
  const transition = useMotion
    ? (dragging.value ? 'none' : 'transform 0.3s ease')
    : (dragging.value ? 'opacity 0.12s ease' : 'opacity 0.2s ease, transform 0.3s ease')

  return {
    left: `${clampedX}px`,
    top: '50%',
    transformOrigin: origin,
    transform: `translateX(-50%) translateY(-50%) rotate(${rotate}deg) skewX(${skew}deg) scaleX(${scaleX}) scaleY(${scaleY}) translateY(${y}px)`,
    transition,
  }
})

function refreshTooltipWidth() {
  if (!tooltipRef.value)
    return
  const w = tooltipRef.value.getBoundingClientRect().width
  if (Number.isFinite(w) && w > 0)
    tooltipWidth.value = w
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

function resetTooltipMotion() {
  tooltipLastRafTs = null
  tooltipFollowX.value = thumbCenterPx.value
  tooltipFollowVel.value = 0
  tooltipTargetFollowX.value = thumbCenterPx.value

  tooltipTiltDeg.value = 0
  tooltipOffsetX.value = 0
  tooltipTargetTiltDeg.value = 0
  tooltipTargetOffsetX.value = 0
  tooltipTiltVel.value = 0
  tooltipOffsetVel.value = 0
  tooltipSquash.value = 0
  tooltipSkewDeg.value = 0

  tooltipJellyAmp.value = 0
  tooltipJellyPhase.value = 0
  tooltipJellyDir.value = 1
  tooltipJellyWobble.value = 0
}

function triggerJelly(kick: number, dir: number) {
  if (!props.tooltipTilt)
    return
  if (!props.tooltipJelly)
    return

  const k = clamp01(kick)
  if (k <= 0)
    return

  tooltipJellyDir.value = dir === 0 ? 1 : dir
  tooltipJellyAmp.value = Math.min(1, tooltipJellyAmp.value + k)
  if (tooltipJellyAmp.value === k)
    tooltipJellyPhase.value = 0
}

function ensureTooltipRaf() {
  if (tooltipRafId != null)
    return

  tooltipLastRafTs = null
  tooltipRafId = window.requestAnimationFrame(function loop(ts) {
    if (!shouldShowTooltip.value || !props.tooltipTilt) {
      tooltipRafId = null
      tooltipLastRafTs = null
      return
    }

    const last = tooltipLastRafTs ?? ts
    tooltipLastRafTs = ts
    const dt = clamp01((ts - last) / 1000 / 0.032) * 0.032

    tooltipTargetFollowX.value = thumbCenterPx.value

    const k = Math.max(1, props.tooltipSpringStiffness)
    const c = Math.max(0, props.tooltipSpringDamping)

    {
      const x = tooltipFollowX.value
      const v = tooltipFollowVel.value
      const a = -k * (x - tooltipTargetFollowX.value) - c * v
      const nv = v + a * dt
      const nx = x + nv * dt
      tooltipFollowVel.value = nv
      tooltipFollowX.value = nx
    }

    {
      const x = tooltipOffsetX.value
      const v = tooltipOffsetVel.value
      const a = -k * 1.1 * (x - tooltipTargetOffsetX.value) - c * 0.95 * v
      const nv = v + a * dt
      const nx = x + nv * dt
      tooltipOffsetVel.value = nv
      tooltipOffsetX.value = nx
    }

    {
      const x = tooltipTiltDeg.value
      const v = tooltipTiltVel.value
      const a = -k * 1.05 * (x - tooltipTargetTiltDeg.value) - c * 0.95 * v
      const nv = v + a * dt
      const nx = x + nv * dt
      tooltipTiltVel.value = nv
      tooltipTiltDeg.value = nx
    }

    const speed = Math.abs(tooltipFollowVel.value) * 0.9 + Math.abs(tooltipOffsetVel.value) * 0.35
    tooltipSquash.value = clamp01(speed / 1600)

    const maxSkew = Math.max(0, props.tooltipDistortSkewDeg)
    const dir = tooltipFollowVel.value >= 0 ? 1 : -1
    tooltipSkewDeg.value = -dir * tooltipSquash.value * maxSkew

    if (props.tooltipJelly && tooltipJellyAmp.value > 0.0008) {
      const freq = Math.max(0, props.tooltipJellyFrequency)
      const decay = Math.max(0, props.tooltipJellyDecay)
      const omega = 2 * Math.PI * freq
      tooltipJellyPhase.value += omega * dt
      tooltipJellyAmp.value *= Math.exp(-decay * dt)
      tooltipJellyWobble.value = Math.sin(tooltipJellyPhase.value) * tooltipJellyAmp.value
    }
    else {
      tooltipJellyAmp.value = 0
      tooltipJellyWobble.value = 0
    }

    tooltipRafId = window.requestAnimationFrame(loop)
  })
}

function setElasticTargets(dir: number, intensity: number) {
  const t = clamp01(intensity)
  tooltipTargetTiltDeg.value = -dir * t * props.tooltipTiltMaxDeg
  tooltipTargetOffsetX.value = -dir * t * props.tooltipOffsetMaxPx
}

function onGlobalPointerMove(e: PointerEvent) {
  if (!dragging.value || !props.tooltipTilt)
    return

  const now = performance.now()
  const x = e.clientX

  if (lastPointerTs.value != null && lastPointerX.value != null) {
    const dtMs = now - lastPointerTs.value
    const dx = x - lastPointerX.value
    if (dtMs > 0 && dtMs < 100 && Math.abs(dx) > 1) {
      hadPointerMove.value = true
      const v = dx / (dtMs / 1000)
      const prevV = pointerVelocity.value
      pointerVelocity.value = v
      pointerAcceleration.value = ((v - prevV) / dtMs) * 1000

      const absV = Math.abs(v)
      const absA = Math.abs(pointerAcceleration.value)
      if (absV > 20 || absA > 200) {
        const dir = v >= 0 ? 1 : -1
        const intensity = clamp01(absV / 1200 + (absA / 12000) * props.tooltipAccelBoost)
        setElasticTargets(dir, intensity)

        if (props.tooltipJelly) {
          const accelGate = Math.max(1, props.tooltipJellyTriggerAccel)
          const kickA = clamp01(absA / accelGate)
          const reversed = prevV !== 0 && v !== 0 && Math.sign(prevV) !== Math.sign(v)
          const kick = reversed ? Math.max(0.55, kickA) : kickA
          if (kick > 0.08)
            triggerJelly(kick, dir)
        }

        ensureTooltipRaf()
      }
    }
  }

  lastPointerTs.value = now
  lastPointerX.value = x
}

function updateValue(next: number) {
  const v = Math.min(props.max, Math.max(props.min, next))
  emit('update:modelValue', v)
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const next = Number(el.value)
  const now = performance.now()

  const prevVelocity = velocity.value

  if (lastInputTs.value != null && lastInputValue.value != null) {
    const dt = now - lastInputTs.value
    const dv = next - lastInputValue.value
    if (dt > 0) {
      const perSec = (dv / dt) * 1000
      const prevV = velocity.value
      velocity.value = perSec
      acceleration.value = ((perSec - prevV) / dt) * 1000
    }
  }
  lastInputTs.value = now
  lastInputValue.value = next
  updateValue(next)

  if (dragging.value && props.tooltipTilt) {
    const v = velocity.value
    const a = acceleration.value
    const dir = v >= 0 ? 1 : -1
    const intensity = clamp01(Math.abs(v) / 260 + (Math.abs(a) / 2400) * props.tooltipAccelBoost)
    setElasticTargets(dir, intensity)

    if (props.tooltipJelly) {
      const accelGate = Math.max(1, props.tooltipJellyTriggerAccel)
      const absA = Math.abs(a)
      const kickA = clamp01(absA / accelGate)
      const reversed = prevVelocity !== 0 && v !== 0 && Math.sign(prevVelocity) !== Math.sign(v)
      const kick = reversed ? Math.max(0.55, kickA) : kickA
      if (kick > 0.08)
        triggerJelly(kick, dir)
    }

    ensureTooltipRaf()
  }
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  emit('change', Number(el.value))
}

function refreshMetrics() {
  if (!mainRef.value)
    return
  const rect = mainRef.value.getBoundingClientRect()
  mainWidth.value = rect.width
  const raw = getComputedStyle(mainRef.value).getPropertyValue('--tx-slider-thumb-size')
  const size = Number.parseFloat(raw)
  if (Number.isFinite(size) && size > 0)
    thumbSizePx.value = size
}

function startDragging(e: PointerEvent) {
  if (props.disabled)
    return
  dragging.value = true
  refreshMetrics()

  if (props.tooltipTilt) {
    resetTooltipMotion()
    ensureTooltipRaf()
  }

  lastPointerTs.value = performance.now()
  lastPointerX.value = e.clientX
  pointerVelocity.value = 0
  pointerAcceleration.value = 0
  hadPointerMove.value = false
  window.addEventListener('pointermove', onGlobalPointerMove)
}

function stopDragging() {
  if (!dragging.value)
    return
  dragging.value = false

  window.removeEventListener('pointermove', onGlobalPointerMove)
  lastPointerTs.value = null
  lastPointerX.value = null
  pointerVelocity.value = 0
  pointerAcceleration.value = 0
  hadPointerMove.value = false

  if (props.tooltipTilt) {
    setElasticTargets(1, 0)
    ensureTooltipRaf()
  }
}

function onGlobalPointerUp() {
  stopDragging()
}

watch(
  () => props.modelValue,
  () => {
    if (inputRef.value) {
      inputRef.value.value = String(clampedValue.value)
    }
  },
  { immediate: true },
)

watch(
  () => shouldShowTooltip.value,
  async (v) => {
    if (!v) {
      tooltipWidth.value = 0
      if (tooltipRafId != null) {
        cancelAnimationFrame(tooltipRafId)
        tooltipRafId = null
      }
      resetTooltipMotion()
      if (tooltipResizeObserver && tooltipRef.value) {
        tooltipResizeObserver.unobserve(tooltipRef.value)
      }
      return
    }
    await nextTick()
    refreshTooltipWidth()
    if (props.tooltipTilt) {
      resetTooltipMotion()
      ensureTooltipRaf()
    }
    if (tooltipResizeObserver && tooltipRef.value) {
      tooltipResizeObserver.observe(tooltipRef.value)
    }
  },
)

watch(tooltipText, async () => {
  if (!shouldShowTooltip.value)
    return
  await nextTick()
  refreshTooltipWidth()
})

onMounted(() => {
  refreshMetrics()
  window.addEventListener('pointerup', onGlobalPointerUp)

  if (typeof ResizeObserver !== 'undefined' && mainRef.value) {
    resizeObserver = new ResizeObserver(() => refreshMetrics())
    resizeObserver.observe(mainRef.value)
  }

  if (typeof ResizeObserver !== 'undefined') {
    tooltipResizeObserver = new ResizeObserver(() => refreshTooltipWidth())
  }
})

onBeforeUnmount(() => {
  if (tooltipRafId != null) {
    cancelAnimationFrame(tooltipRafId)
    tooltipRafId = null
  }
  tooltipLastRafTs = null
  window.removeEventListener('pointerup', onGlobalPointerUp)
  window.removeEventListener('pointermove', onGlobalPointerMove)

  if (resizeObserver && mainRef.value) {
    resizeObserver.unobserve(mainRef.value)
  }
  resizeObserver = null

  if (tooltipResizeObserver && tooltipRef.value) {
    tooltipResizeObserver.unobserve(tooltipRef.value)
  }
  tooltipResizeObserver = null
})
</script>

<template>
  <div class="tx-slider" :class="{ 'is-disabled': disabled }">
    <div
      ref="mainRef"
      class="tx-slider__main"
      @pointerenter="hovering = true"
      @pointerleave="hovering = false"
    >
      <div class="tx-slider__track" aria-hidden="true">
        <div class="tx-slider__range" :style="fillWidthStyle" />
      </div>

      <Transition v-if="props.tooltipMotion !== 'none'" name="tx-slider-tooltip">
        <div
          v-if="shouldShowTooltip"
          ref="tooltipRef"
          class="tx-slider__tooltip"
          :data-motion="props.tooltipMotion"
          :style="[tooltipStyle, tooltipTransitionStyle]"
        >
          {{ tooltipText }}
        </div>
      </Transition>

      <div
        v-else-if="shouldShowTooltip"
        ref="tooltipRef"
        class="tx-slider__tooltip"
        :data-motion="props.tooltipMotion"
        :style="[tooltipStyle, tooltipTransitionStyle]"
      >
        {{ tooltipText }}
      </div>

      <input
        ref="inputRef"
        class="tx-slider__input"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :value="clampedValue"
        @pointerdown="startDragging"
        @pointercancel="stopDragging"
        @blur="stopDragging"
        @input="onInput"
        @change="onChange"
      >
    </div>

    <div v-if="showValue" class="tx-slider__value">
      {{ displayValue }}
    </div>
  </div>
</template>

<style lang="scss">
.tx-slider {
  --tx-slider-height: 24px;
  --tx-slider-track-height: 4px;
  --tx-slider-thumb-size: 20px;
  --tx-slider-thumb-shadow: 0 2px 10px color-mix(in srgb, #000 35%, transparent);

  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  &:hover {
    --tx-slider-track-height: 6px;
    --tx-slider-thumb-size: 22px;
  }

  &:active {
    --tx-slider-track-height: 6px;
    --tx-slider-thumb-size: 24px;
  }

  &__main {
    position: relative;
    flex: 1;
    min-width: 0;
    height: var(--tx-slider-height);
    display: flex;
    align-items: center;
  }

  &__track {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: var(--tx-slider-track-height);
    pointer-events: none;
  }

  &__track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: var(--tx-slider-track-height);
    border-radius: 999px;
    background: var(--tx-fill-color, #f0f2f5);
  }

  &__range {
    position: absolute;
    left: 0;
    height: var(--tx-slider-track-height);
    border-radius: 999px;
    background: var(--tx-color-primary, #409eff);
  }

  &__tooltip {
    position: absolute;
    top: 0;
    transform-origin: 50% 120%;
    pointer-events: none;
    will-change: transform;
    filter: none;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: var(--tx-text-color-primary, #303133);
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 12%, transparent);
    backdrop-filter: blur(18px) saturate(150%);
    -webkit-backdrop-filter: blur(18px) saturate(150%);
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
    white-space: nowrap;
    z-index: 2;
  }

  .tx-slider-tooltip-enter-active,
  .tx-slider-tooltip-leave-active {
    transition:
      opacity var(--tx-slider-tooltip-motion-duration, 160ms) ease,
      filter var(--tx-slider-tooltip-motion-duration, 160ms) ease;
  }

  .tx-slider-tooltip-enter-from,
  .tx-slider-tooltip-leave-to {
    opacity: 0;
  }

  .tx-slider__tooltip[data-motion='blur'].tx-slider-tooltip-enter-from,
  .tx-slider__tooltip[data-motion='blur'].tx-slider-tooltip-leave-to {
    filter: blur(var(--tx-slider-tooltip-motion-blur, 10px));
  }

  .tx-slider__tooltip[data-motion='fade'].tx-slider-tooltip-enter-from,
  .tx-slider__tooltip[data-motion='fade'].tx-slider-tooltip-leave-to {
    filter: none;
  }

  &__input {
    width: 100%;
    height: var(--tx-slider-height);
    margin: 0;
    cursor: pointer;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    outline: none;
    position: relative;
    z-index: 1;

    &::-webkit-slider-runnable-track {
      height: var(--tx-slider-height);
      background: transparent;
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: var(--tx-slider-thumb-size);
      height: var(--tx-slider-thumb-size);
      border-radius: 999px;
      background: color-mix(in srgb, var(--tx-bg-color, #fff) 96%, transparent);
      border: 1px solid color-mix(in srgb, #000 10%, transparent);
      box-shadow: var(--tx-slider-thumb-shadow);
      margin-top: calc((var(--tx-slider-height) - var(--tx-slider-thumb-size)) / 2);
      transition: width 0.16s ease, height 0.16s ease;
    }

    &:active::-webkit-slider-thumb {
      box-shadow: 0 10px 26px color-mix(in srgb, #000 45%, transparent);
    }
  }

  &__value {
    font-size: 12px;
    color: var(--tx-text-color-secondary, #909399);
    min-width: 36px;
    text-align: right;
  }

  &.is-disabled {
    opacity: 0.6;

    .tx-slider__input {
      cursor: not-allowed;
    }

    .tx-slider__range {
      background: var(--tx-text-color-placeholder, #a8abb2);
    }
  }
}
</style>
