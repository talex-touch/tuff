<script setup lang="ts">
import type {
  IntelligenceMessage,
  TuffIntelligenceApprovalTicket,
} from '@talex-touch/utils'
import { TuffInput, TxBaseSurface, TxButton, TxCard, TxCollapse, TxCollapseItem, TxFlipOverlay, TxGlowText, TxSkeleton, TxSpinner, TxTimeline, TxTimelineItem } from '@talex-touch/tuffex'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

interface LabConversationItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  kind?: 'answer' | 'status'
  content: string
  i18nKey?: string
  i18nParams?: Record<string, string | number>
  symbol?: string
  eventType?: string
  phase?: string
  seq?: number
  detail?: Record<string, unknown>
  timestamp: number
}

interface LabRuntimeMetrics {
  sessionId: string
  status: 'completed' | 'failed' | 'waiting_approval' | 'paused_disconnect'
  totalActions: number
  completedActions: number
  failedActions: number
  waitingApprovals: number
  approvalHitCount: number
  fallbackCount: number
  retryCount: number
  streamEventCount: number
  durationMs: number
  toolFailureDistribution: Record<string, number>
  generatedAt: string
}

interface LabFollowUpPlan {
  summary: string
  nextActions: string[]
  revisitInHours: number
}

interface LabStreamEvent {
  contractVersion?: 2
  engine?: 'intelligence'
  runId?: string
  seq?: number
  phase?: string
  type: string
  timestamp: number
  sessionId?: string
  message?: string
  traceId?: string
  payload?: Record<string, any>
}

interface LabSessionHistoryItem {
  sessionId: string
  status: string
  pauseReason: string | null
  objective: string
  updatedAt: string
  lastEventSeq: number
  pendingActions: number
  completedActions: number
  failedActions: number
  waitingApprovals: number
}

interface LabTraceTrajectoryItem {
  seq: number
  type: string
  phase: string
  title: string
  message: string
  color: 'default' | 'primary' | 'success' | 'warning' | 'error'
  time: string
  source: LabStreamEvent
}

type ClientLocale = 'en' | 'zh'
type ClientThemeMode = 'auto' | 'dark' | 'light'

const TOOL_NEXUS_LANGUAGE_SET = 'intelligence.nexus.language.set'
const TOOL_NEXUS_THEME_SET = 'intelligence.nexus.theme.set'
const QUICK_PROMPTS = [
  { id: 'plan', text: '读取我的订阅计划' },
  { id: 'credits', text: '读取我的 credits 使用情况' },
  { id: 'language-zh', text: '切换语言到中文' },
  { id: 'theme-dark', text: '切换主题到暗色' },
]

const { t, locale, setLocale } = useI18n()
const { toggleDark } = useTheme()
const { user } = useAuthUser()
const route = useRoute()
type TraceFilterMode = 'all' | 'risk'

const SYSTEM_SYMBOL = '◆'
const SYSTEM_MESSAGE_FALLBACKS: Record<string, string> = {
  'dashboard.intelligenceLab.system.pausedNetwork': 'Paused cause network.',
  'dashboard.intelligenceLab.system.pausedManual': 'Paused manually.',
  'dashboard.intelligenceLab.system.statusRaw': '{message}',
  'dashboard.intelligenceLab.system.modelFailed': 'Model failed ({stage}).',
  'dashboard.intelligenceLab.system.planningStart': 'Planning execution graph...',
  'dashboard.intelligenceLab.system.executingStart': 'Executing plan actions...',
  'dashboard.intelligenceLab.system.reflectingStart': 'Reflecting and generating follow-up...',
  'dashboard.intelligenceLab.system.finalStreamStart': 'Composing final response stream...',
  'dashboard.intelligenceLab.system.planCreated': 'Plan ready: {total} actions.',
  'dashboard.intelligenceLab.system.executionStep': 'Step {index}/{total}: {title} ({stepStatus})',
  'dashboard.intelligenceLab.system.executionStepFailed': 'Step {index}/{total}: {title} failed ({error})',
  'dashboard.intelligenceLab.system.approvalRequired': 'Approval required: {toolId} (risk={riskLevel})',
  'dashboard.intelligenceLab.system.reflectionCompleted': 'Reflection completed.',
  'dashboard.intelligenceLab.system.followupCreated': 'Follow-up created.',
  'dashboard.intelligenceLab.system.metrics': 'Metrics: {status}, {completed}/{total}, {durationMs}ms',
  'dashboard.intelligenceLab.system.error': 'Runtime error: {message}',
  'dashboard.intelligenceLab.system.event': 'Event: {eventType}',
  'dashboard.intelligenceLab.system.approvalApproved': 'Approval granted: {toolId}',
  'dashboard.intelligenceLab.system.approvalRejected': 'Approval rejected: {toolId}',
}

function labText(
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  const translated = t(key, params as Record<string, unknown>)
  if (translated && translated !== key) {
    return translated
  }
  return applyTemplate(fallback, params)
}

const isAdmin = computed(() => user.value?.role === 'admin')
watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

const draftMessage = ref('')
const running = ref(false)
const approving = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')
const sessionId = ref('')
const lastTraceId = ref('')
const reflectionSummary = ref('')
const followUp = ref<LabFollowUpPlan | null>(null)
const runtimeMetrics = ref<LabRuntimeMetrics | null>(null)
const historyLoading = ref(false)
const activeAnswerId = ref<string | null>(null)
const hydratedSessionId = ref('')
const showMetricsOverlay = ref(false)
const metricsOverlaySource = ref<HTMLElement | null>(null)
const showHistoryOverlay = ref(false)
const historyOverlaySource = ref<HTMLElement | null>(null)
const showTraceOverlay = ref(false)
const traceOverlaySource = ref<HTMLElement | null>(null)
const traceActiveSeq = ref<number | null>(null)
const traceFilterMode = ref<TraceFilterMode>('all')
const copiedTraceSeq = ref<number | null>(null)
const sessionHistoryList = ref<LabSessionHistoryItem[]>([])
const historyListLoading = ref(false)
const expandedSystemMessageIds = ref<string[]>([])

const conversation = ref<LabConversationItem[]>([])
const streamEvents = ref<LabStreamEvent[]>([])
const pendingApprovals = ref<TuffIntelligenceApprovalTicket[]>([])
const insightExpanded = ref<string[]>(['runtime'])

let streamAbortController: AbortController | null = null

const canSend = computed(() => draftMessage.value.trim().length > 0 && !running.value && !historyLoading.value)
const runtimeDigest = computed(() => {
  if (!runtimeMetrics.value) {
    return labText('dashboard.intelligenceLab.runtime.waiting', 'Waiting')
  }
  return `${runtimeMetrics.value.completedActions}/${runtimeMetrics.value.totalActions} · ${runtimeMetrics.value.durationMs}ms`
})
const reflectionDigest = computed(() => {
  if (!reflectionSummary.value.trim()) {
    return labText('dashboard.intelligenceLab.runtime.noReflection', 'No reflection')
  }
  return reflectionSummary.value.trim().split('\n')[0]?.slice(0, 42) || labText('dashboard.intelligenceLab.runtime.reflectionReady', 'Reflection ready')
})
const followUpDigest = computed(() => {
  if (!followUp.value) {
    return labText('dashboard.intelligenceLab.runtime.noFollowUp', 'No follow-up')
  }
  return `${followUp.value.summary.slice(0, 28)} · ${followUp.value.revisitInHours}h`
})
const timelineDigest = computed(() => {
  const steps = streamEvents.value.filter(item => item.type === 'execution.step').length
  const statuses = conversation.value.filter(item => item.role === 'system').length
  return `steps=${steps} · logs=${statuses}`
})
const latestSystemMessageId = computed(() => {
  for (let index = conversation.value.length - 1; index >= 0; index--) {
    const item = conversation.value[index]
    if (item?.role === 'system') {
      return item.id
    }
  }
  return ''
})

