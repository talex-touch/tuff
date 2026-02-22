import type {
  IntelligenceMessage,
  TuffIntelligenceApprovalTicket,
} from '@talex-touch/utils'
import type { H3Event } from 'h3'
import { IntelligenceProviderType } from '@talex-touch/utils'
import { getCookie, setCookie } from 'h3'
import { getUserById, updateUserProfile } from './authStore'
import { getCreditSummary } from './creditsStore'
import { buildOpenAiCompatBaseUrls, resolveProviderBaseUrl } from './intelligenceModels'
import {
  createAudit,
  getProviderApiKey,
  getSettings,
  listProviders,
  type IntelligenceProviderRecord,
} from './intelligenceStore'
import {
  appendRuntimeTraceEvent,
  getLatestRuntimeCheckpoint,
  getRuntimeSession,
  listRuntimeSessions,
  markRuntimeSessionPaused,
  saveRuntimeCheckpoint,
  shouldPauseByHeartbeat,
  touchRuntimeSessionHeartbeat,
  upsertRuntimeSession,
  type RuntimeSessionState,
  type RuntimeSessionRecord,
  type TuffIntelligencePauseReason,
  type TuffIntelligenceRuntimeStatus,
} from './tuffIntelligenceRuntimeStore'
import { getPlanFeatures, getUserSubscription } from './subscriptionStore'
import { resolveActiveTeamContext } from './teamContext'

export type IntelligenceLabActionType = 'tool' | 'agent' | 'capability'

export interface IntelligenceLabAction {
  id: string
  title: string
  type: IntelligenceLabActionType
  toolId?: string
  agentId?: string
  capabilityId?: string
  input?: Record<string, unknown>
  riskLevel?: TuffIntelligenceApprovalTicket['riskLevel']
}

export interface IntelligenceLabExecutionResult {
  actionId: string
  title: string
  type: IntelligenceLabActionType
  toolId?: string
  status: 'completed' | 'failed' | 'waiting_approval'
  output?: unknown
  error?: string
  approvalTicket?: TuffIntelligenceApprovalTicket
}

interface ResolvedProviderContext {
  provider: IntelligenceProviderRecord
  model: string
  apiKey: string | null
  timeoutMs: number
}

interface InvokeModelResult {
  content: string
  model: string
  traceId: string
  endpoint: string
  status?: number
  latency: number
}

interface InvokeModelOptions {
  providerId?: string
  model?: string
  timeoutMs?: number
  source?: string
  stage?: string
  sessionId?: string
}

interface InvokeModelAttemptError {
  providerId: string
  providerName: string
  message: string
}

type ProviderRequestError = Error & {
  endpoint?: string
  status?: number
  responseSnippet?: string
}

interface InvokeModelWithFallbackResult {
  result: InvokeModelResult
  context: ResolvedProviderContext
  fallbackCount: number
  retryCount: number
  attemptedProviders: string[]
  errors: InvokeModelAttemptError[]
}

export interface IntelligenceLabFollowUpPlan {
  summary: string
  nextActions: string[]
  revisitInHours: number
}

export interface IntelligenceLabRuntimeMetrics {
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

export interface IntelligenceLabStreamEvent {
  contractVersion?: 2
  engine?: 'intelligence'
  runId?: string
  seq?: number
  phase?: string
  type:
    | 'session.started'
    | 'session.paused'
    | 'status'
    | 'plan.created'
    | 'execution.step'
    | 'tool.approval_required'
    | 'reflection.completed'
    | 'followup.created'
    | 'assistant.delta'
    | 'run.metrics'
    | 'error'
    | 'done'
  sessionId?: string
  timestamp: number
  message?: string
  traceId?: string
  payload?: Record<string, unknown>
}

interface RuntimeCheckpointState extends RuntimeSessionState {
  objective: string
  history: IntelligenceMessage[]
  actions: IntelligenceLabAction[]
  results: IntelligenceLabExecutionResult[]
  reflection?: string
  followUp?: IntelligenceLabFollowUpPlan
  providerId?: string
  providerName?: string
  model?: string
  traceId?: string
  startedAt: number
}

interface IntelligenceIntentAnalysis {
  lines: string[]
}

interface IntelligenceActionNarrative {
  actionId: string
  narrative: string
}

export interface IntelligenceLabSessionHistoryItem {
  sessionId: string
  status: RuntimeSessionRecord['status']
  pauseReason: TuffIntelligencePauseReason | null
  objective: string
  updatedAt: string
  lastEventSeq: number
  pendingActions: number
  completedActions: number
  failedActions: number
  waitingApprovals: number
}

export interface IntelligenceLabOrchestrationResult {
  sessionId: string
  objective: string
  actions: IntelligenceLabAction[]
  results: IntelligenceLabExecutionResult[]
  reflection: string
  followUp: IntelligenceLabFollowUpPlan
  metrics: IntelligenceLabRuntimeMetrics
  providerId: string
  providerName: string
  model: string
  traceId: string
}

const OPENAI_COMPATIBLE_TYPES = new Set([
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.DEEPSEEK,
  IntelligenceProviderType.SILICONFLOW,
  IntelligenceProviderType.CUSTOM,
])
const PLANNER_MAX_ACTIONS = 8
const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000
const STREAM_CONTRACT_VERSION = 2
const STREAM_ENGINE = 'intelligence'
const TOOL_ECHO = 'intelligence.echo'
const TOOL_TIME_NOW = 'intelligence.time.now'
const TOOL_CONTEXT_MERGE = 'intelligence.context.merge'
const TOOL_DELETE_MOCK = 'intelligence.delete.mock'
const TOOL_NEXUS_ACCOUNT_SNAPSHOT_GET = 'intelligence.nexus.account.snapshot.get'
const TOOL_NEXUS_CREDITS_SUMMARY_GET = 'intelligence.nexus.credits.summary.get'
const TOOL_NEXUS_SUBSCRIPTION_STATUS_GET = 'intelligence.nexus.subscription.status.get'
const TOOL_NEXUS_LANGUAGE_SET = 'intelligence.nexus.language.set'
const TOOL_NEXUS_THEME_SET = 'intelligence.nexus.theme.set'
const SUPPORTED_TOOL_IDS = [
  TOOL_ECHO,
  TOOL_TIME_NOW,
  TOOL_CONTEXT_MERGE,
  TOOL_DELETE_MOCK,
  TOOL_NEXUS_ACCOUNT_SNAPSHOT_GET,
  TOOL_NEXUS_CREDITS_SUMMARY_GET,
  TOOL_NEXUS_SUBSCRIPTION_STATUS_GET,
  TOOL_NEXUS_LANGUAGE_SET,
  TOOL_NEXUS_THEME_SET,
] as const
const SUPPORTED_CAPABILITY_IDS = ['text.chat', 'content.extract'] as const

function now(): number {
  return Date.now()
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0')
  const minutes = String(absMinutes % 60).padStart(2, '0')
  return `${sign}${hours}:${minutes}`
}

async function buildSystemContextLines(
  event: H3Event,
  userId: string,
  sessionId?: string,
): Promise<string[]> {
  const nowTime = new Date()
  const profile = await getUserById(event, userId)
  const locale = normalizeLocaleCode(profile?.locale) || profile?.locale || 'en'
  const localeTag = locale === 'zh' ? 'zh-CN' : 'en-US'
  const localTime = nowTime.toLocaleString(localeTag, { hour12: false })
  const isoTime = nowTime.toISOString()
  const offset = formatTimezoneOffset(nowTime)
  const userLine = profile
    ? `当前用户: id=${profile.id}; name=${profile.name ?? '-'}; email=${profile.email ?? '-'}; role=${profile.role ?? '-'}; locale=${profile.locale ?? '-'}`
    : `当前用户: id=${userId}`

  return [
    '你是 TuffIntelligence 塔塔。',
    `当前时间: ${localTime} (UTC${offset}, ISO: ${isoTime})`,
    userLine,
    sessionId ? `会话: ${sessionId}` : '',
  ].filter(Boolean)
}

async function buildSystemPrompt(
  event: H3Event,
  userId: string,
  lines: string[],
  options?: { sessionId?: string },
): Promise<string> {
  const contextLines = await buildSystemContextLines(event, userId, options?.sessionId)
  return [...contextLines, ...lines].filter(Boolean).join('\n')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function extractText(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return extractText((item as { text?: unknown }).text)
        return ''
      })
      .join('')
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const content = 'content' in record ? extractText(record.content) : ''
    if (content)
      return content
    const reasoningContent = 'reasoning_content' in record ? extractText(record.reasoning_content) : ''
    if (reasoningContent)
      return reasoningContent
    const reasoning = 'reasoning' in record ? extractText(record.reasoning) : ''
    if (reasoning)
      return reasoning
    const analysis = 'analysis' in record ? extractText(record.analysis) : ''
    if (analysis)
      return analysis
    if ('text' in record)
      return extractText(record.text)
  }
  return ''
}

