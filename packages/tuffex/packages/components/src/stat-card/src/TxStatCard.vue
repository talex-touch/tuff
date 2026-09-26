<script setup lang="ts">
import type { StatCardProps } from './types.ts'
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { onThemeChange } from './theme-change'

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

// A grey icon has no hue to pull out. Mixed into the aura it reads as a smudge
// of fog next to the number, so the card stays untinted and draws no aura.
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
  // A tinted card inks the glyph with a mix of this very colour, so the read
  // lifts that ink first; otherwise every re-read (a theme switch) would mix
  // the mix again and walk the whole card towards the text colour.
  cardRef.value.classList.add('tx-stat-card--reading')
  const iconColor = getComputedStyle(iconRef.value).color
  cardRef.value.classList.remove('tx-stat-card--reading')
  // Empty only while the card is off the document (a KeepAlive cache has no
  // computed style): keep the last read, `onActivated` reads again on return.
  if (!iconColor)
    return
  // Grey gets no aura, but the ring still draws in the icon's own colour:
  // dropping it there left a grey icon inside a primary ring.
  const neutral = isNeutralColor(iconColor)
  if (neutral && !isProgressVariant.value) {
    resetGlowVars()
    return
  }
  cardRef.value.style.setProperty('--tx-stat-card-icon-color', iconColor)
  glowTinted.value = !neutral
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

let stopThemeWatch: (() => void) | null = null

onMounted(() => {
  updateGlowVars()
  triggerGlow()
  // The colour is stored resolved, so a theme switch that re-points the icon's
  // token (success, warning and danger differ between light and dark) has to
  // be read again, or the aura and the ring keep the old theme's hue.
  stopThemeWatch = onThemeChange(updateGlowVars)
})

onBeforeUnmount(() => {
  stopThemeWatch?.()
  stopThemeWatch = null
})

