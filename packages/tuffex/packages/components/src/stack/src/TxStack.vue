<script setup lang="ts">
import { computed } from 'vue'
import type { StackProps } from './types'

defineOptions({ name: 'TxStack' })

const props = withDefaults(defineProps<StackProps>(), {
  direction: 'vertical',
  gap: 12,
  align: 'stretch',
  justify: 'flex-start',
  wrap: false,
  inline: false,
})

const style = computed<Record<string, string>>(() => {
  const gap = typeof props.gap === 'number' ? `${props.gap}px` : String(props.gap)
  return {
    '--tx-stack-gap': gap,
    '--tx-stack-align': props.align || 'stretch',
    '--tx-stack-justify': props.justify || 'flex-start',
    '--tx-stack-direction': props.direction === 'horizontal' ? 'row' : 'column',
    '--tx-stack-wrap': props.wrap ? 'wrap' : 'nowrap',
    '--tx-stack-display': props.inline ? 'inline-flex' : 'flex',
  }
})
</script>

<template>
  <div class="tx-stack" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-stack {
  display: var(--tx-stack-display, flex);
  flex-direction: var(--tx-stack-direction, column);
  flex-wrap: var(--tx-stack-wrap, nowrap);
  align-items: var(--tx-stack-align, stretch);
  justify-content: var(--tx-stack-justify, flex-start);
  gap: var(--tx-stack-gap, 12px);
  min-width: 0;
}
</style>
