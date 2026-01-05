<script setup lang="ts">
import { TxBadge } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
    value?: string | number
    dot?: boolean
    color?: string
  }>(),
  {
    variant: 'default',
    value: 0,
    dot: false,
    color: undefined,
  },
)
</script>

<template>
  <TxBadge
    :variant="variant"
    :value="value"
    :dot="dot"
    :color="color"
    v-bind="$attrs"
  >
    <slot />
  </TxBadge>
</template>