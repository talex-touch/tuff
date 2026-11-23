<script lang="ts" name="HomeConversationStream" setup>
import type { TxAiSpeakState } from '@talex-touch/intelligence-uikit'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { DictationClip } from './composer/useComposerDictation'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { ref } from 'vue'
import { VOICE_DRAFT_ID } from './composables/useHomeDictation'
import HomeVoiceDraft from './composer/HomeVoiceDraft.vue'
import HomeMessageRail from './HomeMessageRail.vue'
import HomeMessageRow from './HomeMessageRow.vue'

/**
 * The active conversation stream viewport inside `.HomePage-Center`: sticky-bottom stream, message
 * rows, trailing voice-draft clip row, right-edge outline rail, and enter/leave transition.
 *
 * Exposes `stream` so `HomePage` keeps driving `scrollToBottom`, `tweenToBottom` and
 * `scrollToIndex` through the same instance ref.
 */
defineProps<{
  visible: boolean
  conversationId: string | null
  streamItems: ConversationMessage[]
  messages: ConversationMessage[]
  isStreaming: boolean
  isCompacting: boolean
  panelOpen: boolean
  enteringMessages: ReadonlySet<string>
  branching: boolean
  showTurnMetrics: boolean
  dictationClip: DictationClip | null
  dictating: boolean
  voiceSendBlocked: boolean
  isTurnFooterResting: (message: ConversationMessage) => boolean
  canBranchFrom: (message: ConversationMessage, index: number) => boolean
  speakStateOf: (message: ConversationMessage) => TxAiSpeakState
}>()

const following = defineModel<boolean>('following', { required: true })

const emit = defineEmits<{
  (event: 'voice-retry'): void
  (event: 'voice-send'): void
  (event: 'voice-dismiss'): void
  (event: 'retry'): void
  (event: 'regenerate'): void
  (event: 'speak', message: ConversationMessage): void
  (event: 'branch', messageId: string): void
  (event: 'code-preview', preview: StreamMarkdownCodePreview): void
}>()

const streamRef = ref<TxConversationStreamInstance | null>(null)

defineExpose({ stream: streamRef })
</script>

<template>
  <Transition name="home-stream">
    <TxConversationStream
      v-if="visible"
      ref="streamRef"
      :key="conversationId ?? 'draft'"
      class="HomePage-Stream"
      role="log"
      :items="streamItems"
      item-key="id"
      :streaming="isStreaming"
      :top-padding="72"
      bottom-clearance="calc(var(--home-composer-height, 112px) + 88px)"
      pill-bottom="calc(var(--home-composer-height, 112px) + 32px)"
      :data-following="following"
      @following-change="following = $event"
    >
      <template #item="{ item: message, index }">
        <div v-if="message.id === VOICE_DRAFT_ID" class="HomePage-StreamRow">
          <div class="HomePage-VoiceRow">
            <HomeVoiceDraft
              v-if="dictationClip"
              :clip="dictationClip"
              :dictating="dictating"
              :send-blocked="voiceSendBlocked"
              @retry="emit('voice-retry')"
              @send="emit('voice-send')"
              @dismiss="emit('voice-dismiss')"
            />
          </div>
        </div>
        <div v-else class="HomePage-StreamRow">
          <HomeMessageRow
            :message="message"
            :entering="enteringMessages.has(message.id)"
            :latest="index === messages.length - 1"
            :streaming="isStreaming"
            :compacting="isCompacting"
            :resting="isTurnFooterResting(message)"
            :branchable="canBranchFrom(message, index)"
            :branching="branching"
            :speak-state="speakStateOf(message)"
            :show-metrics="showTurnMetrics"
            @retry="emit('retry')"
            @regenerate="emit('regenerate')"
            @speak="emit('speak', message)"
            @branch="emit('branch', message.id)"
            @code-preview="emit('code-preview', $event)"
          />
        </div>
      </template>
      <template #rail="{ activeIndex, scrollToIndex }">
        <HomeMessageRail
          v-if="visible && !panelOpen"
          :items="messages"
          :active-index="activeIndex"
          @navigate="scrollToIndex($event)"
        />
      </template>
    </TxConversationStream>
  </Transition>
</template>

<style lang="scss" scoped>
.home-stream-leave-active {
  position: absolute;
  z-index: var(--home-z-leaving);
  inset: 0;
  transition: opacity 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-leave-to {
  opacity: 0;
}

.home-stream-enter-active {
  transition: opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-enter-from {
  opacity: 0;
}

.HomePage-Stream {
  flex: 1;
  width: 100%;
  min-height: 0;

  :deep(.tx-conversation-stream__pill) {
    z-index: 10;
  }
}

.HomePage-StreamRow {
  width: var(--home-chat-lane-width);
  min-width: 0;
  margin: 0 auto;
  padding-bottom: 20px;
  box-sizing: border-box;
}

.HomePage-VoiceRow {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

@media (prefers-reduced-motion: reduce) {
  .home-stream-leave-active,
  .home-stream-enter-active {
    transition: none;
  }
}
</style>
