<script setup lang="ts">
import type { ProgressBarEmits, ProgressBarProps, ProgressFlowEffect } from './types'
/**
 * TxProgressBar Component
 *
 * A versatile progress bar component with loading, error, and success states.
 * Supports both determinate and indeterminate progress modes.
 *
 * @example
 * ```vue
 * <TxProgressBar loading />
 * <TxProgressBar :percentage="75" show-text />
 * <TxProgressBar success message="Complete!" />
 * <TxProgressBar :percentage="65" show-text text-placement="top" detail="1.4 MB of 2.3 MB" />
 * ```
 *
 * @component
 */
import { computed, ref, watch } from 'vue'
import { TxTooltip } from '../../tooltip'

defineOptions({
  name: 'TxProgressBar',
})

const props = withDefaults(defineProps<ProgressBarProps>(), {
  loading: false,
  indeterminate: false,
  indeterminateVariant: 'sweep',
  error: false,
  success: false,
  status: '',
  message: '',
  detail: '',
  ariaLabel: '',
  percentage: 0,
  segmentsTotal: 100,
  height: '5px',
  showText: false,
  textPlacement: 'inside',
  flowEffect: 'none',
  indicatorEffect: 'none',
  hoverEffect: 'none',
  color: '',
  maskVariant: 'plain',
  maskBackground: 'none',
  tooltip: false,
})

const emit = defineEmits<ProgressBarEmits>()

const segmentsSum = computed(() => {
  const list = props.segments || []
  return list.reduce((acc, s) => acc + (Number.isFinite(s.value) ? Math.max(0, s.value) : 0), 0)
})

const hasSegments = computed(() => !!props.segments?.length && segmentsSum.value > 0)

const resolvedPercentage = computed(() => {
  if (props.loading || props.indeterminate)
    return 0
  if (props.segments?.length) {
    const total = Math.max(0.0001, props.segmentsTotal || 100)
    return Math.min(100, Math.max(0, (segmentsSum.value / total) * 100))
  }
  const raw = Math.min(100, Math.max(0, props.percentage ?? 0))
  if ((props.success || props.error) && raw === 0 && props.message)
    return 100
  return raw
})

const resolvedStatus = computed<'' | 'success' | 'error' | 'warning'>(() => {
  if (props.error)
    return 'error'
  if (props.success)
    return 'success'
  return props.status || ''
})

const fillColor = computed(() => {
  if (props.color)
    return props.color
  if (resolvedStatus.value === 'error')
    return 'var(--tx-color-danger, #f56c6c)'
  if (resolvedStatus.value === 'success')
    return 'var(--tx-color-success, #67c23a)'
  if (resolvedStatus.value === 'warning')
    return 'var(--tx-color-warning, #e6a23c)'
  return 'var(--tx-color-primary, #409eff)'
})

const isGradientColor = computed(() => String(fillColor.value || '').includes('gradient('))

/**
 * A gradient `color` has no single hue, and `color-mix()` over a gradient
 * string is an invalid value that drops the whole declaration. Everything that
 * needs one colour reads these instead: the head label takes the text colour,
 * the tip glow goes white — the same white as the stardust, so the two read as
 * one light source.
 */
const accentColor = computed(() => (isGradientColor.value ? 'var(--tx-text-color-primary, #303133)' : fillColor.value))
const glowColor = computed(() => (isGradientColor.value ? '#fff' : fillColor.value))

/**
 * The fill fades in from the start and is fully saturated at the tip. A
 * `color` that is already a gradient string is used verbatim so a caller's own
 * gradient is not layered under another one.
 */
const fillBackground = computed(() => {
  const c = String(fillColor.value || '')
  if (isGradientColor.value)
    return c
  return `linear-gradient(90deg, color-mix(in srgb, ${c} 58%, transparent), ${c})`
})

/**
 * Computed style variables for the progress bar.
 */
