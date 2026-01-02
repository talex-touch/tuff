<script setup lang="ts">
import { computed } from 'vue'
import type { FlexProps } from './types'

defineOptions({ name: 'TxFlex' })

const props = withDefaults(defineProps<FlexProps>(), {
  direction: 'row',
  gap: 12,
  align: 'stretch',
  justify: 'flex-start',
  wrap: 'nowrap',
  inline: false,
})

const style = computed<Record<string, string>>(() => {
  const gap = typeof props.gap === 'number' ? `${props.gap}px` : String(props.gap)
  return {
    '--tx-flex-gap': gap,
    '--tx-flex-align': props.align || 'stretch',
    '--tx-flex-justify': props.justify || 'flex-start',
    '--tx-flex-direction': props.direction || 'row',
    '--tx-flex-wrap': props.wrap || 'nowrap',
    '--tx-flex-display': props.inline ? 'inline-flex' : 'flex',
  }
})
</script>

<template>
  <div class="tx-flex" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-flex {
  display: var(--tx-flex-display, flex);
  flex-direction: var(--tx-flex-direction, row);
  flex-wrap: var(--tx-flex-wrap, nowrap);
  align-items: var(--tx-flex-align, stretch);
  justify-content: var(--tx-flex-justify, flex-start);
  gap: var(--tx-flex-gap, 12px);
  min-width: 0;
}
</style>
