import type {
  AiAgentProfile,
  AiAutomationPolicy,
  AiOrchestratorEvent,
  AiOrchestratorExecuteRequest,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import type { UtilityProcess } from 'electron'
import type {
  PiRuntimeChildPayload,
  PiRuntimeModelRequest,
  PiRuntimeModelResponse,
  PiRuntimeParentMessage,
  PiRuntimeRunEvent,
  PiRuntimeRunResult,
  PiRuntimeStartPayload,
  PiRuntimeToolRequest,
  PiRuntimeToolResponse
} from './pi-agent-runtime-protocol'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app, utilityProcess } from 'electron'
import { createLogger } from '../../utils/logger'
import { AgentPermission } from '@talex-touch/utils'
import { agentManager, toolRegistry } from './agents'
import { tuffIntelligence } from './intelligence-sdk'
import { intelligenceMcpRegistry } from './intelligence-mcp-registry'
import { PI_RUNTIME_PROTOCOL_VERSION } from './pi-agent-runtime-protocol'

export type PiRuntimeToolCallOutcome = {
  error?: string
  output?: unknown
}

interface ActiveRunContext {
  run: AiOrchestratorRunRecord
  request: AiOrchestratorExecuteRequest
  profile: AiAgentProfile
  allowedToolIds: Set<string>
  consumedApprovalFingerprints: Set<string>
  controller: AbortController
  toolCalls: Map<string, Promise<PiRuntimeToolCallOutcome>>
  resolve: (result: PiRuntimeRunResult) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export interface PiAgentRuntimeHostOptions {
  onEvent?: (event: PiRuntimeRunEvent) => void | Promise<void>
  loadToolCallResult?: (
    runId: string,
    toolCallId: string
  ) => Promise<PiRuntimeToolCallOutcome | undefined>
  persistToolCallResult?: (
    runId: string,
    toolCallId: string,
    result: PiRuntimeToolCallOutcome
  ) => Promise<void>
  beginToolCall?: (
    runId: string,
    toolCallId: string,
    toolId: string,
    input: unknown
  ) => Promise<'execute' | 'interrupted'>
  onApprovalConsumed?: (runId: string, fingerprint: string) => void | Promise<void>
}

const runtimeLog = createLogger('Intelligence').child('PiRuntimeHost')
const BRIDGE_SYSTEM_PROMPT = `You are the model backend for Tuff Pi, a host-governed coordinator.
You receive the complete conversation and an explicit list of tools.
When a tool is required, reply with exactly one JSON object and no markdown:
{"type":"tool","name":"tool.name","arguments":{}}
Call one tool at a time. Use only a listed tool and provide valid arguments.
When no more tools are needed, return the final answer as plain text or {"type":"final","text":"..."}.`

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const SENSITIVE_TOOL_OUTPUT_KEY =
  /token|api.?key|secret|password|credential|authorization|cookie|authref/i
const MAX_SERIALIZED_TOOL_OUTPUT_CHARS = 64 * 1024

function canonicalToolInput(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalToolInput)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'toolCallId')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalToolInput(nested)])
  )
}

function approvalFingerprint(request: PiRuntimeToolRequest): string {
  return createHash('sha256')
    .update(`${request.toolId}:${JSON.stringify(canonicalToolInput(request.input))}`)
    .digest('hex')
}

function approvalRequired(
  kind: 'mcp' | 'permission' | 'tool',
  reason: string,
  fingerprint: string
): Error {
  return new Error(`APPROVAL_REQUIRED:${JSON.stringify({ kind, reason, fingerprint })}`)
}

function sanitizeToolOutput(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]'
  if (typeof value === 'string') return value.slice(0, 16_000)
  if (typeof value === 'bigint') return value.toString()
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitizeToolOutput(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, nested]) => [
        key,
        SENSITIVE_TOOL_OUTPUT_KEY.test(key) ? '[redacted]' : sanitizeToolOutput(nested, depth + 1)
      ])
  )
}

