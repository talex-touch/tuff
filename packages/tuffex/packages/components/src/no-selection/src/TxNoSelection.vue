<script setup lang="ts">
import type { NoSelectionProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxNoSelection',
})

const props = defineProps<NoSelectionProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-bind="props" variant="no-selection" v-slots="slots" />
</template>
