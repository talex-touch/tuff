<script setup lang="ts">
import { TxButton, TxFlipOverlay, TxMarkdownView, TxSearchInput, TxSpinner } from '@talex-touch/tuffex'
import { computed, nextTick, ref, watch } from 'vue'

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind?: 'tool' | 'status'
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    source?: HTMLElement | null
    docTitle?: string
    docPath?: string
    docContext?: string
  }>(),
  {
    source: null,
    docTitle: '',
    docPath: '',
    docContext: '',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { locale } = useI18n()
const messages = ref<AssistantMessage[]>([])
const input = ref('')
const sending = ref(false)
const errorMessage = ref('')
const sessionId = ref<string | null>(null)
const historyLoading = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
const sessionStorageKey = computed(() => (
  props.docPath ? `docs-assistant-session:${props.docPath}` : 'docs-assistant-session:default'
))

const labels = computed(() => ({
  title: 'Tuff Assistant',
  placeholder: locale.value === 'zh' ? '输入问题或粘贴错误...' : 'Ask docs or paste an issue...',
  empty: locale.value === 'zh' ? '输入问题开始对话' : 'Ask a question to get started',
  send: locale.value === 'zh' ? '发送' : 'Send',
  retry: locale.value === 'zh' ? '重试' : 'Retry',
  close: locale.value === 'zh' ? '关闭' : 'Close',
}))

const payloadMessages = computed(() => messages.value.filter(message => !message.kind))

const assistantPayload = computed(() => ({
  sessionId: sessionId.value || undefined,
  messages: payloadMessages.value.map(message => ({
    role: message.role,
    content: message.content,
  })),
  doc: {
    title: props.docTitle || undefined,
    path: props.docPath || undefined,
    context: props.docContext || undefined,
  },
  locale: locale.value,
}))

watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      void loadHistory()
    }
  },
)

watch(
  () => props.docPath,
  () => {
    messages.value = []
    sessionId.value = null
    errorMessage.value = ''
    if (props.modelValue)
      void loadHistory()
  },
)

watch(
  sessionId,
  (value) => {
    if (!import.meta.client)
      return
    const key = sessionStorageKey.value
    if (value)
      window.localStorage.setItem(key, value)
    else
      window.localStorage.removeItem(key)
  },
)

function createId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function scrollToBottom() {
  if (!scrollRef.value)
    return
  scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

function formatToolMessage(name?: string, rawArgs?: string) {
  const label = locale.value === 'zh' ? '调用工具' : 'Tool call'
  const toolName = name || 'unknown'
  const args = typeof rawArgs === 'string' ? rawArgs.trim() : ''
  if (!args)
    return `${label}: ${toolName}`

  let preview = args
  try {
    const parsed = JSON.parse(args)
    preview = JSON.stringify(parsed)
  }
  catch {}
  if (preview.length > 600)
    preview = `${preview.slice(0, 600)}...`
  return `${label}: ${toolName}\n${preview}`
}

function closeDialog() {
  emit('update:modelValue', false)
}

function loadStoredSessionId() {
  if (!import.meta.client)
    return
  if (sessionId.value)
    return
  try {
    const stored = window.localStorage.getItem(sessionStorageKey.value)
    if (stored)
      sessionId.value = stored
  }
  catch {}
}

async function loadHistory() {
  if (historyLoading.value)
    return

  loadStoredSessionId()
  if (messages.value.length) {
    await nextTick()
    scrollToBottom()
    return
  }

  const params = new URLSearchParams()
  if (sessionId.value)
    params.set('sessionId', sessionId.value)
  if (props.docPath)
    params.set('path', props.docPath)
  if (!params.toString()) {
    await nextTick()
    scrollToBottom()
    return
  }

  historyLoading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`/api/docs/assistant/history?${params.toString()}`)
    const data = await response.json() as {
      ok: boolean
      result?: { sessionId?: string | null; messages?: AssistantMessage[] }
      error?: string
    }

    if (!data.ok)
      throw new Error(data.error || 'Request failed')

    if (data.result?.sessionId)
      sessionId.value = data.result.sessionId

    if (Array.isArray(data.result?.messages) && data.result?.messages.length) {
      messages.value = data.result.messages.map(message => ({
        id: message.id || createId(),
        role: message.role,
        content: message.content,
      }))
    }
  }
  catch (error: any) {
    errorMessage.value = error?.message || (locale.value === 'zh' ? '请求失败' : 'Request failed')
  }
  finally {
    historyLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function requestAnswer() {
  if (sending.value || historyLoading.value || !messages.value.length)
    return

  sending.value = true
  errorMessage.value = ''
  const payload = { ...assistantPayload.value, stream: true }
  const assistantMessage: AssistantMessage = {
    id: createId(),
    role: 'assistant',
    content: '',
  }
  messages.value.push(assistantMessage)

  try {
    const response = await fetch('/api/docs/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream')) {
      await readStreamResponse(response, assistantMessage)
    }
    else {
      const data = await response.json() as {
        ok: boolean
        result?: { content?: string; sessionId?: string }
        error?: string
      }
      if (!data.ok)
        throw new Error(data.error || 'Request failed')

      if (data.result?.sessionId)
        sessionId.value = data.result.sessionId

      assistantMessage.content = (data.result?.content || '').trim()
        || (locale.value === 'zh' ? '未返回内容' : 'No response.')
    }
  }
  catch (error: any) {
    errorMessage.value = error?.message || (locale.value === 'zh' ? '请求失败' : 'Request failed')
  }
  finally {
    sending.value = false
    if (!assistantMessage.content) {
      messages.value = messages.value.filter(item => item.id !== assistantMessage.id)
    }
    await nextTick()
    scrollToBottom()
  }
}

