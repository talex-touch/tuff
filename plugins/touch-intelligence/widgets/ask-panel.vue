<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type IntelligenceWidgetStatus = 'idle' | 'ocr-pending' | 'chat-pending' | 'ready' | 'error'

interface IntelligenceWidgetMessage {
  id?: string
  role?: 'user' | 'assistant' | 'system' | 'tool' | string
  content?: string
  status?: 'pending' | 'streaming' | 'complete' | 'error' | string
}

interface IntelligenceWidgetPayload {
  requestId?: string
  prompt?: string
  answer?: string
  status?: string
  provider?: string
  model?: string
  latency?: number
  traceId?: string
  capabilityId?: string
  inputKinds?: string[]
  errorCode?: string
  errorMessage?: string
  messages?: IntelligenceWidgetMessage[]
}

export default defineComponent({
  name: 'ask-panel',
  props: {
    item: { type: Object, required: true },
    payload: { type: Object as () => IntelligenceWidgetPayload | undefined, required: false },
    hostKeyEvent: { type: Object as () => HostKeyEventEnvelope | null | undefined, required: false },
  },
  setup(props) {
    const contentRef = ref<HTMLElement | null>(null)
    const renderedMessages = ref<IntelligenceWidgetMessage[]>([])
    let streamTimer: ReturnType<typeof setInterval> | null = null
    const widgetPayload = computed<IntelligenceWidgetPayload>(() => props.payload ?? {})
    const status = computed<IntelligenceWidgetStatus>(() => {
      const value = widgetPayload.value.status
      if (value === 'ocr-pending' || value === 'chat-pending' || value === 'ready' || value === 'error') {
        return value
      }
      return 'idle'
    })
    const messages = computed<IntelligenceWidgetMessage[]>(() => {
      if (Array.isArray(widgetPayload.value.messages) && widgetPayload.value.messages.length > 0) {
        return widgetPayload.value.messages.filter(message => {
          const content = message?.content?.trim()
          return Boolean(content || message?.status === 'streaming' || message?.status === 'pending')
        })
      }
      return []
    })
    const isEmpty = computed(() => messages.value.length === 0)
    const isBusy = computed(() => status.value === 'ocr-pending' || status.value === 'chat-pending')
    const errorCode = computed(() => String(widgetPayload.value.errorCode || '').trim())
    const errorMessage = computed(() => String(widgetPayload.value.errorMessage || '').trim())
    const isPermissionDenied = computed(() => errorCode.value === 'PERMISSION_DENIED')
    function clearStreamTimer() {
      if (!streamTimer) return
      clearInterval(streamTimer)
      streamTimer = null
    }

    function cloneMessage(message: IntelligenceWidgetMessage): IntelligenceWidgetMessage {
      return { ...message }
    }

    function syncRenderedMessages() {
      clearStreamTimer()
      const nextMessages = messages.value.map(cloneMessage)
      const lastIndex = nextMessages.length - 1
      const lastMessage = nextMessages[lastIndex]
      const shouldStream =
        status.value === 'ready' &&
        lastMessage?.role === 'assistant' &&
        lastMessage.status === 'complete' &&
        Boolean(lastMessage.content?.trim())

      if (!shouldStream) {
        renderedMessages.value = nextMessages
        scrollToBottom()
        return
      }

      const fullContent = lastMessage.content || ''
      renderedMessages.value = nextMessages.map((message, index) =>
        index === lastIndex ? { ...message, content: '', status: 'streaming' } : message,
      )

      let cursor = 0
      streamTimer = setInterval(() => {
        cursor = Math.min(fullContent.length, cursor + Math.max(1, Math.ceil(fullContent.length / 36)))
        renderedMessages.value = renderedMessages.value.map((message, index) =>
          index === lastIndex
            ? {
                ...message,
                content: fullContent.slice(0, cursor),
                status: cursor >= fullContent.length ? 'complete' : 'streaming',
              }
            : message,
        )
        scrollToBottom()
        if (cursor >= fullContent.length) {
          clearStreamTimer()
        }
      }, 28)
    }

    function scrollToBottom() {
      void nextTick(() => {
        const el = contentRef.value
        if (!el) return
        el.scrollTop = el.scrollHeight
      })
    }

    watch(
      () => [messages.value, status.value, widgetPayload.value.updatedAt],
      () => syncRenderedMessages(),
      { immediate: true, deep: true },
    )

    onBeforeUnmount(() => clearStreamTimer())

    return {
      contentRef,
      status,
      messages: renderedMessages,
      isEmpty,
      isBusy,
      errorCode,
      errorMessage,
      isPermissionDenied,
    }
  },
})
</script>