function sanitizeJsonContent(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```'))
    return trimmed
  return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
}

function createRequestError(
  message: string,
  meta: {
    endpoint?: string
    status?: number
    responseSnippet?: string
  },
): ProviderRequestError {
  const error = new Error(message) as ProviderRequestError
  if (meta.endpoint)
    error.endpoint = meta.endpoint
  if (typeof meta.status === 'number')
    error.status = meta.status
  if (meta.responseSnippet)
    error.responseSnippet = meta.responseSnippet
  return error
}

function extractStatusBlockLines(raw: string): string[] {
  const normalized = raw.trim()
  if (!normalized) {
    return []
  }
  const statusMatch = normalized.match(/\[STATUS\]([\s\S]*?)(?:\[STRUCT\]|$)/i)
  const source = statusMatch?.[1] ? statusMatch[1] : normalized
  return source
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return ''
      }
      return trimmed.replace(/^[-*]\s+/, '').trim()
    })
    .filter(Boolean)
}

function parsePlannedActions(raw: string): IntelligenceLabAction[] {
  const sanitized = sanitizeJsonContent(raw)
  const parsed = JSON.parse(sanitized) as unknown
  if (!Array.isArray(parsed))
    return []

  const normalized = parsed
    .slice(0, PLANNER_MAX_ACTIONS)
    .map((item, index): IntelligenceLabAction | null => {
      const row = asRecord(item)
      const typeCandidate = String(row.type || '').trim().toLowerCase()
      const type: IntelligenceLabActionType
        = typeCandidate === 'tool' || typeCandidate === 'agent' ? typeCandidate : 'capability'
      const title = String(row.title || `Step ${index + 1}`).trim()
      const riskLevel = normalizeRiskLevel(row.riskLevel)
      const input = asRecord(row.input)

      if (type === 'tool') {
        const toolId = String(row.toolId || '').trim()
        if (!toolId)
          return null
        return {
          id: createId('action'),
          title,
          type,
          toolId,
          input,
          riskLevel,
        }
      }

      if (type === 'agent') {
        const agentId = String(row.agentId || '').trim()
        if (!agentId)
          return null
        return {
          id: createId('action'),
          title,
          type,
          agentId,
          input,
        }
      }

      const capabilityId = String(row.capabilityId || 'text.chat').trim() || 'text.chat'
      return {
        id: createId('action'),
        title,
        type: 'capability',
        capabilityId,
        input,
      }
    })
    .filter((item): item is IntelligenceLabAction => Boolean(item))

  return normalized
}

function normalizeRiskLevel(value: unknown): TuffIntelligenceApprovalTicket['riskLevel'] | undefined {
  if (typeof value !== 'string')
    return undefined
  const lower = value.toLowerCase()
  if (lower === 'low' || lower === 'medium' || lower === 'high' || lower === 'critical')
    return lower
  return undefined
}

function resolveRiskLevel(
  toolId: string,
  fallback: TuffIntelligenceApprovalTicket['riskLevel'] = 'medium',
): TuffIntelligenceApprovalTicket['riskLevel'] {
  const normalized = toolId.toLowerCase()
  if (
    normalized.includes('delete')
    || normalized.includes('shell')
    || normalized.includes('execute')
  ) {
    return 'critical'
  }
  if (
    normalized.includes('write')
    || normalized.includes('network')
    || normalized.includes('upload')
  ) {
    return 'high'
  }
  if (
    normalized.includes('move')
    || normalized.includes('download')
    || normalized.includes('system')
  ) {
    return 'medium'
  }
  return fallback
}

function requiresApproval(level: TuffIntelligenceApprovalTicket['riskLevel']): boolean {
  return level === 'high' || level === 'critical'
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ])
}

async function resolveProviderCandidates(
  event: H3Event,
  userId: string,
  options: {
    providerId?: string
    model?: string
    timeoutMs?: number
  } = {},
): Promise<ResolvedProviderContext[]> {
  const providers = await listProviders(event, userId)
  const enabledProviders = providers.filter(provider => provider.enabled)
  if (enabledProviders.length <= 0)
    throw new Error('No enabled intelligence providers.')

  const settings = await getSettings(event, userId)
  const orderedProviders = [...enabledProviders].sort((a, b) => a.priority - b.priority)
  const providerPool = options.providerId
    ? orderedProviders.filter(provider => provider.id === options.providerId)
    : (settings.defaultStrategy === 'priority' ? orderedProviders : enabledProviders)

  if (providerPool.length <= 0)
    throw new Error('Target provider not found.')

  const contexts: ResolvedProviderContext[] = []
  const skippedErrors: string[] = []
  for (const provider of providerPool) {
    const model = options.model?.trim() || provider.defaultModel || provider.models[0]
    if (!model) {
      skippedErrors.push(`Provider "${provider.name}" has no model configured.`)
      continue
    }

    const timeoutMs = Math.max(5_000, options.timeoutMs ?? provider.timeout ?? DEFAULT_TIMEOUT_MS)
    const apiKey = provider.type === IntelligenceProviderType.LOCAL
      ? null
      : await getProviderApiKey(event, userId, provider.id)
    if (provider.type !== IntelligenceProviderType.LOCAL && !apiKey) {
      skippedErrors.push(`Provider "${provider.name}" API key is missing.`)
      continue
    }

    contexts.push({
      provider,
      model,
      apiKey,
      timeoutMs,
    })
  }

  if (contexts.length <= 0) {
    throw new Error(skippedErrors[0] || 'No available intelligence providers.')
  }

  return contexts
}

async function invokeOpenAiCompatibleChat(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
): Promise<InvokeModelResult> {
  const baseUrl = resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
  const endpoints = buildOpenAiCompatBaseUrls(baseUrl).map(url => `${url}/chat/completions`)
  const traceId = createId('trace')
  const startedAt = now()
  let lastError: Error | null = null
  const attemptErrors: Array<{
    endpoint: string
    status?: number
    responseSnippet?: string
    message: string
  }> = []

  for (const endpoint of endpoints) {
    try {
      const response = await withTimeout(
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${context.apiKey}`,
          },
          body: JSON.stringify({
            model: context.model,
            messages,
            temperature: 0.2,
            stream: false,
          }),
        }),
        context.timeoutMs,
        `Request timeout after ${context.timeoutMs}ms`,
      )
      const responseText = await response.text()
      if (!response.ok) {
        throw createRequestError(
          `OpenAI-compatible API returned ${response.status}: ${responseText.slice(0, 240)}`,
          {
            endpoint,
            status: response.status,
            responseSnippet: responseText.slice(0, 400),
          },
        )
      }

      let data: { choices?: Array<{ message?: Record<string, unknown> }> }
      try {
        data = JSON.parse(responseText) as { choices?: Array<{ message?: Record<string, unknown> }> }
      } catch {
        throw createRequestError('OpenAI-compatible API returned invalid JSON.', {
          endpoint,
          status: response.status,
          responseSnippet: responseText.slice(0, 400),
        })
      }
      const message = data.choices?.[0]?.message
      const content = extractText(message).trim()
      if (!content) {
        throw createRequestError('Provider returned empty content.', {
          endpoint,
          status: response.status,
          responseSnippet: responseText.slice(0, 400),
        })
      }

      return {
        content,
        model: context.model,
        traceId,
        endpoint,
        status: response.status,
        latency: now() - startedAt,
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Unknown provider error.')
      const detail = normalized as unknown as Record<string, unknown>
      attemptErrors.push({
        endpoint: typeof detail.endpoint === 'string' ? detail.endpoint : endpoint,
        status: typeof detail.status === 'number' ? detail.status : undefined,
        responseSnippet: typeof detail.responseSnippet === 'string' ? detail.responseSnippet : undefined,
        message: normalized.message,
      })
      lastError = normalized
    }
  }

  if (lastError && typeof lastError === 'object') {
    const errorDetail = lastError as unknown as Record<string, unknown>
    errorDetail.endpoints = endpoints
    if (attemptErrors.length) {
      errorDetail.attemptErrors = attemptErrors
    }
  }
  throw lastError ?? new Error('Failed to call OpenAI-compatible endpoint.')
}

async function invokeAnthropicChat(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
): Promise<InvokeModelResult> {
  const baseUrl = resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
  const endpoint = `${baseUrl}/messages`
  const traceId = createId('trace')
  const startedAt = now()
  const systemMessages = messages.filter(message => message.role === 'system').map(message => message.content)
  const requestMessages = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))

  const response = await withTimeout(
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': context.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: context.model,
        max_tokens: 1200,
        messages: requestMessages,
        system: systemMessages.join('\n'),
      }),
    }),
    context.timeoutMs,
    `Request timeout after ${context.timeoutMs}ms`,
  )
  const responseText = await response.text()
  if (!response.ok) {
    throw createRequestError(
      `Anthropic API returned ${response.status}: ${responseText.slice(0, 240)}`,
      {
        endpoint,
        status: response.status,
        responseSnippet: responseText.slice(0, 400),
      },
    )
  }

  let payload: { content?: Array<{ text?: string }> }
  try {
    payload = JSON.parse(responseText) as { content?: Array<{ text?: string }> }
  } catch {
    throw createRequestError('Anthropic API returned invalid JSON.', {
      endpoint,
      status: response.status,
      responseSnippet: responseText.slice(0, 400),
    })
  }
  const content = payload.content?.map(item => item.text || '').join('\n').trim()
  if (!content) {
    throw createRequestError('Anthropic returned empty content.', {
      endpoint,
      status: response.status,
      responseSnippet: responseText.slice(0, 400),
    })
  }

  return {
    content,
    model: context.model,
    traceId,
    endpoint,
    status: response.status,
    latency: now() - startedAt,
  }
}

async function invokeLocalChat(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
): Promise<InvokeModelResult> {
  const baseUrl = resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
  const endpoint = `${baseUrl}/api/chat`
  const traceId = createId('trace')
  const startedAt = now()
  const response = await withTimeout(
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: context.model,
        stream: false,
        messages,
      }),
    }),
    context.timeoutMs,
    `Request timeout after ${context.timeoutMs}ms`,
  )
  const responseText = await response.text()
  if (!response.ok) {
    throw createRequestError(
      `Local provider returned ${response.status}: ${responseText.slice(0, 240)}`,
      {
        endpoint,
        status: response.status,
        responseSnippet: responseText.slice(0, 400),
      },
    )
  }
  let payload: { message?: { content?: string }; response?: string }
  try {
    payload = JSON.parse(responseText) as { message?: { content?: string }; response?: string }
  } catch {
    throw createRequestError('Local provider returned invalid JSON.', {
      endpoint,
      status: response.status,
      responseSnippet: responseText.slice(0, 400),
    })
  }
  const content = (payload.message?.content || payload.response || '').trim()
  if (!content) {
    throw createRequestError('Local provider returned empty content.', {
      endpoint,
      status: response.status,
      responseSnippet: responseText.slice(0, 400),
    })
  }

  return {
    content,
    model: context.model,
    traceId,
    endpoint,
    status: response.status,
    latency: now() - startedAt,
  }
}

async function invokeModel(
  event: H3Event,
  userId: string,
  payload: {
    providerId?: string
    model?: string
    timeoutMs?: number
    messages: IntelligenceMessage[]
    source?: string
    stage?: string
    sessionId?: string
  },
): Promise<InvokeModelWithFallbackResult> {
  const settings = await getSettings(event, userId)
  const contexts = await resolveProviderCandidates(event, userId, {
    providerId: payload.providerId,
    model: payload.model,
    timeoutMs: payload.timeoutMs,
  })
  const attemptedProviders: string[] = []
  const errors: InvokeModelAttemptError[] = []
  let fallbackCount = 0
  let retryCount = 0
  let lastError: Error | null = null

  for (let index = 0; index < contexts.length; index++) {
    const context = contexts[index]!
    attemptedProviders.push(context.provider.id)
    try {
      const result = await invokeWithResolvedContext(context, payload.messages)
      if (settings.enableAudit) {
        await createAudit(event, {
          userId,
          providerId: context.provider.id,
          providerType: context.provider.type,
          model: result.model,
          endpoint: result.endpoint,
          status: result.status ?? 200,
          latency: result.latency,
          success: true,
          traceId: result.traceId,
          metadata: {
            source: payload.source || 'intelligence-lab',
            stage: payload.stage || 'invoke',
            sessionId: payload.sessionId,
            attempt: index + 1,
            fallbackCount,
            retryCount,
          },
        })
      }
      return {
        result,
        context,
        fallbackCount,
        retryCount,
        attemptedProviders,
        errors,
      }
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error))
      const detail = normalizedError as unknown as Record<string, unknown>
      detail.attempt = index + 1
      detail.fallbackCandidate = index < contexts.length - 1
      detail.stage = payload.stage || 'invoke'
      lastError = normalizedError
      retryCount += 1
      errors.push({
        providerId: context.provider.id,
        providerName: context.provider.name,
        message: normalizedError.message,
      })

      if (settings.enableAudit) {
        await createAudit(event, {
          userId,
          providerId: context.provider.id,
          providerType: context.provider.type,
          model: context.model,
          endpoint: null,
          status: 500,
          latency: context.timeoutMs,
          success: false,
          errorMessage: normalizedError.message,
          traceId: createId('trace'),
          metadata: {
            source: payload.source || 'intelligence-lab',
            stage: payload.stage || 'invoke',
            sessionId: payload.sessionId,
            attempt: index + 1,
            fallbackCandidate: index < contexts.length - 1,
          },
        })
      }

      if (index < contexts.length - 1) {
        fallbackCount += 1
      }
    }
  }

  throw lastError ?? new Error('Failed to call all available intelligence providers.')
}

