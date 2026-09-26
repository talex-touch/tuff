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
 * The glyphs are solid, not outlined: each one sits knocked out of a filled
 * disc, so the disc supplies the enclosing circle and an outlined glyph would
 * draw a second one inside it. `muted` is the exception — it renders as an
 * empty dashed ring with no glyph at all, which is how a "not started" state
 * reads as absence rather than as one more filled state.
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
 * `--tx-status-color` tints the label and the fill; `--tx-status-chip` paints
 * the disc and is a *different, darker* ramp on purpose — see the token comment
 * in `style/variables.scss`.
 */
const styleVars = computed(() => {
  const color = toneMeta.value.color
  return {
    '--tx-status-color': color,
    '--tx-status-bg': `color-mix(in srgb, ${color} 14%, transparent)`,
    '--tx-status-chip': `var(--tx-status-chip-${resolvedTone.value})`,
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

/** Whether the pill opens with a disc — that side then takes the tighter padding. */
const hasChip = computed(() => !props.osOnly && (Boolean(iconClass.value) || hollow.value))
const hasIcon = computed(() => Boolean(osIconClass.value) || hasChip.value)

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
// A monospace label on a soft tint, with the state's glyph knocked out of a
// solid disc. The 999px/500-weight pill this replaced read as a quiet TxButton
// at a glance; the mono face and the square-ish 8px radius give the family its
// own silhouette, and the disc is what makes the state legible before the text
// is read.
//
// The fill stays a tint of `--tx-status-color` (shared with TxBadge / TxTag /
// TxAlert) but the border is gone: the tint and the disc already separate the
// badge from the page, and a hairline on top of both read as a third edge.
.tx-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  font-family: var(--tx-font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-status-color, var(--tx-text-color-primary));
  background: var(--tx-status-bg, color-mix(in srgb, currentColor 14%, transparent));
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

  // The OS marker is a bare glyph, not a disc: it names a platform, not a state.
  &__icon {
    flex: none;
    font-size: 1em;
    line-height: 1;

    &[class] {
      width: 1em;
      height: 1em;
    }
  }

  // The disc. Its fill comes from `--tx-status-chip-*`, a darker ramp than the
  // label's hue, because a knocked-out glyph on `--tx-color-*` measures
  // 1.67–2.90:1 — under the 3:1 minimum for a graphical object. Against the
  // chip ramp the worst pairing across all four themes is 3.30:1 (success, which
  // light and dark share). High-contrast dark inverts the pairing rather
  // than darkening the disc, since its palette is light-on-dark by design.
  &__chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    // Driven by a custom property, not a per-size rule block: a host that
    // compresses the badge (smaller padding and font-size for a dense table
    // row) has to be able to bring the disc down with it. It used to scale off
    // the text automatically, and two callers relied on that.
    width: var(--tx-status-chip-size, 18px);
    height: var(--tx-status-chip-size, 18px);
    font-size: var(--tx-status-chip-size, 18px);
    border-radius: 50%;
    background: var(--tx-status-chip, var(--tx-status-color));
    color: var(--tx-status-chip-on, #ffffff);

    // "Not started" is an absence, so it reads as an empty ring rather than one
    // more filled disc competing with the states that actually happened.
    &.is-hollow {
      background: transparent;
      border: 1.5px dashed var(--tx-status-chip, currentColor);
    }
  }

  &__glyph {
    // Sized off the disc rather than the text: the glyph has to sit inside a
    // circle, not align with the baseline.
    font-size: 0.62em;
    line-height: 1;

    // `1em` of the glyph's own 0.62em, so the box is 62% of the disc. It
    // used to be 0.62em here too, which applied the ratio twice and drew a
    // 7px glyph in the 18px disc.
    &[class] {
      width: 1em;
      height: 1em;
    }
  }

  &__text {
    line-height: 1;
  }

  &--sm {
    --tx-status-chip-size: 15px;

    padding: 4px 8px;
  }

  &--md {
    --tx-status-chip-size: 18px;

    padding: 5px 10px;
  }

  // A badge that opens with a disc tightens the leading inset so the disc sits
  // the same distance from the edge as it does from the top and bottom.
  &--sm.has-icon {
    padding-left: 4px;
  }

  &--md.has-icon {
    padding-left: 5px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
