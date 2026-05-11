<script setup lang="ts">
import type { TxAiToolCallProps } from '../../types'
import TxAiLoadingHint from '../foundation/TxAiLoadingHint.vue'

defineOptions({
  name: 'TxAiToolCall',
})

withDefaults(defineProps<TxAiToolCallProps>(), {
  status: 'running',
  description: '',
})
</script>

<template>
  <TxAiLoadingHint
    class="tx-ai-tool-call"
    :label="name"
    :description="description"
    :status="status"
  />
</template>