const styleVars = computed(() => {
  const vars: Record<string, string> = {
    '--tx-progress-height': props.height,
    '--tx-progress-width': `${resolvedPercentage.value}%`,
    '--tx-progress-color': fillColor.value,
    '--tx-progress-fill': fillBackground.value,
    '--tx-progress-accent': accentColor.value,
    '--tx-progress-glow': glowColor.value,
  }
  return vars
})

/** `particles` is the old name of `stardust`; both render the same layers. */
const resolvedFlowEffect = computed<Exclude<ProgressFlowEffect, 'particles'>>(() =>
  props.flowEffect === 'particles' ? 'stardust' : props.flowEffect,
)

/** Segments own the fill's surface, so no flow overlay is drawn over them. */
const showFlow = computed(() => resolvedFlowEffect.value !== 'none' && !(props.loading || props.indeterminate) && !hasSegments.value)

/**
 * Computed class list for the progress bar.
 */
const classList = computed(() => ({
  'tx-progress-bar--indeterminate': props.loading || props.indeterminate,
  [`tx-progress-bar--indeterminate-${props.indeterminateVariant}`]: props.loading || props.indeterminate,
  [`tx-progress-bar--flow-${resolvedFlowEffect.value}`]: showFlow.value,
  [`tx-progress-bar--status-${resolvedStatus.value}`]: !!resolvedStatus.value,
  'tx-progress-bar--segmented': hasSegments.value,
}))

const showMask = computed(() => props.maskBackground !== 'none')

const wrapperClassList = computed(() => ({
  [`tx-progress-bar-wrapper--mask-${props.maskVariant}`]: true,
  [`tx-progress-bar-wrapper--bg-${props.maskBackground}`]: showMask.value,
  'tx-progress-bar-wrapper--text-outside': props.textPlacement === 'outside',
  'tx-progress-bar-wrapper--text-top': props.textPlacement === 'top',
  [`tx-progress-bar-wrapper--hover-${props.hoverEffect}`]: props.hoverEffect !== 'none',
  'tx-progress-bar-wrapper--segmented': hasSegments.value,
}))

const showIndicator = computed(() => {
  if (props.loading || props.indeterminate)
    return false
  if (props.indicatorEffect === 'none')
    return false
  return resolvedPercentage.value > 0
})

const indicatorStyle = computed<Record<string, string>>(() => {
  const x = Math.max(0, Math.min(100, resolvedPercentage.value))
  const tx = x <= 0 ? '0%' : x >= 100 ? '-100%' : '-50%'
  return {
    left: `${x}%`,
    transform: `translate3d(${tx}, -50%, 0)`,
  }
})

const displayText = computed(() => {
  if (props.message)
    return props.message
  if (props.format)
    return props.format(resolvedPercentage.value)
  return `${Math.round(resolvedPercentage.value)}%`
})

const tooltipEnabled = computed(() => {
  if (props.tooltip)
    return true
  return !!props.tooltipContent
})

const tooltipContentResolved = computed(() => {
  return props.tooltipContent || displayText.value
})

const tooltipBoundProps = computed(() => {
  return {
    content: tooltipContentResolved.value,
    ...(props.tooltipProps || {}),
  }
})

const showInsideText = computed(() => {
  if (props.textPlacement !== 'inside')
    return false
  if (props.loading || props.indeterminate)
    return !!props.message
  return !!props.message || !!props.showText
})

const showOutsideText = computed(() => {
  if (props.textPlacement !== 'outside')
    return false
  if (props.loading || props.indeterminate)
    return !!props.message
  return !!props.message || !!props.showText
})

const showTopText = computed(() => {
  if (props.textPlacement !== 'top')
    return false
  if (props.loading || props.indeterminate)
    return !!props.message
  return !!props.message || !!props.showText
})

/**
 * `width` is the segment's slice of the filled area (normalized by the segment
 * sum); `share` is its slice of `segmentsTotal`, the number a reader expects
 * when the whole bar stands for 100%. The tip shows the share.
 */
