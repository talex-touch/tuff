<script setup lang="ts">
import type { EmptyStateAction, EmptyStateEmits, EmptyStateProps, EmptyStateSize, EmptyStateVariant } from './types'
import { computed, useSlots } from 'vue'
import { TxButton } from '../../button'
import { TxIcon } from '../../icon'
import { TxSpinner } from '../../spinner'

defineOptions({
  name: 'TxEmptyState',
})

const props = withDefaults(defineProps<EmptyStateProps>(), {
  variant: 'empty',
  layout: 'vertical',
  align: 'center',
  size: 'medium',
  surface: 'plain',
  actionSize: 'small',
  loading: false,
})

const emit = defineEmits<EmptyStateEmits>()
const slots = useSlots()

const variantDefaults: Record<EmptyStateVariant, { title: string; description: string; icon?: string }> = {
  empty: {
    title: 'Nothing here',
    description: 'There is nothing to show yet.',
    icon: 'i-carbon-incomplete',
  },
  'blank-slate': {
    title: 'Start from scratch',
    description: 'Create your first item to get started.',
    icon: '',
  },
  'no-data': {
    title: 'No data',
    description: 'No data available yet.',
    icon: 'i-carbon-data-base',
  },
  'no-selection': {
    title: 'Nothing selected',
    description: 'Select an item to see details.',
    icon: 'i-carbon-view',
  },
  'search-empty': {
    title: 'No results',
    description: 'Try a different keyword or filter.',
    icon: 'i-carbon-search',
  },
  loading: {
    title: 'Loading',
    description: 'Please wait a moment.',
    icon: '',
  },
  offline: {
    title: 'You are offline',
    description: 'Check your connection and retry.',
    icon: 'i-carbon-cloud-offline',
  },
  permission: {
    title: 'Access denied',
    description: 'You do not have permission to view this content.',
    icon: 'i-carbon-locked',
  },
  error: {
    title: 'Something went wrong',
    description: 'Please try again later.',
    icon: 'i-carbon-warning',
  },
  custom: {
    title: '',
    description: '',
    icon: '',
  },
}

const variantInfo = computed(() => variantDefaults[props.variant])
const title = computed(() => (props.title !== undefined ? props.title : variantInfo.value.title))
const description = computed(() => (props.description !== undefined ? props.description : variantInfo.value.description))

const iconValue = computed(() => {
  if (props.icon === null)
    return null
  if (props.icon !== undefined)
    return props.icon
  return variantInfo.value.icon ?? ''
})

const iconName = computed(() => (typeof iconValue.value === 'string' ? iconValue.value : ''))
const iconSource = computed(() => (typeof iconValue.value === 'string' ? null : iconValue.value))

const illustrationVariants = new Set<EmptyStateVariant>([
  'empty',
  'blank-slate',
  'loading',
  'offline',
  'permission',
  'search-empty',
  'no-data',
  'no-selection',
])
const hasIconSlot = computed(() => !!slots.icon)
const hasIconProp = computed(() => {
  if (props.icon === undefined || props.icon === null)
    return false
  if (typeof props.icon === 'string')
    return props.icon.trim().length > 0
  return true
})
const showSpinner = computed(() => props.loading && !hasIconSlot.value && !hasIconProp.value)
const useIllustration = computed(() => !hasIconSlot.value && !hasIconProp.value && !showSpinner.value && illustrationVariants.has(props.variant))
const illustrationVariant = computed(() => (useIllustration.value ? props.variant : ''))

const sizeMap: Record<EmptyStateSize, number> = {
  small: 28,
  medium: 36,
  large: 44,
}

const resolvedIconSize = computed(() => props.iconSize ?? sizeMap[props.size])

const showIcon = computed(() => hasIconSlot.value || showSpinner.value || useIllustration.value || !!iconName.value || !!iconSource.value)
const showTitle = computed(() => !!slots.title || !!title.value)
const showDescription = computed(() => !!slots.description || !!description.value)
const showActions = computed(() => !!slots.actions || !!props.primaryAction || !!props.secondaryAction)

