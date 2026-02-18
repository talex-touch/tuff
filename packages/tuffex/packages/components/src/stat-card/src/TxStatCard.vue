<script setup lang="ts">
import type { StatCardProps } from './types.ts'
import NumberFlow from '@number-flow/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({
  name: 'TxStatCard',
})

const props = withDefaults(defineProps<StatCardProps>(), {
  iconClass: '',
  clickable: false,
  variant: 'default',
})

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

const displayNumber = ref(0)
let mountTimer: number | null = null

const displayString = ref<string | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const iconRef = ref<HTMLElement | null>(null)
const glowReady = ref(false)
const insightDisplayNumber = ref(0)

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

const insightIconClass = computed(() => {
  if (!hasInsight.value)
    return ''
  if (props.insight?.iconClass)
    return props.insight.iconClass
  return (insightValue.value ?? 0) >= 0 ? 'i-carbon-growth' : 'i-carbon-arrow-down'
})

const buildGlowColor = (color: string, alpha: number) => {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match)
    return null
  const [, r, g, b] = match
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const resetGlowVars = () => {
  if (!cardRef.value)
    return
  cardRef.value.style.removeProperty('--tx-stat-card-icon-color')
  cardRef.value.style.removeProperty('--tx-stat-card-glow-color')
  cardRef.value.style.removeProperty('--tx-stat-card-glow-color-soft')
}

const updateGlowVars = () => {
  if (!cardRef.value || !iconRef.value || !props.iconClass)
    return
  const iconColor = getComputedStyle(iconRef.value).color
  if (!iconColor)
    return
  cardRef.value.style.setProperty('--tx-stat-card-icon-color', iconColor)
  const glowColor = buildGlowColor(iconColor, 0.42)
  const glowSoftColor = buildGlowColor(iconColor, 0.18)
  if (glowColor)
    cardRef.value.style.setProperty('--tx-stat-card-glow-color', glowColor)
  if (glowSoftColor)
    cardRef.value.style.setProperty('--tx-stat-card-glow-color-soft', glowSoftColor)
}

const triggerGlow = () => {
  if (!props.iconClass)
    return
  glowReady.value = false
  requestAnimationFrame(() => {
    glowReady.value = true
  })
}

const displayText = computed(() => {
  return typeof props.value === 'number' ? props.value.toLocaleString() : String(props.value)
})

onMounted(() => {
  const delay = Math.floor(Math.random() * 500 + 100)
  mountTimer = setTimeout(() => {
    if (numericValue.value != null)
      displayNumber.value = numericValue.value as number
    else
      displayString.value = displayText.value
    if (insightValue.value != null)
      insightDisplayNumber.value = insightValue.value
    mountTimer = null
  }, delay) as unknown as number

  updateGlowVars()
  triggerGlow()
})

onBeforeUnmount(() => {
  if (mountTimer != null)
    clearTimeout(mountTimer)
  mountTimer = null
})

watch(numericValue, (v) => {
  if (v == null)
    return
  displayNumber.value = v
})

watch(insightValue, (v) => {
  if (v == null) {
    insightDisplayNumber.value = 0
    return
  }
  if (mountTimer != null)
    return
  insightDisplayNumber.value = v
})

