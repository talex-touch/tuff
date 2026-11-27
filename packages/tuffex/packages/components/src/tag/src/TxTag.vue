<script setup lang="ts">
import type { TagEmits, TagProps } from './types'
/**
 * TxTag Component
 *
 * A versatile tag component with customizable colors, sizes, and optional close functionality.
 * Supports icons, custom styling, and accessibility features.
 *
 * @example
 * ```vue
 * <TxTag label="Default" />
 * <TxTag label="Success" color="var(--tx-color-success)" />
 * <TxTag label="Closable" closable @close="handleClose" />
 * ```
 *
 * @component
 */
import { computed, getCurrentInstance } from 'vue'

defineOptions({
  name: 'TxTag',
})

const props = withDefaults(defineProps<TagProps>(), {
  label: '',
  icon: '',
  color: 'var(--tx-color-primary)',
  background: '',
  border: '',
  size: 'sm',
  closable: false,
  closeAriaLabel: 'Remove tag',
  disabled: false,
  pill: false,
  variant: 'outline',
  dotSize: 6,
})

const emit = defineEmits<TagEmits>()

/**
 * Computed property that ensures the label is always a string.
 */
const safeLabel = computed(() => {
  return props.label ?? ''
})

/**
 * Computed property that ensures the color has a fallback value.
 */
const safeColor = computed(() => {
  return props.color || 'var(--tx-color-primary)'
})

/**
 * Fill / hairline / text strengths per variant. `plain` is neutral by design:
 * an overflow counter that borrows a status hue reads as status.
 */
const VARIANT_MIX = {
  outline: { bg: 12, border: 32, text: 100 },
  soft: { bg: 20, border: 34, text: 92 },
  plain: { bg: 0, border: 0, text: 100 },
} as const

/**
 * Computed property for the resolved background color.
 * Uses color-mix to create a semi-transparent background if not explicitly provided.
 */
const resolvedBackground = computed(() => {
  if (props.background)
    return props.background
  if (props.variant === 'plain')
    return 'var(--tx-fill-color-light, #f5f7fa)'
  return `color-mix(in srgb, ${safeColor.value} ${VARIANT_MIX[props.variant].bg}%, transparent)`
})

/**
 * Computed property for the resolved border color.
 * Uses color-mix to create a semi-transparent border if not explicitly provided.
 */
const resolvedBorder = computed(() => {
  if (props.border)
    return props.border
  if (props.variant === 'plain')
    return 'var(--tx-border-color-light, #e4e7ed)'
  return `color-mix(in srgb, ${safeColor.value} ${VARIANT_MIX[props.variant].border}%, transparent)`
})

/**
 * Text colour. Separate from `--tx-tag-color` so the dot, border, and fill can
 * stay on the raw hue while the label is pulled toward ink for legibility.
 */
const resolvedText = computed(() => {
  if (props.variant === 'plain')
    return 'var(--tx-text-color-secondary, #909399)'
  const mix = VARIANT_MIX[props.variant].text
  if (mix >= 100)
    return safeColor.value
  return `color-mix(in srgb, ${safeColor.value} ${mix}%, var(--tx-text-color-primary, #303133))`
})

/**
 * Computed CSS custom properties for dynamic styling.
 */
const styleVars = computed(() => ({
  '--tx-tag-color': safeColor.value,
  '--tx-tag-bg': resolvedBackground.value,
  '--tx-tag-border': resolvedBorder.value,
  '--tx-tag-text': resolvedText.value,
  '--tx-tag-dot-size': `${props.dotSize}px`,
}))

/**
 * Handles click events on the tag.
 * @param event - The mouse event
 */
function handleClick(event: MouseEvent): void {
  if (props.disabled)
    return
  emit('click', event)
}

// A tag is passive until a click listener is attached; only then does it
// become a keyboard-reachable button (same pattern as TxStatusBadge).
const instance = getCurrentInstance()
const interactive = computed(() => !!instance?.vnode.props?.onClick)

function handleKeydown(event: KeyboardEvent): void {
  // The close button keeps its own keyboard handling.
  if (event.target !== event.currentTarget)
    return
  if (!interactive.value || props.disabled)
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  handleClick(event as unknown as MouseEvent)
}

