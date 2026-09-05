<script setup lang="ts">
import type { SliderEmits, SliderProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TxGlassSurface } from '../../glass-surface'
import { useThumbJelly } from './use-thumb-jelly'
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
  thumbVariant: 'blur',
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
const mainLeftPx = ref(0)
const thumbSizePx = ref(18)
const surfaceHeightPx = ref(28)
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
 * Under reduced motion the pill still changes rim and shadow with state; it just
 * never deforms. Read once at setup — the preference does not flip mid-session in
 * practice, and a media-query listener per slider would buy nothing.
 */
const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false

const jelly = useThumbJelly({
  isEnabled: () => props.thumbSurface && !reducedMotion,
})

/**
 * `left` is the per-frame position; the transform is the jelly, and only while
 * it runs. At rest the property is dropped so the stylesheet's own
 * `translate(-50%, -50%)` holds and the pill's radius and rim are exact.
 */
const surfaceStyle = computed<Record<string, string | undefined>>(() => ({
  left: `${thumbCenterPx.value}px`,
  transform: jelly.active.value
    ? `translate(-50%, -50%) scale(${jelly.scaleX.value.toFixed(4)}, ${jelly.scaleY.value.toFixed(4)})`
    : undefined,
}))

/**
 * The glass body is the Radio indicator's `TxGlassSurface` with the indicator's
 * tuning, and like the indicator it is only up while the thumb is held or
 * settling: an SVG displacement filter is too heavy to keep alive under a
 * thumb that moves on every frame it is dragged, so at rest the capsule is the
 * solid body and the glass fades in on grab.
 */
const showGlass = computed(() =>
  props.thumbSurface && props.thumbVariant === 'glass' && (dragging.value || jelly.active.value),
)

/** Read per grab, so a theme toggle mid-session is honoured; the class beats the OS preference. */
const darkTheme = ref(false)

