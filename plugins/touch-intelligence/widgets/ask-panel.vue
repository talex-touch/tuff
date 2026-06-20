<script lang="ts">
import { TxAiConversation } from '@talex-touch/tuffex/ai-elements'
import { computed, defineComponent, nextTick, ref, watch } from 'vue'

type IntelligenceWidgetStatus = 'idle' | 'ocr-pending' | 'chat-pending' | 'ready' | 'error'

interface IntelligenceWidgetAttachment {
  type?: 'image' | string
  title?: string
  detail?: string
  preview?: string
}

interface IntelligenceWidgetMessage {
  id?: string
  role?: 'user' | 'assistant' | 'system' | 'tool' | string
  content?: string
  status?: 'pending' | 'streaming' | 'complete' | 'error' | string
  attachments?: IntelligenceWidgetAttachment[]
}

interface IntelligenceImageContext {
  type?: 'image' | string
  title?: string
  preview?: string
  ocrText?: string
  status?: 'attached' | 'ready' | 'unsupported' | string
  note?: string
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
  imageContext?: IntelligenceImageContext | null
}

interface RuntimeMetadataItem {
  label: string
  value: string
}

export default defineComponent({
  name: 'ask-panel',
  components: {
    TxAiConversation,
  },
  props: {
    item: { type: Object, required: true },
    payload: { type: Object as () => IntelligenceWidgetPayload | undefined, required: false },
    hostKeyEvent: { type: Object as () => HostKeyEventEnvelope | null | undefined, required: false },
  },
  setup(props) {
    const contentRef = ref<HTMLElement | null>(null)
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
    const imageContext = computed(() => widgetPayload.value.imageContext || null)
    const isBusy = computed(() => status.value === 'ocr-pending' || status.value === 'chat-pending')
    const errorCode = computed(() => String(widgetPayload.value.errorCode || '').trim())
    const errorMessage = computed(() => String(widgetPayload.value.errorMessage || '').trim())
    const isPermissionDenied = computed(() => errorCode.value === 'PERMISSION_DENIED')
    const runtimeMetadata = computed<RuntimeMetadataItem[]>(() => {
      const payload = widgetPayload.value
      const items: RuntimeMetadataItem[] = []
      const provider = String(payload.provider || '').trim()
      const model = String(payload.model || '').trim()
      const traceId = String(payload.traceId || '').trim()
      const capabilityId = String(payload.capabilityId || '').trim()
      const inputKinds = Array.isArray(payload.inputKinds)
        ? payload.inputKinds.map(kind => String(kind).trim()).filter(Boolean)
        : []
      const latency = Number(payload.latency)

      if (provider) {
        const providerValue = provider.toLowerCase() === 'local'
          ? 'Local/Ollama (local)'
          : provider
        items.push({ label: 'Provider', value: providerValue })
      }
      if (model)
        items.push({ label: 'Model', value: model })
      if (Number.isFinite(latency) && latency >= 0)
        items.push({ label: 'Latency', value: `${Math.round(latency)} ms` })
      if (traceId)
        items.push({ label: 'Trace', value: traceId })
      if (inputKinds.length > 0)
        items.push({ label: 'Input kind', value: inputKinds.join(', ') })
      if (capabilityId)
        items.push({ label: 'Capability', value: capabilityId })

      return items
    })
    const hasRuntimeMetadata = computed(() => runtimeMetadata.value.length > 0)

    function cloneMessage(message: IntelligenceWidgetMessage): IntelligenceWidgetMessage {
      return {
        ...message,
        attachments: message.attachments?.map(attachment => ({ ...attachment })),
      }
    }

    const visibleMessages = computed(() => messages.value.map(cloneMessage))

    function scrollToBottom(force = false) {
      void nextTick(() => {
        const el = contentRef.value
        if (!el) return
        const apply = () => {
          el.scrollTop = el.scrollHeight
          el.scrollTo?.({ top: el.scrollHeight, behavior: force ? 'auto' : 'smooth' })
        }
        apply()
        requestAnimationFrame(() => {
          apply()
          requestAnimationFrame(apply)
        })
      })
    }

    watch(
      () => [visibleMessages.value, status.value, widgetPayload.value.updatedAt],
      () => scrollToBottom(true),
      { immediate: true, deep: true, flush: 'post' },
    )

    return {
      contentRef,
      status,
      messages: visibleMessages,
      isEmpty,
      imageContext,
      isBusy,
      errorCode,
      errorMessage,
      isPermissionDenied,
      runtimeMetadata,
      hasRuntimeMetadata,
      scrollToBottom,
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

        <TxAiConversation
          v-else
          class="AiChatbot__aiConversation"
          :messages="messages"
          :markdown="true"
          :compact="false"
          :show-avatar="false"
          empty-text="Start a conversation"
        />

        <div v-if="hasRuntimeMetadata" class="AiChatbot__runtimeMetadata" aria-label="Routing provider metadata">
          <strong>Routing provider metadata</strong>
          <dl>
            <template v-for="item in runtimeMetadata" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </template>
          </dl>
        </div>

        <div v-if="imageContext" class="AiImageContext" :class="`is-${imageContext.status || 'attached'}`">
          <img v-if="imageContext.preview" :src="imageContext.preview" alt="图片上下文" />
          <div>
            <strong>{{ imageContext.title || '图片上下文' }}</strong>
            <span>{{ imageContext.note || '图片已作为上下文引用。' }}</span>
          </div>
        </div>

        <div v-if="status === 'error' && errorMessage" class="AiChatbot__errorNotice">
          <strong>{{ isPermissionDenied ? '需要授权 AI 权限' : '请求失败' }}</strong>
          <span>{{ errorMessage }}</span>
          <small v-if="isPermissionDenied">请到插件权限设置中允许 intelligence.basic 后重试。</small>
        </div>
      </div>

      <button class="AiChatbot__scrollButton" type="button" aria-label="Scroll to bottom" @click="scrollToBottom(true)">
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
  min-width: 58px;
}

.AiMarkdown {
  display: inline;
}

.AiMarkdown :deep(p) {
  margin: 0 0 0.85em;
}

.AiMarkdown :deep(p:last-child),
.AiMarkdown :deep(ul:last-child),
.AiMarkdown :deep(pre:last-child) {
  margin-bottom: 0;
}

.AiMarkdown :deep(h1),
.AiMarkdown :deep(h2),
.AiMarkdown :deep(h3),
.AiMarkdown :deep(h4),
.AiMarkdown :deep(h5),
.AiMarkdown :deep(h6) {
  margin: 1em 0 0.5em;
  color: var(--ai-chat-text);
  font-weight: 700;
  line-height: 1.35;
}

.AiMarkdown :deep(h1) { font-size: 1.45em; }
.AiMarkdown :deep(h2) { font-size: 1.32em; }
.AiMarkdown :deep(h3) { font-size: 1.18em; }

.AiMarkdown :deep(ul) {
  margin: 0 0 0.85em;
  padding-left: 1.25em;
}

.AiMarkdown :deep(li + li) {
  margin-top: 0.35em;
}

.AiMarkdown :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ai-chat-text) 10%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92em;
}

.AiMarkdown :deep(pre) {
  overflow-x: auto;
  margin: 0 0 0.85em;
  padding: 12px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ai-chat-text) 8%, transparent);
}

.AiMarkdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.AiMarkdown :deep(strong) {
  font-weight: 700;
}

.AiMessage__attachments {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}

.AiAttachment,
.AiImageContext {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ai-chat-assistant-bg) 72%, transparent);
}

.AiAttachment img,
.AiImageContext img {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 10px;
  object-fit: cover;
}

.AiAttachment figcaption,
.AiImageContext div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.AiAttachment strong,
.AiImageContext strong {
  color: var(--ai-chat-text);
  font-size: 12px;
  font-weight: 700;
}

.AiAttachment span,
.AiImageContext span {
  color: var(--ai-chat-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.AiImageContext {
  max-width: min(78%, 720px);
}

.AiChatbot__runtimeMetadata {
  display: grid;
  max-width: min(78%, 720px);
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ai-chat-assistant-bg) 78%, transparent);
  color: var(--ai-chat-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.AiChatbot__runtimeMetadata strong {
  color: var(--ai-chat-text);
  font-size: 12px;
  font-weight: 700;
}

.AiChatbot__runtimeMetadata dl {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.AiChatbot__runtimeMetadata dt,
.AiChatbot__runtimeMetadata dd {
  margin: 0;
}

.AiChatbot__runtimeMetadata dt {
  color: var(--ai-chat-text-secondary);
  font-weight: 650;
}

.AiChatbot__runtimeMetadata dt::after {
  content: ':';
}

.AiChatbot__runtimeMetadata dd {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--ai-chat-text);
}

.AiImageContext.is-unsupported {
  border-color: var(--ai-chat-danger-border);
  background: var(--ai-chat-danger-bg);
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

  46%, 100% { opacity: 0; }
}
</style>
