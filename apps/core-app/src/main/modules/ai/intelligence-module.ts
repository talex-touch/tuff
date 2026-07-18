import type {
  IntelligenceAgentStreamEvent,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceProviderConfig,
  TuffIntelligenceAgentSession,
  TuffIntelligenceAgentTraceEvent,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTurn,
  WorkflowDefinition,
  WorkflowReviewQueueItemStatus,
  WorkflowRunRecord,
  WorkflowTriggerType
} from '@talex-touch/tuff-intelligence'
import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { getTuffTransportMain, HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import type {
  BuildContextInput,
  IndexChunkInput,
  IndexDocumentInput,
  KnowledgeSearchInput
} from '@talex-touch/utils/types/intelligence'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { ApiResponse } from '../../utils/safe-handler'
import type { CapabilityTestPayload } from './capability-testers/base-tester'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { defineEvent } from '@talex-touch/utils/transport/event/builder'
import {
  intelligenceApiEvents,
  intelligenceContextEvents,
  intelligenceOrchestratorEvents,
  intelligenceKnowledgeEvents
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { createHash } from 'node:crypto'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { safeApiHandler, withPermissionSafeApi } from '../../utils/safe-handler'
import { BaseModule } from '../abstract-base-module'
import { withPermission } from '../permission/channel-guard'
import {
  agentManager,
  registerAgentChannels,
  registerBuiltinAgents,
  registerBuiltinTools
} from './agents'
import { capabilityTesterRegistry } from './capability-testers'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { resolveCapabilityStatus } from './intelligence-capability-status'
import {
  debugPrintConfig,
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  setupConfigUpdateListener
} from './intelligence-config'
import { intelligenceContextExecutionService } from './intelligence-context-execution'
import { contextHygieneService } from './intelligence-context-hygiene'
import { toNormalizedIntelligenceError } from './intelligence-error-normalizer'
import { getIntelligenceLocalEnvironment } from './intelligence-local-environment'
import { aiCliOrchestrator } from './ai-cli-orchestrator'
import { localKnowledgeEngine } from './intelligence-local-knowledge-engine'
import { intelligenceMcpRegistry } from './intelligence-mcp-registry'
import { getProviderModelOptions } from './intelligence-provider-model-options'
import {
  setIntelligenceAutonomousRuntimeAdapter,
  setIntelligenceProviderManager,
  tuffIntelligence
} from './intelligence-sdk'
import { intelligenceTtsService } from './intelligence-tts-service'
import { intelligenceWorkflowService } from './intelligence-workflow-service'
import { createCustomProvider } from './provider-factory'
import { fetchProviderModels } from './provider-models'
import { normalizeProviderForRuntime } from './provider-runtime'
import { AnthropicProvider } from './providers/anthropic-provider'
import { DeepSeekProvider } from './providers/deepseek-provider'
import { LocalProvider } from './providers/local-provider'
import { OpenAIProvider } from './providers/openai-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import { IntelligenceProviderManager } from './runtime/provider-manager'
import { tuffIntelligenceRuntime } from './tuff-intelligence-runtime'

const intelligenceLog = createLogger('Intelligence')
const INTELLIGENCE_STREAM_KEEPALIVE_MS = 10_000
const INTELLIGENCE_STREAM_REPLAY_LIMIT = 1_000

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

interface IntelligenceSessionStartPayload {
  sessionId?: string
  objective?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
  autoRunGraph?: boolean
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  reflectNotes?: string
}

interface IntelligenceSessionResumePayload {
  sessionId: string
}

interface IntelligenceSessionCancelPayload {
  sessionId: string
  reason?: string
}

interface IntelligenceSessionStatePayload {
  sessionId: string
}

interface IntelligenceSessionHeartbeatPayload {
  sessionId: string
}

interface IntelligenceSessionPausePayload {
  sessionId: string
  reason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted'
  note?: string
}

interface IntelligenceSessionHistoryPayload {
  limit?: number
  status?: TuffIntelligenceAgentSession['status']
}

interface IntelligenceOrchestratorPlanPayload {
  sessionId: string
  objective: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

interface IntelligenceOrchestratorExecutePayload {
  sessionId: string
  turnId?: string
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  metadata?: Record<string, unknown>
}

interface IntelligenceOrchestratorReflectPayload {
  sessionId: string
  turnId: string
  notes?: string
}

interface IntelligenceToolCallPayload {
  sessionId: string
  turnId?: string
  actionId?: string
  toolId: string
  input?: unknown
  riskLevel?: TuffIntelligenceApprovalTicket['riskLevel']
  callId?: string
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

interface IntelligenceToolResultPayload {
  sessionId: string
  turnId?: string
  toolId: string
  success: boolean
  output?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

interface IntelligenceToolApprovePayload {
  ticketId: string
  approved: boolean
  approvedBy?: string
  reason?: string
}

interface IntelligenceTraceQueryPayload {
  sessionId: string
  fromSeq?: number
  limit?: number
  level?: TuffIntelligenceAgentTraceEvent['level']
  type?: TuffIntelligenceAgentTraceEvent['type']
}

interface IntelligenceTraceExportPayload {
  sessionId: string
  format?: 'json' | 'jsonl'
}

interface IntelligenceWorkflowListPayload {
  includeDisabled?: boolean
  includeTemplates?: boolean
}

interface IntelligenceWorkflowGetPayload {
  workflowId: string
}

interface IntelligenceWorkflowDeletePayload {
  workflowId: string
}

interface IntelligenceWorkflowHistoryPayload {
  workflowId?: string
  limit?: number
  status?: WorkflowRunRecord['status']
}

interface IntelligenceWorkflowRunPayload {
  workflowId?: string
  workflow?: WorkflowDefinition
  runId?: string
  inputs?: Record<string, unknown>
  sessionId?: string
  triggerType?: WorkflowTriggerType
  continueOnError?: boolean
  metadata?: Record<string, unknown>
}

interface IntelligenceWorkflowReviewUpdatePayload {
  runId: string
  itemId: string
  status: WorkflowReviewQueueItemStatus
  error?: string
}

function normalizeFromSeq(value: unknown): number | undefined {
  const seq = Number(value)
  if (!Number.isFinite(seq)) {
    return undefined
  }
  return Math.max(1, Math.floor(seq))
}

function normalizeReplayLimit(value: unknown): number {
  const limit = Number(value)
  if (!Number.isFinite(limit)) {
    return INTELLIGENCE_STREAM_REPLAY_LIMIT
  }
  return Math.min(Math.max(Math.floor(limit), 1), INTELLIGENCE_STREAM_REPLAY_LIMIT)
}

function isTerminalSessionStatus(
  status: TuffIntelligenceAgentSession['status'] | undefined
): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function isRunningSessionStatus(
  status: TuffIntelligenceAgentSession['status'] | undefined
): boolean {
  if (!status) {
    return false
  }
  if (isTerminalSessionStatus(status) || status === 'paused_disconnect' || status === 'idle') {
    return false
  }
  return true
}

function mapTraceToStreamEvent(
  event: TuffIntelligenceAgentTraceEvent,
  options: { replay?: boolean } = {}
): IntelligenceAgentStreamEvent {
  return {
    ...event,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    replay: options.replay ? true : undefined,
    seq: typeof event.seq === 'number' ? event.seq : undefined,
    payload: event.payload as Record<string, unknown> | undefined
  }
}

function normalizeCapabilityInvokeError(capabilityId: string, error: unknown): Error {
  const baseError = error instanceof Error ? error : new Error(String(error))
  const message = baseError.message || ''
  const capabilityUnsupported = /capability not supported|is unsupported/i.test(message)
  if (!capabilityUnsupported) {
    return toNormalizedIntelligenceError(baseError, { capabilityId })
  }

  return toNormalizedIntelligenceError(
    Object.assign(baseError, { code: 'INTELLIGENCE_CAPABILITY_UNSUPPORTED' }),
    { capabilityId }
  )
}

function assertHostOwnedIntelligenceControlPlane(context: HandlerContext): void {
  if (context.plugin) {
    throw new Error('INTELLIGENCE_HOST_ONLY_CAPABILITY')
  }
}

function resolveContextActor(context: Pick<HandlerContext, 'plugin'>) {
  if (context.plugin) {
    return { id: `plugin:${context.plugin.name}`, type: 'plugin' as const }
  }
  return { id: 'host:core-app', type: 'host' as const }
}

function bindPluginMetadataCaller<T>(payload: T, context: Pick<HandlerContext, 'plugin'>): T {
  if (!context.plugin || !payload || typeof payload !== 'object') {
    return payload
  }

  const record = payload as T & { metadata?: Record<string, unknown> }
  return {
    ...record,
    metadata: {
      ...record.metadata,
      caller: `plugin:${context.plugin.name}`
    }
  }
}

type PluginKnowledgeEntityKind = 'document' | 'chunk'

function toPluginKnowledgeEntityId(
  scope: string,
  kind: PluginKnowledgeEntityKind,
  value: string
): string {
  const namespace = createHash('sha256').update(scope).digest('hex')
  const prefix = `plugin:${namespace}:${kind}:`
  if (value.startsWith(prefix)) {
    return value
  }
  return `${prefix}${createHash('sha256').update(value).digest('hex')}`
}

function createPluginKnowledgeDocumentSeed(input: IndexDocumentInput): string {
  return createHash('sha256')
    .update(String(input.sourceType ?? ''))
    .update('\0')
    .update(String(input.sourceUri ?? input.title ?? ''))
    .update('\0')
    .update(String(input.content ?? ''))
    .digest('hex')
}

function bindPluginKnowledgeDocument(
  input: IndexDocumentInput,
  context: Pick<HandlerContext, 'plugin'>
): IndexDocumentInput {
  if (!context.plugin || !input || typeof input !== 'object') {
    return input
  }

  const scope = `plugin:${context.plugin.name}`
  const localId =
    typeof input.id === 'string' && input.id ? input.id : createPluginKnowledgeDocumentSeed(input)
  return {
    ...input,
    id: toPluginKnowledgeEntityId(scope, 'document', localId),
    permissionScope: scope
  }
}

function bindPluginKnowledgeChunk(
  input: IndexChunkInput,
  context: Pick<HandlerContext, 'plugin'>
): IndexChunkInput {
  if (!context.plugin || !input || typeof input !== 'object') {
    return input
  }

  const scope = `plugin:${context.plugin.name}`
  const documentId =
    typeof input.documentId === 'string' && input.documentId
      ? toPluginKnowledgeEntityId(scope, 'document', input.documentId)
      : input.documentId
  return {
    ...input,
    documentId,
    ...(typeof input.id === 'string' && input.id
      ? { id: toPluginKnowledgeEntityId(scope, 'chunk', input.id) }
      : {})
  }
}

function bindPluginKnowledgeScope<T extends KnowledgeSearchInput>(
  input: T,
  context: Pick<HandlerContext, 'plugin'>
): T {
  if (!context.plugin || !input || typeof input !== 'object') {
    return input
  }
  return {
    ...input,
    permissionScope: `plugin:${context.plugin.name}`
  }
}

function bindPluginInvokeCaller(
  options: IntelligenceInvokeOptions | undefined,
  context: Pick<HandlerContext, 'plugin'>
): IntelligenceInvokeOptions | undefined {
  if (!context.plugin) {
    return options
  }
  const scoped = bindPluginMetadataCaller(options ?? {}, context)
  const metadata = { ...(scoped.metadata ?? {}) }
  delete metadata.approved
  delete metadata.approvalGranted
  delete metadata.approvedAt
  return { ...scoped, metadata }
}

const AUTONOMOUS_INTELLIGENCE_CAPABILITIES: Record<string, true> = {
  'agent.run': true,
  'workflow.execute': true
}

const enforceAutonomousIntelligencePermission = withPermission<unknown, void>(
  {
    permissionId: 'intelligence.agents',
    failClosedForPlugin: true,
    unavailableCode: 'INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE',
    deniedCode: 'INTELLIGENCE_AGENTS_PERMISSION_DENIED'
  },
  async () => undefined
)

async function assertAutonomousIntelligencePermission(
  capabilityId: string,
  payload: unknown,
  context: Pick<HandlerContext, 'plugin'>
): Promise<void> {
  if (!Object.hasOwn(AUTONOMOUS_INTELLIGENCE_CAPABILITIES, capabilityId)) {
    return
  }
  await enforceAutonomousIntelligencePermission(payload, context as HandlerContext)
}

const intelligenceAgentEvents = {
  sessionStart: defineEvent('intelligence')
    .module('agent')
    .event('session:start')
    .define<IntelligenceSessionStartPayload, ApiResponse<TuffIntelligenceAgentSession>>(),
  sessionHeartbeat: defineEvent('intelligence')
    .module('agent')
    .event('session:heartbeat')
    .define<
      IntelligenceSessionHeartbeatPayload,
      ApiResponse<{ sessionId: string; heartbeatAt: string }>
    >(),
  sessionPause: defineEvent('intelligence')
    .module('agent')
    .event('session:pause')
    .define<IntelligenceSessionPausePayload, ApiResponse<TuffIntelligenceAgentSession | null>>(),
  sessionRecoverable: defineEvent('intelligence')
    .module('agent')
    .event('session:recoverable')
    .define<void, ApiResponse<TuffIntelligenceAgentSession | null>>(),
  sessionResume: defineEvent('intelligence')
    .module('agent')
    .event('session:resume')
    .define<IntelligenceSessionResumePayload, ApiResponse<TuffIntelligenceAgentSession | null>>(),
  sessionCancel: defineEvent('intelligence')
    .module('agent')
    .event('session:cancel')
    .define<IntelligenceSessionCancelPayload, ApiResponse<TuffIntelligenceStateSnapshot | null>>(),
  sessionGetState: defineEvent('intelligence')
    .module('agent')
    .event('session:get-state')
    .define<IntelligenceSessionStatePayload, ApiResponse<TuffIntelligenceStateSnapshot | null>>(),
  plan: defineEvent('intelligence')
    .module('agent')
    .event('plan')
    .define<IntelligenceOrchestratorPlanPayload, ApiResponse<TuffIntelligenceTurn>>(),
  execute: defineEvent('intelligence')
    .module('agent')
    .event('execute')
    .define<IntelligenceOrchestratorExecutePayload, ApiResponse<TuffIntelligenceTurn>>(),
  reflect: defineEvent('intelligence')
    .module('agent')
    .event('reflect')
    .define<IntelligenceOrchestratorReflectPayload, ApiResponse<TuffIntelligenceTurn>>(),
  toolCall: defineEvent('intelligence').module('agent').event('tool:call').define<
    IntelligenceToolCallPayload,
    ApiResponse<{
      success: boolean
      output?: unknown
      error?: string
      approvalTicket?: TuffIntelligenceApprovalTicket
      traceEvent: TuffIntelligenceAgentTraceEvent
    }>
  >(),
  toolResult: defineEvent('intelligence')
    .module('agent')
    .event('tool:result')
    .define<IntelligenceToolResultPayload, ApiResponse<{ accepted: boolean }>>(),
  toolApprove: defineEvent('intelligence')
    .module('agent')
    .event('tool:approve')
    .define<IntelligenceToolApprovePayload, ApiResponse<TuffIntelligenceApprovalTicket | null>>(),
  sessionStream: defineEvent('intelligence')
    .module('agent')
    .event('session:stream')
    .define<IntelligenceTraceQueryPayload, ApiResponse<TuffIntelligenceAgentTraceEvent[]>>(),
  sessionSubscribe: defineEvent('intelligence')
    .module('agent')
    .event('session:subscribe')
    .define<IntelligenceTraceQueryPayload, AsyncIterable<IntelligenceAgentStreamEvent>>(),
  sessionHistory: defineEvent('intelligence')
    .module('agent')
    .event('session:history')
    .define<
      IntelligenceSessionHistoryPayload | undefined,
      ApiResponse<TuffIntelligenceAgentSession[]>
    >(),
  sessionTrace: defineEvent('intelligence')
    .module('agent')
    .event('session:trace')
    .define<IntelligenceTraceQueryPayload, ApiResponse<TuffIntelligenceAgentTraceEvent[]>>(),
  sessionTraceExport: defineEvent('intelligence')
    .module('agent')
    .event('session:trace:export')
    .define<
      IntelligenceTraceExportPayload,
      ApiResponse<{ format: 'json' | 'jsonl'; content: string }>
    >()
} as const
const intelligenceWorkflowEvents = {
  list: defineEvent('intelligence')
    .module('workflow')
    .event('list')
    .define<IntelligenceWorkflowListPayload | undefined, ApiResponse<WorkflowDefinition[]>>(),
  get: defineEvent('intelligence')
    .module('workflow')
    .event('get')
    .define<IntelligenceWorkflowGetPayload, ApiResponse<WorkflowDefinition | null>>(),
  save: defineEvent('intelligence')
    .module('workflow')
    .event('save')
    .define<WorkflowDefinition, ApiResponse<WorkflowDefinition>>(),
  delete: defineEvent('intelligence')
    .module('workflow')
    .event('delete')
    .define<IntelligenceWorkflowDeletePayload, ApiResponse<{ deleted: boolean }>>(),
  run: defineEvent('intelligence')
    .module('workflow')
    .event('run')
    .define<IntelligenceWorkflowRunPayload, ApiResponse<WorkflowRunRecord>>(),
  history: defineEvent('intelligence')
    .module('workflow')
    .event('history')
    .define<IntelligenceWorkflowHistoryPayload | undefined, ApiResponse<WorkflowRunRecord[]>>(),
  reviewUpdate: defineEvent('intelligence')
    .module('workflow')
    .event('review:update')
    .define<IntelligenceWorkflowReviewUpdatePayload, ApiResponse<WorkflowRunRecord>>()
} as const

const intelligenceSessionStartEvent = intelligenceAgentEvents.sessionStart
const intelligenceSessionHeartbeatEvent = intelligenceAgentEvents.sessionHeartbeat
const intelligenceSessionPauseEvent = intelligenceAgentEvents.sessionPause
const intelligenceSessionRecoverableEvent = intelligenceAgentEvents.sessionRecoverable
const intelligenceSessionResumeEvent = intelligenceAgentEvents.sessionResume
const intelligenceSessionCancelEvent = intelligenceAgentEvents.sessionCancel
const intelligenceSessionGetStateEvent = intelligenceAgentEvents.sessionGetState
const intelligenceOrchestratorPlanEvent = intelligenceAgentEvents.plan
const intelligenceOrchestratorExecuteEvent = intelligenceAgentEvents.execute
const intelligenceOrchestratorReflectEvent = intelligenceAgentEvents.reflect
const intelligenceToolCallEvent = intelligenceAgentEvents.toolCall
const intelligenceToolResultEvent = intelligenceAgentEvents.toolResult
const intelligenceToolApproveEvent = intelligenceAgentEvents.toolApprove
const intelligenceSessionStreamEvent = intelligenceAgentEvents.sessionStream
const intelligenceSessionSubscribeEvent = intelligenceAgentEvents.sessionSubscribe
const intelligenceSessionHistoryEvent = intelligenceAgentEvents.sessionHistory
const intelligenceSessionTraceEvent = intelligenceAgentEvents.sessionTrace
const intelligenceSessionTraceExportEvent = intelligenceAgentEvents.sessionTraceExport
const intelligenceWorkflowListEvent = intelligenceWorkflowEvents.list
const intelligenceWorkflowGetEvent = intelligenceWorkflowEvents.get
const intelligenceWorkflowSaveEvent = intelligenceWorkflowEvents.save
const intelligenceWorkflowDeleteEvent = intelligenceWorkflowEvents.delete
const intelligenceWorkflowRunEvent = intelligenceWorkflowEvents.run
const intelligenceWorkflowHistoryEvent = intelligenceWorkflowEvents.history
const intelligenceWorkflowReviewUpdateEvent = intelligenceWorkflowEvents.reviewUpdate

/**
 * Intelligence Module - Manages AI capabilities and providers.
 *
 * Supports two provider types:
 * 1. Builtin Providers - Natively supported (OpenAI, Anthropic, DeepSeek, etc.)
 * 2. Custom Providers - OpenAI-compatible custom endpoints
 */
export class IntelligenceModule extends BaseModule<TalexEvents> {
  static readonly key: symbol = Symbol.for('Intelligence')
  name: ModuleKey = IntelligenceModule.key

  private manager: IntelligenceProviderManager | null = null
  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  private agentChannelsCleanup: (() => void) | null = null
  private agentRuntimePromise: Promise<void> | null = null

  constructor() {
    super(IntelligenceModule.key)
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'IntelligenceModule.onInit')
    this.transport = runtime.transport

    intelligenceLog.info('Initializing Intelligence module')

    // 创建 Provider Manager
    this.manager = new IntelligenceProviderManager()

    // 注册 Builtin Provider Factories
    this.registerBuiltinProviders()

    // 注册 Custom Provider Factory (OpenAI-compatible)
    this.registerCustomProvider()

    // 注册能力
    this.registerCapabilities()

    // 设置全局 Provider Manager
    setIntelligenceProviderManager(this.manager)
    setIntelligenceAutonomousRuntimeAdapter({
      executeAgentCapability: (payload, options) =>
        aiCliOrchestrator.executeAgentCapability(payload, options),
      executeWorkflowCapability: (payload, options) =>
        aiCliOrchestrator.executeWorkflowCapability(payload, options)
    })
    intelligenceLog.info('Provider manager injected')

    // 注册 IPC 通道
    this.registerChannels()
    this.registerAgentRuntimeChannels()

    // 打印配置文件内容（调试用）
    debugPrintConfig()

    // 新 manager 必须先强制应用一次配置；后续订阅的当前值回放会被 signature 去重
    ensureIntelligenceConfigLoaded(true)

    // 设置配置更新监听器
    setupConfigUpdateListener()

    this.startAgentRuntime()

    intelligenceLog.success('Intelligence module initialized')
  }

  async onDestroy(): Promise<void> {
    intelligenceLog.info('Destroying Intelligence module')
    try {
      await this.waitForAgentRuntime()
    } catch (error) {
      intelligenceLog.warn('Intelligence agent runtime was not ready during destroy', { error })
    }
    if (this.agentChannelsCleanup) {
      this.agentChannelsCleanup()
      this.agentChannelsCleanup = null
    }
    await aiCliOrchestrator.shutdown()
    await intelligenceMcpRegistry.closeAll()
    await agentManager.shutdown()
    intelligenceTtsService.clear()
    this.manager?.clear()
    this.manager = null
  }

  private startAgentRuntime(): void {
    if (this.agentRuntimePromise) return
    const task = this.setupAgentRuntime()
    task.catch((error) => {
      intelligenceLog.error('Intelligence agent runtime initialization failed', { error })
    })
    this.agentRuntimePromise = task
  }

  private async waitForAgentRuntime(): Promise<void> {
    if (!this.agentRuntimePromise) {
      this.startAgentRuntime()
    }
    await this.agentRuntimePromise
  }

  private async setupAgentRuntime(): Promise<void> {
    intelligenceLog.info('Initializing intelligence agent runtime')
    registerBuiltinTools()
    registerBuiltinAgents()
    intelligenceWorkflowService.setExecutor((ctx) => aiCliOrchestrator.executeWorkflowRun(ctx))

    agentManager.setTaskRuntime(
      (task) => aiCliOrchestrator.executeAgentTask(task),
      (taskId) => aiCliOrchestrator.cancel(taskId)
    )

    await aiCliOrchestrator.initialize()
    await agentManager.init()

    await intelligenceWorkflowService.initialize()
    this.verifyAgentRuntimeReady()
    intelligenceLog.success('Intelligence agent runtime initialized')
  }

  private registerAgentRuntimeChannels(): void {
    if (!this.transport || this.agentChannelsCleanup) return
    this.agentChannelsCleanup = registerAgentChannels(this.transport, {
      waitForRuntime: () => this.waitForAgentRuntime()
    })
  }

  private verifyAgentRuntimeReady(): void {
    const stats = agentManager.getStats()
    if (stats.agents.enabled <= 0) {
      throw new Error('[Intelligence] No enabled agents found after runtime initialization')
    }
    if (stats.tools.total <= 0) {
      throw new Error('[Intelligence] No tools found after runtime initialization')
    }
  }

  /**
   * 注册内置 Provider Factories
   */
  private registerBuiltinProviders(): void {
    if (!this.manager) return

    intelligenceLog.info('Registering builtin provider factories')

    this.manager.registerFactory(
      IntelligenceProviderType.OPENAI,
      (config) => new OpenAIProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.ANTHROPIC,
      (config) => new AnthropicProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.DEEPSEEK,
      (config) => new DeepSeekProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.SILICONFLOW,
      (config) => new SiliconflowProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.LOCAL,
      (config) => new LocalProvider(config)
    )

    intelligenceLog.success('Builtin provider factories registered')
  }

  /**
   * 注册自定义 Provider Factory
   */
  private registerCustomProvider(): void {
    if (!this.manager) return

    intelligenceLog.info('Registering custom provider factory')

    this.manager.registerFactory(IntelligenceProviderType.CUSTOM, (config) => {
      intelligenceLog.info(`Creating custom provider: ${config.id}`)
      return createCustomProvider(config)
    })

    intelligenceLog.success('Custom provider factory registered')
  }

  /**
   * 注册 AI 能力
   */
  private registerCapabilities(): void {
    intelligenceLog.info('Registering capabilities')

    const ALL_PROVIDERS = [
      IntelligenceProviderType.OPENAI,
      IntelligenceProviderType.ANTHROPIC,
      IntelligenceProviderType.DEEPSEEK,
      IntelligenceProviderType.SILICONFLOW,
      IntelligenceProviderType.LOCAL,
      IntelligenceProviderType.CUSTOM
    ]

    const VISION_PROVIDERS = [
      IntelligenceProviderType.OPENAI,
      IntelligenceProviderType.ANTHROPIC,
      IntelligenceProviderType.SILICONFLOW,
      IntelligenceProviderType.LOCAL,
      IntelligenceProviderType.CUSTOM
    ]

    // ========================================================================
    // Core Text Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Text Chat',
      description: 'General-purpose text chat capability',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'text.translate',
      type: IntelligenceCapabilityType.TRANSLATE,
      name: 'Translation',
      description: 'Multi-language text translation',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'text.summarize',
      type: IntelligenceCapabilityType.SUMMARIZE,
      name: 'Summarization',
      description: 'Generate concise summaries of text content',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'text.rewrite',
      type: IntelligenceCapabilityType.REWRITE,
      name: 'Text Rewrite',
      description: 'Rewrite text with different styles and tones',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'text.grammar',
      type: IntelligenceCapabilityType.GRAMMAR_CHECK,
      name: 'Grammar Check',
      description: 'Check and correct grammar, spelling, and style',
      supportedProviders: ALL_PROVIDERS
    })

    // ========================================================================
    // Embedding Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Generate Embeddings',
      description: 'Generate text embeddings for semantic search',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.DEEPSEEK,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.LOCAL,
        IntelligenceProviderType.CUSTOM
      ]
    })

    // ========================================================================
    // Code Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'code.generate',
      type: IntelligenceCapabilityType.CODE_GENERATE,
      name: 'Code Generation',
      description: 'Generate code from natural language descriptions',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'code.explain',
      type: IntelligenceCapabilityType.CODE_EXPLAIN,
      name: 'Code Explanation',
      description: 'Explain code functionality and logic',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'code.review',
      type: IntelligenceCapabilityType.CODE_REVIEW,
      name: 'Code Review',
      description: 'Review code for issues, security, and best practices',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'code.refactor',
      type: IntelligenceCapabilityType.CODE_REFACTOR,
      name: 'Code Refactoring',
      description: 'Refactor code for better readability and maintainability',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'code.debug',
      type: IntelligenceCapabilityType.CODE_DEBUG,
      name: 'Code Debugging',
      description: 'Analyze and fix code bugs',
      supportedProviders: ALL_PROVIDERS
    })

    // ========================================================================
    // Analysis Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'intent.detect',
      type: IntelligenceCapabilityType.INTENT_DETECT,
      name: 'Intent Detection',
      description: 'Detect user intent from text input',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'sentiment.analyze',
      type: IntelligenceCapabilityType.SENTIMENT_ANALYZE,
      name: 'Sentiment Analysis',
      description: 'Analyze sentiment and emotions in text',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'content.extract',
      type: IntelligenceCapabilityType.CONTENT_EXTRACT,
      name: 'Content Extraction',
      description: 'Extract entities and key information from text',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'keywords.extract',
      type: IntelligenceCapabilityType.KEYWORDS_EXTRACT,
      name: 'Keyword Extraction',
      description: 'Extract keywords and key phrases from text',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'text.classify',
      type: IntelligenceCapabilityType.CLASSIFICATION,
      name: 'Text Classification',
      description: 'Classify text into predefined categories',
      supportedProviders: ALL_PROVIDERS
    })

    // ========================================================================
    // Vision Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'vision.ocr',
      type: IntelligenceCapabilityType.VISION_OCR,
      name: 'Vision OCR',
      description: 'Optical character recognition from images',
      supportedProviders: VISION_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'image.caption',
      type: IntelligenceCapabilityType.IMAGE_CAPTION,
      name: 'Image Captioning',
      description: 'Generate descriptive captions for images',
      supportedProviders: VISION_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'image.analyze',
      type: IntelligenceCapabilityType.IMAGE_ANALYZE,
      name: 'Image Analysis',
      description: 'Analyze image content, objects, and scenes',
      supportedProviders: VISION_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'image.translate.e2e',
      type: IntelligenceCapabilityType.IMAGE_TRANSLATE_E2E,
      name: 'Image Translation',
      description: 'Translate text in an image and return the translated image',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })

    intelligenceCapabilityRegistry.register({
      id: 'image.generate',
      type: IntelligenceCapabilityType.IMAGE_GENERATE,
      name: 'Image Generation',
      description: 'Generate images from text prompts',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    intelligenceCapabilityRegistry.register({
      id: 'image.edit',
      type: IntelligenceCapabilityType.IMAGE_EDIT,
      name: 'Image Editing',
      description: 'Edit and modify images with AI',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.CUSTOM]
    })

    // ========================================================================
    // Audio Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'audio.tts',
      type: IntelligenceCapabilityType.TTS,
      name: 'Text-to-Speech',
      description: 'Convert text to natural speech',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    intelligenceCapabilityRegistry.register({
      id: 'audio.stt',
      type: IntelligenceCapabilityType.STT,
      name: 'Speech-to-Text',
      description: 'Convert speech to text',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    intelligenceCapabilityRegistry.register({
      id: 'audio.transcribe',
      type: IntelligenceCapabilityType.AUDIO_TRANSCRIBE,
      name: 'Audio Transcription',
      description: 'Transcribe audio with timestamps and speaker detection',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    // ========================================================================
    // RAG & Search Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'rag.query',
      type: IntelligenceCapabilityType.RAG_QUERY,
      name: 'RAG Query',
      description: 'Query documents with retrieval-augmented generation',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'Search documents by semantic similarity',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    intelligenceCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Document Reranking',
      description: 'Rerank search results by relevance',
      supportedProviders: [IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM]
    })

    // ========================================================================
    // Workflow & Agent Capabilities
    // ========================================================================

    intelligenceCapabilityRegistry.register({
      id: 'workflow.execute',
      type: IntelligenceCapabilityType.WORKFLOW,
      name: 'Workflow Execution',
      description: 'Execute multi-step prompt workflows',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceCapabilityRegistry.register({
      id: 'agent.run',
      type: IntelligenceCapabilityType.AGENT,
      name: 'Agent Execution',
      description: 'Run autonomous AI agents with tool access',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceLog.success(`Registered ${intelligenceCapabilityRegistry.size()} capabilities`)
  }

  /**
   * 注册 IPC 通道处理器
   */
  private registerChannels(): void {
    if (!this.transport) return

    intelligenceLog.info('Registering IPC channels')

    const { registerSafe, registerHostOnlySafe, registerProtectedSafe, registerProtectedStream } =
      this.createChannelRegistrars(this.transport)

    this.registerInvokeChannels(registerProtectedSafe, registerProtectedStream)
    this.registerKnowledgeChannels(registerProtectedSafe)
    this.registerContextChannels(registerProtectedSafe)
    this.registerCapabilityChannels(registerSafe)
    this.registerStatsChannels(registerSafe)
    this.registerEnvironmentChannels(registerSafe)
    this.registerAiCliOrchestratorChannels(registerSafe)
    this.registerQuotaChannels(registerSafe)
    this.registerOrchestrationChannels(registerHostOnlySafe)
    this.registerWorkflowChannels(registerHostOnlySafe)
    this.registerOrchestrationStreamChannels()

    intelligenceLog.success('IPC channels registered')
  }

  private createChannelRegistrars(transport: NonNullable<IntelligenceModule['transport']>) {
    const createErrorLogger = (action: string) => {
      return (error: unknown) => {
        intelligenceLog.error(`${action} failed:`, { error })
      }
    }

    const registerSafe = <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => {
      transport.on(
        event,
        safeApiHandler(handler, {
          onError: (error) => createErrorLogger(action)(error)
        })
      )
    }

    const registerHostOnlySafe = <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => {
      registerSafe(event, action, (payload, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return handler(payload, context)
      })
    }

    const registerProtectedSafe = <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => {
      transport.on(
        event,
        withPermissionSafeApi({ permissionId }, handler, {
          onError: (error) => createErrorLogger(action)(error)
        })
      )
    }

    const registerProtectedStream = <TReq, TChunk>(
      event: TuffEvent<TReq, AsyncIterable<TChunk>> & { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: TReq, context: StreamContext<TChunk>) => Promise<void> | void
    ) => {
      transport.onStream(event, async (payload, context) => {
        try {
          await withPermission({ permissionId }, async (nextPayload: TReq, nextContext) => {
            await handler(nextPayload, nextContext as unknown as StreamContext<TChunk>)
          })(payload, context as unknown as HandlerContext)
        } catch (error) {
          createErrorLogger(action)(error)
          context.error(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }

    return {
      registerSafe,
      registerHostOnlySafe,
      registerProtectedSafe,
      registerProtectedStream
    }
  }

  private registerInvokeChannels(
    registerProtectedSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void,
    registerProtectedStream: <TReq, TChunk>(
      event: TuffEvent<TReq, AsyncIterable<TChunk>> & { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: TReq, context: StreamContext<TChunk>) => Promise<void> | void
    ) => void
  ): void {
    registerProtectedSafe(
      intelligenceApiEvents.invoke,
      'Invoke capability',
      'intelligence.basic',
      async (data, context) => {
        if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
          throw new Error('Invalid invoke payload')
        }

        const { capabilityId, payload, options } = data
        const scopedOptions = bindPluginInvokeCaller(options, context)
        await assertAutonomousIntelligencePermission(capabilityId, data, context)
        ensureIntelligenceConfigLoaded()
        if (capabilityId === 'agent.run' || capabilityId === 'workflow.execute') {
          await this.waitForAgentRuntime()
        }
        intelligenceLog.info(`Invoking capability: ${capabilityId}`)
        let result: IntelligenceInvokeResult<unknown>
        try {
          result = await tuffIntelligence.invoke(capabilityId, payload, scopedOptions)
        } catch (error) {
          throw normalizeCapabilityInvokeError(capabilityId, error)
        }
        intelligenceLog.success(
          `Capability ${capabilityId} completed via ${result.provider} (${result.model})`
        )
        return result
      }
    )

    registerProtectedStream(
      intelligenceApiEvents.stream,
      'Stream capability',
      'intelligence.basic',
      async (data, streamContext) => {
        if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
          throw new Error('Invalid stream payload')
        }

        const { capabilityId, payload, options } = data
        const scopedOptions = bindPluginInvokeCaller(options, streamContext)
        await assertAutonomousIntelligencePermission(capabilityId, data, streamContext)
        ensureIntelligenceConfigLoaded()
        intelligenceLog.info(`Streaming capability: ${capabilityId}`)
        try {
          for await (const event of tuffIntelligence.stream(capabilityId, payload, scopedOptions)) {
            if (streamContext.isCancelled()) break
            streamContext.emit(event)
          }
          streamContext.end()
        } catch (error) {
          throw normalizeCapabilityInvokeError(capabilityId, error)
        }
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.execute,
      'Execute intelligence context',
      'intelligence.basic',
      async (data, context) => {
        ensureIntelligenceConfigLoaded()
        return intelligenceContextExecutionService.invoke(data, resolveContextActor(context))
      }
    )

    registerProtectedStream(
      intelligenceContextEvents.stream,
      'Stream intelligence context',
      'intelligence.basic',
      async (data, streamContext) => {
        ensureIntelligenceConfigLoaded()
        for await (const event of intelligenceContextExecutionService.stream(
          data,
          resolveContextActor(streamContext)
        )) {
          if (streamContext.isCancelled()) break
          streamContext.emit(event)
        }
        streamContext.end()
      }
    )

    registerProtectedSafe(
      intelligenceApiEvents.ttsSpeak,
      'TTS speak',
      'intelligence.basic',
      async (data, context) => {
        ensureIntelligenceConfigLoaded()
        return await intelligenceTtsService.speak(bindPluginMetadataCaller(data, context))
      }
    )

    registerProtectedSafe(
      intelligenceApiEvents.chatLangChain,
      'LangChain chat',
      'intelligence.basic',
      async (data, context) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.messages)) {
          throw new Error('Invalid chat payload')
        }

        const scopedData = bindPluginMetadataCaller(data, context)
        const { messages, providerId, model, promptTemplate, promptVariables, metadata } =
          scopedData

        ensureIntelligenceConfigLoaded()

        const result = await tuffIntelligence.invoke<string>(
          'text.chat',
          { messages },
          {
            preferredProviderId: providerId,
            modelPreference: model ? [model] : undefined,
            metadata: {
              ...metadata,
              promptTemplate,
              promptVariables
            }
          }
        )

        return result
      }
    )
  }

  private registerKnowledgeChannels(
    registerProtectedSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerProtectedSafe(
      intelligenceKnowledgeEvents.indexDocument,
      'Index local knowledge document',
      'intelligence.basic',
      async (data, context) =>
        localKnowledgeEngine.indexDocument(bindPluginKnowledgeDocument(data, context))
    )

    registerProtectedSafe(
      intelligenceKnowledgeEvents.indexChunk,
      'Index local knowledge chunk',
      'intelligence.basic',
      async (data, context) =>
        localKnowledgeEngine.indexChunk(bindPluginKnowledgeChunk(data, context))
    )

    registerProtectedSafe(
      intelligenceKnowledgeEvents.search,
      'Search local knowledge',
      'intelligence.basic',
      async (data, context) => localKnowledgeEngine.search(bindPluginKnowledgeScope(data, context))
    )

    registerProtectedSafe(
      intelligenceKnowledgeEvents.buildContext,
      'Build local knowledge context',
      'intelligence.basic',
      async (data, context) =>
        localKnowledgeEngine.buildContext(
          bindPluginKnowledgeScope<BuildContextInput>(data, context)
        )
    )
  }

  private registerContextChannels(
    registerProtectedSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerProtectedSafe(
      intelligenceContextEvents.prepareTurn,
      'Prepare intelligence context turn',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.prepareTurn(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.listCheckpoints,
      'List intelligence context checkpoints',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.listCheckpoints(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.listPackageLogs,
      'List intelligence context package logs',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.listPackageLogs(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.createCompressionSnapshot,
      'Create intelligence compression snapshot',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.createCompressionSnapshot(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.listCompressionSnapshots,
      'List intelligence compression snapshots',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.listCompressionSnapshots(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.getLatestCompressionSnapshot,
      'Get latest intelligence compression snapshot',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.getLatestCompressionSnapshot(data.sessionId)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.listMemories,
      'List intelligence memories',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.listMemories(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.evaluateMemory,
      'Evaluate intelligence memory',
      'intelligence.basic',
      async (data) => contextHygieneService.evaluateMemory(data)
    )

    registerProtectedSafe(
      intelligenceContextEvents.saveMemory,
      'Save intelligence memory',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.saveMemory(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.replaceMemory,
      'Replace intelligence memory',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.replaceMemory(data)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.setMemoryEnabled,
      'Set intelligence memory enabled state',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.setMemoryEnabled(data.memoryId, data.enabled)
      }
    )

    registerProtectedSafe(
      intelligenceContextEvents.deleteMemory,
      'Delete intelligence memory',
      'intelligence.basic',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return contextHygieneService.deleteMemory(data.memoryId, data.reason)
      }
    )
  }

  private registerCapabilityChannels(
    registerSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(intelligenceApiEvents.testProvider, 'Provider test', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      if (!data || typeof data !== 'object' || !data.provider) {
        throw new Error('Missing provider payload')
      }

      const provider = normalizeProviderForRuntime(data.provider as IntelligenceProviderConfig)
      ensureIntelligenceConfigLoaded()
      intelligenceLog.info(`Testing provider: ${provider.id}`)
      const result = await tuffIntelligence.testProvider(provider)
      intelligenceLog.success(`Provider ${provider.id} test success`)
      return result
    })

    registerSafe(
      intelligenceApiEvents.getCapabilityTestMeta,
      'Get capability test metadata',
      async (data) => {
        if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
          throw new Error('Invalid capability ID')
        }

        const { capabilityId } = data
        const tester = capabilityTesterRegistry.get(capabilityId)

        if (!tester) {
          return {
            requiresUserInput: false,
            inputHint: ''
          }
        }

        return {
          requiresUserInput: tester.requiresUserInput(),
          inputHint: tester.getDefaultInputHint()
        }
      }
    )

    registerSafe(
      intelligenceApiEvents.getCapabilityStatus,
      'Get capability status',
      async (data) => {
        if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
          throw new Error('Invalid capability ID')
        }

        return resolveCapabilityStatus(data.capabilityId)
      }
    )

    registerSafe(
      intelligenceApiEvents.getProviderModelOptions,
      'Get provider model options',
      async (data) => {
        const capabilityId =
          data && typeof data === 'object' && typeof data.capabilityId === 'string'
            ? data.capabilityId
            : 'text.chat'

        return getProviderModelOptions(capabilityId)
      }
    )

    registerSafe(intelligenceApiEvents.testCapability, 'Capability test', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
        throw new Error('Invalid capability test payload')
      }

      const {
        capabilityId,
        providerId,
        userInput,
        model,
        promptTemplate,
        promptVariables,
        ...rest
      } = data

      const capability = intelligenceCapabilityRegistry.get(capabilityId)
      if (!capability) {
        throw new Error(`Capability ${capabilityId} not registered`)
      }

      const tester = capabilityTesterRegistry.get(capabilityId)
      if (!tester) {
        throw new Error(`No tester registered for capability ${capabilityId}`)
      }

      ensureIntelligenceConfigLoaded()
      const options = getCapabilityOptions(capabilityId)
      const allowedProviderIds = providerId ? [providerId] : options.allowedProviderIds

      intelligenceLog.info(`Testing capability: ${capabilityId}`)
      const payload = await tester.generateTestPayload({
        ...rest,
        providerId,
        userInput
      } as CapabilityTestPayload)

      let result: IntelligenceInvokeResult<unknown>
      try {
        const requestedModel = optionalString(model)
        const modelPreference = requestedModel ? [requestedModel] : options.modelPreference
        result = await tuffIntelligence.invoke(capabilityId, payload, {
          modelPreference,
          allowedProviderIds: isStringArray(allowedProviderIds) ? allowedProviderIds : undefined,
          metadata: {
            promptTemplate: optionalString(promptTemplate),
            promptVariables,
            caller: 'system'
          }
        })
      } catch (error) {
        throw normalizeCapabilityInvokeError(capabilityId, error)
      }

      const formattedResult = tester.formatTestResult(result)

      intelligenceLog.success(
        `Capability ${capabilityId} test success via ${result.provider} (${result.model})`
      )

      return formattedResult
    })

    registerSafe(
      intelligenceApiEvents.fetchModels,
      'Fetch provider models',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        if (!data || typeof data !== 'object' || !data.provider) {
          throw new Error('Missing provider payload')
        }

        const provider = normalizeProviderForRuntime(data.provider as IntelligenceProviderConfig)
        ensureIntelligenceConfigLoaded()
        intelligenceLog.info(`Fetching models for provider: ${provider.id}`)

        const models = await fetchProviderModels(provider)
        intelligenceLog.success(`Loaded ${models.length} models for provider ${provider.id}`)

        return {
          success: true,
          models
        }
      }
    )
  }

  private registerStatsChannels(
    registerSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(intelligenceApiEvents.getAuditLogs, 'Get audit logs', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const options = data ?? {}
      return await tuffIntelligence.queryAuditLogs(options)
    })

    registerSafe(intelligenceApiEvents.getTodayStats, 'Get today stats', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const { callerId } = data ?? {}
      return await tuffIntelligence.getTodayStats(callerId)
    })

    registerSafe(intelligenceApiEvents.getMonthStats, 'Get month stats', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const { callerId } = data ?? {}
      return await tuffIntelligence.getMonthStats(callerId)
    })

    registerSafe(intelligenceApiEvents.getUsageStats, 'Get usage stats', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid payload')
      }
      const { callerId, periodType, startPeriod, endPeriod } = data
      return await tuffIntelligence.getUsageStats(callerId, periodType, startPeriod, endPeriod)
    })
  }

  private registerEnvironmentChannels(
    registerSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(
      intelligenceApiEvents.getLocalEnvironment,
      'Get local intelligence environment',
      async (_data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return await getIntelligenceLocalEnvironment()
      }
    )
  }

  private registerAiCliOrchestratorChannels(
    registerSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    const registerHostOwned = <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      operation: (payload: TReq) => Promise<TRes> | TRes
    ) => {
      registerSafe(event, action, async (payload, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        return await operation(payload)
      })
    }

    registerHostOwned(
      intelligenceOrchestratorEvents.getSnapshot,
      'Get AI orchestrator snapshot',
      () => aiCliOrchestrator.getSnapshot()
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.previewImport,
      'Preview AI configuration import',
      (payload) => aiCliOrchestrator.previewImport(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.applyImport,
      'Apply AI configuration import',
      (payload) => aiCliOrchestrator.applyImport(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.setImportedItemActive,
      'Update imported AI item',
      (payload) => aiCliOrchestrator.setImportedItemActive(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.cloneImportedItem,
      'Clone imported AI item',
      (payload) => aiCliOrchestrator.cloneImportedItem(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.deleteImportedItem,
      'Delete imported AI item',
      async (payload) => ({
        deleted: await aiCliOrchestrator.deleteImportedItem(payload.itemId)
      })
    )
    registerHostOwned(intelligenceOrchestratorEvents.listProfiles, 'List AI agent profiles', () =>
      aiCliOrchestrator.listProfiles()
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.saveProfile,
      'Save AI agent profile',
      (payload) => aiCliOrchestrator.saveProfile(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.execute,
      'Execute AI orchestrator task',
      (payload) => aiCliOrchestrator.execute(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.approve,
      'Approve AI orchestrator task',
      (payload) => aiCliOrchestrator.approveRun(payload.runId)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.cancel,
      'Cancel AI orchestrator task',
      async (payload) => ({ cancelled: await aiCliOrchestrator.cancelPersistedRun(payload.runId) })
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.listRuns,
      'List AI orchestrator runs',
      (payload) => aiCliOrchestrator.listRuns(payload)
    )
    registerHostOwned(intelligenceOrchestratorEvents.listAutomations, 'List AI automations', () =>
      aiCliOrchestrator.listAutomations()
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.saveAutomation,
      'Save AI automation',
      (payload) => aiCliOrchestrator.saveAutomation(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.deleteAutomation,
      'Delete AI automation',
      async (payload) => ({
        deleted: await aiCliOrchestrator.deleteAutomation(payload.automationId)
      })
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.runAutomation,
      'Run AI automation',
      (payload) => aiCliOrchestrator.runAutomation(payload)
    )
    registerHostOwned(
      intelligenceOrchestratorEvents.approveAutomation,
      'Approve AI automation',
      (payload) => aiCliOrchestrator.approveAutomation(payload)
    )
  }

  private registerOrchestrationChannels(
    registerHostOnlySafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,

      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerHostOnlySafe(
      intelligenceSessionStartEvent,
      'Start intelligence session',
      async (data, context) => {
        if (data && typeof data !== 'object') {
          throw new Error('Invalid session start payload')
        }
        const payload = (data ?? {}) as IntelligenceSessionStartPayload
        const shouldAutoRun = payload.autoRunGraph === true && typeof payload.objective === 'string'
        if (shouldAutoRun) {
          await assertAutonomousIntelligencePermission('agent.run', data, context)
        }
        if (shouldAutoRun && payload.continueOnError === true) {
          throw new Error(
            'Pi auto-run does not support continueOnError; split the task into explicit workflows'
          )
        }
        const session = await tuffIntelligenceRuntime.startSession(payload)
        if (!shouldAutoRun) {
          return session
        }
        const scopedAutoRunMetadata = bindPluginInvokeCaller(
          { metadata: payload.metadata },
          context
        )?.metadata

        const run = await aiCliOrchestrator.execute({
          objective: [
            payload.objective!.trim(),
            payload.reflectNotes?.trim() ? `Reflection notes:\n${payload.reflectNotes.trim()}` : ''
          ]
            .filter(Boolean)
            .join('\n\n'),
          input: payload.context,
          sessionId: session.id,
          approved: false,
          budget: {
            maxSteps: payload.maxSteps,
            maxToolCalls: payload.toolBudget
          },
          metadata: {
            ...(scopedAutoRunMetadata ?? {}),
            orchestratorRunId: `session:${session.id}`,
            legacySessionId: session.id
          }
        })

        return {
          ...session,
          status:
            run.status === 'completed'
              ? 'completed'
              : run.status === 'cancelled'
                ? 'cancelled'
                : run.status === 'pending_approval'
                  ? 'waiting_approval'
                  : 'failed',
          metadata: {
            ...(session.metadata ?? {}),
            orchestratorRunId: run.id,
            ...(run.error ? { error: run.error } : {})
          },
          updatedAt: run.completedAt ?? Date.now()
        }
      }
    )

    registerHostOnlySafe(
      intelligenceSessionHeartbeatEvent,
      'Heartbeat intelligence session',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.heartbeatSession(data.sessionId)
      }
    )

    registerHostOnlySafe(
      intelligenceSessionPauseEvent,
      'Pause intelligence session',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.pauseSession(data)
      }
    )

    registerHostOnlySafe(
      intelligenceSessionRecoverableEvent,
      'Get recoverable intelligence session',
      async () => {
        return tuffIntelligenceRuntime.getRecoverableSession()
      }
    )

    registerHostOnlySafe(
      intelligenceSessionResumeEvent,
      'Resume intelligence session',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.resumeSession(data.sessionId)
      }
    )

    registerHostOnlySafe(
      intelligenceSessionCancelEvent,
      'Cancel intelligence session',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        const session = await tuffIntelligenceRuntime.cancelSession(data)
        await aiCliOrchestrator.cancelSessionRuns(data.sessionId)
        return session
      }
    )

    registerHostOnlySafe(
      intelligenceSessionGetStateEvent,
      'Get intelligence session state',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.getSessionState(data.sessionId)
      }
    )

    registerHostOnlySafe(
      intelligenceOrchestratorPlanEvent,
      'Plan intelligence turn',
      async (data) => {
        if (!data?.sessionId || !data?.objective) {
          throw new Error('sessionId and objective are required')
        }
        return tuffIntelligenceRuntime.plan(data)
      }
    )

    registerHostOnlySafe(
      intelligenceOrchestratorExecuteEvent,
      'Execute intelligence turn',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.execute(data)
      }
    )

    registerHostOnlySafe(
      intelligenceOrchestratorReflectEvent,
      'Reflect intelligence turn',
      async (data) => {
        if (!data?.sessionId || !data?.turnId) {
          throw new Error('sessionId and turnId are required')
        }
        return tuffIntelligenceRuntime.reflect(data)
      }
    )

    registerHostOnlySafe(intelligenceToolCallEvent, 'Call intelligence tool', async (data) => {
      if (!data?.sessionId || !data?.toolId) {
        throw new Error('sessionId and toolId are required')
      }
      return tuffIntelligenceRuntime.callTool(data)
    })

    registerHostOnlySafe(
      intelligenceToolResultEvent,
      'Report intelligence tool result',
      async (data) => {
        if (!data?.sessionId || !data?.toolId || typeof data.success !== 'boolean') {
          throw new Error('sessionId, toolId and success are required')
        }
        return tuffIntelligenceRuntime.reportToolResult(data)
      }
    )

    registerHostOnlySafe(
      intelligenceToolApproveEvent,
      'Approve intelligence tool call',
      async (data) => {
        if (!data?.ticketId || typeof data.approved !== 'boolean') {
          throw new Error('ticketId and approved are required')
        }
        return tuffIntelligenceRuntime.approveTool(data)
      }
    )

    registerHostOnlySafe(
      intelligenceSessionStreamEvent,
      'Stream intelligence session trace',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.queryTrace(data)
      }
    )

    registerHostOnlySafe(
      intelligenceSessionHistoryEvent,
      'Query intelligence session history',
      async (data) => {
        return tuffIntelligenceRuntime.getSessionHistory(data ?? {})
      }
    )

    registerHostOnlySafe(
      intelligenceSessionTraceEvent,
      'Query intelligence session trace',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.queryTrace(data)
      }
    )

    registerHostOnlySafe(
      intelligenceSessionTraceExportEvent,
      'Export intelligence session trace',
      async (data) => {
        if (!data?.sessionId) {
          throw new Error('sessionId is required')
        }
        return tuffIntelligenceRuntime.exportTrace(data)
      }
    )
  }

  private registerWorkflowChannels(
    registerHostOnlySafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,

      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerHostOnlySafe(
      intelligenceWorkflowListEvent,
      'List intelligence workflows',
      async (data) => {
        if (data && typeof data !== 'object') {
          throw new Error('Invalid workflow list payload')
        }
        return intelligenceWorkflowService.listWorkflows(data ?? {})
      }
    )

    registerHostOnlySafe(
      intelligenceWorkflowGetEvent,
      'Get intelligence workflow',
      async (data) => {
        if (!data?.workflowId) {
          throw new Error('workflowId is required')
        }
        return intelligenceWorkflowService.getWorkflow(data.workflowId)
      }
    )

    registerHostOnlySafe(
      intelligenceWorkflowSaveEvent,
      'Save intelligence workflow',
      async (data) => {
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid workflow payload')
        }
        return intelligenceWorkflowService.saveWorkflow(data as WorkflowDefinition)
      }
    )

    registerHostOnlySafe(
      intelligenceWorkflowDeleteEvent,
      'Delete intelligence workflow',
      async (data) => {
        if (!data?.workflowId) {
          throw new Error('workflowId is required')
        }
        return intelligenceWorkflowService.deleteWorkflow(data.workflowId)
      }
    )

    registerHostOnlySafe(
      intelligenceWorkflowRunEvent,
      'Run intelligence workflow',
      async (data) => {
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid workflow run payload')
        }
        await this.waitForAgentRuntime()
        return intelligenceWorkflowService.runWorkflow(data)
      }
    )

    registerHostOnlySafe(
      intelligenceWorkflowHistoryEvent,
      'Query intelligence workflow history',
      async (data) => {
        if (data && typeof data !== 'object') {
          throw new Error('Invalid workflow history payload')
        }
        return intelligenceWorkflowService.listHistory(data ?? {})
      }
    )

    registerHostOnlySafe(
      intelligenceWorkflowReviewUpdateEvent,
      'Update intelligence workflow review queue',
      async (data) => {
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid workflow review update payload')
        }
        return intelligenceWorkflowService.updateReviewQueueItem(data)
      }
    )
  }

  private registerOrchestrationStreamChannels(): void {
    if (!this.transport) {
      return
    }

    this.transport.onStream(intelligenceSessionSubscribeEvent, async (data, streamContext) => {
      const handleStream = async (
        payload: IntelligenceTraceQueryPayload,
        context: HandlerContext
      ) => {
        assertHostOwnedIntelligenceControlPlane(context)
        if (!payload?.sessionId) {
          throw new Error('sessionId is required')
        }

        const sessionId = String(payload.sessionId).trim()
        if (!sessionId) {
          throw new Error('sessionId is required')
        }

        const fromSeq = normalizeFromSeq(payload.fromSeq)
        const replayLimit = normalizeReplayLimit(payload.limit)
        const filterLevel = payload.level
        const filterType = payload.type

        let closed = false
        let doneSent = false
        let keepaliveTimer: ReturnType<typeof setInterval> | null = null
        let cancelWatcher: ReturnType<typeof setInterval> | null = null
        let unsubscribe: () => void = () => {}

        const sendStreamEvent = (event: IntelligenceAgentStreamEvent): boolean => {
          if (closed || streamContext.isCancelled()) {
            return false
          }
          streamContext.emit(event)
          if (event.type === 'done') {
            doneSent = true
          }
          return true
        }

        const closeStream = () => {
          if (closed) {
            return
          }
          closed = true
          if (keepaliveTimer) {
            clearInterval(keepaliveTimer)
            keepaliveTimer = null
          }
          if (cancelWatcher) {
            clearInterval(cancelWatcher)
            cancelWatcher = null
          }
          unsubscribe()
          try {
            streamContext.end()
          } catch {
            // Ignore stream close failures on disconnected clients.
          }
        }

        const replayTrace = async () => {
          if (!fromSeq) {
            return
          }

          sendStreamEvent({
            type: 'replay.started',
            sessionId,
            timestamp: Date.now(),
            payload: {
              fromSeq,
              limit: replayLimit
            }
          })

          const replayEvents = await tuffIntelligenceRuntime.queryTrace({
            sessionId,
            fromSeq,
            limit: replayLimit,
            level: filterLevel,
            type: filterType
          })

          let replayCount = 0
          for (const traceEvent of replayEvents) {
            if (streamContext.isCancelled()) {
              return
            }
            if (
              sendStreamEvent(
                mapTraceToStreamEvent(traceEvent, {
                  replay: true
                })
              )
            ) {
              replayCount += 1
            }
          }

          sendStreamEvent({
            type: 'replay.finished',
            sessionId,
            timestamp: Date.now(),
            payload: {
              fromSeq,
              replayCount
            }
          })
        }

        const pauseOnDisconnect = async () => {
          const snapshot = await tuffIntelligenceRuntime.getSessionState(sessionId)
          if (!isRunningSessionStatus(snapshot?.status)) {
            return
          }
          await tuffIntelligenceRuntime.pauseSession({
            sessionId,
            reason: 'client_disconnect'
          })
        }

        try {
          sendStreamEvent({
            type: 'stream.started',
            sessionId,
            timestamp: Date.now(),
            payload: {
              fromSeq: fromSeq ?? null,
              keepaliveMs: INTELLIGENCE_STREAM_KEEPALIVE_MS,
              limit: replayLimit
            }
          })

          await replayTrace()
          if (streamContext.isCancelled()) {
            await pauseOnDisconnect()
            return
          }

          unsubscribe = tuffIntelligenceRuntime.subscribeSessionTrace(sessionId, (traceEvent) => {
            if (streamContext.isCancelled() || closed) {
              return
            }
            if (filterLevel && traceEvent.level !== filterLevel) {
              return
            }
            if (filterType && traceEvent.type !== filterType) {
              return
            }
            sendStreamEvent(mapTraceToStreamEvent(traceEvent))
          })

          keepaliveTimer = setInterval(() => {
            if (streamContext.isCancelled() || closed) {
              return
            }
            sendStreamEvent({
              type: 'stream.heartbeat',
              sessionId,
              timestamp: Date.now(),
              payload: {
                ts: Date.now()
              }
            })
          }, INTELLIGENCE_STREAM_KEEPALIVE_MS)

          await new Promise<void>((resolve) => {
            cancelWatcher = setInterval(() => {
              if (!streamContext.isCancelled()) {
                return
              }
              resolve()
            }, 250)
          })

          await pauseOnDisconnect()
          if (!doneSent) {
            sendStreamEvent({
              type: 'done',
              sessionId,
              timestamp: Date.now(),
              payload: {
                status: 'paused'
              }
            })
          }
        } finally {
          closeStream()
        }
      }

      try {
        await handleStream(data, streamContext as unknown as HandlerContext)
      } catch (error) {
        intelligenceLog.error('Subscribe intelligence session stream failed', { error })
        const err = error instanceof Error ? error : new Error(String(error))
        streamContext.error(err)
      }
    })
  }

  private registerQuotaChannels(
    registerSafe: <TReq, TRes>(
      event: TuffEvent<TReq, ApiResponse<TRes>> & { toEventName: () => string },
      action: string,
      handler: (payload: TReq, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(intelligenceApiEvents.getQuota, 'Get quota', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const { callerId, callerType } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.getQuota(callerId, callerType || 'plugin')
    })

    registerSafe(intelligenceApiEvents.setQuota, 'Set quota', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid quota config')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      await intelligenceQuotaManager.setQuota(data)
    })

    registerSafe(intelligenceApiEvents.deleteQuota, 'Delete quota', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const { callerId, callerType } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      await intelligenceQuotaManager.deleteQuota(callerId, callerType || 'plugin')
    })

    registerSafe(intelligenceApiEvents.getAllQuotas, 'Get all quotas', async (_data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.getAllQuotas()
    })

    registerSafe(intelligenceApiEvents.checkQuota, 'Check quota', async (data, context) => {
      assertHostOwnedIntelligenceControlPlane(context)
      const { callerId, callerType, estimatedTokens } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.checkQuota(
        callerId,
        callerType || 'plugin',
        estimatedTokens || 0
      )
    })

    registerSafe(
      intelligenceApiEvents.getCurrentUsage,
      'Get current usage',
      async (data, context) => {
        assertHostOwnedIntelligenceControlPlane(context)
        const { callerId, callerType } = data
        if (!callerId) {
          throw new Error('callerId is required')
        }
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        return await intelligenceQuotaManager.getCurrentUsage(callerId, callerType || 'plugin')
      }
    )
  }
}

export const intelligenceModule = new IntelligenceModule()
