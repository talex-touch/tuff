import type { ChatMessageModel } from '@talex-touch/tuffex'
import type {
  PilotAttachment,
  PilotComposerAttachment,
  PilotMessage,
  PilotRuntimeStatusSnapshot,
  PilotSession,
  PilotSessionRow,
  PilotStageItem,
  PilotToolCall,
  PilotTrace,
  SessionMessagesResponse,
  SessionNotificationsResponse,
  SessionTitleResponse,
  SessionTraceResponse,
  StreamEvent,
} from './pilot-chat.types'
import { networkClient } from '@talex-touch/utils/network'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { shouldHidePilotClientRuntimeEvent, shouldHidePilotClientSystemMessage } from '../../shared/pilot-runtime-redaction'
import { buildPilotSystemMessageId, derivePilotToolCallsFromSystemMessages, projectPilotSystemMessage } from '../../shared/pilot-system-message'
import {
  ASSISTANT_CHUNK_FLUSH_MS,
  clampInputText,
  createNotificationMap,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DEFAULT_STREAM_MAX_DURATION_MS,
  fetchJson,
  formatAttachmentSummary,
  getMessageAttachments,
  getStatusTone,
  isImageAttachment,
  makeId,
  MAX_ATTACHMENT_BYTES,
  normalizeTimeoutMs,
  parseSseChunks,
  resolveAttachmentKind,
  shortSessionId,
  shouldFlushImmediately,
  sortSessions,
  STREAM_IDLE_TIMEOUT_MAX_MS,
  STREAM_IDLE_TIMEOUT_MIN_MS,
  STREAM_MAX_DURATION_MAX_MS,
  STREAM_MAX_DURATION_MIN_MS,
  toPrettyErrorMessage,
  toReadableTime,
  yieldToUiFrame,
} from './pilot-chat.utils'
import { useAttachmentCapability } from './useAttachmentCapability'