function isSystemMessageGlowing(item: LabConversationItem): boolean {
  return item.role === 'system' && running.value && item.id === latestSystemMessageId.value
}

function isSystemDetailExpanded(id: string): boolean {
  return expandedSystemMessageIds.value.includes(id)
}

function toggleSystemDetail(id: string) {
  if (!id) {
    return
  }
  if (isSystemDetailExpanded(id)) {
    expandedSystemMessageIds.value = expandedSystemMessageIds.value.filter(item => item !== id)
    return
  }
  expandedSystemMessageIds.value = [...expandedSystemMessageIds.value, id]
}

function normalizeEventDetail(payload: unknown): Record<string, unknown> | undefined {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>
  }
  if (Array.isArray(payload)) {
    return { items: payload as unknown[] }
  }
  return undefined
}

function resolveSystemDetailRaw(detail?: Record<string, unknown>): string {
  if (!detail) {
    return ''
  }
  const raw = detail.rawModelOutput
  if (typeof raw === 'string' && raw.trim()) {
    return raw
  }
  return ''
}

function resolveSystemDetailJson(detail?: Record<string, unknown>): string {
  if (!detail) {
    return ''
  }
  const normalized = { ...detail }
  if ('rawModelOutput' in normalized) {
    delete (normalized as Record<string, unknown>).rawModelOutput
  }
  if (Object.keys(normalized).length <= 0) {
    return ''
  }
  return JSON.stringify(normalized, null, 2)
}

function createSystemMeta(
  eventItem: LabStreamEvent,
  detailOverride?: Record<string, unknown>,
): {
  eventType?: string
  phase?: string
  seq?: number
  detail?: Record<string, unknown>
} {
  return {
    eventType: eventItem.type,
    phase: typeof eventItem.phase === 'string' ? eventItem.phase : undefined,
    seq: typeof eventItem.seq === 'number' ? eventItem.seq : undefined,
    detail: detailOverride ?? normalizeEventDetail(eventItem.payload),
  }
}

function mapTrajectoryColor(eventItem: LabStreamEvent): LabTraceTrajectoryItem['color'] {
  const type = eventItem.type
  if (type === 'error')
    return 'error'
  if (type === 'session.paused' || type === 'tool.approval_required')
    return 'warning'
  if (type === 'done' || type === 'run.metrics')
    return 'success'
  if (type === 'execution.step') {
    const stepStatus = String(eventItem.payload?.result?.status || '')
    if (stepStatus === 'failed')
      return 'error'
    if (stepStatus === 'waiting_approval')
      return 'warning'
    if (stepStatus === 'completed')
      return 'success'
  }
  return 'primary'
}

function formatTrajectoryTime(timestamp: number): string {
  const timeLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(timestamp).toLocaleTimeString(timeLocale, {
    hour12: false,
  })
}

const traceTrajectory = computed<LabTraceTrajectoryItem[]>(() => {
  const uniq = new Map<number, LabStreamEvent>()
  for (const eventItem of streamEvents.value) {
    const seq = typeof eventItem.seq === 'number' ? eventItem.seq : 0
    if (seq <= 0)
      continue
    uniq.set(seq, eventItem)
  }
  const events = [...uniq.values()].sort((a, b) => (a.seq || 0) - (b.seq || 0))
  return events.map((eventItem) => {
    const seq = Number(eventItem.seq || 0)
    const phase = String(eventItem.phase || 'orchestration')
    const message = eventItem.message || String(eventItem.payload?.delta || '')
    return {
      seq,
      type: eventItem.type,
      phase,
      title: `${phase} · ${eventItem.type}`,
      message,
      color: mapTrajectoryColor(eventItem),
      time: formatTrajectoryTime(eventItem.timestamp),
      source: eventItem,
    }
  })
})

function isRiskTrajectory(item: LabTraceTrajectoryItem): boolean {
  if (item.type === 'tool.approval_required' || item.type === 'error' || item.type === 'session.paused') {
    return true
  }
  if (item.type === 'execution.step') {
    const stepStatus = String(item.source.payload?.result?.status || '')
    return stepStatus === 'failed' || stepStatus === 'waiting_approval'
  }
  return false
}

const filteredTraceTrajectory = computed<LabTraceTrajectoryItem[]>(() => {
  if (traceFilterMode.value === 'all') {
    return traceTrajectory.value
  }
  return traceTrajectory.value.filter(item => isRiskTrajectory(item))
})

const activeTraceEvent = computed<LabTraceTrajectoryItem | null>(() => {
  if (filteredTraceTrajectory.value.length <= 0)
    return null
  if (traceActiveSeq.value) {
    const matched = filteredTraceTrajectory.value.find(item => item.seq === traceActiveSeq.value)
    if (matched)
      return matched
  }
  return filteredTraceTrajectory.value[filteredTraceTrajectory.value.length - 1] || null
})

watch(filteredTraceTrajectory, (items) => {
  if (items.length <= 0) {
    traceActiveSeq.value = null
    return
  }
  if (!traceActiveSeq.value || !items.some(item => item.seq === traceActiveSeq.value)) {
    traceActiveSeq.value = items[items.length - 1]?.seq || null
  }
})

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const statusMessage = (error as { data?: { statusMessage?: string } }).data?.statusMessage
    if (statusMessage) {
      return statusMessage
    }
    const message = (error as { message?: string }).message
    if (message) {
      return message
    }
  }
  return fallback
}

function appendStreamEvent(eventItem: LabStreamEvent) {
  streamEvents.value.push(eventItem)
  if (streamEvents.value.length > 220) {
    streamEvents.value = streamEvents.value.slice(-220)
  }
}

function appendConversationItem(item: LabConversationItem) {
  conversation.value.push(item)
  if (conversation.value.length > 260) {
    conversation.value = conversation.value.slice(-260)
  }
}

function applyTemplate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''))
}

function resolveConversationText(item: LabConversationItem): string {
  if (item.i18nKey) {
    const translated = t(item.i18nKey, item.i18nParams as Record<string, any>)
    if (translated && translated !== item.i18nKey) {
      return translated
    }
    const fallback = SYSTEM_MESSAGE_FALLBACKS[item.i18nKey] || item.content
    return applyTemplate(fallback, item.i18nParams)
  }
  if (item.content.startsWith('$i18n:')) {
    const key = item.content.slice(6)
    const translated = t(key)
    if (translated && translated !== key) {
      return translated
    }
  }
  return item.content
}