function serializeToolOutput(value: unknown): unknown {
  const sanitized = sanitizeToolOutput(value)
  try {
    const serialized = JSON.stringify(sanitized)
    if (serialized === undefined) return null
    if (serialized.length <= MAX_SERIALIZED_TOOL_OUTPUT_CHARS) return sanitized
    return `${serialized.slice(0, MAX_SERIALIZED_TOOL_OUTPUT_CHARS)}…[truncated]`
  } catch {
    return '[unserializable tool output]'
  }
}

function resolveWorkerPath(): string {
  const candidates = new Set<string>([
    path.join(__dirname, 'pi-agent-runtime-worker.js'),
    path.resolve(process.cwd(), 'out', 'main', 'pi-agent-runtime-worker.js')
  ])
  if (process.resourcesPath) {
    candidates.add(
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'out',
        'main',
        'pi-agent-runtime-worker.js'
      )
    )
    candidates.add(
      path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'pi-agent-runtime-worker.js')
    )
    candidates.add(path.join(process.resourcesPath, 'out', 'main', 'pi-agent-runtime-worker.js'))
  }
  const workerPath = Array.from(candidates).find((candidate) => existsSync(candidate))
  if (!workerPath) {
    throw new Error(`Pi runtime worker not found: ${Array.from(candidates).join(', ')}`)
  }
  return workerPath
}

function createRestrictedEnvironment(): NodeJS.ProcessEnv {
  const allowedKeys = [
    'HOME',
    'USERPROFILE',
    'PATH',
    'PATHEXT',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'NODE_ENV'
  ]
  const env: NodeJS.ProcessEnv = {}
  for (const key of allowedKeys) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return JSON.stringify(content ?? null)
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return String(block)
      const record = block as Record<string, unknown>
      if (record.type === 'text') return String(record.text || '')
      if (record.type === 'thinking') return String(record.thinking || '')
      if (record.type === 'toolCall') {
        return `[tool call ${String(record.name)} ${JSON.stringify(record.arguments ?? {})}]`
      }
      return JSON.stringify(record)
    })
    .join('\n')
}

function normalizeModelMessages(request: PiRuntimeModelRequest) {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: BRIDGE_SYSTEM_PROMPT }
  ]
  if (request.systemPrompt.trim()) {
    messages.push({ role: 'system', content: request.systemPrompt.trim() })
  }
  if (request.tools.length > 0) {
    messages.push({
      role: 'system',
      content: `Available tools:\n${JSON.stringify(request.tools)}`
    })
  }

  for (const raw of request.messages) {
    if (!raw || typeof raw !== 'object') continue
    const message = raw as Record<string, unknown>
    if (message.role === 'system' || message.role === 'user' || message.role === 'assistant') {
      messages.push({
        role: message.role,
        content: textFromContent(message.content)
      })
      continue
    }
    if (message.role === 'toolResult') {
      messages.push({
        role: 'user',
        content: `[Tool result: ${String(message.toolName || 'unknown')}]\n${textFromContent(message.content)}`
      })
    }
  }
  return messages
}

function canonicalPolicyPath(input: string): string {
  let cursor = path.resolve(input)
  const suffix: string[] = []
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    suffix.unshift(path.basename(cursor))
    cursor = parent
  }
  const canonicalRoot = existsSync(cursor) ? realpathSync.native(cursor) : cursor
  return path.resolve(canonicalRoot, ...suffix)
}

