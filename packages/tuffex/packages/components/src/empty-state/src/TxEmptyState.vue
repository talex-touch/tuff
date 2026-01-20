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

const variantDefaults: Record<EmptyStateVariant, { title: string, description: string, icon?: string }> = {
  'empty': {
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
  'loading': {
    title: 'Loading',
    description: 'Please wait a moment.',
    icon: '',
  },
  'offline': {
    title: 'You are offline',
    description: 'Check your connection and retry.',
    icon: 'i-carbon-cloud-offline',
  },
  'permission': {
    title: 'Access denied',
    description: 'You do not have permission to view this content.',
    icon: 'i-carbon-locked',
  },
  'error': {
    title: 'Something went wrong',
    description: 'Please try again later.',
    icon: 'i-carbon-warning',
  },
  'guide': {
    title: 'Start here',
    description: 'Follow the steps to get started.',
    icon: 'i-carbon-direction-straight-right',
  },
  'custom': {
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
  'guide',
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

          <!-- Loading State (Skeleton Shimmer) -->
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

          <!-- No Selection (Cursor Click Guide) -->
          <svg v-else-if="illustrationVariant === 'no-selection'" viewBox="0 0 64 64" aria-hidden="true">
            <!-- Background List Items -->
            <rect class="tx-empty-state__selection-bg-item" x="12" y="8" width="32" height="4" rx="2" />

            <!-- Target Item (Active) -->
            <g class="tx-empty-state__selection-target">
              <rect class="tx-empty-state__selection-item-bg" x="12" y="18" width="40" height="12" rx="4" />
              <circle class="tx-empty-state__selection-item-icon" cx="20" cy="24" r="3" />
              <rect class="tx-empty-state__selection-item-text" x="26" y="22" width="20" height="4" rx="2" />
            </g>

            <!-- Third Item -->
            <g opacity="0.6">
              <rect class="tx-empty-state__selection-item-bg-muted" x="12" y="36" width="40" height="12" rx="4" />
              <circle class="tx-empty-state__selection-item-icon" cx="20" cy="42" r="3" />
              <rect class="tx-empty-state__selection-item-text" x="26" y="40" width="16" height="4" rx="2" />
            </g>

            <!-- Cursor -->
            <path class="tx-empty-state__selection-cursor" d="M38 42l-2.9-12.7 10.3 5.4-6.3 1.9 4.3 6.4-3.2 2.1-4.2-6.4Z" />
          </svg>

          <!-- Search Empty (Magnifying Glass) -->
          <svg v-else-if="illustrationVariant === 'search-empty'" viewBox="0 0 64 64" aria-hidden="true">
            <g class="tx-empty-state__search-group">
              <circle class="tx-empty-state__search-glass-bg" cx="28" cy="28" r="14" />
              <circle class="tx-empty-state__search-glass-border" cx="28" cy="28" r="14" />
              <line class="tx-empty-state__search-handle" x1="38" y1="38" x2="52" y2="52" />
            </g>
            <g class="tx-empty-state__search-bubble">
              <rect x="30" y="8" width="14" height="18" rx="4" class="tx-empty-state__search-bubble-bg" />
              <text x="37" y="21" font-size="14" font-weight="bold" text-anchor="middle" class="tx-empty-state__search-question">?</text>
            </g>
          </svg>

          <!-- No Data (Flatline) -->
          <svg v-else-if="illustrationVariant === 'no-data'" viewBox="0 0 64 64" aria-hidden="true">
            <line class="tx-empty-state__chart-axis" x1="8" y1="56" x2="56" y2="56" />
            <line class="tx-empty-state__chart-axis" x1="8" y1="16" x2="8" y2="56" />
            <!-- Flatline Animation -->
            <path class="tx-empty-state__chart-line" d="M8 48 Q 20 48 32 48 T 56 48" />
            <!-- Cross marks -->
            <g transform="translate(38, 38)" class="tx-empty-state__chart-marks">
              <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke-width="2" stroke-linecap="round" />
            </g>
            <g transform="translate(26, 26)" class="tx-empty-state__chart-marks">
              <path d="M-2 -2 L2 2 M2 -2 L-2 2" stroke-width="2" stroke-linecap="round" />
            </g>
          </svg>

          <!-- Offline State (Disconnect) -->
          <svg v-else-if="illustrationVariant === 'offline'" viewBox="0 0 64 64" aria-hidden="true">
            <g class="tx-empty-state__offline-cloud">
              <path class="tx-empty-state__offline-wave tx-empty-state__offline-wave--1" d="M20 36c7-7 17-7 24 0" />
              <path class="tx-empty-state__offline-wave tx-empty-state__offline-wave--2" d="M14 30c10-10 26-10 36 0" />
              <path class="tx-empty-state__offline-wave tx-empty-state__offline-wave--3" d="M26 42c4-4 8-4 12 0" />
              <circle class="tx-empty-state__offline-dot" cx="32" cy="48" r="2.5" />
            </g>
            <line class="tx-empty-state__offline-slash" x1="16" y1="52" x2="48" y2="16" />
          </svg>

          <!-- Permission (Locked) -->
          <svg v-else-if="illustrationVariant === 'permission'" viewBox="0 0 64 64" aria-hidden="true">
            <g class="tx-empty-state__lock">
              <path class="tx-empty-state__lock-shackle" d="M24 28v-6a8 8 0 0 1 16 0v6" />
              <rect class="tx-empty-state__lock-body" x="20" y="28" width="24" height="18" rx="4" />
              <circle class="tx-empty-state__lock-keyhole" cx="32" cy="37" r="2.5" />
              <rect class="tx-empty-state__lock-keyhole-line" x="31" y="38" width="2" height="4" />
            </g>
          </svg>

          <!-- Blank Slate (New File) -->
          <svg v-else-if="illustrationVariant === 'blank-slate'" viewBox="0 0 64 64" aria-hidden="true">
            <!-- Document with fold -->
            <path class="tx-empty-state__sheet" d="M18 10h18l12 12v30a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" />
            <path class="tx-empty-state__sheet-corner" d="M36 10v8a4 4 0 0 0 4 4h8" />
            <!-- Floating Plus -->
            <circle class="tx-empty-state__sheet-plus-bg" cx="48" cy="48" r="10" />
            <path class="tx-empty-state__sheet-plus-icon" d="M48 43v10m-5-5h10" />
          </svg>

          <!-- Empty Box (Open/Close) -->
          <svg v-else-if="illustrationVariant === 'empty'" viewBox="0 0 64 64" aria-hidden="true">
            <g transform="translate(0, 4)">
              <rect class="tx-empty-state__box-body" x="18" y="30" width="28" height="16" rx="2" />
              <!-- Lid Back -->
              <path class="tx-empty-state__box-lid-back" d="M18 30h28v-8h-28z" />
              <!-- Lid Front (Animated) -->
              <g class="tx-empty-state__box-lid-wrapper">
                <rect class="tx-empty-state__box-lid" x="18" y="22" width="28" height="8" rx="1" />
              </g>
              <!-- Dust -->
              <circle class="tx-empty-state__box-dust tx-empty-state__box-dust--1" cx="14" cy="46" r="2" />
              <circle class="tx-empty-state__box-dust tx-empty-state__box-dust--2" cx="10" cy="42" r="1.5" />
            </g>
          </svg>

          <!-- Guide State (Directional) -->
          <svg v-else-if="illustrationVariant === 'guide'" viewBox="0 0 64 64" aria-hidden="true">
            <g class="tx-empty-state__guide-wrapper">
              <circle class="tx-empty-state__guide-circle" cx="32" cy="20" r="10" />
              <path class="tx-empty-state__guide-arrow" d="M32 26V14M27 19l5-5 5 5" />
            </g>
            <rect class="tx-empty-state__guide-bar" x="20" y="40" width="24" height="4" rx="2" />
            <rect class="tx-empty-state__guide-progress" x="20" y="40" width="12" height="4" rx="2" />
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
  --tx-empty-state-illus-size: 80px;
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
  position: relative;
}

.tx-empty-state__illustration svg {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  overflow: visible;
}

/* --- Loading State --- */
.tx-empty-state__loading {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 10px;
  align-content: center;
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
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tx-empty-state__loading-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-empty-state__loading-line {
  height: 6px;
  border-radius: 4px;
}

.tx-empty-state__loading-line--wide {
  width: 80%;
}

.tx-empty-state__loading-line--short {
  width: 50%;
}

.tx-empty-state__skeleton-block {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.tx-empty-state__skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  transform: translateX(-100%);
  animation: tx-empty-state-shimmer 1.5s infinite;
}

@keyframes tx-empty-state-shimmer {
  100% { transform: translateX(100%); }
}

/* --- No Selection --- */
.tx-empty-state__selection-bg-item {
  fill: color-mix(in srgb, currentColor 8%, transparent);
  stroke: none;
}

.tx-empty-state__selection-item-bg {
  fill: color-mix(in srgb, currentColor 5%, transparent);
  stroke: none;
}

.tx-empty-state__selection-item-bg-muted {
  fill: color-mix(in srgb, currentColor 5%, transparent);
  stroke: none;
}

.tx-empty-state__selection-item-icon {
  fill: color-mix(in srgb, currentColor 20%, transparent);
  stroke: none;
}

.tx-empty-state__selection-item-text {
  fill: color-mix(in srgb, currentColor 15%, transparent);
  stroke: none;
}

.tx-empty-state__selection-target {
  animation: tx-empty-state-item-highlight 3s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.tx-empty-state__selection-cursor {
  fill: var(--tx-text-color-primary, #1e293b);
  stroke: var(--tx-bg-color, #fff);
  stroke-width: 1.5;
  animation: tx-empty-state-cursor-move 3s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes tx-empty-state-cursor-move {
  0% { transform: translate(15px, 15px); opacity: 0; }
  10% { opacity: 1; }
  30% { transform: translate(0, 0); }
  40% { transform: scale(0.9); }
  50% { transform: scale(1); }
  80% { opacity: 1; }
  100% { transform: translate(15px, 15px); opacity: 0; }
}

@keyframes tx-empty-state-item-highlight {
  0%, 30% { transform: scale(1); opacity: 0.8; }
  40% { transform: scale(0.98); opacity: 1; }
  50% { transform: scale(1); opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0.8; }
}

/* --- Search Empty --- */
.tx-empty-state__search-group {
  animation: tx-empty-state-search-pan 3s ease-in-out infinite;
  transform-origin: bottom center;
  transform-box: fill-box;
}

.tx-empty-state__search-glass-bg {
  fill: transparent;
  stroke: none;
}

.tx-empty-state__search-glass-border {
  stroke: color-mix(in srgb, currentColor 40%, transparent);
}

.tx-empty-state__search-handle {
  stroke: color-mix(in srgb, currentColor 60%, transparent);
  stroke-width: 3;
}

.tx-empty-state__search-bubble {
  animation: tx-empty-state-question-pop 3s ease-in-out infinite;
  transform-origin: bottom center;
  transform-box: fill-box;
}

.tx-empty-state__search-bubble-bg {
  fill: var(--tx-text-color-primary, #333);
  stroke: none;
}

.tx-empty-state__search-question {
  fill: #fff;
  stroke: none;
}

@keyframes tx-empty-state-search-pan {
  0% { transform: translateX(-4px) rotate(0deg); }
  50% { transform: translateX(4px) rotate(8deg); }
  100% { transform: translateX(-4px) rotate(0deg); }
}

@keyframes tx-empty-state-question-pop {
  0%, 60% { opacity: 0; transform: scale(0) translate(-50%, -10px); }
  70% { opacity: 1; transform: scale(1.1) translate(-50%, -10px); }
  80% { transform: scale(1) translate(-50%, -10px); }
  100% { opacity: 1; transform: scale(1) translate(-50%, -10px); }
}

/* --- No Data --- */
.tx-empty-state__chart-axis {
  stroke: color-mix(in srgb, currentColor 30%, transparent);
}

.tx-empty-state__chart-line {
  stroke: currentColor;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  fill: none;
  animation: tx-empty-state-flatline 3s ease-out infinite;
}

.tx-empty-state__chart-marks path {
  stroke: color-mix(in srgb, currentColor 40%, transparent);
}

@keyframes tx-empty-state-flatline {
  0% { stroke-dashoffset: 100; }
  50% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: 0; }
}

/* --- Offline --- */
.tx-empty-state__offline-cloud {
  animation: tx-empty-state-float-cloud 3s ease-in-out infinite;
}

.tx-empty-state__offline-dot {
   fill: currentColor;
   stroke: none;
}

.tx-empty-state__offline-wave {
  opacity: 0.35;
}

.tx-empty-state__offline-slash {
  stroke: var(--tx-color-danger, #ef4444);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: tx-empty-state-slash-draw 3s ease-in-out infinite alternate;
}

@keyframes tx-empty-state-float-cloud {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@keyframes tx-empty-state-slash-draw {
  0% { stroke-dashoffset: 60; opacity: 0; }
  20% { opacity: 1; }
  50% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}

/* --- Permission --- */
.tx-empty-state__lock {
  animation: tx-empty-state-lock-shake 2s ease-in-out infinite;
  transform-origin: top center;
  transform-box: fill-box;
}

.tx-empty-state__lock-body {
  fill: var(--tx-color-danger-light, #fef2f2);
  stroke: var(--tx-color-danger, #ef4444);
}

.tx-empty-state__lock-shackle {
  stroke: var(--tx-color-danger, #ef4444);
}

.tx-empty-state__lock-keyhole {
  fill: var(--tx-color-danger, #ef4444);
  stroke: none;
}

.tx-empty-state__lock-keyhole-line {
  fill: var(--tx-color-danger, #ef4444);
  stroke: none;
}

@keyframes tx-empty-state-lock-shake {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(-8deg); }
  40% { transform: rotate(8deg); }
  60% { transform: rotate(-4deg); }
  80% { transform: rotate(4deg); }
}

/* --- Blank Slate --- */
.tx-empty-state__sheet {
  fill: #fff;
  stroke: color-mix(in srgb, currentColor 30%, transparent);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
  animation: tx-empty-state-paper-fold 3s ease-in-out infinite;
}

.tx-empty-state__sheet-corner {
  fill: color-mix(in srgb, currentColor 10%, transparent);
  stroke: color-mix(in srgb, currentColor 30%, transparent);
}

.tx-empty-state__sheet-plus-bg {
  fill: var(--tx-color-primary, #3b82f6);
  stroke: none;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1));
  animation: tx-empty-state-bounce 2s infinite;
  transform-origin: center;
  transform-box: fill-box;
}

.tx-empty-state__sheet-plus-icon {
  stroke: #fff;
  stroke-width: 2.5;
  animation: tx-empty-state-bounce 2s infinite;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes tx-empty-state-paper-fold {
  0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  50% { clip-path: polygon(0 0, 75% 0, 100% 25%, 100% 100%, 0 100%); }
  100% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
}

@keyframes tx-empty-state-bounce {
  0%, 100% { transform: translateY(-15%); animation-timing-function: cubic-bezier(0.8,0,1,1); }
  50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1); }
}

/* --- Empty Box --- */
.tx-empty-state__box-body {
  fill: color-mix(in srgb, currentColor 15%, transparent);
  stroke: color-mix(in srgb, currentColor 40%, transparent);
}

.tx-empty-state__box-lid-back {
  fill: color-mix(in srgb, currentColor 25%, transparent);
  stroke: color-mix(in srgb, currentColor 40%, transparent);
  transform-origin: bottom center;
  animation: tx-empty-state-box-lid 3s ease-in-out infinite;
  transform-box: fill-box;
}

.tx-empty-state__box-lid {
  fill: transparent;
  stroke: color-mix(in srgb, currentColor 40%, transparent);
  opacity: 0.3;
}

.tx-empty-state__box-dust {
  fill: color-mix(in srgb, currentColor 40%, transparent);
  opacity: 0;
  stroke: none;
  animation: tx-empty-state-dust-float 2s linear infinite;
}

.tx-empty-state__box-dust--2 {
  animation-delay: 0.5s;
}

@keyframes tx-empty-state-box-lid {
  0%, 100% { transform: rotateX(0deg); }
  50% { transform: rotateX(-40deg); }
}

@keyframes tx-empty-state-dust-float {
  0% { transform: translate(0, 0) scale(0); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translate(10px, -10px) scale(1.5); opacity: 0; }
}

/* --- Guide --- */
.tx-empty-state__guide-circle {
  fill: var(--tx-color-primary-light-9, #ecf5ff);
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 0;
}

.tx-empty-state__guide-arrow {
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  animation: tx-empty-state-bounce 2s infinite;
}

.tx-empty-state__guide-bar {
  fill: color-mix(in srgb, currentColor 10%, transparent);
}

.tx-empty-state__guide-progress {
  fill: var(--tx-color-primary-light-5, #b3d8ff);
  animation: tx-empty-state-shimmer 2s infinite;
}

/* --- General --- */
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
</style>