function resolveStatusI18n(eventItem: LabStreamEvent): {
  key: string
  params?: Record<string, string | number>
  text: string
} | null {
  const key = typeof eventItem.payload?.i18nKey === 'string'
    ? String(eventItem.payload?.i18nKey || '').trim()
    : ''
  if (!key) {
    return null
  }
  const params = (eventItem.payload?.i18nParams || {}) as Record<string, string | number>
  return {
    key,
    params,
    text: labText(key, SYSTEM_MESSAGE_FALLBACKS[key] || key, params),
  }
}

function appendSystemLog(
  i18nKey: string,
  i18nParams?: Record<string, string | number>,
  timestamp?: number,
  meta?: {
    eventType?: string
    phase?: string
    seq?: number
    detail?: Record<string, unknown>
  },
) {
  appendConversationItem({
    id: makeId('status'),
    role: 'system',
    kind: 'status',
    content: `$i18n:${i18nKey}`,
    i18nKey,
    i18nParams,
    symbol: SYSTEM_SYMBOL,
    eventType: meta?.eventType,
    phase: meta?.phase,
    seq: meta?.seq,
    detail: meta?.detail,
    timestamp: timestamp || Date.now(),
  })
}

function appendAssistantDelta(delta: string, timestamp?: number) {
  if (!delta) {
    return
  }
  let answerItem: LabConversationItem | undefined
  if (activeAnswerId.value) {
    answerItem = conversation.value.find(item => item.id === activeAnswerId.value)
  }
  if (!answerItem) {
    answerItem = {
      id: makeId('assistant'),
      role: 'assistant',
      kind: 'answer',
      content: '',
      timestamp: timestamp || Date.now(),
    }
    activeAnswerId.value = answerItem.id
    appendConversationItem(answerItem)
  }
  answerItem.content += delta
}

function normalizeClientLocale(value: unknown): ClientLocale | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans') {
    return 'zh'
  }
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb') {
    return 'en'
  }
  return null
}

function normalizeClientThemeMode(value: unknown): ClientThemeMode | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'auto' || normalized === 'dark' || normalized === 'light') {
    return normalized
  }
  return null
}

function applyClientRuntimePreferencesFromExecutionResult(result: {
  type?: string
  status?: string
  toolId?: string
  output?: unknown
}) {
  if (result.type !== 'tool' || result.status !== 'completed') {
    return
  }
  const output = (result.output && typeof result.output === 'object')
    ? (result.output as Record<string, unknown>)
    : {}
  if (result.toolId === TOOL_NEXUS_LANGUAGE_SET) {
    const nextLocale = normalizeClientLocale(output.locale)
    if (nextLocale && locale.value !== nextLocale) {
      void setLocale(nextLocale)
    }
    return
  }
  if (result.toolId === TOOL_NEXUS_THEME_SET) {
    const nextTheme = normalizeClientThemeMode(output.preference)
    if (nextTheme) {
      toggleDark(nextTheme)
    }
  }
}

function extractHistoryMessages(): IntelligenceMessage[] {
  const history: IntelligenceMessage[] = []
  for (const item of conversation.value) {
    if (item.role === 'system') {
      continue
    }
    if (item.role === 'assistant' && item.kind && item.kind !== 'answer') {
      continue
    }
    const content = item.content.trim()
    if (!content) {
      continue
    }
    history.push({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content,
    })
  }
  return history
}

function resetRunArtifacts() {
  errorMessage.value = ''
  reflectionSummary.value = ''
  followUp.value = null
  runtimeMetrics.value = null
  pendingApprovals.value = []
  activeAnswerId.value = null
}

function normalizeStreamEvent(eventItem: unknown): LabStreamEvent | null {
  if (!eventItem || typeof eventItem !== 'object') {
    return null
  }
  const row = eventItem as Record<string, unknown>
  const type = typeof row.type === 'string' ? row.type : ''
  if (!type) {
    return null
  }
  return {
    ...row,
    type,
    timestamp: typeof row.timestamp === 'number' ? row.timestamp : Date.now(),
  } as LabStreamEvent
}

async function loadSessionHistory(targetSessionId: string) {
  if (!targetSessionId || historyLoading.value) {
    return
  }
  historyLoading.value = true
  try {
    const data = await $fetch<{ traces: unknown[] }>('/api/admin/intelligence-lab/session/trace', {
      query: {
        sessionId: targetSessionId,
        fromSeq: 1,
        limit: 400,
      },
    })
    const events = (data.traces || [])
      .map(item => normalizeStreamEvent(item))
      .filter((item): item is LabStreamEvent => Boolean(item))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0))

    conversation.value = []
    streamEvents.value = []
    pendingApprovals.value = []
    reflectionSummary.value = ''
    followUp.value = null
    runtimeMetrics.value = null
    statusMessage.value = ''
    errorMessage.value = ''
    activeAnswerId.value = null
    traceActiveSeq.value = null
    copiedTraceSeq.value = null
    expandedSystemMessageIds.value = []

    for (const eventItem of events) {
      handleStreamEvent(eventItem, { fromHistory: true })
    }
    sessionId.value = targetSessionId
    hydratedSessionId.value = targetSessionId
  }
  catch (error) {
    errorMessage.value = normalizeError(error, labText('dashboard.intelligenceLab.errors.loadHistory', 'Failed to load session history.'))
  }
  finally {
    historyLoading.value = false
  }
}

async function updateSessionQuery(nextSessionId?: string) {
  const nextQuery = {
    ...route.query,
  } as Record<string, string>
  if (nextSessionId) {
    nextQuery.sessionId = nextSessionId
  } else {
    delete nextQuery.sessionId
  }
  await navigateTo({
    path: route.path,
    query: nextQuery,
  }, { replace: true })
}

async function fetchSessionHistoryList() {
  historyListLoading.value = true
  try {
    const data = await $fetch<{ sessions: LabSessionHistoryItem[] }>('/api/admin/intelligence-lab/session/history', {
      query: { limit: 40 },
    })
    sessionHistoryList.value = data.sessions || []
  }
  catch (error) {
    errorMessage.value = normalizeError(error, labText('dashboard.intelligenceLab.errors.loadHistoryList', 'Failed to load session list.'))
  }
  finally {
    historyListLoading.value = false
  }
}

function openMetricsPanel(event?: MouseEvent) {
  metricsOverlaySource.value = (event?.currentTarget as HTMLElement) || null
  showMetricsOverlay.value = true
}

function openTracePanel(event?: MouseEvent) {
  traceOverlaySource.value = (event?.currentTarget as HTMLElement) || null
  if (filteredTraceTrajectory.value.length > 0) {
    traceActiveSeq.value = filteredTraceTrajectory.value[filteredTraceTrajectory.value.length - 1]?.seq || null
  }
  copiedTraceSeq.value = null
  showTraceOverlay.value = true
}

async function openHistoryPanel(event?: MouseEvent) {
  historyOverlaySource.value = (event?.currentTarget as HTMLElement) || null
  showHistoryOverlay.value = true
  await fetchSessionHistoryList()
}

async function selectHistorySession(item: LabSessionHistoryItem) {
  await loadSessionHistory(item.sessionId)
  await updateSessionQuery(item.sessionId)
  showHistoryOverlay.value = false
}