export function usePilotChatPage() {
  const runtimePublic = useRuntimeConfig().public as Record<string, unknown>
  const {
    refreshCapability,
    ensureAttachmentAllowed,
    normalizeAttachmentError,
  } = useAttachmentCapability()
  const pilotTitle = String(runtimePublic.pilotTitle || 'Tuff Pilot')
  const streamIdleTimeoutMs = normalizeTimeoutMs(
    runtimePublic.pilotStreamIdleTimeoutMs,
    DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    STREAM_IDLE_TIMEOUT_MIN_MS,
    STREAM_IDLE_TIMEOUT_MAX_MS,
  )
  const streamMaxDurationMs = normalizeTimeoutMs(
    runtimePublic.pilotStreamMaxDurationMs,
    DEFAULT_STREAM_MAX_DURATION_MS,
    STREAM_MAX_DURATION_MIN_MS,
    STREAM_MAX_DURATION_MAX_MS,
  )

  const sessions = ref<PilotSession[]>([])
  const activeSessionId = ref('')
  const messages = ref<PilotMessage[]>([])
  const traceItems = ref<PilotTrace[]>([])
  const toolCalls = ref<PilotToolCall[]>([])
  const attachments = ref<PilotAttachment[]>([])
  const pendingAttachments = ref<PilotAttachment[]>([])
  const draft = ref('')
  const runningSessionIds = ref<string[]>([])
  const loadingSessions = ref(false)
  const loadingMessages = ref(false)
  const traceDrawerOpen = ref(false)
  const streamError = ref('')
  const reconnectHint = ref('')
  const activeAssistantMessageId = ref<string | null>(null)
  const lastSeq = ref(0)
  const deletingSessionId = ref('')
  const titleLoadingMap = ref<Record<string, boolean>>({})
  const thinkingText = ref('')
  const thinkingStreaming = ref(false)

  const intentState = ref<{
    phase: 'idle' | 'running' | 'completed'
    intentType: string
    reason: string
    confidence: number
    strategy: string
  }>({
    phase: 'idle',
    intentType: '',
    reason: '',
    confidence: 0,
    strategy: '',
  })
  const websearchState = ref<{
    phase: 'idle' | 'decided' | 'executed' | 'skipped'
    enabled: boolean | null
    reason: string
    source: string
    sourceCount: number
  }>({
    phase: 'idle',
    enabled: null,
    reason: '',
    source: '',
    sourceCount: 0,
  })
  const memoryState = ref<{
    enabled: boolean | null
    historyCount: number
  }>({
    enabled: null,
    historyCount: 0,
  })
  const runPreferences = ref<{
    modelId: string
    routeComboId: string
    internet: boolean
    thinking: boolean
    pilotMode: boolean
    memoryEnabled: boolean
  }>({
    modelId: 'quota-auto',
    routeComboId: '',
    internet: true,
    thinking: true,
    pilotMode: true,
    memoryEnabled: true,
  })

  const streamAbortControllers = new Map<string, AbortController>()
  const autoPauseSessionLocks = new Set<string>()
  const streamHandledFailureMessageSessions = new Set<string>()
  let assistantDeltaBuffer = ''
  let assistantFlushTimer: ReturnType<typeof setTimeout> | null = null
  const traceKeySet = new Set<string>()
  const toolCallMap = new Map<string, PilotToolCall>()

  const activeSession = computed(() => sessions.value.find(item => item.sessionId === activeSessionId.value) || null)
  const running = computed(() => {
    const sessionId = activeSessionId.value
    return sessionId ? runningSessionIds.value.includes(sessionId) : false
  })
  const hasRunningSessions = computed(() => runningSessionIds.value.length > 0)
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
        running: runningSessionIds.value.includes(item.sessionId),
      }
    })
  })

  function resetRuntimeStates() {
    intentState.value = {
      phase: 'idle',
      intentType: '',
      reason: '',
      confidence: 0,
      strategy: '',
    }
    websearchState.value = {
      phase: 'idle',
      enabled: null,
      reason: '',
      source: '',
      sourceCount: 0,
    }
    memoryState.value = {
      enabled: null,
      historyCount: 0,
    }
    thinkingText.value = ''
    thinkingStreaming.value = false
  }

  function includesToolApprovalRequired(value: unknown): boolean {
    const text = String(value || '').trim().toUpperCase()
    return text === 'TOOL_APPROVAL_REQUIRED' || text.includes('TOOL_APPROVAL_REQUIRED')
  }

  function normalizeWebsearchReason(value: unknown, phase: 'decision' | 'skipped' | 'executed'): string {
    const reason = String(value || '').trim()
    if (!reason) {
      return ''
    }
    if (reason === 'intent_required') {
      return '意图判定需要联网'
    }
    if (reason === 'intent_not_required') {
      return '意图判定无需联网'
    }
    if (reason === 'fallback_unsupported_channel' || reason === 'fallback_endpoint_missing') {
      return '当前通道不支持联网检索，已继续离线回答'
    }
    if (reason === 'tool_failed_or_empty_result') {
      return '未获取到可用外部来源，已继续回答'
    }
    if (reason === 'terminal_finalize' && phase === 'skipped') {
      return '执行结束，未触发联网检索'
    }
    return reason
  }

  function buildStageItems(): PilotStageItem[] {
    const intentStatus: PilotStageItem['status'] = intentState.value.phase === 'running'
      ? 'running'
      : intentState.value.phase === 'completed'
        ? 'done'
        : 'pending'
    const memoryStatus: PilotStageItem['status'] = memoryState.value.enabled === null
      ? (intentStatus === 'done' ? 'running' : 'pending')
      : 'done'
    const websearchStatus: PilotStageItem['status'] = websearchState.value.phase === 'executed'
      ? 'done'
      : websearchState.value.phase === 'skipped'
        ? 'skipped'
        : websearchState.value.phase === 'decided'
          ? 'pending'
          : (memoryStatus === 'done' ? 'running' : 'pending')
    const thinkingStatus: PilotStageItem['status'] = runPreferences.value.thinking === false
      ? 'skipped'
      : thinkingStreaming.value
        ? 'running'
        : (thinkingText.value ? 'done' : 'pending')

    return [
      {
        key: 'intent',
        label: '分析意图',
        status: intentStatus,
        detail: intentStatus === 'running'
          ? '正在分析意图'
          : (intentState.value.intentType || intentState.value.reason || ''),
      },
      {
        key: 'memory',
        label: '记忆',
        status: memoryStatus,
        detail: memoryState.value.enabled === null
          ? ''
          : (memoryState.value.enabled ? `开启 (${memoryState.value.historyCount})` : '关闭'),
      },
      {
        key: 'websearch',
        label: '联网',
        status: websearchStatus,
        detail: websearchState.value.reason || '',
      },
      {
        key: 'thinking',
        label: 'Thinking',
        status: thinkingStatus,
        detail: runPreferences.value.thinking === false
          ? '已关闭'
          : (thinkingStreaming.value ? '流式输出中' : (thinkingText.value ? '已完成' : '')),
      },
    ]
  }

  const runtimeStatus = computed<PilotRuntimeStatusSnapshot>(() => {
    const intentType = intentState.value.intentType || '-'
    const intentReason = intentState.value.reason || '-'
    const confidence = Number.isFinite(intentState.value.confidence)
      ? intentState.value.confidence
      : 0
    const intentDetail = intentState.value.phase === 'running'
      ? '正在分析意图'
      : `${intentReason} / ${(confidence * 100).toFixed(1)}%`

    const requestModel = runPreferences.value.modelId || 'quota-auto'

    let websearchLabel = '等待判定'
    if (websearchState.value.phase === 'decided') {
      websearchLabel = `${websearchState.value.enabled ? '触发' : '不触发'} (${websearchState.value.reason || '-'})`
    }
    else if (websearchState.value.phase === 'executed') {
      websearchLabel = `已执行 ${websearchState.value.source || ''} (${websearchState.value.sourceCount})`
    }
    else if (websearchState.value.phase === 'skipped') {
      websearchLabel = `跳过 (${websearchState.value.reason || '-'})`
    }

    const memoryLabel = memoryState.value.enabled === null
      ? '待确定'
      : (memoryState.value.enabled
          ? `开启 (${memoryState.value.historyCount})`
          : '关闭')
    const thinkingLabel = runPreferences.value.thinking === false
      ? '关闭'
      : (thinkingStreaming.value
          ? '输出中'
          : (thinkingText.value ? '已完成' : '未输出'))

    return {
      intentLabel: intentType,
      intentDetail,
      requestModelLabel: requestModel,
      websearchLabel,
      memoryLabel,
      thinkingLabel,
      stages: buildStageItems(),
    }
  })

  function isSessionRunning(sessionId: string): boolean {
    if (!sessionId) {
      return false
    }
    return runningSessionIds.value.includes(sessionId)
  }

  function setSessionRunning(sessionId: string, running: boolean) {
    if (!sessionId) {
      return
    }
    const current = runningSessionIds.value
    const exists = current.includes(sessionId)
    if (running && !exists) {
      runningSessionIds.value = [...current, sessionId]
      return
    }
    if (!running && exists) {
      runningSessionIds.value = current.filter(id => id !== sessionId)
    }
  }

  function abortSessionStream(sessionId: string, reason = 'replaced') {
    const controller = streamAbortControllers.get(sessionId)
    if (!controller) {
      return
    }
    streamAbortControllers.delete(sessionId)
    controller.abort(reason)
    setSessionRunning(sessionId, false)
  }

  function markSessionPaused(sessionId: string, reason: PilotSession['pauseReason']) {
    const nowIso = new Date().toISOString()
    sessions.value = sessions.value.map((session) => {
      if (session.sessionId !== sessionId) {
        return session
      }
      return {
        ...session,
        status: 'paused_disconnect',
        pauseReason: reason || 'heartbeat_timeout',
        updatedAt: nowIso,
      }
    })
  }

  async function autoPauseSessionForTimeout(sessionId: string, timeoutReason: string): Promise<void> {
    if (!sessionId || autoPauseSessionLocks.has(sessionId)) {
      return
    }

    autoPauseSessionLocks.add(sessionId)
    try {
      await fetchJson(`/api/chat/sessions/${sessionId}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'heartbeat_timeout',
        }),
      })

      markSessionPaused(sessionId, 'heartbeat_timeout')
      if (activeSessionId.value === sessionId) {
        reconnectHint.value = '会话长时间无有效响应，系统已自动终止。可点击“恢复 paused 会话”继续。'
        appendTrace(mapTrace('session.paused', Math.max(1, lastSeq.value + 1), {
          reason: 'heartbeat_timeout',
          autoPaused: true,
          timeoutReason,
        }))
      }
    }
    catch {
      if (activeSessionId.value === sessionId) {
        reconnectHint.value = '会话长时间无有效响应，系统自动终止失败，请手动恢复或刷新。'
      }
    }
    finally {
      autoPauseSessionLocks.delete(sessionId)
    }
  }

  const chatListMessages = computed<ChatMessageModel[]>(() => {
    const visibleMessages = messages.value.filter(item => item.role === 'user' || item.role === 'assistant')
    return visibleMessages.map((item) => {
      const stamp = Date.parse(item.createdAt)
      const messageAttachments = getMessageAttachments(item)
      const baseContent = String(item.content || '')
      const attachmentSummary = item.role === 'user'
        ? formatAttachmentSummary(messageAttachments, Boolean(baseContent.trim()))
        : ''
      const imageAttachments = messageAttachments.reduce<NonNullable<ChatMessageModel['attachments']>>((list, attachment) => {
        if (!isImageAttachment(attachment)) {
          return list
        }
        const url = String(attachment.previewUrl || attachment.ref || '').trim()
        if (!url) {
          return list
        }
        list.push({
          type: 'image',
          url,
          name: attachment.name,
        })
        return list
      }, [])

      return {
        id: item.id,
        role: item.role,
        content: `${baseContent}${attachmentSummary}`,
        createdAt: Number.isFinite(stamp) ? stamp : undefined,
        attachments: imageAttachments,
      }
    })
  })

  const composerAttachments = computed<PilotComposerAttachment[]>(() => {
    const pendingSet = new Set(pendingAttachments.value.map(item => item.id))
    return attachments.value.map((item) => {
      return {
        id: item.id,
        label: item.name,
        kind: resolveAttachmentKind(item),
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

  function updateRunPreferences(patch: Partial<typeof runPreferences.value>) {
    runPreferences.value = {
      ...runPreferences.value,
      ...patch,
    }
  }

  function shouldAutoFollowSession(sessionId: string): boolean {
    const session = sessions.value.find(item => item.sessionId === sessionId)
    if (!session) {
      return false
    }
    return session.status === 'executing' || session.status === 'planning'
  }

  async function createSession(): Promise<string> {
    const data = await fetchJson<{ session: PilotSession }>('/api/chat/sessions', {
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
        fetchJson<{ sessions: PilotSession[] }>('/api/chat/sessions?limit=50'),
        fetchJson<SessionNotificationsResponse>('/api/chat/sessions/notifications?limit=100')
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
      await fetchJson(`/api/chat/sessions/${sessionId}/notification`, {
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
      const data = await fetchJson<SessionTitleResponse>(`/api/chat/sessions/${sessionId}/title`, {
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

  function upsertSystemMessageFromStreamEvent(input: {
    sessionId: string
    eventType: string
    seq: number
    payload: Record<string, unknown>
    detail?: Record<string, unknown>
    message?: string
    delta?: string
    replay?: boolean
  }) {
    if (input.replay) {
      return
    }
    if (!Number.isFinite(input.seq) || input.seq <= 0) {
      return
    }
    const projected = projectPilotSystemMessage({
      type: input.eventType,
      seq: input.seq,
      payload: input.payload,
      detail: input.detail,
      message: input.message,
      delta: input.delta,
    })
    if (!projected) {
      return
    }
    if (String(projected.metadata.cardType || '').trim().toLowerCase() === 'websearch') {
      return
    }
    if (shouldHidePilotClientSystemMessage(projected.metadata)) {
      return
    }

    const messageId = buildPilotSystemMessageId(
      input.sessionId,
      input.seq,
      projected.metadata.sourceEventType,
    )
    const existing = messages.value.find(item => item.id === messageId)
    if (existing) {
      existing.content = projected.content
      existing.metadata = projected.metadata as unknown as Record<string, unknown>
      syncToolCallList()
      return
    }

    messages.value.push({
      id: messageId,
      role: 'system',
      content: projected.content,
      createdAt: new Date().toISOString(),
      metadata: projected.metadata as unknown as Record<string, unknown>,
    })
    syncToolCallList()
  }

  function normalizeToolRiskLevel(value: unknown): PilotToolCall['riskLevel'] {
    const risk = String(value || '').trim().toLowerCase()
    if (risk === 'critical') {
      return 'critical'
    }
    if (risk === 'high') {
      return 'high'
    }
    if (risk === 'medium') {
      return 'medium'
    }
    return 'low'
  }

  function normalizeToolStatus(value: unknown): PilotToolCall['status'] {
    const status = String(value || '').trim().toLowerCase()
    if (status === 'started' || status === 'approval_required' || status === 'approved' || status === 'rejected' || status === 'completed' || status === 'failed') {
      return status
    }
    return 'running'
  }

  function normalizeToolSources(value: unknown): PilotToolCall['sources'] {
    if (!Array.isArray(value)) {
      return []
    }
    return value
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const row = item as Record<string, unknown>
        return {
          id: typeof row.id === 'string' ? row.id : undefined,
          url: String(row.url || '').trim(),
          title: typeof row.title === 'string' ? row.title : undefined,
          snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
          domain: typeof row.domain === 'string' ? row.domain : undefined,
          sourceType: typeof row.sourceType === 'string' ? row.sourceType : undefined,
        }
      })
      .filter(item => item.url)
  }

  function syncToolCallList() {
    const latestUserCreatedAt = [...messages.value]
      .reverse()
      .find(item => item.role === 'user')
      ?.createdAt
    const latestUserStamp = Date.parse(String(latestUserCreatedAt || ''))
    const scopedMessages = Number.isFinite(latestUserStamp)
      ? messages.value.filter((item) => {
          if (item.role !== 'system') {
            return true
          }
          const stamp = Date.parse(String(item.createdAt || ''))
          return Number.isFinite(stamp) && stamp >= latestUserStamp
        })
      : messages.value
    const fromSystemMessages = derivePilotToolCallsFromSystemMessages(scopedMessages, 20)
    if (fromSystemMessages.length > 0) {
      toolCalls.value = fromSystemMessages
      return
    }
    toolCalls.value = Array.from(toolCallMap.values())
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 20)
  }

  function upsertToolCall(payload: {
    callId: string
    toolId?: string
    toolName?: string
    status?: string
    riskLevel?: string
    inputPreview?: string
    outputPreview?: string
    durationMs?: number
    ticketId?: string
    sources?: unknown
    errorCode?: string
    errorMessage?: string
  }) {
    const callId = String(payload.callId || '').trim() || makeId(`tool_${String(payload.toolName || 'tool').trim()}`)
    const previous = toolCallMap.get(callId)
    const nowIso = new Date().toISOString()
    const next: PilotToolCall = {
      callId,
      toolId: String(payload.toolId || previous?.toolId || '').trim() || 'tool.unknown',
      toolName: String(payload.toolName || previous?.toolName || '').trim() || 'tool',
      status: normalizeToolStatus(payload.status || previous?.status || 'running'),
      riskLevel: normalizeToolRiskLevel(payload.riskLevel || previous?.riskLevel || 'low'),
      inputPreview: String(payload.inputPreview || previous?.inputPreview || '').trim() || undefined,
      outputPreview: String(payload.outputPreview || previous?.outputPreview || '').trim() || undefined,
      durationMs: Number.isFinite(Number(payload.durationMs))
        ? Math.max(0, Number(payload.durationMs))
        : previous?.durationMs,
      ticketId: String(payload.ticketId || previous?.ticketId || '').trim() || undefined,
      sources: normalizeToolSources(payload.sources) || previous?.sources || [],
      errorCode: String(payload.errorCode || previous?.errorCode || '').trim() || undefined,
      errorMessage: String(payload.errorMessage || previous?.errorMessage || '').trim() || undefined,
      updatedAt: nowIso,
    }

    toolCallMap.set(callId, next)
    syncToolCallList()
  }

  function handleRunAuditToolPayload(payload: Record<string, unknown>) {
    const auditType = String(payload.auditType || '').trim()
    if (!auditType.startsWith('tool.call.')) {
      return
    }
    upsertToolCall({
      callId: String(payload.callId || '').trim(),
      toolId: String(payload.toolId || '').trim(),
      toolName: String(payload.toolName || '').trim(),
      status: String(payload.status || '').trim() || auditType.replace('tool.call.', ''),
      riskLevel: String(payload.riskLevel || '').trim(),
      inputPreview: String(payload.inputPreview || '').trim(),
      outputPreview: String(payload.outputPreview || '').trim(),
      durationMs: Number(payload.durationMs || 0),
      ticketId: String(payload.ticketId || '').trim(),
      sources: payload.sources,
      errorCode: String(payload.errorCode || '').trim(),
      errorMessage: String(payload.errorMessage || '').trim(),
    })
  }

  function appendAssistantText(content: string) {
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

  function clearAssistantFlushTimer() {
    if (assistantFlushTimer) {
      clearTimeout(assistantFlushTimer)
      assistantFlushTimer = null
    }
  }

  function flushAssistantDeltaBuffer() {
    const content = assistantDeltaBuffer
    assistantDeltaBuffer = ''
    clearAssistantFlushTimer()
    if (!content) {
      return
    }
    appendAssistantText(content.slice(0, 4000))
  }

  function scheduleAssistantDeltaFlush() {
    if (assistantFlushTimer) {
      return
    }
    assistantFlushTimer = setTimeout(() => {
      flushAssistantDeltaBuffer()
    }, ASSISTANT_CHUNK_FLUSH_MS)
  }

  function appendAssistantDelta(delta: string) {
    const content = String(delta || '')
    if (!content)
      return

    assistantDeltaBuffer += content

    if (shouldFlushImmediately(content)) {
      flushAssistantDeltaBuffer()
      return
    }

    scheduleAssistantDeltaFlush()
  }

  function appendAssistantFinal(message: string) {
    flushAssistantDeltaBuffer()

    const finalText = String(message || '')
    if (!finalText) {
      return
    }

    const activeMessage = activeAssistantMessageId.value
      ? messages.value.find(item => item.id === activeAssistantMessageId.value)
      : undefined

    if (!activeMessage) {
      appendAssistantText(finalText)
      return
    }

    if (activeMessage.content === finalText) {
      return
    }

    if (finalText.startsWith(activeMessage.content)) {
      appendAssistantText(finalText.slice(activeMessage.content.length))
      return
    }

    activeMessage.content = finalText
  }

  function appendAssistantFailure(message: string, detail?: Record<string, unknown>) {
    const normalizedMessage = String(message || '').trim() || '请求失败，请稍后重试'
    const diagnostics = detail && Object.keys(detail).length > 0
      ? `\n\n---\n诊断信息:\n\`\`\`json\n${JSON.stringify(detail, null, 2)}\n\`\`\``
      : ''

    flushAssistantDeltaBuffer()
    activeAssistantMessageId.value = null
    messages.value.push({
      id: makeId('msg_assistant_error'),
      role: 'assistant',
      content: `请求失败：${normalizedMessage}${diagnostics}`,
      createdAt: new Date().toISOString(),
    })
  }

  function applyRuntimeStateByEvent(
    eventType: string,
    payload: Record<string, unknown>,
    delta = '',
    message = '',
  ) {
    if (eventType === 'intent.started') {
      intentState.value = {
        ...intentState.value,
        phase: 'running',
      }
      return
    }

    if (eventType === 'intent.completed') {
      intentState.value = {
        phase: 'completed',
        intentType: String(payload.intentType || intentState.value.intentType || '').trim(),
        reason: String(payload.reason || '').trim(),
        confidence: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0,
        strategy: String(payload.strategy || '').trim(),
      }
      return
    }

    if (eventType === 'memory.context') {
      const enabled = typeof payload.memoryEnabled === 'boolean'
        ? payload.memoryEnabled
        : null
      const historyCount = Number.isFinite(Number(payload.memoryHistoryMessageCount))
        ? Math.max(0, Number(payload.memoryHistoryMessageCount))
        : 0
      memoryState.value = {
        enabled,
        historyCount,
      }
      return
    }

    if (eventType === 'memory.updated') {
      const enabled = typeof payload.memoryEnabled === 'boolean'
        ? payload.memoryEnabled
        : null
      const addedCount = Number(payload.addedCount)
      const stored = payload.stored === true
      let historyCount = memoryState.value.historyCount
      if (stored && Number.isFinite(addedCount) && addedCount > 0) {
        historyCount = Math.max(0, memoryState.value.historyCount + Math.floor(addedCount))
      }
      else if (Number.isFinite(Number(payload.historyAfter))) {
        historyCount = Math.max(0, Number(payload.historyAfter))
      }
      else if (Number.isFinite(Number(payload.memoryHistoryMessageCount))) {
        historyCount = Math.max(0, Number(payload.memoryHistoryMessageCount))
      }
      memoryState.value = {
        enabled,
        historyCount,
      }
      return
    }

    if (eventType === 'websearch.decision') {
      websearchState.value = {
        phase: 'decided',
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : null,
        reason: normalizeWebsearchReason(payload.reason, 'decision'),
        source: '',
        sourceCount: 0,
      }
      return
    }

    if (eventType === 'websearch.executed') {
      websearchState.value = {
        phase: 'executed',
        enabled: true,
        reason: normalizeWebsearchReason(payload.reason || websearchState.value.reason || '', 'executed'),
        source: String(payload.source || '').trim(),
        sourceCount: Number.isFinite(Number(payload.sourceCount)) ? Math.max(0, Number(payload.sourceCount)) : 0,
      }
      return
    }

    if (eventType === 'websearch.skipped') {
      websearchState.value = {
        phase: 'skipped',
        enabled: false,
        reason: normalizeWebsearchReason(payload.reason || websearchState.value.reason || '', 'skipped'),
        source: '',
        sourceCount: 0,
      }
      return
    }

    if (eventType === 'thinking.delta') {
      const chunk = String(delta || payload.text || '')
      if (!chunk) {
        return
      }
      thinkingStreaming.value = true
      thinkingText.value += chunk
      return
    }

    if (eventType === 'thinking.final') {
      const finalText = String(message || payload.text || '')
      if (finalText) {
        thinkingText.value = finalText
      }
      thinkingStreaming.value = false
      return
    }

    if (eventType === 'assistant.final' || eventType === 'done' || eventType === 'error') {
      thinkingStreaming.value = false
      if ((eventType === 'done' || eventType === 'error') && websearchState.value.phase === 'decided') {
        websearchState.value = {
          phase: 'skipped',
          enabled: false,
          reason: normalizeWebsearchReason(websearchState.value.reason || 'terminal_finalize', 'skipped'),
          source: '',
          sourceCount: 0,
        }
      }
    }
  }

  async function loadSessionMessages(sessionId: string) {
    if (!sessionId)
      return

    loadingMessages.value = true
    try {
      const data = await fetchJson<SessionMessagesResponse>(`/api/chat/sessions/${sessionId}/messages`)
      messages.value = Array.isArray(data.messages)
        ? data.messages.filter((item) => {
            if (item.role !== 'system') {
              return true
            }
            const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
              ? item.metadata
              : {}
            const cardType = String(metadata.cardType || '').trim().toLowerCase()
            if (cardType === 'websearch') {
              return false
            }
            return !shouldHidePilotClientSystemMessage(metadata)
          })
        : []
      attachments.value = Array.isArray(data.attachments) ? data.attachments : []
      pendingAttachments.value = []
      activeAssistantMessageId.value = null
      toolCallMap.clear()
      syncToolCallList()
      assistantDeltaBuffer = ''
      clearAssistantFlushTimer()
      resetRuntimeStates()
    }
    finally {
      loadingMessages.value = false
    }
  }

  async function loadSessionTrace(sessionId: string, fromSeq = 1, append = false) {
    if (!sessionId)
      return

    const data = await fetchJson<SessionTraceResponse>(`/api/chat/sessions/${sessionId}/trace?fromSeq=${fromSeq}&limit=500`)
    const items = Array.isArray(data.traces) ? data.traces : []

    if (!append) {
      const normalized = items
        .filter(item => !shouldHidePilotClientRuntimeEvent(item.type))
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
      resetRuntimeStates()
      for (const trace of normalized) {
        applyRuntimeStateByEvent(
          String(trace.type || ''),
          trace.payload || {},
          String((trace as unknown as Record<string, unknown>).delta || ''),
          String((trace as unknown as Record<string, unknown>).message || ''),
        )
      }
    }
    else {
      for (const item of items) {
        if (shouldHidePilotClientRuntimeEvent(item.type)) {
          continue
        }
        appendTrace(item)
        applyRuntimeStateByEvent(
          String(item.type || ''),
          item.payload || {},
          String((item as unknown as Record<string, unknown>).delta || ''),
          String((item as unknown as Record<string, unknown>).message || ''),
        )
      }
      lastSeq.value = traceItems.value.reduce((acc, row) => Math.max(acc, Number(row.seq || 0)), lastSeq.value)
    }
  }

  async function selectSession(sessionId: string) {
    if (!sessionId) {
      return
    }

    activeSessionId.value = sessionId
    await Promise.all([
      loadSessionMessages(sessionId),
      loadSessionTrace(sessionId),
    ])

    void markSessionNotificationRead(sessionId)
    void maybeSummarizeActiveSessionTitle(sessionId)

    if (shouldAutoFollowSession(sessionId) && !isSessionRunning(sessionId)) {
      void replayFromSeq().catch((error) => {
        streamError.value = error instanceof Error ? error.message : '自动续接失败'
      })
    }
  }

  async function deleteSession(sessionId: string) {
    if (!sessionId || deletingSessionId.value) {
      return
    }

    deletingSessionId.value = sessionId

    try {
      if (isSessionRunning(sessionId)) {
        abortSessionStream(sessionId, 'session_deleted')
      }

      await fetchJson<{ ok: boolean }>(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      })

      if (activeSessionId.value === sessionId) {
        activeSessionId.value = ''
        messages.value = []
        traceItems.value = []
        traceKeySet.clear()
        toolCallMap.clear()
        toolCalls.value = []
        attachments.value = []
        pendingAttachments.value = []
        activeAssistantMessageId.value = null
        assistantDeltaBuffer = ''
        clearAssistantFlushTimer()
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
    const eventType = String(item.type || item.event || '').trim()
    const eventSessionId = String(item.sessionId || activeSessionId.value || '').trim()
    const isActiveSessionEvent = eventSessionId !== '' && eventSessionId === activeSessionId.value
    const eventSeq = Number(item.seq || lastSeq.value || 1)
    const normalizedSeq = Number.isFinite(eventSeq) && eventSeq > 0
      ? Math.floor(eventSeq)
      : Math.max(1, lastSeq.value)

    if (!eventSessionId || !eventType) {
      return
    }
    if (shouldHidePilotClientRuntimeEvent(eventType)) {
      return
    }

    const payloadRecord = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? item.payload
      : {}
    const detailRecord = item.detail && typeof item.detail === 'object' && !Array.isArray(item.detail)
      ? item.detail
      : undefined

    if (typeof item.seq === 'number' && Number.isFinite(item.seq)) {
      if (isActiveSessionEvent) {
        lastSeq.value = Math.max(lastSeq.value, item.seq)
      }
    }

    if (isActiveSessionEvent) {
      upsertSystemMessageFromStreamEvent({
        sessionId: eventSessionId,
        eventType,
        seq: normalizedSeq,
        payload: payloadRecord,
        detail: detailRecord,
        message: String(item.message || ''),
        delta: String(item.delta || ''),
        replay: Boolean(item.replay),
      })
    }

    if (eventType === 'turn.accepted' || eventType === 'turn.queued' || eventType === 'turn.started') {
      if (eventType === 'turn.accepted' || eventType === 'turn.queued' || eventType === 'turn.started') {
        setSessionRunning(eventSessionId, true)
      }
      if (!isActiveSessionEvent) {
        return
      }
      appendTrace(mapTrace(eventType, normalizedSeq, {
        request_id: item.request_id,
        turn_id: item.turn_id || item.turnId,
        queue_pos: item.queue_pos,
        phase: item.phase,
      }))
      return
    }

    if (eventType === 'turn.delta') {
      if (!isActiveSessionEvent) {
        return
      }
      appendAssistantDelta(String(item.delta || ''))
      if (traceDrawerOpen.value) {
        appendTrace(mapTrace('turn.delta', normalizedSeq, {
          request_id: item.request_id,
          turn_id: item.turn_id || item.turnId,
          queue_pos: item.queue_pos,
          phase: item.phase,
          replay: Boolean(item.replay),
        }))
      }
      return
    }

    if (eventType === 'turn.completed') {
      setSessionRunning(eventSessionId, false)
      if (!isActiveSessionEvent) {
        return
      }
      appendAssistantFinal(String(item.message || ''))
      activeAssistantMessageId.value = null
      appendTrace(mapTrace('turn.completed', normalizedSeq, {
        request_id: item.request_id,
        turn_id: item.turn_id || item.turnId,
        queue_pos: item.queue_pos,
        phase: item.phase,
        replay: Boolean(item.replay),
      }))
      return
    }

    if (eventType === 'turn.failed') {
      setSessionRunning(eventSessionId, false)
      if (!isActiveSessionEvent) {
        return
      }

      const message = String(item.message || '请求失败，请稍后重试')
      const detail: Record<string, unknown> = {
        ...(item.detail || {}),
      }
      if (item.code) {
        detail.code = item.code
      }
      if (Number.isFinite(Number(item.status_code))) {
        detail.status_code = Number(item.status_code)
      }
      if (item.request_id) {
        detail.request_id = item.request_id
      }
      if (item.turn_id || item.turnId) {
        detail.turn_id = item.turn_id || item.turnId
      }
      if (item.phase) {
        detail.phase = item.phase
      }

      const diagnostic = Object.keys(detail).length > 0 ? detail : undefined
      streamError.value = toPrettyErrorMessage(message, diagnostic)
      appendAssistantFailure(message, diagnostic)
      streamHandledFailureMessageSessions.add(eventSessionId)
      appendTrace(mapTrace('turn.failed', normalizedSeq, {
        ...detail,
        message,
      }))
      return
    }

    if (eventType === 'turn.approval_required') {
      setSessionRunning(eventSessionId, false)
      if (!isActiveSessionEvent) {
        return
      }

      flushAssistantDeltaBuffer()
      const message = String(item.message || '工具调用需要审批，请审批后重试。').trim()
      const detail = item.detail && typeof item.detail === 'object'
        ? item.detail
        : {}
      const toolName = String(detail.tool_name || detail.toolName || 'tool').trim() || 'tool'
      const callId = String(detail.call_id || '').trim() || makeId(`approval_${toolName}`)

      handleRunAuditToolPayload({
        auditType: 'tool.call.approval_required',
        callId,
        toolId: String(detail.tool_id || detail.toolId || '').trim() || 'tool.unknown',
        toolName,
        status: 'approval_required',
        riskLevel: String(detail.risk_level || detail.riskLevel || 'high').trim(),
        ticketId: String(detail.ticket_id || detail.ticketId || '').trim(),
        errorCode: String(item.code || detail.code || '').trim(),
        errorMessage: message,
      })

      reconnectHint.value = message || '检测到高风险工具调用，等待审批后可继续。'
      appendTrace(mapTrace('turn.approval_required', normalizedSeq, {
        request_id: item.request_id,
        turn_id: item.turn_id || item.turnId,
        queue_pos: item.queue_pos,
        phase: item.phase,
        code: item.code,
        message,
        detail,
      }))
      return
    }

    if (eventType === 'title.generated') {
      if (!isActiveSessionEvent) {
        return
      }
      const titleEvent = item as unknown as Record<string, unknown>
      const title = String(titleEvent.title || '').trim()
      if (title) {
        sessions.value = sessions.value.map((row) => {
          if (row.sessionId !== eventSessionId) {
            return row
          }
          return {
            ...row,
            title,
            updatedAt: new Date().toISOString(),
          }
        })
      }
      appendTrace(mapTrace('title.generated', normalizedSeq, {
        request_id: item.request_id,
        turn_id: item.turn_id || item.turnId,
        title,
        source: titleEvent.source,
        generated: titleEvent.generated,
        phase: item.phase,
      }))
      return
    }

    if (eventType === 'title.failed') {
      if (!isActiveSessionEvent) {
        return
      }
      appendTrace(mapTrace('title.failed', normalizedSeq, {
        request_id: item.request_id,
        turn_id: item.turn_id || item.turnId,
        message: String(item.message || ''),
        phase: item.phase,
      }))
      return
    }

    if (
      eventType === 'stream.started'
      || eventType === 'planning.started'
      || eventType === 'planning.updated'
      || eventType === 'planning.finished'
      || eventType === 'replay.started'
      || eventType === 'replay.finished'
      || eventType === 'turn.finished'
    ) {
      if (!isActiveSessionEvent) {
        return
      }
      appendTrace(mapTrace(eventType, normalizedSeq, {
        ...(item.payload || {}),
        replay: Boolean(item.replay),
      }))
      return
    }

    if (eventType === 'run.audit') {
      if (!isActiveSessionEvent) {
        return
      }
      const payload = item.payload && typeof item.payload === 'object'
        ? item.payload
        : {}
      handleRunAuditToolPayload(payload)
      appendTrace(mapTrace('run.audit', normalizedSeq, {
        ...payload,
        replay: Boolean(item.replay),
      }))
      return
    }

    if (
      eventType === 'intent.started'
      || eventType === 'intent.completed'
      || eventType === 'memory.context'
      || eventType === 'memory.updated'
      || eventType === 'websearch.decision'
      || eventType === 'websearch.executed'
      || eventType === 'websearch.skipped'
    ) {
      if (!isActiveSessionEvent) {
        return
      }
      const payload = item.payload && typeof item.payload === 'object'
        ? item.payload
        : {}
      applyRuntimeStateByEvent(eventType, payload)
      appendTrace(mapTrace(eventType, normalizedSeq, {
        ...payload,
        replay: Boolean(item.replay),
      }))
      return
    }

    if (eventType === 'status_updated') {
      if (!isActiveSessionEvent) {
        return
      }
      console.warn('[pilot-chat] legacy event ignored', {
        eventType,
        sessionId: eventSessionId,
      })
      appendTrace(mapTrace('status_updated', normalizedSeq, {
        status: item.status,
        name: item.name,
        data: item.data,
      }))
      return
    }

    if (eventType === 'assistant.delta') {
      if (!isActiveSessionEvent) {
        return
      }
      appendAssistantDelta(String(item.delta || ''))
      if (traceDrawerOpen.value) {
        appendTrace(mapTrace('assistant.delta', normalizedSeq, {
          replay: Boolean(item.replay),
        }))
      }
      return
    }

    if (eventType === 'thinking.delta') {
      if (!isActiveSessionEvent) {
        return
      }
      applyRuntimeStateByEvent('thinking.delta', item.payload || {}, String(item.delta || ''), '')
      if (traceDrawerOpen.value) {
        appendTrace(mapTrace('thinking.delta', normalizedSeq, {
          replay: Boolean(item.replay),
        }))
      }
      return
    }

    if (eventType === 'thinking.final') {
      if (!isActiveSessionEvent) {
        return
      }
      applyRuntimeStateByEvent('thinking.final', item.payload || {}, '', String(item.message || ''))
      appendTrace(mapTrace('thinking.final', normalizedSeq, {
        replay: Boolean(item.replay),
      }))
      return
    }

    if (eventType === 'assistant.final') {
      if (!isActiveSessionEvent) {
        return
      }
      applyRuntimeStateByEvent('assistant.final', item.payload || {}, '', String(item.message || ''))
      appendAssistantFinal(String(item.message || ''))
      activeAssistantMessageId.value = null
      appendTrace(mapTrace('assistant.final', normalizedSeq, {
        replay: Boolean(item.replay),
      }))
      return
    }

    if (eventType === 'session.paused') {
      setSessionRunning(eventSessionId, false)
      if (!isActiveSessionEvent) {
        return
      }
      flushAssistantDeltaBuffer()
      reconnectHint.value = `会话已暂停：${item.reason || 'unknown'}`
      appendTrace(mapTrace('session.paused', normalizedSeq, {
        reason: item.reason,
      }))
      return
    }

    if (eventType === 'run.metrics') {
      if (!isActiveSessionEvent) {
        return
      }
      if (traceDrawerOpen.value) {
        appendTrace(mapTrace('run.metrics', normalizedSeq, {
          ...(item.payload || {}),
        }))
      }
      return
    }

    if (eventType === 'error') {
      setSessionRunning(eventSessionId, false)
      if (!isActiveSessionEvent) {
        return
      }
      const detail = item.detail && typeof item.detail === 'object'
        ? item.detail
        : {}
      const errorCode = String(item.code || (detail as Record<string, unknown>).code || '').trim()
      if (includesToolApprovalRequired(errorCode)) {
        flushAssistantDeltaBuffer()
        const message = String(item.message || '工具调用需要审批，请审批后重试。').trim()
        const toolName = String((detail as Record<string, unknown>).tool_name || (detail as Record<string, unknown>).toolName || 'tool').trim() || 'tool'
        const callId = String((detail as Record<string, unknown>).call_id || '').trim() || makeId(`approval_${toolName}`)
        handleRunAuditToolPayload({
          auditType: 'tool.call.approval_required',
          callId,
          toolId: String((detail as Record<string, unknown>).tool_id || (detail as Record<string, unknown>).toolId || '').trim() || 'tool.unknown',
          toolName,
          status: 'approval_required',
          riskLevel: String((detail as Record<string, unknown>).risk_level || (detail as Record<string, unknown>).riskLevel || 'high').trim(),
          ticketId: String((detail as Record<string, unknown>).ticket_id || (detail as Record<string, unknown>).ticketId || '').trim(),
          errorCode,
          errorMessage: message,
        })
        reconnectHint.value = message || '检测到高风险工具调用，等待审批后可继续。'
        appendTrace(mapTrace('turn.approval_required', normalizedSeq, {
          request_id: item.request_id,
          turn_id: item.turn_id || item.turnId,
          queue_pos: item.queue_pos,
          phase: item.phase,
          code: item.code,
          message,
          detail,
          legacy_error_compat: true,
        }))
        return
      }
      applyRuntimeStateByEvent('error', item.payload || {}, '', String(item.message || ''))
      flushAssistantDeltaBuffer()
      streamError.value = toPrettyErrorMessage(String(item.message || 'Stream error'), detail)
      appendTrace(mapTrace('error', normalizedSeq, {
        message: String(item.message || 'Stream error'),
        detail,
      }))
      return
    }

    if (eventType === 'done') {
      setSessionRunning(eventSessionId, false)
      if (!isActiveSessionEvent) {
        return
      }
      applyRuntimeStateByEvent('done', item.payload || {})
      flushAssistantDeltaBuffer()
      activeAssistantMessageId.value = null
      return
    }

    if (!isActiveSessionEvent) {
      return
    }

    appendTrace(mapTrace(eventType || 'unknown', normalizedSeq, {
      ...(item.payload || {}),
      replay: Boolean(item.replay),
    }))
  }

  async function consumeSseResponse(
    streamBody: ReadableStream<Uint8Array> | null,
    options: {
      sessionId: string
      abortController: AbortController
    },
  ) {
    if (!streamBody) {
      throw new Error('empty stream body')
    }

    const reader = streamBody.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let processedSinceYield = 0
    const startedAt = Date.now()

    const readWithIdleTimeout = async () => {
      return await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const timer = setTimeout(() => {
          options.abortController.abort('stream_idle_timeout')
          reject(new Error(`流式响应超时（超过 ${Math.round(streamIdleTimeoutMs / 1000)}s 无事件）`))
        }, streamIdleTimeoutMs)

        void reader.read()
          .then((result) => {
            clearTimeout(timer)
            resolve(result)
          })
          .catch((error) => {
            clearTimeout(timer)
            reject(error)
          })
      })
    }

    while (true) {
      if ((Date.now() - startedAt) > streamMaxDurationMs) {
        options.abortController.abort('stream_max_timeout')
        throw new Error(`流式响应超时（超过 ${Math.round(streamMaxDurationMs / 1000)}s）`)
      }

      const { value, done } = await readWithIdleTimeout()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })

      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        const events = parseSseChunks(chunk)
        for (const item of events) {
          applyStreamEvent({
            ...item,
            sessionId: item.sessionId || options.sessionId,
          })
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
        applyStreamEvent({
          ...item,
          sessionId: item.sessionId || options.sessionId,
        })
      }
    }
  }

  async function openStream(payload: Record<string, unknown>) {
    const sessionId = await ensureActiveSession()
    const requestPayload: Record<string, unknown> = {
      ...payload,
      modelId: typeof payload.modelId === 'string' && String(payload.modelId).trim()
        ? payload.modelId
        : runPreferences.value.modelId,
      routeComboId: typeof payload.routeComboId === 'string' && String(payload.routeComboId).trim()
        ? payload.routeComboId
        : (runPreferences.value.routeComboId || undefined),
      internet: typeof payload.internet === 'boolean'
        ? payload.internet
        : runPreferences.value.internet,
      thinking: typeof payload.thinking === 'boolean'
        ? payload.thinking
        : runPreferences.value.thinking,
      pilotMode: typeof payload.pilotMode === 'boolean'
        ? payload.pilotMode
        : runPreferences.value.pilotMode,
      memoryEnabled: typeof payload.memoryEnabled === 'boolean'
        ? payload.memoryEnabled
        : runPreferences.value.memoryEnabled,
    }
    const beforeSeq = lastSeq.value
    const hasTurnMessage = Boolean(String(requestPayload.message || '').trim())
      || (Array.isArray(requestPayload.attachments) && requestPayload.attachments.length > 0)
    const isConversationFollowStream = !hasTurnMessage

    abortSessionStream(sessionId, 'restart_same_session')
    const streamAbortController = new AbortController()
    streamAbortControllers.set(sessionId, streamAbortController)
    setSessionRunning(sessionId, true)

    const isCurrentActiveSession = () => activeSessionId.value === sessionId
    if (isCurrentActiveSession()) {
      streamError.value = ''
      reconnectHint.value = ''
      if (hasTurnMessage) {
        toolCallMap.clear()
        toolCalls.value = []
        intentState.value = {
          ...intentState.value,
          phase: 'running',
        }
        websearchState.value = {
          phase: 'idle',
          enabled: null,
          reason: '',
          source: '',
          sourceCount: 0,
        }
        thinkingStreaming.value = requestPayload.thinking === true
        thinkingText.value = ''
      }
    }

    try {
      const response = await networkClient.request<ReadableStream<Uint8Array> | null>({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/stream`,
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body: requestPayload,
        signal: streamAbortController.signal,
        responseType: 'stream',
      })

      await consumeSseResponse(response.data, {
        sessionId,
        abortController: streamAbortController,
      })
    }
    catch (error) {
      if (streamAbortController.signal.aborted) {
        const abortReason = String(streamAbortController.signal.reason || '')
        const isTimeoutAbort = abortReason === 'stream_idle_timeout' || abortReason === 'stream_max_timeout'
        if (isTimeoutAbort) {
          if (isCurrentActiveSession()) {
            streamError.value = error instanceof Error ? error.message : '流式响应超时'
          }
          if (isConversationFollowStream) {
            await autoPauseSessionForTimeout(sessionId, abortReason)
          }
        }
        return
      }

      if (isCurrentActiveSession()) {
        const errorMessage = error instanceof Error ? error.message : '流式请求失败'
        streamError.value = errorMessage
        appendAssistantFailure(errorMessage)
        streamHandledFailureMessageSessions.add(sessionId)
      }
      return
    }
    finally {
      const currentController = streamAbortControllers.get(sessionId)
      if (currentController === streamAbortController) {
        streamAbortControllers.delete(sessionId)
      }
      setSessionRunning(sessionId, false)

      if (isCurrentActiveSession()) {
        flushAssistantDeltaBuffer()
        activeAssistantMessageId.value = null
      }

      const tasks: Array<Promise<unknown>> = [
        refreshSessions(sessionId),
      ]

      if (isCurrentActiveSession() && (streamError.value || traceDrawerOpen.value)) {
        tasks.push(loadSessionTrace(sessionId, Math.max(1, beforeSeq + 1), true))
      }

      // Avoid replacing the whole message list after each stream completion.
      // Full sync is still applied when stream errors happen.
      if (isCurrentActiveSession() && streamError.value && !streamHandledFailureMessageSessions.has(sessionId)) {
        tasks.push(loadSessionMessages(sessionId))
      }

      try {
        await Promise.all(tasks)
      }
      finally {
        streamHandledFailureMessageSessions.delete(sessionId)
      }

      if (isCurrentActiveSession()) {
        void maybeSummarizeActiveSessionTitle(sessionId)
      }
    }
  }

  async function sendMessage() {
    const content = clampInputText(draft.value)
    const outgoingAttachments = [...pendingAttachments.value]
    if (!content && outgoingAttachments.length <= 0) {
      return
    }
    const displayContent = content || (outgoingAttachments.length > 0 ? '(无正文内容)' : '')

    const sessionId = await ensureActiveSession()
    if (isSessionRunning(sessionId)) {
      return
    }

    messages.value.push({
      id: makeId('msg_user'),
      role: 'user',
      content: displayContent,
      createdAt: new Date().toISOString(),
      metadata: outgoingAttachments.length > 0
        ? {
            attachments: outgoingAttachments.map(item => ({
              id: item.id,
              type: resolveAttachmentKind(item),
              ref: item.ref,
              name: item.name,
              mimeType: item.mimeType,
              previewUrl: item.previewUrl,
            })),
          }
        : undefined,
    })

    draft.value = ''
    pendingAttachments.value = []

    await openStream({
      message: content,
      sessionId,
      attachments: outgoingAttachments.map(item => ({
        id: item.id,
        type: resolveAttachmentKind(item),
        ref: item.ref,
        name: item.name,
        mimeType: item.mimeType,
        previewUrl: item.previewUrl,
      })),
    })
  }

  async function onComposerSend(payload: { text: string }) {
    draft.value = payload.text
    await sendMessage()
  }

  async function replayFromSeq() {
    const sessionId = await ensureActiveSession()
    if (isSessionRunning(sessionId)) {
      return
    }
    await openStream({
      fromSeq: Math.max(1, lastSeq.value + 1),
      sessionId,
      follow: true,
    })
  }

  async function uploadAttachment(file: File) {
    const capability = await ensureAttachmentAllowed()
    const maxBytes = Number.isFinite(capability.maxBytes) ? capability.maxBytes : MAX_ATTACHMENT_BYTES
    if (file.size > maxBytes) {
      const maxMb = Math.max(1, Math.floor(maxBytes / 1024 / 1024))
      throw new Error(`附件大小不能超过 ${maxMb}MB`)
    }

    const sessionId = await ensureActiveSession()
    const formData = new FormData()
    formData.append('file', file, file.name)
    formData.append('name', file.name)
    formData.append('mimeType', file.type || 'application/octet-stream')
    formData.append('size', String(file.size))
    const response = await fetchJson<{ attachment: PilotAttachment }>(`/api/chat/sessions/${sessionId}/uploads`, {
      method: 'POST',
      body: formData,
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
        streamError.value = normalizeAttachmentError(error)
        break
      }
    }
  }

  async function handleCreateSession() {
    const createdId = await createSession()
    await selectSession(createdId)
  }

  async function bootstrap() {
    await refreshCapability()
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
    for (const [sessionId] of streamAbortControllers) {
      abortSessionStream(sessionId, 'component_unmounted')
    }
    toolCallMap.clear()
    toolCalls.value = []
    assistantDeltaBuffer = ''
    clearAssistantFlushTimer()
  })

  return {
    pilotTitle,
    sessionRows,
    activeSessionId,
    activeSessionTitle,
    activeSessionTitleLoading,
    loadingSessions,
    running,
    hasRunningSessions,
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
    toolCalls,
    lastSeq,
    thinkingText,
    thinkingStreaming,
    runtimeStatus,
    runPreferences,
    updateRunPreferences,
  }
}
