<script setup lang="ts">
import type { NoDataProps } from './types'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxNoData',
})

const props = defineProps<NoDataProps>()
</script>

<template>
  <TxEmptyState v-bind="props" variant="no-data">
    <template v-if="$slots.icon" #icon>
      <slot name="icon" />
    </template>
    <template v-if="$slots.title" #title>
      <slot name="title" />
    </template>
    <template v-if="$slots.description" #description>
      <slot name="description" />
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </TxEmptyState>
</template>
