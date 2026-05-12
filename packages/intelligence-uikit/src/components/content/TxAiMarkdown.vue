<script setup lang="ts">
import type { TxAiMarkdownProps } from '../../types'
import { computed } from 'vue'
import { TxMarkdownView } from '@talex-touch/tuffex'
import TxAiReveal from '../foundation/TxAiReveal.vue'

defineOptions({
  name: 'TxAiMarkdown',
})

const props = withDefaults(defineProps<TxAiMarkdownProps>(), {
  sanitize: true,
  theme: 'auto',
  streaming: false,
  reveal: true,
})

const contentKey = computed(() => {
  if (!props.streaming)
    return 'stable'
  return `${props.content.length}:${props.content.slice(-24)}`
})
</script>

<template>
  <TxAiReveal v-if="reveal" class="tx-ai-markdown" :class="{ 'is-streaming': streaming }" motion="fade" :duration="180">
    <TxMarkdownView :key="contentKey" :content="content" :sanitize="sanitize" :theme="theme" />
  </TxAiReveal>
  <TxMarkdownView
    v-else
    :key="contentKey"
    class="tx-ai-markdown"
    :class="{ 'is-streaming': streaming }"
    :content="content"
    :sanitize="sanitize"
    :theme="theme"
  />
</template>
