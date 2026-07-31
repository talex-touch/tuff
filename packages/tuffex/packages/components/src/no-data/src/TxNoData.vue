<script setup lang="ts">
import type { NoDataEmits, NoDataProps } from './types'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxNoData',
})

const props = defineProps<NoDataProps>()
const emit = defineEmits<NoDataEmits>()
</script>

<template>
  <TxEmptyState
    v-bind="props"
    variant="no-data"
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
