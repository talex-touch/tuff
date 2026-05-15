import type {
  IntelligenceMessage,
  IntelligenceUsageInfo,
  TuffIntelligenceApprovalTicket,
} from '@talex-touch/tuff-intelligence'
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { createError, type H3Event } from 'h3'
import { getUserById } from './authStore'
import { consumeCredits } from './creditsStore'
import { resolveProviderBaseUrl } from './intelligenceModels'
import { invokeIntelligenceVisionOcr } from './intelligenceVisionOcrProvider'
import {
  getIntelligenceProviderApiKeyWithRegistryFallback,
  listIntelligenceProvidersWithRegistryMirrors,
} from './intelligenceProviderRegistryBridge'
import { recordProviderUsageLedger } from './providerUsageLedgerStore'
import type { SceneRunFallbackTrailItem, SceneRunResult, SceneRunTraceStep } from './sceneOrchestrator'
import {
  createAudit,
  getSettings,
  resolveCapabilityPromptTemplate as resolvePromptTemplateFromRegistry,
  savePromptBinding,
  savePromptRecord,
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
import {
  executeTool,
  normalizeLocaleCode,
  SUPPORTED_TOOL_IDS,
  type ToolExecutionContext,
} from './tuffIntelligenceLabTools'
import { listProviderRegistryEntries, type ProviderRegistryRecord } from './providerRegistryStore'

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
  continueOnError?: boolean
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
  usage?: IntelligenceUsageInfo
}

interface InvokeModelOptions {
  providerId?: string
  model?: string
  timeoutMs?: number
  source?: string
  stage?: string
  sessionId?: string
}

interface NexusInvokeOptions extends InvokeModelOptions {
  preferredProviderId?: string
  allowedProviderIds?: string[]
  modelPreference?: string[]
  metadata?: Record<string, unknown>
}

interface NexusInvokeAuditContext {
  source: string
  caller?: string
  sessionId?: string
  workflowId?: string
  workflowName?: string
  workflowRunId?: string
  workflowStepId?: string
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
  contractVersion?: 3
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
const OPENAI_CHAT_SUFFIXES = ['/chat/completions', '/completions']
const OPENAI_VERSION_SUFFIXES = ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']
const PLANNER_MAX_ACTIONS = 8
const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_PROVIDER_RETRY_COUNT = 1
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000
const STREAM_CONTRACT_VERSION = 3
const STREAM_ENGINE = 'intelligence'
const CREDITS_EXCEEDED_MESSAGES = new Set(['Team credits exceeded.', 'User credits exceeded.'])
const SUPPORTED_CAPABILITY_IDS = ['text.chat', 'content.extract'] as const
const AGENT_PROMPT_CAPABILITY = {
  intent: 'agent.intent',
  narrative: 'agent.narrative',
  runtimeCommentary: 'agent.runtime.commentary',
  plan: 'agent.plan',
  executeBootstrap: 'agent.execute.bootstrap',
  execute: 'agent.execute',
  reflect: 'agent.reflect',
  finalize: 'agent.finalize',
  followup: 'agent.followup',
} as const
const AGENT_PROMPT_DEFAULT_VERSION = '1.0.0'
const promptBootstrapCache = new Set<string>()
const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_RESPONSE_STATUS_CODE',
])
const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /timed\s*out/i,
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
  /temporar/i,
  /service\s*unavailable/i,
  /overloaded/i,
  /connection\s*reset/i,
  /network\s*error/i,
]

function now(): number {
  return Date.now()
}