/**
 * Handles the close button click.
 * Stops propagation to prevent triggering the tag click event.
 * @param event - The mouse event
 */
function handleClose(event: MouseEvent): void {
  event.stopPropagation()
  if (props.disabled)
    return
  emit('close')
}
</script>

<template>
  <span
    class="tx-tag"
    :class="[
      `tx-tag--${size}`,
      `tx-tag--${variant}`,
      {
        pill,
        'tx-tag--closable': closable,
        'tx-tag--disabled': disabled,
      },
    ]"
    :style="styleVars"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive && !disabled ? 0 : undefined"
    :aria-disabled="interactive && disabled ? true : undefined"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    <span v-if="dot" class="tx-tag__dot" aria-hidden="true" :style="{ background: dot }" />
    <i v-if="icon" :class="icon" class="tx-tag__icon" aria-hidden="true" />
    <span class="tx-tag__content">
      <slot>{{ safeLabel }}</slot>
    </span>
    <span v-if="count !== undefined" class="tx-tag__count">{{ count }}</span>
    <button
      v-if="closable"
      type="button"
      class="tx-tag__close"
      :disabled="disabled"
      :aria-label="closeAriaLabel"
      @click="handleClose"
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </span>
</template>

<style lang="scss">
// Sized and rounded on the TxButton scale: `md` matches TxButton `sm` (26px, 8px radius)
// and `sm` steps down proportionally (22px, 6px radius). Uses a 1px inset ring rather than
// a layout border so fixed heights hold steady across states.
.tx-tag {
  --tx-tag-height: 22px;
  --tx-tag-pad-x: 8px;
  --tx-tag-gap: 4px;
  --tx-tag-radius: 6px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: var(--tx-tag-height);
  padding: 0 var(--tx-tag-pad-x);
  gap: var(--tx-tag-gap);
  border: 0;
  border-radius: var(--tx-tag-radius);
  color: var(--tx-tag-text, var(--tx-tag-color, var(--tx-color-primary)));
  background: var(--tx-tag-bg, color-mix(in srgb, currentColor 12%, transparent));
  box-shadow: inset 0 0 0 1px var(--tx-tag-border, color-mix(in srgb, currentColor 32%, transparent));
  font-weight: var(--tx-font-weight-medium, 500);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  cursor: default;

  &[role='button'] {
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--tx-tag-color, var(--tx-color-primary, #409eff)) 60%, transparent);
      outline-offset: 2px;
    }
  }

  &__icon {
    flex: none;
    font-size: 12px;
    line-height: 1;
  }

  &__content {
    display: inline-flex;
    align-items: center;
  }

  &__dot {
    flex: 0 0 auto;
    width: var(--tx-tag-dot-size, 6px);
    height: var(--tx-tag-dot-size, 6px);
    margin-right: 0;
    border-radius: 50%;
  }

  &__count {
    padding: 1px 4px;
    margin-right: -2px;
    border-radius: 4px;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 14px;
    height: 14px;
    padding: 0;
    margin-left: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.72;
    transition: opacity 0.16s ease;
    border-radius: 4px;

    svg {
      width: 10px;
      height: 10px;
    }

    &:hover:not(:disabled) {
      opacity: 1;
      background: color-mix(in srgb, currentColor 14%, transparent);
    }

    &:focus-visible {
      outline: 1.5px solid currentColor;
      outline-offset: 1px;
      opacity: 1;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &.pill {
    --tx-tag-radius: 999px;
    border-radius: 999px;

    .tx-tag__close {
      border-radius: 50%;
    }
  }

  &--sm {
    --tx-tag-height: 22px;
    --tx-tag-pad-x: 8px;
    --tx-tag-gap: 4px;
    --tx-tag-radius: 6px;
    font-size: 11px;
  }

  &--md {
    --tx-tag-height: 26px;
    --tx-tag-pad-x: 10px;
    --tx-tag-gap: 5px;
    --tx-tag-radius: 8px;
    font-size: 12px;

    .tx-tag__icon {
      font-size: 14px;
    }

    .tx-tag__close {
      width: 16px;
      height: 16px;

      svg {
        width: 11px;
        height: 11px;
      }
    }
  }

  &--closable {
    padding-right: calc(var(--tx-tag-pad-x) - 3px);
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-tag__close {
      transition: none;
    }
  }
}
</style>