async function invokeWithResolvedContext(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
): Promise<InvokeModelResult> {
  try {
    if (context.provider.type === IntelligenceProviderType.ANTHROPIC) {
      return await invokeAnthropicChat(context, messages)
    }
    if (context.provider.type === IntelligenceProviderType.LOCAL) {
      return await invokeLocalChat(context, messages)
    }
    if (OPENAI_COMPATIBLE_TYPES.has(context.provider.type as IntelligenceProviderType)) {
      return await invokeOpenAiCompatibleChat(context, messages)
    }
    throw new Error(`Unsupported provider type: ${context.provider.type}`)
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    const detail = normalized as unknown as Record<string, unknown>
    detail.providerId = context.provider.id
    detail.providerName = context.provider.name
    detail.providerType = context.provider.type
    detail.model = context.model
    detail.baseUrl = resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
    throw normalized
  }
}

function normalizeMessages(messages: unknown): IntelligenceMessage[] {
  if (!Array.isArray(messages))
    return []
  return messages
    .map((message) => {
      const row = asRecord(message)
      const roleRaw = String(row.role || '').trim().toLowerCase()
      const role: IntelligenceMessage['role']
        = roleRaw === 'system' || roleRaw === 'assistant' ? roleRaw : 'user'
      const content = String(row.content || '').trim()
      if (!content)
        return null
      return { role, content }
    })
    .filter((message): message is IntelligenceMessage => Boolean(message))
}

async function analyzeIntentWithModel(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    history: IntelligenceMessage[]
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
): Promise<{
  analysis: IntelligenceIntentAnalysis
  providerId: string
  providerName: string
  model: string
  traceId: string
  fallbackCount: number
  retryCount: number
  rawModelOutput: string | null
}> {
  const objective = payload.objective.trim()

  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence intent analyst.',
    'Return full reasoning in plain text only.',
    'Output multiple lines, each line is a status log.',
    'Include explicit lines such as:',
    '意图分析：...',
    '定位工具：...',
    '调用 xxx：...',
    '输出：...',
    'Rules:',
    '1) Use the same language as the objective.',
    '2) Do not return JSON.',
  ], { sessionId: payload.sessionId })

  const promptMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective,
        history: payload.history,
      }),
    },
  ]

  try {
    const invocation = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: promptMessages,
      source: 'intelligence-lab',
      stage: 'intent-analysis',
      sessionId: payload.sessionId,
    })
    const rawModelOutput = invocation.result.content.trim()
    const statusLines = extractStatusBlockLines(rawModelOutput)
      .map(line => line.trim())
      .filter(Boolean)
    if (statusLines.length <= 0) {
      throw new Error('Intent analysis returned empty output.')
    }

    return {
      analysis: { lines: statusLines },
      providerId: invocation.context.provider.id,
      providerName: invocation.context.provider.name,
      model: invocation.result.model,
      traceId: invocation.result.traceId,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
      rawModelOutput: rawModelOutput || null,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Intent analysis failed.')
  }
}

async function explainActionNarrativesWithModel(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    actions: IntelligenceLabAction[]
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
): Promise<{
  narratives: Record<string, string>
  fallbackCount: number
  retryCount: number
  rawModelOutput: string | null
}> {
  if (payload.actions.length <= 0) {
    return {
      narratives: {},
      fallbackCount: 0,
      retryCount: 0,
      rawModelOutput: null,
    }
  }

  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence action explainer.',
    'Return plain text only.',
    'Output requirement: one line per action, in the same order.',
    'Each line is a one-sentence narrative describing why the action/tool is selected.',
    'Use the same language as objective.',
  ], { sessionId: payload.sessionId })

  const promptMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective: payload.objective,
        actions: payload.actions.map((action, index) => ({
          index: index + 1,
          id: action.id,
          title: action.title,
          type: action.type,
          toolId: action.toolId,
          agentId: action.agentId,
          capabilityId: action.capabilityId,
          riskLevel: action.riskLevel,
        })),
      }),
    },
  ]

  try {
    const invocation = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: promptMessages,
      source: 'intelligence-lab',
      stage: 'action-narratives',
      sessionId: payload.sessionId,
    })
    const rawModelOutput = invocation.result.content.trim()
    const narratives: Record<string, string> = {}
    const statusLines = extractStatusBlockLines(rawModelOutput)
    for (const [index, action] of payload.actions.entries()) {
      const candidate = statusLines[index]
      if (candidate) {
        narratives[action.id] = candidate
      }
    }
    if (Object.keys(narratives).length < payload.actions.length) {
      throw new Error('Action narratives returned empty output.')
    }

    return {
      narratives,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
      rawModelOutput: rawModelOutput || null,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Action narratives failed.')
  }
}

async function summarizeActionResultWithModel(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    action: IntelligenceLabAction | null
    result: IntelligenceLabExecutionResult
    index: number
    total: number
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
): Promise<{
  message: string
  rawModelOutput: string | null
}> {
  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence runtime commentator.',
    'Return plain text only.',
    'You may output multiple lines.',
    'Do not limit length.',
    'Use same language as objective.',
  ], { sessionId: payload.sessionId })

  const promptMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective: payload.objective,
        step: {
          index: payload.index,
          total: payload.total,
        },
        action: payload.action,
        result: payload.result,
      }),
    },
  ]

  try {
    const invocation = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: promptMessages,
      source: 'intelligence-lab',
      stage: 'action-result-commentary',
      sessionId: payload.sessionId,
    })
    const rawModelOutput = invocation.result.content.trim()
    if (!rawModelOutput) {
      throw new Error('Action result commentary is empty.')
    }
    return {
      message: rawModelOutput,
      rawModelOutput: rawModelOutput || null,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Action result commentary failed.')
  }
}

type SupportedLocale = 'en' | 'zh'
type SupportedThemePreference = 'auto' | 'dark' | 'light'

interface ToolExecutionContext {
  event?: H3Event
  userId?: string
}

function normalizeLocaleCode(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string')
    return null
  const locale = value.trim().toLowerCase()
  if (!locale)
    return null
  if (locale === 'zh' || locale === 'zh-cn' || locale === 'zh-hans')
    return 'zh'
  if (locale === 'en' || locale === 'en-us' || locale === 'en-gb')
    return 'en'
  return null
}

function normalizeThemePreference(value: unknown): SupportedThemePreference | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'auto' || normalized === 'dark' || normalized === 'light')
    return normalized
  return null
}

function toSafeNumber(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function mapCreditBalance(balance: unknown): {
  quota: number
  used: number
  remaining: number
} {
  const row = asRecord(balance)
  const quota = toSafeNumber(row.quota)
  const used = toSafeNumber(row.used)
  return {
    quota,
    used,
    remaining: Math.max(0, quota - used),
  }
}

function requireToolExecutionContext(context: ToolExecutionContext, toolId: string): {
  event: H3Event
  userId: string
} {
  if (!context.event || !context.userId) {
    throw new Error(`Tool "${toolId}" requires user context.`)
  }
  return {
    event: context.event,
    userId: context.userId,
  }
}

async function readSubscriptionSnapshot(event: H3Event, userId: string) {
  const [subscription, teamContext] = await Promise.all([
    getUserSubscription(event, userId),
    resolveActiveTeamContext(event, userId),
  ])
  const features = getPlanFeatures(subscription.plan)
  const requestLimit = Number(features.aiRequestsLimit || 0)
  const requestUsed = Number(teamContext.quota.aiRequestsUsed || 0)
  const tokenLimit = Number(features.aiTokensLimit || 0)
  const tokenUsed = Number(teamContext.quota.aiTokensUsed || 0)

  return {
    subscription,
    teamContext,
    features,
    usage: {
      aiRequests: {
        limit: requestLimit,
        used: requestUsed,
        remaining: Math.max(0, requestLimit - requestUsed),
      },
      aiTokens: {
        limit: tokenLimit,
        used: tokenUsed,
        remaining: Math.max(0, tokenLimit - tokenUsed),
      },
    },
  }
}

async function executeTool(
  toolId: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext = {},
): Promise<unknown> {
  switch (toolId) {
    case TOOL_ECHO:
      return { echo: input }
    case TOOL_TIME_NOW:
      return { now: new Date().toISOString(), timestamp: now() }
    case TOOL_CONTEXT_MERGE:
      return { merged: input }
    case TOOL_DELETE_MOCK:
      return {
        accepted: false,
        reason: 'delete operation requires explicit approval',
        target: input,
      }
    case TOOL_NEXUS_CREDITS_SUMMARY_GET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const summary = await getCreditSummary(event, userId)
      return {
        month: String(summary.month || ''),
        team: mapCreditBalance(summary.team),
        user: mapCreditBalance(summary.user),
      }
    }
    case TOOL_NEXUS_SUBSCRIPTION_STATUS_GET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const snapshot = await readSubscriptionSnapshot(event, userId)
      return {
        plan: snapshot.subscription.plan,
        isActive: snapshot.subscription.isActive,
        activatedAt: snapshot.subscription.activatedAt,
        expiresAt: snapshot.subscription.expiresAt,
        features: {
          customModels: snapshot.features.customModels,
          prioritySupport: snapshot.features.prioritySupport,
          apiAccess: snapshot.features.apiAccess,
        },
        usage: snapshot.usage,
        team: {
          id: snapshot.teamContext.team.id,
          name: snapshot.teamContext.team.name,
          type: snapshot.teamContext.team.type,
          role: snapshot.teamContext.role,
          collaborationEnabled: snapshot.teamContext.collaborationEnabled,
          seats: {
            used: snapshot.teamContext.seatsUsed,
            total: snapshot.teamContext.seatsLimit,
          },
        },
      }
    }
    case TOOL_NEXUS_ACCOUNT_SNAPSHOT_GET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const [profile, creditSummary, subscriptionSnapshot] = await Promise.all([
        getUserById(event, userId),
        getCreditSummary(event, userId),
        readSubscriptionSnapshot(event, userId),
      ])
      if (!profile) {
        throw new Error('User profile not found.')
      }

      const cookieTheme = normalizeThemePreference(getCookie(event, 'nuxt-color-mode'))
      return {
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          locale: normalizeLocaleCode(profile.locale) || profile.locale || 'en',
          emailState: profile.emailState,
        },
        subscription: {
          plan: subscriptionSnapshot.subscription.plan,
          isActive: subscriptionSnapshot.subscription.isActive,
          activatedAt: subscriptionSnapshot.subscription.activatedAt,
          expiresAt: subscriptionSnapshot.subscription.expiresAt,
        },
        usage: subscriptionSnapshot.usage,
        credits: {
          month: String(creditSummary.month || ''),
          team: mapCreditBalance(creditSummary.team),
          user: mapCreditBalance(creditSummary.user),
        },
        team: {
          id: subscriptionSnapshot.teamContext.team.id,
          name: subscriptionSnapshot.teamContext.team.name,
          type: subscriptionSnapshot.teamContext.team.type,
          role: subscriptionSnapshot.teamContext.role,
          collaborationEnabled: subscriptionSnapshot.teamContext.collaborationEnabled,
          seats: {
            used: subscriptionSnapshot.teamContext.seatsUsed,
            total: subscriptionSnapshot.teamContext.seatsLimit,
          },
        },
        themePreference: cookieTheme || 'auto',
      }
    }
    case TOOL_NEXUS_LANGUAGE_SET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const nextLocale = normalizeLocaleCode(input.locale ?? input.language)
      if (!nextLocale) {
        throw new Error('locale must be one of: en, zh.')
      }
      const updatedUser = await updateUserProfile(event, userId, {
        locale: nextLocale,
      })
      setCookie(event, 'tuff_locale', nextLocale, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      })
      return {
        locale: nextLocale,
        userId,
        updated: Boolean(updatedUser),
      }
    }
    case TOOL_NEXUS_THEME_SET: {
      const { event } = requireToolExecutionContext(context, toolId)
      const preference = normalizeThemePreference(input.theme ?? input.preference ?? input.mode)
      if (!preference) {
        throw new Error('theme must be one of: auto, dark, light.')
      }
      setCookie(event, 'nuxt-color-mode', preference, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      })
      setCookie(event, 'tuff_theme_preference', preference, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      })
      return {
        preference,
        updated: true,
      }
    }
    default:
      throw new Error(`Unsupported tool "${toolId}".`)
  }
}

