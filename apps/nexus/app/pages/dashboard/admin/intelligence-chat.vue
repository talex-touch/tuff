<script setup lang="ts">
import { networkClient } from '@talex-touch/utils/network'
import { computed, onMounted, ref, watch } from 'vue'
import { TuffInput, TxBaseSurface, TxButton, TxSpinner } from '@talex-touch/tuffex'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface ChatStreamEvent {
  type: string
  delta?: string
  message?: string
}

const { user } = useAuthUser()
const isAdmin = computed(() => user.value?.role === 'admin')

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

const messages = ref<ChatMessage[]>([])
const draftMessage = ref('')
const running = ref(false)
const errorMessage = ref('')
const loadError = ref('')
const activeAnswerId = ref<string | null>(null)

let streamAbortController: AbortController | null = null

const canSend = computed(() => draftMessage.value.trim().length > 0 && !running.value)

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function appendMessage(item: ChatMessage) {
  messages.value.push(item)
  if (messages.value.length > 200) {
    messages.value = messages.value.slice(-200)
  }
}

function appendAssistantDelta(delta: string) {
  if (!delta)
    return
  let target = activeAnswerId.value
    ? messages.value.find(item => item.id === activeAnswerId.value)
    : undefined
  if (!target) {
    target = {
      id: makeId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    activeAnswerId.value = target.id
    appendMessage(target)
  }
  target.content += delta
}

async function loadHistory() {
  try {
    const response = await networkClient.request<unknown>({
      url: '/api/admin/intelligence/chat',
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    })
    const data = response.data
    const history = Array.isArray(data) ? data : []
    messages.value = history.map((item: ChatMessage, index: number) => ({
      id: item.id || makeId(`history_${index}`),
      role: item.role === 'assistant' || item.role === 'system' ? item.role : 'user',
      content: item.content || '',
      timestamp: item.timestamp || Date.now(),
    }))
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '历史记录加载失败。'
  }
}

function handleStreamEvent(event: ChatStreamEvent) {
  if (event.type === 'assistant.delta') {
    appendAssistantDelta(event.delta || '')
    return
  }
  if (event.type === 'error') {
    errorMessage.value = event.message || 'TuffIntelligence 流式输出失败。'
    running.value = false
    activeAnswerId.value = null
    return
  }
  if (event.type === 'done') {
    running.value = false
    activeAnswerId.value = null
  }
}

async function consumeSseResponse(streamBody: ReadableStream<Uint8Array> | null) {
  if (!streamBody) {
    throw new Error('Empty stream response body.')
  }
  const reader = streamBody.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const lines = chunk
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
      for (const line of lines) {
        if (!line.startsWith('data:'))
          continue
        const jsonText = line.slice(5).trim()
        if (!jsonText)
          continue
        try {
          const event = JSON.parse(jsonText) as ChatStreamEvent
          handleStreamEvent(event)
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }
}

async function sendMessage() {
  const message = draftMessage.value.trim()
  if (!message || running.value)
    return

  errorMessage.value = ''
  running.value = true
  appendMessage({
    id: makeId('user'),
    role: 'user',
    content: message,
    timestamp: Date.now(),
  })
  draftMessage.value = ''
  streamAbortController?.abort()
  streamAbortController = new AbortController()

  try {
    const response = await networkClient.request<ReadableStream<Uint8Array> | null>({
      method: 'POST',
      url: '/api/admin/intelligence/chat',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: { message },
      signal: streamAbortController.signal,
      responseType: 'stream',
    })

    await consumeSseResponse(response.data)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发送失败。'
    running.value = false
    activeAnswerId.value = null
  }
}

onMounted(() => {
  void loadHistory()
})
</script>

<template>
  <section class="ti-chat mx-auto w-full max-w-5xl space-y-6">
    <header class="space-y-2">
      <h1 class="apple-heading-md">
        TuffIntelligence Chat
      </h1>
      <p class="ti-chat__subtitle text-sm">
        管理员专用的 TuffIntelligence 流式对话测试页。
      </p>
    </header>

    <div v-if="!isAdmin" class="ti-chat__alert rounded-2xl px-4 py-3 text-sm">
      该页面仅管理员可访问。
    </div>

    <template v-else>
      <TxBaseSurface mode="mask" :opacity="0.72" class="ti-chat__surface">
        <div class="ti-chat__scroll mb-4 space-y-3 overflow-auto rounded-2xl p-3">
          <div v-if="loadError" class="ti-chat__error text-sm">
            {{ loadError }}
          </div>
          <div v-else-if="messages.length <= 0" class="ti-chat__muted text-sm">
            发送一条消息开始对话。
          </div>
          <article
            v-for="item in messages"
            :key="item.id"
            :class="['ti-chat__bubble', `ti-chat__bubble--${item.role}`]"
          >
            <p class="ti-chat__bubble-role">
              {{ item.role }}
            </p>
            <p class="whitespace-pre-wrap break-words">
              {{ item.content }}
            </p>
          </article>
        </div>

        <form class="ti-chat__input" @submit.prevent="sendMessage">
          <TuffInput
            v-model="draftMessage"
            type="text"
            placeholder="输入消息..."
            :disabled="running"
            @keyup.enter="sendMessage"
          />
          <TxButton variant="primary" :disabled="!canSend">
            <span class="inline-flex items-center gap-2">
              <TxSpinner v-if="running" :size="14" />
              发送
            </span>
          </TxButton>
        </form>

        <p v-if="errorMessage" class="ti-chat__error mt-2 text-xs">
          {{ errorMessage }}
        </p>
      </TxBaseSurface>
    </template>
  </section>
</template>

<style scoped>
.ti-chat__subtitle,
.ti-chat__muted {
  color: color-mix(in srgb, var(--tx-text-color-secondary) 88%, transparent);
}

.ti-chat__surface {
  padding: 20px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 74%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 58%, transparent);
}

.ti-chat__scroll {
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
  max-height: 70vh;
}

.ti-chat__bubble {
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 72%, transparent);
  max-width: 82%;
}

.ti-chat__bubble--user {
  margin-left: auto;
  background: color-mix(in srgb, var(--tx-color-primary) 16%, transparent);
}

.ti-chat__bubble--assistant {
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 88%, transparent);
  border-color: color-mix(in srgb, var(--tx-color-primary) 28%, transparent);
}

.ti-chat__bubble--system {
  background: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
}

.ti-chat__bubble-role {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tx-text-color-secondary) 84%, transparent);
}

.ti-chat__input {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.ti-chat__alert {
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 48%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning) 12%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning) 90%, var(--tx-text-color-primary));
}

.ti-chat__error {
  color: var(--tx-color-danger);
}
</style>
