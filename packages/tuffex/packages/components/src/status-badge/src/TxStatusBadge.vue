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
import { computed, getCurrentInstance } from 'vue'

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
 *
 * The default icons are one outline "circle + glyph" family with a shared stroke weight so
 * every tone carries the same visual mass. A filled success disc next to outlined warning /
 * danger circles reads as "selected vs inactive", a hierarchy the badge does not have.
 * (`i-carbon-warning-filled` is a triangle, so an all-filled family would scatter too.)
 */
const toneMap: Record<StatusTone, ToneMeta> = {
  success: { color: 'var(--tx-color-success)', icon: 'i-carbon-checkmark-outline' },
  warning: { color: 'var(--tx-color-warning)', icon: 'i-carbon-warning' },
  danger: { color: 'var(--tx-color-danger)', icon: 'i-carbon-close-outline' },
  info: { color: 'var(--tx-color-primary)', icon: 'i-carbon-information' },
  muted: { color: 'var(--tx-text-color-secondary)', icon: 'i-carbon-circle-dash' },
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
      return 'i-simple-icons-apple'
    case 'windows':
      return 'i-simple-icons-windows'
    case 'linux':
      return 'i-simple-icons-linux'
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

// A status badge is a passive live region by default; it only becomes an
// interactive button when a click listener is attached, at which point it must be
// keyboard-reachable. `click` is a declared emit, so the listener is read from the
// component vnode rather than $attrs.
const instance = getCurrentInstance()
const interactive = computed(() => !!instance?.vnode.props?.onClick)

function handleKeydown(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget)
    return
  if (!interactive.value)
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  handleClick(event as unknown as MouseEvent)
}
</script>

<template>
  <div
    class="tx-status-badge"
    :class="[`tx-status-badge--${size}`]"
    :style="styleVars"
    :role="interactive ? 'button' : 'status'"
    :tabindex="interactive ? 0 : undefined"
    @click="handleClick"
    @keydown="handleKeydown"
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
/*
 * A pill at TxBadge weight. The 8px radius + visible border + 600 weight it used to carry
 * was indistinguishable from a quiet TxButton; the 999px cap and 500 weight put it back
 * in the badge family. The 12% fill / 32% border recipe is shared with TxBadge / TxTag /
 * TxAlert and must not drift here — dark-mode muddiness is a token problem (see the
 * `.dark` block in style/variables.scss), not a recipe problem.
 */
.tx-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-status-color, var(--tx-text-color-primary));
  background: var(--tx-status-bg, color-mix(in srgb, currentColor 12%, transparent));
  border: 1px solid var(--tx-status-border, color-mix(in srgb, currentColor 32%, transparent));
  transition: background-color 0.25s ease;

  /*
   * Keyed off the role rather than a class: `interactive` is derived from
   * whether the host attached a click listener, and that is exactly what
   * already switches the role between `button` and `status`. A badge that is
   * only reporting state keeps the default cursor.
   */
  &[role='button'] {
    cursor: pointer;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tx-status-color, var(--tx-color-primary)) 60%, transparent);
    outline-offset: 2px;
  }

  /*
   * Sized with the text rather than a fixed 14px: hosts that scale icon utilities
   * (nexus runs presetIcons at 1.2) otherwise render the glyph a third larger than
   * the 12px label and it fills the whole badge height while the text floats.
   */
  &__icon {
    font-size: 1em;
    line-height: 1;
  }

  &__text {
    line-height: 1;
  }

  &--sm {
    padding: 2px 8px;
  }

  // Horizontal padding stays >= 10px so the pill's round end caps clear the icon.
  &--md {
    padding: 3px 10px;
  }
}
</style>
