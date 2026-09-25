<script setup lang="ts">
import type { StatCardProps } from './types.ts'
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'

defineOptions({
  name: 'TxStatCard',
})

const props = withDefaults(defineProps<StatCardProps>(), {
  iconClass: '',
  clickable: false,
  variant: 'default',
})

// Name the role="group" from its own visible label so each card is
// distinguishable and localizable, rather than every card announcing the same
// hardcoded "Stat card". Both label nodes (top/bottom) are mutually exclusive,
// so they can share this id — exactly one is ever in the DOM.
const labelId = useId()

const isProgressVariant = computed(() => {
  if (props.variant === 'progress')
    return true
  return typeof props.progress === 'number'
})

const numericValue = computed(() => {
  if (typeof props.value === 'number')
    return props.value
  if (typeof props.value === 'string') {
    const n = Number(props.value)
    return Number.isFinite(n) ? n : null
  }
  return null
})

const cardRef = ref<HTMLElement | null>(null)
const iconRef = ref<HTMLElement | null>(null)
const glowReady = ref(false)

const hasInsight = computed(() => {
  if (isProgressVariant.value)
    return false
  if (!props.insight)
    return false
  return Number.isFinite(props.insight.from) && Number.isFinite(props.insight.to)
})

const progressValue = computed(() => {
  if (!isProgressVariant.value)
    return null
  if (typeof props.progress === 'number')
    return props.progress
  if (numericValue.value != null && numericValue.value <= 100)
    return numericValue.value
  return null
})

const progressPercent = computed(() => {
  if (progressValue.value == null)
    return null
  const normalized = Math.max(0, Math.min(100, progressValue.value))
  return normalized
})

const insightValue = computed(() => {
  if (!hasInsight.value || !props.insight)
    return null
  const { from, to, type = 'percent', precision } = props.insight
  const delta = to - from
  let raw = type === 'delta' ? delta : (from === 0 ? 0 : (delta / from) * 100)
  if (!Number.isFinite(raw))
    raw = 0
  const digits = precision ?? (type === 'percent' ? 1 : 0)
  if (Number.isFinite(digits))
    raw = Number(raw.toFixed(Math.max(0, digits)))
  return raw
})

const insightPrefix = computed(() => {
  if (!hasInsight.value || insightValue.value == null)
    return ''
  return insightValue.value > 0 ? '+' : ''
})

const insightSuffix = computed(() => {
  if (!hasInsight.value)
    return ''
  if (props.insight?.suffix != null)
    return props.insight.suffix
  return props.insight?.type === 'delta' ? '' : '%'
})

const resolveInsightColor = (color?: string) => {
  if (!color)
    return null
  const map: Record<string, string> = {
    success: 'var(--tx-color-success, #67c23a)',
    danger: 'var(--tx-color-danger, #f56c6c)',
    warning: 'var(--tx-color-warning, #e6a23c)',
    info: 'var(--tx-color-info, #909399)',
  }
  return map[color] ?? color
}

const insightColor = computed(() => {
  if (!hasInsight.value)
    return null
  const override = resolveInsightColor(props.insight?.color)
  if (override)
    return override
  return resolveInsightColor((insightValue.value ?? 0) >= 0 ? 'success' : 'danger')
})

// The default trend glyph is drawn inline: an icon class would only render if
// the host's utility engine happened to scan this file, and when it did not the
// pill kept an empty 14px slot in front of the number.
const customInsightIconClass = computed(() => (hasInsight.value ? props.insight?.iconClass ?? '' : ''))
const insightTrendDown = computed(() => (insightValue.value ?? 0) < 0)

const glowTinted = ref(false)

// Channels of a computed colour, 0–255. Chromium reports `rgb()` for plain
// colours and `color(srgb …)` for mixed ones; anything else is left tinted.
function parseChannels(color: string): [number, number, number] | null {
  const rgb = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb)
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const srgb = color.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i)
  if (srgb)
    return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255]
  return null
}