<template>
  <section class="AiChatbot" aria-live="polite">
    <div class="AiChatbot__conversation">
      <div ref="contentRef" class="AiChatbot__content">
        <div v-if="isEmpty" class="AiChatbot__empty">
          <div class="AiChatbot__emptyIcon">
            <i class="i-carbon-chat" />
          </div>
          <strong>Start a conversation</strong>
          <span>Messages will appear here as the conversation progresses.</span>
        </div>

        <template v-else>
          <article
            v-for="(message, index) in messages"
            :key="message.id || `${message.role}-${index}`"
            :class="[
              'AiMessage',
              `AiMessage--${message.role === 'user' ? 'user' : 'assistant'}`,
              { 'is-streaming': message.status === 'streaming' || message.status === 'pending' },
              { 'is-error': status === 'error' && index === messages.length - 1 },
            ]"
          >
            <div class="AiMessage__content">
              <template v-if="message.status === 'streaming' || message.status === 'pending'">
                <span class="AiTypingDot" />
                <span class="AiTypingDot" />
                <span class="AiTypingDot" />
              </template>
              <template v-else>
                {{ message.content }}
              </template>
            </div>
          </article>
        </template>

        <div v-if="status === 'error' && errorMessage" class="AiChatbot__errorNotice">
          <strong>{{ isPermissionDenied ? '需要授权 AI 权限' : '请求失败' }}</strong>
          <span>{{ errorMessage }}</span>
          <small v-if="isPermissionDenied">请到插件权限设置中允许 intelligence.basic 后重试。</small>
        </div>
      </div>

      <button class="AiChatbot__scrollButton" type="button" aria-label="Scroll to bottom">
        ↓
      </button>
    </div>
  </section>
</template>

<style scoped>
.AiChatbot {
  --ai-chat-bg: transparent;
  --ai-chat-text: var(--tx-text-color-primary, #1f2937);
  --ai-chat-text-secondary: var(--tx-text-color-secondary, #6b7280);
  --ai-chat-border: color-mix(in srgb, var(--tx-border-color, #dcdfe6) 72%, transparent);
  --ai-chat-assistant-bg: color-mix(in srgb, var(--tx-fill-color, #f3f4f6) 82%, transparent);
  --ai-chat-user-bg: color-mix(in srgb, var(--tx-color-primary, #3082ff) 18%, transparent);
  --ai-chat-user-border: color-mix(in srgb, var(--tx-color-primary, #3082ff) 42%, transparent);
  --ai-chat-floating-bg: color-mix(in srgb, var(--tx-bg-color, #ffffff) 86%, transparent);
  --ai-chat-danger-bg: color-mix(in srgb, var(--tx-color-danger, #e5484d) 14%, transparent);
  --ai-chat-danger-border: color-mix(in srgb, var(--tx-color-danger, #e5484d) 28%, transparent);
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--ai-chat-bg);
  color: var(--ai-chat-text);
}

.AiChatbot__conversation {
  position: relative;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.AiChatbot__content {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 24px 28px;
  scrollbar-width: thin;
}

.AiChatbot__empty {
  display: flex;
  height: 100%;
  min-height: 240px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ai-chat-text-secondary);
  text-align: center;
}

.AiChatbot__emptyIcon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  color: var(--tx-color-primary, #3082ff);
  font-size: 24px;
}

.AiChatbot__empty strong {
  color: var(--ai-chat-text);
  font-size: 16px;
  font-weight: 650;
}

.AiChatbot__empty span {
  max-width: 340px;
  font-size: 14px;
  line-height: 1.6;
}

.AiMessage {
  display: flex;
  width: 100%;
}

.AiMessage--user {
  justify-content: flex-end;
}

.AiMessage--assistant {
  justify-content: flex-start;
}

.AiMessage__content {
  max-width: min(78%, 720px);
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 16px;
  color: var(--ai-chat-text);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.AiMessage--user .AiMessage__content {
  border: 1px solid var(--ai-chat-user-border);
  background: var(--ai-chat-user-bg);
}

.AiMessage--assistant .AiMessage__content {
  border: 1px solid var(--ai-chat-border);
  background: var(--ai-chat-assistant-bg);
}

.AiMessage.is-error .AiMessage__content {
  border-color: var(--ai-chat-danger-border);
  background: var(--ai-chat-danger-bg);
  color: var(--tx-color-danger, #e5484d);
}

.AiMessage.is-streaming .AiMessage__content {
  display: inline-flex;
  min-width: 58px;
  align-items: center;
  gap: 5px;
}

.AiTypingDot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  animation: ai-conversation-dot 1.15s ease-in-out infinite;
  background: var(--ai-chat-text-secondary);
}

.AiTypingDot:nth-child(2) { animation-delay: 0.14s; }
.AiTypingDot:nth-child(3) { animation-delay: 0.28s; }

.AiChatbot__errorNotice {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--ai-chat-danger-border);
  border-radius: 14px;
  background: var(--ai-chat-danger-bg);
  color: var(--tx-color-danger, #e5484d);
  font-size: 13px;
  line-height: 1.5;
}

.AiChatbot__errorNotice strong {
  font-size: 14px;
  font-weight: 700;
}

.AiChatbot__errorNotice small {
  color: color-mix(in srgb, var(--tx-color-danger, #e5484d) 78%, var(--ai-chat-text));
  font-size: 12px;
}

.AiChatbot__scrollButton {
  position: absolute;
  right: 24px;
  bottom: 18px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--ai-chat-border);
  border-radius: 999px;
  background: var(--ai-chat-floating-bg);
  color: var(--ai-chat-text-secondary);
  font-size: 16px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ai-chat-text) 10%, transparent);
}

@keyframes ai-conversation-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
  40% { transform: translateY(-3px); opacity: 1; }
}
</style>
