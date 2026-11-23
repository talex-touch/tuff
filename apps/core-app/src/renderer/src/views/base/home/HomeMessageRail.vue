<script lang="ts" name="HomeMessageRail" setup>
import type { TxAiMessageModel } from '@talex-touch/intelligence-uikit'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { TxAiMessageRail } from '@talex-touch/intelligence-uikit'
import { computed } from 'vue'

/**
 * Positioning and localization shell around UIKit's `TxAiMessageRail` (`variant="minimal"`).
 * Keeps the right-edge outline rail pinned between the top bar and the dynamic composer clearance.
 */
const props = withDefaults(
  defineProps<{
    items: ConversationMessage[]
    activeIndex?: number
  }>(),
  { activeIndex: -1 }
)

const emit = defineEmits<{
  (event: 'navigate', index: number): void
}>()

const railMessages = computed(() =>
  props.items.map((msg) => {
    const withModelAttachments = msg as ConversationMessage & { modelAttachments?: unknown[] }
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments,
      modelAttachments: withModelAttachments.modelAttachments
    } as TxAiMessageModel & { modelAttachments?: readonly unknown[] }
  })
)

const formatTurnAriaLabel = (turnNumber: number): string => `第 ${turnNumber} 轮提问`
</script>

<template>
  <TxAiMessageRail
    class="HomeMessageRail"
    variant="minimal"
    :messages="railMessages"
    :active-index="activeIndex"
    aria-label="消息大纲导航"
    code-tag="[代码]"
    fallback-label="消息"
    :max-length="200"
    :turn-aria-label="formatTurnAriaLabel"
    @navigate="emit('navigate', $event)"
  />
</template>

<style lang="scss" scoped>
.HomeMessageRail {
  position: absolute;
  top: 72px;
  right: 18px;
  bottom: calc(var(--home-composer-height, 112px) + 24px);
  z-index: 5;
}
</style>
