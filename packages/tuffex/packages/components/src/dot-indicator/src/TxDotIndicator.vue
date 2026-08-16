<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { DotIndicatorProps } from './types'
import { computed, useSlots } from 'vue'

defineOptions({ name: 'TxDotIndicator' })

const props = withDefaults(defineProps<DotIndicatorProps>(), {
  color: 'currentColor',
  size: 8,
})

defineSlots<{
  /** Replaces the text beside the dot. */
  default?: () => any
}>()

const slots = useSlots()

const hasLabel = computed(() => Boolean(props.label) || Boolean(slots.default))

// A lone coloured dot carries no meaning for a screen reader. With a visible
// label the text speaks for it; with only `ariaLabel` it becomes an image; with
// neither it is decoration and must not be announced.
const semantics = computed<{
  role?: string
  ariaLabel?: string
  ariaHidden?: true
}>(() => {
  if (hasLabel.value)
    return {}
  if (props.ariaLabel)
    return { role: 'img', ariaLabel: props.ariaLabel }
  return { ariaHidden: true }
})

const dotStyle = computed(() => ({
  '--tx-bui-dot-indicator-color': props.color,
  '--tx-bui-dot-indicator-size': `${props.size}px`,
}))
</script>

<template>
  <span
    class="tx-bui-dot-indicator"
    :role="semantics.role"
    :aria-label="semantics.ariaLabel"
    :aria-hidden="semantics.ariaHidden"
    :style="dotStyle"
  >
    <span class="tx-bui-dot-indicator__dot" aria-hidden="true" />
    <span v-if="hasLabel" class="tx-bui-dot-indicator__label">
      <slot>{{ label }}</slot>
    </span>
  </span>
</template>

<style lang="scss">
.tx-bui-dot-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  font-size: 12px;
  line-height: 1.4;
  color: var(--tx-bui-ink-2, #62656b);
}

.tx-bui-dot-indicator__dot {
  flex: 0 0 auto;
  width: var(--tx-bui-dot-indicator-size, 8px);
  height: var(--tx-bui-dot-indicator-size, 8px);
  border-radius: 50%;
  background: var(--tx-bui-dot-indicator-color, currentColor);
}

.tx-bui-dot-indicator__label {
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
</style>
