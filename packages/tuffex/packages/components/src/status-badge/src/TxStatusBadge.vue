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
import TxOsIcon from '../../icon/src/TxOsIcon.vue'

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
 * Each glyph sits inside a lightweight translucent circular halo (12% semantic
 * tint) rather than a heavy solid disc; `muted` renders as an empty dashed ring
 * with no glyph, reading as absence rather than an active state.
 */
const toneMap: Record<StatusTone, ToneMeta> = {
  success: { color: 'var(--tx-color-success)', icon: 'i-carbon-checkmark' },
  warning: { color: 'var(--tx-color-warning)', icon: 'i-carbon-time' },
  danger: { color: 'var(--tx-color-danger)', icon: 'i-carbon-close' },
  info: { color: 'var(--tx-color-primary)', icon: 'i-carbon-information' },
  muted: { color: 'var(--tx-text-color-secondary)', icon: '' },
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
 *
 * `--tx-status-color` tints the label, pill fill, and subtle translucent chip;
 * `--tx-status-glyph` mixes the hue toward primary ink so the icon inside the
 * soft translucent chip clears WCAG 3:1 non-text contrast across all four themes
 * without a heavy solid filled disc:
 *   light:   success 3.28, warning 3.23, danger 3.82, info 3.72, muted 3.96
 *   dark:    success 7.17, warning 7.28, danger 6.15, info 6.22, muted 6.58
 *   hcLight: success 7.17, warning 6.27, danger 6.94, info 6.43, muted 8.61
 *   hcDark:  success 9.58, warning 9.37, danger 8.82, info 8.81, muted 9.54
 */
const styleVars = computed(() => {
  const color = toneMeta.value.color
  return {
    '--tx-status-color': color,
    '--tx-status-bg': `color-mix(in srgb, ${color} 12%, transparent)`,
    '--tx-status-chip-bg': `color-mix(in srgb, ${color} 12%, transparent)`,
    '--tx-status-glyph': `color-mix(in srgb, ${color} 65%, var(--tx-text-color-primary, #303133))`,
  }
})

/**
 * Resolves the icon class to use.
 * Uses custom icon if provided, otherwise uses the default for the tone.
 */
const iconClass = computed(() => props.icon || toneMeta.value.icon)

/**
 * `muted` has no glyph, so its disc renders as a dashed outline. A custom
 * `icon` opts back into the filled disc — the host asked for a symbol.
 */
const hollow = computed(() => resolvedTone.value === 'muted' && !props.icon)

/**
 * The platform mark is TxOsIcon's own glyph, not a `simple-icons` class, so it
 * draws in hosts that ship no such collection.
 */
const showOsIcon = computed(() => props.os === 'macos' || props.os === 'windows' || props.os === 'linux')

/** Whether the pill opens with a disc — that side then takes the tighter padding. */
const hasChip = computed(() => !props.osOnly && (Boolean(iconClass.value) || hollow.value))
const hasIcon = computed(() => showOsIcon.value || hasChip.value)

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
    <TxOsIcon v-if="showOsIcon" :os="os" class="tx-status-badge__icon" />
    <span
      v-if="hasChip"
      class="tx-status-badge__chip"
      :class="{ 'is-hollow': hollow }"
      aria-hidden="true"
    >
      <i v-if="!hollow" :class="iconClass" class="tx-status-badge__glyph" />
    </span>
    <span class="tx-status-badge__text">{{ text }}</span>
  </div>
</template>

<style lang="scss">
// A monospace label on a soft tint, paired with a lightweight translucent icon
// halo (12% semantic tint) and matching semantic glyph color. Heights and radii
// mirror TxTag (`sm` 22px / 6px, `md` 26px / 8px, matching TxButton `sm` 26px),
// using a 1px inset ring so the box stays fixed-height without border bloat.
.tx-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: var(--tx-status-height, 26px);
  gap: 6px;
  border-radius: var(--tx-status-radius, 8px);
  font-family: var(--tx-font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  color: var(--tx-status-color, var(--tx-text-color-primary));
  background: var(--tx-status-bg, color-mix(in srgb, currentColor 12%, transparent));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-status-color, currentColor) 30%, transparent);

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

  // The OS marker is a bare glyph, not a chip: it names a platform, not a state.
  &__icon {
    flex: none;
    font-size: 1em;
    line-height: 1;

    &[class] {
      width: 1em;
      height: 1em;
    }
  }

  // Lightweight translucent semantic chip: 12% alpha fill with a contrast-calibrated
  // semantic glyph (`--tx-status-glyph`), replacing the heavy solid filled disc.
  &__chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--tx-status-chip-size, 16px);
    height: var(--tx-status-chip-size, 16px);
    font-size: var(--tx-status-chip-size, 16px);
    border-radius: 50%;
    background: var(--tx-status-chip-bg, color-mix(in srgb, var(--tx-status-color, currentColor) 12%, transparent));
    color: var(--tx-status-glyph, var(--tx-status-color, currentColor));

    // "Not started" is an absence, so it reads as an empty dashed ring rather than
    // a filled status marker competing with active states.
    &.is-hollow {
      background: transparent;
      border: 1.5px dashed color-mix(in srgb, var(--tx-status-color, currentColor) 55%, transparent);
      box-sizing: border-box;
    }
  }

  &__glyph {
    // Sized off the chip rather than the text so the glyph centres optically inside the halo.
    font-size: 0.72em;
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
    --tx-status-height: 22px;
    --tx-status-radius: 6px;
    --tx-status-chip-size: 14px;

    gap: 5px;
    padding: 0 7px;
    font-size: 11px;
  }

  &--md {
    --tx-status-height: 26px;
    --tx-status-radius: 8px;
    --tx-status-chip-size: 16px;

    gap: 6px;
    padding: 0 9px;
    font-size: 12px;
  }

  // A badge that opens with a chip tightens the leading inset so the chip sits
  // at an optically balanced distance from the left edge.
  &--sm.has-icon {
    padding-left: 4px;
  }

  &--md.has-icon {
    padding-left: 5px;
  }
}
</style>