function selectTraceEvent(item: LabTraceTrajectoryItem) {
  traceActiveSeq.value = item.seq
  copiedTraceSeq.value = null
}

async function copyActiveTracePayload() {
  if (!activeTraceEvent.value) {
    return
  }
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    errorMessage.value = labText('dashboard.intelligenceLab.errors.copyUnsupported', 'Clipboard is not supported in this environment.')
    return
  }
  const payloadText = JSON.stringify(activeTraceEvent.value.source.payload || {}, null, 2)
  try {
    await navigator.clipboard.writeText(payloadText)
    copiedTraceSeq.value = activeTraceEvent.value.seq
    statusMessage.value = labText('dashboard.intelligenceLab.status.payloadCopied', 'Payload copied.')
    window.setTimeout(() => {
      if (copiedTraceSeq.value === activeTraceEvent.value?.seq) {
        copiedTraceSeq.value = null
      }
    }, 1500)
  }
  catch (error) {
    errorMessage.value = normalizeError(error, labText('dashboard.intelligenceLab.errors.copyPayload', 'Failed to copy payload.'))
  }
}

function handleStreamEvent(eventItem: LabStreamEvent, options?: { fromHistory?: boolean }) {
  const isHistory = options?.fromHistory === true
  appendStreamEvent(eventItem)

  if (eventItem.sessionId) {
    sessionId.value = eventItem.sessionId
    hydratedSessionId.value = eventItem.sessionId
    if (route.query.sessionId !== eventItem.sessionId) {
      void updateSessionQuery(eventItem.sessionId)
    }
  }
  if (eventItem.traceId) {
    lastTraceId.value = eventItem.traceId
  }

  switch (eventItem.type) {
    case 'session.paused': {
      running.value = false
      activeAnswerId.value = null
      const pauseReason = String(eventItem.payload?.pauseReason || 'client_disconnect')
      const pauseKey = typeof eventItem.payload?.i18nKey === 'string' && eventItem.payload?.i18nKey
        ? String(eventItem.payload?.i18nKey)
        : pauseReason === 'client_disconnect' || pauseReason === 'heartbeat_timeout'
          ? 'dashboard.intelligenceLab.system.pausedNetwork'
          : 'dashboard.intelligenceLab.system.pausedManual'
      statusMessage.value = labText(pauseKey, SYSTEM_MESSAGE_FALLBACKS[pauseKey] || 'Paused.')
      appendSystemLog(
        pauseKey,
        undefined,
        eventItem.timestamp,
        createSystemMeta(eventItem),
      )
      break
    }
    case 'status': {
      const statusI18n = resolveStatusI18n(eventItem)
      if (statusI18n) {
        statusMessage.value = statusI18n.text
        appendSystemLog(statusI18n.key, statusI18n.params, eventItem.timestamp, createSystemMeta(eventItem))
      } else {
        statusMessage.value = eventItem.message || ''
        appendSystemLog('dashboard.intelligenceLab.system.statusRaw', {
          message: statusMessage.value || '-',
        }, eventItem.timestamp, createSystemMeta(eventItem))
      }
      break
    }
    case 'plan.created': {
      const totalActions = Number(eventItem.payload?.actions?.length || 0)
      statusMessage.value = labText(
        'dashboard.intelligenceLab.status.planReady',
        'Plan ready ({total} actions).',
        { total: totalActions },
      )
      appendSystemLog('dashboard.intelligenceLab.system.planCreated', {
        total: totalActions,
      }, eventItem.timestamp, createSystemMeta(eventItem))
      break
    }
    case 'execution.step': {
      statusMessage.value = labText(
        'dashboard.intelligenceLab.status.executing',
        'Executing {index}/{total}',
        {
          index: Number(eventItem.payload?.index || 0),
          total: Number(eventItem.payload?.total || 0),
        },
      )
      const result = eventItem.payload?.result as { title?: string, status?: string, error?: string } | undefined
      const title = result?.title || 'unnamed action'
      const stepStatus = result?.status || 'unknown'
      const key = stepStatus === 'failed' && result?.error
        ? 'dashboard.intelligenceLab.system.executionStepFailed'
        : 'dashboard.intelligenceLab.system.executionStep'
      appendSystemLog(key, {
        index: Number(eventItem.payload?.index || 0),
        total: Number(eventItem.payload?.total || 0),
        title,
        stepStatus,
        error: result?.error || '-',
      }, eventItem.timestamp, createSystemMeta(eventItem))
      if (result) {
        applyClientRuntimePreferencesFromExecutionResult(result as {
          type?: string
          status?: string
          toolId?: string
          output?: unknown
        })
      }
      break
    }
    case 'tool.approval_required': {
      const ticket = eventItem.payload?.ticket as TuffIntelligenceApprovalTicket | undefined
      if (ticket && !pendingApprovals.value.some(item => item.id === ticket.id)) {
        pendingApprovals.value.push(ticket)
      }
      appendSystemLog('dashboard.intelligenceLab.system.approvalRequired', {
        toolId: ticket?.toolId || 'unknown',
        riskLevel: ticket?.riskLevel || 'unknown',
      }, eventItem.timestamp, createSystemMeta(eventItem))
      break
    }
    case 'reflection.completed':
      reflectionSummary.value = String(eventItem.payload?.summary || '')
      appendSystemLog('dashboard.intelligenceLab.system.reflectionCompleted', undefined, eventItem.timestamp, createSystemMeta(eventItem))
      break
    case 'followup.created':
      followUp.value = {
        summary: String(eventItem.payload?.summary || ''),
        nextActions: Array.isArray(eventItem.payload?.nextActions)
          ? eventItem.payload.nextActions.map((item: unknown) => String(item || '')).filter(Boolean)
          : [],
        revisitInHours: Number(eventItem.payload?.revisitInHours || 24),
      }
      appendSystemLog('dashboard.intelligenceLab.system.followupCreated', undefined, eventItem.timestamp, createSystemMeta(eventItem))
      break
    case 'run.metrics': {
      runtimeMetrics.value = eventItem.payload as unknown as LabRuntimeMetrics
      appendSystemLog('dashboard.intelligenceLab.system.metrics', {
        status: runtimeMetrics.value.status,
        completed: runtimeMetrics.value.completedActions,
        total: runtimeMetrics.value.totalActions,
        durationMs: runtimeMetrics.value.durationMs,
      }, eventItem.timestamp, createSystemMeta(eventItem))
      break
    }
    case 'assistant.delta':
      appendAssistantDelta(String(eventItem.payload?.delta || ''), eventItem.timestamp)
      break
    case 'error':
      {
        const errorI18n = resolveStatusI18n(eventItem)
        errorMessage.value = errorI18n?.text || eventItem.message || labText('dashboard.intelligenceLab.errors.streamFailed', 'Stream failed.')
        activeAnswerId.value = null
        if (errorI18n) {
          appendSystemLog(errorI18n.key, errorI18n.params, eventItem.timestamp, createSystemMeta(eventItem))
        } else {
          appendSystemLog('dashboard.intelligenceLab.system.error', {
            message: errorMessage.value,
          }, eventItem.timestamp, createSystemMeta(eventItem))
        }
      }
      break
    case 'done':
      running.value = false
      activeAnswerId.value = null
      break
    default:
      if (!isHistory) {
        appendSystemLog('dashboard.intelligenceLab.system.event', {
          eventType: eventItem.type,
        }, eventItem.timestamp, createSystemMeta(eventItem))
      }
      break
  }
}

