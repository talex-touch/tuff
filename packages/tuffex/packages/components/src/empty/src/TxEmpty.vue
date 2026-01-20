<script setup lang="ts">
import type { EmptyProps } from './types'
import { computed, useSlots } from 'vue'
import { TxEmptyState } from '../../empty-state'

defineOptions({ name: 'TxEmpty' })

const props = withDefaults(defineProps<EmptyProps>(), {
  title: 'Nothing here',
  description: '',
  iconClass: 'i-carbon-incomplete',
  compact: false,
})

const slots = useSlots()

const emptyStateSize = computed(() => (props.compact ? 'small' : 'medium'))
</script>

<template>
  <TxEmptyState
    variant="empty"
    :title="title"
    :description="description"
    :icon="iconClass"
    :size="emptyStateSize"
    surface="card"
    layout="vertical"
  >
    <template v-if="slots.icon" #icon>
      <slot name="icon" />
    </template>
    <template v-if="slots.title" #title>
      <slot name="title" />
    </template>
    <template v-if="slots.description" #description>
      <slot name="description" />
    </template>
    <template v-if="slots.action" #actions>
      <slot name="action" />
    </template>
  </TxEmptyState>
</template>