const segmentsResolved = computed(() => {
  const list = (props.segments || []).filter(s => Number.isFinite(s.value) && s.value > 0)
  const sum = Math.max(0.0001, segmentsSum.value)
  const total = Math.max(0.0001, props.segmentsTotal || 100)
  return list.map((s) => {
    const width = (s.value / sum) * 100
    const share = Math.round((s.value / total) * 100)
    return {
      width: `${width}%`,
      color: s.color || fillColor.value,
      label: s.label,
      tip: s.label ? `${s.label} · ${share}%` : `${share}%`,
    }
  })
})

/**
 * The head light sits inside the fill, anchored to its leading edge, so it
 * lights the last stretch of filled bar and nothing else. It used to be a free
 * radial blob positioned beside the track, which bloomed past the tip and above
 * and below the bar; clipped to the fill it reads as light catching the head.
 *
 * Riding inside the fill also means it has no geometry of its own to animate:
 * one `width` transition moves the bar and its light together, where a separate
 * `left` could drift ahead of the tip mid-transition.
 *
 * Segments end in the last segment's colour, which is not the bar's colour, so
 * a segmented bar renders no head light. A gradient `color` gets a white one.
 */
const glowMounted = computed(() => {
  if (props.loading || props.indeterminate)
    return false
  if (hasSegments.value)
    return false
  return true
})

const showGlow = computed(() => glowMounted.value && resolvedPercentage.value > 0 && resolvedPercentage.value < 100)

const completedEmitted = ref(false)
watch(
  () => resolvedPercentage.value,
  (v) => {
    if (props.loading || props.indeterminate)
      return
    if (v >= 100 && !completedEmitted.value) {
      completedEmitted.value = true
      emit('complete')
    }
    if (v < 100)
      completedEmitted.value = false
  },
  // `immediate` so a bar mounted already at 100 (an already-finished task) still emits
  // `complete`; the loading/indeterminate guard above keeps it from firing spuriously.
  { immediate: true },
)
</script>

<!--
  The tooltip-wrapped and plain branches below are two copies of the same
  markup. Every DOM change has to land in both; merging them is out of scope
  for the progress-bar redesign and is tracked in that task's report.
