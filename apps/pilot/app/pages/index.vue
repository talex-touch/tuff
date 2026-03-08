<script setup lang="ts">
import type { ChatMessageModel, StatusTone } from '@talex-touch/tuffex'
import {
  TxButton,
  TxChatComposer,
  TxChatList,
  TxDrawer,
  TxEmptyState,
  TxStatusBadge,
  TxTypingIndicator,
} from '@talex-touch/tuffex'
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface PilotSession {
  sessionId: string
  status: 'idle' | 'planning' | 'executing' | 'paused_disconnect' | 'completed' | 'failed'
  title?: string | null
  lastSeq: number
  updatedAt: string
  pauseReason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted' | null
}

interface PilotMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

interface PilotAttachment {
  id: string
  sessionId: string
  kind: 'image' | 'file'
  name: string
  mimeType: string
  size: number
  ref: string
  createdAt?: string
}

interface PilotTrace {
  id: string
  seq: number
  type: string
  createdAt: string
  payload: Record<string, unknown>
}

interface PilotComposerAttachment {
  id: string
  label: string
  kind?: string
  pending?: boolean
}

interface StreamEvent {
  type: string
  sessionId?: string
  turnId?: string
  seq?: number
  delta?: string
  message?: string
  reason?: string
  detail?: Record<string, unknown>
  envelope?: Record<string, unknown>
  payload?: Record<string, unknown>
  replay?: boolean
  timestamp?: number
}

interface SessionMessagesResponse {
  messages: PilotMessage[]
  attachments: PilotAttachment[]
}

interface SessionTraceResponse {
  traces: PilotTrace[]
}

interface SessionTitleResponse {
  title: string
  generated: boolean
  source: 'stored' | 'ai' | 'fallback' | 'empty'
}

const pilotTitle = useRuntimeConfig().public.pilotTitle || 'Tuff Pilot'

const sessions = ref<PilotSession[]>([])
const activeSessionId = ref('')
const messages = ref<PilotMessage[]>([])
const traceItems = ref<PilotTrace[]>([])
const attachments = ref<PilotAttachment[]>([])
const pendingAttachments = ref<PilotAttachment[]>([])
const draft = ref('')
const running = ref(false)
const loadingSessions = ref(false)
const loadingMessages = ref(false)
const traceDrawerOpen = ref(false)
const streamError = ref('')
const reconnectHint = ref('')
const activeAssistantMessageId = ref<string | null>(null)
const lastSeq = ref(0)
const deletingSessionId = ref('')
const titleLoadingMap = ref<Record<string, boolean>>({})
const attachmentInputRef = ref<HTMLInputElement | null>(null)

let streamAbortController: AbortController | null = null

const activeSession = computed(() => sessions.value.find(item => item.sessionId === activeSessionId.value) || null)
const hasPausedSession = computed(() => activeSession.value?.status === 'paused_disconnect')
const activeSessionTitle = computed(() => {
  const title = String(activeSession.value?.title || '').trim()
  if (title) {
    return title
  }
  return activeSessionId.value ? `会话 ${shortSessionId(activeSessionId.value)}` : '新会话'
})
const chatListMessages = computed<ChatMessageModel[]>(() => {
  return messages.value.map((item) => {
    const stamp = Date.parse(item.createdAt)
    return {
      id: item.id,
      role: item.role,
      content: item.content,
      createdAt: Number.isFinite(stamp) ? stamp : undefined,
    }
  })
})
const composerAttachments = computed<PilotComposerAttachment[]>(() => {
  const pendingSet = new Set(pendingAttachments.value.map(item => item.id))
  return attachments.value.map((item) => {
    return {
      id: item.id,
      label: item.name,
      kind: item.kind,
      pending: pendingSet.has(item.id),
    }
  })
})

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function clampInputText(value: string): string {
  return value.trim().slice(0, 4000)
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(-8)
}

function isSessionTitleLoading(sessionId: string): boolean {
  return Boolean(titleLoadingMap.value[sessionId])
}

function setSessionTitleLoading(sessionId: string, loading: boolean) {
  const next = { ...titleLoadingMap.value }
  if (loading) {
    next[sessionId] = true
  }
  else {
    delete next[sessionId]
  }
  titleLoadingMap.value = next
}