async function resolveAgentPromptInstruction(
  event: H3Event,
  userId: string,
  capabilityId: string,
  fallback: string,
): Promise<string> {
  const normalizedFallback = fallback.trim()
  try {
    const template = await resolvePromptTemplateFromRegistry(event, userId, capabilityId)
    if (typeof template === 'string' && template.trim()) {
      return template.trim()
    }
  } catch {
    // ignore prompt registry resolve errors and fallback to defaults
  }

  const bootstrapKey = `${userId}:${capabilityId}`
  if (!promptBootstrapCache.has(bootstrapKey) && normalizedFallback) {
    promptBootstrapCache.add(bootstrapKey)
    const promptId = `${capabilityId}.default`
    const nowTs = Date.now()
    void savePromptRecord(event, userId, {
      id: promptId,
      version: AGENT_PROMPT_DEFAULT_VERSION,
      template: normalizedFallback,
      name: `${capabilityId} default prompt`,
      scope: 'capability',
      status: 'active',
      capabilityId,
      channel: 'stable',
      createdAt: nowTs,
      updatedAt: nowTs,
    }).catch(() => {
      promptBootstrapCache.delete(bootstrapKey)
    })
    void savePromptBinding(event, userId, {
      capabilityId,
      promptId,
      promptVersion: AGENT_PROMPT_DEFAULT_VERSION,
      channel: 'stable',
    }).catch(() => {
      promptBootstrapCache.delete(bootstrapKey)
    })
  }

  return fallback
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

function numberFrom(...candidates: unknown[]): number {
  for (const item of candidates) {
    if (typeof item === 'number' && Number.isFinite(item))
      return item
  }
  return 0
}

function extractUsageInfo(rawMessage: Record<string, unknown>): IntelligenceUsageInfo {
  const usageMetadata = asRecord(rawMessage.usage_metadata)
  const responseMetadata = asRecord(rawMessage.response_metadata)
  const tokenUsage = asRecord(responseMetadata.tokenUsage)

  const promptTokens = numberFrom(
    usageMetadata.input_tokens,
    usageMetadata.prompt_tokens,
    usageMetadata.promptTokens,
    tokenUsage.promptTokens,
    tokenUsage.prompt_tokens,
  )
  const completionTokens = numberFrom(
    usageMetadata.output_tokens,
    usageMetadata.completion_tokens,
    usageMetadata.completionTokens,
    tokenUsage.completionTokens,
    tokenUsage.completion_tokens,
  )
  const totalTokens = numberFrom(
    usageMetadata.total_tokens,
    usageMetadata.totalTokens,
    tokenUsage.totalTokens,
    tokenUsage.total_tokens,
    promptTokens + completionTokens,
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
}

function toLangChainMessages(messages: IntelligenceMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      return new SystemMessage(message.content)
    }
    if (message.role === 'assistant') {
      return new AIMessage(message.content)
    }
    return new HumanMessage(message.content)
  })
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function stripOpenAiEndpointSuffix(value: string): string {
  const trimmed = trimBaseUrl(value)
  const lower = trimmed.toLowerCase()
  for (const suffix of OPENAI_CHAT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return trimBaseUrl(trimmed.slice(0, -suffix.length))
    }
  }
  return trimmed
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = stripOpenAiEndpointSuffix(baseUrl)
  const lower = trimmed.toLowerCase()
  if (OPENAI_VERSION_SUFFIXES.some(suffix => lower.endsWith(suffix))) {
    return trimmed
  }
  return `${trimmed}/v1`
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = trimBaseUrl(baseUrl)
  if (trimmed.toLowerCase().endsWith('/v1')) {
    return trimmed.slice(0, -3)
  }
  return trimmed
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

function tryResolveHttpStatus(error: Error): number | null {
  const detail = error as unknown as Record<string, unknown>
  const directStatus = detail.status
  if (typeof directStatus === 'number' && Number.isFinite(directStatus))
    return directStatus

  const nestedResponse = asRecord(detail.response)
  if (typeof nestedResponse.status === 'number' && Number.isFinite(nestedResponse.status))
    return nestedResponse.status as number

  const cause = asRecord(detail.cause)
  if (typeof cause.status === 'number' && Number.isFinite(cause.status))
    return cause.status as number

  return null
}