export async function listIntelligenceLabProviders(event: H3Event, userId: string): Promise<{
  providers: IntelligenceProviderRecord[]
  defaultStrategy: string
}> {
  const [providers, settings] = await Promise.all([
    listProviders(event, userId),
    getSettings(event, userId),
  ])
  return {
    providers,
    defaultStrategy: settings.defaultStrategy,
  }
}

export async function heartbeatIntelligenceLabSession(
  event: H3Event,
  userId: string,
  payload: { sessionId: string },
): Promise<{ sessionId: string, heartbeatAt: string }> {
  const sessionId = payload.sessionId.trim()
  if (!sessionId) {
    throw new Error('sessionId is required.')
  }
  const session = await touchRuntimeSessionHeartbeat(event, { sessionId, userId })
  if (!session) {
    throw new Error('Session not found.')
  }
  return {
    sessionId,
    heartbeatAt: session.lastHeartbeatAt || new Date().toISOString(),
  }
}

export async function pauseIntelligenceLabSession(
  event: H3Event,
  userId: string,
  payload: {
    sessionId: string
    reason?: TuffIntelligencePauseReason
  },
): Promise<{
  sessionId: string
  status: RuntimeSessionRecord['status']
  pauseReason: TuffIntelligencePauseReason | null
}> {
  const sessionId = payload.sessionId.trim()
  if (!sessionId) {
    throw new Error('sessionId is required.')
  }
  const existing = await getRuntimeSession(event, userId, sessionId)
  if (!existing) {
    throw new Error('Session not found.')
  }
  const pauseReason = payload.reason || 'manual_pause'
  const paused = await markRuntimeSessionPaused(event, {
    sessionId,
    userId,
    pauseReason,
  })

  return {
    sessionId: paused.sessionId,
    status: paused.status,
    pauseReason: paused.pauseReason,
  }
}

export async function listIntelligenceLabSessionHistory(
  event: H3Event,
  userId: string,
  limit = 20,
): Promise<IntelligenceLabSessionHistoryItem[]> {
  const sessions = await listRuntimeSessions(event, {
    userId,
    limit,
  })

  const items: IntelligenceLabSessionHistoryItem[] = []
  for (const session of sessions) {
    const checkpoint = await getLatestRuntimeCheckpoint(event, {
      sessionId: session.sessionId,
      userId,
    })
    const checkpointState = normalizeRuntimeCheckpointState(checkpoint?.state)
    const stats = computeActionStats(checkpointState?.results ?? [])
    items.push({
      sessionId: session.sessionId,
      status: session.status,
      pauseReason: session.pauseReason,
      objective: checkpointState?.objective || session.objective || '',
      updatedAt: session.updatedAt,
      lastEventSeq: session.lastEventSeq,
      pendingActions: Math.max(
        0,
        (checkpointState?.actions.length ?? 0) - stats.completedActions - stats.failedActions,
      ),
      completedActions: stats.completedActions,
      failedActions: stats.failedActions,
      waitingApprovals: stats.waitingApprovals,
    })
  }
  return items
}

export async function planIntelligenceLab(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    context?: Record<string, unknown>
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
): Promise<{
  objective: string
  actions: IntelligenceLabAction[]
  providerId: string
  providerName: string
  model: string
  traceId: string
  rawModelOutput: string | null
  fallbackCount: number
  retryCount: number
}> {
  const objective = payload.objective.trim()
  if (!objective)
    throw new Error('Objective is required.')

  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence planner.',
    'Return JSON array only.',
    `Allowed tools: ${SUPPORTED_TOOL_IDS.join(', ')}`,
    `Allowed capabilities: ${SUPPORTED_CAPABILITY_IDS.join(', ')}`,
    'Action schema: {"title":"...", "type":"tool|agent|capability", "toolId":"...", "agentId":"...", "capabilityId":"...", "input":{}, "riskLevel":"low|medium|high|critical"}',
    'Tool input hints: intelligence.nexus.account.snapshot.get({}), intelligence.nexus.credits.summary.get({}), intelligence.nexus.subscription.status.get({}), intelligence.nexus.language.set({"locale":"en|zh"}), intelligence.nexus.theme.set({"theme":"auto|dark|light"})',
  ], { sessionId: payload.sessionId })

  const plannerMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective,
        context: payload.context ?? {},
        limits: {
          maxActions: PLANNER_MAX_ACTIONS,
        },
      }),
    },
  ]

  let actions: IntelligenceLabAction[] = []
  const { result, context, fallbackCount, retryCount } = await invokeModel(event, userId, {
    providerId: payload.providerId,
    model: payload.model,
    timeoutMs: payload.timeoutMs,
    messages: plannerMessages,
    source: 'intelligence-lab',
    stage: 'planner',
  })
  const rawModelOutput = result.content

  try {
    actions = parsePlannedActions(result.content)
  } catch (error) {
    throw error instanceof Error ? error : new Error('Planner output invalid.')
  }

  if (actions.length <= 0) {
    throw new Error('Planner returned empty actions.')
  }

  return {
    objective,
    actions,
    providerId: context.provider.id,
    providerName: context.provider.name,
    model: result.model,
    traceId: result.traceId,
    rawModelOutput: rawModelOutput || null,
    fallbackCount,
    retryCount,
  }
}

export interface ExecuteIntelligenceLabHooks {
  onActionStart?: (
    action: IntelligenceLabAction,
    context: {
      index: number
      total: number
    },
  ) => void | Promise<void>
  onStep?: (
    result: IntelligenceLabExecutionResult,
    context: {
      index: number
      total: number
      fallbackCount: number
      retryCount: number
    },
  ) => void | Promise<void>
  shouldPause?: (context: {
    index: number
    total: number
  }) => Promise<{ paused: boolean, reason?: TuffIntelligencePauseReason } | boolean>
}

export async function executeIntelligenceLab(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    actions: IntelligenceLabAction[]
    providerId?: string
    model?: string
    timeoutMs?: number
    continueOnError?: boolean
    sessionId?: string
  },
  hooks?: ExecuteIntelligenceLabHooks,
): Promise<{
  objective: string
  results: IntelligenceLabExecutionResult[]
  providerId: string
  providerName: string
  model: string
  traceId: string
  fallbackCount: number
  retryCount: number
  paused?: boolean
  pauseReason?: TuffIntelligencePauseReason
}> {
  const objective = payload.objective.trim()
  if (!objective)
    throw new Error('Objective is required.')
  if (!Array.isArray(payload.actions) || payload.actions.length <= 0)
    throw new Error('Actions are required.')

  const executionResults: IntelligenceLabExecutionResult[] = []
  const shouldContinue = Boolean(payload.continueOnError)
  let firstInvocation: InvokeModelWithFallbackResult
  try {
    const bootstrapPrompt = await buildSystemPrompt(event, userId, [
      'You are TuffIntelligence executor bootstrap. Reply with "ready".',
    ], { sessionId: payload.sessionId })

    firstInvocation = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: [
        {
          role: 'system',
          content: bootstrapPrompt,
        },
        {
          role: 'user',
          content: objective,
        },
      ],
      source: 'intelligence-lab',
      stage: 'executor-bootstrap',
    })
  } catch (error) {
    const bootstrapError = error instanceof Error ? error : new Error('Executor bootstrap failed.')
    ;(bootstrapError as { stage?: string }).stage = 'executor-bootstrap'
    throw bootstrapError
  }
  let fallbackCount = firstInvocation.fallbackCount
  let retryCount = firstInvocation.retryCount
  const totalActions = payload.actions.length

  const pushResult = async (
    result: IntelligenceLabExecutionResult,
    runtime: { fallbackCount?: number; retryCount?: number } = {},
  ) => {
    executionResults.push(result)
    fallbackCount += runtime.fallbackCount ?? 0
    retryCount += runtime.retryCount ?? 0
    await hooks?.onStep?.(result, {
      index: executionResults.length,
      total: totalActions,
      fallbackCount,
      retryCount,
    })
  }

  for (const action of payload.actions) {
    if (hooks?.shouldPause) {
      const pauseResult = await hooks.shouldPause({
        index: executionResults.length,
        total: totalActions,
      })
      const paused = typeof pauseResult === 'boolean' ? pauseResult : pauseResult.paused
      const reason = typeof pauseResult === 'boolean' ? undefined : pauseResult.reason
      if (paused) {
        return {
          objective,
          results: executionResults,
          providerId: firstInvocation.context.provider.id,
          providerName: firstInvocation.context.provider.name,
          model: firstInvocation.result.model,
          traceId: firstInvocation.result.traceId,
          fallbackCount,
          retryCount,
          paused: true,
          pauseReason: reason,
        }
      }
    }

    await hooks?.onActionStart?.(action, {
      index: executionResults.length + 1,
      total: totalActions,
    })

    const normalizedInput = asRecord(action.input)
    if (action.type === 'tool') {
      const toolId = String(action.toolId || '').trim()
      if (!toolId) {
        await pushResult({
          actionId: action.id,
          title: action.title,
          type: 'tool',
          status: 'failed',
          error: 'toolId is required for tool action.',
        })
        if (!shouldContinue)
          break
        continue
      }

      const risk = resolveRiskLevel(toolId, action.riskLevel ?? 'medium')
      if (requiresApproval(risk)) {
        const approvalTicket: TuffIntelligenceApprovalTicket = {
          id: createId('approval'),
          sessionId: 'intelligence-lab',
          actionId: action.id,
          toolId,
          riskLevel: risk,
          reason: `Tool "${toolId}" requires approval in intelligence lab.`,
          status: 'pending',
          requestedAt: now(),
          metadata: {
            deferredAction: {
              toolId,
              input: normalizedInput,
            },
          },
        }
        await pushResult({
          actionId: action.id,
          title: action.title,
          type: 'tool',
          toolId,
          status: 'waiting_approval',
          approvalTicket,
        })
        continue
      }

      try {
        const output = await executeTool(toolId, normalizedInput, { event, userId })
        await pushResult({
          actionId: action.id,
          title: action.title,
          type: 'tool',
          toolId,
          status: 'completed',
          output,
        })
      } catch (error) {
        await pushResult({
          actionId: action.id,
          title: action.title,
          type: 'tool',
          toolId,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        if (!shouldContinue)
          break
      }
      continue
    }

    const capabilityId = action.type === 'capability'
      ? String(action.capabilityId || 'text.chat')
      : 'text.chat'

    const executionPrompt = await buildSystemPrompt(event, userId, [
      action.type === 'agent'
        ? 'You are TuffIntelligence executor acting as a specialist agent. Return concise JSON.'
        : `You are TuffIntelligence executor for capability "${capabilityId}". Return concise JSON.`,
    ], { sessionId: payload.sessionId })

    const executionMessages: IntelligenceMessage[] = [
      {
        role: 'system',
        content: executionPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify({
          objective,
          action,
        }),
      },
    ]

    try {
      const invocation = await invokeModel(event, userId, {
        providerId: firstInvocation.context.provider.id,
        model: firstInvocation.result.model,
        timeoutMs: payload.timeoutMs,
        messages: executionMessages,
        source: 'intelligence-lab',
        stage: action.type === 'agent' ? 'agent' : 'capability',
      })
      await pushResult({
        actionId: action.id,
        title: action.title,
        type: action.type,
        status: 'completed',
        output: {
          capabilityId,
          content: invocation.result.content,
          traceId: invocation.result.traceId,
        },
      }, {
        fallbackCount: invocation.fallbackCount,
        retryCount: invocation.retryCount,
      })
    } catch (error) {
      const executionError = error instanceof Error ? error : new Error('Capability execution failed.')
      ;(executionError as { stage?: string, cause?: unknown }).stage = action.type === 'agent' ? 'agent' : 'capability'
      ;(executionError as { cause?: unknown }).cause = {
        actionId: action.id,
        title: action.title,
        type: action.type,
        agentId: action.agentId,
        capabilityId,
      }
      throw executionError
    }
  }

  return {
    objective,
    results: executionResults,
    providerId: firstInvocation.context.provider.id,
    providerName: firstInvocation.context.provider.name,
    model: firstInvocation.result.model,
    traceId: firstInvocation.result.traceId,
    fallbackCount,
    retryCount,
  }
}

export async function reflectIntelligenceLab(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    actions: IntelligenceLabAction[]
    results: IntelligenceLabExecutionResult[]
    notes?: string
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
): Promise<{
  summary: string
  providerId: string
  providerName: string
  model: string
  traceId: string
  rawModelOutput: string | null
  fallbackCount: number
  retryCount: number
}> {
  const objective = payload.objective.trim()
  if (!objective)
    throw new Error('Objective is required.')

  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence reviewer. Summarize wins, failures, risks, and next actions in markdown.',
  ], { sessionId: payload.sessionId })

  const reflectionMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective,
        notes: payload.notes || '',
        actions: payload.actions,
        results: payload.results,
      }),
    },
  ]

  try {
    const { result, context, fallbackCount, retryCount } = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: reflectionMessages,
      source: 'intelligence-lab',
      stage: 'reflection',
    })
    const rawModelOutput = result.content
    return {
      summary: rawModelOutput.trim(),
      providerId: context.provider.id,
      providerName: context.provider.name,
      model: result.model,
      traceId: result.traceId,
      rawModelOutput: rawModelOutput || null,
      fallbackCount,
      retryCount,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Reflection failed.')
  }
}

