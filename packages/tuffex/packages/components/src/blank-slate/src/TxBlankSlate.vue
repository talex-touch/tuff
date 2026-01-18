<script setup lang="ts">
import type { BlankSlateProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxBlankSlate',
})

const props = withDefaults(defineProps<BlankSlateProps>(), {
  size: 'large',
  layout: 'vertical',
  surface: 'plain',
})

const slots = useSlots()
</script>

<template>
  <TxEmptyState v-bind="props" variant="blank-slate" v-slots="slots" />
</template>
