<script setup lang="ts">
import type { BlankSlateProps } from './types'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxBlankSlate',
})

const props = withDefaults(defineProps<BlankSlateProps>(), {
  size: 'large',
  layout: 'vertical',
  surface: 'plain',
})
</script>

<template>
  <TxEmptyState v-bind="props" variant="blank-slate">
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