function chunkForStream(content: string, chunkSize = 72): string[] {
  const text = content.trim()
  if (!text)
    return []
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize))
  }
  return chunks
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function toRuntimeStatus(
  status: IntelligenceLabRuntimeMetrics['status'],
): TuffIntelligenceRuntimeStatus {
  if (status === 'waiting_approval')
    return 'waiting_approval'
  if (status === 'paused_disconnect')
    return 'paused_disconnect'
  if (status === 'failed')
    return 'failed'
  return 'completed'
}

function buildCheckpointState(params: {
  objective: string
  history: IntelligenceMessage[]
  actions: IntelligenceLabAction[]
  results: IntelligenceLabExecutionResult[]
  reflection?: string
  followUp?: IntelligenceLabFollowUpPlan
  providerId?: string
  providerName?: string
  model?: string
  traceId?: string
  startedAt: number
}): RuntimeCheckpointState {
  return {
    objective: params.objective,
    history: params.history,
    actions: params.actions,
    results: params.results,
    reflection: params.reflection,
    followUp: params.followUp,
    providerId: params.providerId,
    providerName: params.providerName,
    model: params.model,
    traceId: params.traceId,
    startedAt: params.startedAt,
  }
}

function normalizeRuntimeCheckpointState(value: unknown): RuntimeCheckpointState | null {
  const row = asRecord(value)
  const objective = typeof row.objective === 'string' ? row.objective.trim() : ''
  if (!objective)
    return null

  const history = normalizeLabMessages(row.history)
  const actions = sanitizeLabActions(row.actions)
  const results = sanitizeExecutionResults(row.results)
  return {
    objective,
    history,
    actions,
    results,
    reflection: typeof row.reflection === 'string' ? row.reflection : undefined,
    followUp: row.followUp && typeof row.followUp === 'object'
      ? {
          summary: String((row.followUp as Record<string, unknown>).summary || ''),
          nextActions: Array.isArray((row.followUp as Record<string, unknown>).nextActions)
            ? ((row.followUp as Record<string, unknown>).nextActions as unknown[]).map(item => String(item || '')).filter(Boolean)
            : [],
          revisitInHours: Number((row.followUp as Record<string, unknown>).revisitInHours || 24),
        }
      : undefined,
    providerId: typeof row.providerId === 'string' ? row.providerId : undefined,
    providerName: typeof row.providerName === 'string' ? row.providerName : undefined,
    model: typeof row.model === 'string' ? row.model : undefined,
    traceId: typeof row.traceId === 'string' ? row.traceId : undefined,
    startedAt: typeof row.startedAt === 'number' ? row.startedAt : now(),
  }
}

function computeActionStats(results: IntelligenceLabExecutionResult[]): {
  totalActions: number
  completedActions: number
  failedActions: number
  waitingApprovals: number
} {
  const totalActions = results.length
  const completedActions = results.filter(item => item.status === 'completed').length
  const failedActions = results.filter(item => item.status === 'failed').length
  const waitingApprovals = results.filter(item => item.status === 'waiting_approval').length
  return {
    totalActions,
    completedActions,
    failedActions,
    waitingApprovals,
  }
}

function buildToolFailureDistribution(
  results: IntelligenceLabExecutionResult[],
): Record<string, number> {
  const distribution: Record<string, number> = {}
  for (const result of results) {
    if (result.status !== 'failed') {
      continue
    }
    const key = result.type === 'tool'
      ? (result.approvalTicket?.toolId || result.title || 'tool.unknown')
      : `${result.type}:runtime`
    distribution[key] = (distribution[key] ?? 0) + 1
  }
  return distribution
}
async function buildFinalAssistantReplyWithModel(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    actions: IntelligenceLabAction[]
    results: IntelligenceLabExecutionResult[]
    reflection: string
    followUp: IntelligenceLabFollowUpPlan
    metrics: IntelligenceLabRuntimeMetrics
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
  options?: {
    onDelta?: (delta: string) => void | Promise<void>
  },
): Promise<{
  message: string
  providerId: string
  providerName: string
  model: string
  traceId: string
  fallbackCount: number
  retryCount: number
  rawModelOutput: string | null
  streamed: boolean
}> {
  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence final responder.',
    'Return plain text only.',
    'Do not include markdown fences or role labels.',
    'Use the same language as the user objective.',
    'Summarize what was done and what the user should know next.',
  ], { sessionId: payload.sessionId })

  const promptMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective: payload.objective,
        actions: payload.actions,
        results: payload.results,
        reflection: payload.reflection,
        followUp: payload.followUp,
        metrics: payload.metrics,
      }),
    },
  ]

  try {
    const invocation = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: promptMessages,
      source: 'intelligence-lab',
      stage: 'final-assistant-reply',
      sessionId: payload.sessionId,
    })
    const rawModelOutput = invocation.result.content.trim()
    if (!rawModelOutput) {
      throw new Error('Final response is empty.')
    }
    if (options?.onDelta) {
      for (const chunk of chunkForStream(rawModelOutput)) {
        await options.onDelta(chunk)
      }
    }
    return {
      message: rawModelOutput,
      providerId: invocation.context.provider.id,
      providerName: invocation.context.provider.name,
      model: invocation.result.model,
      traceId: invocation.result.traceId,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
      rawModelOutput: rawModelOutput || null,
      streamed: Boolean(options?.onDelta),
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Final response failed.')
  }
}