function readDarkTheme(): boolean {
  if (typeof document === 'undefined')
    return false
  const root = document.documentElement
  if (root.classList.contains('dark') || root.dataset.theme === 'dark')
    return true
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** The indicator's two looks, verbatim (`glassLook` in `radio-group-indicator.ts`). */
const glassLook = computed(() => darkTheme.value
  ? { brightness: 8, opacity: 0.6, backgroundOpacity: 0.06, saturation: 1.05 }
  : { brightness: 100, opacity: 0.85, backgroundOpacity: 0.02, saturation: 1.15 })

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

  // 36px clears the 28px pill with its held growth and a fast drag's stretch on top.
  const y = props.tooltipPlacement === 'bottom' ? 36 : -36
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
  const rect = mainRef.value.getBoundingClientRect()
  mainWidth.value = rect.width
  mainLeftPx.value = rect.left
  // Read the *geometric* thumb size only. It is constant across states by
  // design — on the surface path it is the pill's authored width, and the
  // jelly scales the pill through a transform that never touches its box —
  // so the fill and the native thumb can never drift out of alignment
  // mid-interaction.
  const size = Number.parseFloat(
    getComputedStyle(mainRef.value).getPropertyValue('--tx-slider-thumb-size'),
  )
  if (Number.isFinite(size) && size > 0)
    thumbSizePx.value = size
  // The glass body is sized in px, so the capsule's authored height is read alongside.
  const height = Number.parseFloat(
    getComputedStyle(mainRef.value).getPropertyValue('--tx-slider-surface-size'),
  )
  if (Number.isFinite(height) && height > 0)
    surfaceHeightPx.value = height
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
  if (!dragging.value)
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

      // The pill stretches with the pointer and lands when it reverses or slams
      // into an end. The end is read from the pointer, not the value: the value
      // only catches up on the `input` event after this listener has run.
      const edge = thumbSizePx.value / 2
      const atEnd = x <= mainLeftPx.value + edge || x >= mainLeftPx.value + mainWidth.value - edge
      jelly.move(velocity, atEnd)

      if (props.tooltipTilt && (Math.abs(velocity) > 20 || Math.abs(pointerAcceleration.value) > 200)) {
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
  darkTheme.value = readDarkTheme()
  jelly.press()

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
  jelly.release()

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
  jelly.stop()
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
      [`is-thumb-${thumbVariant}`]: thumbSurface,
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
        Positioned with `left` rather than a transform: `left` is written every frame from
        the pointer, and folding it into a transitioned property would make it lag the native
        thumb by the transition duration. The transform is the jelly's — see `surfaceStyle`.
        The pill is the whole visible thumb; the native one underneath is a bare hit area.
      -->
      <div
        v-if="thumbSurface"
        class="tx-slider__surface"
        aria-hidden="true"
        :style="surfaceStyle"
      >
        <TxGlassSurface
          v-if="showGlass"
          class="tx-slider__glass"
          :class="{ 'is-active': dragging }"
          :width="thumbSizePx"
          :height="surfaceHeightPx"
          :border-radius="surfaceHeightPx / 2"
          :border-width="8"
          :brightness="glassLook.brightness"
          :opacity="glassLook.opacity"
          :blur="2"
          :displace="0.25"
          :background-opacity="glassLook.backgroundOpacity"
          :saturation="glassLook.saturation"
          :distortion-scale="2"
          :red-offset="0"
          :green-offset="4"
          :blue-offset="8"
          aria-hidden="true"
        />
      </div>

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
   * The row is as tall as the pill so the whole pill is grabbable.
   */
  --tx-slider-height: 28px;
  --tx-slider-thumb-size: var(--tx-slider-surface-width);

  /** State surface — the rows below are the whole visual language. */
  --tx-slider-track-height: 6px;
  --tx-slider-track-color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 14%, transparent);

  /**
   * The pill: the Radio button-group indicator, borrowed whole. The same 28px
   * height as `.tx-radio--button`, the same capsule, and the same body — an
   * 88% tint of the overlay surface, a 1px rim from the light border family,
   * a 1px top highlight and a short drop shadow. One object in every state:
   * the native thumb is a hit area and nothing more (see the `.has-surface`
   * thumb rule). These are the `solid` body; the `blur` and `glass` variants
   * below re-tint it. `--tx-slider-surface-size` stays the *height* — it is a
   * public override point, so it keeps its meaning. `slider.test.ts` holds the
   * recipe to the indicator's source.
   */
  --tx-slider-surface-size: 28px;
  --tx-slider-surface-width: 36px;
  --tx-slider-surface-radius: 999px;
  --tx-slider-surface-opacity: 1;
  --tx-slider-surface-tint: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 88%, transparent);
  --tx-slider-surface-rim: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 50%, transparent);
  --tx-slider-surface-highlight: color-mix(in srgb, var(--tx-color-white, #fff) 17%, transparent);
  --tx-slider-surface-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);

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
   * One clock. Rim, shadow, track thickness and the focus ring ride a plain
   * ease-out, and hover in and out must never bounce. The pill's size has no
   * clock in the stylesheet at all: its grab, drag and release are the jelly
   * (`use-thumb-jelly.ts`), written per frame as a transform on the Radio
   * indicator's spring.
   */
  --tx-slider-hover-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --tx-slider-hover-duration: 180ms;

  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  &:not(.has-surface) {
    --tx-slider-thumb-size: 18px;
  }

  /**
   * Three bodies — the Radio indicator's three (`indicatorVariant`). `solid`
   * is the plain capsule above. `blur` thins the fill to 22% and frosts what
   * lies under it; the fill's blue refracting up through the pill is the whole
   * point of this variant, so unlike the indicator — which only frosts while it
   * moves, over labels that must stay legible at rest — the frost is on at rest
   * too. `glass` keeps the solid capsule at rest and mounts the indicator's
   * `TxGlassSurface` while held (see the template); the capsule goes clear
   * under it so the track refracts through the glass rather than an 88% fill.
   */
  &.is-thumb-blur {
    --tx-slider-surface-tint: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 22%, transparent);
    --tx-slider-surface-blur: 8px;
    --tx-slider-surface-saturate: 160%;
  }

  &.is-thumb-blur.is-dragging {
    --tx-slider-surface-blur: 10px;
    --tx-slider-surface-saturate: 190%;
  }

  &.is-thumb-glass.is-dragging {
    --tx-slider-surface-tint: transparent;
  }

  /*
   * Known downstream trap, not fixed here: `plugins/touch-music` overrides
   * `--tx-slider-thumb-size` (0px / 10px !important) on sliders that keep the
   * default `thumbSurface`. Those overrides were written against the old
   * 18px disc; with the pill they leave a 36px thumb over a 0–10px hit area,
   * and `refreshMetrics()` ignores a 0px value and keeps its 18px fallback.
   * The fix belongs in the plugin: pass `thumbSurface=false` there, then
   * size the disc (see the slider docs' best practices).
   */

  /* Hover brightens the rim. The pill does not grow. */
  &.is-hovering,
  &.is-focused {
    --tx-slider-track-height: 8px;
    --tx-slider-track-color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 20%, transparent);
    --tx-slider-surface-rim: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 75%, transparent);
    --tx-slider-thumb-shadow: 0 2px 6px color-mix(in srgb, #000 22%, transparent);
  }

  /**
   * Dragging: thicker track, darker rail, a rim that picks up the accent and a
   * longer shadow under the lifted pill. The size step itself is the jelly's.
   * Driven by the `dragging` ref rather than `:active`, because the pointer
   * routinely leaves the element mid-drag.
   */
  &.is-dragging {
    --tx-slider-track-height: 10px;
    --tx-slider-track-color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 26%, transparent);
    --tx-slider-surface-rim: color-mix(in srgb, var(--tx-color-primary, #409eff) 30%, color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 75%, transparent));
    --tx-slider-surface-shadow: 0 6px 16px rgba(15, 23, 42, 0.14);
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
   * Sized by its authored values and never by state. The jelly scales it
   * through an inline transform while it runs and takes that transform away
   * when it stops, so at rest the radius and the 1px rim are exact; while it
   * runs, a scaled rim is the price of a body that visibly gives. `transform`
   * is deliberately absent from the transition list — it is written per frame.
   */
  &__surface {
    position: absolute;
    top: 50%;
    width: var(--tx-slider-surface-width);
    height: var(--tx-slider-surface-size);
    border-radius: var(--tx-slider-surface-radius);
    background: var(--tx-slider-surface-tint);
    /*
     * Rim, highlight, lift — the Radio indicator's list. The rim is not
     * decoration: on a flat card there is nothing to separate the pill from
     * the track but its edge.
     */
    box-shadow:
      inset 0 0 0 1px var(--tx-slider-surface-rim),
      inset 0 1px 0 var(--tx-slider-surface-highlight),
      var(--tx-slider-surface-shadow);
    opacity: var(--tx-slider-surface-opacity);
    transform: translate(-50%, -50%);
    will-change: transform;
    pointer-events: none;
    /* `left` is deliberately absent — it must track the thumb frame-for-frame. */
    transition: box-shadow var(--tx-slider-hover-duration) var(--tx-slider-hover-ease);
  }

  &.is-thumb-blur .tx-slider__surface {
    backdrop-filter: blur(var(--tx-slider-surface-blur)) saturate(var(--tx-slider-surface-saturate));
    -webkit-backdrop-filter: blur(var(--tx-slider-surface-blur)) saturate(var(--tx-slider-surface-saturate));
    transition:
      box-shadow var(--tx-slider-hover-duration) var(--tx-slider-hover-ease),
      backdrop-filter var(--tx-slider-hover-duration) var(--tx-slider-hover-ease);
  }

  /*
   * The glass body fills the capsule and rides its transform. The capsule's
   * own inset rim would be hidden under it, so the rim is restated here;
   * `.tx-slider` is repeated so this outranks `.tx-glass-surface`'s own
   * opacity transition regardless of stylesheet order.
   */
  & .tx-slider__glass {
    position: absolute;
    inset: 0;
    opacity: 0;
    box-shadow: inset 0 0 0 1px var(--tx-slider-surface-rim);
    pointer-events: none;
    transition: opacity 120ms ease;

    &.is-active {
      opacity: 1;
    }
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
      var(--tx-slider-surface-shadow),
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

/* The jelly is switched off in script under the same query; this zeroes the hover clock. */
@media (prefers-reduced-motion: reduce) {
  .tx-slider {
    --tx-slider-hover-duration: 0ms;
  }
}
</style>
