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
import { AgentStatus } from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'
import { agentManager, toolRegistry } from './agents'
import { aiAutomationScheduler } from './ai-automation-scheduler'
import { aiCliImportService } from './ai-cli-import-service'
import { aiImportedConfigRuntime } from './ai-imported-config-runtime'
import { aiOrchestratorStore, DEFAULT_PROFILE_ID } from './ai-orchestrator-store'
import { PiAgentRuntimeHost, resolvePiRuntimeToolSpecs } from './pi-agent-runtime-host'

const orchestratorLog = createLogger('Intelligence').child('AiCliOrchestrator')

type ApprovalRequirement = {
  fingerprint: string
  kind: string
  reason: string
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseApprovalRequirement(message: string): ApprovalRequirement | undefined {
  if (!message.startsWith('APPROVAL_REQUIRED:')) return undefined
  const raw = message.slice('APPROVAL_REQUIRED:'.length).trim()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const fingerprint = typeof parsed.fingerprint === 'string' ? parsed.fingerprint.trim() : ''
    if (!fingerprint) return undefined
    return {
      fingerprint,
      kind: typeof parsed.kind === 'string' && parsed.kind.trim() ? parsed.kind : 'unknown',
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason : raw
    }
  } catch {
    return undefined
  }
}

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

const SENSITIVE_EVENT_KEY =
  /token|api.?key|secret|password|credential|authorization|cookie|authref/i
const INTERRUPTED_TOOL_CALL_PREFIX = 'INTERRUPTED_TOOL_CALL:'

function sanitizePiEventPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]'
  if (typeof value === 'string') return value.slice(0, 32_000)
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitizePiEventPayload(item, depth + 1))
  const record = value as Record<string, unknown>
  if (record.role === 'toolResult') {
    return {
      role: 'toolResult',
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      isError: record.isError,
      timestamp: record.timestamp
    }
  }
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 100)
      .map(([key, nested]) => [
        key,
        SENSITIVE_EVENT_KEY.test(key) ? '[redacted]' : sanitizePiEventPayload(nested, depth + 1)
      ])
  )
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
  private readonly toolCallMetadataMutations = new Map<string, Promise<unknown>>()
  private readonly runtimeHost = new PiAgentRuntimeHost({
    onEvent: async (event) => {
      await aiOrchestratorStore.appendOrchestratorEvent(
        event.runId,
        event.type,
        sanitizePiEventPayload(event.payload) as Record<string, unknown>,
        event.level ?? 'info'
      )
    },
    loadToolCallResult: async (runId, toolCallId) => {
      const run = await aiOrchestratorStore.getOrchestratorRun(runId)
      const metadata = toRecord(run?.metadata)
      const result = toRecord(toRecord(metadata.completedToolCallResults)[toolCallId])
      if (typeof result.error === 'string') return { error: result.error }
      if (Object.prototype.hasOwnProperty.call(result, 'output')) return { output: result.output }
      const state = toRecord(toRecord(metadata.toolCallStates)[toolCallId])
      if (state.state === 'started')
        return { error: `${INTERRUPTED_TOOL_CALL_PREFIX}${toolCallId}` }
      return undefined
    },
    persistToolCallResult: async (runId, toolCallId, result) => {
      await this.mutateToolCallMetadata(runId, (metadata) => {
        const completedToolCallResults = {
          ...toRecord(metadata.completedToolCallResults),
          [toolCallId]: toRecord(result)
        }
        const currentState = toRecord(toRecord(metadata.toolCallStates)[toolCallId])
        metadata.completedToolCallResults = completedToolCallResults
        metadata.toolCallStates = {
          ...toRecord(metadata.toolCallStates),
          [toolCallId]: { ...currentState, state: 'completed', completedAt: Date.now() }
        }
        return {
          value: undefined,
          event: {
            type: 'tool.call.completed',
            payload: { toolCallId, hasError: typeof toRecord(result).error === 'string' }
          }
        }
      })
    },
    beginToolCall: async (runId, toolCallId, toolId) =>
      await this.mutateToolCallMetadata(runId, (metadata) => {
        const toolCallStates = toRecord(metadata.toolCallStates)
        const currentState = toRecord(toolCallStates[toolCallId])
        if (currentState.state === 'started' || currentState.state === 'completed') {
          return {
            value: 'interrupted' as const,
            event: { type: 'tool.call.replay_blocked', payload: { toolCallId, toolId } }
          }
        }
        metadata.toolCallStates = {
          ...toolCallStates,
          [toolCallId]: { state: 'started', toolId, startedAt: Date.now() }
        }
        return {
          value: 'execute' as const,
          event: { type: 'tool.call.started', payload: { toolCallId, toolId } }
        }
      }),
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
      event: { type: string; payload: Record<string, unknown> }
    }
  ): Promise<T> {
    const previous = this.toolCallMetadataMutations.get(runId) ?? Promise.resolve()
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const run = await aiOrchestratorStore.getOrchestratorRun(runId)
        if (!run) throw new Error(`Orchestrator run ${runId} not found`)
        const metadata = { ...(run.metadata ?? {}) }
        const { value, event } = mutate(metadata)
        await aiOrchestratorStore.updateOrchestratorRun(runId, { metadata, updatedAt: Date.now() })
        await aiOrchestratorStore.appendOrchestratorEvent(runId, event.type, event.payload)
        return value
      })
    this.toolCallMetadataMutations.set(runId, operation)
    try {
      return await operation
    } finally {
      if (this.toolCallMetadataMutations.get(runId) === operation)
        this.toolCallMetadataMutations.delete(runId)
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await aiOrchestratorStore.initialize()
    await aiImportedConfigRuntime.initialize()
    await this.recoverPersistedRuns()
    this.registerDelegationTool()
    this.registerImportedRuntimeTools()
    aiAutomationScheduler.setExecutor((request, automationId) =>
      this.execute(request, automationId)
    )
    try {
      await this.runtimeHost.start()
      this.initialized = true
      await aiAutomationScheduler.initialize()
      orchestratorLog.info('AI CLI orchestrator initialized')
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
      await aiOrchestratorStore.updateOrchestratorRun(run.id, {
        status: 'interrupted',
        error,
        completedAt: interruptedAt,
        updatedAt: interruptedAt
      })
      await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.interrupted', {
        reason: 'application_restart',
        previousStatus: run.status
      })
    }
  }

  async shutdown(): Promise<void> {
    await aiAutomationScheduler.stop()
    await this.runtimeHost.stop()
    this.initialized = false
  }

  isReady(): boolean {
    return this.initialized && this.runtimeHost.isReady()
  }

  async execute(
    request: AiOrchestratorExecuteRequest,
    automationId?: string
  ): Promise<AiOrchestratorRunRecord> {
    if (!this.initialized) throw new Error('AI CLI orchestrator is not initialized')
    const objective = String(request.objective || '').trim()
    if (!objective) throw new Error('Objective is required')
    const profile = await aiOrchestratorStore.getProfile(request.profileId || DEFAULT_PROFILE_ID)
    if (!profile || !profile.enabled) {
      throw new Error(`Agent profile ${request.profileId || DEFAULT_PROFILE_ID} is unavailable`)
    }
    const runtimeProvider = profile.runtimeProvider
    const allowedToolIds = intersectTools(profile.allowedToolIds, request.allowedToolIds)
    const requestedCwd = resolve(request.cwd || process.cwd())
    const cwd = await realpath(requestedCwd).catch(() => requestedCwd)
    await aiImportedConfigRuntime.assertAgentProfileVisible(profile.id, cwd)
    const budget = resolveExecutionBudget(request)
    const now = Date.now()
    const run: AiOrchestratorRunRecord = {
      id:
        typeof request.metadata?.orchestratorRunId === 'string'
          ? request.metadata.orchestratorRunId
          : randomUUID(),
      automationId,
      sessionId: request.sessionId || randomUUID(),
      objective,
      profileId: profile.id,
      runtimeProvider,
      cwd,
      status: 'queued',
      metadata: {
        ...Object.fromEntries(
          Object.entries(request.metadata ?? {}).filter(
            ([key]) =>
              key !== 'approved' &&
              key !== 'approvalGranted' &&
              key !== 'approvedAt' &&
              key !== 'pendingApprovalFingerprint' &&
              key !== 'pendingApprovalKind' &&
              key !== 'pendingApprovalReason' &&
              key !== 'approvalGrantFingerprint'
          )
        ),
        executionBudget: budget,
        allowedToolIds,
        requestInput: request.input
      },
      parentRunId: request.parentRunId,
      createdAt: now,
      updatedAt: now
    }
    await aiOrchestratorStore.createOrchestratorRun(run)
    await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.queued', {
      runtimeProvider,
      profileId: profile.id,
      automationId
    })

    return await this.executePreparedRun(
      run,
      { ...request, objective, cwd, approved: false, allowedToolIds, budget },
      profile,
      allowedToolIds,
      budget
    )
  }

  async approveRun(runId: string): Promise<AiOrchestratorRunRecord> {
    const run = await aiOrchestratorStore.getOrchestratorRun(runId)
    if (!run) throw new Error(`Orchestrator run ${runId} not found`)
    if (run.status !== 'pending_approval')
      throw new Error(`Orchestrator run ${runId} is not pending approval`)
    const profile = await aiOrchestratorStore.getProfile(run.profileId)
    if (!profile || !profile.enabled)
      throw new Error(`Agent profile ${run.profileId} is unavailable`)
    const pendingFingerprint =
      typeof run.metadata?.pendingApprovalFingerprint === 'string'
        ? run.metadata.pendingApprovalFingerprint
        : ''
    if (!pendingFingerprint)
      throw new Error(`Orchestrator run ${runId} has no approvable pending requirement`)
    const approvedAt = Date.now()
    const metadata = { ...(run.metadata ?? {}) }
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
    const allowedToolIds = Array.isArray(metadata.allowedToolIds)
      ? metadata.allowedToolIds.filter((value): value is string => typeof value === 'string')
      : profile.allowedToolIds
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
    await aiOrchestratorStore.updateOrchestratorRun(run.id, approvedRun)
    await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.approved', {
      approvalFingerprint: pendingFingerprint,
      approvalKind: pendingKind || 'unknown',
      delegationPlanId: approvedRun.delegationPlan?.planId
    })
    return await this.executePreparedRun(
      approvedRun,
      {
        objective: run.objective,
        input: metadata.requestInput,
        profileId: run.profileId,
        cwd: run.cwd,
        approved: false,
        allowedToolIds,
        sessionId: run.sessionId,
        metadata,
        parentRunId: run.parentRunId,
        budget
      },
      profile,
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
      const metadata = { ...(persisted?.metadata ?? run.metadata ?? {}) }
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
      const message = toErrorMessage(error)
      const approvalRequirement = parseApprovalRequirement(message)
      const status = message.startsWith('APPROVAL_REQUIRED:')
        ? approvalRequirement
          ? 'pending_approval'
          : 'failed'
        : /cancel/i.test(message)
          ? 'cancelled'
          : message.startsWith(INTERRUPTED_TOOL_CALL_PREFIX) ||
              /Pi runtime utility process exited|Pi runtime stopped/i.test(message)
            ? 'interrupted'
            : 'failed'
      const approvalReason = status === 'pending_approval' ? approvalRequirement?.reason : undefined
      const completedAt = status === 'pending_approval' ? undefined : Date.now()
      const persisted = await aiOrchestratorStore.getOrchestratorRun(run.id)
      const metadata = { ...(persisted?.metadata ?? run.metadata ?? {}) }
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
        error:
          message.startsWith('APPROVAL_REQUIRED:') && !approvalRequirement
            ? 'Malformed approval requirement: stable fingerprint is required'
            : message,
        approvalReason,
        metadata,
        delegationPlan: persisted?.delegationPlan,
        ...(completedAt ? { completedAt } : {})
      })
      await aiOrchestratorStore.appendOrchestratorEvent(
        run.id,
        `run.${status}`,
        {
          error: message,
          approvalReason,
          approvalFingerprint: approvalRequirement?.fingerprint,
          approvalKind: approvalRequirement?.kind
        },
        status === 'failed' ? 'error' : 'warn'
      )
      return {
        ...run,
        status,
        error: message,
        approvalReason,
        delegationPlan: persisted?.delegationPlan,
        startedAt,
        completedAt,
        updatedAt: completedAt ?? Date.now()
      }
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
    await aiOrchestratorStore.updateOrchestratorRun(runId, {
      status: 'cancelled',
      error: 'Cancelled by user',
      completedAt: now,
      updatedAt: now
    })
    await aiOrchestratorStore.appendOrchestratorEvent(
      runId,
      'run.cancelled',
      { reason: 'Cancelled by user' },
      'warn'
    )
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
        workflowRunId: context.run.id,
        orchestratorRunId: `workflow:${context.run.id}`
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

  async executeAgentTask(task: AgentTask): Promise<AgentResult> {
    const taskId = task.id || randomUUID()
    const descriptor = agentManager.getAgent(task.agentId)
    if (!descriptor) {
      return this.agentError(taskId, task.agentId, `Agent ${task.agentId} not found`)
    }
    if (descriptor.enabled === false) {
      return this.agentError(taskId, task.agentId, `Agent ${task.agentId} is disabled`)
    }

    const metadata = task.context?.metadata ?? {}
    const run = await this.execute({
      objective: `${descriptor.description}\n\n${toObjective(task)}`,
      input: task.input,
      profileId: typeof metadata.profileId === 'string' ? metadata.profileId : undefined,
      cwd: task.context?.workingDirectory,
      timeoutMs: task.timeout || descriptor.config?.timeout,
      approved: metadata.approved === true,
      allowedToolIds: descriptor.tools?.map((tool) => tool.toolId),
      sessionId: task.context?.sessionId,
      metadata: {
        ...metadata,
        taskId,
        orchestratorRunId: taskId,
        agentId: task.agentId,
        taskType: task.type
      }
    })

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
        const parentRun = await aiOrchestratorStore.getOrchestratorRun(context.taskId)
        if (!parentRun) throw new Error(`Parent orchestrator run ${context.taskId} not found`)
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
          throw new Error(
            `APPROVAL_REQUIRED:${JSON.stringify({
              kind: 'delegation',
              fingerprint,
              reason: approvalReason,
              plan
            })}`
          )
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
      }
    )
  }

  private delegationPolicyViolation(
    plan: AiDelegationPlan,
    parentRun: AiOrchestratorRunRecord
  ): string | undefined {
    const policy = toRecord(parentRun.metadata?.automationPolicy)
    if (Object.keys(policy).length === 0) return undefined
    const allowedProfiles = new Set(
      Array.isArray(policy.allowedAgentProfileIds)
        ? policy.allowedAgentProfileIds.filter(
            (value): value is string => typeof value === 'string'
          )
        : []
    )
    const allowedTools = new Set(
      Array.isArray(policy.allowedToolIds)
        ? policy.allowedToolIds.filter((value): value is string => typeof value === 'string')
        : []
    )
    const allowedMcpServers = new Set(
      Array.isArray(policy.allowedMcpServerIds)
        ? policy.allowedMcpServerIds.filter((value): value is string => typeof value === 'string')
        : []
    )
    const policyBudget = resolveExecutionBudget({
      objective: parentRun.objective,
      budget: toRecord(policy.budget) as Partial<AiExecutionBudget>
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
    const metadata = { ...(run.metadata ?? {}) }
    delete metadata.approvalGrantFingerprint
    delete metadata.approvalGrantAt
    const updated = { ...run, metadata, updatedAt: Date.now() }
    await aiOrchestratorStore.updateOrchestratorRun(run.id, {
      metadata,
      updatedAt: updated.updatedAt
    })
    await aiOrchestratorStore.appendOrchestratorEvent(run.id, 'run.approval_grant_consumed', {
      approvalFingerprint: fingerprint
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
    const policy = toRecord(parentRun.metadata?.automationPolicy)
    const policyBudget =
      Object.keys(policy).length > 0
        ? resolveExecutionBudget({
            objective: parentRun.objective,
            budget: toRecord(policy.budget) as Partial<AiExecutionBudget>
          })
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
    const parentPolicy = toRecord(parentRun.metadata?.automationPolicy)
    const parentBudget = resolveExecutionBudget({
      objective: parentRun.objective,
      budget: toRecord(parentRun.metadata?.executionBudget) as Partial<AiExecutionBudget>
    })
    const policyBudget =
      Object.keys(parentPolicy).length > 0
        ? resolveExecutionBudget({
            objective: parentRun.objective,
            budget: toRecord(parentPolicy.budget) as Partial<AiExecutionBudget>
          })
        : parentBudget
    return Object.freeze({
      version: typeof parentPolicy.version === 'number' ? parentPolicy.version : 1,
      allowedToolIds: Object.freeze([...node.requestedTools]),
      allowedMcpServerIds: Object.freeze([...node.requestedMcpServers]),
      allowedAgentProfileIds: Object.freeze([node.profileId]),
      allowedPaths: Object.freeze(
        Array.isArray(parentPolicy.allowedPaths)
          ? parentPolicy.allowedPaths.filter((value): value is string => typeof value === 'string')
          : []
      ),
      allowedNetworkTargets: Object.freeze(
        Array.isArray(parentPolicy.allowedNetworkTargets)
          ? parentPolicy.allowedNetworkTargets.filter(
              (value): value is string => typeof value === 'string'
            )
          : []
      ),
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
      timeoutMs:
        typeof parentPolicy.timeoutMs === 'number' && parentPolicy.timeoutMs > 0
          ? parentPolicy.timeoutMs
          : 0,
      maxRunsPerWindow:
        typeof parentPolicy.maxRunsPerWindow === 'number' && parentPolicy.maxRunsPerWindow > 0
          ? parentPolicy.maxRunsPerWindow
          : 1,
      windowMs:
        typeof parentPolicy.windowMs === 'number' && parentPolicy.windowMs > 0
          ? parentPolicy.windowMs
          : 1
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

    const parentAllowedTools = new Set(
      Array.isArray(parentRun.metadata?.allowedToolIds)
        ? parentRun.metadata.allowedToolIds.filter(
            (value): value is string => typeof value === 'string'
          )
        : []
    )
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
          const child = await this.execute({
            objective: node.objective,
            profileId: node.profileId,
            cwd: parentRun.cwd,
            approved: false,
            allowedToolIds: node.requestedTools,
            parentRunId: parentRun.id,
            budget: node.budget,
            metadata: {
              delegationPlanId: plan.planId,
              delegationNodeId: node.nodeId,
              requestedMcpServers: [...node.requestedMcpServers],
              automationPolicy: this.childAutomationPolicy(parentRun, node)
            }
          })
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
