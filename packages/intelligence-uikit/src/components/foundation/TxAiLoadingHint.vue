<script setup lang="ts">
import type { TxAiLoadingHintProps } from '../../types'
import TxAiThinking from './TxAiThinking.vue'

defineOptions({
  name: 'TxAiLoadingHint',
})

withDefaults(defineProps<TxAiLoadingHintProps>(), {
  label: 'Working',
  description: '',
  status: 'running',
  tone: 'neutral',
})
</script>

<template>
  <div class="tx-ai-loading-hint" :class="[`tx-ai-loading-hint--${status}`, `tx-ai-loading-hint--${tone}`]">
    <TxAiThinking v-if="status === 'pending' || status === 'running'" :text="label" variant="dots" />
    <div v-else class="tx-ai-loading-hint__status" aria-hidden="true" />
    <div class="tx-ai-loading-hint__body">
      <div class="tx-ai-loading-hint__label">
        {{ label }}
      </div>
      <div v-if="description" class="tx-ai-loading-hint__description">
        {{ description }}
      </div>
    </div>
  </div>
</template>