// A grey icon has no hue to glow with. Mixed into the glow it reads as a smudge
// of fog behind the number, which is what an untinted `iconClass` produced.
function isNeutralColor(color: string) {
  const channels = parseChannels(color)
  if (!channels)
    return false
  return Math.max(...channels) - Math.min(...channels) < 24
}

const resetGlowVars = () => {
  glowTinted.value = false
  cardRef.value?.style.removeProperty('--tx-stat-card-icon-color')
}

const updateGlowVars = () => {
  if (!cardRef.value || !iconRef.value || !props.iconClass)
    return
  const iconColor = getComputedStyle(iconRef.value).color
  if (!iconColor || isNeutralColor(iconColor)) {
    resetGlowVars()
    return
  }
  cardRef.value.style.setProperty('--tx-stat-card-icon-color', iconColor)
  glowTinted.value = true
}

const triggerGlow = () => {
  if (!props.iconClass)
    return
  glowReady.value = false
  requestAnimationFrame(() => {
    glowReady.value = true
  })
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 20,
  }).format(value)
}

const displayText = computed(() => {
  return typeof props.value === 'number' ? formatNumber(props.value) : String(props.value)
})

const insightDisplayText = computed(() => {
  if (insightValue.value == null)
    return ''
  return formatNumber(insightValue.value)
})

onMounted(() => {
  updateGlowVars()
  triggerGlow()
})

watch(
  () => props.iconClass,
  async (v) => {
    if (!v) {
      glowReady.value = false
      resetGlowVars()
      return
    }
    await nextTick()
    updateGlowVars()
    triggerGlow()
  },
)

watch(
  () => props.variant,
  async () => {
    if (!props.iconClass)
      return
    await nextTick()
    updateGlowVars()
    triggerGlow()
  },
)
</script>

<template>
  <div
    ref="cardRef"
    class="tx-stat-card fake-background"
    :class="{
      'tx-stat-card--clickable': clickable,
      'tx-stat-card--glow-in': glowReady,
      'tx-stat-card--tinted': glowTinted,
      'tx-stat-card--insight': hasInsight,
      'tx-stat-card--progress': isProgressVariant,
    }"
    role="group"
    :aria-label="ariaLabel || undefined"
    :aria-labelledby="ariaLabel ? undefined : labelId"
  >
    <div v-if="iconClass && !isProgressVariant" class="tx-stat-card__decoration" aria-hidden="true">
      <span class="tx-stat-card__glow" />
    </div>

    <div v-if="iconClass && !isProgressVariant" class="tx-stat-card__icon-layer" aria-hidden="true">
      <i ref="iconRef" class="tx-stat-card__icon" :class="iconClass" />
    </div>

    <div
      v-if="isProgressVariant"
      class="tx-stat-card__progress"
      :style="{ '--tx-stat-card-progress': progressPercent != null ? `${progressPercent}%` : '0%' }"
      aria-hidden="true"
    >
      <span class="tx-stat-card__progress-ring" />
      <span class="tx-stat-card__progress-inner">
        <i v-if="iconClass" ref="iconRef" class="tx-stat-card__progress-icon" :class="iconClass" />
      </span>
    </div>

    <div class="tx-stat-card__content">
      <div v-if="hasInsight || isProgressVariant" :id="labelId" class="tx-stat-card__label tx-stat-card__label--top">
        <slot name="label">
          {{ label }}
        </slot>
      </div>

      <div class="tx-stat-card__value">
        <slot name="value">
          <span>{{ displayText }}</span>
        </slot>
      </div>

      <div v-if="!hasInsight && !isProgressVariant" :id="labelId" class="tx-stat-card__label">
        <slot name="label">
          {{ label }}
        </slot>
      </div>

      <div v-else-if="hasInsight" class="tx-stat-card__insight" :style="{ color: insightColor || undefined }">
        <i v-if="customInsightIconClass" class="tx-stat-card__insight-icon" :class="customInsightIconClass" aria-hidden="true" />
        <svg v-else class="tx-stat-card__insight-icon tx-stat-card__insight-icon--trend" viewBox="0 0 16 16" aria-hidden="true">
          <path v-if="insightTrendDown" d="M4.5 4.5l7 7M11.5 6v5.5H6" />
          <path v-else d="M4.5 11.5l7-7M6 4.5h5.5V10" />
        </svg>
        <span class="tx-stat-card__insight-text">
          <span v-if="insightPrefix" class="tx-stat-card__insight-prefix">{{ insightPrefix }}</span>
          <span v-if="insightValue != null" class="tx-stat-card__insight-value">{{ insightDisplayText }}</span>
          <span v-if="insightSuffix" class="tx-stat-card__insight-suffix">{{ insightSuffix }}</span>
        </span>
      </div>
      <div v-else-if="isProgressVariant && ($slots.meta || meta)" class="tx-stat-card__meta">
        <slot name="meta">
          {{ meta }}
        </slot>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Inherited: the value is bound on `.tx-stat-card__progress` and read by its