function getSessionDisplayTitle(item: PilotSession): string {
  const title = String(item.title || '').trim()
  if (title) {
    return title
  }
  return `会话 ${shortSessionId(item.sessionId)}`
}

function getStatusTone(status: PilotSession['status']): StatusTone {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'executing' || status === 'planning') {
    return 'warning'
  }
  if (status === 'failed') {
    return 'danger'
  }
  if (status === 'paused_disconnect') {
    return 'info'
  }
  return 'muted'
}

function toReadableTime(value: string | undefined): string {
  if (!value)
    return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '--'
  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

function triggerAttachmentPicker() {
  if (running.value) {
    return
  }
  attachmentInputRef.value?.click()
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return await response.json() as T
}

function sortSessions(list: PilotSession[]): PilotSession[] {
  return [...list].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

async function createSession(): Promise<string> {
  const data = await fetchJson<{ session: PilotSession }>('/api/pilot/chat/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  const targetSessionId = data.session.sessionId
  await refreshSessions(targetSessionId)
  return targetSessionId
}

async function handleCreateSession() {
  const createdId = await createSession()
  await selectSession(createdId)
}

async function refreshSessions(preferSessionId?: string) {
  loadingSessions.value = true
  try {
    const data = await fetchJson<{ sessions: PilotSession[] }>('/api/pilot/chat/sessions?limit=50')
    sessions.value = sortSessions(Array.isArray(data.sessions) ? data.sessions : [])

    const preferred = preferSessionId && sessions.value.some(item => item.sessionId === preferSessionId)
      ? preferSessionId
      : ''

    if (preferred) {
      activeSessionId.value = preferred
      return
    }

    if (!activeSessionId.value || !sessions.value.some(item => item.sessionId === activeSessionId.value)) {
      activeSessionId.value = sessions.value[0]?.sessionId || ''
    }
  }
  finally {
    loadingSessions.value = false
  }
}

async function summarizeSessionTitle(sessionId: string, force = false) {
  if (!sessionId || isSessionTitleLoading(sessionId)) {
    return
  }

  setSessionTitleLoading(sessionId, true)

  try {
    const data = await fetchJson<SessionTitleResponse>(`/api/pilot/chat/sessions/${sessionId}/title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    })

    const title = String(data.title || '').trim()
    if (!title) {
      return
    }

    sessions.value = sessions.value.map(item => (
      item.sessionId === sessionId
        ? {
            ...item,
            title,
          }
        : item
    ))
  }
  catch {
    // Ignore title generation errors and keep fallback title rendering.
  }
  finally {
    setSessionTitleLoading(sessionId, false)
  }
}

async function maybeSummarizeActiveSessionTitle(sessionId: string) {
  const current = sessions.value.find(item => item.sessionId === sessionId)
  if (!current || String(current.title || '').trim()) {
    return
  }

  const hasUserMessage = messages.value.some(item => item.role === 'user' && item.content.trim())
  if (!hasUserMessage) {
    return
  }

  await summarizeSessionTitle(sessionId)
}

function mapTrace(type: string, seq: number, payload: Record<string, unknown> = {}): PilotTrace {
  const now = new Date().toISOString()
  return {
    id: makeId('trace_local'),
    seq,
    type,
    createdAt: now,
    payload,
  }
}

function toPrettyErrorMessage(message: string, detail?: Record<string, unknown>): string {
  const text = String(message || '').trim()
  if (!detail || Object.keys(detail).length <= 0) {
    return text || 'Stream error'
  }
  const normalized = { ...detail }
  if (normalized.message === text) {
    delete normalized.message
  }
  return `${text || 'Stream error'}\n${JSON.stringify(normalized, null, 2)}`
}

function appendTrace(item: PilotTrace) {
  const exists = traceItems.value.some(trace => trace.seq === item.seq && trace.type === item.type)
  if (!exists) {
    traceItems.value.push(item)
  }
  traceItems.value = traceItems.value.slice(-800)
  traceItems.value.sort((left, right) => left.seq - right.seq)
  const maxSeq = traceItems.value.reduce((acc, row) => Math.max(acc, row.seq), lastSeq.value)
  lastSeq.value = maxSeq
}

function appendAssistantDelta(delta: string) {
  const content = String(delta || '').slice(0, 4000)
  if (!content)
    return

  let target = activeAssistantMessageId.value
    ? messages.value.find(item => item.id === activeAssistantMessageId.value)
    : undefined

  if (!target) {
    target = {
      id: makeId('msg_assistant'),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }
    activeAssistantMessageId.value = target.id
    messages.value.push(target)
  }

  target.content += content
}

async function loadSessionMessages(sessionId: string) {
  if (!sessionId)
    return

  loadingMessages.value = true
  try {
    const data = await fetchJson<SessionMessagesResponse>(`/api/pilot/chat/sessions/${sessionId}/messages`)
    messages.value = Array.isArray(data.messages) ? data.messages : []
    attachments.value = Array.isArray(data.attachments) ? data.attachments : []
    pendingAttachments.value = []
    activeAssistantMessageId.value = null
  }
  finally {
    loadingMessages.value = false
  }
}

async function loadSessionTrace(sessionId: string, fromSeq = 1, append = false) {
  if (!sessionId)
    return

  const data = await fetchJson<SessionTraceResponse>(`/api/pilot/chat/sessions/${sessionId}/trace?fromSeq=${fromSeq}&limit=500`)
  const items = Array.isArray(data.traces) ? data.traces : []

  if (!append) {
    traceItems.value = items
  }
  else {
    for (const item of items) {
      appendTrace(item)
    }
  }

  lastSeq.value = traceItems.value.reduce((acc, row) => Math.max(acc, Number(row.seq || 0)), 0)
}

async function selectSession(sessionId: string) {
  if (!sessionId || (running.value && sessionId !== activeSessionId.value)) {
    return
  }

  activeSessionId.value = sessionId
  await Promise.all([
    loadSessionMessages(sessionId),
    loadSessionTrace(sessionId),
  ])

  void maybeSummarizeActiveSessionTitle(sessionId)
}

async function deleteSession(sessionId: string) {
  if (!sessionId || deletingSessionId.value) {
    return
  }

  deletingSessionId.value = sessionId

  try {
    if (running.value && activeSessionId.value === sessionId) {
      streamAbortController?.abort()
      running.value = false
    }

    await fetchJson<{ ok: boolean }>(`/api/pilot/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    })

    if (activeSessionId.value === sessionId) {
      activeSessionId.value = ''
      messages.value = []
      traceItems.value = []
      attachments.value = []
      pendingAttachments.value = []
      activeAssistantMessageId.value = null
      lastSeq.value = 0
      streamError.value = ''
      reconnectHint.value = ''
    }

    await refreshSessions()

    const nextSessionId = sessions.value[0]?.sessionId || ''
    if (!activeSessionId.value && nextSessionId) {
      await selectSession(nextSessionId)
    }

    if (sessions.value.length <= 0) {
      const created = await createSession()
      await selectSession(created)
    }
  }
  finally {
    deletingSessionId.value = ''
  }
}

async function ensureActiveSession(): Promise<string> {
  if (activeSessionId.value) {
    return activeSessionId.value
  }
  const id = await createSession()
  activeSessionId.value = id
  return id
}

function parseSseChunks(chunk: string): StreamEvent[] {
  const lines = chunk
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const events: StreamEvent[] = []

  for (const line of lines) {
    if (!line.startsWith('data:')) {
      continue
    }
    const raw = line.slice(5).trim()
    if (!raw) {
      continue
    }
    try {
      events.push(JSON.parse(raw) as StreamEvent)
    }
    catch {
      // Ignore malformed SSE payloads.
    }
  }

  return events
}

function applyStreamEvent(item: StreamEvent) {
  if (typeof item.seq === 'number' && Number.isFinite(item.seq)) {
    lastSeq.value = Math.max(lastSeq.value, item.seq)
  }

  if (
    item.type === 'stream.started'
    || item.type === 'planning.started'
    || item.type === 'planning.updated'
    || item.type === 'planning.finished'
    || item.type === 'replay.started'
    || item.type === 'replay.finished'
    || item.type === 'turn.started'
    || item.type === 'turn.finished'
  ) {
    appendTrace(mapTrace(item.type, Number(item.seq || lastSeq.value), {
      ...(item.payload || {}),
      replay: Boolean(item.replay),
    }))
    return
  }

  if (item.type === 'run.audit') {
    appendTrace(mapTrace('run.audit', Number(item.seq || lastSeq.value), {
      ...(item.payload || {}),
      replay: Boolean(item.replay),
    }))
    return
  }

  if (item.type === 'assistant.delta') {
    appendAssistantDelta(String(item.delta || ''))
    appendTrace(mapTrace('assistant.delta', Number(item.seq || lastSeq.value), {
      replay: Boolean(item.replay),
    }))
    return
  }

  if (item.type === 'assistant.final') {
    const finalText = String(item.message || '')
    if (finalText) {
      appendAssistantDelta(finalText)
    }
    activeAssistantMessageId.value = null
    appendTrace(mapTrace('assistant.final', Number(item.seq || lastSeq.value), {
      replay: Boolean(item.replay),
    }))
    return
  }

  if (item.type === 'session.paused') {
    running.value = false
    reconnectHint.value = `会话已暂停：${item.reason || 'unknown'}`
    appendTrace(mapTrace('session.paused', Number(item.seq || lastSeq.value), {
      reason: item.reason,
    }))
    return
  }

  if (item.type === 'run.metrics') {
    appendTrace(mapTrace('run.metrics', Number(item.seq || lastSeq.value), {
      ...(item.payload || {}),
    }))
    return
  }

  if (item.type === 'error') {
    streamError.value = toPrettyErrorMessage(String(item.message || 'Stream error'), item.detail)
    running.value = false
    appendTrace(mapTrace('error', Number(item.seq || lastSeq.value), {
      message: String(item.message || 'Stream error'),
      detail: item.detail || {},
    }))
    return
  }

  if (item.type === 'done') {
    running.value = false
    activeAssistantMessageId.value = null
    return
  }

  appendTrace(mapTrace(item.type || 'unknown', Number(item.seq || lastSeq.value), {
    ...(item.payload || {}),
    replay: Boolean(item.replay),
  }))
}

async function consumeSseResponse(response: Response) {
  if (!response.body) {
    throw new Error('empty stream body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })

    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const events = parseSseChunks(chunk)
      for (const item of events) {
        applyStreamEvent(item)
      }
    }
  }

  if (buffer.trim()) {
    const events = parseSseChunks(buffer)
    for (const item of events) {
      applyStreamEvent(item)
    }
  }
}

async function openStream(payload: Record<string, unknown>) {
  const sessionId = await ensureActiveSession()
  const beforeSeq = lastSeq.value

  streamAbortController?.abort()
  streamAbortController = new AbortController()

  streamError.value = ''
  reconnectHint.value = ''
  running.value = true

  try {
    const response = await fetch(`/api/pilot/chat/sessions/${sessionId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: streamAbortController.signal,
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    await consumeSseResponse(response)
  }
  finally {
    running.value = false
    activeAssistantMessageId.value = null
    await Promise.all([
      refreshSessions(sessionId),
      loadSessionMessages(sessionId),
      loadSessionTrace(sessionId, Math.max(1, beforeSeq + 1), true),
    ])
    void maybeSummarizeActiveSessionTitle(sessionId)
  }
}

async function sendMessage() {
  const content = clampInputText(draft.value)
  if (!content || running.value) {
    return
  }

  const sessionId = await ensureActiveSession()

  messages.value.push({
    id: makeId('msg_user'),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  })

  draft.value = ''

  const outgoingAttachments = [...pendingAttachments.value]
  pendingAttachments.value = []

  await openStream({
    message: content,
    sessionId,
    attachments: outgoingAttachments.map(item => ({
      id: item.id,
      type: item.kind,
      ref: item.ref,
      name: item.name,
    })),
  })
}

async function onComposerSend(payload: { text: string }) {
  draft.value = payload.text
  await sendMessage()
}

async function pauseSession(reason: 'manual_pause' | 'client_disconnect' | 'heartbeat_timeout' | 'system_preempted' = 'manual_pause') {
  const sessionId = activeSessionId.value
  if (!sessionId) {
    return
  }

  await fetchJson(`/api/pilot/chat/sessions/${sessionId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  })

  await refreshSessions(sessionId)
}

async function stopStream() {
  streamAbortController?.abort()
  running.value = false
  await pauseSession('manual_pause')
  reconnectHint.value = '已手动暂停，可以点击“补播恢复”读取 fromSeq 增量。'
}

async function replayFromSeq() {
  const sessionId = await ensureActiveSession()
  await openStream({
    fromSeq: Math.max(1, lastSeq.value + 1),
    sessionId,
  })
}

async function uploadAttachment(file: File) {
  const sessionId = await ensureActiveSession()
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取附件失败'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })

  const response = await fetchJson<{ attachment: PilotAttachment }>(`/api/pilot/chat/sessions/${sessionId}/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      contentBase64: base64,
    }),
  })

  pendingAttachments.value.push(response.attachment)
  attachments.value.push(response.attachment)
}

async function onAttachmentSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  target.value = ''

  if (files.length <= 0) {
    return
  }

  for (const file of files) {
    try {
      await uploadAttachment(file)
    }
    catch (error) {
      streamError.value = error instanceof Error ? error.message : '附件上传失败'
      break
    }
  }
}

async function bootstrap() {
  await refreshSessions()

  if (!activeSessionId.value) {
    const createdId = await createSession()
    activeSessionId.value = createdId
  }

  if (activeSessionId.value) {
    await selectSession(activeSessionId.value)
  }
}

onMounted(() => {
  void bootstrap().catch((error) => {
    streamError.value = error instanceof Error ? error.message : '初始化失败'
  })
})

onUnmounted(() => {
  streamAbortController?.abort()
})
</script>

<template>
  <div class="pilot-page">
    <aside class="pilot-sidebar">
      <header class="pilot-sidebar__header">
        <div class="pilot-brand">
          <h2>{{ pilotTitle }}</h2>
          <p>活跃助手工作台</p>
        </div>
        <TxButton size="small" variant="primary" :disabled="running" @click="handleCreateSession">
          新建
        </TxButton>
      </header>

      <div class="pilot-sessions__list">
        <TxEmptyState
          v-if="loadingSessions"
          variant="loading"
          size="small"
          title="正在加载会话..."
          description=""
        />
        <TxEmptyState
          v-else-if="sessions.length <= 0"
          variant="no-data"
          size="small"
          title="暂无会话"
          description="点击右上角“新建”开始"
        />

        <article
          v-for="item in sessions"
          :key="item.sessionId"
          class="pilot-session-card"
          :class="{ 'is-active': item.sessionId === activeSessionId }"
          role="button"
          tabindex="0"
          @click="selectSession(item.sessionId)"
          @keydown.enter.prevent="selectSession(item.sessionId)"
          @keydown.space.prevent="selectSession(item.sessionId)"
        >
          <div class="pilot-session-card__top">
            <h3 :title="getSessionDisplayTitle(item)">
              {{ getSessionDisplayTitle(item) }}
            </h3>
            <TxButton
              size="mini"
              variant="ghost"
              :disabled="(running && activeSessionId === item.sessionId) || deletingSessionId === item.sessionId"
              @click.stop="deleteSession(item.sessionId)"
            >
              删除
            </TxButton>
          </div>

          <div class="pilot-session-card__meta">
            <TxStatusBadge size="sm" :text="item.status" :status="getStatusTone(item.status)" />
            <span>{{ toReadableTime(item.updatedAt) }}</span>
          </div>

          <p class="pilot-session-card__sub">
            <template v-if="isSessionTitleLoading(item.sessionId)">
              AI 正在总结标题...
            </template>
            <template v-else>
              id: {{ shortSessionId(item.sessionId) }} · seq {{ item.lastSeq }}
            </template>
          </p>
        </article>
      </div>
    </aside>

    <main class="pilot-chat">
      <header class="pilot-chat__header">
        <div class="pilot-chat__title">
          <h1>{{ activeSessionTitle }}</h1>
          <p>{{ activeSessionId ? `Session: ${activeSessionId}` : '未选择会话' }}</p>
          <p v-if="activeSession && !activeSession.title && isSessionTitleLoading(activeSession.sessionId)">
            AI 正在为当前会话命名...
          </p>
        </div>

        <div class="pilot-chat__actions">
          <TxButton size="small" variant="secondary" :disabled="!activeSessionId" @click="traceDrawerOpen = true">
            展开 Trace
          </TxButton>
          <TxButton size="small" variant="secondary" :disabled="running || !activeSessionId" @click="replayFromSeq">
            补播恢复
          </TxButton>
          <TxButton size="small" variant="danger" :disabled="!running" @click="stopStream">
            停止
          </TxButton>
        </div>
      </header>

      <section class="pilot-chat__messages">
        <TxEmptyState
          v-if="loadingMessages"
          variant="loading"
          size="small"
          title="正在加载消息..."
          description=""
        />
        <TxEmptyState
          v-else-if="messages.length <= 0"
          variant="blank-slate"
          size="small"
          title="发送第一条消息开始对话"
          description=""
        />

        <div v-else class="pilot-chat__message-list">
          <TxChatList :messages="chatListMessages" :markdown="false" :stagger="false" />
        </div>

        <div v-if="running" class="pilot-chat__typing">
          <TxTypingIndicator variant="dots" text="Pilot 正在思考..." />
        </div>
      </section>

      <footer class="pilot-chat__dock">
        <TxChatComposer
          v-model="draft"
          :disabled="running || !activeSessionId"
          :submitting="running"
          :attachments="composerAttachments"
          placeholder="输入消息..."
          :send-on-meta-enter="false"
          @attachment-click="triggerAttachmentPicker"
          @send="onComposerSend"
        >
          <template #toolbar="{ send, disabled, attachmentClick }">
            <div class="pilot-composer-toolbar">
              <div class="pilot-composer-toolbar__left">
                <button type="button" class="pilot-composer-btn is-icon" :disabled="disabled" @click="attachmentClick()">
                  +
                </button>
                <button type="button" class="pilot-composer-btn" :disabled="disabled">
                  Pro
                </button>
                <button type="button" class="pilot-composer-btn" :disabled="disabled">
                  Search
                </button>
              </div>
              <div class="pilot-composer-toolbar__right">
                <button type="button" class="pilot-composer-btn is-icon" :disabled="disabled">
                  Mic
                </button>
                <button type="button" class="pilot-composer-voice" :disabled="disabled" @click="send()">
                  <span class="pilot-composer-voice-bars">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
            </div>
          </template>
        </TxChatComposer>
        <input
          ref="attachmentInputRef"
          type="file"
          multiple
          class="pilot-hidden-input"
          @change="onAttachmentSelected"
        >

        <div class="pilot-chat__resume">
          <TxButton size="small" variant="secondary" :disabled="running || !hasPausedSession" @click="replayFromSeq">
            {{ hasPausedSession ? '恢复 paused 会话' : '会话未 paused' }}
          </TxButton>
        </div>

        <pre v-if="streamError" class="pilot-error">{{ streamError }}</pre>
        <p v-if="reconnectHint" class="pilot-hint">
          {{ reconnectHint }}
        </p>
      </footer>
    </main>

    <TxDrawer
      v-model:visible="traceDrawerOpen"
      title="Trace"
      width="min(92vw, 420px)"
      direction="right"
    >
      <section class="pilot-trace">
        <header class="pilot-trace__header">
          <span>lastSeq: {{ lastSeq }}</span>
        </header>

        <div class="pilot-trace__body">
          <TxEmptyState
            v-if="traceItems.length <= 0"
            variant="empty"
            size="small"
            title="当前没有 Trace"
            description=""
          />

          <article v-for="item in traceItems" :key="item.id" class="pilot-trace-item">
            <div class="pilot-trace-item__meta">
              <span>#{{ item.seq }}</span>
              <strong>{{ item.type }}</strong>
            </div>
            <div class="pilot-trace-item__status">
              <span>{{ toReadableTime(item.createdAt) }}</span>
            </div>
            <pre>{{ JSON.stringify(item.payload || {}, null, 2) }}</pre>
          </article>
        </div>
      </section>
    </TxDrawer>
  </div>
</template>

<style scoped>
.pilot-page {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
  background: radial-gradient(circle at 8% 8%, #ffe39f 0%, transparent 42%),
    radial-gradient(circle at 92% 0%, #97ddff 0%, transparent 35%),
    linear-gradient(160deg, #f5f8ff 0%, #fff9f0 100%);
  color: #10203a;
  font-family: 'Avenir Next', 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.pilot-sidebar {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-right: 1px solid rgba(16, 32, 58, 0.12);
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(10px);
}

.pilot-sidebar__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pilot-brand h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.pilot-brand p {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(16, 32, 58, 0.65);
}

.pilot-sessions__list {
  margin-top: 16px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding-right: 4px;
}

.pilot-session-card {
  border: 1px solid rgba(16, 32, 58, 0.13);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 160ms ease, border-color 140ms ease;
}

.pilot-session-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(16, 32, 58, 0.08);
}

.pilot-session-card.is-active {
  border-color: rgba(14, 101, 255, 0.7);
  box-shadow: 0 0 0 2px rgba(14, 101, 255, 0.16);
}

.pilot-session-card__top,
.pilot-session-card__meta,
.pilot-chat__actions,
.pilot-trace-item__meta,
.pilot-trace-item__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pilot-session-card__top h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pilot-session-card__sub,
.pilot-hint,
.pilot-chat__title p {
  margin: 0;
  font-size: 12px;
  color: rgba(16, 32, 58, 0.66);
}

.pilot-chat {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 18px 12px;
}

.pilot-chat__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(16, 32, 58, 0.1);
}

.pilot-chat__title h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.pilot-chat__messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.pilot-chat__message-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
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
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.9));
}

.pilot-chat__resume {
  display: flex;
  justify-content: flex-end;
}

.pilot-composer-toolbar,
.pilot-composer-toolbar__left,
.pilot-composer-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pilot-composer-toolbar {
  width: 100%;
  justify-content: space-between;
}

.pilot-composer-btn {
  border: 1px solid rgba(16, 32, 58, 0.16);
  background: rgba(255, 255, 255, 0.9);
  color: rgba(16, 32, 58, 0.88);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.pilot-composer-btn.is-icon {
  width: 34px;
  height: 34px;
  padding: 0;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}

.pilot-composer-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.pilot-composer-voice {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 999px;
  background: #0b0b0c;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.pilot-composer-voice:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pilot-composer-voice-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
}

.pilot-composer-voice-bars span {
  width: 3px;
  border-radius: 3px;
  background: #fff;
}

.pilot-composer-voice-bars span:nth-child(1) {
  height: 9px;
}

.pilot-composer-voice-bars span:nth-child(2) {
  height: 14px;
}

.pilot-composer-voice-bars span:nth-child(3) {
  height: 10px;
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
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pilot-trace-item {
  border: 1px solid rgba(16, 32, 58, 0.14);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.82);
}

.pilot-trace-item pre {
  margin: 8px 0 0;
  max-height: 180px;
  overflow: auto;
  font-size: 11px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  padding: 8px;
  border-radius: 8px;
}

.pilot-page :deep(.tx-chat-composer) {
  border-radius: 24px;
  padding: 14px;
  border-color: rgba(16, 32, 58, 0.16);
  box-shadow: 0 12px 24px rgba(16, 32, 58, 0.08);
}

.pilot-page :deep(.tx-chat-composer__textarea) {
  border-radius: 16px;
  min-height: 82px;
  max-height: 260px;
  resize: none;
}

.pilot-page :deep(.tx-chat-composer__actions-left) {
  min-width: 0;
}

.pilot-page :deep(.tx-chat-composer__toolbar) {
  width: 100%;
}

.pilot-page :deep(.tx-drawer__body) {
  display: flex;
  padding: 14px;
}

@media (max-width: 960px) {
  .pilot-page {
    grid-template-columns: 1fr;
  }

  .pilot-sidebar {
    max-height: 36vh;
    border-right: 0;
    border-bottom: 1px solid rgba(16, 32, 58, 0.12);
  }

  .pilot-chat {
    padding: 14px;
  }

  .pilot-page :deep(.tx-drawer__panel) {
    width: 100vw !important;
  }
}
</style>
