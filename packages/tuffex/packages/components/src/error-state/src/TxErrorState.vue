<script setup lang="ts">
import type { ErrorStateProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxErrorState',
})

const props = defineProps<ErrorStateProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-slots="slots" v-bind="props" variant="error" />
</template>