export function isRetryableInvokeError(error: Error): boolean {
  const status = tryResolveHttpStatus(error)
  if (status !== null && RETRYABLE_HTTP_STATUS_CODES.has(status)) {
    return true
  }

  const detail = error as unknown as Record<string, unknown>
  const cause = asRecord(detail.cause)
  const codeValue = String(detail.code ?? cause.code ?? '').trim().toUpperCase()
  if (codeValue && RETRYABLE_ERROR_CODES.has(codeValue)) {
    return true
  }

  const message = String(error.message || '')
  return RETRYABLE_ERROR_PATTERNS.some(pattern => pattern.test(message))
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
      const continueOnError = row.continueOnError === true
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
          continueOnError,
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

const READ_ONLY_TOOL_HINTS = [
  'get',
  'list',
  'read',
  'fetch',
  'query',
  'summary',
  'snapshot',
  'status',
  'overview',
]

export function isReadOnlyTool(toolId: string): boolean {
  const normalized = toolId.toLowerCase()
  return READ_ONLY_TOOL_HINTS.some(hint => normalized.includes(hint))
}

export function shouldContinueOnActionFailure(
  action: IntelligenceLabAction,
  globalContinueOnError: boolean,
): boolean {
  if (globalContinueOnError)
    return true
  if (action.continueOnError !== true)
    return false
  if (action.type !== 'tool' || !action.toolId)
    return false

  const risk = resolveRiskLevel(action.toolId, action.riskLevel ?? 'medium')
  return risk === 'low' && isReadOnlyTool(action.toolId)
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
  const providers = await listIntelligenceProvidersWithRegistryMirrors(event, userId)
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

    const timeoutMs = Math.max(DEFAULT_TIMEOUT_MS, options.timeoutMs ?? provider.timeout ?? DEFAULT_TIMEOUT_MS)
    const apiKey = provider.type === IntelligenceProviderType.LOCAL
      ? null
      : await getIntelligenceProviderApiKeyWithRegistryFallback(event, userId, provider.id)
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
  const traceId = createId('trace')
  const startedAt = now()
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(
    resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
  )
  const endpoint = `${baseUrl}/chat/completions`

  try {
    const { ChatOpenAI } = await import('@langchain/openai') as { ChatOpenAI: any }

    const runner = new ChatOpenAI({
      apiKey: context.apiKey || 'tuff-local-key',
      model: context.model,
      temperature: 0.2,
      timeout: context.timeoutMs,
      configuration: { baseURL: baseUrl },
    })

    const response = await withTimeout(
      runner.invoke(toLangChainMessages(messages)),
      context.timeoutMs,
      `Request timeout after ${context.timeoutMs}ms`,
    )

    const content = extractText(asRecord(response).content).trim()
    if (!content) {
      throw createRequestError('Provider returned empty content.', {
        endpoint,
        status: 502,
        responseSnippet: JSON.stringify(asRecord(response)).slice(0, 400),
      })
    }

    return {
      content,
      model: context.model,
      traceId,
      endpoint: `langchain:${context.provider.type}:chat`,
      status: 200,
      latency: now() - startedAt,
      usage: extractUsageInfo(asRecord(response)),
    }
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error('Unknown provider error.')
    const detail = normalized as unknown as Record<string, unknown>
    if (typeof detail.endpoint !== 'string') {
      detail.endpoint = endpoint
    }
    throw normalized
  }
}

async function invokeAnthropicChat(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
): Promise<InvokeModelResult> {
  const traceId = createId('trace')
  const startedAt = now()
  const endpoint = `${normalizeAnthropicBaseUrl(
    resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
  )}/messages`

  try {
    const { ChatAnthropic } = await import('@langchain/anthropic') as { ChatAnthropic: any }

    const runner = new ChatAnthropic({
      anthropicApiKey: context.apiKey || '',
      model: context.model,
      maxTokens: 1200,
      timeout: context.timeoutMs,
      anthropicApiUrl: normalizeAnthropicBaseUrl(
        resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
      ),
      clientOptions: {
        baseURL: normalizeAnthropicBaseUrl(
          resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl)
        ),
      },
    })

    const response = await withTimeout(
      runner.invoke(toLangChainMessages(messages)),
      context.timeoutMs,
      `Request timeout after ${context.timeoutMs}ms`,
    )

    const content = extractText(asRecord(response).content).trim()
    if (!content) {
      throw createRequestError('Anthropic returned empty content.', {
        endpoint,
        status: 502,
        responseSnippet: JSON.stringify(asRecord(response)).slice(0, 400),
      })
    }

    return {
      content,
      model: context.model,
      traceId,
      endpoint: 'langchain:anthropic:chat',
      status: 200,
      latency: now() - startedAt,
      usage: extractUsageInfo(asRecord(response)),
    }
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error('Unknown provider error.')
    const detail = normalized as unknown as Record<string, unknown>
    if (typeof detail.endpoint !== 'string') {
      detail.endpoint = endpoint
    }
    throw normalized
  }
}

async function invokeLocalChat(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
): Promise<InvokeModelResult> {
  return await invokeOpenAiCompatibleChat(context, messages)
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
    let providerLastError: Error | null = null
    const maxAttempts = DEFAULT_PROVIDER_RETRY_COUNT + 1

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
      const providerAttempt = attemptIndex + 1
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
              source: payload.source || 'intelligence-agent',
              stage: payload.stage || 'invoke',
              sessionId: payload.sessionId,
              attempt: index + 1,
              providerAttempt,
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
        const retryable = isRetryableInvokeError(normalizedError)
        const hasRetryBudget = attemptIndex < maxAttempts - 1
        const willRetry = retryable && hasRetryBudget

        detail.attempt = index + 1
        detail.providerAttempt = providerAttempt
        detail.fallbackCandidate = index < contexts.length - 1
        detail.stage = payload.stage || 'invoke'
        detail.retryable = retryable
        detail.willRetry = willRetry

        providerLastError = normalizedError

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
              source: payload.source || 'intelligence-agent',
              stage: payload.stage || 'invoke',
              sessionId: payload.sessionId,
              attempt: index + 1,
              providerAttempt,
              fallbackCandidate: index < contexts.length - 1,
              retryable,
              willRetry,
            },
          })
        }

        if (willRetry) {
          retryCount += 1
          continue
        }
        break
      }
    }

    if (providerLastError) {
      lastError = providerLastError
      errors.push({
        providerId: context.provider.id,
        providerName: context.provider.name,
        message: providerLastError.message,
      })
      if (index < contexts.length - 1) {
        fallbackCount += 1
      }
    }
  }

  throw lastError ?? new Error('Failed to call all available intelligence providers.')
}