-->
<template>
  <TxTooltip v-if="tooltipEnabled" v-bind="tooltipBoundProps">
    <span class="tx-progress-bar-wrapper" :class="wrapperClassList" :style="styleVars">
      <span v-if="showTopText" class="tx-progress-bar__head">
        <span class="tx-progress-bar__head-label">{{ displayText }}</span>
        <span v-if="detail" class="tx-progress-bar__head-detail">{{ detail }}</span>
      </span>

      <span class="tx-progress-bar__body">
        <span
          class="tx-progress-bar__track"
          role="progressbar"
          :aria-valuenow="loading || indeterminate ? undefined : resolvedPercentage"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-label="ariaLabel || message || 'Progress'"
        >
          <span v-if="showMask" class="tx-progress-bar__mask" aria-hidden="true" />

          <span class="tx-progress-bar" :class="classList" aria-hidden="true">
            <span v-if="hasSegments" class="tx-progress-bar__segments">
              <span
                v-for="(seg, idx) in segmentsResolved"
                :key="idx"
                class="tx-progress-bar__segment"
                :style="{ width: seg.width }"
                :data-tip="seg.tip"
              >
                <span class="tx-progress-bar__segment-fill" :style="{ background: seg.color }" />
              </span>
            </span>

            <span v-if="glowMounted" class="tx-progress-bar__glow" :class="{ 'is-visible': showGlow }" />
          </span>

          <span
            v-if="showIndicator"
            class="tx-progress-bar__indicator"
            :class="[`tx-progress-bar__indicator--${indicatorEffect}`]"
            :style="indicatorStyle"
            aria-hidden="true"
          />

          <span v-if="showInsideText" class="tx-progress-bar__text">
            {{ displayText }}
          </span>
        </span>

      </span>

      <span v-if="showOutsideText" class="tx-progress-bar__outside-text">{{ displayText }}</span>
    </span>
  </TxTooltip>

  <span v-else class="tx-progress-bar-wrapper" :class="wrapperClassList" :style="styleVars">
    <span v-if="showTopText" class="tx-progress-bar__head">
      <span class="tx-progress-bar__head-label">{{ displayText }}</span>
      <span v-if="detail" class="tx-progress-bar__head-detail">{{ detail }}</span>
    </span>

    <span class="tx-progress-bar__body">
      <span
        class="tx-progress-bar__track"
        role="progressbar"
        :aria-valuenow="loading || indeterminate ? undefined : resolvedPercentage"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-label="ariaLabel || message || 'Progress'"
      >
        <span v-if="showMask" class="tx-progress-bar__mask" aria-hidden="true" />

        <span class="tx-progress-bar" :class="classList" aria-hidden="true">
          <span v-if="hasSegments" class="tx-progress-bar__segments">
            <span
              v-for="(seg, idx) in segmentsResolved"
              :key="idx"
              class="tx-progress-bar__segment"
              :style="{ width: seg.width }"
              :data-tip="seg.tip"
            >
              <span class="tx-progress-bar__segment-fill" :style="{ background: seg.color }" />
            </span>
          </span>

          <span v-if="glowMounted" class="tx-progress-bar__glow" :class="{ 'is-visible': showGlow }" />
        </span>

        <span
          v-if="showIndicator"
          class="tx-progress-bar__indicator"
          :class="[`tx-progress-bar__indicator--${indicatorEffect}`]"
          :style="indicatorStyle"
          aria-hidden="true"
        />

        <span v-if="showInsideText" class="tx-progress-bar__text">
          {{ displayText }}
        </span>
      </span>

    </span>

    <span v-if="showOutsideText" class="tx-progress-bar__outside-text">{{ displayText }}</span>
  </span>
</template>

<style lang="scss">
//
// Indeterminate sweeps animate composited properties only (`transform`, plus
// `opacity` on `split`), never `left`/`width`. `translateX` is relative to the
// sweep's own fixed width, so the coefficient is travel/width (40% needs 250%).
//
// `sweep` and `classic` run linear: an eased sweep decelerates into the far end
// and then jumps back to the start, which reads as the bar stalling once per
// loop. Linear travel plus a band that fades to transparent at both edges
// makes the wrap invisible.
@keyframes tx-progress-loading {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

@keyframes tx-progress-classic {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(192.3%);
  }
}

@keyframes tx-progress-bounce {
  0% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(257%);
  }
  100% {
    transform: translateX(0);
  }
}

//
// Elastic used to shoot right, fall back and return to the start on an eased
// curve, which stalled at every turn. Now the travel is linear and seamless
// (the 22% band is fully off-track at both keyframe ends) and only the
// stretch varies: compressed as it enters, drawn out mid-track, compressed
// again as it leaves.
@keyframes tx-progress-elastic {
  0% {
    transform: translateX(-100%) scaleX(0.55);
  }
  50% {
    transform: translateX(177.25%) scaleX(1.35);
  }
  100% {
    transform: translateX(454.5%) scaleX(0.55);
  }
}

@keyframes tx-progress-flow-shimmer {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

@keyframes tx-progress-flow-wave {
  0% {
    transform: translateX(-70%);
  }
  100% {
    transform: translateX(70%);
  }
}

//
// Stardust: the point field tiles horizontally, so sliding one tile width per
// loop is a seamless drift. Each layer's tile is a different width, so their
// loops never line up and the field does not read as a repeat.
@keyframes tx-progress-stardust-far {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 96px 0;
  }
}

@keyframes tx-progress-stardust-near {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 132px 0;
  }
}

