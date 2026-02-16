<script setup lang="ts">
import type { GuideStateProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxGuideState',
})

const props = defineProps<GuideStateProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-slots="slots" v-bind="props" variant="guide" />
</template>
