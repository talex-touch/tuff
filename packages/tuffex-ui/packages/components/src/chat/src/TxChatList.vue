<script setup lang="ts">
import { computed } from 'vue'
import TxStagger from '../../stagger/src/TxStagger.vue'
import TxChatMessage from './TxChatMessage.vue'

defineOptions({
  name: 'TxChatList',
})

const props = withDefaults(
  defineProps<{
    messages: Array<{
      id: string
      role: 'user' | 'assistant' | 'system'
      content: string
      createdAt?: number
      avatarUrl?: string
      attachments?: Array<{ type: 'image'; url: string; name?: string }>
    }>
    markdown?: boolean
    stagger?: boolean
  }>(),
  {
    markdown: true,
    stagger: true,
  },
)

const emit = defineEmits<{
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
}>()

const list = computed(() => props.messages ?? [])
</script>

<template>
  <div class="tx-chat-list">
    <TxStagger v-if="stagger" tag="div" class="tx-chat-list__inner">
      <TxChatMessage
        v-for="m in list"
        :key="m.id"
        :message="m"
        :markdown="markdown"
        @imageClick="emit('imageClick', $event)"
      />
    </TxStagger>

    <div v-else class="tx-chat-list__inner">
      <TxChatMessage
        v-for="m in list"
        :key="m.id"
        :message="m"
        :markdown="markdown"
        @imageClick="emit('imageClick', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-chat-list {
  width: 100%;
}

.tx-chat-list__inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