export async function probeIntelligenceLabProvider(
  event: H3Event,
  userId: string,
  payload: {
    providerId: string
    model?: string
    prompt?: string
    timeoutMs?: number
  },
): Promise<{
  success: boolean
  providerId: string
  providerName: string
  providerType: string
  model: string
  output: string
  latency: number
  endpoint: string
  traceId: string
  fallbackCount: number
  retryCount: number
  attemptedProviders: string[]
  message: string
}> {
  const prompt = typeof payload.prompt === 'string' && payload.prompt.trim()
    ? payload.prompt.trim()
    : 'Reply with "pong" and one short sentence describing your model capability.'
  const invocation = await invokeModel(event, userId, {
    providerId: payload.providerId,
    model: payload.model?.trim() || undefined,
    timeoutMs: payload.timeoutMs,
    messages: [
      {
        role: 'system',
        content: 'You are a Tuff Intelligence provider probe assistant. Keep the output concise.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    source: 'intelligence-provider-probe',
    stage: 'provider-probe',
  })

  return {
    success: true,
    providerId: invocation.context.provider.id,
    providerName: invocation.context.provider.name,
    providerType: invocation.context.provider.type,
    model: invocation.result.model,
    output: invocation.result.content,
    latency: invocation.result.latency,
    endpoint: invocation.result.endpoint,
    traceId: invocation.result.traceId,
    fallbackCount: invocation.fallbackCount,
    retryCount: invocation.retryCount,
    attemptedProviders: invocation.attemptedProviders,
    message: 'Probe completed.',
  }
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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => readOptionalString(item))
    .filter((item): item is string => Boolean(item))
}

function parseJsonObject<T extends Record<string, unknown>>(raw: string, fallback: T): T {
  const sanitized = sanitizeJsonContent(raw)
  const candidates = [
    sanitized,
    sanitized.includes('{') && sanitized.includes('}')
      ? sanitized.slice(sanitized.indexOf('{'), sanitized.lastIndexOf('}') + 1)
      : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return { ...fallback, ...(parsed as Partial<T>) }
    }
    catch {
      // Try the next candidate.
    }
  }
  return fallback
}

function toPromptPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

function buildCapabilityMessages(capabilityId: string, payload: unknown): IntelligenceMessage[] {
  const record = toPromptPayload(payload)

  if (capabilityId === 'text.chat' || capabilityId === 'chat.completion') {
    const messages = normalizeMessages(record.messages)
    if (messages.length <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'messages are required.' })
    }
    return messages
  }

  if (capabilityId === 'text.translate') {
    const text = readOptionalString(record.text)
    const targetLang = readOptionalString(record.targetLang)
    if (!text || !targetLang) {
      throw createError({ statusCode: 400, statusMessage: 'text and targetLang are required.' })
    }
    const sourceLang = readOptionalString(record.sourceLang) || 'auto'
    return [
      {
        role: 'system',
        content: `You are a professional translator. Translate from ${sourceLang} to ${targetLang}. Return only the translated text.`,
      },
      { role: 'user', content: text },
    ]
  }

  if (capabilityId === 'text.summarize') {
    const text = readOptionalString(record.text)
    if (!text) {
      throw createError({ statusCode: 400, statusMessage: 'text is required.' })
    }
    const style = readOptionalString(record.style) || 'concise'
    const maxLength = readOptionalNumber(record.maxLength)
    return [
      {
        role: 'system',
        content: `You are a summarization assistant. Style: ${style}.${maxLength ? ` Keep it under ${maxLength} characters.` : ''} Return only the summary.`,
      },
      { role: 'user', content: text },
    ]
  }

  if (capabilityId === 'text.rewrite') {
    const text = readOptionalString(record.text)
    if (!text) {
      throw createError({ statusCode: 400, statusMessage: 'text is required.' })
    }
    const preserveKeywords = readStringArray(record.preserveKeywords)
    return [
      {
        role: 'system',
        content: [
          `You are a writing assistant. Rewrite in a ${readOptionalString(record.style) || 'professional'} style with a ${readOptionalString(record.tone) || 'neutral'} tone.`,
          readOptionalString(record.targetAudience)
            ? `Target audience: ${readOptionalString(record.targetAudience)}.`
            : '',
          preserveKeywords.length ? `Preserve these keywords: ${preserveKeywords.join(', ')}.` : '',
          'Return only the rewritten text.',
        ].filter(Boolean).join(' '),
      },
      { role: 'user', content: text },
    ]
  }

  if (capabilityId === 'code.explain') {
    const code = readOptionalString(record.code)
    if (!code) {
      throw createError({ statusCode: 400, statusMessage: 'code is required.' })
    }
    return [
      {
        role: 'system',
        content: `You are a code explanation assistant. Explain ${readOptionalString(record.language) || 'the'} code at ${readOptionalString(record.targetAudience) || 'intermediate'} level with ${readOptionalString(record.depth) || 'detailed'} depth. Return JSON: {"explanation":"...","summary":"...","keyPoints":[],"complexity":"simple|moderate|complex","concepts":[]}.`,
      },
      { role: 'user', content: code },
    ]
  }

  if (capabilityId === 'code.review') {
    const code = readOptionalString(record.code)
    if (!code) {
      throw createError({ statusCode: 400, statusMessage: 'code is required.' })
    }
    const focusAreas = readStringArray(record.focusAreas)
    return [
      {
        role: 'system',
        content: `You are a code reviewer. Focus on ${focusAreas.length ? focusAreas.join(', ') : 'security, performance, style, bugs, best-practices'}. Return JSON: {"summary":"...","score":0,"issues":[],"improvements":[]}.`,
      },
      {
        role: 'user',
        content: readOptionalString(record.context)
          ? `Context:\n${readOptionalString(record.context)}\n\nCode:\n${code}`
          : code,
      },
    ]
  }

  throw createError({ statusCode: 400, statusMessage: `Unsupported capability: ${capabilityId}` })
}

