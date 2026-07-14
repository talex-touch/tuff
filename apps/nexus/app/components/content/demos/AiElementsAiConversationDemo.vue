<script setup lang="ts">
import type { AiElementMessage } from '@talex-touch/tuffex/ai-elements'
import { computed } from 'vue'

const { locale } = useI18n()

const messages = computed<AiElementMessage[]>(() => (locale.value === 'zh'
  ? [
      {
        id: 'user-1',
        role: 'user',
        content: '帮我总结这次发布审阅结果。',
        name: '你',
        status: 'complete',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '已完成 **组件文档** 审阅：新增 API、Props 与示例覆盖，并保留待校对清单。',
        name: 'Nexus AI',
        status: 'complete',
      },
      {
        id: 'tool-1',
        role: 'tool',
        content: '',
        name: 'Verifier',
        status: 'streaming',
      },
    ]
  : [
      {
        id: 'user-1',
        role: 'user',
        content: 'Summarize this release review.',
        name: 'You',
        status: 'complete',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Reviewed **component docs**: API, props, examples, and remaining review notes are now visible.',
        name: 'Nexus AI',
        status: 'complete',
      },
      {
        id: 'tool-1',
        role: 'tool',
        content: '',
        name: 'Verifier',
        status: 'streaming',
      },
    ]))
</script>

<template>
  <TxAiConversation :messages="messages" show-avatar />
</template>
