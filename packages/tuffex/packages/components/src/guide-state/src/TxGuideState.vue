<script setup lang="ts">
import type { GuideStateEmits, GuideStateProps } from './types'
import { TxEmptyState } from '../../empty-state'

defineOptions({
  name: 'TxGuideState',
})

const props = defineProps<GuideStateProps>()
const emit = defineEmits<GuideStateEmits>()
</script>

<template>
  <TxEmptyState
    v-bind="props"
    variant="guide"
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
