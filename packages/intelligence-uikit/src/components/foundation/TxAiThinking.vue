<script setup lang="ts">
import type { TxAiThinkingProps } from '../../types'
import { TxTypingIndicator } from '@talex-touch/tuffex'

defineOptions({
  name: 'TxAiThinking',
})

withDefaults(defineProps<TxAiThinkingProps>(), {
  text: 'Thinking...',
  variant: 'ai',
  showText: true,
  size: 6,
})
</script>

<template>
  <div class="tx-ai-thinking">
    <TxTypingIndicator
      :variant="variant"
      :text="text"
      :show-text="showText"
      :size="size"
    />
  </div>
</template>