async function consumeSseResponse(response: Response) {
  if (!response.body) {
    throw new Error('Empty stream response body.')
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
      const lines = chunk
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue
        }
        const jsonText = line.slice(5).trim()
        if (!jsonText) {
          continue
        }
        try {
          const streamEvent = JSON.parse(jsonText) as LabStreamEvent
          handleStreamEvent(streamEvent)
        }
        catch {
          // Ignore malformed stream chunks
        }
      }
    }
  }
}

async function sendMessage() {
  const message = draftMessage.value.trim()
  if (!message || running.value) {
    return
  }

  resetRunArtifacts()
  statusMessage.value = labText('dashboard.intelligenceLab.status.connecting', 'Connecting stream...')
  running.value = true

  appendConversationItem({
    id: makeId('user'),
    role: 'user',
    content: message,
    timestamp: Date.now(),
  })
  draftMessage.value = ''
  streamAbortController?.abort()
  streamAbortController = new AbortController()

  try {
    const response = await fetch('/api/admin/intelligence-lab/session/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message,
        sessionId: sessionId.value || undefined,
        history: extractHistoryMessages(),
      }),
      signal: streamAbortController.signal,
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    await consumeSseResponse(response)
  }
  catch (error) {
    errorMessage.value = normalizeError(error, labText('dashboard.intelligenceLab.errors.sendFailed', 'Failed to send message.'))
  }
  finally {
    running.value = false
  }
}

async function applyQuickPrompt(text: string) {
  if (running.value || historyLoading.value) {
    return
  }
  draftMessage.value = text
  await sendMessage()
}

async function handleApproval(ticket: TuffIntelligenceApprovalTicket, approved: boolean) {
  approving.value = true
  errorMessage.value = ''
  try {
    const response = await $fetch<{
      ticket: TuffIntelligenceApprovalTicket
      result?: { output?: unknown }
    }>('/api/admin/intelligence-lab/tool/approve', {
      method: 'POST',
      body: {
        ticket,
        approved,
      },
    })

    pendingApprovals.value = pendingApprovals.value.filter(item => item.id !== ticket.id)
    appendSystemLog(
      approved
        ? 'dashboard.intelligenceLab.system.approvalApproved'
        : 'dashboard.intelligenceLab.system.approvalRejected',
      { toolId: ticket.toolId },
      Date.now(),
      {
        eventType: approved ? 'tool.approval.approved' : 'tool.approval.rejected',
        phase: 'approval',
        detail: {
          ticketId: ticket.id,
          toolId: ticket.toolId,
          riskLevel: ticket.riskLevel,
          approved,
        },
      },
    )
    if (approved && response.result?.output) {
      appendConversationItem({
        id: makeId('assistant'),
        role: 'assistant',
        kind: 'answer',
        content: JSON.stringify(response.result.output, null, 2),
        timestamp: Date.now(),
      })
    }
  }
  catch (error) {
    errorMessage.value = normalizeError(error, labText('dashboard.intelligenceLab.errors.approvalFailed', 'Approval failed.'))
  }
  finally {
    approving.value = false
  }
}

async function clearAll() {
  streamAbortController?.abort()
  running.value = false
  approving.value = false
  statusMessage.value = ''
  errorMessage.value = ''
  sessionId.value = ''
  lastTraceId.value = ''
  reflectionSummary.value = ''
  followUp.value = null
  runtimeMetrics.value = null
  pendingApprovals.value = []
  streamEvents.value = []
  conversation.value = []
  activeAnswerId.value = null
  hydratedSessionId.value = ''
  traceActiveSeq.value = null
  copiedTraceSeq.value = null
  expandedSystemMessageIds.value = []
  const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  sessionId.value = newSessionId
  await updateSessionQuery(newSessionId)
}

onMounted(() => {
  const sessionFromQuery = typeof route.query.sessionId === 'string' ? route.query.sessionId.trim() : ''
  if (sessionFromQuery) {
    void loadSessionHistory(sessionFromQuery)
  }
})

onBeforeUnmount(() => {
})
</script>

