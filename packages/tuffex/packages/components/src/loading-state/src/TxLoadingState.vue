<script setup lang="ts">
import type { LoadingStateProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxLoadingState',
})

const props = defineProps<LoadingStateProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-bind="props" variant="loading" v-slots="slots" />
</template>