function getActionSize(action?: EmptyStateAction) {
  return action?.size ?? props.actionSize
}
</script>

<template>
  <div
    class="tx-empty-state"
    :class="[
      `tx-empty-state--layout-${layout}`,
      `tx-empty-state--align-${align}`,
      `tx-empty-state--size-${size}`,
      `tx-empty-state--variant-${variant}`,
      { 'tx-empty-state--card': surface === 'card' },
    ]"
  >
    <div v-if="showIcon" class="tx-empty-state__icon">
      <slot name="icon">
        <TxSpinner v-if="showSpinner" :size="resolvedIconSize" />
        <span v-else-if="useIllustration" class="tx-empty-state__illustration" :data-variant="illustrationVariant">
          <div v-if="illustrationVariant === 'loading'" class="tx-empty-state__loading">
            <div class="tx-empty-state__loading-row">
              <div class="tx-empty-state__skeleton-block tx-empty-state__loading-avatar" />
              <div class="tx-empty-state__loading-lines">
                <div class="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--wide" />
                <div class="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--short" />
              </div>
            </div>
            <div class="tx-empty-state__loading-row tx-empty-state__loading-row--muted">
              <div class="tx-empty-state__skeleton-block tx-empty-state__loading-avatar" />
              <div class="tx-empty-state__loading-lines">
                <div class="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--wide" />
                <div class="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--short" />
              </div>
            </div>
          </div>
          <svg v-else-if="illustrationVariant === 'no-selection'" viewBox="0 0 64 64" aria-hidden="true">
            <rect class="tx-empty-state__selection-panel" x="14" y="16" width="36" height="28" rx="7" />
            <rect class="tx-empty-state__selection-header" x="18" y="20" width="14" height="3" rx="1.5" />
            <rect class="tx-empty-state__selection-item tx-empty-state__selection-item--active" x="18" y="24" width="28" height="8" rx="4" />
            <circle class="tx-empty-state__selection-dot" cx="22" cy="28" r="2.2" />
            <rect class="tx-empty-state__selection-line" x="26" y="27" width="12" height="2" rx="1" />
            <rect class="tx-empty-state__selection-item" x="18" y="36" width="28" height="8" rx="4" />
            <circle class="tx-empty-state__selection-dot" cx="22" cy="40" r="2.2" />
            <rect class="tx-empty-state__selection-line" x="26" y="39" width="10" height="2" rx="1" />
            <circle class="tx-empty-state__selection-ripple" cx="32" cy="28" r="4" />
            <path class="tx-empty-state__selection-cursor" d="M38 40l-2-12 10 6-6 2 4 6-3 2-4-6Z" />
          </svg>
          <svg v-else-if="illustrationVariant === 'search-empty'" viewBox="0 0 64 64" aria-hidden="true">
            <g class="tx-empty-state__search-graphic">
              <circle class="tx-empty-state__search-ring" cx="26" cy="28" r="12" />
              <line class="tx-empty-state__search-handle" x1="36" y1="38" x2="50" y2="52" />
            </g>
            <g class="tx-empty-state__search-bubble">
              <circle class="tx-empty-state__search-bubble-bg" cx="40" cy="16" r="6" />
              <path class="tx-empty-state__search-question" d="M38 15c0-2 4-2 4 0 0 1.5-2 2-2 3" />
              <circle class="tx-empty-state__search-dot" cx="40" cy="21" r="1.4" />
            </g>
          </svg>
          <svg v-else-if="illustrationVariant === 'no-data'" viewBox="0 0 64 64" aria-hidden="true">
            <line class="tx-empty-state__chart-axis" x1="12" y1="52" x2="52" y2="52" />
            <line class="tx-empty-state__chart-axis" x1="12" y1="16" x2="12" y2="52" />
            <path class="tx-empty-state__chart-line" d="M12 44 Q 22 44 32 44 T 52 44" />
            <path class="tx-empty-state__chart-cross" d="M36 34l6 6m0-6l-6 6" />
          </svg>
          <svg v-else-if="illustrationVariant === 'offline'" viewBox="0 0 64 64" aria-hidden="true">
            <path class="tx-empty-state__offline-wave tx-empty-state__offline-wave--1" d="M20 36c7-7 17-7 24 0" />
            <path class="tx-empty-state__offline-wave tx-empty-state__offline-wave--2" d="M14 30c10-10 26-10 36 0" />
            <path class="tx-empty-state__offline-wave tx-empty-state__offline-wave--3" d="M26 42c4-4 8-4 12 0" />
            <circle class="tx-empty-state__offline-dot" cx="32" cy="46" r="3" />
            <line class="tx-empty-state__offline-slash" x1="18" y1="48" x2="46" y2="20" />
          </svg>
          <svg v-else-if="illustrationVariant === 'permission'" viewBox="0 0 64 64" aria-hidden="true">
            <g class="tx-empty-state__lock">
              <path class="tx-empty-state__lock-shackle" d="M24 30v-4a8 8 0 0 1 16 0v4" />
              <rect class="tx-empty-state__lock-body" x="22" y="30" width="20" height="16" rx="4" />
              <circle class="tx-empty-state__lock-keyhole" cx="32" cy="38" r="2" />
            </g>
          </svg>
          <svg v-else-if="illustrationVariant === 'blank-slate'" viewBox="0 0 64 64" aria-hidden="true">
            <rect class="tx-empty-state__sheet" x="18" y="12" width="28" height="38" rx="6" />
            <polygon class="tx-empty-state__sheet-corner" points="38,12 46,12 46,20" />
            <circle class="tx-empty-state__sheet-plus" cx="46" cy="20" r="6" />
            <path class="tx-empty-state__sheet-plus-icon" d="M46 16v8m-4-4h8" />
          </svg>
          <svg v-else-if="illustrationVariant === 'empty'" viewBox="0 0 64 64" aria-hidden="true">
            <rect class="tx-empty-state__box-body" x="18" y="30" width="28" height="16" rx="4" />
            <rect class="tx-empty-state__box-lid" x="18" y="24" width="28" height="8" rx="3" />
            <rect class="tx-empty-state__box-lid-line" x="18" y="30" width="28" height="2" rx="1" />
            <circle class="tx-empty-state__box-dust tx-empty-state__box-dust--1" cx="24" cy="22" r="2" />
            <circle class="tx-empty-state__box-dust tx-empty-state__box-dust--2" cx="40" cy="20" r="1.6" />
          </svg>
        </span>
        <TxIcon v-else-if="iconSource" :icon="iconSource" :size="resolvedIconSize" />
        <TxIcon v-else-if="iconName" :name="iconName" :size="resolvedIconSize" />
      </slot>
    </div>

    <div class="tx-empty-state__content">
      <div v-if="showTitle" class="tx-empty-state__title">
        <slot name="title">
          {{ title }}
        </slot>
      </div>
      <div v-if="showDescription" class="tx-empty-state__description">
        <slot name="description">
          {{ description }}
        </slot>
      </div>

      <div v-if="showActions" class="tx-empty-state__actions">
        <slot name="actions">
          <TxButton
            v-if="secondaryAction"
            :variant="secondaryAction.variant"
            :type="secondaryAction.type"
            :size="getActionSize(secondaryAction)"
            :disabled="secondaryAction.disabled"
            :icon="secondaryAction.icon"
            @click="emit('secondary')"
          >
            {{ secondaryAction.label }}
          </TxButton>
          <TxButton
            v-if="primaryAction"
            :variant="primaryAction.variant"
            :type="primaryAction.type"
            :size="getActionSize(primaryAction)"
            :disabled="primaryAction.disabled"
            :icon="primaryAction.icon"
            @click="emit('primary')"
          >
            {{ primaryAction.label }}
          </TxButton>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-empty-state {
  width: 100%;
  display: flex;
  gap: var(--tx-empty-state-gap, 14px);
  padding: var(--tx-empty-state-padding, 20px);
  color: var(--tx-text-color-secondary, #909399);
  box-sizing: border-box;
}

.tx-empty-state--layout-vertical {
  flex-direction: column;
}

.tx-empty-state--layout-horizontal {
  flex-direction: row;
}

.tx-empty-state--align-start {
  align-items: flex-start;
  text-align: left;
}

.tx-empty-state--align-center {
  align-items: center;
  text-align: center;
}

.tx-empty-state--align-end {
  align-items: flex-end;
  text-align: right;
}

.tx-empty-state--size-small {
  --tx-empty-state-gap: 10px;
  --tx-empty-state-padding: 16px;
  --tx-empty-state-title-size: 14px;
  --tx-empty-state-desc-size: 12px;
  --tx-empty-state-illus-size: 52px;
}

.tx-empty-state--size-medium {
  --tx-empty-state-gap: 14px;
  --tx-empty-state-padding: 20px;
  --tx-empty-state-title-size: 15px;
  --tx-empty-state-desc-size: 13px;
  --tx-empty-state-illus-size: 64px;
}

.tx-empty-state--size-large {
  --tx-empty-state-gap: 18px;
  --tx-empty-state-padding: 26px;
  --tx-empty-state-title-size: 18px;
  --tx-empty-state-desc-size: 14px;
  --tx-empty-state-illus-size: 78px;
}

.tx-empty-state--card {
  border-radius: 16px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-fill-color-lighter, #fafafa);
}

.tx-empty-state__icon {
  color: var(--tx-text-color-secondary, #909399);
  line-height: 1;
}

.tx-empty-state__illustration {
  width: var(--tx-empty-state-illus-size, 64px);
  height: var(--tx-empty-state-illus-size, 64px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-empty-state__illustration[data-variant='search-empty'],
.tx-empty-state__illustration[data-variant='no-data'],
.tx-empty-state__illustration[data-variant='no-selection'],
.tx-empty-state__illustration[data-variant='empty'],
.tx-empty-state__illustration[data-variant='blank-slate'] {
  animation: tx-empty-state-float-soft 3.4s ease-in-out infinite;
}

.tx-empty-state__illustration[data-variant='loading'] {
  align-items: stretch;
}

.tx-empty-state__illustration svg {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tx-empty-state__offline-dot {
  fill: currentColor;
}

.tx-empty-state__offline-slash {
  stroke-width: 3;
  opacity: 0.8;
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: tx-empty-state-slash 2.6s ease-in-out infinite;
}

.tx-empty-state__offline-wave {
  opacity: 0.35;
  animation: tx-empty-state-wave 1.8s ease-in-out infinite;
}

.tx-empty-state__offline-wave--2 {
  animation-delay: 0.4s;
}

.tx-empty-state__offline-wave--3 {
  animation-delay: 0.7s;
}

.tx-empty-state__loading {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 10px;
}

.tx-empty-state__loading-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tx-empty-state__loading-row--muted {
  opacity: 0.6;
}

.tx-empty-state__loading-avatar {
  width: 26px;
  height: 26px;
  border-radius: 999px;
}

.tx-empty-state__loading-lines {
  flex: 1;
  display: grid;
  gap: 6px;
}

.tx-empty-state__loading-line {
  height: 6px;
  border-radius: 999px;
}

.tx-empty-state__loading-line--wide {
  width: 100%;
}

.tx-empty-state__loading-line--short {
  width: 70%;
}

.tx-empty-state__skeleton-block {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 16%, transparent);
}

.tx-empty-state__skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
  transform: translateX(-100%);
  animation: tx-empty-state-shimmer 1.6s ease-in-out infinite;
}

.tx-empty-state__search-graphic {
  animation: tx-empty-state-search-pan 3.2s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.tx-empty-state__search-bubble {
  animation: tx-empty-state-question 3.2s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

.tx-empty-state__search-bubble-bg {
  fill: color-mix(in srgb, currentColor 12%, transparent);
  stroke: currentColor;
  stroke-width: 2;
}

.tx-empty-state__search-question {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tx-empty-state__search-dot {
  fill: currentColor;
  stroke: none;
}

.tx-empty-state__chart-axis {
  opacity: 0.35;
}

.tx-empty-state__chart-line {
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-dasharray: 80;
  stroke-dashoffset: 80;
  animation: tx-empty-state-flatline 3s ease-out infinite;
}

.tx-empty-state__chart-cross {
  opacity: 0.55;
}

.tx-empty-state__selection-panel {
  fill: var(--tx-fill-color-blank, #fff);
  stroke: color-mix(in srgb, currentColor 30%, transparent);
  stroke-width: 2;
  opacity: 0.85;
}

.tx-empty-state__selection-header {
  fill: color-mix(in srgb, currentColor 22%, transparent);
  opacity: 0.7;
}

.tx-empty-state__selection-item {
  fill: color-mix(in srgb, currentColor 16%, transparent);
  stroke: none;
  opacity: 0.8;
}

.tx-empty-state__selection-item--active {
  animation: tx-empty-state-item-highlight 3s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

.tx-empty-state__selection-dot,
.tx-empty-state__selection-line {
  fill: color-mix(in srgb, currentColor 45%, transparent);
  opacity: 0.6;
}

.tx-empty-state__selection-cursor {
  fill: color-mix(in srgb, var(--tx-text-color-primary, #1f2937) 85%, transparent);
  stroke: var(--tx-bg-color, #fff);
  stroke-width: 2.5;
  animation: tx-empty-state-cursor-move 3s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.tx-empty-state__selection-ripple {
  fill: color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 2;
  opacity: 0;
  animation: tx-empty-state-ripple 3s ease-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.tx-empty-state__lock {
  animation: tx-empty-state-lock-shake 2.4s ease-in-out infinite;
  transform-origin: top center;
  transform-box: fill-box;
}

.tx-empty-state__lock-body {
  fill: color-mix(in srgb, currentColor 16%, transparent);
  stroke: currentColor;
  stroke-width: 2.5;
}

.tx-empty-state__lock-shackle {
  stroke: currentColor;
  stroke-width: 3;
  fill: none;
}

.tx-empty-state__lock-keyhole {
  fill: currentColor;
  stroke: none;
}

.tx-empty-state__sheet {
  fill: var(--tx-fill-color-blank, #fff);
  stroke: color-mix(in srgb, currentColor 35%, transparent);
  stroke-width: 2;
}

.tx-empty-state__sheet-corner {
  fill: color-mix(in srgb, currentColor 12%, transparent);
  stroke: color-mix(in srgb, currentColor 35%, transparent);
  stroke-width: 2;
}

.tx-empty-state__sheet-plus {
  fill: var(--tx-color-primary, #409eff);
  animation: tx-empty-state-plus 2.4s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.tx-empty-state__sheet-plus-icon {
  stroke: #fff;
  stroke-width: 2.4;
}

.tx-empty-state__box-body {
  fill: color-mix(in srgb, currentColor 14%, transparent);
  stroke: color-mix(in srgb, currentColor 45%, transparent);
  stroke-width: 2;
}

.tx-empty-state__box-lid {
  fill: color-mix(in srgb, currentColor 18%, transparent);
  stroke: color-mix(in srgb, currentColor 45%, transparent);
  stroke-width: 2;
  animation: tx-empty-state-box-lid 3.2s ease-in-out infinite;
  transform-origin: center 100%;
  transform-box: fill-box;
}

.tx-empty-state__box-lid-line {
  fill: color-mix(in srgb, currentColor 30%, transparent);
  opacity: 0.5;
}

.tx-empty-state__box-dust {
  fill: color-mix(in srgb, currentColor 40%, transparent);
  opacity: 0;
  animation: tx-empty-state-dust 2.6s linear infinite;
}

.tx-empty-state__box-dust--2 {
  animation-delay: 0.6s;
}

.tx-empty-state--variant-permission .tx-empty-state__illustration {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-empty-state--variant-permission .tx-empty-state__title {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-empty-state--variant-permission .tx-empty-state__description {
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 70%, var(--tx-text-color-secondary, #909399));
}

.tx-empty-state__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-empty-state__title {
  font-size: var(--tx-empty-state-title-size, 15px);
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.tx-empty-state__description {
  font-size: var(--tx-empty-state-desc-size, 13px);
  color: var(--tx-text-color-secondary, #909399);
  line-height: 1.5;
}

.tx-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.tx-empty-state--align-start .tx-empty-state__actions {
  justify-content: flex-start;
}

.tx-empty-state--align-center .tx-empty-state__actions {
  justify-content: center;
}

.tx-empty-state--align-end .tx-empty-state__actions {
  justify-content: flex-end;
}

@keyframes tx-empty-state-wave {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes tx-empty-state-float-soft {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

@keyframes tx-empty-state-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

@keyframes tx-empty-state-flatline {
  0% {
    stroke-dashoffset: 80;
    opacity: 0.4;
  }
  40% {
    opacity: 0.9;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0.9;
  }
}

@keyframes tx-empty-state-slash {
  0% {
    stroke-dashoffset: 60;
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}

@keyframes tx-empty-state-search-pan {
  0% {
    transform: translateX(-6px) rotate(-6deg);
  }
  50% {
    transform: translateX(6px) rotate(6deg);
  }
  100% {
    transform: translateX(-6px) rotate(-6deg);
  }
}

@keyframes tx-empty-state-question {
  0%,
  60% {
    opacity: 0;
    transform: scale(0) translate(-50%, -60%);
  }
  70% {
    opacity: 1;
    transform: scale(1.1) translate(-50%, -60%);
  }
  80% {
    transform: scale(1) translate(-50%, -60%);
  }
  100% {
    opacity: 1;
    transform: scale(1) translate(-50%, -60%);
  }
}

@keyframes tx-empty-state-cursor-move {
  0% {
    transform: translate(10px, 10px) scale(0.9);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  32% {
    transform: translate(0, 0) scale(1);
  }
  42% {
    transform: translate(0, 0) scale(0.92);
  }
  52% {
    transform: translate(0, 0) scale(1);
  }
  85% {
    opacity: 1;
  }
  100% {
    transform: translate(10px, 10px) scale(0.9);
    opacity: 0;
  }
}

@keyframes tx-empty-state-item-highlight {
  0%,
  30% {
    fill: color-mix(in srgb, currentColor 16%, transparent);
    transform: scale(1);
  }
  45% {
    transform: scale(0.98);
  }
  55% {
    fill: color-mix(in srgb, currentColor 28%, transparent);
    transform: scale(1);
  }
  90% {
    fill: color-mix(in srgb, currentColor 20%, transparent);
  }
}

@keyframes tx-empty-state-ripple {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  40% {
    opacity: 0.45;
    transform: scale(1);
  }
  70% {
    opacity: 0;
    transform: scale(1.3);
  }
  100% {
    opacity: 0;
    transform: scale(1.3);
  }
}

@keyframes tx-empty-state-lock-shake {
  0%,
  100% {
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(-8deg);
  }
  40% {
    transform: rotate(8deg);
  }
  60% {
    transform: rotate(-4deg);
  }
  80% {
    transform: rotate(4deg);
  }
}

@keyframes tx-empty-state-plus {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.08);
  }
}

@keyframes tx-empty-state-box-lid {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(-18deg);
  }
}

@keyframes tx-empty-state-dust {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.6);
  }
  40% {
    opacity: 0.7;
  }
  100% {
    opacity: 0;
    transform: translate(10px, -12px) scale(1.2);
  }
}
</style>