<template>
  <section class="ti-lab mx-auto w-full max-w-6xl space-y-6">
    <header class="space-y-2">
      <h1 class="apple-heading-md">
        {{ labText('dashboard.intelligenceLab.title', 'TuffIntelligence Lab') }}
      </h1>
      <p class="ti-lab__subtitle text-sm">
        {{ labText('dashboard.intelligenceLab.subtitle', 'Admin-only workspace: one message triggers full orchestration with streaming trajectory.') }}
      </p>
    </header>

    <div v-if="!isAdmin" class="ti-lab__alert rounded-2xl px-4 py-3 text-sm">
      {{ labText('dashboard.intelligenceLab.adminOnly', 'This page is restricted to administrators.') }}
    </div>

    <template v-else>
      <div class="grid gap-6">
        <TxBaseSurface mode="mask" :opacity="0.72" class="ti-lab__surface">
          <header class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="apple-heading-sm">
                {{ labText('dashboard.intelligenceLab.conversationTitle', 'Conversation') }}
              </h2>
              <p class="ti-lab__muted text-xs">
                session={{ sessionId || '-' }} · trace={{ lastTraceId || '-' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <TxButton variant="ghost" size="small" :disabled="running" @click="openMetricsPanel">
                ⌁
              </TxButton>
              <TxButton variant="ghost" size="small" :disabled="running" @click="openTracePanel">
                ◎
              </TxButton>
              <TxButton variant="ghost" size="small" :disabled="running" @click="openHistoryPanel">
                ⌘
              </TxButton>
              <TxButton variant="ghost" size="small" :disabled="running" @click="() => void clearAll()">
                {{ labText('dashboard.intelligenceLab.reset', 'Reset') }}
              </TxButton>
            </div>
          </header>

          <div class="ti-lab__chat-scroll mb-4 space-y-3 overflow-auto rounded-2xl p-3">
            <div v-if="historyLoading" class="space-y-3">
              <TxSkeleton :loading="true" :lines="1" width="58%" :height="14" />
              <TxSkeleton :loading="true" :lines="1" width="82%" :height="14" />
              <TxSkeleton :loading="true" :lines="1" width="66%" :height="14" />
            </div>
            <div v-else-if="conversation.length <= 0" class="ti-lab__muted text-sm">
              {{ labText('dashboard.intelligenceLab.empty', 'Send one message and TuffIntelligence will plan and execute automatically.') }}
            </div>
            <article
              v-for="item in conversation"
              :key="item.id"
              class="ti-lab__chat-item"
            >
              <template v-if="item.role === 'system'">
                <button
                  type="button"
                  class="ti-lab__system-line-toggle"
                  @click="toggleSystemDetail(item.id)"
                >
                  <TxGlowText
                    tag="span"
                    mode="text-clip"
                    :active="isSystemMessageGlowing(item)"
                    :repeat="isSystemMessageGlowing(item)"
                    :duration-ms="1400"
                    :band-size="34"
                    :opacity="0.55"
                    class="ti-lab__system-line-text"
                    :title="resolveConversationText(item)"
                  >
                    <span class="ti-lab__system-symbol">{{ item.symbol || SYSTEM_SYMBOL }}</span>
                    <span class="ti-lab__system-line-content">{{ resolveConversationText(item) }}</span>
                  </TxGlowText>
                  <span
                    class="ti-lab__system-expand-icon"
                    :class="{ 'ti-lab__system-expand-icon--visible': isSystemDetailExpanded(item.id) }"
                  >{{ isSystemDetailExpanded(item.id) ? '▾' : '▸' }}</span>
                </button>
                <div v-if="isSystemDetailExpanded(item.id)" class="ti-lab__system-detail">
                  <p class="ti-lab__system-detail-summary">
                    {{ resolveConversationText(item) }}
                  </p>
                  <p class="ti-lab__system-detail-meta">
                    event={{ item.eventType || '-' }} · phase={{ item.phase || '-' }} · seq={{ item.seq ?? '-' }}
                  </p>
                  <pre v-if="resolveSystemDetailRaw(item.detail)" class="ti-lab__system-detail-raw">{{ resolveSystemDetailRaw(item.detail) }}</pre>
                  <pre v-if="resolveSystemDetailJson(item.detail)" class="ti-lab__system-detail-json">{{ resolveSystemDetailJson(item.detail) }}</pre>
                </div>
              </template>
              <template v-else-if="item.role === 'assistant'">
                <TxCard background="mask" shadow="soft" size="small" class="ti-lab__assistant-card">
                  <p class="ti-lab__bubble-role mb-1 text-[11px] uppercase tracking-wide">
                    {{ item.role }}
                  </p>
                  <p class="whitespace-pre-wrap break-words">
                    {{ resolveConversationText(item) }}
                  </p>
                </TxCard>
              </template>
              <template v-else>
                <div class="ti-lab__bubble ti-lab__bubble--user ml-auto max-w-[92%] rounded-2xl px-3 py-2 text-sm">
                  <p class="ti-lab__bubble-role mb-1 text-[11px] uppercase tracking-wide">
                    {{ item.role }}
                  </p>
                  <p class="whitespace-pre-wrap break-words">
                    {{ resolveConversationText(item) }}
                  </p>
                </div>
              </template>
            </article>
          </div>

          <div class="ti-lab__quick-prompts flex flex-wrap gap-2">
            <TxButton
              v-for="item in QUICK_PROMPTS"
              :key="item.id"
              size="small"
              variant="secondary"
              :disabled="running || historyLoading"
              @click="() => applyQuickPrompt(item.text)"
            >
              {{ item.text }}
            </TxButton>
          </div>

          <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
            <TuffInput
              v-model="draftMessage"
              type="text"
              :disabled="running || historyLoading"
              :placeholder="labText('dashboard.intelligenceLab.inputPlaceholder', 'Example: review this week release risks and produce follow-up actions')"
              @keyup.enter="() => sendMessage()"
            />
            <TxButton variant="primary" :disabled="!canSend" @click="() => sendMessage()">
              <span class="inline-flex items-center gap-2">
                <TxSpinner v-if="running" :size="14" />
                {{ running ? labText('dashboard.intelligenceLab.running', 'Running') : labText('dashboard.intelligenceLab.send', 'Send') }}
              </span>
            </TxButton>
          </div>

          <p v-if="statusMessage" class="ti-lab__status mt-3 text-xs">
            {{ statusMessage }}
          </p>
          <p v-if="errorMessage" class="ti-lab__error mt-2 text-xs">
            {{ errorMessage }}
          </p>
        </TxBaseSurface>
      </div>

      <Teleport to="body">
        <TxFlipOverlay
          v-model="showMetricsOverlay"
          :source="metricsOverlaySource"
          :duration="420"
          :rotate-x="5"
          :rotate-y="8"
          transition-name="IntelligenceMetrics-Mask"
          mask-class="IntelligenceMetrics-Mask"
          card-class="IntelligenceMetrics-Card"
        >
          <template #default="{ close }">
            <div class="ti-lab__overlay space-y-4">
              <header class="flex items-center justify-between">
                <h3 class="text-base font-semibold">
                  {{ t('dashboard.intelligenceLab.metrics.title') }}
                </h3>
                <TxButton variant="secondary" size="small" @click="close">
                  {{ t('dashboard.intelligenceLab.common.close') }}
                </TxButton>
              </header>

              <TxCollapse v-model="insightExpanded">
                <TxCollapseItem name="runtime">
                  <template #title>
                    <div class="ti-lab__collapse-title">
                      <span>{{ t('dashboard.intelligenceLab.metrics.runtimeMetrics') }}</span>
                      <span class="ti-lab__collapse-hint">{{ runtimeDigest }}</span>
                    </div>
                  </template>
                  <div v-if="!runtimeMetrics" class="ti-lab__muted text-xs">
                    {{ t('dashboard.intelligenceLab.noMetrics') }}
                  </div>
                  <div v-else class="grid grid-cols-2 gap-2 text-xs">
                    <p>status: <strong>{{ runtimeMetrics.status }}</strong></p>
                    <p>duration: <strong>{{ runtimeMetrics.durationMs }}ms</strong></p>
                    <p>actions: <strong>{{ runtimeMetrics.completedActions }}/{{ runtimeMetrics.totalActions }}</strong></p>
                    <p>failed: <strong>{{ runtimeMetrics.failedActions }}</strong></p>
                    <p>fallback: <strong>{{ runtimeMetrics.fallbackCount }}</strong></p>
                    <p>retry: <strong>{{ runtimeMetrics.retryCount }}</strong></p>
                  </div>
                </TxCollapseItem>

                <TxCollapseItem name="reflection">
                  <template #title>
                    <div class="ti-lab__collapse-title">
                      <span>{{ t('dashboard.intelligenceLab.metrics.reflection') }}</span>
                      <span class="ti-lab__collapse-hint">{{ reflectionDigest }}</span>
                    </div>
                  </template>
                  <p v-if="!reflectionSummary" class="ti-lab__muted text-xs">
                    {{ t('dashboard.intelligenceLab.noReflection') }}
                  </p>
                  <p v-else class="whitespace-pre-wrap text-xs">
                    {{ reflectionSummary }}
                  </p>
                </TxCollapseItem>

                <TxCollapseItem name="followup">
                  <template #title>
                    <div class="ti-lab__collapse-title">
                      <span>{{ t('dashboard.intelligenceLab.metrics.followUp') }}</span>
                      <span class="ti-lab__collapse-hint">{{ followUpDigest }}</span>
                    </div>
                  </template>
                  <div v-if="!followUp" class="ti-lab__muted text-xs">
                    {{ t('dashboard.intelligenceLab.noFollowUp') }}
                  </div>
                  <div v-else class="space-y-2 text-xs">
                    <p>{{ followUp.summary }}</p>
                    <ul class="list-disc space-y-1 pl-4">
                      <li v-for="item in followUp.nextActions" :key="item">
                        {{ item }}
                      </li>
                    </ul>
                    <p class="ti-lab__muted">
                      {{ t('dashboard.intelligenceLab.metrics.revisitIn', { hours: followUp.revisitInHours }) }}
                    </p>
                  </div>
                </TxCollapseItem>

                <TxCollapseItem name="timeline">
                  <template #title>
                    <div class="ti-lab__collapse-title">
                      <span>{{ t('dashboard.intelligenceLab.metrics.streamTimeline') }}</span>
                      <span class="ti-lab__collapse-hint">{{ timelineDigest }}</span>
                    </div>
                  </template>
                  <div v-if="streamEvents.length <= 0" class="ti-lab__muted text-xs">
                    {{ t('dashboard.intelligenceLab.noEvents') }}
                  </div>
                  <ul v-else class="max-h-[220px] space-y-2 overflow-auto text-xs">
                    <li v-for="(eventItem, index) in streamEvents.slice(-80)" :key="`${eventItem.type}-${eventItem.timestamp}-${index}`" class="ti-lab__timeline-item rounded-xl px-3 py-2">
                      <p class="font-medium">
                        {{ eventItem.type }}
                      </p>
                      <p v-if="eventItem.message" class="ti-lab__muted mt-1">
                        {{ eventItem.message }}
                      </p>
                    </li>
                  </ul>
                </TxCollapseItem>

                <TxCollapseItem name="approval">
                  <template #title>
                    <div class="ti-lab__collapse-title">
                      <span>{{ t('dashboard.intelligenceLab.pendingApprovals') }}</span>
                      <span class="ti-lab__collapse-hint">{{ t('dashboard.intelligenceLab.metrics.pendingCount', { count: pendingApprovals.length }) }}</span>
                    </div>
                  </template>
                  <div v-if="pendingApprovals.length <= 0" class="ti-lab__muted text-xs">
                    {{ t('dashboard.intelligenceLab.metrics.noPendingApprovals') }}
                  </div>
                  <ul v-else class="space-y-2">
                    <li v-for="ticket in pendingApprovals" :key="ticket.id" class="ti-lab__approval-item rounded-xl px-3 py-2">
                      <p class="text-xs">
                        {{ ticket.toolId }} · risk={{ ticket.riskLevel }}
                      </p>
                      <p class="ti-lab__muted text-xs">
                        {{ ticket.reason }}
                      </p>
                      <div class="mt-2 flex items-center gap-2">
                        <TxButton size="small" variant="primary" :disabled="approving" @click="handleApproval(ticket, true)">
                          {{ t('dashboard.intelligenceLab.metrics.approve') }}
                        </TxButton>
                        <TxButton size="small" variant="danger" :disabled="approving" @click="handleApproval(ticket, false)">
                          {{ t('dashboard.intelligenceLab.metrics.reject') }}
                        </TxButton>
                      </div>
                    </li>
                  </ul>
                </TxCollapseItem>
              </TxCollapse>
            </div>
          </template>
        </TxFlipOverlay>
      </Teleport>

      <Teleport to="body">
        <TxFlipOverlay
          v-model="showTraceOverlay"
          :source="traceOverlaySource"
          :duration="420"
          :rotate-x="5"
          :rotate-y="8"
          transition-name="IntelligenceTrace-Mask"
          mask-class="IntelligenceTrace-Mask"
          card-class="IntelligenceTrace-Card"
        >
          <template #default="{ close }">
            <div class="ti-lab__overlay space-y-4">
              <header class="flex items-center justify-between gap-3">
                <h3 class="text-base font-semibold">
                  {{ t('dashboard.intelligenceLab.trace.title') }}
                </h3>
                <div class="flex items-center gap-2">
                  <div class="ti-lab__trace-filter">
                    <TxButton
                      size="small"
                      :variant="traceFilterMode === 'all' ? 'primary' : 'ghost'"
                      @click="traceFilterMode = 'all'"
                    >
                      {{ t('dashboard.intelligenceLab.trace.filterAll') }}
                    </TxButton>
                    <TxButton
                      size="small"
                      :variant="traceFilterMode === 'risk' ? 'primary' : 'ghost'"
                      @click="traceFilterMode = 'risk'"
                    >
                      {{ t('dashboard.intelligenceLab.trace.filterRisk') }}
                    </TxButton>
                  </div>
                  <TxButton variant="secondary" size="small" @click="close">
                    {{ t('dashboard.intelligenceLab.common.close') }}
                  </TxButton>
                </div>
              </header>

              <div v-if="traceTrajectory.length <= 0" class="ti-lab__muted text-xs">
                {{ t('dashboard.intelligenceLab.trace.empty') }}
              </div>
              <div v-else-if="filteredTraceTrajectory.length <= 0" class="ti-lab__muted text-xs">
                {{ t('dashboard.intelligenceLab.trace.emptyFiltered') }}
              </div>
              <div v-else class="ti-lab__trace-layout">
                <div class="ti-lab__trace-list">
                  <TxTimeline>
                    <div
                      v-for="item in filteredTraceTrajectory"
                      :key="item.seq"
                      class="ti-lab__trace-node"
                    >
                      <button
                        class="ti-lab__trace-node-button"
                        type="button"
                        @click="selectTraceEvent(item)"
                      >
                        <TxTimelineItem
                          :title="item.title"
                          :time="`#${item.seq} · ${item.time}`"
                          :color="item.color"
                          :active="activeTraceEvent?.seq === item.seq"
                        >
                          <div class="text-xs">
                            {{ item.message || '-' }}
                          </div>
                        </TxTimelineItem>
                      </button>
                    </div>
                  </TxTimeline>
                </div>

                <aside class="ti-lab__trace-detail">
                  <h4 class="text-sm font-semibold">
                    {{ t('dashboard.intelligenceLab.trace.eventDetail') }}
                  </h4>
                  <div v-if="!activeTraceEvent" class="ti-lab__muted text-xs">
                    {{ t('dashboard.intelligenceLab.trace.selectHint') }}
                  </div>
                  <div v-else class="space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-xs">
                        seq=<strong>{{ activeTraceEvent.seq }}</strong> · phase=<strong>{{ activeTraceEvent.phase }}</strong>
                      </p>
                      <TxButton size="small" variant="ghost" @click="() => void copyActiveTracePayload()">
                        {{ copiedTraceSeq === activeTraceEvent?.seq ? t('dashboard.intelligenceLab.trace.copied') : t('dashboard.intelligenceLab.trace.copyPayload') }}
                      </TxButton>
                    </div>
                    <p class="text-xs">
                      type=<strong>{{ activeTraceEvent.type }}</strong> · time=<strong>{{ activeTraceEvent.time }}</strong>
                    </p>
                    <pre class="ti-lab__trace-json">{{ JSON.stringify(activeTraceEvent.source.payload || {}, null, 2) }}</pre>
                  </div>
                </aside>
              </div>
            </div>
          </template>
        </TxFlipOverlay>
      </Teleport>

      <Teleport to="body">
        <TxFlipOverlay
          v-model="showHistoryOverlay"
          :source="historyOverlaySource"
          :duration="420"
          :rotate-x="5"
          :rotate-y="8"
          transition-name="IntelligenceHistory-Mask"
          mask-class="IntelligenceHistory-Mask"
          card-class="IntelligenceHistory-Card"
        >
          <template #default="{ close }">
            <div class="ti-lab__overlay space-y-4">
              <header class="flex items-center justify-between">
                <h3 class="text-base font-semibold">
                  {{ t('dashboard.intelligenceLab.history.title') }}
                </h3>
                <TxButton variant="secondary" size="small" @click="close">
                  {{ t('dashboard.intelligenceLab.common.close') }}
                </TxButton>
              </header>

              <div v-if="historyListLoading" class="space-y-2">
                <TxSkeleton :loading="true" :lines="1" width="72%" :height="12" />
                <TxSkeleton :loading="true" :lines="1" width="92%" :height="12" />
                <TxSkeleton :loading="true" :lines="1" width="68%" :height="12" />
              </div>
              <div v-else-if="sessionHistoryList.length <= 0" class="ti-lab__muted text-xs">
                {{ t('dashboard.intelligenceLab.history.empty') }}
              </div>
              <ul v-else class="max-h-[420px] space-y-2 overflow-auto">
                <li
                  v-for="item in sessionHistoryList"
                  :key="item.sessionId"
                  class="ti-lab__history-item rounded-xl px-3 py-3"
                >
                  <button
                    class="w-full text-left"
                    type="button"
                    @click="() => void selectHistorySession(item)"
                  >
                    <p class="text-xs font-medium">
                      {{ item.objective || item.sessionId }}
                    </p>
                    <p class="ti-lab__muted mt-1 text-[11px]">
                      {{ t('dashboard.intelligenceLab.history.meta', { status: item.status, updatedAt: item.updatedAt }) }}
                    </p>
                    <p class="ti-lab__muted text-[11px]">
                      {{ t('dashboard.intelligenceLab.history.counts', { pending: item.pendingActions, completed: item.completedActions, failed: item.failedActions }) }}
                    </p>
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </TxFlipOverlay>
      </Teleport>
    </template>
  </section>
</template>

<style scoped>
.ti-lab {
  color: var(--tx-text-color-primary);
}

.ti-lab__subtitle,
.ti-lab__muted {
  color: color-mix(in srgb, var(--tx-text-color-secondary) 88%, transparent);
}

.ti-lab__surface {
  padding: 20px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 74%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 58%, transparent);
}

.ti-lab__quick-prompts {
  margin-top: 4px;
}

.ti-lab__chat-scroll {
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
}

.ti-lab__bubble {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter) 72%, transparent);
}

