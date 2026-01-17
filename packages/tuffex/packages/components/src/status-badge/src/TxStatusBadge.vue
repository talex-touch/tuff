<script setup lang="ts">
import type { StatusBadgeEmits, StatusBadgeProps, StatusTone, ToneMeta } from './types'
/**
 * TxStatusBadge Component
 *
 * A status indicator badge with predefined tones and customizable appearance.
 * Automatically maps status keys to visual tones with appropriate colors and icons.
 *
 * @example
 * ```vue
 * <TxStatusBadge text="Approved" status="success" />
 * <TxStatusBadge text="Pending" statusKey="notDetermined" />
 * <TxStatusBadge text="Custom" status="info" icon="i-carbon-star" />
 * ```
 *
 * @component
 */
import { computed } from 'vue'

defineOptions({
  name: 'TxStatusBadge',
})

const props = withDefaults(defineProps<StatusBadgeProps>(), {
  icon: '',
  status: undefined,
  statusKey: '',
  size: 'md',
})

const emit = defineEmits<StatusBadgeEmits>()

/**
 * Mapping of status tones to their visual properties.
 */
const toneMap: Record<StatusTone, ToneMeta> = {
  success: { color: 'var(--tx-color-success)', icon: 'i-carbon-checkmark-filled' },
  warning: { color: 'var(--tx-color-warning)', icon: 'i-carbon-warning' },
  danger: { color: 'var(--tx-color-danger)', icon: 'i-carbon-close-outline' },
  info: { color: 'var(--tx-color-primary)', icon: 'i-carbon-information' },
  muted: { color: 'var(--tx-text-color-secondary)', icon: 'i-carbon-minimize' },
}

/**
 * Resolves the status tone based on props.
 * Uses explicit status prop if provided, otherwise maps from statusKey.
 */
const resolvedTone = computed<StatusTone>(() => {
  if (props.status)
    return props.status

  switch (props.statusKey) {
    case 'granted':
      return 'success'
    case 'denied':
      return 'danger'
    case 'notDetermined':
      return 'warning'
    case 'unsupported':
      return 'muted'
    default:
      return 'info'
  }
})

/**
 * Gets the tone metadata for the resolved tone.
 */
const toneMeta = computed(() => toneMap[resolvedTone.value])

/**
 * CSS custom properties for dynamic styling.
 */
const styleVars = computed(() => {
  const color = toneMeta.value.color
  return {
    '--tx-status-color': color,
    '--tx-status-bg': `color-mix(in srgb, ${color} 12%, transparent)`,
    '--tx-status-border': `color-mix(in srgb, ${color} 32%, transparent)`,
  }
})

/**
 * Resolves the icon class to use.
 * Uses custom icon if provided, otherwise uses the default for the tone.
 */
const iconClass = computed(() => props.icon || toneMeta.value.icon)

const osIconClass = computed(() => {
  switch (props.os) {
    case 'macos':
      return 'i-carbon-logo-apple'
    case 'windows':
      return 'i-carbon-logo-windows'
    case 'linux':
      return 'i-carbon-logo-tux'
    default:
      return ''
  }
})

/**
 * Handles click events on the badge.
 * @param event - The mouse event
 */
function handleClick(event: MouseEvent): void {
  emit('click', event)
}
</script>

<template>
  <div
    class="tx-status-badge"
    :class="[`tx-status-badge--${size}`]"
    :style="styleVars"
    role="status"
    @click="handleClick"
  >
    <i v-if="osIconClass" :class="osIconClass" class="tx-status-badge__icon" aria-hidden="true" />
    <i
      v-if="!osOnly && iconClass"
      :class="iconClass"
      class="tx-status-badge__icon"
      aria-hidden="true"
    />
    <span class="tx-status-badge__text">{{ text }}</span>
  </div>
</template>

<style lang="scss">
.tx-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-status-color, var(--tx-text-color-primary));
  background: var(--tx-status-bg, color-mix(in srgb, currentColor 12%, transparent));
  border: 1px solid var(--tx-status-border, color-mix(in srgb, currentColor 32%, transparent));
  transition: background-color 0.25s ease;

  &__icon {
    font-size: 14px;
    line-height: 1;
  }

  &__text {
    line-height: 1;
  }

  &--sm {
    padding: 2px 8px;
  }

  &--md {
    padding: 4px 12px;
  }
}
</style>
