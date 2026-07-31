<script setup lang="ts">
import type { SearchEmptyEmits, SearchEmptyProps } from './types'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxSearchEmpty',
})

const props = defineProps<SearchEmptyProps>()
const emit = defineEmits<SearchEmptyEmits>()
</script>

<template>
  <TxEmptyState
    v-bind="props"
    variant="search-empty"
    @primary="emit('primary')"
    @secondary="emit('secondary')"
  >
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