.ti-lab__bubble--user {
  background: color-mix(in srgb, var(--tx-color-primary) 16%, transparent);
}

.ti-lab__bubble--assistant {
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 88%, transparent);
  border-color: color-mix(in srgb, var(--tx-color-primary) 28%, transparent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
}

.ti-lab__assistant-card {
  max-width: 92%;
  margin-right: auto;
}

.ti-lab__system-line {
  padding: 2px 0;
}

.ti-lab__system-line-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.ti-lab__system-line-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: color-mix(in srgb, var(--tx-text-color-secondary) 88%, transparent);
}

.ti-lab__system-line-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.ti-lab__system-expand-icon {
  display: inline-flex;
  margin-left: 2px;
  opacity: 0;
  transition: opacity 0.18s ease;
  color: color-mix(in srgb, var(--tx-text-color-secondary) 78%, transparent);
  font-size: 11px;
}

.ti-lab__system-line-toggle:hover .ti-lab__system-expand-icon,
.ti-lab__system-line-toggle:focus-visible .ti-lab__system-expand-icon {
  opacity: 1;
}

.ti-lab__system-expand-icon--visible {
  opacity: 1;
}

.ti-lab__system-symbol {
  display: inline-flex;
  font-weight: 700;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--tx-color-info) 76%, var(--tx-text-color-primary));
}

