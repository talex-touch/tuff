import { randomUUID } from 'node:crypto'
import type {
  AdaptedStructuredTool,
  DesktopContextSnapshot,
  IntelligenceAgentPayload,
  IntelligenceAgentResult,
  IntelligenceChatPayload,
  IntelligenceMessage,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceUsageInfo,
  WorkflowModelInputSource,
  PromptWorkflowExecution,
  ToolSource,
  WorkflowDefinition,
  WorkflowDefinitionStep,
  WorkflowRunRecord,
  WorkflowRunStepRecord
} from '@talex-touch/tuff-intelligence'
import type { AgentTool } from '@talex-touch/utils'
import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import type { WorkflowExecutionContext } from './intelligence-workflow-service'
import {
  DeepAgentLangChainEngineAdapter,
  LangChainToolAdapter
} from '@talex-touch/tuff-intelligence'
import { AgentPermission } from '@talex-touch/utils'
import { createIntelligenceContextExecutionRequest } from '@talex-touch/utils/intelligence'
import { toolRegistry } from './agents/tool-registry'
import { intelligenceDesktopContextService } from './intelligence-desktop-context'
import { intelligenceMcpRegistry } from './intelligence-mcp-registry'
import { normalizeIntelligenceError } from './intelligence-error-normalizer'
import {
  inheritOuterGovernance,
  markOuterGovernedInvocation
} from './intelligence-invoke-governance'
import { tuffIntelligenceRuntime } from './tuff-intelligence-runtime'

const DEFAULT_CONTEXT_SOURCES: WorkflowDefinition['contextSources'] = [
  { type: 'clipboard.recent', enabled: true, label: '最近剪贴板', config: { limit: 8 } },
  { type: 'desktop.active-app', enabled: true, label: '前台应用' },
  { type: 'desktop.recent-files', enabled: true, label: '最近文件' },
  { type: 'browser.recent-urls', enabled: true, label: '最近 URL' },
  { type: 'session.memory', enabled: true, label: '当前会话记忆' }
]

const BUILTIN_WORKFLOW_TOOL_PREFIXES = ['clipboard.', 'desktop.context.', 'browser.']
const STABLE_MODEL_CAPABILITIES = new Set([
  'text.chat',
  'text.translate',
  'text.summarize',
  'text.rewrite',
  'code.explain',
  'code.review',
  'vision.ocr'
])

class WorkflowApprovalRequiredError extends Error {
  constructor(
    message: string,
    readonly ticketId: string,
    readonly callId: string
  ) {
    super(message)
    this.name = 'WorkflowApprovalRequiredError'
  }
}

interface WorkflowContextSessionState {
  initialized: boolean
}

interface DeepAgentExecutionContext {
  workflowId?: string
  workflowName?: string
  sessionId: string
  contextSessionId: string
  contextSessionState: WorkflowContextSessionState
  runId: string
  step: WorkflowRunStepRecord
  stepIndex: number
  contextSources: WorkflowDefinition['contextSources']
  contextSnapshot?: DesktopContextSnapshot
  workingDirectory?: string
  metadata?: Record<string, unknown>
  providerGovernance: 'outer' | 'self'
}

interface ToolCallMemoryEntry {
  toolId: string
  callId: string
}

function now(): number {
  return Date.now()
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function resolveExecutionCaller(
  metadata: Record<string, unknown> | undefined,
  fallback: string
): string {
  const caller = metadata?.caller
  return typeof caller === 'string' && caller.trim() ? caller.trim() : fallback
}

function normalizeIntelligenceUsage(value: unknown): IntelligenceUsageInfo | undefined {
  const record = toRecord(value)
  const promptTokens =
    typeof record.promptTokens === 'number' && Number.isFinite(record.promptTokens)
      ? Math.max(0, Math.floor(record.promptTokens))
      : undefined
  const completionTokens =
    typeof record.completionTokens === 'number' && Number.isFinite(record.completionTokens)
      ? Math.max(0, Math.floor(record.completionTokens))
      : undefined
  const totalTokens =
    typeof record.totalTokens === 'number' && Number.isFinite(record.totalTokens)
      ? Math.max(0, Math.floor(record.totalTokens))
      : undefined
  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  const prompt = promptTokens ?? 0
  const completion = completionTokens ?? 0
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: Math.max(totalTokens ?? prompt + completion, prompt + completion)
  }
}

function aggregateWorkflowUsage(outputs: unknown): IntelligenceUsageInfo {
  const aggregate: IntelligenceUsageInfo = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  }
  for (const output of Object.values(toRecord(outputs))) {
    const usage = normalizeIntelligenceUsage(toRecord(output).usage)
    if (!usage) {
      continue
    }
    aggregate.promptTokens += usage.promptTokens
    aggregate.completionTokens += usage.completionTokens
    aggregate.totalTokens += usage.totalTokens
  }
  return aggregate
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  )
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

function stringifyForPrompt(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isIntelligenceMessage(value: unknown): value is IntelligenceMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (!('role' in value) || !('content' in value)) return false
  return (
    (value.role === 'system' || value.role === 'user' || value.role === 'assistant') &&
    typeof value.content === 'string'
  )
}

function hasIntelligenceMessages(
  payload: Record<string, unknown>
): payload is Record<string, unknown> & { messages: IntelligenceMessage[] } {
  return Array.isArray(payload.messages) && payload.messages.every(isIntelligenceMessage)
}

function requireChatPayload(payload: Record<string, unknown>): IntelligenceChatPayload {
  if (!hasIntelligenceMessages(payload)) {
    throw new Error('[Intelligence] workflow text.chat payload requires valid messages')
  }
  return payload
}

