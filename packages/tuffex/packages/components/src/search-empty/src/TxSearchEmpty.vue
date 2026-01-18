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
  <TxEmptyState v-bind="props" variant="search-empty" v-slots="slots" />
</template>