@keyframes tx-progress-stardust-twinkle {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@keyframes tx-progress-indicator-burst {
  0% {
    opacity: 0.45;
    transform: translate3d(0, -50%, 0) scale(0.92);
    filter: blur(0px);
  }
  45% {
    opacity: 0.95;
    transform: translate3d(0, -50%, 0) scale(1.06);
    filter: blur(0.2px);
  }
  100% {
    opacity: 0.6;
    transform: translate3d(0, -50%, 0) scale(0.94);
    filter: blur(0px);
  }
}

@keyframes tx-progress-split {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0) scaleX(0.06);
  }
  35% {
    opacity: 0.95;
    transform: translate3d(0, 0, 0) scaleX(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, 0, 0) scaleX(0.06);
  }
}

@keyframes tx-progress-sparkle {
  0% {
    opacity: 0.6;
    transform: translate3d(-50%, -50%, 0) scale(0.92) rotate(0deg);
  }
  50% {
    opacity: 1;
    transform: translate3d(-50%, -50%, 0) scale(1.06) rotate(14deg);
  }
  100% {
    opacity: 0.7;
    transform: translate3d(-50%, -50%, 0) scale(0.94) rotate(0deg);
  }
}

.tx-progress-bar-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
  overflow: visible;
}

.tx-progress-bar-wrapper--text-outside {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tx-progress-bar-wrapper--text-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

// Wraps exactly the track, so the outside text placement (where the wrapper is
// wider than the track by the label and its gap) still has one box that spans
// the bar itself.
.tx-progress-bar__body {
  position: relative;
  display: block;
  width: 100%;
  overflow: visible;
}

.tx-progress-bar-wrapper--text-outside .tx-progress-bar__body {
  flex: 1;
  min-width: 0;
}

.tx-progress-bar__track {
  position: relative;
  display: block;
  width: 100%;
  height: var(--tx-progress-height, 5px);
  border-radius: 999px;
  /*
   * Text tokens are the pair that really inverts between themes (a light grey
   * on light, a lighter dark on dark), so a 10% tint never reads as a hole in
   * the page the way an overlay-colour mask does. Same family as the slider.
   */
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 10%, transparent);
  overflow: hidden;
}

/* The rim is an explicit opt-in; the default `plain` variant draws none. */
.tx-progress-bar-wrapper--mask-solid .tx-progress-bar__track::after,
.tx-progress-bar-wrapper--mask-dashed .tx-progress-bar__track::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 68%, transparent);
  z-index: 2;
}

.tx-progress-bar-wrapper--mask-dashed .tx-progress-bar__track::after {
  border-style: dashed;
}

/* Only rendered when `maskBackground` is not `none`. */
.tx-progress-bar__mask {
  position: absolute;
  display: block;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  border: none;
  pointer-events: none;
  z-index: 0;
}

.tx-progress-bar-wrapper--mask-plain .tx-progress-bar__mask {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 7%, transparent);
}

