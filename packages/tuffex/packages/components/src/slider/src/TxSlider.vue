<script setup lang="ts">
import type { SliderEmits, SliderProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clamp01, useTooltipMotion } from './use-tooltip-motion'

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
  thumbSurface: true,
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
const thumbSizePx = ref(18)
const tooltipWidth = ref(0)

const dragging = ref(false)
const hovering = ref(false)
const focusVisible = ref(false)

/** Value-space kinematics, fed by `input` events (covers keyboard and pointer alike). */
const lastInputTs = ref<number | null>(null)
const lastInputValue = ref<number | null>(null)
const inputVelocity = ref(0)
const inputAcceleration = ref(0)

/** Pointer-space kinematics, finer grained than `input` when the step is coarse. */
const lastPointerTs = ref<number | null>(null)
const lastPointerX = ref<number | null>(null)
const pointerVelocity = ref(0)
const pointerAcceleration = ref(0)

let resizeObserver: ResizeObserver | null = null
let tooltipResizeObserver: ResizeObserver | null = null

function clampToRange(value: number): number {
  return Math.min(props.max, Math.max(props.min, value))
}

const clampedValue = computed(() => {
  const value = Number.isFinite(props.modelValue) ? props.modelValue : props.min
  return clampToRange(value)
})

/**
 * The value the slider paints from.
 *
 * The native thumb moves on the browser's own timeline, but `modelValue` only comes back
 * after emit -> parent -> prop. A parent that persists on write (storage, IPC) takes long
 * enough that the fill visibly trails the thumb mid-drag. Painting from the input's own
 * value keeps the two locked together; a real `modelValue` change still overrides it, so a
 * parent that clamps or rejects the input continues to win.
 */
const liveValue = ref(clampedValue.value)

const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0)
    return 0
  return ((liveValue.value - props.min) / range) * 100
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
  return props.formatValue ? props.formatValue(liveValue.value) : String(liveValue.value)
})

const tooltipText = computed(() => {
  if (props.tooltipFormatter)
    return props.tooltipFormatter(liveValue.value)
  return displayValue.value
})

// Expose a human-readable value to AT only when a custom formatter is in play;
// otherwise aria-valuenow (the raw number) already conveys it and a duplicate
// aria-valuetext would just be read out twice.
const valueText = computed(() => {
  if (props.tooltipFormatter || props.formatValue)
    return tooltipText.value
  return undefined
})

const isHovering = computed(() => hovering.value && !props.disabled)

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

const motion = useTooltipMotion({
  isEnabled: () => props.tooltipTilt,
  isActive: () => shouldShowTooltip.value,
  target: () => thumbCenterPx.value,
  config: () => ({
    tiltMaxDeg: props.tooltipTiltMaxDeg,
    offsetMaxPx: props.tooltipOffsetMaxPx,
    springStiffness: props.tooltipSpringStiffness,
    springDamping: props.tooltipSpringDamping,
    distortSkewDeg: props.tooltipDistortSkewDeg,
    jelly: props.tooltipJelly,
    jellyFrequency: props.tooltipJellyFrequency,
    jellyDecay: props.tooltipJellyDecay,
  }),
})

/**
 * `Transition` only manages CSS classes for the animated variants; `none` gets a
 * name with no rules behind it so the tooltip swaps in and out on the same frame.
 */
const transitionName = computed(() =>
  props.tooltipMotion === 'none' ? 'tx-slider-tooltip-none' : 'tx-slider-tooltip',
)

const tooltipTransitionStyle = computed<Record<string, string>>(() => {
  return {
    '--tx-slider-tooltip-motion-duration': `${Math.max(0, props.tooltipMotionDuration)}ms`,
    '--tx-slider-tooltip-motion-blur': `${Math.max(0, props.tooltipMotionBlurPx)}px`,
  }
})