watch(
  () => props.value,
  (v) => {
    if (numericValue.value != null) {
      displayString.value = null
      return
    }
    displayString.value = String(v)
  },
)

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
      'tx-stat-card--insight': hasInsight,
      'tx-stat-card--progress': isProgressVariant,
    }"
    role="group"
    aria-label="Stat card"
  >
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
      <div v-if="hasInsight || isProgressVariant" class="tx-stat-card__label tx-stat-card__label--top">
        <slot name="label">
          {{ label }}
        </slot>
      </div>

      <div class="tx-stat-card__value">
        <slot name="value">
          <NumberFlow v-if="numericValue != null" :value="displayNumber" />
          <span v-else>{{ displayString ?? displayText }}</span>
        </slot>
      </div>

      <div v-if="!hasInsight && !isProgressVariant" class="tx-stat-card__label">
        <slot name="label">
          {{ label }}
        </slot>
      </div>

      <div v-else-if="hasInsight" class="tx-stat-card__insight" :style="{ color: insightColor || undefined }">
        <i class="tx-stat-card__insight-icon" :class="insightIconClass" aria-hidden="true" />
        <span v-if="insightPrefix" class="tx-stat-card__insight-prefix">{{ insightPrefix }}</span>
        <NumberFlow v-if="insightValue != null" :value="insightDisplayNumber" />
        <span v-if="insightSuffix" class="tx-stat-card__insight-suffix">{{ insightSuffix }}</span>
      </div>
      <div v-else-if="isProgressVariant && ($slots.meta || meta)" class="tx-stat-card__meta">
        <slot name="meta">
          {{ meta }}
        </slot>
      </div>
    </div>

    <div v-if="iconClass && !isProgressVariant" class="tx-stat-card__decoration" aria-hidden="true">
      <span class="tx-stat-card__glow" />
      <i
        class="tx-stat-card__decoration-icon"
        :class="iconClass"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@property --tx-stat-card-progress {
  syntax: '<percentage>';
  inherits: false;
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
  --tx-stat-card-icon-color: var(--tx-text-color-primary, #303133);
  --tx-stat-card-glow-color: rgba(64, 158, 255, 0.42);
  --tx-stat-card-glow-color-soft: rgba(64, 158, 255, 0.18);

  background: transparent;
  border: 1px solid var(--tx-border-color-lighter, #eee);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;

  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;
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
}

.tx-stat-card--progress .tx-stat-card__meta {
  margin-top: auto;
}

.tx-stat-card--clickable {
  cursor: pointer;
}

.tx-stat-card:hover {
  cursor: pointer;
  --fake-opacity: 0.75;
  border-color: var(--tx-border-color, #dcdfe6);
}

.tx-stat-card:hover .tx-stat-card__decoration {
  transform: scale(2.05);
  filter: blur(28px) brightness(160%) saturate(220%);
}

.tx-stat-card:hover .tx-stat-card__glow {
  transform: translateY(-50%) scale(1.2);
  opacity: 0.75;
  filter: blur(30px) saturate(220%);
}

.tx-stat-card:hover .tx-stat-card__icon-layer {
  transform: scale(1.25) rotate(10deg) translate(-10%, -10%);
}

.tx-stat-card__content {
  position: relative;
  z-index: 1;
}

.tx-stat-card__value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
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

.tx-stat-card__insight {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--tx-color-success, #67c23a);
}

.tx-stat-card__insight-icon {
  font-size: 14px;
}

.tx-stat-card__insight-prefix,
.tx-stat-card__insight-suffix {
  opacity: 0.9;
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
  background: rgba(64, 158, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

@supports (color: color-mix(in srgb, #000 50%, transparent)) {
  .tx-stat-card__progress-inner {
    background: color-mix(in srgb, var(--tx-stat-card-progress-color) 12%, rgba(0, 0, 0, 0.45));
  }
}

.tx-stat-card__progress-icon {
  font-size: 22px;
  color: var(--tx-stat-card-progress-color);
}

.tx-stat-card__icon-layer {
  position: absolute;
  inset: 0;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transition: transform 0.35s cubic-bezier(0.33, 1, 0.68, 1);
}

.tx-stat-card__icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.tx-stat-card__decoration {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  transform: scale(1.8);
  filter: blur(22px) brightness(140%) saturate(200%);
  transition: transform 0.35s cubic-bezier(0.33, 1, 0.68, 1), filter 0.35s cubic-bezier(0.33, 1, 0.68, 1);
}

.tx-stat-card__glow {
  position: absolute;
  right: -12px;
  top: 50%;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  transform: translateY(-50%) scale(0.72);
  background:
    radial-gradient(
      closest-side,
      var(--tx-stat-card-glow-color) 0%,
      var(--tx-stat-card-glow-color-soft) 45%,
      transparent 72%
    );
  opacity: 0;
  filter: blur(18px) saturate(160%);
  transition:
    transform 0.65s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.65s ease,
    filter 0.65s ease;
}

.tx-stat-card--glow-in .tx-stat-card__glow {
  transform: translateY(-50%) scale(1.05);
  opacity: 0.62;
  filter: blur(26px) saturate(200%);
}

.tx-stat-card__decoration-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 64px;
  line-height: 1;
  opacity: 0.18;
  color: var(--tx-stat-card-icon-color, var(--tx-text-color-secondary, #909399));
  filter: blur(1px) saturate(160%);
}
</style>