// child ring. Registered with `inherits: false`, the ring only ever saw the
// 0% initial value, so the progress arc was never drawn.
@property --tx-stat-card-progress {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 0%;
}

.tx-stat-card {
  position: relative;
  width: 100%;
  min-height: 112px;
  padding: 16px;
  border-radius: 16px;
  box-sizing: border-box;
  overflow: hidden;

  --fake-color: var(--tx-bg-color, #fff);
  --fake-opacity: 0.7;
  // `updateGlowVars` overwrites this with the icon's computed colour, and only
  // for a tinted icon; the glow is mixed from it here so any colour syntax the
  // browser reports (`rgb()`, `color(srgb …)`, `oklch()`) works unparsed.
  --tx-stat-card-icon-color: var(--tx-color-primary, #409eff);
  --tx-stat-card-glow-color: color-mix(in srgb, var(--tx-stat-card-icon-color) 34%, transparent);
  --tx-stat-card-glow-color-soft: color-mix(in srgb, var(--tx-stat-card-icon-color) 12%, transparent);
  --tx-stat-card-icon-opacity: 0.16;
  --tx-stat-card-icon-opacity-hover: 0.26;

  background: transparent;
  border: 1px solid var(--tx-border-color-lighter, #eee);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
}

.tx-stat-card--insight {
  justify-content: flex-start;
}

.tx-stat-card--progress {
  justify-content: flex-start;
}

.tx-stat-card--insight .tx-stat-card__content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tx-stat-card--progress .tx-stat-card__content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tx-stat-card--insight .tx-stat-card__value {
  margin-top: 8px;
}

.tx-stat-card--progress .tx-stat-card__value {
  margin-top: 8px;
}

.tx-stat-card--insight .tx-stat-card__insight {
  margin-top: auto;
  // The content column stretches its children; the pill must hug its text.
  align-self: flex-start;
}

.tx-stat-card--progress .tx-stat-card__meta {
  margin-top: auto;
}

.tx-stat-card--clickable {
  cursor: pointer;
}

/* Only clickable cards signal interactivity: the pointer cursor lives on
   .tx-stat-card--clickable, not the generic hover, so a static card doesn't imply a click.
   The hover itself is quiet: the edge firms up at once (colour never eases),
   the corner icon drifts in toward the figures and the glow behind it warms. */
.tx-stat-card:hover {
  --fake-opacity: 0.75;
  border-color: var(--tx-border-color, #dcdfe6);
}

.tx-stat-card:hover .tx-stat-card__icon {
  opacity: var(--tx-stat-card-icon-opacity-hover);
  transform: translate(-4px, -4px);
}

.tx-stat-card--tinted.tx-stat-card--glow-in:hover .tx-stat-card__glow {
  opacity: 0.85;
}

.tx-stat-card__content {
  position: relative;
  z-index: 1;
}

.tx-stat-card__value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-primary, #303133);
}

.tx-stat-card__label {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.2;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-stat-card__label--top {
  margin-top: 0;
  margin-bottom: 6px;
}

.tx-stat-card__meta {
  font-size: 12px;
  line-height: 1.2;
  color: var(--tx-text-color-secondary, #909399);
}

/* One pill, one figure: sign, number and unit sit flush (`+16.7%`); a gap
   between them read as three separate tokens. The tint is the insight colour
   itself, so the pill follows success / danger / a custom colour for free. */
.tx-stat-card__insight {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-color-success, #67c23a);
}

.tx-stat-card__insight-icon {
  flex: none;
  width: 12px;
  height: 12px;
  font-size: 12px;
}

.tx-stat-card__insight-icon--trend {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

// Inline text, not a flex row: as flex items the spans would each drop leading
// white space, so a caller's `suffix: ' pts'` lost the space it asked for.
.tx-stat-card__insight-text {
  white-space: nowrap;
}

.tx-stat-card__progress {
  position: absolute;
  right: 18px;
  top: 50%;
  width: 72px;
  height: 72px;
  transform: translateY(-50%);
  --tx-stat-card-progress-color: var(--tx-color-primary, #409eff);
  --tx-stat-card-progress-track: rgba(64, 158, 255, 0.24);
}

@supports (color: color-mix(in srgb, #000 50%, transparent)) {
  .tx-stat-card__progress {
    --tx-stat-card-progress-track: color-mix(in srgb, var(--tx-stat-card-progress-color) 22%, transparent);
  }
}

.tx-stat-card__progress-ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background:
    conic-gradient(
      var(--tx-stat-card-progress-color) 0 var(--tx-stat-card-progress),
      var(--tx-stat-card-progress-track) var(--tx-stat-card-progress) 100%
    );
  -webkit-mask: radial-gradient(circle, transparent 56%, #000 58%);
  mask: radial-gradient(circle, transparent 56%, #000 58%);
  transition: --tx-stat-card-progress 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.tx-stat-card__progress-inner {
  position: absolute;
  inset: 10px;
  border-radius: 999px;
  // A tint of the ring colour over whatever the card sits on. An `@supports`
  // override used to mix it into `rgba(0, 0, 0, 0.45)` instead, which reads as a
  // lens on the dark theme and as a grey blot inside the ring on the light one.
  background: color-mix(in srgb, var(--tx-stat-card-progress-color) 16%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tx-stat-card__progress-icon {
  font-size: 22px;
  color: var(--tx-stat-card-progress-color);
}

/* The decorative icon is the card's one flourish: set large, cropped by the
   bottom-right corner and kept faint, so it reads as a watermark behind the
   figures rather than a second, competing glyph. Its size is the component's —
   the selector outranks a host utility such as `text-6xl` — while a colour
   class on `iconClass` still tints it; an untinted icon inherits the layer's
   secondary ink. */
.tx-stat-card__icon-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-stat-card__icon {
  position: absolute;
  right: -12px;
  bottom: -16px;
  font-size: 88px;
  line-height: 1;
  opacity: var(--tx-stat-card-icon-opacity);
  transition:
    transform 0.35s cubic-bezier(0.33, 1, 0.68, 1),
    opacity 0.35s ease;
}

.tx-stat-card__decoration {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

/* A soft pool of the icon's own colour under the corner. Only a tinted icon
   gets one (`tx-stat-card--tinted`): grey has no hue to glow with. */
.tx-stat-card__glow {
  position: absolute;
  right: -56px;
  bottom: -72px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background:
    radial-gradient(
      closest-side,
      var(--tx-stat-card-glow-color) 0%,
      var(--tx-stat-card-glow-color-soft) 50%,
      transparent 100%
    );
  opacity: 0;
  transition: opacity 0.6s ease;
}

.tx-stat-card--tinted.tx-stat-card--glow-in .tx-stat-card__glow {
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .tx-stat-card__icon,
  .tx-stat-card__glow,
  .tx-stat-card__progress-ring {
    transition: none;
  }

  .tx-stat-card:hover .tx-stat-card__icon {
    transform: none;
  }
}
</style>