async function sendMessage() {
  const content = input.value.trim()
  if (!content || sending.value || historyLoading.value)
    return

  messages.value.push({
    id: createId(),
    role: 'user',
    content,
  })
  input.value = ''
  await nextTick()
  scrollToBottom()
  await requestAnswer()
}

async function retrySend() {
  await requestAnswer()
}

async function readStreamResponse(response: Response, target: AssistantMessage) {
  if (!response.body)
    throw new Error(locale.value === 'zh' ? '流式响应不可用' : 'Streaming response unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''

    for (const part of parts) {
      const line = part.split('\n').find(item => item.startsWith('data:'))
      if (!line)
        continue
      const payload = line.slice(5).trim()
      if (!payload)
        continue

      let data: any = null
      try {
        data = JSON.parse(payload)
      }
      catch {
        continue
      }

      if (data?.type === 'delta' && typeof data.content === 'string') {
        target.content += data.content
        await nextTick()
        scrollToBottom()
      }
      if (data?.type === 'tool') {
        const toolMessage: AssistantMessage = {
          id: createId(),
          role: 'assistant',
          content: formatToolMessage(data?.name, data?.arguments),
          kind: 'tool',
        }
        messages.value.push(toolMessage)
        await nextTick()
        scrollToBottom()
      }
      if (data?.type === 'status' && typeof data.content === 'string') {
        const statusMessage: AssistantMessage = {
          id: createId(),
          role: 'assistant',
          content: data.content,
          kind: 'status',
        }
        messages.value.push(statusMessage)
        await nextTick()
        scrollToBottom()
      }
      if (data?.type === 'meta' && typeof data.sessionId === 'string') {
        sessionId.value = data.sessionId
      }
      if (data?.type === 'error') {
        errorMessage.value = data.message || (locale.value === 'zh' ? '请求失败' : 'Request failed')
        return
      }
      if (data?.type === 'done') {
        return
      }
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="props.source"
      :duration="420"
      :rotate-x="6"
      :rotate-y="8"
      transition-name="AssistantOverlay-Mask"
      mask-class="AssistantOverlay-Mask"
      card-class="AssistantOverlay-Card"
    >
      <template #default>
        <div class="assistant-dialog">
          <header class="assistant-dialog__header">
            <div class="assistant-dialog__title">
              <span class="assistant-dialog__spark">✦</span>
              {{ labels.title }}
            </div>
            <TxButton
              variant="ghost"
              size="mini"
              class="assistant-dialog__close"
              native-type="button"
              :aria-label="labels.close"
              @click="closeDialog"
            >
              <span class="i-carbon-close" />
            </TxButton>
          </header>

          <div ref="scrollRef" class="assistant-dialog__messages">
            <div v-if="!messages.length" class="assistant-dialog__empty">
              {{ labels.empty }}
            </div>
            <div
              v-for="message in messages"
              :key="message.id"
              class="assistant-dialog__message"
              :class="[
                `assistant-dialog__message--${message.role}`,
                message.kind ? `assistant-dialog__message--${message.kind}` : '',
              ]"
            >
              <div
                class="assistant-dialog__bubble"
                :class="{
                  'assistant-dialog__bubble--tool': message.kind === 'tool',
                  'assistant-dialog__bubble--status': message.kind === 'status',
                }"
              >
                <TxMarkdownView
                  v-if="message.role === 'assistant' && message.kind !== 'tool'"
                  :content="message.content"
                  theme="dark"
                />
                <span v-else>{{ message.content }}</span>
              </div>
            </div>
            <div v-if="sending" class="assistant-dialog__thinking">
              <TxSpinner :size="18" />
              <span>{{ locale === 'zh' ? '思考中...' : 'Thinking...' }}</span>
            </div>
          </div>

          <div v-if="errorMessage" class="assistant-dialog__error">
            <span>{{ errorMessage }}</span>
            <TxButton size="mini" variant="ghost" native-type="button" @click="retrySend">
              {{ labels.retry }}
            </TxButton>
          </div>

          <div class="assistant-dialog__input">
            <TxSearchInput
              v-model="input"
              :placeholder="labels.placeholder"
              class="assistant-dialog__search"
              clearable
              :disabled="sending || historyLoading"
              @search="sendMessage"
            />
            <TxButton
              variant="primary"
              size="small"
              class="assistant-dialog__send"
              native-type="button"
              :disabled="sending || historyLoading || !input.trim()"
              @click="sendMessage"
            >
              {{ labels.send }}
            </TxButton>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped>
.assistant-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  gap: 16px;
}

