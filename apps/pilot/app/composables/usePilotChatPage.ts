import type { ChatMessageModel, StatusTone } from '@talex-touch/tuffex'
import type {
  PilotAttachment,
  PilotComposerAttachment,
  PilotMessage,
  PilotSession,
  PilotSessionRow,
  PilotTrace,
  SessionMessagesResponse,
  SessionNotificationsResponse,
  SessionTitleResponse,
  SessionTraceResponse,
  StreamEvent,
} from './pilot-chat.types'
import { computed, onMounted, onUnmounted, ref } from 'vue'

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function clampInputText(value: string): string {
  return value.trim().slice(0, 4000)
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(-8)
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

function createNotificationMap(response: SessionNotificationsResponse | null | undefined): Map<string, boolean> {
  const map = new Map<string, boolean>()
  const rows = Array.isArray(response?.notifications) ? response.notifications : []
  for (const row of rows) {
    const sessionId = String(row?.sessionId || '').trim()
    if (!sessionId) {
      continue
    }
    map.set(sessionId, Boolean(row?.unread))
  }
  return map
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

function yieldToUiFrame(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
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

export function usePilotChatPage() {
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

  let streamAbortController: AbortController | null = null
  const traceKeySet = new Set<string>()

  const activeSession = computed(() => sessions.value.find(item => item.sessionId === activeSessionId.value) || null)
  const hasPausedSession = computed(() => activeSession.value?.status === 'paused_disconnect')

  const activeSessionTitle = computed(() => {
    const title = String(activeSession.value?.title || '').trim()
    if (title) {
      return title
    }
    return activeSessionId.value ? `会话 ${shortSessionId(activeSessionId.value)}` : '新会话'
  })

  const activeSessionTitleLoading = computed(() => {
    const current = activeSession.value
    if (!current) {
      return false
    }
    if (String(current.title || '').trim()) {
      return false
    }
    return Boolean(titleLoadingMap.value[current.sessionId])
  })

  const sessionRows = computed<PilotSessionRow[]>(() => {
    return sessions.value.map((item) => {
      const title = String(item.title || '').trim()
      return {
        sessionId: item.sessionId,
        status: item.status,
        statusTone: getStatusTone(item.status),
        title: title || `会话 ${shortSessionId(item.sessionId)}`,
        notifyUnread: Boolean(item.notifyUnread),
        shortId: shortSessionId(item.sessionId),
        lastSeq: item.lastSeq,
        updatedAtText: toReadableTime(item.updatedAt),
        titleLoading: Boolean(titleLoadingMap.value[item.sessionId]),
      }
    })
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

  async function refreshSessions(preferSessionId?: string) {
    loadingSessions.value = true
    try {
      const [sessionData, notificationData] = await Promise.all([
        fetchJson<{ sessions: PilotSession[] }>('/api/pilot/chat/sessions?limit=50'),
        fetchJson<SessionNotificationsResponse>('/api/pilot/chat/sessions/notifications?limit=100')
          .catch(() => ({ notifications: [] })),
      ])

      const notificationMap = createNotificationMap(notificationData)
      const list = Array.isArray(sessionData.sessions) ? sessionData.sessions : []
      sessions.value = sortSessions(list).map(item => ({
        ...item,
        notifyUnread: notificationMap.get(item.sessionId) ?? Boolean(item.notifyUnread),
      }))

      let nextActiveSessionId = activeSessionId.value
      const preferred = preferSessionId && sessions.value.some(item => item.sessionId === preferSessionId)
        ? preferSessionId
        : ''

      if (preferred) {
        nextActiveSessionId = preferred
      }
      else if (!nextActiveSessionId || !sessions.value.some(item => item.sessionId === nextActiveSessionId)) {
        nextActiveSessionId = sessions.value[0]?.sessionId || ''
      }

      activeSessionId.value = nextActiveSessionId

      // Active session should not show unread dot.
      if (nextActiveSessionId) {
        void markSessionNotificationRead(nextActiveSessionId)
      }
    }
    finally {
      loadingSessions.value = false
    }
  }

  async function markSessionNotificationRead(sessionId: string) {
    if (!sessionId) {
      return
    }

    const hasUnread = sessions.value.some(item => item.sessionId === sessionId && item.notifyUnread)
    if (!hasUnread) {
      return
    }

    sessions.value = sessions.value.map(item => (
      item.sessionId === sessionId
        ? {
            ...item,
            notifyUnread: false,
          }
        : item
    ))

    try {
      await fetchJson(`/api/pilot/chat/sessions/${sessionId}/notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unread: false,
        }),
      })
    }
    catch {
      // Ignore notification ack errors; next refresh will resync.
    }
  }

  async function summarizeSessionTitle(sessionId: string, force = false) {
    if (!sessionId || titleLoadingMap.value[sessionId]) {
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

  function getTraceKey(seq: number, type: string): string {
    return `${seq}:${type}`
  }

  function normalizeTraceSeq(value: unknown): number {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) {
      return Math.floor(n)
    }
    return Math.max(1, lastSeq.value)
  }

  function rebuildTraceIndex(items: PilotTrace[]) {
    traceKeySet.clear()
    for (const item of items) {
      traceKeySet.add(getTraceKey(item.seq, item.type))
    }
  }

  function appendTrace(item: PilotTrace) {
    const seq = normalizeTraceSeq(item.seq)
    const type = String(item.type || 'unknown')
    const key = getTraceKey(seq, type)
    if (traceKeySet.has(key)) {
      return
    }

    const nextItem: PilotTrace = {
      ...item,
      seq,
      type,
    }

    traceKeySet.add(key)
    const list = traceItems.value
    const tail = list[list.length - 1]
    if (!tail || tail.seq <= seq) {
      list.push(nextItem)
    }
    else {
      let index = list.length
      while (index > 0) {
        const prev = list[index - 1]
        if (!prev || prev.seq <= seq) {
          break
        }
        index -= 1
      }
      list.splice(index, 0, nextItem)
    }

    if (list.length > 800) {
      const removed = list.splice(0, list.length - 800)
      for (const trace of removed) {
        traceKeySet.delete(getTraceKey(trace.seq, trace.type))
      }
    }

    lastSeq.value = Math.max(lastSeq.value, seq)
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

  function appendAssistantFinal(message: string) {
    const finalText = String(message || '')
    if (!finalText) {
      return
    }

    const activeMessage = activeAssistantMessageId.value
      ? messages.value.find(item => item.id === activeAssistantMessageId.value)
      : undefined

    if (!activeMessage) {
      appendAssistantDelta(finalText)
      return
    }

    if (activeMessage.content === finalText) {
      return
    }

    if (finalText.startsWith(activeMessage.content)) {
      appendAssistantDelta(finalText.slice(activeMessage.content.length))
      return
    }

    appendAssistantDelta(finalText)
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
      const normalized = items
        .map((item) => {
          const seq = normalizeTraceSeq(item.seq)
          return {
            ...item,
            seq,
            type: String(item.type || 'unknown'),
          }
        })
        .sort((left, right) => left.seq - right.seq)
        .slice(-800)
      traceItems.value = normalized
      rebuildTraceIndex(normalized)
      lastSeq.value = normalized.reduce((acc, row) => Math.max(acc, Number(row.seq || 0)), 0)
    }
    else {
      for (const item of items) {
        appendTrace(item)
      }
      lastSeq.value = traceItems.value.reduce((acc, row) => Math.max(acc, Number(row.seq || 0)), lastSeq.value)
    }
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

    void markSessionNotificationRead(sessionId)
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
        traceKeySet.clear()
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
      if (traceDrawerOpen.value) {
        appendTrace(mapTrace('assistant.delta', Number(item.seq || lastSeq.value), {
          replay: Boolean(item.replay),
        }))
      }
      return
    }

    if (item.type === 'assistant.final') {
      appendAssistantFinal(String(item.message || ''))
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
      if (traceDrawerOpen.value) {
        appendTrace(mapTrace('run.metrics', Number(item.seq || lastSeq.value), {
          ...(item.payload || {}),
        }))
      }
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
    let processedSinceYield = 0

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })

      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        const events = parseSseChunks(chunk)
        for (const item of events) {
          applyStreamEvent(item)
          processedSinceYield += 1
          if (processedSinceYield >= 24) {
            processedSinceYield = 0
            await yieldToUiFrame()
          }
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
      const tasks: Array<Promise<unknown>> = [
        refreshSessions(sessionId),
      ]

      if (streamError.value || traceDrawerOpen.value) {
        tasks.push(loadSessionTrace(sessionId, Math.max(1, beforeSeq + 1), true))
      }

      // Avoid replacing the whole message list after each stream completion.
      // Full sync is still applied when stream errors happen.
      if (streamError.value) {
        tasks.push(loadSessionMessages(sessionId))
      }

      await Promise.all(tasks)
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

  async function uploadFiles(files: File[]) {
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

  async function handleCreateSession() {
    const createdId = await createSession()
    await selectSession(createdId)
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

  return {
    pilotTitle,
    sessionRows,
    activeSessionId,
    activeSessionTitle,
    activeSessionTitleLoading,
    loadingSessions,
    running,
    deletingSessionId,
    handleCreateSession,
    selectSession,
    deleteSession,
    chatListMessages,
    loadingMessages,
    draft,
    onComposerSend,
    composerAttachments,
    replayFromSeq,
    hasPausedSession,
    streamError,
    reconnectHint,
    uploadFiles,
    traceDrawerOpen,
    traceItems,
    lastSeq,
  }
}
