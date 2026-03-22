<script setup lang="ts">
import type { ChatMessageModel } from '@talex-touch/tuffex'
import type { PilotComposerAttachment, PilotRuntimeStatusSnapshot, PilotToolCall, PilotTrace } from '../../composables/pilot-chat.types'
import {
  TxButton,
  TxChatComposer,
  TxChatList,
  TxDrawer,
  TxEmptyState,
  TxTypingIndicator,
} from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

interface PilotChatWorkspaceProps {
  activeSessionId: string
  running: boolean
  loadingMessages: boolean
  messages: ChatMessageModel[]
  draft: string
  composerAttachments: PilotComposerAttachment[]
  hasPausedSession: boolean
  streamError: string
  reconnectHint: string
  toolCalls: PilotToolCall[]
  traceItems: PilotTrace[]
  lastSeq: number
  traceDrawerOpen: boolean
  runtimeStatus: PilotRuntimeStatusSnapshot
  thinkingText: string
  thinkingStreaming: boolean
}

const props = defineProps<PilotChatWorkspaceProps>()

const emit = defineEmits<{
  (e: 'update:draft', value: string): void
  (e: 'update:traceDrawerOpen', value: boolean): void
  (e: 'send', payload: { text: string }): void
  (e: 'replay'): void
  (e: 'uploadFiles', files: File[]): void
}>()

const attachmentInputRef = ref<HTMLInputElement | null>(null)

const composerDisabled = computed(() => !props.activeSessionId)
const traceVisible = computed({
  get: () => props.traceDrawerOpen,
  set: value => emit('update:traceDrawerOpen', value),
})

function onDraftChange(value: string) {
  emit('update:draft', value)
}

function onComposerSend(payload: { text: string }) {
  emit('send', payload)
}

function onComposerPaste(event: ClipboardEvent) {
  if (composerDisabled.value) {
    return
  }
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.size > 0)
  if (files.length <= 0) {
    return
  }
  event.preventDefault()
  emit('uploadFiles', files)
}

function triggerAttachmentPicker() {
  if (composerDisabled.value) {
    return
  }
  attachmentInputRef.value?.click()
}

function onAttachmentSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  target.value = ''

  if (files.length <= 0) {
    return
  }

  emit('uploadFiles', files)
}
</script>

