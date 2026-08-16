<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { IconChipProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxIconChip' })

const props = withDefaults(defineProps<IconChipProps>(), {
  size: 14,
  tone: 'neutral',
  variant: 'solid',
  shape: 'square',
})

defineSlots<{
  /** Chip contents — an inline SVG or short text. Overrides `label`. */
  default?: () => any
}>()

function toLength(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

const resolvedRadius = computed(() => {
  if (props.shape === 'circle')
    return '999px'
  if (props.radius !== undefined)
    return toLength(props.radius)
  return `${Math.round(props.size / 4)}px`
})

// Upstream picks 7px for the 14px badge (three uppercase letters must fit) and
// 13px for the 32px avatar. `size * 0.4` with a 7px floor lands on both.
const resolvedFontSize = computed(() =>
  props.fontSize !== undefined ? props.fontSize : Math.max(7, Math.round(props.size * 0.4)),
)

const style = computed(() => ({
  '--tx-bui-icon-chip-size': `${props.size}px`,
  '--tx-bui-icon-chip-radius': resolvedRadius.value,
  '--tx-bui-icon-chip-font-size': `${resolvedFontSize.value}px`,
}))
</script>

<template>
  <span
    class="tx-bui-icon-chip"
    :class="[
      `is-${tone}`,
      `is-${variant}`,
      { 'is-circle': shape === 'circle' },
    ]"
    :style="style"
    :role="ariaLabel ? 'img' : undefined"
    :aria-label="ariaLabel || undefined"
    :aria-hidden="ariaLabel ? undefined : 'true'"
  >
    <slot>{{ label }}</slot>
  </span>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-icon-chip {
  @include bui-scope;

  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--tx-bui-icon-chip-size, 14px);
  height: var(--tx-bui-icon-chip-size, 14px);
  border-radius: var(--tx-bui-icon-chip-radius, 4px);
  font-size: var(--tx-bui-icon-chip-font-size, 7px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;

  > svg {
    width: 62%;
    height: 62%;
  }

  // Solid tones. The chip is a filled plate, so it carries no ring — the one
  // exception is `neutral`, which needs the hairline to read against `surface`.
  &.is-solid {
    color: #fff;

    &.is-neutral {
      color: var(--tx-bui-ink-2, #62656b);
      background: var(--tx-bui-inset, #f7f8f9);
      box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
    }

    &.is-ink {
      color: var(--tx-bui-surface, #fff);
      background: var(--tx-bui-ink, #1f2124);
    }

    &.is-accent {
      background: var(--tx-bui-accent, #0285ff);
    }

    &.is-green {
      background: var(--tx-bui-green, #189a4d);
    }

    &.is-orange {
      background: var(--tx-bui-orange, #ef720c);
    }

    &.is-red {
      background: var(--tx-bui-red, #e3474c);
    }
  }

  // Tinted plate: tone-coloured ink on its own tint, ringed at 30%. Upstream
  // draws that ring with `border`; a spread shadow keeps the chip's box the
  // declared size instead of growing it by 2px.
  &.is-soft {
    &.is-neutral {
      color: var(--tx-bui-ink-2, #62656b);
      background: var(--tx-bui-inset, #f7f8f9);
      box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
    }

    &.is-ink {
      color: var(--tx-bui-ink, #1f2124);
      background: var(--tx-bui-field, #f2f2f3);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-ink, #1f2124) 12%, transparent);
    }

    &.is-accent {
      color: var(--tx-bui-accent-ink, #0170dd);
      background: var(--tx-bui-accent-tint, #e9f3ff);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 30%, transparent);
    }

    &.is-green {
      color: var(--tx-bui-green, #189a4d);
      background: var(--tx-bui-green-tint, #e8f5ed);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-green, #189a4d) 30%, transparent);
    }

    &.is-orange {
      color: var(--tx-bui-orange, #ef720c);
      background: var(--tx-bui-orange-tint, #fdf1e5);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-orange, #ef720c) 30%, transparent);
    }

    &.is-red {
      color: var(--tx-bui-red, #e3474c);
      background: var(--tx-bui-red-tint, #fcecec);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-red, #e3474c) 30%, transparent);
    }
  }
}
</style>