function normalizeCapabilityId(capabilityId: unknown): string {
  if (typeof capabilityId !== 'string' || !capabilityId.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'capabilityId is required.' })
  }
  const normalized = capabilityId.trim()
  return normalized === 'chat.completion' ? 'text.chat' : normalized
}

function normalizeUsage(usage?: IntelligenceUsageInfo): IntelligenceUsageInfo {
  return {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  }
}

function normalizeTextResult(capabilityId: string, content: string): unknown {
  if (capabilityId === 'code.explain') {
    return parseJsonObject(content, {
      explanation: content,
      summary: '',
      keyPoints: [],
    })
  }
  if (capabilityId === 'code.review') {
    return parseJsonObject(content, {
      summary: content,
      score: 0,
      issues: [],
      improvements: [],
    })
  }
  return content
}

function resolveInvokeAuditContext(options: NexusInvokeOptions): NexusInvokeAuditContext {
  const metadata = options.metadata ?? {}
  const source = readOptionalString(metadata.source) || options.source || 'core-app'
  return {
    source,
    caller: readOptionalString(metadata.caller),
    sessionId: readOptionalString(metadata.sessionId) || options.sessionId,
    workflowId: readOptionalString(metadata.workflowId),
    workflowName: readOptionalString(metadata.workflowName),
    workflowRunId: readOptionalString(metadata.workflowRunId),
    workflowStepId: readOptionalString(metadata.workflowStepId),
  }
}

function buildInvokeCreditMetadata(
  invocation: NexusIntelligenceInvokeResult,
  usage: IntelligenceUsageInfo,
  audit: NexusInvokeAuditContext,
) {
  return {
    capabilityId: invocation.capabilityId,
    providerId: invocation.provider,
    providerName: invocation.metadata.providerName,
    providerType: invocation.metadata.providerType,
    model: invocation.model,
    traceId: invocation.traceId,
    tokens: usage.totalTokens,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    source: audit.source,
    caller: audit.caller,
    sessionId: audit.sessionId,
    workflowId: audit.workflowId,
    workflowName: audit.workflowName,
    workflowRunId: audit.workflowRunId,
    workflowStepId: audit.workflowStepId,
  }
}

function buildInvokeTrace(
  invocation: NexusIntelligenceInvokeResult,
  audit: NexusInvokeAuditContext,
  createdAt: string,
): SceneRunTraceStep[] {
  return [
    {
      phase: 'scene.load',
      status: 'success',
      at: createdAt,
      message: 'Nexus intelligence invoke audit context resolved.',
      metadata: {
        traceId: invocation.traceId,
        source: audit.source,
        caller: audit.caller ?? null,
        sessionId: audit.sessionId ?? null,
        workflowId: audit.workflowId ?? null,
        workflowName: audit.workflowName ?? null,
        workflowRunId: audit.workflowRunId ?? null,
        workflowStepId: audit.workflowStepId ?? null,
      },
    },
    {
      phase: 'adapter.dispatch',
      status: 'success',
      at: createdAt,
      message: 'Nexus intelligence capability invocation completed.',
      metadata: {
        capabilityId: invocation.capabilityId,
        providerId: invocation.provider,
        model: invocation.model,
        traceId: invocation.traceId,
        totalTokens: invocation.usage.totalTokens,
        latency: invocation.latency,
      },
    },
  ]
}