export async function generateIntelligenceLabFollowUp(
  event: H3Event,
  userId: string,
  payload: {
    objective: string
    reflection: string
    results: IntelligenceLabExecutionResult[]
    providerId?: string
    model?: string
    timeoutMs?: number
    sessionId?: string
  },
): Promise<{
  followUp: IntelligenceLabFollowUpPlan
  providerId: string
  providerName: string
  model: string
  traceId: string
  rawModelOutput: string | null
  fallbackCount: number
  retryCount: number
}> {
  const objective = payload.objective.trim()
  if (!objective) {
    throw new Error('Objective is required.')
  }

  const systemPrompt = await buildSystemPrompt(event, userId, [
    'You are TuffIntelligence follow-up planner.',
    'Return JSON only with shape:',
    '{"summary":"...","nextActions":["..."],"revisitInHours":24}',
    'Keep nextActions length between 2 and 5.',
  ], { sessionId: payload.sessionId })

  const promptMessages: IntelligenceMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective,
        reflection: payload.reflection,
        results: payload.results,
      }),
    },
  ]

  try {
    const invocation = await invokeModel(event, userId, {
      providerId: payload.providerId,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
      messages: promptMessages,
      source: 'intelligence-lab',
      stage: 'followup',
      sessionId: payload.sessionId,
    })
    const rawModelOutput = invocation.result.content
    const parsed = safeParseJson<Partial<IntelligenceLabFollowUpPlan>>(
      sanitizeJsonContent(rawModelOutput),
    )
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : ''
    const nextActions = Array.isArray(parsed?.nextActions)
      ? parsed.nextActions
          .map(item => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : []
    const revisitInHours = typeof parsed?.revisitInHours === 'number' && Number.isFinite(parsed.revisitInHours)
      ? Math.min(Math.max(Math.round(parsed.revisitInHours), 1), 168)
      : 0

    if (!summary || nextActions.length <= 0 || revisitInHours <= 0) {
      throw new Error('Follow-up output invalid.')
    }
    const followUp: IntelligenceLabFollowUpPlan = {
      summary,
      nextActions,
      revisitInHours,
    }

    return {
      followUp,
      providerId: invocation.context.provider.id,
      providerName: invocation.context.provider.name,
      model: invocation.result.model,
      traceId: invocation.result.traceId,
      rawModelOutput: rawModelOutput || null,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Follow-up generation failed.')
  }
}

export async function orchestrateIntelligenceLabStream(
  event: H3Event,
  userId: string,
  payload: {
    message?: string
    sessionId?: string
    history?: unknown
    timeoutMs?: number
    heartbeatTimeoutMs?: number
  },
  options?: {
    emit?: (event: IntelligenceLabStreamEvent) => void | Promise<void>
    isDisconnected?: () => boolean
  },
): Promise<IntelligenceLabOrchestrationResult> {
  const incomingMessage = typeof payload.message === 'string' ? payload.message.trim() : ''
  const sessionId = payload.sessionId?.trim() || createId('session')
  const heartbeatTimeoutMs = Math.max(10_000, payload.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS)
  const startedAt = now()
  const runId = createId('run')
  let streamEventCount = 0
  let historyMessages = normalizeMessages(payload.history)
  let objective = incomingMessage

  let actions: IntelligenceLabAction[] = []
  let mergedResults: IntelligenceLabExecutionResult[] = []
  let reflectionSummary = ''
  let followUpPlan: IntelligenceLabFollowUpPlan = {
    summary: '',
    nextActions: [],
    revisitInHours: 24,
  }
  let activeProviderId = ''
  let activeProviderName = ''
  let activeModel = ''
  let activeTraceId = ''
  let totalFallbackCount = 0
  let totalRetryCount = 0
  let actionNarratives: Record<string, string> = {}
  let actionNarrativesRawModelOutput: string | null = null

  if (!objective) {
    throw new Error('Message is required.')
  }

  await upsertRuntimeSession(event, {
    sessionId,
    userId,
    runId,
    status: 'planning',
    phase: 'planning',
    objective,
    history: historyMessages,
    pauseReason: null,
    lastHeartbeatAt: new Date().toISOString(),
  })

  const emit = async (
    eventItem: Omit<IntelligenceLabStreamEvent, 'timestamp' | 'contractVersion' | 'engine' | 'runId' | 'seq' | 'phase'> & {
      timestamp?: number
      phase?: string
    },
    optionsExt?: {
      status?: TuffIntelligenceRuntimeStatus
      checkpointState?: RuntimeCheckpointState
    },
  ) => {
    const phase = eventItem.phase || 'orchestration'
    const envelopeBase: IntelligenceLabStreamEvent = {
      ...eventItem,
      contractVersion: STREAM_CONTRACT_VERSION,
      engine: STREAM_ENGINE,
      runId,
      phase,
      sessionId,
      timestamp: eventItem.timestamp ?? now(),
    }

    const trace = await appendRuntimeTraceEvent(event, {
      sessionId,
      userId,
      runId,
      eventType: envelopeBase.type,
      phase,
      traceId: envelopeBase.traceId,
      payload: envelopeBase as unknown as Record<string, unknown>,
      status: optionsExt?.status,
    })
    streamEventCount += 1
    envelopeBase.seq = trace.seq

    if (optionsExt?.checkpointState) {
      await saveRuntimeCheckpoint(event, {
        sessionId,
        userId,
        runId,
        seq: trace.seq,
        phase,
        state: optionsExt.checkpointState,
      })
    }

    try {
      await options?.emit?.(envelopeBase)
    } catch {
      // disconnected client should not break persistence path
    }
  }

  const formatModelErrorDetail = (error: unknown): Record<string, unknown> => {
    if (error instanceof Error) {
      const detail: Record<string, unknown> = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: (error as { cause?: unknown }).cause,
      }
      const extra = error as unknown as Record<string, unknown>
      for (const key of Object.keys(extra)) {
        if (!(key in detail)) {
          detail[key] = extra[key]
        }
      }
      return detail
    }
    if (error && typeof error === 'object') {
      return { ...error as Record<string, unknown> }
    }
    return { message: String(error || 'unknown error') }
  }

  const abortWithModelFailure = async (
    stage: string,
    error: unknown,
    phase: string,
  ): Promise<IntelligenceLabOrchestrationResult> => {
    const errorDetail = formatModelErrorDetail(error)
    const checkpointState = buildCheckpointState({
      objective,
      history: historyMessages,
      actions,
      results: mergedResults,
      reflection: reflectionSummary || undefined,
      followUp: followUpPlan.summary ? followUpPlan : undefined,
      providerId: activeProviderId || undefined,
      providerName: activeProviderName || undefined,
      model: activeModel || undefined,
      traceId: activeTraceId || undefined,
      startedAt,
    })
    const actionStats = computeActionStats(mergedResults)
    const metrics: IntelligenceLabRuntimeMetrics = {
      sessionId,
      status: 'failed',
      totalActions: Math.max(actions.length, actionStats.totalActions),
      completedActions: actionStats.completedActions,
      failedActions: Math.max(actionStats.failedActions, 1),
      waitingApprovals: actionStats.waitingApprovals,
      approvalHitCount: actionStats.waitingApprovals,
      fallbackCount: totalFallbackCount,
      retryCount: totalRetryCount,
      streamEventCount,
      durationMs: now() - startedAt,
      toolFailureDistribution: buildToolFailureDistribution(mergedResults),
      generatedAt: new Date().toISOString(),
    }

    await emit({
      type: 'error',
      message: `model_failed:${stage}`,
      payload: {
        i18nKey: 'dashboard.intelligenceLab.system.modelFailed',
        i18nParams: { stage },
        stage,
        error: errorDetail,
      },
      phase,
    }, {
      status: 'failed',
      checkpointState,
    })

    await emit({
      type: 'run.metrics',
      payload: metrics as unknown as Record<string, unknown>,
      phase: 'metrics',
    }, {
      status: 'failed',
      checkpointState,
    })

    await emit({
      type: 'done',
      message: '',
      phase: 'done',
    }, {
      status: 'failed',
      checkpointState,
    })

    try {
      await createAudit(event, {
        userId,
        providerId: activeProviderId || 'runtime',
        providerType: 'runtime',
        model: activeModel || 'runtime',
        endpoint: null,
        status: 500,
        latency: metrics.durationMs,
        success: false,
        errorMessage: `intelligence-lab-runtime model_failed:${stage}`,
        traceId: activeTraceId || null,
        metadata: {
          source: 'intelligence-lab-runtime',
          sessionId,
          status: metrics.status,
          stage,
          durationMs: metrics.durationMs,
          error: errorDetail,
          totalActions: metrics.totalActions,
          completedActions: metrics.completedActions,
          failedActions: metrics.failedActions,
          waitingApprovals: metrics.waitingApprovals,
          fallbackCount: metrics.fallbackCount,
          retryCount: metrics.retryCount,
        },
      })
    } catch {
      // ignore audit failures
    }

    await upsertRuntimeSession(event, {
      sessionId,
      userId,
      runId,
      status: 'failed',
      phase,
      objective,
      history: historyMessages,
      state: checkpointState,
      pauseReason: null,
    })

    return {
      sessionId,
      objective,
      actions,
      results: mergedResults,
      reflection: reflectionSummary,
      followUp: followUpPlan,
      metrics,
      providerId: activeProviderId || 'runtime',
      providerName: activeProviderName || 'runtime',
      model: activeModel || 'runtime',
      traceId: activeTraceId || '',
    }
  }

  const resolvePauseReason = async (): Promise<TuffIntelligencePauseReason | null> => {
    if (options?.isDisconnected?.()) {
      return 'client_disconnect'
    }
    const sessionSnapshot = await getRuntimeSession(event, userId, sessionId)
    if (sessionSnapshot?.status === 'paused_disconnect') {
      return sessionSnapshot.pauseReason || 'manual_pause'
    }
    const heartbeatState = await shouldPauseByHeartbeat(event, {
      sessionId,
      userId,
      timeoutMs: heartbeatTimeoutMs,
    })
    if (heartbeatState.shouldPause) {
      return 'heartbeat_timeout'
    }
    return null
  }

  const pauseAndReturn = async (
    pauseReason: TuffIntelligencePauseReason,
  ): Promise<IntelligenceLabOrchestrationResult> => {
    const pauseI18nKey = pauseReason === 'client_disconnect' || pauseReason === 'heartbeat_timeout'
      ? 'dashboard.intelligenceLab.system.pausedNetwork'
      : 'dashboard.intelligenceLab.system.pausedManual'
    await markRuntimeSessionPaused(event, {
      sessionId,
      userId,
      pauseReason,
    })

    const checkpointState = buildCheckpointState({
      objective,
      history: historyMessages,
      actions,
      results: mergedResults,
      reflection: reflectionSummary || undefined,
      followUp: followUpPlan.summary ? followUpPlan : undefined,
      providerId: activeProviderId || undefined,
      providerName: activeProviderName || undefined,
      model: activeModel || undefined,
      traceId: activeTraceId || undefined,
      startedAt,
    })

    const actionStats = computeActionStats(mergedResults)
    const metrics: IntelligenceLabRuntimeMetrics = {
      sessionId,
      status: 'paused_disconnect',
      totalActions: Math.max(actions.length, actionStats.totalActions),
      completedActions: actionStats.completedActions,
      failedActions: actionStats.failedActions,
      waitingApprovals: actionStats.waitingApprovals,
      approvalHitCount: actionStats.waitingApprovals,
      fallbackCount: totalFallbackCount,
      retryCount: totalRetryCount,
      streamEventCount,
      durationMs: now() - startedAt,
      toolFailureDistribution: buildToolFailureDistribution(mergedResults),
      generatedAt: new Date().toISOString(),
    }

    await emit({
      type: 'session.paused',
      message: '',
      payload: {
        pauseReason,
        i18nKey: pauseI18nKey,
        i18nParams: {},
      },
      phase: 'pause',
    }, {
      status: 'paused_disconnect',
      checkpointState,
    })

    await emit({
      type: 'run.metrics',
      payload: metrics as unknown as Record<string, unknown>,
      phase: 'metrics',
    }, {
      status: 'paused_disconnect',
      checkpointState,
    })

    await emit({
      type: 'done',
      message: 'Session paused. Resume when connection is stable.',
      phase: 'done',
    }, {
      status: 'paused_disconnect',
      checkpointState,
    })

    try {
      await createAudit(event, {
        userId,
        providerId: activeProviderId || 'runtime',
        providerType: 'runtime',
        model: activeModel || 'runtime',
        endpoint: null,
        status: 206,
        latency: metrics.durationMs,
        success: false,
        errorMessage: 'intelligence-lab-runtime paused_disconnect',
        traceId: activeTraceId || null,
        metadata: {
          source: 'intelligence-lab-runtime',
          sessionId,
          status: metrics.status,
          totalActions: metrics.totalActions,
          completedActions: metrics.completedActions,
          failedActions: metrics.failedActions,
          waitingApprovals: metrics.waitingApprovals,
          approvalHitCount: metrics.approvalHitCount,
          fallbackCount: metrics.fallbackCount,
          retryCount: metrics.retryCount,
          streamEventCount: metrics.streamEventCount,
          toolFailureDistribution: metrics.toolFailureDistribution,
          durationMs: metrics.durationMs,
          pauseReason,
          disconnectPaused: true,
          checkpointLossCount: 0,
        },
      })
    } catch {
      // ignore runtime audit persistence errors in stream mode
    }

    await upsertRuntimeSession(event, {
      sessionId,
      userId,
      runId,
      status: 'paused_disconnect',
      phase: 'pause',
      objective,
      history: historyMessages,
      state: checkpointState,
      pauseReason,
    })

    return {
      sessionId,
      objective,
      actions,
      results: mergedResults,
      reflection: reflectionSummary,
      followUp: followUpPlan,
      metrics,
      providerId: activeProviderId || 'runtime',
      providerName: activeProviderName || 'runtime',
      model: activeModel || 'runtime',
      traceId: activeTraceId || '',
    }
  }

  const pauseBeforePlan = await resolvePauseReason()
  if (pauseBeforePlan) {
    return await pauseAndReturn(pauseBeforePlan)
  }

  await emit({
    type: 'status',
    message: '',
    payload: {
      i18nKey: 'dashboard.intelligenceLab.system.planningStart',
      i18nParams: {},
      kind: 'phase_change',
      mode: 'start',
      from: 'idle',
      to: 'planning',
    },
    phase: 'planning',
  }, {
    status: 'planning',
  })

  let intentResult: Awaited<ReturnType<typeof analyzeIntentWithModel>>
  try {
    intentResult = await analyzeIntentWithModel(event, userId, {
      objective,
      history: historyMessages,
      providerId: activeProviderId || undefined,
      model: activeModel || undefined,
      timeoutMs: payload.timeoutMs,
      sessionId,
    })
  } catch (error) {
    return await abortWithModelFailure('intent-analysis', error, 'planning')
  }
  totalFallbackCount += intentResult.fallbackCount
  totalRetryCount += intentResult.retryCount
  if (intentResult.providerId && intentResult.providerId !== 'fallback') {
    activeProviderId = intentResult.providerId
  }
  if (intentResult.providerName && intentResult.providerName !== 'fallback') {
    activeProviderName = intentResult.providerName
  }
  if (intentResult.model && intentResult.model !== 'fallback') {
    activeModel = intentResult.model
  }
  if (intentResult.traceId) {
    activeTraceId = intentResult.traceId
  }

  for (const [index, line] of intentResult.analysis.lines.entries()) {
    await emit({
      type: 'status',
      message: line,
      payload: {
        kind: 'intent_analysis',
        index: index + 1,
        total: intentResult.analysis.lines.length,
        objective,
        providerId: intentResult.providerId,
        providerName: intentResult.providerName,
        model: intentResult.model,
        traceId: intentResult.traceId,
        rawModelOutput: intentResult.rawModelOutput,
      },
      phase: 'planning',
    }, {
      status: 'planning',
    })
  }

  let plan:
    | {
      objective: string
      actions: IntelligenceLabAction[]
      providerId: string
      providerName: string
      model: string
      traceId: string
      rawModelOutput: string | null
      fallbackCount: number
      retryCount: number
    }
    | undefined

  if (actions.length > 0) {
    plan = {
      objective,
      actions,
      providerId: activeProviderId,
      providerName: activeProviderName,
      model: activeModel,
      traceId: activeTraceId,
      rawModelOutput: null,
      fallbackCount: 0,
      retryCount: 0,
    }
  } else {
    try {
      plan = await planIntelligenceLab(event, userId, {
        objective,
        context: {
          history: historyMessages,
        },
        timeoutMs: payload.timeoutMs,
        sessionId,
      })
    } catch (error) {
      return await abortWithModelFailure('planner', error, 'planning')
    }
    actions = plan.actions
    totalFallbackCount += plan.fallbackCount
    totalRetryCount += plan.retryCount
    activeProviderId = plan.providerId
    activeProviderName = plan.providerName
    activeModel = plan.model
    activeTraceId = plan.traceId
  }

  await emit({
    type: 'plan.created',
    traceId: plan.traceId,
    payload: {
      actions: plan.actions,
      providerId: plan.providerId,
      providerName: plan.providerName,
      model: plan.model,
      rawModelOutput: plan.rawModelOutput,
      fallbackCount: totalFallbackCount,
      retryCount: totalRetryCount,
    },
    phase: 'planning',
  }, {
    status: 'executing',
    checkpointState: buildCheckpointState({
      objective,
      history: historyMessages,
      actions,
      results: mergedResults,
      providerId: plan.providerId,
      providerName: plan.providerName,
      model: plan.model,
      traceId: plan.traceId,
      startedAt,
    }),
  })

  let narrativeResult: Awaited<ReturnType<typeof explainActionNarrativesWithModel>>
  try {
    narrativeResult = await explainActionNarrativesWithModel(event, userId, {
      objective,
      actions,
      providerId: activeProviderId || plan.providerId,
      model: activeModel || plan.model,
      timeoutMs: payload.timeoutMs,
      sessionId,
    })
  } catch (error) {
    return await abortWithModelFailure('action-narratives', error, 'executing')
  }
  totalFallbackCount += narrativeResult.fallbackCount
  totalRetryCount += narrativeResult.retryCount
  actionNarratives = narrativeResult.narratives
  actionNarrativesRawModelOutput = narrativeResult.rawModelOutput

  await emit({
    type: 'status',
    message: '',
    payload: {
      i18nKey: 'dashboard.intelligenceLab.system.executingStart',
      i18nParams: {},
      kind: 'phase_change',
      from: 'planning',
      to: 'executing',
      totalActions: actions.length,
    },
    phase: 'executing',
  }, {
    status: 'executing',
  })

  const completedActionIds = new Set(mergedResults.map(item => item.actionId))
  const remainingActions = actions.filter(action => !completedActionIds.has(action.id))
  if (remainingActions.length > 0) {
    let execution: Awaited<ReturnType<typeof executeIntelligenceLab>>
    try {
      execution = await executeIntelligenceLab(
        event,
        userId,
        {
          objective,
          actions: remainingActions,
          providerId: plan.providerId,
          model: plan.model,
          timeoutMs: payload.timeoutMs,
          continueOnError: true,
          sessionId,
        },
        {
          onActionStart: async (action, context) => {
            const llmNarrative = actionNarratives[action.id]
            if (!llmNarrative) {
              const narrativeError = new Error(`Action narrative missing for ${action.id}`)
              ;(narrativeError as { stage?: string }).stage = 'action-narratives'
              throw narrativeError
            }
            await emit({
              type: 'status',
              message: llmNarrative,
              payload: {
                kind: 'action_selection',
                index: context.index,
                total: context.total,
                action,
                rawModelOutput: actionNarrativesRawModelOutput,
              },
              phase: 'executing',
            }, {
              status: 'executing',
            })
          },
          onStep: async (result, context) => {
            mergedResults.push(result)
            const currentAction = actions.find(item => item.id === result.actionId) || null
            let resultNarrative: Awaited<ReturnType<typeof summarizeActionResultWithModel>>
            try {
              resultNarrative = await summarizeActionResultWithModel(event, userId, {
                objective,
                action: currentAction,
                result,
                index: mergedResults.length,
                total: actions.length,
                providerId: activeProviderId || plan.providerId,
                model: activeModel || plan.model,
                timeoutMs: payload.timeoutMs,
                sessionId,
              })
            } catch (error) {
              const commentaryError = error instanceof Error ? error : new Error('Action result commentary failed.')
              ;(commentaryError as { stage?: string }).stage = 'action-result-commentary'
              throw commentaryError
            }
            const statusMessage = resultNarrative.rawModelOutput || resultNarrative.message
            await emit({
              type: 'status',
              message: statusMessage,
              payload: {
                kind: 'action_result',
                index: mergedResults.length,
                total: actions.length,
                actionId: result.actionId,
                title: result.title,
                type: result.type,
                toolId: result.toolId,
                status: result.status,
                error: result.error,
                rawModelOutput: resultNarrative.rawModelOutput,
              },
              phase: 'executing',
            }, {
              status: result.status === 'waiting_approval' ? 'waiting_approval' : 'executing',
            })
            await emit({
              type: 'execution.step',
              payload: {
                result,
                index: mergedResults.length,
                total: actions.length,
                fallbackCount: context.fallbackCount + totalFallbackCount,
                retryCount: context.retryCount + totalRetryCount,
              },
              phase: 'executing',
            }, {
              status: result.status === 'waiting_approval' ? 'waiting_approval' : 'executing',
              checkpointState: buildCheckpointState({
                objective,
                history: historyMessages,
                actions,
                results: mergedResults,
                providerId: activeProviderId || plan.providerId,
                providerName: activeProviderName || plan.providerName,
                model: activeModel || plan.model,
                traceId: activeTraceId || plan.traceId,
                startedAt,
              }),
            })

            if (result.status === 'waiting_approval' && result.approvalTicket) {
              await emit({
                type: 'tool.approval_required',
                payload: {
                  ticket: result.approvalTicket,
                  actionId: result.actionId,
                  title: result.title,
                },
                phase: 'approval',
              }, {
                status: 'waiting_approval',
              })
            }
          },
          shouldPause: async () => {
            const reason = await resolvePauseReason()
            return reason ? { paused: true, reason } : { paused: false }
          },
        },
      )
    } catch (error) {
      const stage = (error as { stage?: string }).stage || 'execution'
      return await abortWithModelFailure(stage, error, 'executing')
    }

    totalFallbackCount += execution.fallbackCount
    totalRetryCount += execution.retryCount
    activeProviderId = execution.providerId || activeProviderId
    activeProviderName = execution.providerName || activeProviderName
    activeModel = execution.model || activeModel
    activeTraceId = execution.traceId || activeTraceId

    if (execution.paused) {
      return await pauseAndReturn(execution.pauseReason || 'client_disconnect')
    }
  }

  const pauseBeforeReflect = await resolvePauseReason()
  if (pauseBeforeReflect) {
    return await pauseAndReturn(pauseBeforeReflect)
  }

  await emit({
    type: 'status',
    message: '',
    payload: {
      i18nKey: 'dashboard.intelligenceLab.system.reflectingStart',
      i18nParams: {},
      kind: 'phase_change',
      from: 'executing',
      to: 'reflecting',
    },
    phase: 'reflecting',
  }, {
    status: 'reflecting',
  })

  let reflection: Awaited<ReturnType<typeof reflectIntelligenceLab>>
  try {
    reflection = await reflectIntelligenceLab(event, userId, {
      objective,
      actions,
      results: mergedResults,
      providerId: activeProviderId || plan.providerId,
      model: activeModel || plan.model,
      timeoutMs: payload.timeoutMs,
      sessionId,
    })
  } catch (error) {
    return await abortWithModelFailure('reflection', error, 'reflecting')
  }
  reflectionSummary = reflection.summary
  totalFallbackCount += reflection.fallbackCount
  totalRetryCount += reflection.retryCount
  activeProviderId = reflection.providerId || activeProviderId
  activeProviderName = reflection.providerName || activeProviderName
  activeModel = reflection.model || activeModel
  activeTraceId = reflection.traceId || activeTraceId

  await emit({
    type: 'reflection.completed',
    traceId: reflection.traceId,
    payload: {
      summary: reflection.summary,
      providerId: reflection.providerId,
      providerName: reflection.providerName,
      model: reflection.model,
      rawModelOutput: reflection.rawModelOutput,
    },
    phase: 'reflecting',
  }, {
    status: 'reflecting',
    checkpointState: buildCheckpointState({
      objective,
      history: historyMessages,
      actions,
      results: mergedResults,
      reflection: reflectionSummary,
      providerId: activeProviderId,
      providerName: activeProviderName,
      model: activeModel,
      traceId: activeTraceId,
      startedAt,
    }),
  })

  const pauseBeforeFollowUp = await resolvePauseReason()
  if (pauseBeforeFollowUp) {
    return await pauseAndReturn(pauseBeforeFollowUp)
  }

  let followUpResult: Awaited<ReturnType<typeof generateIntelligenceLabFollowUp>>
  try {
    followUpResult = await generateIntelligenceLabFollowUp(event, userId, {
      objective,
      reflection: reflection.summary,
      results: mergedResults,
      providerId: reflection.providerId || activeProviderId,
      model: reflection.model || activeModel,
      timeoutMs: payload.timeoutMs,
      sessionId,
    })
  } catch (error) {
    return await abortWithModelFailure('followup', error, 'reflecting')
  }
  followUpPlan = followUpResult.followUp
  totalFallbackCount += followUpResult.fallbackCount
  totalRetryCount += followUpResult.retryCount
  activeProviderId = followUpResult.providerId || activeProviderId
  activeProviderName = followUpResult.providerName || activeProviderName
  activeModel = followUpResult.model || activeModel
  activeTraceId = followUpResult.traceId || activeTraceId

  await emit({
    type: 'followup.created',
    traceId: followUpResult.traceId,
    payload: {
      ...followUpResult.followUp,
      rawModelOutput: followUpResult.rawModelOutput,
    } as unknown as Record<string, unknown>,
    phase: 'followup',
  }, {
    status: 'reflecting',
    checkpointState: buildCheckpointState({
      objective,
      history: historyMessages,
      actions,
      results: mergedResults,
      reflection: reflectionSummary,
      followUp: followUpPlan,
      providerId: activeProviderId,
      providerName: activeProviderName,
      model: activeModel,
      traceId: activeTraceId,
      startedAt,
    }),
  })

  const actionStats = computeActionStats(mergedResults)
  const status: IntelligenceLabRuntimeMetrics['status'] = actionStats.waitingApprovals > 0
    ? 'waiting_approval'
    : actionStats.failedActions > 0
      ? 'failed'
      : 'completed'

  const metricsBeforeFinalReply: IntelligenceLabRuntimeMetrics = {
    sessionId,
    status,
    totalActions: Math.max(actions.length, actionStats.totalActions),
    completedActions: actionStats.completedActions,
    failedActions: actionStats.failedActions,
    waitingApprovals: actionStats.waitingApprovals,
    approvalHitCount: actionStats.waitingApprovals,
    fallbackCount: totalFallbackCount,
    retryCount: totalRetryCount,
    streamEventCount,
    durationMs: now() - startedAt,
    toolFailureDistribution: buildToolFailureDistribution(mergedResults),
    generatedAt: new Date().toISOString(),
  }

  await emit({
    type: 'status',
    message: '',
    payload: {
      i18nKey: 'dashboard.intelligenceLab.system.finalStreamStart',
      i18nParams: {},
      kind: 'final_response_stream',
      objective,
      status,
      providerId: activeProviderId || plan.providerId,
      providerName: activeProviderName || plan.providerName,
      model: activeModel || plan.model,
      totalActions: actionStats.totalActions,
    },
    phase: 'assistant',
  }, {
    status: toRuntimeStatus(status),
  })

  let finalReply: Awaited<ReturnType<typeof buildFinalAssistantReplyWithModel>>
  try {
    finalReply = await buildFinalAssistantReplyWithModel(event, userId, {
      objective,
      actions,
      results: mergedResults,
      reflection: reflectionSummary,
      followUp: followUpPlan,
      metrics: metricsBeforeFinalReply,
      providerId: activeProviderId || plan.providerId,
      model: activeModel || plan.model,
      timeoutMs: payload.timeoutMs,
      sessionId,
    }, {
      onDelta: async (delta) => {
        await emit({
          type: 'assistant.delta',
          payload: { delta },
          phase: 'assistant',
        }, {
          status: toRuntimeStatus(status),
        })
      },
    })
  } catch (error) {
    return await abortWithModelFailure('final-response', error, 'assistant')
  }
  totalFallbackCount += finalReply.fallbackCount
  totalRetryCount += finalReply.retryCount
  if (finalReply.providerId && finalReply.providerId !== 'fallback') {
    activeProviderId = finalReply.providerId
  }
  if (finalReply.providerName && finalReply.providerName !== 'fallback') {
    activeProviderName = finalReply.providerName
  }
  if (finalReply.model && finalReply.model !== 'fallback') {
    activeModel = finalReply.model
  }
  if (finalReply.traceId) {
    activeTraceId = finalReply.traceId
  }

  const metrics: IntelligenceLabRuntimeMetrics = {
    sessionId,
    status,
    totalActions: Math.max(actions.length, actionStats.totalActions),
    completedActions: actionStats.completedActions,
    failedActions: actionStats.failedActions,
    waitingApprovals: actionStats.waitingApprovals,
    approvalHitCount: actionStats.waitingApprovals,
    fallbackCount: totalFallbackCount,
    retryCount: totalRetryCount,
    streamEventCount,
    durationMs: now() - startedAt,
    toolFailureDistribution: buildToolFailureDistribution(mergedResults),
    generatedAt: new Date().toISOString(),
  }

  try {
    await createAudit(event, {
      userId,
      providerId: activeProviderId || 'runtime',
      providerType: 'runtime',
      model: activeModel || 'runtime',
      endpoint: null,
      status: status === 'completed' ? 200 : status === 'waiting_approval' ? 202 : 500,
      latency: metrics.durationMs,
      success: status === 'completed',
      errorMessage: status === 'failed' ? 'intelligence-lab-runtime failed' : null,
      traceId: activeTraceId || null,
      metadata: {
        source: 'intelligence-lab-runtime',
        sessionId,
        status,
        totalActions: metrics.totalActions,
        completedActions: metrics.completedActions,
        failedActions: metrics.failedActions,
        waitingApprovals: metrics.waitingApprovals,
        approvalHitCount: metrics.approvalHitCount,
        fallbackCount: metrics.fallbackCount,
        retryCount: metrics.retryCount,
        streamEventCount: metrics.streamEventCount,
        toolFailureDistribution: metrics.toolFailureDistribution,
        durationMs: metrics.durationMs,
        pauseReason: null,
        disconnectPaused: false,
        checkpointLossCount: 0,
      },
    })
  } catch {
    // ignore runtime audit persistence errors in stream mode
  }

  const finalCheckpoint = buildCheckpointState({
    objective,
    history: historyMessages,
    actions,
    results: mergedResults,
    reflection: reflectionSummary,
    followUp: followUpPlan,
    providerId: activeProviderId,
    providerName: activeProviderName,
    model: activeModel,
    traceId: activeTraceId,
    startedAt,
  })

  await upsertRuntimeSession(event, {
    sessionId,
    userId,
    runId,
    status: toRuntimeStatus(status),
    phase: 'done',
    objective,
    history: historyMessages,
    state: finalCheckpoint,
    pauseReason: null,
  })

  await emit({
    type: 'run.metrics',
    payload: metrics as unknown as Record<string, unknown>,
    phase: 'metrics',
  }, {
    status: toRuntimeStatus(status),
    checkpointState: finalCheckpoint,
  })

  if (!finalReply.streamed) {
    for (const chunk of chunkForStream(finalReply.message)) {
      await emit({
        type: 'assistant.delta',
        payload: { delta: chunk },
        phase: 'assistant',
      }, {
        status: toRuntimeStatus(status),
      })
    }
  }

  await emit({
    type: 'done',
    message: 'TuffIntelligence orchestration completed.',
    phase: 'done',
  }, {
    status: toRuntimeStatus(status),
    checkpointState: finalCheckpoint,
  })

  return {
    sessionId,
    objective,
    actions,
    results: mergedResults,
    reflection: reflectionSummary,
    followUp: followUpPlan,
    metrics,
    providerId: activeProviderId || plan.providerId || 'runtime',
    providerName: activeProviderName || plan.providerName || 'runtime',
    model: activeModel || plan.model || 'runtime',
    traceId: activeTraceId || plan.traceId || '',
  }
}