.tx-progress-bar-wrapper--bg-mask .tx-progress-bar__mask {
  background: var(--tx-bg-color-overlay, #fff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.tx-progress-bar-wrapper--bg-mask .tx-progress-bar__track::after {
  border-color: color-mix(in srgb, var(--tx-border-color, #dcdfe6) 78%, transparent);
}

.tx-progress-bar-wrapper--bg-blur .tx-progress-bar__mask {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 14%, transparent);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
}

.tx-progress-bar-wrapper--bg-blur .tx-progress-bar__track::after {
  border-color: color-mix(in srgb, #ffffff6b 58%, var(--tx-border-color-light, #e4e7ed));
}

.tx-progress-bar-wrapper--bg-glass .tx-progress-bar__mask {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 40%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
}

.tx-progress-bar-wrapper--bg-glass .tx-progress-bar__track::after {
  border-color: color-mix(in srgb, #ffffff9e 62%, var(--tx-border-color-light, #e4e7ed));
}

// Silent comments on purpose: `/* */` in SCSS ships into every CSS bundle and
// `audit:size` has ~200 bytes of headroom on the full-CSS budget.
//
// Known defect, deliberately left in place: the fill is a `background-image`
// now, not a flat colour, so downstream overrides written as `background-color`
// on `.tx-progress-bar` paint *behind* the gradient and only show through where
// it is translucent. core-app's `DownloadTask.vue` does exactly this; those
// callers should set `--tx-progress-fill` or pass `color` instead.
.tx-progress-bar {
  position: absolute;
  display: block;
  left: 0;
  top: 0;
  height: 100%;
  width: var(--tx-progress-width, 0%);
  border-radius: inherit;
  background: var(--tx-progress-fill, var(--tx-progress-color, var(--tx-color-primary, #409eff)));
  transition: width 480ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  overflow: hidden;
  z-index: 1;
}

.tx-progress-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
}

.tx-progress-bar--flow-shimmer::after {
  opacity: 0.65;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 55%, transparent),
    transparent
  );
  animation: tx-progress-flow-shimmer 1.35s linear infinite;
}

.tx-progress-bar--flow-wave::after {
  opacity: 0.48;
  background:
    radial-gradient(
      70% 120% at 0% 50%,
      color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 65%, transparent),
      transparent 55%
    ),
    radial-gradient(
      70% 120% at 100% 50%,
      color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 45%, transparent),
      transparent 55%
    );
  animation: tx-progress-flow-wave 1.55s ease-in-out infinite;
}

//
// Stardust is two point fields in white, not the fill colour: dust catches
// light, it does not glow in its own hue, and white sits on any fill — flat,
// status-tinted or a caller's gradient. Sizes are in px, not %, so a 5px bar
// and a 14px bar get the same grain rather than points that scale with the
// track. Far layer: `::before`, small, slow, steady. Near layer: `::after`,
// larger, faster, twinkling. The two speeds are what gives the field depth.
.tx-progress-bar--flow-stardust::before,
.tx-progress-bar--flow-stardust::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background-repeat: repeat;
  mix-blend-mode: screen;
}

.tx-progress-bar--flow-stardust::before {
  opacity: 0.5;
  background-image:
    radial-gradient(circle at 7px 3px, #ffffff8c 0 0.45px, transparent 0.9px),
    radial-gradient(circle at 23px 1.5px, #ffffff66 0 0.4px, transparent 0.85px),
    radial-gradient(circle at 39px 3.5px, #ffffff80 0 0.45px, transparent 0.9px),
    radial-gradient(circle at 58px 1px, #ffffff59 0 0.4px, transparent 0.85px),
    radial-gradient(circle at 71px 2.5px, #ffffff8c 0 0.45px, transparent 0.9px),
    radial-gradient(circle at 88px 4px, #ffffff66 0 0.4px, transparent 0.85px);
  background-size: 96px 5px;
  background-position: 0 0;
  animation: tx-progress-stardust-far 4.8s linear infinite;
}

.tx-progress-bar--flow-stardust::after {
  opacity: 0.85;
  background-image:
    radial-gradient(circle at 12px 2px, #fff 0 0.7px, #ffffff4c 1.1px, transparent 1.8px),
    radial-gradient(circle at 41px 3.5px, #fff 0 0.6px, #ffffff47 1px, transparent 1.6px),
    radial-gradient(circle at 67px 1.5px, #fff 0 0.75px, #ffffff4c 1.2px, transparent 1.9px),
    radial-gradient(circle at 94px 3px, #fff 0 0.6px, #ffffff42 1px, transparent 1.6px),
    radial-gradient(circle at 118px 2px, #fff 0 0.7px, #ffffff4c 1.1px, transparent 1.8px);
  background-size: 132px 5px;
  background-position: 0 0;
  animation:
    tx-progress-stardust-near 2.6s linear infinite,
    tx-progress-stardust-twinkle 1.7s ease-in-out infinite;
}

//
// Segments: each one owns a hoverable slot; the colour sits on an inner fill
// so the slot can grow taller than the track (`overflow: visible` on the
// segmented track) without the colour smearing across the hairline gap.
// The tip is the segment's `data-tip` drawn in `::after` — no extra node per
// segment, and it shares the hover timeline of the lift.
.tx-progress-bar__segments {
  display: flex;
  height: 100%;
  width: 100%;
  gap: 1px;
}

.tx-progress-bar__segment {
  position: relative;
  display: block;
  height: 100%;
  min-width: 2px;
  transition: filter 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-progress-bar--segmented {
  background: transparent;
}

.tx-progress-bar__segment-fill {
  position: absolute;
  inset: 0;
  display: block;
  border-radius: 2px;
  transform-origin: center;
  transition:
    transform 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    border-radius 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-progress-bar__segment::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 7px);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--tx-bg-color, #fff);
  background: var(--tx-text-color-primary, #303133);
  opacity: 0;
  transform: translate(-50%, 3px);
  pointer-events: none;
  transition:
    opacity 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  z-index: 4;
}

.tx-progress-bar__segment:first-child .tx-progress-bar__segment-fill {
  border-top-left-radius: 999px;
  border-bottom-left-radius: 999px;
}

.tx-progress-bar__segment:last-child .tx-progress-bar__segment-fill {
  border-top-right-radius: 999px;
  border-bottom-right-radius: 999px;
}

.tx-progress-bar--segmented:hover .tx-progress-bar__segment:not(:hover) {
  filter: saturate(0.6) opacity(0.55);
}

.tx-progress-bar__segment:hover .tx-progress-bar__segment-fill {
  border-radius: 999px;
  transform: scaleY(1.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  z-index: 1;
}

.tx-progress-bar__segment:hover::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

// The lift and the tip need room the clipped track would take away.
.tx-progress-bar-wrapper--segmented .tx-progress-bar__track {
  overflow: visible;
}

.tx-progress-bar-wrapper--segmented .tx-progress-bar {
  overflow: visible;
}

.tx-progress-bar--indeterminate {
  width: 100%;
  background: transparent;
}

.tx-progress-bar--indeterminate::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 40%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 72%, transparent),
    transparent
  );
  animation: tx-progress-loading 1.6s infinite linear;
}

.tx-progress-bar--indeterminate-classic::before {
  width: 52%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 92%, transparent) 30%,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 92%, transparent) 70%,
    transparent
  );
  animation: tx-progress-classic 1.6s infinite linear;
}

.tx-progress-bar--indeterminate-bounce::before {
  width: 28%;
  background: radial-gradient(
    60% 120% at 50% 50%,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 78%, transparent),
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 62%, transparent) 45%,
    transparent 75%
  );
  filter: blur(0.2px) saturate(1.25);
  animation: tx-progress-bounce 1.05s infinite ease-in-out;
}

.tx-progress-bar--indeterminate-elastic::before {
  width: 22%;
  transform-origin: center;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 78%, transparent),
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 64%, transparent),
    transparent
  );
  animation: tx-progress-elastic 1.8s infinite linear;
}

.tx-progress-bar--indeterminate-split::before {
  left: 0;
  width: 100%;
  transform-origin: center;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 85%, transparent),
    transparent
  );
  animation: tx-progress-split 1.15s infinite ease-in-out;
}

// Anchored to the fill's leading edge and clipped by it, so the light stops
// exactly where the progress does. `--tx-progress-glow` is the fill's own hue
// (white when `color` is a gradient); washing it most of the way to white is
// what makes the head read as lit rather than merely a lighter stripe.
.tx-progress-bar__glow {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  max-width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, #ffffffa6 65%, var(--tx-progress-glow, var(--tx-progress-color, var(--tx-color-primary, #409eff))))
  );
  opacity: 0;
  pointer-events: none;
  transition: opacity 240ms ease;
  z-index: 2;
}

