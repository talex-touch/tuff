<script lang="ts" setup>
import type { ProgressProps } from './types'
import { TxProgressBar } from '../../progress-bar'

defineOptions({
  name: 'TuffProgress',
})

const props = withDefaults(
  defineProps<ProgressProps>(),
  {
    percentage: 0,
    status: '',
    strokeWidth: 6,
    showText: true,
    indeterminate: false,
  },
)
</script>

<template>
  <TxProgressBar
    :percentage="percentage"
    :status="status"
    :indeterminate="indeterminate"
    :height="`${strokeWidth}px`"
    :show-text="showText"
    text-placement="outside"
    :format="format"
    mask-variant="plain"
    mask-background="mask"
  />
</template>
