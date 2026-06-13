<script setup lang="ts">
import type { AiElementMessage } from './types'
import { computed } from 'vue'
import TxAiMessage from './TxAiMessage.vue'

const props = withDefaults(
  defineProps<{
    messages: AiElementMessage[]
    markdown?: boolean
    compact?: boolean
    emptyText?: string
  }>(),
  {
    markdown: true,
    compact: false,
    emptyText: 'No messages yet',
  },
)

defineOptions({
  name: 'TxAiConversation',
})

const normalizedMessages = computed(() => props.messages.filter(message => message.content?.trim()))
</script>

<template>
  <section class="tx-ai-conversation" aria-live="polite">
    <slot v-if="normalizedMessages.length === 0" name="empty">
      <p class="tx-ai-conversation__empty">
{{ emptyText }}
</p>
    </slot>

    <div v-else class="tx-ai-conversation__list">
      <TxAiMessage
        v-for="message in normalizedMessages"
        :key="message.id"
        :message="message"
        :markdown="markdown"
        :compact="compact"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.tx-ai-conversation {
  width: 100%;
}

.tx-ai-conversation__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tx-ai-conversation__empty {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent);
  font-size: 13px;
}
</style>
