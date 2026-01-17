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
import { computed } from 'vue'

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
  disabled: false,
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
 * Computed property for the resolved background color.
 * Uses color-mix to create a semi-transparent background if not explicitly provided.
 */
const resolvedBackground = computed(() => {
  if (props.background)
    return props.background
  return `color-mix(in srgb, ${safeColor.value} 12%, transparent)`
})

/**
 * Computed property for the resolved border color.
 * Uses color-mix to create a semi-transparent border if not explicitly provided.
 */
const resolvedBorder = computed(() => {
  if (props.border)
    return props.border
  return `color-mix(in srgb, ${safeColor.value} 32%, transparent)`
})

/**
 * Computed CSS custom properties for dynamic styling.
 */
const styleVars = computed(() => ({
  '--tx-tag-color': safeColor.value,
  '--tx-tag-bg': resolvedBackground.value,
  '--tx-tag-border': resolvedBorder.value,
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
      {
        'tx-tag--closable': closable,
        'tx-tag--disabled': disabled,
      },
    ]"
    :style="styleVars"
    role="status"
    @click="handleClick"
  >
    <i v-if="icon" :class="icon" class="tx-tag__icon" aria-hidden="true" />
    <span class="tx-tag__content">
      <slot>{{ safeLabel }}</slot>
    </span>
    <button
      v-if="closable"
      type="button"
      class="tx-tag__close"
      :disabled="disabled"
      aria-label="Remove tag"
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
.tx-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  color: var(--tx-tag-color, var(--tx-color-primary));
  background: var(--tx-tag-bg, color-mix(in srgb, currentColor 12%, transparent));
  border: 1px solid var(--tx-tag-border, color-mix(in srgb, currentColor 32%, transparent));
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.05em;
  line-height: 1;
  white-space: nowrap;
  transition: all 0.2s ease;
  cursor: default;

  &__icon {
    font-size: 12px;
    line-height: 1;
  }

  &__content {
    display: inline-flex;
    align-items: center;
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s ease;
    border-radius: 50%;

    &:hover {
      opacity: 1;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &--sm {
    padding: 4px 6px;
  }

  &--md {
    padding: 5px 8px;
    font-size: 12px;

    .tx-tag__icon {
      font-size: 14px;
    }
  }

  &--closable {
    padding-right: 6px;
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
