<script setup lang="ts">
import type { OfflineStateProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxOfflineState',
})

const props = defineProps<OfflineStateProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-slots="slots" v-bind="props" variant="offline" />
</template>
