<script setup lang="ts">
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
 * ```
 *
 * @component
 */
import { computed, ref, watch } from 'vue'
import { TxTooltip } from '../../tooltip'
import type { ProgressBarProps, ProgressBarEmits } from './types'

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
  percentage: 0,
  segmentsTotal: 100,
  height: '5px',
  showText: false,
  textPlacement: 'inside',
  flowEffect: 'none',
  indicatorEffect: 'none',
  hoverEffect: 'none',
  color: '',
  maskVariant: 'solid',
  maskBackground: 'blur',
  tooltip: false,
})

const emit = defineEmits<ProgressBarEmits>()

const segmentsSum = computed(() => {
  const list = props.segments || []
  return list.reduce((acc, s) => acc + (Number.isFinite(s.value) ? Math.max(0, s.value) : 0), 0)
})

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

const shadowColor = computed(() => {
  const c = String(fillColor.value || '')
  if (c.includes('gradient('))
    return 'transparent'
  return c
})

/**
 * Computed style variables for the progress bar.
 */
const styleVars = computed(() => {
  const vars: Record<string, string> = {
    '--tx-progress-height': props.height,
    '--tx-progress-width': `${resolvedPercentage.value}%`,
    '--tx-progress-color': fillColor.value,
    '--tx-progress-shadow-color': shadowColor.value,
  }
  return vars
})

/**
 * Computed class list for the progress bar.
 */
const classList = computed(() => ({
  'tx-progress-bar--indeterminate': props.loading || props.indeterminate,
  [`tx-progress-bar--indeterminate-${props.indeterminateVariant}`]: props.loading || props.indeterminate,
  [`tx-progress-bar--flow-${props.flowEffect}`]: props.flowEffect !== 'none' && !(props.loading || props.indeterminate),
  [`tx-progress-bar--status-${resolvedStatus.value}`]: !!resolvedStatus.value,
}))

const wrapperClassList = computed(() => ({
  [`tx-progress-bar-wrapper--mask-${props.maskVariant}`]: true,
  [`tx-progress-bar-wrapper--bg-${props.maskBackground}`]: true,
  'tx-progress-bar-wrapper--text-outside': props.textPlacement === 'outside',
  [`tx-progress-bar-wrapper--hover-${props.hoverEffect}`]: props.hoverEffect !== 'none',
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

const segmentsResolved = computed(() => {
  const list = (props.segments || []).filter(s => Number.isFinite(s.value) && s.value > 0)
  const sum = Math.max(0.0001, segmentsSum.value)
  return list.map((s) => {
    const width = (s.value / sum) * 100
    return {
      width: `${width}%`,
      color: s.color || fillColor.value,
      label: s.label,
    }
  })
})

const hasSegments = computed(() => !!props.segments?.length && segmentsSum.value > 0)

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
)

</script>

<template>
  <TxTooltip v-if="tooltipEnabled" v-bind="tooltipBoundProps">
    <span class="tx-progress-bar-wrapper" :class="wrapperClassList" :style="styleVars">
      <span
        class="tx-progress-bar__track"
        role="progressbar"
        :aria-valuenow="loading || indeterminate ? undefined : resolvedPercentage"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-label="message || 'Progress'"
      >
        <span class="tx-progress-bar__mask" aria-hidden="true" />

        <span class="tx-progress-bar" :class="classList" aria-hidden="true">
          <span v-if="hasSegments" class="tx-progress-bar__segments">
            <span
              v-for="(seg, idx) in segmentsResolved"
              :key="idx"
              class="tx-progress-bar__segment"
              :style="{ width: seg.width, background: seg.color }"
            />
          </span>
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

      <span v-if="showOutsideText" class="tx-progress-bar__outside-text">{{ displayText }}</span>
    </span>
  </TxTooltip>

  <span v-else class="tx-progress-bar-wrapper" :class="wrapperClassList" :style="styleVars">
    <span
      class="tx-progress-bar__track"
      role="progressbar"
      :aria-valuenow="loading || indeterminate ? undefined : resolvedPercentage"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-label="message || 'Progress'"
    >
      <span class="tx-progress-bar__mask" aria-hidden="true" />

      <span class="tx-progress-bar" :class="classList" aria-hidden="true">
        <span v-if="hasSegments" class="tx-progress-bar__segments">
          <span
            v-for="(seg, idx) in segmentsResolved"
            :key="idx"
            class="tx-progress-bar__segment"
            :style="{ width: seg.width, background: seg.color }"
          />
        </span>
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

    <span v-if="showOutsideText" class="tx-progress-bar__outside-text">{{ displayText }}</span>
  </span>
</template>

<style lang="scss">
@keyframes tx-progress-loading {
  0% {
    left: -100%;
    width: 0;
  }
  50% {
    width: 50%;
  }
  100% {
    left: 100%;
    width: 100%;
  }
}

@keyframes tx-progress-classic {
  0% {
    left: -100%;
    width: 50%;
  }
  100% {
    left: 100%;
    width: 50%;
  }
}

@keyframes tx-progress-bounce {
  0% {
    left: 0%;
    width: 28%;
  }
  50% {
    left: 72%;
    width: 28%;
  }
  100% {
    left: 0%;
    width: 28%;
  }
}

@keyframes tx-progress-elastic {
  0% {
    left: 0%;
    width: 22%;
    transform: scaleX(1);
  }
  35% {
    left: 78%;
    width: 22%;
    transform: scaleX(1.18);
  }
  60% {
    left: 54%;
    width: 22%;
    transform: scaleX(0.92);
  }
  100% {
    left: 0%;
    width: 22%;
    transform: scaleX(1);
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

@keyframes tx-progress-flow-particles {
  0% {
    transform: translateX(-60%);
    opacity: 0.45;
  }
  50% {
    opacity: 0.72;
  }
  100% {
    transform: translateX(60%);
    opacity: 0.5;
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

.tx-progress-bar__track {
  position: relative;
  display: block;
  flex: 1;
  width: 100%;
  height: var(--tx-progress-height, 5px);
  border-radius: 999px;
  overflow: hidden;
}

.tx-progress-bar__track::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 68%, transparent);
  z-index: 2;
}

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

.tx-progress-bar-wrapper--mask-solid .tx-progress-bar__track::after {
  border-style: solid;
}

.tx-progress-bar-wrapper--mask-dashed .tx-progress-bar__track::after {
  border-style: dashed;
}

.tx-progress-bar-wrapper--mask-plain .tx-progress-bar__track::after {
  border: none;
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
  border-color: color-mix(in srgb, rgba(255, 255, 255, 0.42) 58%, var(--tx-border-color-light, #e4e7ed));
}

.tx-progress-bar-wrapper--bg-glass .tx-progress-bar__mask {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 40%, transparent);
  backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
  -webkit-backdrop-filter: blur(22px) saturate(185%) contrast(1.08);
}

.tx-progress-bar-wrapper--bg-glass .tx-progress-bar__track::after {
  border-color: color-mix(in srgb, rgba(255, 255, 255, 0.62) 62%, var(--tx-border-color-light, #e4e7ed));
}

.tx-progress-bar {
  position: absolute;
  display: block;
  left: 0;
  top: 0;
  height: 100%;
  width: var(--tx-progress-width, 0%);
  border-radius: inherit;
  background: var(--tx-progress-color, var(--tx-color-primary, #409eff));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--tx-progress-shadow-color, var(--tx-color-primary, #409eff)) 22%, transparent);
  transition: width 0.26s ease;
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

.tx-progress-bar--flow-particles::after {
  opacity: 0.6;
  background:
    radial-gradient(circle at 10% 30%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 75%, transparent) 0 2px, transparent 3px),
    radial-gradient(circle at 22% 70%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 58%, transparent) 0 1.6px, transparent 2.6px),
    radial-gradient(circle at 36% 38%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 68%, transparent) 0 1.8px, transparent 2.8px),
    radial-gradient(circle at 52% 62%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 62%, transparent) 0 1.6px, transparent 2.6px),
    radial-gradient(circle at 74% 26%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 72%, transparent) 0 2px, transparent 3px),
    radial-gradient(circle at 88% 74%, color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 52%, transparent) 0 1.4px, transparent 2.4px);
  background-size: 120% 100%;
  animation: tx-progress-flow-particles 1.1s linear infinite;
}

.tx-progress-bar__segments {
  display: flex;
  height: 100%;
  width: 100%;
}

.tx-progress-bar__segment {
  display: block;
  height: 100%;
}

.tx-progress-bar--indeterminate {
  width: 100%;
  background: transparent;
  box-shadow: none;
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
  animation: tx-progress-loading 1.25s infinite ease-in-out;
}

.tx-progress-bar--indeterminate-classic::before {
  width: 52%;
  background: color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 92%, transparent);
  animation: tx-progress-classic 1.25s infinite ease-in-out;
}

.tx-progress-bar--indeterminate-bounce::before {
  width: 26%;
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
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 78%, transparent),
    color-mix(in srgb, var(--tx-progress-color, var(--tx-color-primary, #409eff)) 64%, transparent),
    transparent
  );
  animation: tx-progress-elastic 1.35s infinite cubic-bezier(0.22, 1, 0.36, 1);
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

.tx-progress-bar-wrapper--hover-glow:hover .tx-progress-bar {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tx-progress-shadow-color, var(--tx-color-primary, #409eff)) 35%, transparent),
    0 18px 48px color-mix(in srgb, var(--tx-progress-shadow-color, var(--tx-color-primary, #409eff)) 30%, transparent);
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
</style>