async function recordIntelligenceInvokeUsageLedger(
  event: H3Event,
  invocation: NexusIntelligenceInvokeResult,
  audit: NexusInvokeAuditContext,
): Promise<string[]> {
  const usage = normalizeUsage(invocation.usage)
  const createdAt = new Date().toISOString()
  const fallbackTrail: SceneRunFallbackTrailItem[] = invocation.metadata.attemptedProviders.map(providerId => ({
    providerId,
    capability: invocation.capabilityId,
    status: providerId === invocation.provider ? 'selected' : 'candidate',
  }))
  const run: SceneRunResult = {
    runId: `intelligence_invoke_${invocation.traceId}`,
    sceneId: 'nexus.intelligence.invoke',
    status: 'completed',
    mode: 'execute',
    strategyMode: 'priority',
    requestedCapabilities: [invocation.capabilityId],
    selected: [
      {
        providerId: invocation.provider,
        providerName: invocation.metadata.providerName || invocation.provider,
        vendor: invocation.metadata.providerType || 'unknown',
        capability: invocation.capabilityId,
        priority: 0,
        weight: null,
        bindingId: `intelligence:${invocation.provider}`,
        authRef: null,
        endpoint: null,
        region: null,
      },
    ],
    candidates: [],
    fallbackTrail,
    trace: buildInvokeTrace(invocation, audit, createdAt),
    usage: [
      {
        unit: 'token',
        quantity: usage.totalTokens,
        billable: usage.totalTokens > 0,
        providerId: invocation.provider,
        capability: invocation.capabilityId,
        estimated: false,
        providerUsageRef: invocation.traceId,
      },
    ],
    output: null,
  }

  try {
    const entries = await recordProviderUsageLedger(event, run)
    return entries.map(entry => entry.id)
  }
  catch (error) {
    console.warn('[tuffIntelligenceLabService] Failed to record intelligence invoke usage ledger', error)
    return []
  }
}

function isCreditsExceededError(error: unknown): error is Error {
  return error instanceof Error && CREDITS_EXCEEDED_MESSAGES.has(error.message)
}

async function consumeIntelligenceInvokeCredits(
  event: H3Event,
  userId: string,
  invocation: NexusIntelligenceInvokeResult,
  audit: NexusInvokeAuditContext,
): Promise<NexusIntelligenceInvokeResult['metadata']['billing']> {
  const usage = normalizeUsage(invocation.usage)
  const tokens = usage.totalTokens
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return {
      chargedCredits: 0,
      unit: 'token',
      billable: false,
      reason: 'intelligence-invoke',
    }
  }

  try {
    const consumption = await consumeCredits(
      event,
      userId,
      tokens,
      'intelligence-invoke',
      buildInvokeCreditMetadata(invocation, usage, audit),
    )
    return {
      ledgerId: consumption.ledgerId,
      chargedCredits: consumption.amount,
      unit: 'token',
      billable: true,
      reason: 'intelligence-invoke',
    }
  } catch (error) {
    if (isCreditsExceededError(error)) {
      throw createError({
        statusCode: 402,
        statusMessage: 'CREDITS_EXCEEDED',
        data: {
          code: 'CREDITS_EXCEEDED',
          reason: error.message,
        },
      })
    }
    throw error
  }
}

function providerHasRegistryCapability(provider: ProviderRegistryRecord, capability: string): boolean {
  return provider.capabilities.some(item => item.capability === capability)
}

async function resolveVisionOcrProvider(
  event: H3Event,
  userId: string,
  providerId?: string,
): Promise<ProviderRegistryRecord> {
  const entries = await listProviderRegistryEntries(event)
  const providers = entries
    .filter(provider => provider.status === 'enabled')
    .filter(provider => provider.ownerScope === 'system' || provider.ownerId === userId)
    .filter(provider => providerHasRegistryCapability(provider, 'vision.ocr'))
    .filter(provider => provider.metadata?.source === 'intelligence')

  const selected = providerId
    ? providers.find((provider) => {
        const intelligenceProviderId = readOptionalString(provider.metadata?.intelligenceProviderId)
        return provider.id === providerId || intelligenceProviderId === providerId
      })
    : providers.sort((a, b) => {
        const aPriority = readOptionalNumber(a.metadata?.priority) ?? 999
        const bPriority = readOptionalNumber(b.metadata?.priority) ?? 999
        return aPriority - bPriority
      })[0]

  if (!selected) {
    throw createError({
      statusCode: 409,
      statusMessage: providerId
        ? 'Target vision OCR provider not found.'
        : 'No enabled vision OCR provider is available.',
    })
  }
  return selected
}