function assertAutomationToolPolicy(policy: AiAutomationPolicy, input: unknown, cwd: string): void {
  const allowedPaths = policy.allowedPaths.map((root) => canonicalPolicyPath(root))
  const allowedTargets = policy.allowedNetworkTargets.map((target) => {
    try {
      return new URL(target.includes('://') ? target : `https://${target}`).hostname.toLowerCase()
    } catch {
      return target.toLowerCase()
    }
  })
  const stack: Array<{ key: string; value: unknown }> = [{ key: '', value: input }]
  const visited = new WeakSet<object>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (typeof current.value === 'string') {
      if (/(?:path|file|folder|directory|cwd|root|source|destination)$/i.test(current.key)) {
        const candidate = canonicalPolicyPath(path.resolve(cwd, current.value))
        const allowed = allowedPaths.some((root) => {
          const relative = path.relative(root, candidate)
          return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
        })
        if (!allowed) throw new Error(`Path ${candidate} is outside the automation policy`)
      }
      if (/(?:url|uri|endpoint|host|domain)$/i.test(current.key)) {
        let hostname = current.value.toLowerCase()
        try {
          hostname = new URL(
            current.value.includes('://') ? current.value : `https://${current.value}`
          ).hostname.toLowerCase()
        } catch {
          // The raw host value is checked below.
        }
        const allowed = allowedTargets.some(
          (target) => hostname === target || hostname.endsWith(`.${target}`)
        )
        if (!allowed) throw new Error(`Network target ${hostname} is outside the automation policy`)
      }
      continue
    }
    if (!current.value || typeof current.value !== 'object' || visited.has(current.value)) continue
    visited.add(current.value)
    if (Array.isArray(current.value)) {
      for (const value of current.value) stack.push({ key: current.key, value })
      continue
    }
    for (const [key, value] of Object.entries(current.value)) stack.push({ key, value })
  }
}

export class PiAgentRuntimeHost {
  private child: UtilityProcess | null = null
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private readonly activeRuns = new Map<string, ActiveRunContext>()
  private readonly onEvent?: PiAgentRuntimeHostOptions['onEvent']
  private readonly loadToolCallResult?: PiAgentRuntimeHostOptions['loadToolCallResult']
  private readonly persistToolCallResult?: PiAgentRuntimeHostOptions['persistToolCallResult']
  private readonly beginToolCall?: PiAgentRuntimeHostOptions['beginToolCall']
  private readonly onApprovalConsumed?: PiAgentRuntimeHostOptions['onApprovalConsumed']
  private shuttingDown = false
  private ready = false
  private restartAttempts = 0
  private restartTimer: NodeJS.Timeout | null = null

  constructor(options: PiAgentRuntimeHostOptions = {}) {
    this.onEvent = options.onEvent
    this.loadToolCallResult = options.loadToolCallResult
    this.persistToolCallResult = options.persistToolCallResult
    this.beginToolCall = options.beginToolCall
    this.onApprovalConsumed = options.onApprovalConsumed
  }

  isReady(): boolean {
    return this.ready
  }

  async start(): Promise<void> {
    if (this.child && this.readyPromise) return this.readyPromise
    if (!app.isReady()) throw new Error('Pi runtime can only start after Electron app ready')

    const workerPath = resolveWorkerPath()
    this.shuttingDown = false
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    const child = utilityProcess.fork(workerPath, [], {
      cwd: app.getPath('userData'),
      env: createRestrictedEnvironment(),
      stdio: 'pipe',
      serviceName: 'Tuff Pi Agent Runtime'
    })
    this.child = child
    child.on('message', (message) => {
      void this.handleMessage(message as PiRuntimeParentMessage).catch((error) => {
        runtimeLog.error('Failed to handle Pi runtime message', { error })
        child.kill()
      })
    })
    child.on('spawn', () => {
      runtimeLog.info('Pi runtime utility process spawned', { meta: { pid: child.pid } })
    })
    child.on('exit', (code) => {
      this.handleExit(code)
    })
    child.on('error', (error) => {
      runtimeLog.error('Pi runtime utility process fatal error', { error })
    })
    child.stdout?.on('data', (chunk) => {
      runtimeLog.debug(String(chunk).trim())
    })
    child.stderr?.on('data', (chunk) => {
      runtimeLog.warn(String(chunk).trim())
    })
    return this.readyPromise
  }

