import type {
  IntelligenceAgentPayload,
  IntelligenceAgentResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  PromptWorkflowExecution,
  WorkflowDefinition,
  WorkflowDefinitionStep,
  WorkflowRunRecord
} from '@talex-touch/tuff-intelligence'
import type { AgentResult, AgentTask, AgentTraceStep, AgentUsage } from '@talex-touch/utils'
import type {
  AiAgentProfile,
  AiAutomationApproveRequest,
  AiAutomationDefinition,
  AiAutomationPolicy,
  AiAutomationRunNowRequest,
  AiAutomationRunRecord,
  AiImportApplyRequest,
  AiImportApplyResult,
  AiImportedConfigItem,
  AiImportedItemCloneRequest,
  AiImportedItemSetActiveRequest,
  AiImportPreviewRequest,
  AiImportScanResult,
  AiOrchestratorExecuteRequest,
  AiOrchestratorRunListRequest,
  AiOrchestratorRunRecord,
  AiOrchestratorSnapshot,
  AiExecutionBudget,
  AiDelegationNode,
  AiDelegationPlan
} from '@talex-touch/utils/types/ai-orchestrator'
import type { WorkflowExecutionContext } from './intelligence-workflow-service'
import { createHash, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { AgentStatus, structuredStrictStringify } from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'
import { agentManager, toolRegistry } from './agents'
import { normalizeAutomationPolicy } from './ai-automation-policy'
import { aiAutomationScheduler } from './ai-automation-scheduler'
import { aiCliImportService } from './ai-cli-import-service'
import { aiImportedConfigRuntime } from './ai-imported-config-runtime'
import { aiOrchestratorStore, DEFAULT_PROFILE_ID } from './ai-orchestrator-store'
import {
  PiAgentRuntimeHost,
  resolvePiRuntimeToolSpecs,
  sanitizeToolOutputForRuntime
} from './pi-agent-runtime-host'
import {
  approvalRequirementFromControlError,
  createApprovalRequiredError,
  createRunInterruptedError,
  INTERRUPTED_TOOL_CALL_PREFIX,
  isInterruptedToolCallControlError,
  isRunCancelledControlError,
  isRunInterruptedControlError
} from './pi-agent-runtime-control-error'
import { formatStableToolError, projectToolErrorCode } from './tool-error-projection'

const orchestratorLog = createLogger('Intelligence').child('AiCliOrchestrator')

function delegationApprovalFingerprint(plan: AiDelegationPlan): string {
  const fingerprintInput = {
    kind: 'delegation',
    parentRunId: plan.parentRunId,
    maxConcurrency: plan.maxConcurrency,
    nodes: plan.nodes.map((node) => ({
      nodeId: node.nodeId,
      profileId: node.profileId,
      objective: node.objective,
      dependsOn: node.dependsOn,
      requestedTools: node.requestedTools,
      requestedMcpServers: node.requestedMcpServers,
      budget: node.budget
    }))
  }
  return `delegation:${createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex')}`
}

const AI_RUN_FAILED = 'AI_RUN_FAILED: AI run failed.'
const AI_RUN_CANCELLED = 'AI_RUN_CANCELLED: AI run was cancelled.'
const AI_RUN_INTERRUPTED = 'AI_RUN_INTERRUPTED: AI run was interrupted.'
const AI_RUN_INPUT_UNAVAILABLE = 'AI_RUN_INPUT_UNAVAILABLE: AI run input is no longer available.'
const AI_RUN_AUTHORITY_CHANGED = 'AI_RUN_AUTHORITY_CHANGED: AI run authority changed.'
const AI_RUN_PRIVACY_DELETION_FENCED = 'AI_RUN_PRIVACY_DELETION_FENCED: AI run is being deleted.'
const AI_RUN_METADATA_SCHEMA_VERSION = 1
const STABLE_PERSISTED_TOOL_ERROR = formatStableToolError(
  projectToolErrorCode('TOOL_EXECUTION_FAILED')
)
const PI_EVENT_MESSAGE_ROLES = new Set(['assistant', 'system', 'toolResult', 'user'])
const PI_EVENT_STOP_REASONS = new Set(['aborted', 'error', 'length', 'pending', 'stop', 'toolUse'])
const PI_EVENT_UPDATE_TYPES = new Set([
  'done',
  'error',
  'start',
  'text_delta',
  'text_end',
  'text_start',
  'thinking_delta',
  'thinking_end',
  'thinking_start',
  'toolcall_delta',
  'toolcall_end',
  'toolcall_start'
])

function opaqueRuntimeReference(namespace: 'pi-call' | 'pi-tool', value: string): string {
  const digest = createHash('sha256').update(`${namespace}\0${value}`).digest('hex').slice(0, 32)
  return `${namespace}:${digest}`
}

function createOrchestratorRunId(): string {
  return `run_${randomUUID().replaceAll('-', '')}`
}

function digestStructuredValue(value: unknown): string {
  return createHash('sha256').update(structuredStrictStringify(value)).digest('hex')
}

function profileAuthorityDigest(profile: AiAgentProfile): string {
  return digestStructuredValue({
    id: profile.id,
    runtimeProvider: profile.runtimeProvider,
    enabled: profile.enabled,
    allowedToolIds: profile.allowedToolIds,
    enabledSkillIds: profile.enabledSkillIds,
    permissionPolicy: profile.permissionPolicy,
    timeoutMs: profile.timeoutMs,
    updatedAt: profile.updatedAt
  })
}

function automationPolicyDigest(policy: AiAutomationPolicy): string {
  return digestStructuredValue(policy)
}

function toAllowedToolRefs(toolIds: readonly string[]): string[] {
  return Array.from(
    new Set(toolIds.map((toolId) => opaqueRuntimeReference('pi-tool', toolId)))
  ).sort()
}

function resolvePersistedAllowedToolIds(
  metadata: Record<string, unknown>,
  profile: AiAgentProfile
): string[] {
  if (metadata.schemaVersion !== AI_RUN_METADATA_SCHEMA_VERSION) {
    throw new Error(AI_RUN_AUTHORITY_CHANGED)
  }
  if (
    metadata.profileAuthorityVersion !== profile.updatedAt ||
    metadata.profileAuthorityDigest !== profileAuthorityDigest(profile)
  ) {
    throw new Error(AI_RUN_AUTHORITY_CHANGED)
  }

  const refs = Array.isArray(metadata.allowedToolRefs) ? metadata.allowedToolRefs : []
  if (
    refs.some((ref) => !isOpaqueRuntimeReference('pi-tool', ref)) ||
    new Set(refs).size !== refs.length ||
    refs.some((ref, index) => index > 0 && String(refs[index - 1]) > String(ref))
  ) {
    throw new Error(AI_RUN_AUTHORITY_CHANGED)
  }

  const byRef = new Map<string, string>()
  for (const toolId of profile.allowedToolIds) {
    const ref = opaqueRuntimeReference('pi-tool', toolId)
    if (byRef.has(ref)) throw new Error(AI_RUN_AUTHORITY_CHANGED)
    byRef.set(ref, toolId)
  }
  return refs.map((ref) => {
    const toolId = byRef.get(String(ref))
    if (!toolId) throw new Error(AI_RUN_AUTHORITY_CHANGED)
    return toolId
  })
}

function isOpaqueRuntimeReference(
  namespace: 'pi-call' | 'pi-tool',
  value: unknown
): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${namespace}:`)) return false
  return /^[a-f0-9]{32}$/.test(value.slice(namespace.length + 1))
}

function boundedCount(value: unknown): number {
  return Array.isArray(value) ? Math.min(value.length, 10_000) : 0
}

function boundedIndex(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000
    ? value
    : undefined
}

function stableEnum(value: unknown, allowed: ReadonlySet<string>): string | undefined {
  return typeof value === 'string' && allowed.has(value) ? value : undefined
}

function projectPiMessage(payload: Record<string, unknown>): Record<string, unknown> {
  const message = toRecord(payload.message)
  const role = stableEnum(message.role, PI_EVENT_MESSAGE_ROLES)
  const stopReason = stableEnum(message.stopReason, PI_EVENT_STOP_REASONS)
  return {
    ...(role ? { role } : {}),
    ...(stopReason ? { stopReason } : {}),
    contentBlockCount: boundedCount(message.content),
    hasError: typeof message.errorMessage === 'string' || stopReason === 'error'
  }
}

function projectPiEvent(
  type: string,
  payload: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const record = toRecord(payload)
  switch (type) {
    case 'agent_start':
    case 'turn_start':
      return {}
    case 'agent_end':
      return { messageCount: boundedCount(record.messages) }
    case 'turn_end':
      return {
        ...projectPiMessage(record),
        toolResultCount: boundedCount(record.toolResults)
      }
    case 'message_start':
    case 'message_end':
      return projectPiMessage(record)
    case 'message_update': {
      const update = toRecord(record.assistantMessageEvent)
      const updateType = stableEnum(update.type, PI_EVENT_UPDATE_TYPES)
      const contentIndex = boundedIndex(update.contentIndex)
      const reason = stableEnum(update.reason, PI_EVENT_STOP_REASONS)
      return {
        ...(updateType ? { updateType } : {}),
        ...(contentIndex === undefined ? {} : { contentIndex }),
        ...(reason ? { reason } : {})
      }
    }
    case 'tool_execution_start':
    case 'tool_execution_update':
    case 'tool_execution_end': {
      const toolCallId = typeof record.toolCallId === 'string' ? record.toolCallId : ''
      const toolName = typeof record.toolName === 'string' ? record.toolName : ''
      return {
        ...(toolCallId ? { toolCallRef: opaqueRuntimeReference('pi-call', toolCallId) } : {}),
        ...(toolName ? { toolRef: opaqueRuntimeReference('pi-tool', toolName) } : {}),
        ...(type === 'tool_execution_start' || type === 'tool_execution_update'
          ? { argumentCount: Math.min(Object.keys(toRecord(record.args)).length, 10_000) }
          : {}),
        ...(type === 'tool_execution_update'
          ? { hasPartialResult: Object.hasOwn(record, 'partialResult') }
          : {}),
        ...(type === 'tool_execution_end' && typeof record.isError === 'boolean'
          ? { isError: record.isError }
          : {})
      }
    }
    default:
      return undefined
  }
}

function toObjective(task: AgentTask): string {
  if (task.type === 'plan') {
    return `Create and return an executable plan for this task:\n${JSON.stringify(task.input)}`
  }
  if (task.type === 'chat') {
    return typeof task.input === 'string'
      ? task.input
      : `Continue this agent conversation:\n${JSON.stringify(task.input)}`
  }
  return typeof task.input === 'string'
    ? task.input
    : `Complete this task:\n${JSON.stringify(task.input)}`
}

function intersectTools(profileTools: string[], requestedTools?: string[]): string[] {
  if (!requestedTools) return [...profileTools]
  const requested = new Set(requestedTools)
  return profileTools.filter((toolId) => requested.has(toolId))
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const finite = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, Math.floor(finite)))
}

function resolveExecutionBudget(request: AiOrchestratorExecuteRequest): AiExecutionBudget {
  const budget = request.budget ?? {}
  return {
    maxSteps: boundedInteger(budget.maxSteps, 20, 1, 100),
    maxToolCalls: boundedInteger(budget.maxToolCalls, 20, 1, 100),
    maxCost:
      typeof budget.maxCost === 'number' && Number.isFinite(budget.maxCost) && budget.maxCost >= 0
        ? budget.maxCost
        : undefined,
    maxChildRuns: boundedInteger(budget.maxChildRuns, 8, 0, 32),
    maxConcurrency: boundedInteger(budget.maxConcurrency, 4, 1, 16)
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const RUN_METADATA_KEYS = [
  'schemaVersion',
  'executionBudget',
  'allowedToolRefs',
  'requestInputPresent',
  'requestInputDigest',
  'profileAuthorityVersion',
  'profileAuthorityDigest',
  'automationPolicyVersion',
  'automationPolicyDigest',
  'automationAuthorityVersion',
  'pendingApprovalFingerprint',
  'pendingApprovalKind',
  'pendingApprovalReason',
  'approvalGrantFingerprint',
  'approvalGrantAt'
] as const

function projectPersistedRunMetadata(value: unknown): Record<string, unknown> {
  const source = toRecord(value)
  const projected = Object.fromEntries(
    RUN_METADATA_KEYS.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]])
  )

  const rawStates = toRecord(source.toolCallStates)
  const stateEntries: Array<[string, Record<string, unknown>]> = []
  for (const [rawCallRef, rawState] of Object.entries(rawStates).slice(0, 10_000)) {
    const state = toRecord(rawState)
    if (state.state !== 'started' && state.state !== 'completed') continue
    const toolCallRef = isOpaqueRuntimeReference('pi-call', rawCallRef)
      ? rawCallRef
      : opaqueRuntimeReference('pi-call', rawCallRef)
    const toolRef = isOpaqueRuntimeReference('pi-tool', state.toolRef)
      ? state.toolRef
      : typeof state.toolId === 'string' && state.toolId
        ? opaqueRuntimeReference('pi-tool', state.toolId)
        : undefined
    stateEntries.push([
      toolCallRef,
      {
        state: state.state,
        ...(toolRef ? { toolRef } : {}),
        ...(typeof state.startedAt === 'number' ? { startedAt: state.startedAt } : {}),
        ...(typeof state.completedAt === 'number' ? { completedAt: state.completedAt } : {})
      }
    ])
  }
  const projectedStates = Object.fromEntries(stateEntries)
  if (Object.keys(rawStates).length > 0) projected.toolCallStates = projectedStates

  const rawResults = toRecord(source.completedToolCallResults)
  const resultEntries: Array<[string, { error: string } | { output: unknown }]> = []
  for (const [rawCallRef, rawResult] of Object.entries(rawResults).slice(0, 10_000)) {
    const result = toRecord(rawResult)
    const toolCallRef = isOpaqueRuntimeReference('pi-call', rawCallRef)
      ? rawCallRef
      : opaqueRuntimeReference('pi-call', rawCallRef)
    if (typeof result.error === 'string') {
      resultEntries.push([toolCallRef, { error: STABLE_PERSISTED_TOOL_ERROR }])
    } else if (Object.hasOwn(result, 'output')) {
      resultEntries.push([toolCallRef, { output: sanitizeToolOutputForRuntime(result.output) }])
    }
  }
  const projectedResults = Object.fromEntries(resultEntries)
  if (Object.keys(rawResults).length > 0) {
    projected.completedToolCallResults = projectedResults
  }
  return projected
}

function normalizeInlineWorkflow(payload: unknown): WorkflowDefinition {
  const data = toRecord(payload)
  const rawSteps = Array.isArray(data.steps) ? data.steps : []
  if (rawSteps.length === 0) {
    throw new Error('[Intelligence] workflow.execute requires non-empty steps')
  }
  const steps: WorkflowDefinitionStep[] = rawSteps.map((item, index) => {
    const step = toRecord(item)
    const kind = String(step.kind || '')
    if (kind !== 'prompt' && kind !== 'tool' && kind !== 'agent' && kind !== 'model') {
      throw new Error(`Workflow step ${String(step.id || index + 1)} requires explicit kind`)
    }
    const toolId = typeof step.toolId === 'string' ? step.toolId.trim() : ''
    const agentId = typeof step.agentId === 'string' ? step.agentId.trim() : ''
    if (kind === 'tool' && !toolId) throw new Error('Workflow tool step requires toolId')
    if (kind === 'agent' && !agentId) throw new Error('Workflow agent step requires agentId')
    return {
      id: String(step.id || `inline-step-${index + 1}`),
      name: String(step.name || `Step ${index + 1}`),
      description: typeof step.description === 'string' ? step.description : undefined,
      kind,
      prompt: typeof step.prompt === 'string' ? step.prompt : undefined,
      toolId: toolId || undefined,
      toolSource: step.toolSource === 'mcp' ? 'mcp' : 'builtin',
      agentId: agentId || undefined,
      input: toRecord(step.input),
      continueOnError: step.continueOnError === true,
      metadata: toRecord(step.metadata)
    }
  })
  return {
    id: 'inline.workflow',
    name: 'Inline Workflow',
    description: 'Inline workflow executed by the Tuff Pi coordinator.',
    version: '1',
    enabled: true,
    triggers: [{ type: 'manual', enabled: true, label: 'Manual' }],
    contextSources: [],
    toolSources: ['builtin', 'mcp'],
    approvalPolicy: { requireApprovalAtOrAbove: 'high', autoApproveReadOnly: true },
    steps,
    metadata: { contract: 'workflow.execute.inline' }
  }
}

function toPromptWorkflowExecution(run: WorkflowRunRecord): PromptWorkflowExecution {
  const normalizedStatus =
    run.status === 'running' ||
    run.status === 'completed' ||
    run.status === 'failed' ||
    run.status === 'cancelled'
      ? run.status
      : 'pending'
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: normalizedStatus,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    inputs: run.inputs,
    outputs: run.outputs,
    steps: run.steps.map((step, index) => ({
      stepId: step.workflowStepId || step.id || `step-${index + 1}`,
      status:
        step.status === 'running' ||
        step.status === 'completed' ||
        step.status === 'failed' ||
        step.status === 'skipped'
          ? step.status
          : 'pending',
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      input: step.input,
      output: step.output,
      error: step.error
    })),
    error: run.error
  }
}

export class AiCliOrchestrator {
  private initialized = false
  private closing = false
  private shutdownPromise: Promise<void> | null = null
  private readonly activeExecutions = new Set<Promise<unknown>>()
  private readonly toolCallMetadataMutations = new Map<string, Promise<unknown>>()
  private readonly privacyRunDeletionFences = new Set<string>()
  private readonly runWriteLeaseCounts = new Map<string, number>()
  private readonly volatileRunInputs = new Map<string, { digest: string; input: unknown }>()
  private readonly trustedAllowedToolIds = new Map<string, readonly string[]>()
  private readonly trustedAutomationPolicies = new Map<string, AiAutomationPolicy>()
  private readonly agentTaskRunIds = new Map<string, string>()
  private readonly runtimeHost = new PiAgentRuntimeHost({
    onEvent: async (event) => {
      const payload = projectPiEvent(event.type, event.payload)
      if (!payload) return
      await this.withRunWriteLease(event.runId, async () => {
        await aiOrchestratorStore.appendOrchestratorEvent(event.runId, event.type, payload, 'info')
      })
    },
    loadToolCallResult: async (runId, toolCallId, toolId) => {
      const toolCallRef = opaqueRuntimeReference('pi-call', toolCallId)
      const toolRef = opaqueRuntimeReference('pi-tool', toolId)
      return await this.mutateToolCallMetadata(runId, (metadata) => {
        const completedToolCallResults = { ...toRecord(metadata.completedToolCallResults) }
        const toolCallStates = { ...toRecord(metadata.toolCallStates) }
        const hasOpaqueResult = Object.hasOwn(completedToolCallResults, toolCallRef)
        const hasLegacyResult = Object.hasOwn(completedToolCallResults, toolCallId)
        const hasOpaqueState = Object.hasOwn(toolCallStates, toolCallRef)
        const hasLegacyState = Object.hasOwn(toolCallStates, toolCallId)
        const sourceResult = toRecord(
          hasOpaqueResult
            ? completedToolCallResults[toolCallRef]
            : completedToolCallResults[toolCallId]
        )
        const sourceState = toRecord(
          hasOpaqueState ? toolCallStates[toolCallRef] : toolCallStates[toolCallId]
        )

        delete completedToolCallResults[toolCallId]
        delete toolCallStates[toolCallId]

        const persistedToolRef = isOpaqueRuntimeReference('pi-tool', sourceState.toolRef)
          ? sourceState.toolRef
          : typeof sourceState.toolId === 'string'
            ? opaqueRuntimeReference('pi-tool', sourceState.toolId)
            : undefined
        const hasDurableOutcome = hasOpaqueResult || hasLegacyResult
        const hasDurableState = hasOpaqueState || hasLegacyState
        const toolIdentityMatches = persistedToolRef === toolRef
        const projectedResult =
          typeof sourceResult.error === 'string'
            ? { error: STABLE_PERSISTED_TOOL_ERROR }
            : Object.hasOwn(sourceResult, 'output')
              ? { output: sanitizeToolOutputForRuntime(sourceResult.output) }
              : undefined

        if ((hasDurableOutcome || hasDurableState) && !toolIdentityMatches) {
          if (hasDurableOutcome) {
            completedToolCallResults[toolCallRef] = { error: STABLE_PERSISTED_TOOL_ERROR }
          }
          metadata.completedToolCallResults = completedToolCallResults
          metadata.toolCallStates = toolCallStates
          return {
            value: { error: STABLE_PERSISTED_TOOL_ERROR },
            event: {
              type: 'tool.call.replay_rejected',
              payload: { toolCallRef, toolRef, reason: 'tool_identity_mismatch' }
            }
          }
        }

        if (hasDurableState) {
          toolCallStates[toolCallRef] = {
            state: sourceState.state === 'completed' ? 'completed' : 'started',
            toolRef,
            ...(typeof sourceState.startedAt === 'number'
              ? { startedAt: sourceState.startedAt }
              : {}),
            ...(typeof sourceState.completedAt === 'number'
              ? { completedAt: sourceState.completedAt }
              : {})
          }
        }
        if (projectedResult) completedToolCallResults[toolCallRef] = projectedResult
        metadata.completedToolCallResults = completedToolCallResults
        metadata.toolCallStates = toolCallStates

        const value =
          sourceState.state === 'started'
            ? { error: `${INTERRUPTED_TOOL_CALL_PREFIX}${toolCallId}` }
            : sourceState.state === 'completed' && projectedResult
              ? projectedResult
              : hasDurableOutcome || hasDurableState
                ? { error: STABLE_PERSISTED_TOOL_ERROR }
                : undefined
        return {
          value,
          persist: hasDurableOutcome || hasDurableState,
          event:
            hasLegacyResult || hasLegacyState
              ? {
                  type: 'tool.call.legacy_migrated',
                  payload: { toolCallRef, toolRef }
                }
              : undefined
        }
      })
    },
    persistToolCallResult: async (runId, toolCallId, result) => {
      const toolCallRef = opaqueRuntimeReference('pi-call', toolCallId)
      await this.mutateToolCallMetadata(runId, (metadata) => {
        const completedToolCallResults = { ...toRecord(metadata.completedToolCallResults) }
        const toolCallStates = { ...toRecord(metadata.toolCallStates) }
        const currentState = toRecord(
          Object.hasOwn(toolCallStates, toolCallRef)
            ? toolCallStates[toolCallRef]
            : toolCallStates[toolCallId]
        )
        if (
          currentState.state !== 'started' ||
          !isOpaqueRuntimeReference('pi-tool', currentState.toolRef)
        ) {
          throw new Error('Tool call result has no matching durable start state')
        }
        delete completedToolCallResults[toolCallId]
        delete toolCallStates[toolCallId]
        completedToolCallResults[toolCallRef] =
          typeof toRecord(result).error === 'string'
            ? { error: STABLE_PERSISTED_TOOL_ERROR }
            : { output: sanitizeToolOutputForRuntime(toRecord(result).output) }
        metadata.completedToolCallResults = completedToolCallResults
        toolCallStates[toolCallRef] = {
          state: 'completed',
          ...(isOpaqueRuntimeReference('pi-tool', currentState.toolRef)
            ? { toolRef: currentState.toolRef }
            : {}),
          ...(typeof currentState.startedAt === 'number'
            ? { startedAt: currentState.startedAt }
            : {}),
          completedAt: Date.now()
        }
        metadata.toolCallStates = toolCallStates
        return {
          value: undefined,
          event: {
            type: 'tool.call.completed',
            payload: { toolCallRef, hasError: typeof toRecord(result).error === 'string' }
          }
        }
      })
    },
    beginToolCall: async (runId, toolCallId, toolId) => {
      const toolCallRef = opaqueRuntimeReference('pi-call', toolCallId)
      const toolRef = opaqueRuntimeReference('pi-tool', toolId)
      return await this.mutateToolCallMetadata(runId, (metadata) => {
        const toolCallStates = { ...toRecord(metadata.toolCallStates) }
        const currentState = toRecord(
          Object.hasOwn(toolCallStates, toolCallRef)
            ? toolCallStates[toolCallRef]
            : toolCallStates[toolCallId]
        )
        delete toolCallStates[toolCallId]
        if (currentState.state === 'started' || currentState.state === 'completed') {
          const persistedToolRef = isOpaqueRuntimeReference('pi-tool', currentState.toolRef)
            ? currentState.toolRef
            : typeof currentState.toolId === 'string'
              ? opaqueRuntimeReference('pi-tool', currentState.toolId)
              : undefined
          if (persistedToolRef !== toolRef) {
            metadata.toolCallStates = toolCallStates
            return {
              value: 'interrupted' as const,
              event: {
                type: 'tool.call.replay_rejected',
                payload: { toolCallRef, toolRef, reason: 'tool_identity_mismatch' }
              }
            }
          }
          toolCallStates[toolCallRef] = {
            state: currentState.state,
            toolRef,
            ...(typeof currentState.startedAt === 'number'
              ? { startedAt: currentState.startedAt }
              : {}),
            ...(typeof currentState.completedAt === 'number'
              ? { completedAt: currentState.completedAt }
              : {})
          }
          metadata.toolCallStates = toolCallStates
          return {
            value: 'interrupted' as const,
            event: { type: 'tool.call.replay_blocked', payload: { toolCallRef, toolRef } }
          }
        }
        toolCallStates[toolCallRef] = { state: 'started', toolRef, startedAt: Date.now() }
        metadata.toolCallStates = toolCallStates
        return {
          value: 'execute' as const,
          event: { type: 'tool.call.started', payload: { toolCallRef, toolRef } }
        }
      })
    },
    onApprovalConsumed: async (runId, fingerprint) => {
      const run = await aiOrchestratorStore.getOrchestratorRun(runId)
      if (!run) throw new Error(`Orchestrator run ${runId} not found`)
      await this.consumeApprovalGrant(run, fingerprint)
    }
  })

  private async mutateToolCallMetadata<T>(
    runId: string,
    mutate: (metadata: Record<string, unknown>) => {
      value: T
      persist?: boolean
      event?: { type: string; payload: Record<string, unknown> }
    }
  ): Promise<T> {
    const releaseWriteLease = this.acquireRunWriteLease(runId)
    const previous = this.toolCallMetadataMutations.get(runId) ?? Promise.resolve()
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const run = await aiOrchestratorStore.getOrchestratorRun(runId)
        if (!run) throw new Error(`Orchestrator run ${runId} not found`)
        const metadata = projectPersistedRunMetadata(run.metadata)
        const { value, persist = true, event } = mutate(metadata)
        if (persist) {
          await aiOrchestratorStore.updateOrchestratorRun(runId, {
            metadata,
            updatedAt: Date.now()
          })
        }
        if (event) {
          await aiOrchestratorStore.appendOrchestratorEvent(runId, event.type, event.payload)
        }
        return value
      })
    this.toolCallMetadataMutations.set(runId, operation)
    try {
      return await operation
    } finally {
      if (this.toolCallMetadataMutations.get(runId) === operation)
        this.toolCallMetadataMutations.delete(runId)
      releaseWriteLease()
    }
  }

  private trackExecution<T>(operation: () => Promise<T>): Promise<T> {
    const unavailableReason = this.closing
      ? 'AI CLI orchestrator is shutting down'
      : 'AI CLI orchestrator is not initialized'
    if (this.closing || !this.initialized) return Promise.reject(new Error(unavailableReason))

    const execution = Promise.resolve().then(async () => {
      if (this.closing) throw new Error('AI CLI orchestrator is shutting down')
      return await operation()
    })
    this.activeExecutions.add(execution)
    const release = (): void => {
      this.activeExecutions.delete(execution)
    }
    void execution.then(release, release)
    return execution
  }

  private async drainExecutions(): Promise<void> {
    while (this.activeExecutions.size > 0) {
      await Promise.allSettled(Array.from(this.activeExecutions))
    }
    while (this.toolCallMetadataMutations.size > 0) {
      await Promise.allSettled(Array.from(this.toolCallMetadataMutations.values()))
    }
  }

  private assertPrivacyRunWritable(runId: string): void {
    if (this.privacyRunDeletionFences.has(runId)) {
      throw new Error(AI_RUN_PRIVACY_DELETION_FENCED)
    }
  }

  private acquireRunWriteLease(runId: string): () => void {
    this.assertPrivacyRunWritable(runId)
    this.runWriteLeaseCounts.set(runId, (this.runWriteLeaseCounts.get(runId) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const remaining = (this.runWriteLeaseCounts.get(runId) ?? 1) - 1
      if (remaining > 0) this.runWriteLeaseCounts.set(runId, remaining)
      else this.runWriteLeaseCounts.delete(runId)
    }
  }

  private async withRunWriteLease<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const release = this.acquireRunWriteLease(runId)
    try {
      return await operation()
    } finally {
      release()
    }
  }

  async initialize(): Promise<void> {
    if (this.shutdownPromise) {
      await this.shutdownPromise
      this.shutdownPromise = null
    }
    if (this.initialized) return
    this.closing = false
    await aiOrchestratorStore.initialize()
    await aiImportedConfigRuntime.initialize()
    await this.recoverPersistedRuns()
    this.registerDelegationTool()
    this.registerImportedRuntimeTools()
    aiAutomationScheduler.setExecutor((request, automationId) =>
      this.execute(request, automationId)
    )
    try {
      if (this.closing) throw new Error('AI CLI orchestrator is shutting down')
      this.initialized = true
      await aiAutomationScheduler.initialize()
      orchestratorLog.info('AI CLI orchestrator control plane initialized')
    } catch (error) {
      this.initialized = false
      await aiAutomationScheduler.stop().catch(() => undefined)
      await this.runtimeHost.stop().catch(() => undefined)
      throw error
    }
  }

  private async recoverPersistedRuns(): Promise<void> {
    const recoverable = new Map<string, AiOrchestratorRunRecord>()
    for (const status of ['queued', 'running'] as const) {
      const runs = await aiOrchestratorStore.listOrchestratorRuns({ status, limit: 200 })
      for (const run of runs) {
        if (run.status === status) recoverable.set(run.id, run)
      }
    }
    const interruptedAt = Date.now()
    for (const run of recoverable.values()) {
      const error = `Run was interrupted by application restart while ${run.status}`
      await this.withRunWriteLease(run.id, async () => {
        await aiOrchestratorStore.updateOrchestratorRun(run.id, {
          status: 'interrupted',
          error,
          metadata: projectPersistedRunMetadata(run.metadata),
          completedAt: interruptedAt,
          updatedAt: interruptedAt
        })
        await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.interrupted', {
          reason: 'application_restart',
          previousStatus: run.status
        })
      })
    }
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    this.closing = true
    this.initialized = false
    this.shutdownPromise = this.performShutdown()
    return this.shutdownPromise
  }

  private async performShutdown(): Promise<void> {
    const failures: unknown[] = []
    try {
      await aiAutomationScheduler.stop()
    } catch (error) {
      failures.push(error)
    }
    try {
      await this.runtimeHost.stop()
    } catch (error) {
      failures.push(error)
    }
    await this.drainExecutions()
    this.volatileRunInputs.clear()
    this.trustedAllowedToolIds.clear()
    this.trustedAutomationPolicies.clear()
    this.agentTaskRunIds.clear()
    if (failures.length > 0) throw failures[0]
  }

  isReady(): boolean {
    return this.initialized && this.runtimeHost.isReady()
  }

  isPrivacyRunProtected(runId: string): boolean {
    return (
      this.privacyRunDeletionFences.has(runId) ||
      this.runtimeHost.isRunActive(runId) ||
      this.toolCallMetadataMutations.has(runId) ||
      (this.runWriteLeaseCounts.get(runId) ?? 0) > 0
    )
  }

  acquirePrivacyRunDeletionFence(runId: string): (() => void) | null {
    if (this.isPrivacyRunProtected(runId)) return null
    this.privacyRunDeletionFences.add(runId)
    let released = false
    return () => {
      if (released) return
      released = true
      this.privacyRunDeletionFences.delete(runId)
    }
  }

  private clearVolatileRunState(runId: string): void {
    this.volatileRunInputs.delete(runId)
    this.trustedAllowedToolIds.delete(runId)
    this.trustedAutomationPolicies.delete(runId)
  }

  private async interruptPendingRun(
    run: AiOrchestratorRunRecord,
    publicError: string
  ): Promise<AiOrchestratorRunRecord> {
    const interruptedAt = Date.now()
    const metadata = projectPersistedRunMetadata(run.metadata)
    delete metadata.pendingApprovalFingerprint
    delete metadata.pendingApprovalKind
    delete metadata.pendingApprovalReason
    delete metadata.approvalGrantFingerprint
    delete metadata.approvalGrantAt
    const interrupted: AiOrchestratorRunRecord = {
      ...run,
      status: 'interrupted',
      error: publicError,
      approvalReason: undefined,
      metadata,
      completedAt: interruptedAt,
      updatedAt: interruptedAt
    }
    await this.withRunWriteLease(run.id, async () => {
      await aiOrchestratorStore.updateOrchestratorRun(run.id, interrupted)
      await aiOrchestratorStore.appendOrchestratorEvent(
        run.id,
        'run.interrupted',
        {
          reason:
            publicError === AI_RUN_INPUT_UNAVAILABLE ? 'input_unavailable' : 'authority_changed'
        },
        'warn'
      )
    })
    this.clearVolatileRunState(run.id)
    return interrupted
  }

  private async restoreRunAuthority(run: AiOrchestratorRunRecord): Promise<{
    profile: AiAgentProfile
    allowedToolIds: string[]
    automationPolicy?: AiAutomationPolicy
    input?: unknown
  }> {
    const metadata = toRecord(run.metadata)
    const profile = await aiOrchestratorStore.getProfile(run.profileId)
    if (!profile || !profile.enabled) throw new Error(AI_RUN_AUTHORITY_CHANGED)
    const allowedToolIds = resolvePersistedAllowedToolIds(metadata, profile)

    let automationPolicy = this.trustedAutomationPolicies.get(run.id)
    const expectedPolicyDigest =
      typeof metadata.automationPolicyDigest === 'string'
        ? metadata.automationPolicyDigest
        : undefined
    if (run.automationId) {
      const definition = await aiOrchestratorStore.getAutomation(run.automationId)
      if (!definition || !definition.enabled) throw new Error(AI_RUN_AUTHORITY_CHANGED)
      const currentPolicy = normalizeAutomationPolicy(definition, definition.policy)
      if (
        metadata.automationAuthorityVersion !== definition.updatedAt ||
        metadata.automationPolicyVersion !== currentPolicy.version ||
        expectedPolicyDigest !== automationPolicyDigest(currentPolicy)
      ) {
        throw new Error(AI_RUN_AUTHORITY_CHANGED)
      }
      automationPolicy = currentPolicy
    } else if (expectedPolicyDigest) {
      if (
        !automationPolicy ||
        metadata.automationPolicyVersion !== automationPolicy.version ||
        expectedPolicyDigest !== automationPolicyDigest(automationPolicy)
      ) {
        throw new Error(AI_RUN_AUTHORITY_CHANGED)
      }
    } else if (automationPolicy) {
      throw new Error(AI_RUN_AUTHORITY_CHANGED)
    }

    const inputPresent = metadata.requestInputPresent
    if (typeof inputPresent !== 'boolean') throw new Error(AI_RUN_AUTHORITY_CHANGED)
    let input: unknown
    if (inputPresent) {
      const expectedInputDigest =
        typeof metadata.requestInputDigest === 'string' ? metadata.requestInputDigest : ''
      if (!/^[a-f0-9]{64}$/.test(expectedInputDigest)) {
        throw new Error(AI_RUN_AUTHORITY_CHANGED)
      }
      const volatileInput = this.volatileRunInputs.get(run.id)
      if (
        volatileInput &&
        volatileInput.digest === expectedInputDigest &&
        digestStructuredValue(volatileInput.input) === expectedInputDigest
      ) {
        input = volatileInput.input
      } else if (run.automationId) {
        const definition = await aiOrchestratorStore.getAutomation(run.automationId)
        if (
          !definition ||
          definition.input === undefined ||
          digestStructuredValue(definition.input) !== expectedInputDigest
        ) {
          throw new Error(AI_RUN_INPUT_UNAVAILABLE)
        }
        input = definition.input
        this.volatileRunInputs.set(run.id, { digest: expectedInputDigest, input })
      } else {
        throw new Error(AI_RUN_INPUT_UNAVAILABLE)
      }
    } else if (metadata.requestInputDigest !== undefined) {
      throw new Error(AI_RUN_AUTHORITY_CHANGED)
    }

    this.trustedAllowedToolIds.set(run.id, Object.freeze([...allowedToolIds]))
    if (automationPolicy) this.trustedAutomationPolicies.set(run.id, automationPolicy)
    return { profile, allowedToolIds, automationPolicy, input }
  }

  execute(
    request: AiOrchestratorExecuteRequest,
    automationId?: string
  ): Promise<AiOrchestratorRunRecord> {
    return this.trackExecution(() => this.executeInternal(request, automationId))
  }

  private async executeInternal(
    request: AiOrchestratorExecuteRequest,
    automationId?: string
  ): Promise<AiOrchestratorRunRecord> {
    if (!automationId) return await this.executeWithAuthority(request)
    const definition = await aiOrchestratorStore.getAutomation(automationId)
    if (!definition || !definition.enabled) {
      throw new Error(`Automation ${automationId} is unavailable`)
    }
    const policy = normalizeAutomationPolicy(definition, definition.policy)
    return await this.executeWithAuthority(
      {
        ...request,
        objective: definition.objective,
        input: definition.input,
        profileId: definition.profileId,
        cwd: definition.cwd,
        timeoutMs: Math.min(definition.timeoutMs ?? policy.timeoutMs, policy.timeoutMs),
        allowedToolIds: policy.allowedToolIds,
        budget: policy.budget
      },
      automationId,
      policy,
      definition.updatedAt
    )
  }

  private async executeWithAuthority(
    request: AiOrchestratorExecuteRequest,
    automationId?: string,
    automationPolicy?: AiAutomationPolicy,
    automationAuthorityVersion?: number,
    admittedRunId?: string
  ): Promise<AiOrchestratorRunRecord> {
    if (this.closing) throw createRunInterruptedError()
    if (!this.initialized) throw new Error('AI CLI orchestrator is not initialized')
    const objective = String(request.objective || '').trim()
    if (!objective) throw new Error('Objective is required')
    const profile = await aiOrchestratorStore.getProfile(request.profileId || DEFAULT_PROFILE_ID)
    if (!profile || !profile.enabled) {
      throw new Error(`Agent profile ${request.profileId || DEFAULT_PROFILE_ID} is unavailable`)
    }
    const runtimeProvider = profile.runtimeProvider
    const authorityToolIds = automationPolicy
      ? intersectTools(automationPolicy.allowedToolIds, request.allowedToolIds)
      : request.allowedToolIds
    const allowedToolIds = intersectTools(profile.allowedToolIds, authorityToolIds)
    const requestedCwd = resolve(request.cwd || process.cwd())
    const cwd = await realpath(requestedCwd).catch(() => requestedCwd)
    await aiImportedConfigRuntime.assertAgentProfileVisible(profile.id, cwd)
    const budget = resolveExecutionBudget(request)
    const now = Date.now()
    const runId = admittedRunId ?? createOrchestratorRunId()
    const requestInputPresent = request.input !== undefined
    const requestInputDigest = requestInputPresent
      ? digestStructuredValue(request.input)
      : undefined
    const run: AiOrchestratorRunRecord = {
      id: runId,
      automationId,
      sessionId: request.sessionId || randomUUID(),
      objective,
      profileId: profile.id,
      runtimeProvider,
      cwd,
      status: 'queued',
      metadata: {
        schemaVersion: AI_RUN_METADATA_SCHEMA_VERSION,
        executionBudget: budget,
        allowedToolRefs: toAllowedToolRefs(allowedToolIds),
        requestInputPresent,
        ...(requestInputDigest ? { requestInputDigest } : {}),
        profileAuthorityVersion: profile.updatedAt,
        profileAuthorityDigest: profileAuthorityDigest(profile),
        ...(automationPolicy
          ? {
              automationPolicyVersion: automationPolicy.version,
              automationPolicyDigest: automationPolicyDigest(automationPolicy),
              ...(automationAuthorityVersion === undefined ? {} : { automationAuthorityVersion })
            }
          : {})
      },
      parentRunId: request.parentRunId,
      createdAt: now,
      updatedAt: now
    }
    if (requestInputPresent && requestInputDigest) {
      this.volatileRunInputs.set(run.id, { digest: requestInputDigest, input: request.input })
    }
    this.trustedAllowedToolIds.set(run.id, Object.freeze([...allowedToolIds]))
    if (automationPolicy) this.trustedAutomationPolicies.set(run.id, automationPolicy)
    await this.withRunWriteLease(run.id, async () => {
      try {
        await aiOrchestratorStore.createOrchestratorRun(run)
      } catch (error) {
        this.clearVolatileRunState(run.id)
        throw error
      }
      await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.queued', {
        runtimeProvider,
        profileId: profile.id,
        automationId
      })
    })

    return await this.executePreparedRun(
      run,
      {
        ...request,
        objective,
        cwd,
        approved: false,
        allowedToolIds,
        budget,
        metadata: automationPolicy ? { automationPolicy } : undefined
      },
      profile,
      allowedToolIds,
      budget
    )
  }

  approveRun(runId: string): Promise<AiOrchestratorRunRecord> {
    return this.trackExecution(() => this.approveRunInternal(runId))
  }

  private async approveRunInternal(runId: string): Promise<AiOrchestratorRunRecord> {
    const run = await aiOrchestratorStore.getOrchestratorRun(runId)
    if (!run) throw new Error(`Orchestrator run ${runId} not found`)
    if (run.status !== 'pending_approval')
      throw new Error(`Orchestrator run ${runId} is not pending approval`)
    let authority: {
      profile: AiAgentProfile
      allowedToolIds: string[]
      automationPolicy?: AiAutomationPolicy
      input?: unknown
    }
    try {
      authority = await this.restoreRunAuthority(run)
    } catch (error) {
      const publicError =
        error instanceof Error && error.message === AI_RUN_INPUT_UNAVAILABLE
          ? AI_RUN_INPUT_UNAVAILABLE
          : AI_RUN_AUTHORITY_CHANGED
      return await this.interruptPendingRun(run, publicError)
    }
    const pendingFingerprint =
      typeof run.metadata?.pendingApprovalFingerprint === 'string'
        ? run.metadata.pendingApprovalFingerprint
        : ''
    if (!pendingFingerprint)
      throw new Error(`Orchestrator run ${runId} has no approvable pending requirement`)
    const approvedAt = Date.now()
    const metadata = projectPersistedRunMetadata(run.metadata)
    delete metadata.approved
    delete metadata.approvalGranted
    delete metadata.approvedAt
    delete metadata.pendingApprovalFingerprint
    delete metadata.pendingApprovalKind
    delete metadata.pendingApprovalReason
    metadata.approvalGrantFingerprint = pendingFingerprint
    metadata.approvalGrantAt = approvedAt
    const budget = resolveExecutionBudget({
      objective: run.objective,
      budget: toRecord(metadata.executionBudget) as Partial<AiExecutionBudget>
    })
    const allowedToolIds = authority.allowedToolIds
    const pendingKind =
      typeof run.metadata?.pendingApprovalKind === 'string' ? run.metadata.pendingApprovalKind : ''
    const approvedRun: AiOrchestratorRunRecord = {
      ...run,
      status: 'queued',
      error: undefined,
      approvalReason: undefined,
      delegationPlan:
        pendingKind === 'delegation' && run.delegationPlan
          ? { ...run.delegationPlan, status: 'approved', approvedAt }
          : run.delegationPlan,
      metadata,
      updatedAt: approvedAt
    }
    await this.withRunWriteLease(run.id, async () => {
      await aiOrchestratorStore.updateOrchestratorRun(run.id, approvedRun)
      await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.approved', {
        approvalFingerprint: pendingFingerprint,
        approvalKind: pendingKind || 'unknown',
        delegationPlanId: approvedRun.delegationPlan?.planId
      })
    })
    return await this.executePreparedRun(
      approvedRun,
      {
        objective: run.objective,
        input: authority.input,
        profileId: run.profileId,
        cwd: run.cwd,
        approved: false,
        allowedToolIds,
        sessionId: run.sessionId,
        metadata: {
          ...(authority.automationPolicy ? { automationPolicy: authority.automationPolicy } : {}),
          approvalGrantFingerprint: pendingFingerprint
        },
        parentRunId: run.parentRunId,
        budget
      },
      authority.profile,
      allowedToolIds,
      budget
    )
  }

  private async executePreparedRun(
    run: AiOrchestratorRunRecord,
    request: AiOrchestratorExecuteRequest,
    profile: AiAgentProfile,
    allowedToolIds: string[],
    budget: AiExecutionBudget
  ): Promise<AiOrchestratorRunRecord> {
    const releaseWriteLease = this.acquireRunWriteLease(run.id)
    try {
      const startedAt = Date.now()
      try {
        await aiOrchestratorStore.updateOrchestratorRun(run.id, {
          status: 'running',
          startedAt,
          metadata: run.metadata,
          delegationPlan: run.delegationPlan
        })
        await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.started')

        const history = await aiOrchestratorStore.listSessionHistory(run.sessionId, run.id)
        const importedSystemPrompt = await aiImportedConfigRuntime.buildSystemPrompt(
          profile,
          run.cwd,
          run.objective
        )
        const runtimeProfile: AiAgentProfile = {
          ...profile,
          systemPrompt: [profile.systemPrompt, importedSystemPrompt].filter(Boolean).join('\n\n')
        }
        if (this.closing) throw createRunInterruptedError()
        const result = await this.runtimeHost.execute({
          run: { ...run, status: 'running', startedAt, updatedAt: startedAt },
          request,
          profile: runtimeProfile,
          tools: resolvePiRuntimeToolSpecs(allowedToolIds),
          history,
          budget
        })
        const completedAt = Date.now()
        const persisted = await aiOrchestratorStore.getOrchestratorRun(run.id)
        const metadata = projectPersistedRunMetadata(persisted?.metadata ?? run.metadata)
        delete metadata.approvalGrantFingerprint
        delete metadata.approvalGrantAt
        await aiOrchestratorStore.updateOrchestratorRun(run.id, {
          status: 'completed',
          output: result.output,
          usage: result.usage,
          metadata,
          completedAt
        })
        await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.completed', {
          outputLength: result.output.length,
          usage: result.usage
        })
        this.clearVolatileRunState(run.id)
        return {
          ...run,
          status: 'completed',
          output: result.output,
          usage: result.usage,
          startedAt,
          completedAt,
          updatedAt: completedAt
        }
      } catch (error) {
        const approvalRequirement = approvalRequirementFromControlError(error)
        const status = approvalRequirement
          ? 'pending_approval'
          : isRunCancelledControlError(error)
            ? 'cancelled'
            : isInterruptedToolCallControlError(error) || isRunInterruptedControlError(error)
              ? 'interrupted'
              : 'failed'
        const approvalReason =
          status === 'pending_approval' ? approvalRequirement?.reason : undefined
        const publicError = approvalRequirement
          ? approvalRequirement.reason
          : status === 'cancelled'
            ? AI_RUN_CANCELLED
            : status === 'interrupted'
              ? AI_RUN_INTERRUPTED
              : AI_RUN_FAILED
        const completedAt = status === 'pending_approval' ? undefined : Date.now()
        const persisted = await aiOrchestratorStore.getOrchestratorRun(run.id)
        const metadata = projectPersistedRunMetadata(persisted?.metadata ?? run.metadata)
        delete metadata.approved
        delete metadata.approvalGranted
        delete metadata.approvedAt
        delete metadata.approvalGrantFingerprint
        if (approvalRequirement && status === 'pending_approval') {
          metadata.pendingApprovalFingerprint = approvalRequirement.fingerprint
          metadata.pendingApprovalKind = approvalRequirement.kind
          metadata.pendingApprovalReason = approvalRequirement.reason
        } else {
          delete metadata.pendingApprovalFingerprint
          delete metadata.pendingApprovalKind
          delete metadata.pendingApprovalReason
        }
        await aiOrchestratorStore.updateOrchestratorRun(run.id, {
          status,
          error: publicError,
          approvalReason,
          metadata,
          delegationPlan: persisted?.delegationPlan,
          ...(completedAt ? { completedAt } : {})
        })
        await aiOrchestratorStore.appendOrchestratorEvent(
          run.id,
          `run.${status}`,
          {
            error: publicError,
            approvalReason,
            approvalFingerprint: approvalRequirement?.fingerprint,
            approvalKind: approvalRequirement?.kind
          },
          status === 'failed' ? 'error' : 'warn'
        )
        if (status !== 'pending_approval') this.clearVolatileRunState(run.id)
        return {
          ...run,
          status,
          error: publicError,
          approvalReason,
          delegationPlan: persisted?.delegationPlan,
          startedAt,
          completedAt,
          updatedAt: completedAt ?? Date.now()
        }
      }
    } finally {
      releaseWriteLease()
    }
  }

  async cancelSessionRuns(sessionId: string): Promise<number> {
    const runs = await this.listRuns({ limit: 200 })
    const cancellable = runs.filter(
      (run) =>
        run.sessionId === sessionId &&
        (run.status === 'running' || run.status === 'queued' || run.status === 'pending_approval')
    )
    const results = await Promise.all(cancellable.map((run) => this.cancelPersistedRun(run.id)))
    return results.filter(Boolean).length
  }
  cancel(runId: string): boolean {
    return this.runtimeHost.cancel(runId)
  }

  async cancelPersistedRun(runId: string): Promise<boolean> {
    return await this.cancelPersistedRunTree(runId, new Set<string>())
  }

  private async cancelPersistedRunTree(runId: string, visited: Set<string>): Promise<boolean> {
    if (visited.has(runId)) return false
    visited.add(runId)
    const run = await aiOrchestratorStore.getOrchestratorRun(runId)
    if (!run) return false
    const descendants = (await this.listRuns({ limit: 200 })).filter(
      (candidate) => candidate.parentRunId === runId
    )
    await Promise.all(descendants.map((child) => this.cancelPersistedRunTree(child.id, visited)))
    if (this.cancel(runId)) return true
    if (run.status !== 'pending_approval' && run.status !== 'queued') return false
    const now = Date.now()
    await this.withRunWriteLease(runId, async () => {
      await aiOrchestratorStore.updateOrchestratorRun(runId, {
        status: 'cancelled',
        error: 'Cancelled by user',
        metadata: projectPersistedRunMetadata(run.metadata),
        completedAt: now,
        updatedAt: now
      })
      await aiOrchestratorStore.appendOrchestratorEvent(
        runId,
        'run.cancelled',
        { reason: 'Cancelled by user' },
        'warn'
      )
    })
    this.clearVolatileRunState(runId)
    return true
  }

  async listRuns(options?: AiOrchestratorRunListRequest): Promise<AiOrchestratorRunRecord[]> {
    return await aiOrchestratorStore.listOrchestratorRuns(options)
  }

  async getRun(runId: string): Promise<AiOrchestratorRunRecord | null> {
    return await aiOrchestratorStore.getOrchestratorRun(runId)
  }

  async listProfiles(): Promise<AiAgentProfile[]> {
    return await aiOrchestratorStore.listProfiles()
  }

  async saveProfile(profile: AiAgentProfile): Promise<AiAgentProfile> {
    return await aiOrchestratorStore.saveProfile(profile)
  }

  async previewImport(request?: AiImportPreviewRequest): Promise<AiImportScanResult> {
    return await aiCliImportService.preview(request)
  }

  async applyImport(request: AiImportApplyRequest): Promise<AiImportApplyResult> {
    return await aiCliImportService.apply(request)
  }

  async setImportedItemActive(
    request: AiImportedItemSetActiveRequest
  ): Promise<AiImportedConfigItem> {
    return await aiImportedConfigRuntime.setActive(request.itemId, request.active)
  }

  async cloneImportedItem(request: AiImportedItemCloneRequest): Promise<AiImportedConfigItem> {
    return await aiImportedConfigRuntime.clone(request.itemId, request.alias)
  }

  async deleteImportedItem(itemId: string): Promise<boolean> {
    return await aiImportedConfigRuntime.delete(itemId)
  }

  async listAutomations(): Promise<AiAutomationDefinition[]> {
    return await aiAutomationScheduler.list()
  }

  async saveAutomation(definition: AiAutomationDefinition): Promise<AiAutomationDefinition> {
    return await aiAutomationScheduler.save(definition)
  }

  async deleteAutomation(automationId: string): Promise<boolean> {
    return await aiAutomationScheduler.delete(automationId)
  }

  async runAutomation(request: AiAutomationRunNowRequest): Promise<AiAutomationRunRecord> {
    return await aiAutomationScheduler.runNow(
      request.automationId,
      request.approved ?? true,
      request.payload
    )
  }

  async approveAutomation(request: AiAutomationApproveRequest): Promise<AiAutomationRunRecord> {
    return await aiAutomationScheduler.approve(request.runId)
  }

  async getSnapshot(): Promise<AiOrchestratorSnapshot> {
    const [profiles, automations, recentRuns, importedItems] = await Promise.all([
      this.listProfiles(),
      this.listAutomations(),
      this.listRuns({ limit: 25 }),
      aiOrchestratorStore.listImportedItems()
    ])
    return {
      runtimeReady: this.isReady(),
      activeRunIds: recentRuns.filter((run) => run.status === 'running').map((run) => run.id),
      profiles,
      automations,
      recentRuns,
      importedItems
    }
  }

  async executeAgentCapability(
    payload: IntelligenceAgentPayload,
    options: IntelligenceInvokeOptions = {}
  ): Promise<IntelligenceInvokeResult<IntelligenceAgentResult>> {
    const startedAt = Date.now()
    const run = await this.execute({
      objective: payload.task,
      input: { task: payload.task },
      profileId:
        typeof options.metadata?.profileId === 'string' ? options.metadata.profileId : undefined,
      cwd:
        typeof options.metadata?.workingDirectory === 'string'
          ? options.metadata.workingDirectory
          : undefined,
      approved: options.metadata?.approved === true,
      allowedToolIds: Array.isArray(options.metadata?.allowedToolIds)
        ? options.metadata.allowedToolIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      sessionId:
        typeof options.metadata?.sessionId === 'string' ? options.metadata.sessionId : undefined,
      metadata: options.metadata
    })
    if (run.status !== 'completed') throw new Error(run.error || 'Pi agent execution failed')
    const output = run.output || ''
    return {
      result: {
        result: output,
        steps: [{ thought: 'Executed by Tuff Pi coordinator', observation: output.slice(0, 500) }],
        toolCalls: [],
        iterations: 1
      },
      usage: {
        promptTokens: run.usage?.promptTokens ?? 0,
        completionTokens: run.usage?.completionTokens ?? 0,
        totalTokens: run.usage?.totalTokens ?? 0
      },
      model: 'pi-agent-core',
      latency: Date.now() - startedAt,
      traceId: run.id,
      provider: 'tuff-pi-runtime'
    }
  }

  async executeWorkflowRun(context: WorkflowExecutionContext): Promise<WorkflowRunRecord> {
    const startedAt = Date.now()
    const running: WorkflowRunRecord = {
      ...context.run,
      status: 'running',
      steps: context.workflow.steps.map((step) => ({
        workflowStepId: step.id,
        kind: step.kind,
        name: step.name,
        status: 'running',
        toolId: step.toolId,
        toolSource: step.toolSource,
        input: step.input ?? {},
        startedAt
      }))
    }
    await context.onUpdate(running)
    const metadata = context.metadata ?? {}
    const run = await this.execute({
      objective: [
        `Execute workflow: ${context.workflow.name}`,
        context.workflow.description || '',
        `Steps: ${JSON.stringify(context.workflow.steps)}`
      ]
        .filter(Boolean)
        .join('\n\n'),
      input: context.inputs,
      profileId: typeof metadata.profileId === 'string' ? metadata.profileId : undefined,
      cwd: typeof metadata.workingDirectory === 'string' ? metadata.workingDirectory : undefined,
      approved: metadata.approved === true,
      allowedToolIds: [
        ...context.workflow.steps
          .map((step) => step.toolId)
          .filter((toolId): toolId is string => Boolean(toolId)),
        ...(context.workflow.steps.some((step) => step.kind === 'agent') ? ['agent.delegate'] : [])
      ],
      sessionId: context.sessionId,
      metadata: {
        ...metadata,
        workflowId: context.workflow.id,
        workflowRunId: context.run.id
      }
    })
    const completed = run.status === 'completed'
    const completedAt = Date.now()
    return {
      ...running,
      status: completed ? 'completed' : run.status === 'cancelled' ? 'cancelled' : 'failed',
      outputs: {
        result: run.output,
        orchestratorRunId: run.id,
        usage: run.usage
      },
      error: run.error,
      steps: running.steps.map((step, index) => ({
        ...step,
        status: completed ? 'completed' : 'failed',
        output: index === running.steps.length - 1 ? run.output : undefined,
        error: completed ? undefined : run.error,
        completedAt
      })),
      completedAt,
      metadata: {
        ...(running.metadata ?? {}),
        orchestratorRunId: run.id
      }
    }
  }

  async executeWorkflowCapability(
    payload: unknown,
    options: IntelligenceInvokeOptions = {}
  ): Promise<IntelligenceInvokeResult<PromptWorkflowExecution>> {
    const workflow = normalizeInlineWorkflow(payload)
    const startedAt = Date.now()
    const run = await this.executeWorkflowRun({
      workflow,
      run: {
        id: `inline_${randomUUID()}`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: 'pending',
        triggerType: 'manual',
        inputs: toRecord(toRecord(payload).inputs),
        steps: [],
        startedAt,
        metadata: options.metadata
      },
      inputs: toRecord(toRecord(payload).inputs),
      sessionId:
        typeof options.metadata?.sessionId === 'string' ? options.metadata.sessionId : undefined,
      triggerType: 'manual',
      continueOnError: toRecord(payload).continueOnError === true,
      metadata: options.metadata,
      onUpdate: async () => undefined
    })
    const usage = toRecord(run.outputs?.usage)
    return {
      result: toPromptWorkflowExecution(run),
      usage: {
        promptTokens: typeof usage.promptTokens === 'number' ? usage.promptTokens : 0,
        completionTokens: typeof usage.completionTokens === 'number' ? usage.completionTokens : 0,
        totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : 0
      },
      model: 'pi-agent-core',
      latency: Date.now() - startedAt,
      traceId: run.id,
      provider: 'tuff-pi-runtime'
    }
  }

  executeAgentTask(task: AgentTask): Promise<AgentResult> {
    return this.trackExecution(() => this.executeAgentTaskInternal(task))
  }

  private async executeAgentTaskInternal(task: AgentTask): Promise<AgentResult> {
    const taskId = task.id || randomUUID()
    const descriptor = agentManager.getAgent(task.agentId)
    if (!descriptor) {
      return this.agentError(taskId, task.agentId, `Agent ${task.agentId} not found`)
    }
    if (descriptor.enabled === false) {
      return this.agentError(taskId, task.agentId, `Agent ${task.agentId} is disabled`)
    }

    const metadata = task.context?.metadata ?? {}
    if (this.agentTaskRunIds.has(taskId)) {
      return this.agentError(taskId, task.agentId, 'Agent task is already running')
    }
    const runId = createOrchestratorRunId()
    this.agentTaskRunIds.set(taskId, runId)
    try {
      const run = await this.executeWithAuthority(
        {
          objective: `${descriptor.description}\n\n${toObjective(task)}`,
          input: task.input,
          profileId: typeof metadata.profileId === 'string' ? metadata.profileId : undefined,
          cwd: task.context?.workingDirectory,
          timeoutMs: task.timeout || descriptor.config?.timeout,
          approved: metadata.approved === true,
          allowedToolIds: descriptor.tools?.map((tool) => tool.toolId),
          sessionId: task.context?.sessionId
        },
        undefined,
        undefined,
        undefined,
        runId
      )

      const duration = (run.completedAt ?? Date.now()) - (run.startedAt ?? run.createdAt)
      const usage: AgentUsage = {
        promptTokens: run.usage?.promptTokens ?? 0,
        completionTokens: run.usage?.completionTokens ?? 0,
        totalTokens: run.usage?.totalTokens ?? 0,
        toolCalls: 0,
        duration,
        cost: run.usage?.cost
      }
      const trace: AgentTraceStep[] = [
        {
          type: run.status === 'completed' ? 'output' : 'thought',
          timestamp: run.completedAt ?? Date.now(),
          content: run.output || run.error || run.status
        }
      ]
      return {
        success: run.status === 'completed',
        taskId,
        agentId: task.agentId,
        output: run.output,
        error: run.error,
        status:
          run.status === 'completed'
            ? AgentStatus.COMPLETED
            : run.status === 'cancelled'
              ? AgentStatus.CANCELLED
              : AgentStatus.FAILED,
        usage,
        trace,
        timestamp: Date.now()
      }
    } finally {
      if (this.agentTaskRunIds.get(taskId) === runId) this.agentTaskRunIds.delete(taskId)
    }
  }

  cancelAgentTask(taskId: string): boolean {
    const runId = this.agentTaskRunIds.get(taskId)
    return runId ? this.cancel(runId) : false
  }

  private registerImportedRuntimeTools(): void {
    if (!toolRegistry.hasTool('skill.read')) {
      toolRegistry.registerTool(
        {
          id: 'skill.read',
          name: 'Read Imported Skill',
          description:
            'Load one imported skill by its host-provided ID after selecting it from metadata.',
          category: 'intelligence',
          inputSchema: {
            type: 'object',
            properties: { skillId: { type: 'string' } },
            required: ['skillId']
          },
          permissions: []
        },
        async (input, context) => {
          const skillId =
            typeof toRecord(input).skillId === 'string' ? String(toRecord(input).skillId) : ''
          if (!skillId) throw new Error('skillId is required')
          return await aiImportedConfigRuntime.readSkill(
            skillId,
            context.workingDirectory || process.cwd()
          )
        }
      )
    }
    if (!toolRegistry.hasTool('mcp.listTools')) {
      toolRegistry.registerTool(
        {
          id: 'mcp.listTools',
          name: 'List MCP Tools',
          description: 'Lazily connect to one approved MCP profile and list its available tools.',
          category: 'intelligence',
          inputSchema: {
            type: 'object',
            properties: { profileId: { type: 'string' } },
            required: ['profileId']
          },
          permissions: []
        },
        async (input, context) => {
          const profileId =
            typeof toRecord(input).profileId === 'string' ? String(toRecord(input).profileId) : ''
          if (!profileId) throw new Error('profileId is required')
          return await aiImportedConfigRuntime.listMcpTools(
            profileId,
            context.workingDirectory || process.cwd()
          )
        }
      )
    }
    if (!toolRegistry.hasTool('mcp.call')) {
      toolRegistry.registerTool(
        {
          id: 'mcp.call',
          name: 'Call MCP Tool',
          description:
            'Call one tool on an approved MCP profile through the host-owned lazy MCP registry.',
          category: 'intelligence',
          inputSchema: {
            type: 'object',
            properties: {
              profileId: { type: 'string' },
              toolName: { type: 'string' },
              input: { type: 'object' }
            },
            required: ['profileId', 'toolName']
          },
          permissions: []
        },
        async (input, context) => {
          const payload = toRecord(input)
          const profileId = typeof payload.profileId === 'string' ? payload.profileId : ''
          const toolName = typeof payload.toolName === 'string' ? payload.toolName : ''
          if (!profileId || !toolName) throw new Error('profileId and toolName are required')
          return await aiImportedConfigRuntime.callMcpTool(
            profileId,
            toolName,
            payload.input,
            context.workingDirectory || process.cwd()
          )
        }
      )
    }
  }

  private registerDelegationTool(): void {
    if (toolRegistry.hasTool('agent.delegate')) return
    toolRegistry.registerTool(
      {
        id: 'agent.delegate',
        name: 'Delegate to Tuff Agents',
        description:
          'Submit one explicit dependency-aware child-agent plan. The host validates profiles, tools, budgets, approval, and concurrency before creating child runs.',
        category: 'intelligence',
        inputSchema: {
          type: 'object',
          properties: {
            maxConcurrency: { type: 'number' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nodeId: { type: 'string' },
                  profileId: { type: 'string' },
                  objective: { type: 'string' },
                  dependsOn: { type: 'array', items: { type: 'string' } },
                  requestedTools: { type: 'array', items: { type: 'string' } },
                  requestedMcpServers: { type: 'array', items: { type: 'string' } },
                  budget: { type: 'object' }
                },
                required: ['nodeId', 'profileId', 'objective']
              }
            }
          },
          required: ['nodes']
        },
        permissions: []
      },
      async (input, context) => {
        const releaseWriteLease = this.acquireRunWriteLease(context.taskId)
        try {
          const parentRun = await aiOrchestratorStore.getOrchestratorRun(context.taskId)
          if (!parentRun) throw new Error(`Parent orchestrator run ${context.taskId} not found`)
          await this.restoreRunAuthority(parentRun)
          const plan = this.normalizeDelegationPlan(input, parentRun)
          await this.assertRemainingChildBudget(plan, parentRun)
          await aiOrchestratorStore.updateOrchestratorRun(parentRun.id, { delegationPlan: plan })
          await aiOrchestratorStore.appendOrchestratorEvent(
            parentRun.id,
            'delegation.plan.proposed',
            {
              planId: plan.planId,
              nodes: plan.nodes,
              maxConcurrency: plan.maxConcurrency
            }
          )

          const fingerprint = delegationApprovalFingerprint(plan)
          const policyViolation = this.delegationPolicyViolation(plan, parentRun)
          const hasApprovalGrant = this.hasApprovalGrant(parentRun, fingerprint)
          const approvalReason =
            policyViolation ??
            (hasApprovalGrant ? undefined : 'Interactive delegation plan requires user approval')
          if (approvalReason) {
            throw createApprovalRequiredError('delegation', fingerprint)
          }

          const approvedParentRun = hasApprovalGrant
            ? await this.consumeApprovalGrant(parentRun, fingerprint)
            : parentRun
          const executingPlan: AiDelegationPlan = {
            ...plan,
            status: 'executing',
            approvedAt: Date.now()
          }
          await aiOrchestratorStore.updateOrchestratorRun(parentRun.id, {
            delegationPlan: executingPlan
          })
          try {
            const results = await this.executeDelegationPlan(executingPlan, approvedParentRun)
            await aiOrchestratorStore.updateOrchestratorRun(parentRun.id, {
              delegationPlan: { ...executingPlan, status: 'completed' }
            })
            await aiOrchestratorStore.appendOrchestratorEvent(
              parentRun.id,
              'delegation.plan.completed',
              { planId: plan.planId, childRunIds: results.map((result) => result.runId) }
            )
            return { planId: plan.planId, results }
          } catch (error) {
            await aiOrchestratorStore.updateOrchestratorRun(parentRun.id, {
              delegationPlan: { ...executingPlan, status: 'failed' }
            })
            throw error
          }
        } finally {
          releaseWriteLease()
        }
      }
    )
  }

  private delegationPolicyViolation(
    plan: AiDelegationPlan,
    parentRun: AiOrchestratorRunRecord
  ): string | undefined {
    const policy = this.trustedAutomationPolicies.get(parentRun.id)
    if (!policy) return undefined
    const allowedProfiles = new Set(policy.allowedAgentProfileIds)
    const allowedTools = new Set(policy.allowedToolIds)
    const allowedMcpServers = new Set(policy.allowedMcpServerIds)
    const policyBudget = resolveExecutionBudget({
      objective: parentRun.objective,
      budget: policy.budget
    })
    if (plan.maxConcurrency > policyBudget.maxConcurrency) {
      return `Delegation concurrency exceeds automation policy maxConcurrency=${policyBudget.maxConcurrency}`
    }
    for (const node of plan.nodes) {
      if (!allowedProfiles.has(node.profileId))
        return `Agent profile ${node.profileId} is not preauthorized`
      const deniedTool = node.requestedTools.find((toolId) => !allowedTools.has(toolId))
      if (deniedTool) return `Tool ${deniedTool} is not preauthorized for delegation`
      if (
        node.budget.maxSteps > policyBudget.maxSteps ||
        (node.budget.maxToolCalls ?? 20) > (policyBudget.maxToolCalls ?? 20) ||
        node.budget.maxChildRuns > policyBudget.maxChildRuns ||
        node.budget.maxConcurrency > policyBudget.maxConcurrency ||
        (policyBudget.maxCost !== undefined &&
          (node.budget.maxCost === undefined || node.budget.maxCost > policyBudget.maxCost))
      ) {
        return `Delegation node ${node.nodeId} exceeds the automation policy budget`
      }
      const deniedMcp = node.requestedMcpServers.find(
        (serverId) => !allowedMcpServers.has(serverId)
      )
      if (deniedMcp) return `MCP server ${deniedMcp} is not preauthorized for delegation`
    }
    return undefined
  }

  private hasApprovalGrant(run: AiOrchestratorRunRecord, fingerprint: string): boolean {
    return run.metadata?.approvalGrantFingerprint === fingerprint
  }

  private async consumeApprovalGrant(
    run: AiOrchestratorRunRecord,
    fingerprint: string
  ): Promise<AiOrchestratorRunRecord> {
    if (!this.hasApprovalGrant(run, fingerprint)) {
      throw new Error('Approval grant does not match the requested operation')
    }
    const metadata = projectPersistedRunMetadata(run.metadata)
    delete metadata.approvalGrantFingerprint
    delete metadata.approvalGrantAt
    const updated = { ...run, metadata, updatedAt: Date.now() }
    await this.withRunWriteLease(run.id, async () => {
      await aiOrchestratorStore.updateOrchestratorRun(run.id, {
        metadata,
        updatedAt: updated.updatedAt
      })
      await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.approval_grant_consumed', {
        approvalFingerprint: fingerprint
      })
    })
    return updated
  }

  private async assertRemainingChildBudget(
    plan: AiDelegationPlan,
    parentRun: AiOrchestratorRunRecord
  ): Promise<void> {
    const parentBudget = resolveExecutionBudget({
      objective: parentRun.objective,
      budget: toRecord(parentRun.metadata?.executionBudget) as Partial<AiExecutionBudget>
    })
    const policy = this.trustedAutomationPolicies.get(parentRun.id)
    const policyBudget = policy
      ? resolveExecutionBudget({ objective: parentRun.objective, budget: policy.budget })
      : parentBudget
    const maxChildRuns = Math.min(parentBudget.maxChildRuns, policyBudget.maxChildRuns)
    const existingChildren = (await this.listRuns({ limit: 200 })).filter(
      (run) => run.parentRunId === parentRun.id && run.status !== 'cancelled'
    ).length
    const remaining = Math.max(0, maxChildRuns - existingChildren)
    if (plan.nodes.length > remaining) {
      throw new Error(
        `Delegation plan exceeds maxChildRuns=${maxChildRuns} (remaining=${remaining}, existingChildren=${existingChildren})`
      )
    }
  }

  private childAutomationPolicy(
    parentRun: AiOrchestratorRunRecord,
    node: AiDelegationNode
  ): Record<string, unknown> {
    const parentPolicy = this.trustedAutomationPolicies.get(parentRun.id)
    const parentBudget = resolveExecutionBudget({
      objective: parentRun.objective,
      budget: toRecord(parentRun.metadata?.executionBudget) as Partial<AiExecutionBudget>
    })
    const policyBudget = parentPolicy
      ? resolveExecutionBudget({ objective: parentRun.objective, budget: parentPolicy.budget })
      : parentBudget
    return Object.freeze({
      version: parentPolicy?.version ?? 1,
      allowedToolIds: Object.freeze([...node.requestedTools]),
      allowedMcpServerIds: Object.freeze([...node.requestedMcpServers]),
      allowedAgentProfileIds: Object.freeze([node.profileId]),
      allowedPaths: Object.freeze(parentPolicy ? parentPolicy.allowedPaths : []),
      allowedNetworkTargets: Object.freeze(parentPolicy ? parentPolicy.allowedNetworkTargets : []),
      budget: Object.freeze({
        maxSteps: Math.min(node.budget.maxSteps, policyBudget.maxSteps),
        maxToolCalls: Math.min(
          node.budget.maxToolCalls ?? 20,
          policyBudget.maxToolCalls ?? parentBudget.maxToolCalls ?? 20
        ),
        ...(node.budget.maxCost !== undefined && policyBudget.maxCost !== undefined
          ? { maxCost: Math.min(node.budget.maxCost, policyBudget.maxCost) }
          : node.budget.maxCost !== undefined
            ? { maxCost: node.budget.maxCost }
            : policyBudget.maxCost !== undefined
              ? { maxCost: policyBudget.maxCost }
              : {}),
        maxChildRuns: Math.min(node.budget.maxChildRuns, policyBudget.maxChildRuns),
        maxConcurrency: Math.min(node.budget.maxConcurrency, policyBudget.maxConcurrency)
      }),
      timeoutMs: parentPolicy && parentPolicy.timeoutMs > 0 ? parentPolicy.timeoutMs : 0,
      maxRunsPerWindow:
        parentPolicy && parentPolicy.maxRunsPerWindow > 0 ? parentPolicy.maxRunsPerWindow : 1,
      windowMs: parentPolicy && parentPolicy.windowMs > 0 ? parentPolicy.windowMs : 1
    })
  }

  private normalizeDelegationPlan(
    input: unknown,
    parentRun: AiOrchestratorRunRecord
  ): AiDelegationPlan {
    const payload = toRecord(input)
    const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : []
    const parentBudget = resolveExecutionBudget({
      objective: parentRun.objective,
      budget: toRecord(parentRun.metadata?.executionBudget) as Partial<AiExecutionBudget>
    })
    if (rawNodes.length === 0) throw new Error('Delegation plan must contain at least one node')
    if (rawNodes.length > parentBudget.maxChildRuns) {
      throw new Error(`Delegation plan exceeds maxChildRuns=${parentBudget.maxChildRuns}`)
    }

    const parentAllowedTools = new Set(this.trustedAllowedToolIds.get(parentRun.id) ?? [])
    const nodes: AiDelegationNode[] = rawNodes.map((rawNode) => {
      const node = toRecord(rawNode)
      const nodeId = typeof node.nodeId === 'string' ? node.nodeId.trim() : ''
      const profileId = typeof node.profileId === 'string' ? node.profileId.trim() : ''
      const objective = typeof node.objective === 'string' ? node.objective.trim() : ''
      if (!nodeId || !profileId || !objective)
        throw new Error('Delegation nodeId, profileId, and objective are required')
      const requestedTools = Array.isArray(node.requestedTools)
        ? node.requestedTools.filter((value): value is string => typeof value === 'string')
        : []
      const outsideParentScope = requestedTools.filter((toolId) => !parentAllowedTools.has(toolId))
      if (outsideParentScope.length > 0) {
        throw new Error(`Delegation tools exceed parent scope: ${outsideParentScope.join(', ')}`)
      }
      const budget = resolveExecutionBudget({
        objective,
        budget: toRecord(node.budget) as Partial<AiExecutionBudget>
      })
      if (
        budget.maxSteps > parentBudget.maxSteps ||
        (budget.maxToolCalls ?? 20) > (parentBudget.maxToolCalls ?? 20) ||
        budget.maxChildRuns > parentBudget.maxChildRuns ||
        budget.maxConcurrency > parentBudget.maxConcurrency ||
        (parentBudget.maxCost !== undefined &&
          (budget.maxCost === undefined || budget.maxCost > parentBudget.maxCost))
      ) {
        throw new Error(`Delegation node ${nodeId} exceeds the parent execution budget`)
      }
      return {
        nodeId,
        profileId,
        objective,
        dependsOn: Array.isArray(node.dependsOn)
          ? node.dependsOn.filter((value): value is string => typeof value === 'string')
          : [],
        requestedTools,
        requestedMcpServers: Array.isArray(node.requestedMcpServers)
          ? node.requestedMcpServers.filter((value): value is string => typeof value === 'string')
          : [],
        budget
      }
    })
    const nodeIds = new Set(nodes.map((node) => node.nodeId))
    if (nodeIds.size !== nodes.length) throw new Error('Delegation node IDs must be unique')
    for (const node of nodes) {
      const unknownDependencies = node.dependsOn.filter((dependency) => !nodeIds.has(dependency))
      if (unknownDependencies.length > 0) {
        throw new Error(`Delegation node ${node.nodeId} has unknown dependencies`)
      }
      if (node.dependsOn.includes(node.nodeId))
        throw new Error(`Delegation node ${node.nodeId} cannot depend on itself`)
    }
    const unresolved = new Set(nodeIds)
    const resolved = new Set<string>()
    while (unresolved.size > 0) {
      const ready = nodes.filter(
        (node) => unresolved.has(node.nodeId) && node.dependsOn.every((id) => resolved.has(id))
      )
      if (ready.length === 0) throw new Error('Delegation plan contains a dependency cycle')
      for (const node of ready) {
        unresolved.delete(node.nodeId)
        resolved.add(node.nodeId)
      }
    }
    return {
      planId: randomUUID(),
      parentRunId: parentRun.id,
      nodes,
      maxConcurrency: Math.min(
        parentBudget.maxConcurrency,
        Math.max(1, Math.floor(Number(payload.maxConcurrency) || 1))
      ),
      status: 'pending_approval',
      createdAt: Date.now()
    }
  }

  private async executeDelegationPlan(
    plan: AiDelegationPlan,
    parentRun: AiOrchestratorRunRecord
  ): Promise<Array<{ nodeId: string; runId: string; output: string }>> {
    const pending = new Map(plan.nodes.map((node) => [node.nodeId, node]))
    const completed = new Set<string>()
    const results: Array<{ nodeId: string; runId: string; output: string }> = []
    while (pending.size > 0) {
      const ready = Array.from(pending.values())
        .filter((node) => node.dependsOn.every((dependency) => completed.has(dependency)))
        .slice(0, plan.maxConcurrency)
      if (ready.length === 0) throw new Error('Delegation plan cannot make progress')
      const batch = await Promise.all(
        ready.map(async (node) => {
          const profile = await aiOrchestratorStore.getProfile(node.profileId)
          if (!profile || !profile.enabled)
            throw new Error(`Delegation profile ${node.profileId} is unavailable`)
          const disallowedTools = node.requestedTools.filter(
            (toolId) => !profile.allowedToolIds.includes(toolId)
          )
          if (disallowedTools.length > 0) {
            throw new Error(`Delegation profile ${node.profileId} disallows requested tools`)
          }
          const childPolicy = normalizeAutomationPolicy(
            { profileId: node.profileId, cwd: parentRun.cwd },
            this.childAutomationPolicy(parentRun, node) as Partial<AiAutomationPolicy>
          )
          const child = await this.executeWithAuthority(
            {
              objective: node.objective,
              profileId: node.profileId,
              cwd: parentRun.cwd,
              approved: false,
              allowedToolIds: node.requestedTools,
              parentRunId: parentRun.id,
              budget: node.budget
            },
            undefined,
            childPolicy
          )
          if (child.status !== 'completed')
            throw new Error(child.error || `Delegation node ${node.nodeId} failed`)
          return { nodeId: node.nodeId, runId: child.id, output: child.output ?? '' }
        })
      )
      for (const result of batch) {
        pending.delete(result.nodeId)
        completed.add(result.nodeId)
        results.push(result)
      }
    }
    return results
  }

  private agentError(taskId: string, agentId: string, error: string): AgentResult {
    return {
      success: false,
      taskId,
      agentId,
      error,
      status: AgentStatus.FAILED,
      timestamp: Date.now()
    }
  }
}

export const aiCliOrchestrator = new AiCliOrchestrator()