.assistant-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.assistant-dialog__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.assistant-dialog__spark {
  color: #3b82f6;
  font-size: 16px;
}

.assistant-dialog__close {
  color: var(--tx-text-color-secondary);
}

.assistant-dialog__messages {
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assistant-dialog__empty {
  margin: auto;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.assistant-dialog__message {
  display: flex;
}

.assistant-dialog__message--user {
  justify-content: flex-end;
}

.assistant-dialog__message--assistant {
  justify-content: flex-start;
}

.assistant-dialog__message--tool,
.assistant-dialog__message--status {
  justify-content: flex-start;
}

.assistant-dialog__bubble {
  max-width: min(520px, 90%);
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  background: rgba(15, 23, 42, 0.06);
  color: var(--tx-text-color-primary);
  white-space: pre-wrap;
}

.assistant-dialog__message--user .assistant-dialog__bubble {
  background: rgba(59, 130, 246, 0.14);
}

.assistant-dialog__bubble--tool {
  background: rgba(148, 163, 184, 0.12);
  border: 1px dashed rgba(148, 163, 184, 0.45);
  font-size: 12px;
  white-space: pre-wrap;
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
}

.assistant-dialog__bubble--status {
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(148, 163, 184, 0.35);
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.assistant-dialog__bubble :deep(.markdown-body) {
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1.55;
}

.assistant-dialog__bubble :deep(.markdown-body p) {
  margin: 0 0 0.6em;
}

.assistant-dialog__bubble :deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

.assistant-dialog__thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.assistant-dialog__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 12px;
}

.assistant-dialog__input {
  display: flex;
  gap: 10px;
  align-items: center;
}

.assistant-dialog__search {
  flex: 1;
}

.assistant-dialog__send {
  min-width: 72px;
}
</style>

<style>
.AssistantOverlay-Mask {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgba(12, 12, 16, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.AssistantOverlay-Mask-enter-active,
.AssistantOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.AssistantOverlay-Mask-enter-from,
.AssistantOverlay-Mask-leave-to {
  opacity: 0;
}

.AssistantOverlay-Card {
  width: min(860px, 92vw);
  height: min(72vh, 720px);
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 1.1rem;
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}
</style>