const tooltipStyle = computed(() => {
  const baseX = props.tooltipTilt ? motion.followX.value : thumbCenterPx.value
  const offsetX = props.tooltipTilt ? motion.offsetX.value : 0
  const baseRotate = props.tooltipTilt ? motion.tiltDeg.value : 0
  const baseSquash = props.tooltipTilt ? motion.squash.value : 0
  const baseSkew = props.tooltipTilt ? motion.skewDeg.value : 0

  const wobble = props.tooltipTilt && props.tooltipJelly ? motion.wobble.value : 0
  const wobbleDir = props.tooltipTilt && props.tooltipJelly ? motion.wobbleDir.value : 1
  const wobbleRotate = wobble * wobbleDir * Math.max(0, props.tooltipJellyRotateDeg)
  const wobbleSkew = wobble * wobbleDir * Math.max(0, props.tooltipJellySkewDeg)
  const wobbleSquash = Math.abs(wobble) * Math.max(0, props.tooltipJellySquash)

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

function refreshTooltipWidth(): void {
  if (!tooltipRef.value)
    return
  const width = tooltipRef.value.getBoundingClientRect().width
  if (Number.isFinite(width) && width > 0)
    tooltipWidth.value = width
}

function refreshMetrics(): void {
  if (!mainRef.value)
    return
  mainWidth.value = mainRef.value.getBoundingClientRect().width
  // Read the *geometric* thumb size only. It is deliberately constant across
  // hover/drag — on the surface path it resolves to the pill's resting width,
  // and the drag growth rides `--tx-slider-surface-extent` on the pill alone,
  // so the fill and the native thumb can never drift out of alignment
  // mid-interaction.
  const size = Number.parseFloat(
    getComputedStyle(mainRef.value).getPropertyValue('--tx-slider-thumb-size'),
  )
  if (Number.isFinite(size) && size > 0)
    thumbSizePx.value = size
}

/**
 * Translate a velocity/acceleration sample into tooltip motion: a steady lean plus,
 * on a sharp reversal or hard flick, a wobble kick.
 */
function driveTooltipMotion(
  velocity: number,
  acceleration: number,
  previousVelocity: number,
  velocityScale: number,
  accelerationScale: number,
): void {
  const direction = velocity >= 0 ? 1 : -1
  const intensity = clamp01(
    Math.abs(velocity) / velocityScale
    + (Math.abs(acceleration) / accelerationScale) * props.tooltipAccelBoost,
  )
  motion.settle(direction, intensity)

  if (props.tooltipJelly) {
    const kickFromAccel = clamp01(
      Math.abs(acceleration) / Math.max(1, props.tooltipJellyTriggerAccel),
    )
    const reversed
      = previousVelocity !== 0 && velocity !== 0 && Math.sign(previousVelocity) !== Math.sign(velocity)
    const kick = reversed ? Math.max(0.55, kickFromAccel) : kickFromAccel
    if (kick > 0.08)
      motion.impulse(kick, direction)
  }

  motion.start()
}

function onGlobalPointerMove(e: PointerEvent): void {
  if (!dragging.value || !props.tooltipTilt)
    return

  const now = performance.now()
  const x = e.clientX

  if (lastPointerTs.value != null && lastPointerX.value != null) {
    const dtMs = now - lastPointerTs.value
    const dx = x - lastPointerX.value
    if (dtMs > 0 && dtMs < 100 && Math.abs(dx) > 1) {
      const velocity = dx / (dtMs / 1000)
      const previousVelocity = pointerVelocity.value
      pointerVelocity.value = velocity
      pointerAcceleration.value = ((velocity - previousVelocity) / dtMs) * 1000

      if (Math.abs(velocity) > 20 || Math.abs(pointerAcceleration.value) > 200) {
        driveTooltipMotion(velocity, pointerAcceleration.value, previousVelocity, 1200, 12000)
      }
    }
  }

  lastPointerTs.value = now
  lastPointerX.value = x
}

function updateValue(next: number): void {
  emit('update:modelValue', clampToRange(next))
}

function onInput(e: Event): void {
  const next = Number((e.target as HTMLInputElement).value)
  // Paint first, tell the parent second — see `liveValue`.
  liveValue.value = clampToRange(next)
  const now = performance.now()
  const previousVelocity = inputVelocity.value

  if (lastInputTs.value != null && lastInputValue.value != null) {
    const dt = now - lastInputTs.value
    if (dt > 0) {
      const perSec = ((next - lastInputValue.value) / dt) * 1000
      inputVelocity.value = perSec
      inputAcceleration.value = ((perSec - previousVelocity) / dt) * 1000
    }
  }
  lastInputTs.value = now
  lastInputValue.value = next
  updateValue(next)

  if (dragging.value && props.tooltipTilt) {
    driveTooltipMotion(inputVelocity.value, inputAcceleration.value, previousVelocity, 260, 2400)
  }
}

function onChange(e: Event): void {
  emit('change', clampToRange(Number((e.target as HTMLInputElement).value)))
}

function startDragging(e: PointerEvent): void {
  if (props.disabled)
    return
  dragging.value = true
  refreshMetrics()

  if (props.tooltipTilt) {
    motion.reset()
    motion.start()
  }

  lastPointerTs.value = performance.now()
  lastPointerX.value = e.clientX
  pointerVelocity.value = 0
  pointerAcceleration.value = 0
  window.addEventListener('pointermove', onGlobalPointerMove)
}

function stopDragging(): void {
  if (!dragging.value)
    return
  dragging.value = false

  window.removeEventListener('pointermove', onGlobalPointerMove)
  lastPointerTs.value = null
  lastPointerX.value = null
  pointerVelocity.value = 0
  pointerAcceleration.value = 0

  if (props.tooltipTilt) {
    // Release the lean; the spring carries the tooltip back over the thumb.
    motion.settle(1, 0)
    motion.start()
  }
}

function onFocus(e: FocusEvent): void {
  // `pointerdown` lands before `focus`, so a drag-initiated focus is already known
  // here — it gets the drag treatment, not a keyboard ring.
  if (dragging.value) {
    focusVisible.value = false
    return
  }
  const el = e.target as HTMLInputElement
  try {
    focusVisible.value = el.matches(':focus-visible')
  }
  catch {
    // Environments without :focus-visible support (jsdom) simply get no ring.
    focusVisible.value = false
  }
}

function onBlur(): void {
  focusVisible.value = false
  // Safety net: if the window loses focus mid-drag the global pointerup never lands.
  stopDragging()
}

function onGlobalPointerUp(): void {
  stopDragging()
}

watch(
  () => props.modelValue,
  () => {
    liveValue.value = clampedValue.value
    if (inputRef.value) {
      inputRef.value.value = String(clampedValue.value)
    }
  },
  { immediate: true },
)

watch(
  () => shouldShowTooltip.value,
  async (visible) => {
    if (!visible) {
      tooltipWidth.value = 0
      motion.stop()
      motion.reset()
      if (tooltipResizeObserver && tooltipRef.value) {
        tooltipResizeObserver.unobserve(tooltipRef.value)
      }
      return
    }
    await nextTick()
    refreshTooltipWidth()
    if (props.tooltipTilt) {
      motion.reset()
      motion.start()
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
  motion.stop()
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
  <div
    class="tx-slider"
    :class="{
      'is-disabled': disabled,
      'is-hovering': isHovering,
      'is-dragging': dragging,
      'is-focused': focusVisible,
      'has-surface': thumbSurface,
    }"
  >
    <div
      ref="mainRef"
      class="tx-slider__main"
      @pointerenter="hovering = true"
      @pointerleave="hovering = false"
    >
      <div class="tx-slider__track" aria-hidden="true">
        <div class="tx-slider__range" :style="fillWidthStyle" />
      </div>

      <!--
        Positioned with `left` rather than a transform: the pill's box is what transitions on
        drag, and folding the per-frame X into any transitioned property would make it lag the
        native thumb by the transition duration. The pill is the whole visible thumb; the native
        one underneath is a bare hit area on this path.
      -->
      <div
        v-if="thumbSurface"
        class="tx-slider__surface"
        aria-hidden="true"
        :style="{ left: `${thumbCenterPx}px` }"
      />

      <Transition :name="transitionName">
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

      <input
        ref="inputRef"
        class="tx-slider__input"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :value="clampedValue"
        :aria-label="ariaLabel"
        :aria-labelledby="ariaLabelledby"
        :aria-valuetext="valueText"
        @pointerdown="startDragging"
        @pointercancel="stopDragging"
        @focus="onFocus"
        @blur="onBlur"
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
  /**
   * Geometry. `TxSlider` measures `--tx-slider-thumb-size` to place the fill,
   * so it must not change between states. On the surface path it *is* the
   * pill's width: the native thumb is then exactly as wide as the pill, which
   * is what keeps the fill's end on the pill's centre and the pill inside the
   * track at both ends. The flat path narrows it back to the 18px disc below.
   */
  --tx-slider-height: 24px;
  --tx-slider-thumb-size: var(--tx-slider-surface-width);

  /** State surface — the rows below are the whole visual language. */
  --tx-slider-track-height: 6px;
  --tx-slider-track-color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 14%, transparent);

  /**
   * The pill. One object in every state: the native thumb is a hit area and
   * nothing more (see the `.has-surface` thumb rule), and this is the whole
   * thumb the user sees. Wider than tall because the slider reads along one
   * axis, and a disc kept pulling the eye into a point instead of onto the
   * stretch of track being addressed. `--tx-slider-surface-size` stays the
   * *height* — it is a public override point, so it keeps its meaning.
   *
   * The pair is the pill at rest; `--tx-slider-surface-extent` scales it on
   * drag. Deriving real `width`/`height` rather than riding `transform: scale()`
   * is deliberate: a scaled pill drags its radius and its 1px rim along with
   * it. Sized this way both hold at their authored values in every state. The
   * layout cost is bounded on purpose — see `.tx-slider__surface`.
   */
  --tx-slider-surface-size: 20px;
  --tx-slider-surface-width: 40px;
  --tx-slider-surface-radius: 999px;
  --tx-slider-surface-extent: 1;
  --tx-slider-surface-opacity: 1;

  /**
   * Glass recipe, shared with the Radio button-group indicator: a translucent
   * tint of the overlay surface, a backdrop blur, a 1px rim from the light
   * border family and a 1px top highlight. Neutral on purpose — the blue is
   * the fill refracting through the blur where the pill overlaps it, not a
   * tint of its own, so the pill reads as glass over the track rather than a
   * sticker on it.
   */
  --tx-slider-surface-blur: 8px;
  --tx-slider-surface-saturate: 160%;
  --tx-slider-surface-tint: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 22%, transparent);
  --tx-slider-surface-rim: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 55%, transparent);
  --tx-slider-surface-highlight: color-mix(in srgb, var(--tx-color-white, #fff) 17%, transparent);

  /**
   * Flat-path thumb (`thumbSurface: false`): the native disc, visible, growing
   * and ringing to separate its states. All of this is inert on the surface path.
   */
  --tx-slider-thumb-scale: 1;
  --tx-slider-thumb-ring: 0 0 0 0 transparent;
  --tx-slider-thumb-shadow: 0 1px 3px color-mix(in srgb, #000 18%, transparent);
  /**
   * The text-colour family, not the page surface: those tokens are the ones that
   * actually invert between themes (#111827 light, #ffffff dark), so the disc is
   * dark on a light page and light on a dark one. Tracking `--tx-bg-color` made
   * it the same colour as the page behind it, and in dark themes it read as a
   * hole punched through the track rather than a knob sitting on it. This is
   * also what `TxSwitch` does with its own thumb.
   */
  --tx-slider-thumb-color: var(--tx-text-color-primary, #303133);

  /**
   * Two clocks. The state clock drives the one step that has mass — the pill's
   * size on drag — and is a spring compiled to `linear()` in the `@supports`
   * block after this rule; the bezier here is the fallback for engines without
   * `linear()`, and it does not overshoot, because a bezier faking a bounce is
   * worse than no bounce. Everything else (rim, saturation, track thickness,
   * focus ring) rides the hover clock, a plain ease-out: hover in and out must
   * never bounce.
   */
  --tx-slider-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --tx-slider-state-duration: 360ms;
  --tx-slider-hover-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --tx-slider-hover-duration: 180ms;

  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  &:not(.has-surface) {
    --tx-slider-thumb-size: 18px;
  }

  /*
   * Known downstream trap, not fixed here: `plugins/touch-music` overrides
   * `--tx-slider-thumb-size` (0px / 10px !important) on sliders that keep the
   * default `thumbSurface`. Those overrides were written against the old
   * 18px disc; with the pill they leave a 40px thumb over a 0–10px hit area,
   * and `refreshMetrics()` ignores a 0px value and keeps its 18px fallback.
   * The fix belongs in the plugin: pass `thumbSurface=false` there, then
   * size the disc (see the slider docs' best practices).
   */

  /* Hover brightens the rim and lifts the saturation. The pill does not grow. */
  &.is-hovering,
  &.is-focused {
    --tx-slider-track-height: 8px;
    --tx-slider-track-color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 20%, transparent);
    --tx-slider-surface-saturate: 180%;
    --tx-slider-surface-rim: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 75%, transparent);
    --tx-slider-thumb-shadow: 0 2px 6px color-mix(in srgb, #000 22%, transparent);
  }

  /**
   * Dragging: thicker track, darker rail, a slightly larger pill with a deeper
   * blur and a rim that picks up the accent. The size step is the whole press
   * bounce — it runs on the spring, so it overshoots by a few percent and
   * settles once. Driven by the `dragging` ref rather than `:active`, because
   * the pointer routinely leaves the element mid-drag.
   */
  &.is-dragging {
    --tx-slider-track-height: 10px;
    --tx-slider-track-color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 26%, transparent);
    --tx-slider-surface-extent: 1.08;
    --tx-slider-surface-blur: 10px;
    --tx-slider-surface-saturate: 190%;
    --tx-slider-surface-rim: color-mix(in srgb, var(--tx-color-primary, #409eff) 30%, color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 75%, transparent));
    --tx-slider-thumb-shadow: 0 4px 12px color-mix(in srgb, #000 30%, transparent);
  }

  /**
   * With the pill on, a ring around the native thumb would sit inside an
   * invisible box. Only sliders opting out of the surface fall back to the
   * disc growing and ringing to separate their states.
   */
  &:not(.has-surface).is-hovering {
    --tx-slider-thumb-scale: 1.08;
    --tx-slider-thumb-ring: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
  }

  &:not(.has-surface).is-dragging {
    --tx-slider-thumb-scale: 1.16;
    --tx-slider-thumb-ring: 0 0 0 6px color-mix(in srgb, var(--tx-color-primary, #409eff) 24%, transparent);
  }

  /**
   * Keyboard focus keeps a crisp ring regardless, on whichever thumb is
   * visible: the disc on the flat path, through its ring variable; the pill on
   * the surface path, through the dedicated rule below `.tx-slider__surface`.
   */
  &.is-focused:not(.is-dragging) {
    --tx-slider-thumb-ring: 0 0 0 3px var(--tx-focus-ring-color, color-mix(in srgb, var(--tx-color-primary, #409eff) 72%, white));
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
    border-radius: 999px;
    background: var(--tx-slider-track-color);
    pointer-events: none;
    transition:
      height var(--tx-slider-hover-duration) var(--tx-slider-hover-ease),
      background-color var(--tx-slider-hover-duration) var(--tx-slider-hover-ease);
  }

  &__range {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    border-radius: inherit;
    background: var(--tx-color-primary, #409eff);
    /* Width is driven per-frame from the pointer — never transition it. */
    transition: background-color var(--tx-slider-hover-duration) var(--tx-slider-hover-ease);
  }

  /**
   * Sized, not scaled, so the radius and the rim below hold their authored
   * values. Writing `width`/`height` is a layout write, which is exactly what
   * the per-frame `left` must never do — but this one is not per-frame. It
   * moves on drag start and drag end, once each per interaction, and
   * `contain: layout` walls the resulting pass inside this element: an
   * absolutely positioned, childless leaf that nothing else is sized against.
   */
  &__surface {
    position: absolute;
    top: 50%;
    width: calc(var(--tx-slider-surface-width) * var(--tx-slider-surface-extent));
    height: calc(var(--tx-slider-surface-size) * var(--tx-slider-surface-extent));
    contain: layout;
    border-radius: var(--tx-slider-surface-radius);
    background: var(--tx-slider-surface-tint);
    backdrop-filter: blur(var(--tx-slider-surface-blur)) saturate(var(--tx-slider-surface-saturate));
    -webkit-backdrop-filter: blur(var(--tx-slider-surface-blur)) saturate(var(--tx-slider-surface-saturate));
    /*
     * Rim, highlight, lift — the Radio indicator's list. The rim is not
     * decoration: on a flat card there is nothing behind the pill for the blur
     * to refract, and without an edge it would be a formless smudge.
     */
    box-shadow:
      inset 0 0 0 1px var(--tx-slider-surface-rim),
      inset 0 1px 0 var(--tx-slider-surface-highlight),
      0 2px 8px rgba(15, 23, 42, 0.08);
    opacity: var(--tx-slider-surface-opacity);
    transform: translate(-50%, -50%);
    pointer-events: none;
    /* `left` is deliberately absent — it must track the thumb frame-for-frame. */
    transition:
      width var(--tx-slider-state-duration) var(--tx-slider-ease),
      height var(--tx-slider-state-duration) var(--tx-slider-ease),
      box-shadow var(--tx-slider-hover-duration) var(--tx-slider-hover-ease),
      backdrop-filter var(--tx-slider-hover-duration) var(--tx-slider-hover-ease);
  }

  /*
   * Keyboard focus, drawn on the pill: the native thumb is invisible on this
   * path, so a ring on it would be a ring on nothing. Appended to the list
   * above rather than replacing it — the rim and the highlight must survive
   * focus — and restated in full because `box-shadow` is not additive. The
   * first three entries are the same as `.tx-slider__surface`; the test holds
   * them equal.
   *
   * Not fixed here: in the dark theme `--tx-focus-ring-color` resolves to
   * `--tx-color-primary-light-7` (rgb(33, 61, 91)), a ring darker than the
   * pill it surrounds. It reads, but only just; that is a token-level value
   * shared by every focusable control, so it is out of this component's scope.
   */
  &.is-focused:not(.is-dragging) .tx-slider__surface {
    box-shadow:
      inset 0 0 0 1px var(--tx-slider-surface-rim),
      inset 0 1px 0 var(--tx-slider-surface-highlight),
      0 2px 8px rgba(15, 23, 42, 0.08),
      0 0 0 3px var(--tx-focus-ring-color, color-mix(in srgb, var(--tx-color-primary, #409eff) 72%, white));
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

  /* `tooltipMotion: 'none'` — present so the intent is legible, not inherited. */
  .tx-slider-tooltip-none-enter-active,
  .tx-slider-tooltip-none-leave-active {
    transition: none;
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

    /*
     * The flat-path disc. Only WebKit/Blink are styled here; `::-moz-range-thumb`
     * has never been, so Firefox shows its stock thumb on both paths — a
     * pre-existing gap, left as is.
     */
    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: var(--tx-slider-thumb-size);
      height: var(--tx-slider-thumb-size);
      border-radius: 999px;
      background: var(--tx-slider-thumb-color);
      border: 1px solid color-mix(in srgb, #000 12%, transparent);
      box-shadow: var(--tx-slider-thumb-ring), var(--tx-slider-thumb-shadow);
      margin-top: calc((var(--tx-slider-height) - var(--tx-slider-thumb-size)) / 2);
      transform: scale(var(--tx-slider-thumb-scale));
      transition:
        transform var(--tx-slider-hover-duration) var(--tx-slider-hover-ease),
        box-shadow var(--tx-slider-hover-duration) var(--tx-slider-hover-ease);
    }
  }

  /**
   * On the surface path the native thumb is a hit area and nothing else. It
   * exists so the browser handles pointer, keyboard and the value↔px mapping;
   * the pill is what the user sees. As wide as the pill (that is what
   * `--tx-slider-thumb-size` resolves to here) and as tall as the row, so the
   * whole pill is grabbable.
   */
  &.has-surface .tx-slider__input::-webkit-slider-thumb {
    width: var(--tx-slider-thumb-size);
    height: var(--tx-slider-height);
    margin-top: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
    transform: none;
    transition: none;
  }

  &__value {
    font-size: 12px;
    color: var(--tx-text-color-secondary, #909399);
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
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

/**
 * The press bounce, compiled. `resolveTransition({ stiffness: 560, damping: 34 })`
 * from `../../liquid/src/spring` emits exactly this list — ζ ≈ 0.72, +3%
 * overshoot, one reversal, settled at 362ms — and `slider.test.ts` holds the
 * two together so they cannot drift. Authored statically rather than resolved
 * at runtime because the slider never changes its stiffness, so a
 * `CSS.supports` probe and a style write per instance would buy nothing.
 */
@supports (transition-timing-function: linear(0, 1)) {
  .tx-slider {
    --tx-slider-ease: linear(0, 0.0526, 0.1183, 0.2419, 0.377, 0.4661, 0.5913, 0.6664, 0.7645, 0.8442, 0.8874, 0.9388, 0.9759, 0.9939, 1.0126, 1.0235, 1.0275, 1.0297, 1.0295, 1.0273, 1.0239, 1.0212, 1.0172, 1.0134, 1.011, 1.0079, 1.0054, 1.004, 1.0023, 1.0014, 1.0004, 0.9998, 0.9995, 1);
    --tx-slider-state-duration: 362ms;
  }
}

/* After the `@supports` block on purpose: same specificity, so source order is what makes this win. */
@media (prefers-reduced-motion: reduce) {
  .tx-slider {
    --tx-slider-state-duration: 0ms;
    --tx-slider-hover-duration: 0ms;
  }
}
</style>