export async function approveIntelligenceLabTool(
  payload: {
    approved: boolean
    ticket: TuffIntelligenceApprovalTicket
    reason?: string
  },
  context: ToolExecutionContext = {},
): Promise<{
  ticket: TuffIntelligenceApprovalTicket
  result?: IntelligenceLabExecutionResult
}> {
  const approved = Boolean(payload.approved)
  const ticket: TuffIntelligenceApprovalTicket = {
    ...payload.ticket,
    status: approved ? 'approved' : 'rejected',
    resolvedAt: now(),
    resolvedBy: 'admin',
    metadata: {
      ...(payload.ticket.metadata ?? {}),
      decisionReason: payload.reason,
    },
  }

  if (!approved) {
    return { ticket }
  }

  const deferredAction = asRecord(ticket.metadata?.deferredAction)
  const toolId = typeof deferredAction.toolId === 'string' ? deferredAction.toolId : ticket.toolId
  const input = asRecord(deferredAction.input)
  const output = await executeTool(toolId, input, context)
  return {
    ticket,
    result: {
      actionId: ticket.actionId || createId('action'),
      title: `Approved tool: ${toolId}`,
      type: 'tool',
      toolId,
      status: 'completed',
      output,
    },
  }
}

export function sanitizeLabActions(payload: unknown): IntelligenceLabAction[] {
  if (!Array.isArray(payload))
    return []
  return payload
    .map((item) => {
      const row = asRecord(item)
      const typeCandidate = String(row.type || '').trim().toLowerCase()
      const type: IntelligenceLabActionType
        = typeCandidate === 'tool' || typeCandidate === 'agent' ? typeCandidate : 'capability'
      const id = String(row.id || createId('action')).trim() || createId('action')
      const title = String(row.title || 'Untitled action').trim() || 'Untitled action'
      const input = asRecord(row.input)
      const riskLevel = normalizeRiskLevel(row.riskLevel)

      return {
        id,
        title,
        type,
        toolId: typeof row.toolId === 'string' ? row.toolId : undefined,
        agentId: typeof row.agentId === 'string' ? row.agentId : undefined,
        capabilityId: typeof row.capabilityId === 'string' ? row.capabilityId : undefined,
        input,
        riskLevel,
      } satisfies IntelligenceLabAction
    })
    .filter((action) => {
      if (action.type === 'tool')
        return Boolean(action.toolId)
      if (action.type === 'agent')
        return Boolean(action.agentId)
      return true
    })
}

export function sanitizeExecutionResults(payload: unknown): IntelligenceLabExecutionResult[] {
  if (!Array.isArray(payload))
    return []
  return payload
    .map((item) => {
      const row = asRecord(item)
      const statusRaw = String(row.status || 'completed').trim().toLowerCase()
      const status: IntelligenceLabExecutionResult['status']
        = statusRaw === 'failed' || statusRaw === 'waiting_approval' ? statusRaw : 'completed'
      const typeRaw = String(row.type || 'capability').trim().toLowerCase()
      const type: IntelligenceLabActionType
        = typeRaw === 'tool' || typeRaw === 'agent' ? typeRaw : 'capability'
      return {
        actionId: String(row.actionId || createId('action')),
        title: String(row.title || 'Action'),
        type,
        toolId: typeof row.toolId === 'string' ? row.toolId : undefined,
        status,
        output: row.output,
        error: typeof row.error === 'string' ? row.error : undefined,
        approvalTicket: row.approvalTicket as TuffIntelligenceApprovalTicket | undefined,
      } satisfies IntelligenceLabExecutionResult
    })
}

export function normalizeLabMessages(payload: unknown): IntelligenceMessage[] {
  return normalizeMessages(payload)
}
