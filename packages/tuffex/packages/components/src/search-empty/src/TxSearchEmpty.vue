<script setup lang="ts">
import type { SearchEmptyProps } from './types'
import { useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxSearchEmpty',
})

const props = defineProps<SearchEmptyProps>()
const slots = useSlots()
</script>

<template>
  <TxEmptyState v-slots="slots" v-bind="props" variant="search-empty" />
</template>
