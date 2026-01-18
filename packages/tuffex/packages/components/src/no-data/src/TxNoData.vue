<script setup lang="ts">
import type { NoDataProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxNoData',
})

const props = defineProps<NoDataProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-bind="props" variant="no-data" v-slots="slots" />
</template>
