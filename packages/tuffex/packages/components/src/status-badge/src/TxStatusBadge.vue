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

/** Whether the pill opens with a glyph — that side then takes the concentric padding, see the style block. */
const hasIcon = computed(() => Boolean(osIconClass.value || (!props.osOnly && iconClass.value)))

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
    :class="[`tx-status-badge--${size}`, { 'has-icon': hasIcon }]"
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
// A pill at TxBadge weight. The 8px radius + visible border + 600 weight it used to carry
// was indistinguishable from a quiet TxButton; the 999px cap and 500 weight put it back
// in the badge family. The 12% fill / 32% border recipe is shared with TxBadge / TxTag /
// TxAlert and must not drift here — dark-mode muddiness is a token problem (see the
// `.dark` block in style/variables.scss), not a recipe problem.
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

  // Keyed off the role rather than a class: `interactive` is derived from
  // whether the host attached a click listener, and that is exactly what
  // already switches the role between `button` and `status`. A badge that is
  // only reporting state keeps the default cursor.
  &[role='button'] {
    cursor: pointer;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tx-status-color, var(--tx-color-primary)) 60%, transparent);
    outline-offset: 2px;
  }

  // Sized with the text rather than a fixed 14px, and boxed at exactly one em:
  // icon presets draw the glyph in a 1.2× box (nexus runs presetIcons at 1.2),
  // which put a 14.4px circle beside 12px letters — a third taller than the
  // capitals, 3px off the top and bottom edges while the text sat 4px in, and the
  // first thing the eye landed on. At one em the glyph's circle is about a fifth
  // over cap height, where an inline icon reads as part of the word rather than a
  // badge on the badge. The `[class]` hook outranks the preset's own box at any
  // stylesheet order.
  &__icon {
    flex: none;
    font-size: 1em;
    line-height: 1;

    &[class] {
      width: 1em;
      height: 1em;
    }
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

  // A pill that opens with a glyph puts the glyph concentric with its round end
  // cap: the cap is a circle of radius height/2 centred height/2 in from the
  // edge, so a leading padding equal to the vertical padding puts the one-em
  // icon's centre exactly on that circle's centre and the gap between glyph and
  // edge is the same all the way round — the left and the top read as one
  // distance. The text side then matches it rather than keeping the 10px of a
  // text-only pill: letters get two more px than the glyph, because their
  // square corners meet the cap's curve where a circle's do not.
  &--sm.has-icon {
    padding-left: 2px;
    padding-right: 4px;
  }

  &--md.has-icon {
    padding-left: 3px;
    padding-right: 5px;
  }
}
</style>