<template>
  <main class="pilot-chat">
    <div class="pilot-chat__shell">
      <TxButton
        class="pilot-chat__trace-trigger"
        size="small"
        variant="ghost"
        circle
        icon="i-carbon-debug"
        :disabled="!props.activeSessionId"
        aria-label="展开 Trace"
        @click="traceVisible = true"
      />

      <section class="pilot-chat__messages">
        <section class="pilot-runtime-bar">
          <span class="pilot-runtime-pill">
            Intent: {{ props.runtimeStatus.intentLabel }}
          </span>
          <span class="pilot-runtime-pill">
            Route: {{ props.runtimeStatus.routeLabel }}
          </span>
          <span class="pilot-runtime-pill">
            Req Model: {{ props.runtimeStatus.requestModelLabel }}
          </span>
          <span class="pilot-runtime-pill">
            Actual: {{ props.runtimeStatus.actualModelLabel }}
          </span>
          <span class="pilot-runtime-pill">
            Websearch: {{ props.runtimeStatus.websearchLabel }}
          </span>
          <span class="pilot-runtime-pill">
            Memory: {{ props.runtimeStatus.memoryLabel }}
          </span>
          <span class="pilot-runtime-pill">
            Thinking: {{ props.runtimeStatus.thinkingLabel }}
          </span>
        </section>

        <section class="pilot-stage-timeline">
          <article
            v-for="item in props.runtimeStatus.stages"
            :key="item.key"
            class="pilot-stage-item"
            :class="`is-${item.status}`"
          >
            <strong>{{ item.label }}</strong>
            <span>{{ item.detail || '-' }}</span>
          </article>
        </section>

        <section v-if="props.thinkingText" class="pilot-thinking-panel">
          <header>
            <strong>Thinking</strong>
            <span>{{ props.thinkingStreaming ? 'streaming' : 'final' }}</span>
          </header>
          <pre>{{ props.thinkingText }}</pre>
        </section>

        <TxEmptyState
          v-if="props.loadingMessages"
          class="pilot-chat__empty"
          variant="custom"
          size="small"
          surface="card"
          :loading="true"
          title="正在加载消息..."
          description=""
        />
        <TxEmptyState
          v-else-if="props.messages.length <= 0"
          class="pilot-chat__empty"
          variant="custom"
          size="small"
          surface="card"
          icon="i-carbon-chat-bot"
          title="发送第一条消息开始对话"
          description="你可以先发一个目标，我会帮你拆解执行。"
        />

        <div v-else class="pilot-chat__message-list">
          <TxChatList :messages="props.messages" :markdown="true" :stagger="false" />
        </div>

        <section v-if="props.toolCalls.length > 0" class="pilot-chat__tool-cards">
          <article v-for="item in props.toolCalls" :key="item.callId" class="pilot-tool-card">
            <header class="pilot-tool-card__header">
              <strong>{{ item.toolName }}</strong>
              <span class="pilot-tool-card__meta">
                <span>{{ item.status }}</span>
                <span>{{ item.riskLevel }}</span>
              </span>
            </header>
            <p v-if="item.inputPreview" class="pilot-tool-card__line">
              <span>Input:</span>
              <span>{{ item.inputPreview }}</span>
            </p>
            <p v-if="item.outputPreview" class="pilot-tool-card__line">
              <span>Output:</span>
              <span>{{ item.outputPreview }}</span>
            </p>
            <p v-if="item.errorMessage" class="pilot-tool-card__error">
              {{ item.errorMessage }}
            </p>
            <ul v-if="item.sources.length > 0" class="pilot-tool-card__sources">
              <li v-for="(source, sourceIndex) in item.sources" :key="`${item.callId}-${sourceIndex}`">
                <a :href="source.url" target="_blank" rel="noopener noreferrer">
                  {{ source.title || source.url }}
                </a>
              </li>
            </ul>
          </article>
        </section>

        <div v-if="props.running" class="pilot-chat__typing">
          <TxTypingIndicator variant="dots" text="Pilot 正在思考..." />
        </div>
      </section>

      <footer class="pilot-chat__dock">
        <TxChatComposer
          :model-value="props.draft"
          :disabled="composerDisabled"
          :submitting="props.running"
          allow-attachment-while-submitting
          :attachments="props.composerAttachments"
          allow-empty-send
          :placeholder="props.running ? 'Tuff Pilot 正在生成中...' : '输入消息...'"
          :min-rows="1"
          :max-rows="6"
          :send-on-meta-enter="false"
          show-attachment-button
          attachment-button-text="附件"
          send-button-text="发送"
          @update:model-value="onDraftChange"
          @attachment-click="triggerAttachmentPicker"
          @paste="onComposerPaste"
          @send="onComposerSend"
        />
        <input
          ref="attachmentInputRef"
          type="file"
          accept="image/*,application/pdf,text/*,.md,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          multiple
          class="pilot-hidden-input"
          @change="onAttachmentSelected"
        >

        <div v-if="props.hasPausedSession" class="pilot-chat__resume">
          <TxButton size="small" variant="secondary" :disabled="props.running || !props.hasPausedSession" @click="emit('replay')">
            {{ props.hasPausedSession ? '恢复 paused 会话' : '会话未 paused' }}
          </TxButton>
        </div>

        <pre v-if="props.streamError" class="pilot-error">{{ props.streamError }}</pre>
        <p v-if="props.reconnectHint" class="pilot-hint">
          {{ props.reconnectHint }}
        </p>
      </footer>
    </div>

    <TxDrawer
      v-model:visible="traceVisible"
      title="Trace"
      width="min(92vw, 420px)"
      direction="right"
    >
      <section class="pilot-trace">
        <header class="pilot-trace__header">
          <span>lastSeq: {{ props.lastSeq }}</span>
        </header>

        <div class="pilot-trace__body">
          <TxEmptyState
            v-if="props.traceItems.length <= 0"
            variant="empty"
            size="small"
            title="当前没有 Trace"
            description=""
          />

          <article v-for="item in props.traceItems" :key="item.id" class="pilot-trace-item">
            <div class="pilot-trace-item__meta">
              <span>#{{ item.seq }}</span>
              <strong>{{ item.type }}</strong>
            </div>
            <div class="pilot-trace-item__status">
              <span>{{ item.createdAt }}</span>
            </div>
            <pre>{{ JSON.stringify(item.payload || {}, null, 2) }}</pre>
          </article>
        </div>
      </section>
    </TxDrawer>
  </main>
</template>

<style scoped>
.pilot-chat {
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.pilot-chat__shell {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  min-block-size: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
}

.pilot-chat__trace-trigger {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 2;
}

.pilot-trace-item__meta,
.pilot-trace-item__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pilot-chat__messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.pilot-runtime-bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pilot-runtime-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  line-height: 1.3;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-lighter) 58%, transparent);
  color: var(--tx-text-color-regular);
}

.pilot-stage-timeline {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px;
}

.pilot-stage-item {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 54%, transparent);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pilot-stage-item strong {
  font-size: 11px;
}

.pilot-stage-item span {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pilot-stage-item.is-running {
  border-color: color-mix(in srgb, var(--tx-color-warning) 64%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning-light-9) 72%, transparent);
}

.pilot-stage-item.is-done {
  border-color: color-mix(in srgb, var(--tx-color-success) 52%, transparent);
}

.pilot-stage-item.is-skipped {
  opacity: 0.75;
}

.pilot-thinking-panel {
  flex-shrink: 0;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 90%, transparent);
  padding: 8px;
}

.pilot-thinking-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  margin-bottom: 6px;
}

.pilot-thinking-panel pre {
  margin: 0;
  max-height: 150px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.pilot-chat__empty {
  width: min(100%, 420px);
  margin: auto;
}

.pilot-chat__message-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.pilot-chat__message-list :deep(.tx-chat-message__bubble) {
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 88%, transparent);
  border-color: color-mix(in srgb, var(--tx-border-color) 72%, transparent);
}