function resolveChatPayloadInput(payload: IntelligenceChatPayload): string {
  for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
    const message = payload.messages[index]
    if (message.role === 'user' && message.content.trim()) {
      return message.content.trim()
    }
  }
  return ''
}

function readPath(source: unknown, path?: string): unknown {
  if (!path) {
    return source
  }

  return path.split('.').reduce((current, part) => {
    if (!part) {
      return current
    }
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[part]
    }
    return undefined
  }, source)
}

function normalizeTextResult(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  const record = toRecord(value)
  if (typeof record.text === 'string' && record.text.trim()) {
    return record.text.trim()
  }
  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content.trim()
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toToolTextResult(value: unknown): string {
  return normalizeTextResult(value)
}

function resolveStringInput(
  input: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return fallback
}

function omitWorkflowModelRoutingFields(input: Record<string, unknown>): Record<string, unknown> {
  const {
    allowedProviderIds,
    capabilityId,
    inputSources,
    metadata,
    modelPreference,
    output,
    outputFormat,
    preferredProviderId,
    timeout,
    ...payload
  } = input
  void allowedProviderIds
  void capabilityId
  void inputSources
  void metadata
  void modelPreference
  void output
  void outputFormat
  void preferredProviderId
  void timeout
  return payload
}

function resolveModelInputSourceText(
  source: WorkflowModelInputSource,
  executionContext: DeepAgentExecutionContext,
  state: {
    inputs: Record<string, unknown>
    previousOutputs: Record<string, unknown>
  }
): string {
  let value: unknown

  switch (source.type) {
    case 'literal':
      value = source.text
      break
    case 'workflow.input':
    case 'selectionRef':
    case 'ocrRef':
    case 'fileTextRef':
      value = readPath(state.inputs, source.key || 'text')
      break
    case 'clipboardRef':
      value = executionContext.contextSnapshot?.clipboard
        ?.map((item) => item.content)
        .filter(Boolean)
        .join('\n\n')
      break
    case 'previousStep':
      value = source.stepId
        ? readPath(state.previousOutputs[source.stepId], source.field)
        : state.previousOutputs
      break
    default:
      value = readPath(state.inputs, source.key)
      break
  }

  const text = normalizeTextResult(value)
  if (text) {
    return source.label ? `${source.label}:\n${text}` : text
  }
  return source.fallback ? `${source.label || source.type}:\n${source.fallback}` : ''
}

function computeRiskLevel(tool: AgentTool): 'low' | 'medium' | 'high' | 'critical' {
  const permissionSet = new Set(tool.permissions ?? [])
  const normalizedId = String(tool.id || '')
    .trim()
    .toLowerCase()

  if (
    permissionSet.has(AgentPermission.SYSTEM_EXEC) ||
    permissionSet.has(AgentPermission.FILE_DELETE) ||
    normalizedId.includes('delete') ||
    normalizedId.includes('shell') ||
    normalizedId.includes('system')
  ) {
    return 'critical'
  }

  if (
    permissionSet.has(AgentPermission.CLIPBOARD_WRITE) ||
    permissionSet.has(AgentPermission.FILE_WRITE) ||
    normalizedId.includes('write') ||
    normalizedId.includes('submit') ||
    normalizedId.includes('fill') ||
    normalizedId.includes('click')
  ) {
    return 'high'
  }

  if (
    permissionSet.has(AgentPermission.NETWORK_ACCESS) ||
    normalizedId.includes('open') ||
    normalizedId.includes('search') ||
    normalizedId.includes('navigate') ||
    normalizedId.includes('extract')
  ) {
    return 'medium'
  }

  return 'low'
}

function resolveSessionId(seed: { sessionId?: string; runId: string; prefix: string }): string {
  const explicit = String(seed.sessionId || '').trim()
  if (explicit) {
    return explicit
  }
  return `${seed.prefix}.${seed.runId}`
}

function resolveToolFingerprint(
  step: WorkflowRunStepRecord,
  toolId: string,
  input: unknown
): string {
  return `${String(step.workflowStepId || step.id || 'step')}:${toolId}:${stableStringify(input)}`
}

function getToolCallMemory(step: WorkflowRunStepRecord): Record<string, ToolCallMemoryEntry> {
  const metadata = toRecord(step.metadata)
  const cache = toRecord(metadata.toolCallMemory)
  return Object.fromEntries(
    Object.entries(cache)
      .filter(([, value]) => {
        const entry = toRecord(value)
        return typeof entry.toolId === 'string' && typeof entry.callId === 'string'
      })
      .map(([key, value]) => {
        const entry = toRecord(value)
        return [
          key,
          {
            toolId: String(entry.toolId),
            callId: String(entry.callId)
          } satisfies ToolCallMemoryEntry
        ]
      })
  )
}

function setToolCallMemory(
  step: WorkflowRunStepRecord,
  fingerprint: string,
  entry: ToolCallMemoryEntry
): void {
  const metadata = toRecord(step.metadata)
  const memory = getToolCallMemory(step)
  memory[fingerprint] = entry
  step.metadata = {
    ...metadata,
    toolCallMemory: memory
  }
}

function ensureCopy<T>(value: T): T {
  if (!value || typeof value !== 'object') {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}

async function getIntelligenceSdk() {
  const module = await import('./intelligence-sdk')
  return module.tuffIntelligence
}

async function getContextExecutionService() {
  const module = await import('./intelligence-context-execution')
  return module.intelligenceContextExecutionService
}

export class IntelligenceDeepAgentOrchestrationService {
  registerMcpProfiles(profiles: IntelligenceMcpProfile[]): void {
    intelligenceMcpRegistry.registerProfiles(profiles)
  }

  async executeWorkflowRun(ctx: WorkflowExecutionContext): Promise<WorkflowRunRecord> {
    const sessionId = resolveSessionId({
      sessionId: ctx.sessionId,
      runId: ctx.run.id,
      prefix: 'workflow-session'
    })
    const contextSessionId = `workflow-context.${ctx.run.id}`
    const contextSessionState: WorkflowContextSessionState = { initialized: false }

    await tuffIntelligenceRuntime.startSession({
      sessionId,
      objective: ctx.workflow.name,
      context: {
        workflowId: ctx.workflow.id,
        workflowName: ctx.workflow.name,
        inputs: ctx.inputs
      },
      metadata: {
        ...(ctx.metadata ?? {}),
        workflowId: ctx.workflow.id,
        workflowName: ctx.workflow.name,
        workflowRunId: ctx.run.id,
        source: 'intelligence.workflow'
      }
    })

    const contextSnapshot =
      ctx.run.contextSnapshot && typeof ctx.run.contextSnapshot === 'object'
        ? (ctx.run.contextSnapshot as DesktopContextSnapshot)
        : await intelligenceDesktopContextService.capture({
            contextSources: ctx.workflow.contextSources,
            sessionId
          })

    const run: WorkflowRunRecord = {
      ...ctx.run,
      status: 'running',
      contextSnapshot,
      metadata: {
        ...(ctx.run.metadata ?? {}),
        ...(ctx.metadata ?? {}),
        sessionId,
        contextSessionId
      },
      outputs: {
        ...(ctx.run.outputs ?? {})
      }
    }

    const steps = run.steps ?? []
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      const definitionStep =
        ctx.workflow.steps.find((item) => item.id === step.workflowStepId || item.id === step.id) ??
        ctx.workflow.steps[index]

      if (!definitionStep) {
        continue
      }
      if (step.status === 'completed') {
        continue
      }

      step.status = 'running'
      step.error = undefined
      step.startedAt = step.startedAt ?? now()
      step.completedAt = undefined
      await ctx.onUpdate(run)

      try {
        const output = await this.executeWorkflowStep(
          definitionStep,
          {
            workflowId: ctx.workflow.id,
            workflowName: ctx.workflow.name,
            sessionId,
            contextSessionId,
            contextSessionState,
            runId: run.id,
            step,
            stepIndex: index,
            contextSources: ctx.workflow.contextSources,
            contextSnapshot,
            workingDirectory:
              typeof ctx.metadata?.workingDirectory === 'string'
                ? ctx.metadata.workingDirectory
                : undefined,
            providerGovernance: ctx.providerGovernance ?? 'self',
            metadata: ctx.metadata
          },
          {
            inputs: ctx.inputs,
            previousOutputs: run.outputs ?? {}
          }
        )

        step.output = output
        step.status = 'completed'
        step.completedAt = now()
        run.outputs = {
          ...(run.outputs ?? {}),
          [step.workflowStepId || step.id || `step_${index + 1}`]: output
        }
        await ctx.onUpdate(run)
      } catch (error) {
        if (error instanceof WorkflowApprovalRequiredError) {
          step.status = 'waiting_approval'
          step.metadata = {
            ...toRecord(step.metadata),
            approvalTicketId: error.ticketId,
            callId: error.callId
          }
          run.status = 'waiting_approval'
          run.completedAt = undefined
          await ctx.onUpdate(run)
          return run
        }

        step.status = 'failed'
        step.error = error instanceof Error ? error.message : String(error)
        step.completedAt = now()
        await ctx.onUpdate(run)

        const shouldContinue = ctx.continueOnError || definitionStep.continueOnError === true
        if (!shouldContinue) {
          run.status = 'failed'
          run.error = step.error
          run.completedAt = now()
          await ctx.onUpdate(run)
          return run
        }
      }
    }

    run.status = 'completed'
    run.completedAt = now()
    return run
  }

  async executeWorkflowCapability(
    payload: unknown,
    runtimeOptions: IntelligenceInvokeOptions = {}
  ): Promise<IntelligenceInvokeResult<PromptWorkflowExecution>> {
    const workflow = this.normalizeInlineWorkflowPayload(payload)
    const runId = `inline_${Date.now()}_${randomUUID()}`
    const run = await this.executeWorkflowRun({
      workflow,
      run: {
        id: runId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: 'pending',
        triggerType: 'manual',
        inputs: toRecord((payload as { inputs?: Record<string, unknown> } | undefined)?.inputs),
        steps: workflow.steps.map((step) => ({
          workflowStepId: step.id,
          kind: step.kind,
          name: step.name,
          status: 'pending',
          toolId: step.toolId,
          toolSource: step.toolSource,
          input: step.input ?? {},
          metadata: step.metadata ?? {}
        })),
        startedAt: now(),
        metadata: runtimeOptions.metadata
      },
      inputs: toRecord((payload as { inputs?: Record<string, unknown> } | undefined)?.inputs),
      sessionId:
        typeof runtimeOptions.metadata?.sessionId === 'string'
          ? runtimeOptions.metadata.sessionId
          : undefined,
      triggerType: 'manual',
      continueOnError: Boolean(
        (payload as { continueOnError?: boolean } | undefined)?.continueOnError
      ),
      metadata: runtimeOptions.metadata,
      providerGovernance: 'outer',
      onUpdate: async () => undefined
    })

    return {
      result: this.toPromptWorkflowExecution(run),
      usage: aggregateWorkflowUsage(run.outputs),
      model: 'deepagent-langchain',
      latency: Math.max(0, now() - run.startedAt),
      traceId: run.id,
      provider: 'intelligence-deepagent'
    }
  }

  async executeAgentCapability(
    payload: IntelligenceAgentPayload,
    runtimeOptions: IntelligenceInvokeOptions = {}
  ): Promise<IntelligenceInvokeResult<IntelligenceAgentResult>> {
    const task = String(payload.task || '').trim()
    if (!task) {
      throw new Error('[Intelligence] agent.run requires a task string')
    }

    const sessionId = resolveSessionId({
      sessionId:
        typeof runtimeOptions.metadata?.sessionId === 'string'
          ? runtimeOptions.metadata.sessionId
          : undefined,
      runId: `agent_${Date.now()}`,
      prefix: 'agent-session'
    })

    await tuffIntelligenceRuntime.startSession({
      sessionId,
      objective: task,
      context: {
        context: payload.context,
        constraints: payload.constraints,
        memory: payload.memory
      },
      metadata: {
        ...(runtimeOptions.metadata ?? {}),
        source: 'intelligence.agent'
      }
    })

    const contextSnapshot = await intelligenceDesktopContextService.capture({
      contextSources: DEFAULT_CONTEXT_SOURCES,
      sessionId
    })
    const traceBefore = await tuffIntelligenceRuntime.queryTrace({
      sessionId,
      limit: 500
    })
    const beforeSeq = traceBefore.length > 0 ? (traceBefore[traceBefore.length - 1]?.seq ?? 0) : 0

    const result = await this.runDeepAgent({
      capabilityId: 'agent.run',
      sessionId,
      prompt: this.buildAgentPrompt(payload, contextSnapshot),
      tools: await this.buildStructuredTools({
        sessionId,
        contextSessionId: `agent-context.${sessionId}`,
        contextSessionState: { initialized: false },
        runId: sessionId,
        step: {
          workflowStepId: 'agent.run',
          kind: 'agent',
          name: 'agent.run',
          status: 'running',
          metadata: runtimeOptions.metadata ?? {}
        },
        stepIndex: 0,
        contextSources: DEFAULT_CONTEXT_SOURCES,
        contextSnapshot,
        metadata: runtimeOptions.metadata,
        providerGovernance: 'outer'
      }),
      metadata: runtimeOptions.metadata,
      providerGovernance: 'outer'
    })

    const traceAfter = await tuffIntelligenceRuntime.queryTrace({
      sessionId,
      fromSeq: beforeSeq + 1,
      limit: 500
    })

    const toolCalls = traceAfter
      .filter((event) => event.type === 'tool.called' || event.type === 'tool.completed')
      .map((event) => ({
        tool: String(event.payload?.toolId || event.payload?.toolName || 'unknown'),
        input: event.payload?.input,
        output: event.payload?.output
      }))

    return {
      result: {
        result: result.text,
        steps: [
          {
            thought: 'deepagent',
            observation: result.text
          }
        ],
        toolCalls,
        iterations: 1
      },
      usage: result.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: result.model || 'deepagent-langchain',
      latency: result.durationMs,
      traceId: sessionId,
      provider: result.provider || 'intelligence-deepagent'
    }
  }

  private async executeWorkflowStep(
    definitionStep: WorkflowDefinitionStep,
    executionContext: DeepAgentExecutionContext,
    state: {
      inputs: Record<string, unknown>
      previousOutputs: Record<string, unknown>
    }
  ): Promise<unknown> {
    const metadataCapabilityId = String(definitionStep.metadata?.capabilityId || '').trim()
    if (metadataCapabilityId && metadataCapabilityId !== 'workflow.execute') {
      throw new Error(
        `[Intelligence] workflow step ${definitionStep.id} uses retired capabilityId routing`
      )
    }

    if (definitionStep.kind === 'tool') {
      return await this.executeDirectToolStep(definitionStep, executionContext)
    }

    if (definitionStep.kind === 'model') {
      return await this.executeModelStep(definitionStep, executionContext, state)
    }

    if (definitionStep.kind === 'prompt') {
      const result = await this.runDeepAgent({
        capabilityId: 'workflow.execute',
        sessionId: executionContext.sessionId,
        prompt: this.buildWorkflowPrompt(definitionStep, executionContext, state),
        tools: [],
        metadata: executionContext.metadata,
        providerGovernance: executionContext.providerGovernance
      })
      return {
        text: result.text,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        latency: result.durationMs
      }
    }

    const result = await this.runDeepAgent({
      capabilityId: 'workflow.execute',
      sessionId: executionContext.sessionId,
      prompt: this.buildWorkflowAgentPrompt(definitionStep, executionContext, state),
      tools: await this.buildStructuredTools(executionContext),
      metadata: executionContext.metadata,
      providerGovernance: executionContext.providerGovernance
    })

    return {
      text: result.text,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      latency: result.durationMs
    }
  }

  private async executeModelStep(
    definitionStep: WorkflowDefinitionStep,
    executionContext: DeepAgentExecutionContext,
    state: {
      inputs: Record<string, unknown>
      previousOutputs: Record<string, unknown>
    }
  ): Promise<unknown> {
    const input = toRecord(definitionStep.input)
    const capabilityId = String(input.capabilityId || 'text.chat').trim()
    if (!STABLE_MODEL_CAPABILITIES.has(capabilityId)) {
      throw new Error(
        `[Intelligence] workflow model step ${definitionStep.id} only supports stable capabilities`
      )
    }

    const payload = this.buildModelStepPayload(
      capabilityId,
      definitionStep,
      executionContext,
      state
    )
    const caller = resolveExecutionCaller(executionContext.metadata, 'workflow.use-model')

    const invokeOptions: IntelligenceInvokeOptions = {
      metadata: {
        ...(executionContext.metadata ?? {}),
        ...(toRecord(input.metadata) ?? {}),
        caller,
        source: 'intelligence.workflow.model',
        workflowId: executionContext.workflowId,
        workflowName: executionContext.workflowName,
        workflowRunId: executionContext.runId,
        workflowStepId: executionContext.step.workflowStepId || definitionStep.id,
        sessionId: executionContext.sessionId
      },
      modelPreference: Array.isArray(input.modelPreference)
        ? input.modelPreference.filter((item): item is string => typeof item === 'string')
        : undefined,
      allowedProviderIds: Array.isArray(input.allowedProviderIds)
        ? input.allowedProviderIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      preferredProviderId:
        typeof input.preferredProviderId === 'string' ? input.preferredProviderId : undefined,
      timeout: typeof input.timeout === 'number' ? input.timeout : undefined
    }
    if (executionContext.providerGovernance === 'outer') {
      markOuterGovernedInvocation(invokeOptions)
    }
    let result: IntelligenceInvokeResult<unknown>
    if (capabilityId === 'text.chat') {
      const chatPayload = requireChatPayload(payload)
      const contextExecutionService = await getContextExecutionService()
      const contextMode = executionContext.contextSessionState.initialized ? 'continue' : 'new'
      executionContext.contextSessionState.initialized = true
      const contextRequest = createIntelligenceContextExecutionRequest({
        capabilityId,
        input: resolveChatPayloadInput(chatPayload),
        payload: chatPayload,
        options: invokeOptions,
        policy: {
          entrypointId: 'workflow.use-model',
          owner: 'workflow',
          mode: contextMode,
          sessionId: executionContext.contextSessionId,
          scope: 'session',
          objective: executionContext.workflowName || executionContext.workflowId,
          traceId: `${executionContext.runId}:${
            executionContext.step.workflowStepId || definitionStep.id
          }`
        }
      })
      if (contextRequest.options) inheritOuterGovernance(invokeOptions, contextRequest.options)
      const execution = await contextExecutionService.invoke(contextRequest, {
        id: caller,
        type: 'host'
      })
      result = execution.invocation
    } else {
      result = await (await getIntelligenceSdk()).invoke(capabilityId, payload, invokeOptions)
    }

    return {
      result: result.result,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      latency: result.latency,
      traceId: result.traceId,
      capabilityId
    }
  }

  private buildModelStepPayload(
    capabilityId: string,
    step: WorkflowDefinitionStep,
    executionContext: DeepAgentExecutionContext,
    state: {
      inputs: Record<string, unknown>
      previousOutputs: Record<string, unknown>
    }
  ): Record<string, unknown> {
    const input = toRecord(step.input)
    const text = resolveStringInput(input, ['text', 'inputText', 'content'], '')
    const sourceText = (step.inputSources ?? [])
      .map((source) => resolveModelInputSourceText(source, executionContext, state))
      .filter(Boolean)
      .join('\n\n')
    const outputContract = step.output
    const prompt = [
      step.prompt || step.description || '',
      text ? `输入:\n${text}` : '',
      sourceText ? `输入引用:\n${sourceText}` : '',
      outputContract?.format ? `输出格式:\n${outputContract.format}` : '',
      outputContract?.schema
        ? `输出 JSON schema:\n${stringifyForPrompt(outputContract.schema)}`
        : '',
      `工作流输入:\n${stringifyForPrompt(state.inputs)}`,
      `桌面上下文:\n${stringifyForPrompt(executionContext.contextSnapshot)}`,
      `前置步骤输出:\n${stringifyForPrompt(state.previousOutputs)}`
    ]
      .filter(Boolean)
      .join('\n\n')
    const code = resolveStringInput(input, ['code', 'text', 'inputText'], text || prompt)
    const payloadInput = omitWorkflowModelRoutingFields(input)

    switch (capabilityId) {
      case 'text.translate':
        return {
          ...payloadInput,
          text: text || prompt,
          targetLang: resolveStringInput(input, ['targetLang', 'targetLanguage'], 'zh-CN'),
          sourceLang: typeof input.sourceLang === 'string' ? input.sourceLang : undefined
        }
      case 'text.summarize':
        return {
          ...payloadInput,
          text: text || prompt
        }
      case 'text.rewrite':
        return {
          ...payloadInput,
          text: text || prompt
        }
      case 'code.explain':
        return {
          ...payloadInput,
          code,
          language: typeof input.language === 'string' ? input.language : undefined
        }
      case 'code.review':
        return {
          ...payloadInput,
          code,
          language: typeof input.language === 'string' ? input.language : undefined,
          context: resolveStringInput(input, ['context'], prompt)
        }
      case 'vision.ocr':
        return payloadInput
      case 'text.chat':
      default:
        return {
          ...payloadInput,
          messages: Array.isArray(input.messages)
            ? input.messages
            : [
                {
                  role: 'user',
                  content: prompt || text || '请处理当前工作流输入。'
                }
              ]
        }
    }
  }

  private async executeDirectToolStep(
    definitionStep: WorkflowDefinitionStep,
    executionContext: DeepAgentExecutionContext
  ): Promise<unknown> {
    const toolId = String(definitionStep.toolId || '').trim()
    if (!toolId) {
      throw new Error('workflow tool step missing toolId')
    }

    const fingerprint = resolveToolFingerprint(
      executionContext.step,
      toolId,
      definitionStep.input ?? {}
    )
    const memory = getToolCallMemory(executionContext.step)
    const callId =
      memory[fingerprint]?.callId ||
      `${executionContext.runId}_${executionContext.stepIndex}_${toolId}_${Math.abs(fingerprint.length)}`
    setToolCallMemory(executionContext.step, fingerprint, { toolId, callId })

    const registeredTool = toolRegistry.getTool(toolId)
    const riskLevel = registeredTool ? computeRiskLevel(registeredTool) : 'medium'
    const result = await tuffIntelligenceRuntime.callTool({
      sessionId: executionContext.sessionId,
      toolId,
      input: definitionStep.input ?? {},
      callId,
      riskLevel,
      metadata: {
        ...(executionContext.metadata ?? {}),
        toolId,
        toolSource: definitionStep.toolSource === 'mcp' ? 'mcp' : 'builtin',
        riskLevel,
        approvalContext: {
          workflowId: executionContext.workflowId,
          workflowName: executionContext.workflowName,
          runId: executionContext.runId,
          stepId: executionContext.step.workflowStepId
        },
        contextSources: executionContext.contextSources,
        workingDirectory: executionContext.workingDirectory
      }
    })

    if (result.approvalTicket) {
      throw new WorkflowApprovalRequiredError(
        result.error || 'approval required',
        result.approvalTicket.id,
        callId
      )
    }

    if (!result.success) {
      throw new Error(result.error || `Tool ${toolId} failed`)
    }

    return result.output
  }

  private async buildStructuredTools(
    executionContext: DeepAgentExecutionContext
  ): Promise<AdaptedStructuredTool[]> {
    const builtinTools = toolRegistry
      .getAllTools()
      .filter((tool) =>
        BUILTIN_WORKFLOW_TOOL_PREFIXES.some((prefix) => String(tool.id).startsWith(prefix))
      )

    const tools = builtinTools.map((tool) =>
      this.createStructuredTool(tool, 'builtin', executionContext)
    )
    const mcpProfiles = this.resolveMcpProfiles(executionContext)
    if (mcpProfiles.length <= 0) {
      return tools
    }

    intelligenceMcpRegistry.registerProfiles(mcpProfiles)
    const structuredMcpTools = await intelligenceMcpRegistry.listStructuredTools(
      mcpProfiles.map((profile) => profile.id)
    )
    for (const tool of structuredMcpTools) {
      this.registerMcpToolToRegistry(tool)
      const registered = toolRegistry.getTool(tool.tuffMetadata.toolId)
      if (!registered) {
        continue
      }
      tools.push(this.createStructuredTool(registered, 'mcp', executionContext))
    }
    return tools
  }

  private createStructuredTool(
    tool: AgentTool,
    source: ToolSource,
    executionContext: DeepAgentExecutionContext
  ): AdaptedStructuredTool {
    const riskLevel = computeRiskLevel(tool)
    return LangChainToolAdapter.fromDefinition({
      id: tool.id,
      name: tool.id,
      description: tool.description,
      schema: (tool.inputSchema ?? {
        type: 'object',
        properties: {}
      }) as unknown as Record<string, unknown>,
      source,
      riskLevel,
      approvalRequired: riskLevel === 'high' || riskLevel === 'critical',
      metadata: {
        category: tool.category,
        permissions: tool.permissions
      },
      execute: async (input) => {
        const fingerprint = resolveToolFingerprint(executionContext.step, tool.id, input)
        const memory = getToolCallMemory(executionContext.step)
        const callId =
          memory[fingerprint]?.callId ||
          `${executionContext.runId}_${executionContext.stepIndex}_${tool.id}_${Math.abs(fingerprint.length)}`
        setToolCallMemory(executionContext.step, fingerprint, { toolId: tool.id, callId })

        const result = await tuffIntelligenceRuntime.callTool({
          sessionId: executionContext.sessionId,
          toolId: tool.id,
          input,
          callId,
          riskLevel,
          metadata: {
            ...(executionContext.metadata ?? {}),
            toolId: tool.id,
            toolSource: source,
            riskLevel,
            approvalContext: {
              workflowId: executionContext.workflowId,
              workflowName: executionContext.workflowName,
              runId: executionContext.runId,
              stepId: executionContext.step.workflowStepId
            },
            contextSources: executionContext.contextSources,
            workingDirectory: executionContext.workingDirectory
          }
        })

        if (result.approvalTicket) {
          throw new WorkflowApprovalRequiredError(
            result.error || 'approval required',
            result.approvalTicket.id,
            callId
          )
        }
        if (!result.success) {
          throw new Error(result.error || `Tool ${tool.id} failed`)
        }
        return toToolTextResult(result.output)
      }
    })
  }

  private registerMcpToolToRegistry(tool: AdaptedStructuredTool): void {
    const toolId = tool.tuffMetadata.toolId
    const metadata = toRecord(tool.tuffMetadata.metadata)
    const toolName = String(metadata.toolName || tool.name || toolId).trim()
    const profileId = String(metadata.profileId || '').trim()
    if (!profileId || !toolName) {
      return
    }

    toolRegistry.registerTool(
      {
        id: toolId,
        name: toolId,
        description: tool.description,
        category: 'mcp',
        inputSchema: ((tool as unknown as { schema?: Record<string, unknown> }).schema ?? {
          type: 'object',
          properties: {}
        }) as unknown as AgentTool['inputSchema'],
        permissions: [AgentPermission.NETWORK_ACCESS]
      },
      async (input) => {
        return await intelligenceMcpRegistry.callTool(profileId, toolName, input)
      }
    )
  }

  private resolveMcpProfiles(
    executionContext: DeepAgentExecutionContext
  ): IntelligenceMcpProfile[] {
    const merged = [
      ...(Array.isArray(executionContext.metadata?.mcpProfiles)
        ? (executionContext.metadata?.mcpProfiles as IntelligenceMcpProfile[])
        : []),
      ...(Array.isArray(executionContext.step.metadata?.mcpProfiles)
        ? (executionContext.step.metadata?.mcpProfiles as IntelligenceMcpProfile[])
        : [])
    ]

    const deduped = new Map<string, IntelligenceMcpProfile>()
    for (const profile of merged) {
      if (!profile || typeof profile !== 'object' || !profile.id) {
        continue
      }
      deduped.set(profile.id, ensureCopy(profile))
    }
    return Array.from(deduped.values())
  }

  private async runDeepAgent(options: {
    capabilityId: string
    sessionId: string
    prompt: string
    tools: AdaptedStructuredTool[]
    metadata?: Record<string, unknown>
    providerGovernance: 'outer' | 'self'
  }): Promise<{
    text: string
    provider?: string
    model?: string
    usage?: IntelligenceUsageInfo
    durationMs: number
  }> {
    const intelligence = await getIntelligenceSdk()
    const caller = resolveExecutionCaller(options.metadata, '')
    const selfGoverned = options.providerGovernance === 'self' && caller.startsWith('plugin:')

    if (selfGoverned) {
      const quota = await intelligence.checkQuota(caller)
      if (!quota.allowed) {
        throw Object.assign(
          new Error(`[Intelligence] Quota exceeded: ${quota.reason ?? 'quota exhausted'}`),
          { code: 'QUOTA_EXHAUSTED' }
        )
      }
    }

    const startedAt = now()
    const traceId = `deepagent-${randomUUID()}`
    let provider = 'intelligence-deepagent'
    let model = 'deepagent-langchain'

    try {
      const config = await intelligence.resolveDeepAgentRuntimeConfig(options.capabilityId, {
        metadata: {
          ...(options.metadata ?? {}),
          sessionId: options.sessionId
        }
      })
      provider = config.providerId || provider
      model = config.model || model

      const adapter = new DeepAgentLangChainEngineAdapter({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        instructions: config.instructions,
        metadata: {
          ...(config.runtimeOptions.metadata ?? {}),
          ...(options.metadata ?? {}),
          sessionId: options.sessionId,
          adapter: 'tuff.deepagent.workflow'
        },
        tools: options.tools
      })

      const raw = await adapter.run({
        sessionId: options.sessionId,
        turnId: `${options.sessionId}:${startedAt}`,
        done: false,
        seq: 1,
        messages: [
          {
            role: 'user',
            content: options.prompt
          }
        ],
        events: [],
        metadata: {
          ...(options.metadata ?? {}),
          capabilityId: options.capabilityId
        }
      })

      const record = toRecord(raw)
      const text = normalizeTextResult(record.text ?? record.content ?? raw)
      const metadata = toRecord(record.metadata)
      const usage = normalizeIntelligenceUsage(metadata.usage ?? record.usage)
      provider =
        typeof metadata.provider === 'string' && metadata.provider ? metadata.provider : provider
      model = typeof metadata.model === 'string' && metadata.model ? metadata.model : model
      const durationMs = now() - startedAt

      if (selfGoverned) {
        await intelligence.recordRuntimeAudit({
          traceId,
          timestamp: startedAt,
          capabilityId: options.capabilityId,
          provider,
          model,
          caller,
          usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latency: durationMs,
          success: true,
          metadata: {
            source: 'intelligence.workflow.deepagent',
            sessionId: options.sessionId
          }
        })
      }

      return {
        text,
        provider,
        model,
        usage,
        durationMs
      }
    } catch (error) {
      if (selfGoverned) {
        const normalized = normalizeIntelligenceError(error, {
          capabilityId: options.capabilityId
        })
        await intelligence.recordRuntimeAudit({
          traceId,
          timestamp: startedAt,
          capabilityId: options.capabilityId,
          provider,
          model,
          caller,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latency: now() - startedAt,
          success: false,
          error: normalized.message,
          metadata: {
            source: 'intelligence.workflow.deepagent',
            sessionId: options.sessionId,
            errorCode: normalized.code,
            reason: normalized.reason,
            recovery: normalized.recovery
          }
        })
      }
      throw error
    }
  }

  private buildWorkflowPrompt(
    step: WorkflowDefinitionStep,
    executionContext: DeepAgentExecutionContext,
    state: {
      inputs: Record<string, unknown>
      previousOutputs: Record<string, unknown>
    }
  ): string {
    return [
      `你正在执行工作流步骤。`,
      executionContext.workflowName ? `工作流: ${executionContext.workflowName}` : '',
      `步骤: ${step.name || step.id || 'prompt-step'}`,
      step.description ? `说明: ${step.description}` : '',
      `工作流输入:`,
      stringifyForPrompt(state.inputs),
      `桌面上下文:`,
      stringifyForPrompt(executionContext.contextSnapshot),
      `前置步骤输出:`,
      stringifyForPrompt(state.previousOutputs),
      `当前步骤输入:`,
      stringifyForPrompt(step.input ?? {}),
      step.prompt ? `请严格按以下要求完成:\n${step.prompt}` : '请返回本步骤的结果。'
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  private buildWorkflowAgentPrompt(
    step: WorkflowDefinitionStep,
    executionContext: DeepAgentExecutionContext,
    state: {
      inputs: Record<string, unknown>
      previousOutputs: Record<string, unknown>
    }
  ): string {
    return [
      `你正在执行一个 Tuff workflow agent step，可以按需调用工具。`,
      executionContext.workflowName ? `工作流: ${executionContext.workflowName}` : '',
      `步骤: ${step.name || step.id || 'agent-step'}`,
      step.description ? `说明: ${step.description}` : '',
      `工作流输入:`,
      stringifyForPrompt(state.inputs),
      `桌面上下文快照:`,
      stringifyForPrompt(executionContext.contextSnapshot),
      `已完成步骤输出:`,
      stringifyForPrompt(state.previousOutputs),
      `当前步骤输入:`,
      stringifyForPrompt(step.input ?? {}),
      step.prompt
        ? `额外要求:\n${step.prompt}`
        : '如果需要读取最近剪贴板、前台应用、网页内容或调用 MCP 云端工具，请直接使用可用工具。最终仅返回可读结果。'
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  private buildAgentPrompt(
    payload: IntelligenceAgentPayload,
    contextSnapshot: DesktopContextSnapshot
  ): string {
    return [
      `你是 Tuff Intelligence 的 DeepAgent 执行内核，可以按需调用工具。`,
      `任务: ${payload.task}`,
      payload.context ? `补充上下文:\n${payload.context}` : '',
      Array.isArray(payload.constraints) && payload.constraints.length > 0
        ? `约束:\n${payload.constraints.map((item) => `- ${item}`).join('\n')}`
        : '',
      Array.isArray(payload.memory) && payload.memory.length > 0
        ? `记忆:\n${payload.memory.map((item) => `${item.role}: ${item.content}`).join('\n')}`
        : '',
      `桌面上下文快照:`,
      stringifyForPrompt(contextSnapshot),
      `如果需要浏览器、剪贴板、桌面上下文或 MCP 工具，请直接调用。最后返回简洁结果。`
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  private normalizeInlineWorkflowPayload(payload: unknown): WorkflowDefinition {
    const data = toRecord(payload)
    const rawSteps = Array.isArray(data.steps) ? data.steps : []
    if (rawSteps.length <= 0) {
      throw new Error('[Intelligence] workflow.execute requires non-empty steps')
    }

    const steps: WorkflowDefinition['steps'] = rawSteps.map((item, index) => {
      const step = toRecord(item)
      const kind = String(step.kind || '').trim()
      const agentId = String(step.agentId || '').trim()
      const toolId = String(step.toolId || '').trim()
      const capabilityId = String(step.capabilityId || '').trim()
      if (capabilityId) {
        throw new Error(
          `[Intelligence] workflow.execute step ${String(step.id || index + 1)} rejects capabilityId`
        )
      }
      if (kind !== 'prompt' && kind !== 'tool' && kind !== 'agent' && kind !== 'model') {
        throw new Error(
          `[Intelligence] workflow.execute step ${String(step.id || index + 1)} requires explicit kind`
        )
      }
      if (kind === 'tool' && !toolId) {
        throw new Error(
          `[Intelligence] workflow.execute tool step ${String(step.id || index + 1)} requires toolId`
        )
      }
      if (kind === 'agent' && !agentId) {
        throw new Error(
          `[Intelligence] workflow.execute agent step ${String(step.id || index + 1)} requires agentId`
        )
      }

      return {
        id: String(step.id || `inline-step-${index + 1}`),
        name: String(step.name || `step-${index + 1}`),
        description: typeof step.description === 'string' ? step.description : undefined,
        kind,
        prompt: typeof step.prompt === 'string' ? step.prompt : undefined,
        toolId: kind === 'tool' ? toolId : undefined,
        toolSource: kind === 'tool' ? (step.toolSource === 'mcp' ? 'mcp' : 'builtin') : undefined,
        agentId: kind === 'agent' ? agentId : undefined,
        input: toRecord(step.input),
        continueOnError: step.continueOnError === true,
        metadata: toRecord(step.metadata)
      } satisfies WorkflowDefinitionStep
    })

    return {
      id: 'inline.workflow',
      name: 'Inline Workflow',
      description: 'Inline workflow contract normalized from workflow.execute payload.',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual', enabled: true, label: '手动运行' }],
      contextSources: DEFAULT_CONTEXT_SOURCES,
      toolSources: ['builtin', 'mcp'],
      approvalPolicy: {
        requireApprovalAtOrAbove: 'high',
        autoApproveReadOnly: true
      },
      steps,
      metadata: {
        contract: 'workflow.execute.inline'
      }
    }
  }

  private toPromptWorkflowExecution(run: WorkflowRunRecord): PromptWorkflowExecution {
    const status =
      run.status === 'waiting_approval'
        ? 'running'
        : (run.status as PromptWorkflowExecution['status'])

    return {
      id: run.id,
      workflowId: run.workflowId,
      status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      inputs: run.inputs,
      outputs: run.outputs,
      steps: (run.steps ?? []).map((step) => ({
        stepId: step.workflowStepId || step.id || 'step',
        status:
          step.status === 'waiting_approval'
            ? 'running'
            : step.status === 'completed' || step.status === 'failed' || step.status === 'skipped'
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
}

export const intelligenceDeepAgentOrchestrationService =
  new IntelligenceDeepAgentOrchestrationService()