.ti-lab__system-detail {
  margin-top: 6px;
  margin-left: 14px;
  padding-left: 2px;
  padding-top: 6px;
  padding-bottom: 2px;
}

.ti-lab__system-detail-summary {
  font-size: 12px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--tx-text-color-primary) 90%, transparent);
  white-space: pre-wrap;
  word-break: break-word;
}

.ti-lab__system-detail-meta {
  margin-top: 4px;
  font-size: 11px;
  color: color-mix(in srgb, var(--tx-text-color-secondary) 82%, transparent);
}

.ti-lab__system-detail-json {
  margin-top: 6px;
  max-height: 220px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.35;
  padding: 0;
  border: none;
  background: transparent;
}

.ti-lab__system-detail-raw {
  margin-top: 6px;
  max-height: 220px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.35;
  padding: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 70%, transparent);
  color: color-mix(in srgb, var(--tx-text-color-primary) 92%, transparent);
}

.ti-lab__bubble-role {
  color: color-mix(in srgb, var(--tx-text-color-secondary) 85%, transparent);
}

.ti-lab__status {
  color: color-mix(in srgb, var(--tx-text-color-secondary) 88%, transparent);
}

.ti-lab__error {
  color: var(--tx-color-danger);
}

.ti-lab__panel-stack {
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 74%, transparent);
  overflow: hidden;
}

.ti-lab__panel-stack :deep(.tx-collapse-item__header) {
  background: transparent;
}

.ti-lab__panel-stack :deep(.tx-collapse-item__header--active) {
  background: color-mix(in srgb, var(--tx-color-primary) 8%, transparent);
}

.ti-lab__panel-stack :deep(.tx-collapse-item__content-inner) {
  padding-top: 12px;
}

.ti-lab__collapse-title {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ti-lab__collapse-hint {
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-text-color-secondary) 84%, transparent);
}

.ti-lab__overlay {
  width: min(840px, 92vw);
  max-height: 88vh;
  overflow: auto;
  padding: 18px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 76%, transparent);
}

.ti-lab__history-item {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 72%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 66%, transparent);
}

.ti-lab__trace-layout {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr);
}

.ti-lab__trace-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 76%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 62%, transparent);
}

@media (min-width: 980px) {
  .ti-lab__trace-layout {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
  }
}

.ti-lab__trace-list {
  max-height: 70vh;
  overflow: auto;
  padding-right: 6px;
}

.ti-lab__trace-node {
  border-radius: 12px;
  transition: background-color 0.2s ease;
}

.ti-lab__trace-node:hover {
  background: color-mix(in srgb, var(--tx-color-primary) 6%, transparent);
}

.ti-lab__trace-node-button {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ti-lab__trace-detail {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 70%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 64%, transparent);
  padding: 12px;
}

.ti-lab__trace-json {
  max-height: 56vh;
  overflow: auto;
  font-size: 11px;
  line-height: 1.4;
  border-radius: 10px;
  padding: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 65%, transparent);
}

.ti-lab__panel {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 74%, transparent);
}

.ti-lab__approval-panel {
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 45%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning) 12%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning) 86%, var(--tx-text-color-primary));
}

.ti-lab__approval-item {
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 32%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 80%, transparent);
}

.ti-lab__timeline-item {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 66%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 80%, transparent);
}

.ti-lab__alert {
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 48%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning) 12%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning) 90%, var(--tx-text-color-primary));
}
</style>