.pilot-chat__message-list :deep(.tx-chat-message--assistant:last-child .tx-chat-message__bubble) {
  animation: pilot-assistant-fade-in 220ms ease-out;
}

.pilot-chat__message-list :deep(.tx-chat-message--user .tx-chat-message__bubble) {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tx-color-primary-light-5) 42%, transparent),
    color-mix(in srgb, var(--tx-color-primary-light-9) 70%, transparent)
  );
}

.pilot-chat__typing {
  flex-shrink: 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  padding: 8px 10px;
}

.pilot-chat__tool-cards {
  display: grid;
  gap: 8px;
  margin-top: 4px;
}

.pilot-tool-card {
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 64%, transparent);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pilot-tool-card__header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.pilot-tool-card__meta {
  display: inline-flex;
  gap: 8px;
  color: var(--tx-text-color-secondary);
}

.pilot-tool-card__line {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pilot-tool-card__error {
  margin: 0;
  color: var(--tx-color-danger);
}

.pilot-tool-card__sources {
  margin: 0;
  padding-left: 14px;
}

.pilot-chat__dock {
  flex-shrink: 0;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  padding-top: 10px;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 90%, transparent);
  backdrop-filter: blur(6px);
}

.pilot-chat__resume {
  display: flex;
  justify-content: flex-end;
}

.pilot-hidden-input {
  display: none;
}

.pilot-error {
  margin: 0;
  color: var(--tx-color-danger);
  font-size: 12px;
  max-height: 96px;
  overflow: auto;
}

.pilot-hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.pilot-trace {
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pilot-trace__header {
  margin-bottom: 8px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.pilot-trace__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding-right: 4px;
}

.pilot-trace-item {
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 12px;
  padding: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 86%, transparent);
}

.pilot-trace-item pre {
  max-height: 180px;
  overflow: auto;
  font-size: 11px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
}

.pilot-chat :deep(.tx-chat-composer) {
  position: relative;
  border-radius: 20px;
  padding: 10px 12px;
  gap: 6px;
  border-color: color-mix(in srgb, var(--tx-border-color) 78%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 96%, transparent);
  box-shadow: var(--tx-box-shadow-light);
  overflow: hidden;
}

.pilot-chat :deep(.tx-chat-composer.is-submitting)::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-color-success) 88%, transparent) 0%,
    color-mix(in srgb, var(--tx-color-success-light-7) 70%, transparent) 65%,
    color-mix(in srgb, var(--tx-color-success-light-9) 26%, transparent) 100%
  );
}

.pilot-chat :deep(.tx-chat-composer.is-submitting)::after {
  content: '';
  position: absolute;
  left: -40%;
  bottom: -2px;
  width: 42%;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-color-success) 0%, transparent) 0%,
    color-mix(in srgb, var(--tx-color-success) 92%, transparent) 28%,
    color-mix(in srgb, var(--tx-color-success-light-7) 95%, transparent) 72%,
    color-mix(in srgb, var(--tx-color-success) 0%, transparent) 100%
  );
  box-shadow: 0 0 18px color-mix(in srgb, var(--tx-color-success) 62%, transparent);
  animation: pilot-composer-glow 1.9s ease-in-out infinite;
}

.pilot-chat :deep(.tx-chat-composer__textarea) {
  border-radius: 16px;
  min-height: 48px;
  height: 48px;
  max-height: 168px;
  background: var(--tx-fill-color-blank);
  border-color: color-mix(in srgb, var(--tx-border-color) 78%, transparent);
  line-height: 1.45;
  padding: 10px 12px;
  resize: none;
  overflow-y: auto;
}

.pilot-chat :deep(.tx-chat-composer__actions-left) {
  min-width: 0;
}

.pilot-chat :deep(.tx-chat-composer__actions) {
  gap: 8px;
}

.pilot-chat :deep(.tx-chat-composer__toolbar) {
  width: 100%;
}

.pilot-chat :deep(.tx-drawer__body) {
  display: flex;
  padding: 14px;
}

@keyframes pilot-composer-glow {
  0% {
    left: -40%;
    opacity: 0.55;
  }
  55% {
    left: 58%;
    opacity: 1;
  }
  100% {
    left: 98%;
    opacity: 0.42;
  }
}

@keyframes pilot-assistant-fade-in {
  0% {
    opacity: 0.62;
    transform: translateY(4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pilot-chat :deep(.tx-chat-composer.is-submitting)::after {
    animation: none;
    left: 48%;
  }

  .pilot-chat__message-list :deep(.tx-chat-message--assistant:last-child .tx-chat-message__bubble) {
    animation: none;
  }
}

@media (max-width: 960px) {
  .pilot-chat__shell {
    width: 100%;
    gap: 6px;
  }

  .pilot-chat__trace-trigger {
    top: 8px;
    right: 8px;
  }

  .pilot-chat :deep(.tx-drawer__panel) {
    width: 100vw !important;
  }
}
</style>