.tx-progress-bar__glow.is-visible {
  opacity: 1;
}

.tx-progress-bar__head {
  display: flex;
  align-items: baseline;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.tx-progress-bar__head-label {
  font-weight: 500;
  color: var(--tx-progress-accent, var(--tx-progress-color, var(--tx-color-primary, #409eff)));
}

.tx-progress-bar__head-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-progress-bar__head-detail::before {
  content: '•';
  margin: 0 6px;
}

// Known defect, deliberately left in place: at the default 5px height a 12px
// label does not fit inside the track, so `textPlacement: 'inside'` (the
// default) plus `showText` renders as a white smear on a hairline. The fix is a
// different default placement (`top` or `outside`), an API default change and
// out of scope for the redesign.
.tx-progress-bar__text {
  position: absolute;
  display: flex;
  inset: 0;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, #fff 92%, transparent);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.24);
  pointer-events: none;
  user-select: none;
  z-index: 3;
}

/*
 * Known defect, deliberately left in place: the indicator sits inside the
 * track, whose `overflow: hidden` clips this 28×18 box to the track height.
 */
.tx-progress-bar__indicator {
  position: absolute;
  top: 50%;
  width: 28px;
  height: 18px;
  z-index: 2;
  pointer-events: none;
}

.tx-progress-bar__indicator--sparkle {
  background: transparent;
}

.tx-progress-bar__indicator--sparkle::before {
  content: '';
  position: absolute;
  inset: 0;
  transform: translate3d(0, -50%, 0);
  top: 50%;
  border-radius: 999px;
  background:
    radial-gradient(circle at 8% 50%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 80%, transparent) 0 2px, transparent 3px),
    radial-gradient(circle at 24% 30%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 68%, transparent) 0 1.6px, transparent 2.6px),
    radial-gradient(circle at 42% 70%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 62%, transparent) 0 1.4px, transparent 2.4px),
    radial-gradient(circle at 58% 45%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 72%, transparent) 0 1.8px, transparent 2.8px),
    radial-gradient(circle at 74% 62%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 58%, transparent) 0 1.4px, transparent 2.4px),
    radial-gradient(circle at 92% 38%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 76%, transparent) 0 2.2px, transparent 3.2px);
  background-size: 120% 100%;
  animation: tx-progress-indicator-burst 0.85s infinite ease-in-out;
  filter: saturate(1.22);
}

