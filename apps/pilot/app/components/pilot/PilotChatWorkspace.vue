<script setup lang="ts">
import type { ChatMessageModel } from '@talex-touch/tuffex'
import type { PilotComposerAttachment, PilotTrace } from '../../composables/pilot-chat.types'
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
  activeSessionTitle: string
  activeSessionTitleLoading: boolean
  running: boolean
  loadingMessages: boolean
  messages: ChatMessageModel[]
  draft: string
  composerAttachments: PilotComposerAttachment[]
  hasPausedSession: boolean
  streamError: string
  reconnectHint: string
  traceItems: PilotTrace[]
  lastSeq: number
  traceDrawerOpen: boolean
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

const composerDisabled = computed(() => props.running || !props.activeSessionId)
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
      <header class="pilot-chat__header">
        <div class="pilot-chat__title">
          <h1>{{ props.activeSessionTitle }}</h1>
          <p>{{ props.activeSessionId ? `Session: ${props.activeSessionId}` : '未选择会话' }}</p>
          <p v-if="props.activeSessionTitleLoading">
            AI 正在为当前会话命名...
          </p>
        </div>

        <div class="pilot-chat__actions">
          <TxButton size="small" variant="secondary" :disabled="!props.activeSessionId" @click="traceVisible = true">
            展开 Trace
          </TxButton>
        </div>
      </header>

      <section class="pilot-chat__messages">
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
          <TxChatList :messages="props.messages" :markdown="false" :stagger="false" />
        </div>

        <div v-if="props.running" class="pilot-chat__typing">
          <TxTypingIndicator variant="dots" text="Pilot 正在思考..." />
        </div>
      </section>

      <footer class="pilot-chat__dock">
        <TxChatComposer
          :model-value="props.draft"
          :disabled="composerDisabled"
          :submitting="props.running"
          :attachments="props.composerAttachments"
          :placeholder="props.running ? 'Tuff Pilot 正在生成中...' : '输入消息...'"
          :min-rows="1"
          :max-rows="6"
          :send-on-meta-enter="false"
          show-attachment-button
          attachment-button-text="附件"
          send-button-text="发送"
          @update:model-value="onDraftChange"
          @attachment-click="triggerAttachmentPicker"
          @send="onComposerSend"
        />
        <input
          ref="attachmentInputRef"
          type="file"
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
  padding: clamp(10px, 1.4vw, 20px) clamp(14px, 2.4vw, 32px) clamp(8px, 1.1vw, 14px);
}

.pilot-chat__shell {
  flex: 1;
  min-height: 0;
  height: 100%;
  width: min(100%, clamp(760px, 74vw, 980px));
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pilot-chat__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(16, 32, 58, 0.1);
}

.pilot-chat__title h1 {
  margin: 0;
  font-size: clamp(18px, 1.65vw, 22px);
  line-height: 1.2;
}

.pilot-chat__title p,
.pilot-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(16, 32, 58, 0.66);
}

.pilot-chat__actions,
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

.pilot-chat__empty {
  width: min(100%, 420px);
  margin: auto;
}

.pilot-chat__message-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.pilot-chat__message-list :deep(.tx-chat-message__bubble) {
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(16, 32, 58, 0.12);
}

.pilot-chat__message-list :deep(.tx-chat-message--user .tx-chat-message__bubble) {
  background: linear-gradient(135deg, rgba(14, 101, 255, 0.15), rgba(67, 189, 255, 0.14));
}

.pilot-chat__typing {
  flex-shrink: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  padding: 8px 10px;
}

.pilot-chat__dock {
  flex-shrink: 0;
  border-top: 1px solid rgba(16, 32, 58, 0.1);
  padding-top: 10px;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
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
  color: #dc2626;
  font-size: 12px;
  max-height: 96px;
  overflow: auto;
}

.pilot-trace {
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pilot-trace__header {
  margin-bottom: 8px;
  color: rgba(16, 32, 58, 0.72);
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
  border: 1px solid rgba(16, 32, 58, 0.14);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.82);
}

.pilot-trace-item pre {
  max-height: 180px;
  overflow: auto;
  font-size: 11px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  padding: 8px;
  border-radius: 8px;
}

.pilot-chat :deep(.tx-chat-composer) {
  position: relative;
  border-radius: 20px;
  padding: 10px 12px;
  gap: 6px;
  border-color: rgba(16, 32, 58, 0.18);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 8px 16px rgba(16, 32, 58, 0.08);
  overflow: hidden;
}

.pilot-chat :deep(.tx-chat-composer.is-submitting)::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, rgba(46, 216, 136, 0.88) 0%, rgba(65, 231, 173, 0.62) 65%, rgba(65, 231, 173, 0.12) 100%);
}

.pilot-chat :deep(.tx-chat-composer.is-submitting)::after {
  content: '';
  position: absolute;
  left: -40%;
  bottom: -2px;
  width: 42%;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(33, 225, 142, 0) 0%, rgba(33, 225, 142, 0.9) 28%, rgba(62, 242, 188, 0.95) 72%, rgba(62, 242, 188, 0) 100%);
  box-shadow: 0 0 18px rgba(43, 231, 162, 0.72);
  animation: pilot-composer-glow 1.9s ease-in-out infinite;
}

.pilot-chat :deep(.tx-chat-composer__textarea) {
  border-radius: 16px;
  min-height: 48px;
  height: 48px;
  max-height: 168px;
  background: #fff;
  border-color: rgba(16, 32, 58, 0.16);
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

@media (prefers-reduced-motion: reduce) {
  .pilot-chat :deep(.tx-chat-composer.is-submitting)::after {
    animation: none;
    left: 48%;
  }
}

@media (max-width: 1200px) {
  .pilot-chat__shell {
    width: min(100%, 860px);
  }
}

@media (max-width: 960px) {
  .pilot-chat {
    padding: 10px 12px 8px;
  }

  .pilot-chat__shell {
    width: 100%;
    gap: 8px;
  }

  .pilot-chat :deep(.tx-drawer__panel) {
    width: 100vw !important;
  }
}
</style>
