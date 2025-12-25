<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SliderEmits, SliderProps } from './types'

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
  tooltipTiltMaxDeg: 14,
  tooltipOffsetMaxPx: 18,
  tooltipAccelBoost: 0.35,
  tooltipSpringStiffness: 240,
  tooltipSpringDamping: 26,
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
  if (range <= 0) return 0
  return ((clampedValue.value - props.min) / range) * 100
})

const thumbCenterPx = computed(() => {
  if (mainWidth.value <= 0) return 0
  const edge = thumbSizePx.value / 2
  const inner = Math.max(0, mainWidth.value - thumbSizePx.value)
  return edge + inner * (percent.value / 100)
})

const fillWidthStyle = computed(() => {
  if (mainWidth.value <= 0) return { width: `${percent.value}%` }
  return { width: `${thumbCenterPx.value}px` }
})

const displayValue = computed(() => {
  return props.formatValue ? props.formatValue(clampedValue.value) : String(clampedValue.value)
})

const tooltipText = computed(() => {
  if (props.tooltipFormatter) return props.tooltipFormatter(clampedValue.value)
  return displayValue.value
})

const shouldShowTooltip = computed(() => {
  if (!props.showTooltip) return false
  if (props.disabled) return false
  if (props.tooltipTrigger === 'always') return true
  if (props.tooltipTrigger === 'hover') return hovering.value || dragging.value
  return dragging.value
})

const tooltipStyle = computed(() => {
  const baseX = thumbCenterPx.value
  const offsetX = props.tooltipTilt ? tooltipOffsetX.value : 0
  const rotate = props.tooltipTilt ? tooltipTiltDeg.value : 0
  
  // Clamp position to prevent overflow
  const half = tooltipWidth.value > 0 ? tooltipWidth.value / 2 : 40 // fallback width
  const safe = 8
  const min = half + safe
  const max = Math.max(min, mainWidth.value - half - safe)
  const clampedX = Math.min(max, Math.max(min, baseX + offsetX))
  
  const y = props.tooltipPlacement === 'bottom' ? 28 : -28
  const origin = props.tooltipPlacement === 'bottom' ? '50% 0%' : '50% 100%'
  
  return {
    left: `${clampedX}px`,
    top: '50%',
    transformOrigin: origin,
    transform: `translateX(-50%) translateY(-50%) translateY(${y}px) rotate(${rotate}deg)`,
    transition: dragging.value ? 'transform 0.1s ease-out' : 'opacity 0.2s ease, transform 0.3s ease',
  }
})

function refreshTooltipWidth() {
  if (!tooltipRef.value) return
  const w = tooltipRef.value.getBoundingClientRect().width
  if (Number.isFinite(w) && w > 0) tooltipWidth.value = w
}

function onGlobalPointerMove(e: PointerEvent) {
  if (!dragging.value || !props.tooltipTilt) return

  const now = performance.now()
  const x = e.clientX

  if (lastPointerTs.value != null && lastPointerX.value != null) {
    const dtMs = now - lastPointerTs.value
    const dx = x - lastPointerX.value
    if (dtMs > 0 && dtMs < 100 && Math.abs(dx) > 1) {
      hadPointerMove.value = true
      const v = dx / (dtMs / 1000)
      const absV = Math.abs(v)
      
      if (absV > 20) {
        const dir = v >= 0 ? 1 : -1
        const intensity = Math.min(1, absV / 800)
        tooltipTiltDeg.value = -dir * intensity * props.tooltipTiltMaxDeg
        tooltipOffsetX.value = -dir * intensity * props.tooltipOffsetMaxPx
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
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  emit('change', Number(el.value))
}

function refreshMetrics() {
  if (!mainRef.value) return
  const rect = mainRef.value.getBoundingClientRect()
  mainWidth.value = rect.width
  const raw = getComputedStyle(mainRef.value).getPropertyValue('--tx-slider-thumb-size')
  const size = Number.parseFloat(raw)
  if (Number.isFinite(size) && size > 0) thumbSizePx.value = size
}

function startDragging(e: PointerEvent) {
  if (props.disabled) return
  dragging.value = true
  refreshMetrics()

  lastPointerTs.value = performance.now()
  lastPointerX.value = e.clientX
  pointerVelocity.value = 0
  pointerAcceleration.value = 0
  hadPointerMove.value = false
  window.addEventListener('pointermove', onGlobalPointerMove)
}

function stopDragging() {
  if (!dragging.value) return
  dragging.value = false

  window.removeEventListener('pointermove', onGlobalPointerMove)
  lastPointerTs.value = null
  lastPointerX.value = null
  pointerVelocity.value = 0
  pointerAcceleration.value = 0
  hadPointerMove.value = false
  
  if (props.tooltipTilt) {
    setTimeout(() => {
      tooltipTiltDeg.value = 0
      tooltipOffsetX.value = 0
    }, 100)
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
      if (tooltipResizeObserver && tooltipRef.value) {
        tooltipResizeObserver.unobserve(tooltipRef.value)
      }
      return
    }
    await nextTick()
    refreshTooltipWidth()
    if (tooltipResizeObserver && tooltipRef.value) {
      tooltipResizeObserver.observe(tooltipRef.value)
    }
  },
)

watch(tooltipText, async () => {
  if (!shouldShowTooltip.value) return
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

      <div v-if="shouldShowTooltip" ref="tooltipRef" class="tx-slider__tooltip" :style="tooltipStyle">
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
      />
    </div>

    <div v-if="showValue" class="tx-slider__value">{{ displayValue }}</div>
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
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: var(--tx-text-color, #fff);
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 92%, #000);
    box-shadow: 0 8px 22px color-mix(in srgb, #000 40%, transparent);
    white-space: nowrap;
    z-index: 2;
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