  async execute(payload: PiRuntimeStartPayload): Promise<PiRuntimeRunResult> {
    await this.start()
    if (!this.child) throw new Error('Pi runtime is unavailable')
    if (this.activeRuns.has(payload.run.id)) {
      throw new Error(`Run ${payload.run.id} is already active`)
    }

    const timeoutMs = Math.max(
      1_000,
      payload.request.timeoutMs || payload.profile.timeoutMs || 10 * 60 * 1000
    )
    return await new Promise<PiRuntimeRunResult>((resolve, reject) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => {
        if (!this.activeRuns.has(payload.run.id)) return
        this.cancel(payload.run.id)
        this.settleRun(payload.run.id, new Error(`Pi runtime timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.activeRuns.set(payload.run.id, {
        run: payload.run,
        request: payload.request,
        profile: payload.profile,
        allowedToolIds: new Set(payload.tools.map((tool) => tool.id)),
        consumedApprovalFingerprints: new Set(),
        controller,
        toolCalls: new Map(),
        resolve,
        reject,
        timeout
      })
      this.post({ type: 'run.start', payload })
    })
  }

  cancel(runId: string): boolean {
    const context = this.activeRuns.get(runId)
    if (!context) return false
    context.controller.abort()
    if (this.child) this.post({ type: 'run.cancel', runId })
    return true
  }

  async stop(): Promise<void> {
    this.shuttingDown = true
    this.ready = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.child) {
      try {
        this.post({ type: 'runtime.shutdown' })
      } catch {
        // The process may already be gone.
      }
    }
    for (const context of this.activeRuns.values()) {
      clearTimeout(context.timeout)
      context.controller.abort()
      context.reject(new Error('Pi runtime stopped'))
    }
    this.activeRuns.clear()
    this.child?.kill()
    this.child = null
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
  }

  private post(message: PiRuntimeChildPayload): void {
    if (!this.child) throw new Error('Pi runtime is unavailable')
    this.child.postMessage({ ...message, protocolVersion: PI_RUNTIME_PROTOCOL_VERSION })
  }

  private async handleMessage(message: PiRuntimeParentMessage): Promise<void> {
    if (message.protocolVersion !== PI_RUNTIME_PROTOCOL_VERSION) {
      this.child?.kill()
      throw new Error(`Unsupported Pi runtime protocol version: ${String(message.protocolVersion)}`)
    }
    switch (message.type) {
      case 'runtime.ready':
        this.ready = true
        this.restartAttempts = 0
        this.readyResolve?.()
        this.readyResolve = null
        this.readyReject = null
        runtimeLog.info('Pi runtime utility process ready')
        return
      case 'runtime.error':
        runtimeLog.error('Pi runtime worker error', { error: new Error(message.error) })
        return
      case 'model.request':
        await this.handleModelRequest(message.payload)
        return
      case 'tool.request':
        await this.handleToolRequest(message.payload)
        return
      case 'run.event':
        await this.onEvent?.(message.payload)
        return
      case 'run.completed':
        this.settleRun(message.payload.runId, undefined, message.payload)
        return
      case 'run.failed':
        this.settleRun(message.runId, new Error(message.error))
        return
      case 'run.cancelled':
        this.settleRun(message.runId, new Error('Run cancelled'))
    }
  }

  private async handleModelRequest(request: PiRuntimeModelRequest): Promise<void> {
    const context = this.activeRuns.get(request.runId)
    if (!context) {
      this.post({
        type: 'model.response',
        payload: { requestId: request.requestId, runId: request.runId, error: 'Run not found' }
      })
      return
    }

    let response: PiRuntimeModelResponse
    try {
      const result = await tuffIntelligence.invoke<string>(
        'text.chat',
        { messages: normalizeModelMessages(request) },
        {
          modelPreference: request.modelPreference.length > 0 ? request.modelPreference : undefined,
          metadata: {
            caller: 'ai-cli-orchestrator',
            runId: request.runId,
            sessionId: context.run.sessionId,
            step: request.step
          }
        }
      )
      response = {
        requestId: request.requestId,
        runId: request.runId,
        text: result.result,
        usage: {
          promptTokens: result.usage?.promptTokens ?? 0,
          completionTokens: result.usage?.completionTokens ?? 0,
          totalTokens: result.usage?.totalTokens ?? 0,
          cost: result.usage?.cost
        },
        provider: result.provider,
        model: result.model
      }
    } catch (error) {
      response = {
        requestId: request.requestId,
        runId: request.runId,
        error: toErrorMessage(error)
      }
    }
    this.post({ type: 'model.response', payload: response })
  }

  private async handleToolRequest(request: PiRuntimeToolRequest): Promise<void> {
    const context = this.activeRuns.get(request.runId)
    let response: PiRuntimeToolResponse
    try {
      if (!context) throw new Error('Run not found')
      let operation = context.toolCalls.get(request.toolCallId)
      if (!operation) {
        operation = this.executeToolCall(context, request)
        context.toolCalls.set(request.toolCallId, operation)
      }
      const outcome = await operation
      response = { requestId: request.requestId, runId: request.runId, ...outcome }
    } catch (error) {
      response = {
        requestId: request.requestId,
        runId: request.runId,
        error: toErrorMessage(error)
      }
    }
    this.post({ type: 'tool.response', payload: response })
  }

  private async executeToolCall(
    context: ActiveRunContext,
    request: PiRuntimeToolRequest
  ): Promise<PiRuntimeToolCallOutcome> {
    const persisted = await this.loadToolCallResult?.(request.runId, request.toolCallId)
    if (persisted) {
      return {
        ...(persisted.error ? { error: persisted.error } : {}),
        ...(persisted.error ? {} : { output: serializeToolOutput(persisted.output) })
      }
    }

    if (context.controller.signal.aborted) throw new Error(`Run ${request.runId} is cancelled`)
    if (!context.allowedToolIds.has(request.toolId)) {
      throw new Error(`Tool ${request.toolId} is not allowed by the active profile`)
    }
    if (request.toolId === 'skill.read' && context.profile.enabledSkillIds.length > 0) {
      const input =
        request.input && typeof request.input === 'object'
          ? (request.input as Record<string, unknown>)
          : {}
      const skillId = typeof input.skillId === 'string' ? input.skillId : ''
      if (!skillId || !context.profile.enabledSkillIds.includes(skillId))
        throw new Error(`Skill ${skillId || '<missing>'} is not enabled for the active profile`)
    }

    const definition = toolRegistry.getTool(request.toolId)
    if (!definition) throw new Error(`Tool ${request.toolId} not found`)

    const requiredPermissions = new Set((definition.permissions ?? []).map(String))
    if (request.toolId === 'mcp.call' || request.toolId === 'mcp.listTools') {
      const input =
        request.input && typeof request.input === 'object'
          ? (request.input as Record<string, unknown>)
          : {}
      const profileId = typeof input.profileId === 'string' ? input.profileId : ''
      const profile = profileId ? intelligenceMcpRegistry.getProfile(profileId) : undefined
      if (!profile) throw new Error(`MCP profile ${profileId || '<missing>'} is not available`)
      requiredPermissions.add(
        profile.transport.type === 'stdio'
          ? AgentPermission.SYSTEM_EXEC
          : AgentPermission.NETWORK_ACCESS
      )
    }

    const fingerprint = approvalFingerprint(request)
    let approval: { kind: 'mcp' | 'permission' | 'tool'; reason: string } | undefined
    const automationPolicy = context.request.metadata?.automationPolicy
    if (automationPolicy && typeof automationPolicy === 'object') {
      const policy = automationPolicy as AiAutomationPolicy
      if (!policy.allowedToolIds.includes(request.toolId)) {
        approval = {
          kind: 'tool',
          reason: `Tool ${request.toolId} is outside the automation policy`
        }
      } else if (request.toolId === 'mcp.call' || request.toolId === 'mcp.listTools') {
        const input =
          request.input && typeof request.input === 'object'
            ? (request.input as Record<string, unknown>)
            : {}
        const profileId = typeof input.profileId === 'string' ? input.profileId : ''
        if (!profileId || !policy.allowedMcpServerIds.includes(profileId)) {
          approval = {
            kind: 'mcp',
            reason: `MCP profile ${profileId || '<missing>'} is outside the automation policy`
          }
        }
      }
      if (!approval) {
        try {
          assertAutomationToolPolicy(policy, request.input, context.run.cwd)
        } catch (error) {
          approval = { kind: 'tool', reason: toErrorMessage(error) }
        }
      }
    }

    if (!approval && requiredPermissions.size > 0) {
      if (context.profile.permissionPolicy.mode === 'preauthorized') {
        const allowed = new Set(context.profile.permissionPolicy.allowedPermissions)
        const missing = Array.from(requiredPermissions).filter(
          (permission) => !allowed.has(permission)
        )
        if (missing.length > 0) {
          approval = {
            kind: 'permission',
            reason: `Tool permissions are not preauthorized: ${missing.join(', ')}`
          }
        }
      } else {
        approval = {
          kind: 'permission',
          reason: `Tool ${request.toolId} requires user approval`
        }
      }
    }
    if (approval) await this.consumeApproval(context, request, approval, fingerprint)

    const startState = await this.beginToolCall?.(
      request.runId,
      request.toolCallId,
      request.toolId,
      request.input
    )
    if (startState !== undefined && startState !== 'execute') {
      throw new Error(`INTERRUPTED_TOOL_CALL:${request.toolCallId}`)
    }

    const result = await toolRegistry.executeTool(request.toolId, request.input, {
      taskId: request.runId,
      agentId: 'tuff.pi-coordinator',
      workingDirectory: context.run.cwd,
      signal: context.controller.signal
    })
    if (!result.success) throw new Error(result.error || `Tool ${request.toolId} failed`)

    const outcome = { output: serializeToolOutput(result.output) }
    if (this.persistToolCallResult) {
      try {
        await this.persistToolCallResult(request.runId, request.toolCallId, outcome)
      } catch (error) {
        runtimeLog.error('Failed to persist Pi tool-call result', { error })
        throw new Error(`Tool call result could not be persisted: ${toErrorMessage(error)}`)
      }
    }
    return outcome
  }

  private async consumeApproval(
    context: ActiveRunContext,
    request: PiRuntimeToolRequest,
    approval: { kind: 'mcp' | 'permission' | 'tool'; reason: string },
    fingerprint: string
  ): Promise<void> {
    if (
      context.request.metadata?.approvalGrantFingerprint !== fingerprint ||
      context.consumedApprovalFingerprints.has(fingerprint)
    ) {
      throw approvalRequired(approval.kind, approval.reason, fingerprint)
    }
    context.consumedApprovalFingerprints.add(fingerprint)
    try {
      await this.onApprovalConsumed?.(request.runId, fingerprint)
    } catch (error) {
      context.consumedApprovalFingerprints.delete(fingerprint)
      throw error
    }
  }

  private settleRun(runId: string, error?: Error, result?: PiRuntimeRunResult): void {
    const context = this.activeRuns.get(runId)
    if (!context) return
    this.activeRuns.delete(runId)
    clearTimeout(context.timeout)
    context.controller.abort()
    if (error) context.reject(error)
    else if (result) context.resolve(result)
    else context.reject(new Error('Pi runtime ended without a result'))
  }

  private handleExit(code: number): void {
    const error = new Error(`Pi runtime utility process exited with code ${code}`)
    if (!this.shuttingDown) runtimeLog.error(error.message, { error })
    this.ready = false
    this.readyReject?.(error)
    for (const context of this.activeRuns.values()) {
      clearTimeout(context.timeout)
      context.controller.abort()
      context.reject(error)
    }
    this.activeRuns.clear()
    this.child = null
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
    if (!this.shuttingDown) this.scheduleRestart()
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.restartAttempts >= 3) return
    const delayMs = Math.min(5_000, 250 * 2 ** this.restartAttempts)
    this.restartAttempts += 1
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.start().catch((error) => {
        runtimeLog.error('Pi runtime restart failed', { error })
        this.scheduleRestart()
      })
    }, delayMs)
    this.restartTimer.unref?.()
  }
}

export function resolvePiRuntimeToolSpecs(allowedToolIds: string[]) {
  return allowedToolIds
    .map((toolId) => agentManager.getTool(toolId))
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
}

export type PiRuntimeEventLevel = AiOrchestratorEvent['level']