// A theme switch made while KeepAlive held the card had nothing to read.
onActivated(updateGlowVars)

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
    <div v-if="iconClass" class="tx-stat-card__aura" aria-hidden="true">
      <span class="tx-stat-card__aura-blob is-a" />
      <span class="tx-stat-card__aura-blob is-b" />
      <span class="tx-stat-card__aura-blob is-c" />
    </div>

    <div v-if="iconClass && !isProgressVariant" class="tx-stat-card__glyph" aria-hidden="true">
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
  // The query container for the two `@container` blocks below: the glyph and
  // the ring move by the card's own width, since four cards abreast are narrow
  // on any screen. The queries read the content box, so 240px there is a 274px
  // card at this padding and border. The width has to come from the parent (a
  // grid cell, a stretched flex item); a shrink-to-fit parent collapses an
  // inline-size container.
  container-type: inline-size;

  --fake-color: var(--tx-bg-color, #fff);
  --fake-opacity: 0.7;
  // `updateGlowVars` overwrites this with the icon's computed colour, for a
  // tinted icon (and in the progress layout for a grey one too); the aura and
  // the progress ring are mixed from it here so any colour syntax the browser
  // reports (`rgb()`, `color(srgb …)`, `oklch()`) works unparsed.
  --tx-stat-card-icon-color: var(--tx-color-primary, #409eff);
  // One slot on the right, shared by the glyph and the progress ring so the
  // two variants read as one family.
  --tx-stat-card-slot: 72px;
  --tx-stat-card-slot-inset: 18px;

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
   The hover is not motion: the edge firms up at once (colour never eases) and
   nothing on the card lifts, sweeps or glows. */
.tx-stat-card:hover {
  --fake-opacity: 0.75;
  border-color: var(--tx-border-color, #dcdfe6);
}

.tx-stat-card__content {
  position: relative;
  z-index: 1;
}

// The glyph and the ring are part of the reading, not a watermark under it, so
// the column stops 8px short of the slot: slot + inset + 8px, less the 16px the
// card's own padding already covers. A narrow card moves the slot into the
// corner instead (see the end of this block), and keeps its full width.
@container (width >= 240px) {
  :is(.tx-stat-card__glyph, .tx-stat-card__progress) ~ .tx-stat-card__content {
    padding-right: calc(var(--tx-stat-card-slot) + var(--tx-stat-card-slot-inset) - 8px);
  }
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

// The shared slot, right-aligned and centred on the card's height. Both sit
// under the content: the global `.fake-background > *` rule would otherwise
// lift every child of the card to `relative; z-index: 1`. What sits inside is
// sized in em off each one's font-size, so the narrow layout changes one number.
.tx-stat-card__glyph,
.tx-stat-card__progress {
  position: absolute;
  z-index: 0;
  top: 50%;
  right: var(--tx-stat-card-slot-inset);
  width: var(--tx-stat-card-slot);
  height: var(--tx-stat-card-slot);
  transform: translateY(-50%);
}

.tx-stat-card__progress {
  // The ring follows the icon, like the aura: a colour class on `iconClass`
  // tints the arc, its track and the disc. It used to draw primary whatever the
  // icon said, and painted the icon primary over its own colour class.
  --tx-stat-card-progress-color: var(--tx-stat-card-icon-color);
  --tx-stat-card-progress-track: color-mix(in srgb, var(--tx-stat-card-progress-color) 22%, transparent);

  font-size: 28px;
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
  // 10px in the full 72px slot. A percentage, like the ring's mask, so the gap
  // between disc and ring stays in proportion when the slot shrinks.
  inset: 13.9%;
  border-radius: 999px;
  // A tint of the ring colour over whatever the card sits on. An `@supports`
  // override used to mix it into `rgba(0, 0, 0, 0.45)` instead, which reads as a
  // lens on the dark theme and as a grey blot inside the ring on the light one.
  background: color-mix(in srgb, var(--tx-stat-card-progress-color) 16%, transparent);
  display: grid;
  place-items: center;
  // Default ink for an icon without a colour class. It sits on the parent, never
  // on the `<i>`, so a colour class on `iconClass` still wins.
  color: var(--tx-color-primary, #409eff);
}

.tx-stat-card__progress-icon {
  font-size: 0.786em; // 22px
}

/* The glyph: the whole icon, bare in the slot, with no tile, ring or shadow.
   The default ink sits here rather than on the `<i>`, so a colour class on
   `iconClass` still wins and an icon without one is primary. */
.tx-stat-card__glyph {
  display: grid;
  place-items: center;
  color: var(--tx-color-primary, #409eff);
  font-size: 30px;
}

// The component owns the glyph's size: this selector outranks a host utility
// such as `text-6xl`. As a grid item the `<i>` takes the width and height its
// icon rule sets.
.tx-stat-card__icon {
  font-size: 1em;
}

// Over its own aura the icon's colour sits on its own hue and all but
// vanishes, so a tinted card inks it part-way to the text colour, while the
// aura is pulled the other way, towards the page: the glyph is always the one
// that stands out — deeper than a pale light-theme aura, lighter than a deep
// dark-theme one. This also outranks a colour class on the `<i>` — the class
// still picks the hue, through the colour read back into
// `--tx-stat-card-icon-color`, which is read with this rule lifted
// (`--reading`).
.tx-stat-card--tinted:not(.tx-stat-card--reading) .tx-stat-card__icon {
  color: color-mix(in oklab, var(--tx-stat-card-icon-color) 55%, var(--tx-text-color-primary, #303133));
}

// The aura: the icon's colour drawn out across the right of the card, under the
// glyph or the ring. Three blurred blobs (the icon's hue, a neighbour turned
// round the OKLCH wheel, and the pure hue as the field's core) drift on periods
// that never line up, so together they read as one field slowly changing
// shape. The two large ones are mixed towards the page colour, so the field is
// deep on the dark theme and pale on the light one instead of a glare the
// glyph gets lost in, and all three are kept faint: it is a wash behind the
// figure, not a second subject beside it. The mask fades it out well before
// the text.
.tx-stat-card__aura {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to left, #000 10%, transparent 62%);
  mask-image: linear-gradient(to left, #000 10%, transparent 62%);
  opacity: 0;
  transition: opacity 0.8s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

// It fades in on mount once the card is tinted: `--glow-in` is a state change,
// never a hover.
.tx-stat-card--tinted.tx-stat-card--glow-in .tx-stat-card__aura {
  opacity: 1;
}

// A little grain over the field: fractal noise tiled at 140px and overlaid at
// 14%, so the blurred wash reads as a surface rather than a smooth digital
// gradient. It lives inside the aura, so the aura's mask and fade apply to it,
// and it is static — one raster, nothing for reduced motion to stop.
.tx-stat-card__aura::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 140px 140px;
  opacity: 0.14;
  mix-blend-mode: overlay;
  pointer-events: none;
}

// A grey icon has no hue to pull out, so an untinted card draws no blobs and
// runs no animation. The blobs go rather than the layer: the tint and
// `--glow-in` land before the same frame is styled, and a layer coming out of
// `display: none` has no opacity for the fade to start from.
.tx-stat-card:not(.tx-stat-card--tinted) .tx-stat-card__aura-blob {
  display: none;
}

// Only `transform` animates: moving a blurred layer is a compositor job, while
// animating its radius, size or blur would redraw the blur every frame.
.tx-stat-card__aura-blob {
  position: absolute;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(34px);
  will-change: transform;
}

// The icon's own colour, the largest, over the top-right corner.
.tx-stat-card__aura-blob.is-a {
  top: -40%;
  right: -20%;
  width: 66%;
  background: color-mix(in srgb, color-mix(in oklab, var(--tx-stat-card-icon-color) 55%, var(--tx-bg-color, #fff)) 24%, transparent);
  animation: tx-stat-card-aura-a 17s ease-in-out -6s infinite alternate;
}

// Its neighbour: the same mix with the hue turned 42°, rising from below the
// bottom edge.
.tx-stat-card__aura-blob.is-b {
  right: 16%;
  bottom: -52%;
  width: 50%;
  background: oklch(from color-mix(in oklab, var(--tx-stat-card-icon-color) 55%, var(--tx-bg-color, #fff)) l c calc(h + 42) / 20%);
  animation: tx-stat-card-aura-b 21s ease-in-out -13s infinite alternate;
}

// The pure hue, thin, as the field's core — in the top-right corner rather
// than behind the glyph, where it would swallow it.
.tx-stat-card__aura-blob.is-c {
  top: -26%;
  right: -8%;
  width: 30%;
  background: color-mix(in srgb, var(--tx-stat-card-icon-color) 12%, transparent);
  animation: tx-stat-card-aura-c 13s ease-in-out -4s infinite alternate;
}

// Without relative colour the neighbouring hue has nothing to turn, and the
// declaration above computes to no background at all: a weaker pool of the
// same page-mixed colour stands in.
@supports not (color: oklch(from red l c h)) {
  .tx-stat-card__aura-blob.is-b {
    background: color-mix(in srgb, color-mix(in oklab, var(--tx-stat-card-icon-color) 55%, var(--tx-bg-color, #fff)) 17%, transparent);
  }
}

// Each drift starts from the blob's resting place, which is therefore also the
// still frame under reduced motion. Rotating ahead of the translate swings the
// blob round that place instead of spinning it on the spot, and the uneven
// scale stretches it as it turns.
@keyframes tx-stat-card-aura-a {
  to {
    transform: rotate(40deg) translate(-14%, 12%) scale(1.18, 0.92);
  }
}

@keyframes tx-stat-card-aura-b {
  to {
    transform: rotate(-50deg) translate(16%, -10%) scale(0.9, 1.12);
  }
}

@keyframes tx-stat-card-aura-c {
  to {
    transform: rotate(60deg) translate(-18%, -14%) scale(1.2, 0.94);
  }
}

// Under 240px of content width there is no room beside the figures (four
// abreast in CoreApp's plugin storage tab, five in a dashboard row): the slot
// shrinks to 36px in the empty top-right corner and the column keeps its full
// width. The default layout keeps its figures at the bottom, so only a
// top-aligned label (insight, progress) makes room for it. The aura is laid
// out in percentages of the card and needs no change.
@container (width < 240px) {
  .tx-stat-card__glyph,
  .tx-stat-card__progress {
    --tx-stat-card-slot: 36px;
    top: 12px;
    right: 12px;
    transform: none;
    font-size: 18px;
  }

  :is(.tx-stat-card__glyph, .tx-stat-card__progress) ~ .tx-stat-card__content .tx-stat-card__label--top {
    padding-right: 44px;
  }
}

// Nothing drifts and nothing fades: the blobs keep their resting composition,
// fully drawn, the aura appears at once and the arc jumps to its value. The
// blob stops repeat the animated selectors, which outrank a bare
// `.tx-stat-card__aura-blob`.
@media (prefers-reduced-motion: reduce) {
  .tx-stat-card__aura,
  .tx-stat-card__progress-ring {
    transition: none;
  }

  .tx-stat-card__aura-blob.is-a,
  .tx-stat-card__aura-blob.is-b,
  .tx-stat-card__aura-blob.is-c {
    animation: none;
  }
}
</style>
