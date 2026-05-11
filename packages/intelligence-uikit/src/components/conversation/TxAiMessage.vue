<script setup lang="ts">
import type { TxAiMessageProps } from '../../types'
import { computed } from 'vue'
import { TxChatMessage } from '@talex-touch/tuffex'
import { toTuffexChatMessage } from '../../types'
import TxAiMarkdown from '../content/TxAiMarkdown.vue'
import TxAiRichBlock from '../content/TxAiRichBlock.vue'
import TxAiThinking from '../foundation/TxAiThinking.vue'

defineOptions({
  name: 'TxAiMessage',
})

const props = withDefaults(defineProps<TxAiMessageProps>(), {
  markdown: true,
  reveal: true,
})

const emit = defineEmits<{
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
  (e: 'action', payload: { action: string, messageId: string }): void
}>()

const chatMessage = computed(() => toTuffexChatMessage(props.message))
const isGenerating = computed(() => props.message.status === 'waiting' || props.message.status === 'streaming')
</script>

<template>
  <TxChatMessage
    class="tx-ai-message"
    :class="[`tx-ai-message--${message.role}`, `tx-ai-message--${message.status || 'idle'}`]"
    :message="chatMessage"
    :markdown="markdown"
    @image-click="emit('imageClick', $event)"
  >
    <template #content>
      <slot name="content" :message="message">
        <div v-if="message.blocks?.length" class="tx-ai-message__blocks">
          <TxAiRichBlock
            v-for="(block, index) in message.blocks"
            :key="block.id || index"
            :block="block"
          />
        </div>
        <TxAiThinking v-else-if="isGenerating && !message.content" text="Generating..." variant="dots" />
        <TxAiMarkdown
          v-else-if="markdown"
          :content="message.content || ''"
          :reveal="reveal"
        />
        <div v-else class="tx-ai-message__plain">
          {{ message.content }}
        </div>
      </slot>
    </template>

    <template #header>
      <slot name="header" :message="message" />
    </template>
  </TxChatMessage>
</template>