export interface NexusIntelligenceInvokePayload {
  capabilityId: string
  payload?: unknown
  options?: NexusInvokeOptions
}

export interface NexusIntelligenceInvokeResult {
  capabilityId: string
  result: unknown
  usage: IntelligenceUsageInfo
  model: string
  latency: number
  traceId: string
  provider: string
  metadata: {
    nexus: true
    providerName?: string
    providerType?: string
    fallbackCount: number
    retryCount: number
    attemptedProviders: string[]
    source: string
    caller?: string
    sessionId?: string
    workflowId?: string
    workflowName?: string
    workflowRunId?: string
    workflowStepId?: string
    billing?: {
      ledgerId?: string
      chargedCredits: number
      unit: 'token'
      billable: boolean
      reason: 'intelligence-invoke'
    }
    providerUsageLedgerIds?: string[]
  }
}

export async function invokeIntelligenceCapability(
  event: H3Event,
  userId: string,
  request: NexusIntelligenceInvokePayload,
): Promise<NexusIntelligenceInvokeResult> {
  const capabilityId = normalizeCapabilityId(request.capabilityId)
  const options = request.options ?? {}
  const audit = resolveInvokeAuditContext(options)
  const model = options.model
    || (Array.isArray(options.modelPreference) ? readOptionalString(options.modelPreference[0]) : undefined)
  const providerId = options.providerId
    || options.preferredProviderId
    || undefined
  const timeoutMs = options.timeoutMs
    || readOptionalNumber(options.metadata?.timeout)

  if (capabilityId === 'vision.ocr') {
    const provider = await resolveVisionOcrProvider(event, userId, providerId)
    const startedAt = now()
    const ocr = await invokeIntelligenceVisionOcr(event, provider, request.payload)
    const result: NexusIntelligenceInvokeResult = {
      capabilityId,
      result: ocr.output,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: readOptionalString(provider.metadata?.defaultModel) || 'vision-ocr',
      latency: ocr.latencyMs || (now() - startedAt),
      traceId: ocr.providerRequestId || createId('trace'),
      provider: readOptionalString(provider.metadata?.intelligenceProviderId) || provider.id,
      metadata: {
        nexus: true,
        providerName: provider.displayName,
        providerType: readOptionalString(provider.metadata?.intelligenceType) || provider.vendor,
        fallbackCount: 0,
        retryCount: 0,
        attemptedProviders: [provider.id],
        source: audit.source,
        caller: audit.caller,
        sessionId: audit.sessionId,
        workflowId: audit.workflowId,
        workflowName: audit.workflowName,
        workflowRunId: audit.workflowRunId,
        workflowStepId: audit.workflowStepId,
      },
    }
    result.metadata.billing = await consumeIntelligenceInvokeCredits(event, userId, result, audit)
    result.metadata.providerUsageLedgerIds = await recordIntelligenceInvokeUsageLedger(
      event,
      result,
      audit,
    )
    return result
  }

  const messages = buildCapabilityMessages(capabilityId, request.payload)
  const invocation = await invokeModel(event, userId, {
    providerId,
    model,
    timeoutMs,
    messages,
    source: audit.source,
    stage: `capability:${capabilityId}`,
    sessionId: audit.sessionId,
  })

  const result: NexusIntelligenceInvokeResult = {
    capabilityId,
    result: normalizeTextResult(capabilityId, invocation.result.content),
    usage: normalizeUsage(invocation.result.usage),
    model: invocation.result.model,
    latency: invocation.result.latency,
    traceId: invocation.result.traceId,
    provider: invocation.context.provider.id,
    metadata: {
      nexus: true,
      providerName: invocation.context.provider.name,
      providerType: invocation.context.provider.type,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
      attemptedProviders: invocation.attemptedProviders,
      source: audit.source,
      caller: audit.caller,
      sessionId: audit.sessionId,
      workflowId: audit.workflowId,
      workflowName: audit.workflowName,
      workflowRunId: audit.workflowRunId,
      workflowStepId: audit.workflowStepId,
    },
  }
  result.metadata.billing = await consumeIntelligenceInvokeCredits(event, userId, result, audit)
  result.metadata.providerUsageLedgerIds = await recordIntelligenceInvokeUsageLedger(
    event,
    result,
    audit,
  )
  return result
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
  const intentInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.intent,
    'You are TuffIntelligence intent analyst.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    intentInstruction,
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
      source: 'intelligence-agent',
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

  const narrativeInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.narrative,
    'You are TuffIntelligence action explainer.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    narrativeInstruction,
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
      source: 'intelligence-agent',
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
  const runtimeCommentaryInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.runtimeCommentary,
    'You are TuffIntelligence runtime commentator.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    runtimeCommentaryInstruction,
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
      source: 'intelligence-agent',
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

export async function listIntelligenceLabProviders(event: H3Event, userId: string): Promise<{
  providers: IntelligenceProviderRecord[]
  defaultStrategy: string
}> {
  const [providers, settings] = await Promise.all([
    listIntelligenceProvidersWithRegistryMirrors(event, userId),
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

  const plannerInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.plan,
    'You are TuffIntelligence planner.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    plannerInstruction,
    'Return JSON array only.',
    `Allowed tools: ${SUPPORTED_TOOL_IDS.join(', ')}`,
    `Allowed capabilities: ${SUPPORTED_CAPABILITY_IDS.join(', ')}`,
    'Action schema: {"title":"...", "type":"tool|agent|capability", "toolId":"...", "agentId":"...", "capabilityId":"...", "input":{}, "riskLevel":"low|medium|high|critical", "continueOnError":false}',
    'continueOnError is allowed only for low-risk read-only tool actions.',
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
    source: 'intelligence-agent',
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
  const globalContinueOnError = Boolean(payload.continueOnError)
  let firstInvocation: InvokeModelWithFallbackResult
  try {
    const bootstrapInstruction = await resolveAgentPromptInstruction(
      event,
      userId,
      AGENT_PROMPT_CAPABILITY.executeBootstrap,
      'You are TuffIntelligence executor bootstrap. Reply with "ready".'
    )

    const bootstrapPrompt = await buildSystemPrompt(event, userId, [
      bootstrapInstruction,
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
      source: 'intelligence-agent',
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
    const continueOnActionFailure = shouldContinueOnActionFailure(action, globalContinueOnError)

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
        if (!continueOnActionFailure)
          break
        continue
      }

      const risk = resolveRiskLevel(toolId, action.riskLevel ?? 'medium')
      if (requiresApproval(risk)) {
        const approvalTicket: TuffIntelligenceApprovalTicket = {
          id: createId('approval'),
          sessionId: payload.sessionId || 'intelligence-agent',
          actionId: action.id,
          toolId,
          riskLevel: risk,
          reason: `Tool "${toolId}" requires approval in intelligence agent.`,
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
        if (!continueOnActionFailure)
          break
      }
      continue
    }

    const capabilityId = action.type === 'capability'
      ? String(action.capabilityId || 'text.chat')
      : 'text.chat'
    const defaultExecutionInstruction = action.type === 'agent'
      ? 'You are TuffIntelligence executor acting as a specialist agent. Return concise JSON.'
      : `You are TuffIntelligence executor for capability "${capabilityId}". Return concise JSON.`
    const executionInstruction = await resolveAgentPromptInstruction(
      event,
      userId,
      AGENT_PROMPT_CAPABILITY.execute,
      defaultExecutionInstruction
    )

    const executionPrompt = await buildSystemPrompt(event, userId, [
      executionInstruction,
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
        source: 'intelligence-agent',
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

  const reflectInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.reflect,
    'You are TuffIntelligence reviewer. Summarize wins, failures, risks, and next actions in markdown.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    reflectInstruction,
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
      source: 'intelligence-agent',
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
export async function buildFinalAssistantReplyWithModel(
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
  const finalizeInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.finalize,
    'You are TuffIntelligence final responder.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    finalizeInstruction,
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
      source: 'intelligence-agent',
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

  const followupInstruction = await resolveAgentPromptInstruction(
    event,
    userId,
    AGENT_PROMPT_CAPABILITY.followup,
    'You are TuffIntelligence follow-up planner.'
  )

  const systemPrompt = await buildSystemPrompt(event, userId, [
    followupInstruction,
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
      source: 'intelligence-agent',
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
        errorMessage: `intelligence-agent-runtime model_failed:${stage}`,
        traceId: activeTraceId || null,
        metadata: {
          source: 'intelligence-agent-runtime',
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
        errorMessage: 'intelligence-agent-runtime paused_disconnect',
        traceId: activeTraceId || null,
        metadata: {
          source: 'intelligence-agent-runtime',
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
      errorMessage: status === 'failed' ? 'intelligence-agent-runtime failed' : null,
      traceId: activeTraceId || null,
      metadata: {
        source: 'intelligence-agent-runtime',
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
        continueOnError: row.continueOnError === true,
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
