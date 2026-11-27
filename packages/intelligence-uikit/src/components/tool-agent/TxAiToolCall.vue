<script setup lang="ts">
import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxAiToolCallProps } from '../../types'
import { TxToolCallCard } from '@talex-touch/tuffex/tool-call-card'
import TxAiLoadingHint from '../foundation/TxAiLoadingHint.vue'

defineOptions({
  name: 'TxAiToolCall',
})

withDefaults(defineProps<TxAiToolCallProps>(), {
  name: '',
  status: 'running',
  description: '',
  defaultExpanded: false,
  userOpen: undefined,
  autoExpandDelayMs: undefined,
  showRetry: undefined,
})

const emit = defineEmits<{
  retry: [id: string]
  toggle: [expanded: boolean]
}>()

defineSlots<{
  summary?: (props: { toolCall: AiToolCallPart }) => unknown
  result?: (props: { toolCall: AiToolCallPart }) => unknown
  icon?: (props: { status: AiToolCallPart['status'] }) => unknown
}>()
</script>

<template>
  <TxToolCallCard
    v-if="toolCall"
    class="tx-ai-tool-call tx-ai-tool-call--card"
    :tool-call="toolCall"
    :default-expanded="defaultExpanded"
    :user-open="userOpen"
    :auto-expand-delay-ms="autoExpandDelayMs"
    :show-retry="showRetry"
    :retry-label="labels?.retry"
    :pending-label="labels?.pending"
    :running-label="labels?.running"
    :done-label="labels?.done"
    :error-label="labels?.error"
    :input-label="labels?.input"
    :empty-result-label="labels?.emptyResult"
    @retry="emit('retry', $event)"
    @toggle="emit('toggle', $event)"
  >
    <template v-if="$slots.summary" #summary="slotProps">
      <slot name="summary" v-bind="slotProps" />
    </template>
    <template v-if="$slots.result" #result="slotProps">
      <slot name="result" v-bind="slotProps" />
    </template>
    <template v-if="$slots.icon" #icon="slotProps">
      <slot name="icon" v-bind="slotProps" />
    </template>
  </TxToolCallCard>
  <TxAiLoadingHint
    v-else
    class="tx-ai-tool-call"
    :label="name || 'Tool call'"
    :description="description"
    :status="status"
  />
</template>