/*
 * Known defect, deliberately left in place: this shadow is painted on the
 * fill, which the track clips, so almost none of it is visible. A gradient
 * `color` makes the color-mix invalid and drops the declaration entirely.
 */
.tx-progress-bar-wrapper--hover-glow:hover .tx-progress-bar {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 35%, transparent),
    0 18px 48px color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 30%, transparent);
}

.tx-progress-bar-wrapper--hover-glow:hover .tx-progress-bar__indicator--sparkle::before {
  filter: saturate(1.35) drop-shadow(0 0 10px color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 45%, transparent));
}

.tx-progress-bar__outside-text {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-regular, #606266);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  /* A still, translucent full track still reads as "busy" without the sweep. */
  .tx-progress-bar--indeterminate::before {
    width: 100%;
    transform: none;
    background: color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 35%, transparent);
    filter: none;
    animation: none;
  }

  .tx-progress-bar--flow-shimmer::after,
  .tx-progress-bar--flow-wave::after,
  .tx-progress-bar--flow-stardust::before,
  .tx-progress-bar--flow-stardust::after,
  .tx-progress-bar__indicator--sparkle::before {
    animation: none;
  }

  .tx-progress-bar__segment,
  .tx-progress-bar__segment-fill,
  .tx-progress-bar__segment::after {
    transition: none;
  }
}
</style>
