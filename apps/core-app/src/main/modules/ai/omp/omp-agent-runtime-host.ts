import type {
  AcpClientCapabilities,
  AcpMcpServerConfig,
  AcpPermissionOption,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  AcpPromptContent,
  OmpAcpSession
} from '@talex-touch/tuff-intelligence'
import type { DefaultHerdrAcpCapabilityBridge } from '../../herdr-core/acp-capability-bridge'
import type {
  PiRuntimeRunEvent,
  PiRuntimeRunRecord,
  PiRuntimeRunResult,
  PiRuntimeStartPayload,
  PiRuntimeUsage
} from '../pi-agent-runtime-protocol'
import type { PiWorkspaceAuthority } from '../pi-agent-runtime-host'
import process from 'node:process'
import { OmpAcpClient } from '@talex-touch/tuff-intelligence'
import { createLogger } from '../../../utils/logger'
import {
  HERDR_ACP_CLIENT_CAPABILITIES,
  isHerdrAcpCapabilityMethod,
  isHerdrAcpMutatingMethod
} from '../../herdr-core/acp-capability-bridge'
import { herdrCoreModule } from '../../herdr-core'
import { buildObjectivePrompt } from '../pi-agent-run-log'
import {
  createRunCancelledError,
  createRunFailedError,
  createRunInterruptedError,
  isPiRuntimeControlError
} from '../pi-agent-runtime-control-error'
import { withExecutableDirOnPath } from '../providers/cli/cli-executable'
import { resolveOmpExecutable } from '../providers/pi-cli-runtime'
import { projectRunFailureDetail } from '../run-failure-detail'

const OMP_CLI_PROVIDER_ID = 'omp-cli'
const ompHostLog = createLogger('Intelligence').child('OmpAgentRuntimeHost')

const DATA_URL_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i
const MAX_OMP_TOOL_OUTPUT_CHARS = 64 * 1024

export interface OmpPermissionRequestContext {
  runId: string
  payload: PiRuntimeStartPayload
  workspace?: PiWorkspaceAuthority
  signal: AbortSignal
}

export interface OmpAgentRuntimeHostOptions {
  onEvent?: (event: PiRuntimeRunEvent) => void | Promise<void>
  onRecord?: (runId: string, record: PiRuntimeRunRecord) => void | Promise<void>
  resolveMcpServers?: (
    payload: PiRuntimeStartPayload,
    workspace?: PiWorkspaceAuthority
  ) => AcpMcpServerConfig[] | Promise<AcpMcpServerConfig[]>
  onPermissionRequest?: (
    params: AcpPermissionRequestParams,
    context: OmpPermissionRequestContext
  ) => AcpPermissionRequestResult | Promise<AcpPermissionRequestResult>
  resolveHerdrCapabilityBridge?: (
    payload: PiRuntimeStartPayload,
    workspace?: PiWorkspaceAuthority
  ) => DefaultHerdrAcpCapabilityBridge | null | Promise<DefaultHerdrAcpCapabilityBridge | null>
  sanitizeToolOutput?: (value: unknown) => unknown
}

const CAPABILITY_PERMISSION_OPTIONS: readonly AcpPermissionOption[] = [
  { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'reject_once', name: 'Deny', kind: 'reject_once' }
]

function isPermissionApproved(
  decision: AcpPermissionRequestResult | null | undefined,
  options: readonly AcpPermissionOption[]
): boolean {
  if (!decision || decision.outcome?.outcome !== 'selected') return false
  const selectedId = decision.outcome.optionId
  const matched = options.find((opt) => opt.optionId === selectedId)
  if (!matched) return false
  return matched.kind === 'allow_once' || matched.kind === 'allow_always'
}

interface ActiveRun {
  runId: string
  sessionId: string
  session: OmpAcpSession
  controller: AbortController
  payload: PiRuntimeStartPayload
  workspace?: PiWorkspaceAuthority
  herdrBridge: DefaultHerdrAcpCapabilityBridge | null
  cancelled: boolean
  interrupted: boolean
  timedOut: boolean
  timeoutMs: number
}

function defaultSanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, MAX_OMP_TOOL_OUTPUT_CHARS)
  if (value === null || typeof value !== 'object') return value
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return null
    if (serialized.length <= MAX_OMP_TOOL_OUTPUT_CHARS) return value
    return `${serialized.slice(0, MAX_OMP_TOOL_OUTPUT_CHARS)}…[truncated]`
  } catch {
    return '[unserializable tool output]'
  }
}

function normalizeToolResultPayload(
  rawResult: unknown,
  sanitize: (value: unknown) => unknown
): { content: Array<{ type: 'text'; text: string }> } {
  const sanitized = sanitize(rawResult)
  if (typeof sanitized === 'string') {
    return { content: [{ type: 'text', text: sanitized.slice(0, MAX_OMP_TOOL_OUTPUT_CHARS) }] }
  }
  if (Array.isArray(sanitized)) {
    const textParts = sanitized
      .flatMap((block) => {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'text' &&
          'text' in block
        ) {
          return typeof block.text === 'string' ? [block.text] : []
        }
        return []
      })
      .join('\n')
    if (textParts) {
      return { content: [{ type: 'text', text: textParts.slice(0, MAX_OMP_TOOL_OUTPUT_CHARS) }] }
    }
  }
  if (
    sanitized &&
    typeof sanitized === 'object' &&
    'content' in sanitized &&
    Array.isArray((sanitized as { content?: unknown }).content)
  ) {
    const textParts = (sanitized as { content: unknown[] }).content
      .flatMap((block) => {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'text' &&
          'text' in block
        ) {
          return typeof block.text === 'string' ? [block.text] : []
        }
        return []
      })
      .join('\n')
    if (textParts) {
      return { content: [{ type: 'text', text: textParts.slice(0, MAX_OMP_TOOL_OUTPUT_CHARS) }] }
    }
  }
  let serialized = ''
  try {
    serialized = sanitized === undefined ? '' : (JSON.stringify(sanitized) ?? '')
  } catch {
    serialized = '[unserializable tool output]'
  }
  return { content: [{ type: 'text', text: serialized.slice(0, MAX_OMP_TOOL_OUTPUT_CHARS) }] }
}

function resolvePreferredOmpModel(
  payload: PiRuntimeStartPayload,
  workspace?: PiWorkspaceAuthority
): string | undefined {
  const workspaceModel = workspace?.model?.trim()
  if (workspaceModel && workspaceModel !== OMP_CLI_PROVIDER_ID) {
    return workspaceModel
  }
  for (const candidate of payload.profile.modelPreference ?? []) {
    const trimmed = typeof candidate === 'string' ? candidate.trim() : ''
    if (trimmed && trimmed !== OMP_CLI_PROVIDER_ID) {
      return trimmed
    }
  }
  return undefined
}

function buildOmpPromptContent(
  payload: PiRuntimeStartPayload,
  workspace?: PiWorkspaceAuthority
): string | AcpPromptContent[] {
  const objective = payload.run.objective || payload.request.objective || ''
  const objectiveWithInput = buildObjectivePrompt(objective, payload.request.input)
  const historyBlock =
    payload.history.length > 0
      ? [
          'Conversation history:',
          ...payload.history.map((entry) => `${entry.role}: ${entry.text}`)
        ].join('\n')
      : ''

  // ACP exposes prompt content, not a separate system role. Preserve the Main-built profile
  // context (including Home skills/rules and OpenUI) ahead of the workspace user request.
  const promptText = [payload.profile.systemPrompt, historyBlock, objectiveWithInput]
    .filter(Boolean)
    .join('\n\n')

  const attachments = workspace?.modelAttachments ?? []
  if (attachments.length === 0) return promptText

  const imageBlocks: AcpPromptContent[] = []
  for (const attachment of attachments) {
    if (attachment.type !== 'image' || typeof attachment.dataUrl !== 'string') continue
    const match = DATA_URL_IMAGE_PATTERN.exec(attachment.dataUrl.trim())
    if (!match) continue
    imageBlocks.push({
      type: 'image',
      mimeType: match[1]!.toLowerCase(),
      data: match[2]!
    })
  }
  if (imageBlocks.length === 0) return promptText
  return [{ type: 'text', text: promptText }, ...imageBlocks]
}

export class OmpAgentRuntimeHost {
  private client: OmpAcpClient | null = null
  private clientCapabilitiesEnabled = false
  private startPromise: Promise<void> | null = null
  private generation = 0
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly sessionToRunId = new Map<string, string>()
  private readonly onEvent?: OmpAgentRuntimeHostOptions['onEvent']
  private readonly onRecord?: OmpAgentRuntimeHostOptions['onRecord']
  private readonly resolveMcpServers?: OmpAgentRuntimeHostOptions['resolveMcpServers']
  private readonly onPermissionRequest?: OmpAgentRuntimeHostOptions['onPermissionRequest']
  private readonly resolveHerdrCapabilityBridge: NonNullable<
    OmpAgentRuntimeHostOptions['resolveHerdrCapabilityBridge']
  >
  private readonly sanitizeToolOutput: (value: unknown) => unknown

  constructor(options: OmpAgentRuntimeHostOptions = {}) {
    this.onEvent = options.onEvent
    this.onRecord = options.onRecord
    this.resolveMcpServers = options.resolveMcpServers
    this.onPermissionRequest = options.onPermissionRequest
    this.resolveHerdrCapabilityBridge =
      options.resolveHerdrCapabilityBridge ??
      ((payload) => herdrCoreModule.createAcpCapabilityBridge({ cwd: payload.run.cwd }))
    this.sanitizeToolOutput = options.sanitizeToolOutput ?? defaultSanitizeValue
  }

  isReady(): boolean {
    if (!this.client) return false
    if (typeof this.client.isClosed === 'function' && this.client.isClosed()) {
      this.client = null
      this.clientCapabilitiesEnabled = false
      return false
    }
    return true
  }

  isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId)
  }

  async start(options?: { clientCapabilities?: AcpClientCapabilities }): Promise<void> {
    const wantsCapabilities = Boolean(options?.clientCapabilities)
    if (this.isReady()) {
      if (this.clientCapabilitiesEnabled === wantsCapabilities || this.activeRuns.size > 0) {
        return
      }
      const previous = this.client
      this.client = null
      this.clientCapabilitiesEnabled = false
      await previous?.close().catch(() => undefined)
    }
    if (this.startPromise) return this.startPromise

    const startGen = this.generation
    this.startPromise = (async () => {
      const ompExe = await resolveOmpExecutable()
      if (!ompExe) {
        throw new Error('OMP_CLI_NOT_FOUND: OMP executable not found on this system')
      }

      ompHostLog.info('Starting OMP ACP client')
      const spawned = await OmpAcpClient.spawn({
        executablePath: ompExe,
        env: withExecutableDirOnPath(process.env, ompExe),
        onRequest: (method, params) => this.handleServerRequest(method, params),
        ...(options?.clientCapabilities ? { clientCapabilities: options.clientCapabilities } : {})
      })

      if (this.generation !== startGen) {
        await spawned.close().catch(() => undefined)
        throw createRunInterruptedError()
      }

      if (typeof spawned.on === 'function') {
        spawned.on('close', () => {
          if (this.client === spawned) {
            this.client = null
            this.clientCapabilitiesEnabled = false
          }
        })
      }

      this.client = spawned
      this.clientCapabilitiesEnabled = wantsCapabilities
      ompHostLog.success('OMP ACP client initialized', {
        meta: {
          agentName: spawned.agentInfo?.name,
          agentVersion: spawned.agentInfo?.version
        }
      })
    })().finally(() => {
      this.startPromise = null
    })

    return this.startPromise
  }

  async stop(): Promise<void> {
    this.generation += 1

    const runs = Array.from(this.activeRuns.values())
    for (const run of runs) {
      run.interrupted = true
      run.controller.abort()
      run.herdrBridge?.dispose()
      void run.session.cancel().catch(() => undefined)
      void run.session.close().catch(() => undefined)
    }
    this.activeRuns.clear()
    this.sessionToRunId.clear()

    if (this.client) {
      const clientToClose = this.client
      this.client = null
      this.clientCapabilitiesEnabled = false
      await clientToClose.close().catch(() => undefined)
    }

    if (this.startPromise) {
      await this.startPromise.catch(() => undefined)
      const lateClient = this.client as OmpAcpClient | null
      if (lateClient) {
        this.client = null
        this.clientCapabilitiesEnabled = false
        await lateClient.close().catch(() => undefined)
      }
    }
  }

  private async handleServerRequest(method: string, params: unknown): Promise<unknown> {
    if (isHerdrAcpCapabilityMethod(method)) {
      return await this.handleHerdrCapabilityRequest(method, params)
    }
    if (method !== 'session/request_permission') {
      throw new Error(`Unsupported ACP client request: ${method}`)
    }
    const requestParams =
      params && typeof params === 'object' ? (params as AcpPermissionRequestParams) : null
    const sessionId = typeof requestParams?.sessionId === 'string' ? requestParams.sessionId : ''
    const runId = sessionId ? this.sessionToRunId.get(sessionId) : undefined
    const activeRun = runId ? this.activeRuns.get(runId) : undefined
    if (!requestParams || !activeRun || activeRun.controller.signal.aborted) {
      return { outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult
    }
    if (!this.onPermissionRequest) {
      // Fail closed when no approval bridge is wired.
      return { outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult
    }
    try {
      return await this.onPermissionRequest(requestParams, {
        runId: activeRun.runId,
        payload: activeRun.payload,
        workspace: activeRun.workspace,
        signal: activeRun.controller.signal
      })
    } catch {
      return { outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult
    }
  }

  private async handleHerdrCapabilityRequest(method: string, params: unknown): Promise<unknown> {
    const record = params && typeof params === 'object' ? (params as Record<string, unknown>) : null
    const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
    const runId = sessionId ? this.sessionToRunId.get(sessionId) : undefined
    const activeRun = runId ? this.activeRuns.get(runId) : undefined
    if (!activeRun || activeRun.controller.signal.aborted || !activeRun.herdrBridge) {
      throw new Error('HERDR_ACP_BRIDGE_UNAVAILABLE')
    }

    // Enforce terminal ownership BEFORE prompting for permission so foreign IDs fail immediately.
    if (
      method === 'terminal/output' ||
      method === 'terminal/wait_for_exit' ||
      method === 'terminal/kill' ||
      method === 'terminal/release'
    ) {
      if (!activeRun.herdrBridge.hasOwnedTerminal(record?.terminalId)) {
        throw new Error('HERDR_ACP_TERMINAL_FORBIDDEN')
      }
    }

    if (isHerdrAcpMutatingMethod(method)) {
      if (!this.onPermissionRequest) {
        // Fail closed when no permission handler is wired for mutating/exec capability calls.
        throw new Error('HERDR_ACP_PERMISSION_DENIED')
      }
      const options = [...CAPABILITY_PERMISSION_OPTIONS]
      const permissionParams: AcpPermissionRequestParams = {
        sessionId,
        toolCall: {
          toolCallId: `herdr-acp:${method}:${Date.now()}`,
          title: method,
          kind: method === 'fs/write_text_file' ? 'edit' : 'execute',
          rawInput: params
        },
        options
      }
      let approved = false
      try {
        const decision = await this.onPermissionRequest(permissionParams, {
          runId: activeRun.runId,
          payload: activeRun.payload,
          workspace: activeRun.workspace,
          signal: activeRun.controller.signal
        })
        approved = isPermissionApproved(decision, options)
      } catch {
        approved = false
      }
      if (!approved || activeRun.controller.signal.aborted) {
        throw new Error('HERDR_ACP_PERMISSION_DENIED')
      }
    }

    return await activeRun.herdrBridge.handleServerRequest(method, params, {
      signal: activeRun.controller.signal
    })
  }

  async execute(
    payload: PiRuntimeStartPayload,
    workspace?: PiWorkspaceAuthority
  ): Promise<PiRuntimeRunResult> {
    const runId = payload.run.id
    if (this.activeRuns.has(runId)) {
      throw new Error(`Run ${runId} is already active`)
    }

    const timeoutMs = Math.max(
      1_000,
      payload.request.timeoutMs || payload.profile.timeoutMs || 10 * 60 * 1000
    )

    let session: OmpAcpSession | null = null
    let activeRun: ActiveRun | null = null
    let herdrBridge: DefaultHerdrAcpCapabilityBridge | null = null
    let timeoutTimer: NodeJS.Timeout | undefined

    try {
      await workspace?.assertAuthority()
      herdrBridge = (await this.resolveHerdrCapabilityBridge(payload, workspace)) ?? null
      await this.start(
        herdrBridge ? { clientCapabilities: HERDR_ACP_CLIENT_CAPABILITIES } : undefined
      )
      if (!this.client) throw new Error('OMP ACP runtime is unavailable')

      const preferredModel = resolvePreferredOmpModel(payload, workspace)
      const mcpServers = (await this.resolveMcpServers?.(payload, workspace)) ?? []

      session = await this.client.createSession({
        cwd: payload.run.cwd,
        ...(preferredModel ? { model: preferredModel } : {}),
        ...(mcpServers.length > 0 ? { mcpServers } : {})
      })

      const controller = new AbortController()
      activeRun = {
        runId,
        sessionId: session.sessionId,
        session,
        controller,
        payload,
        workspace,
        herdrBridge,
        cancelled: false,
        interrupted: false,
        timedOut: false,
        timeoutMs
      }
      this.activeRuns.set(runId, activeRun)
      if (session.sessionId) {
        this.sessionToRunId.set(session.sessionId, runId)
      }

      timeoutTimer = setTimeout(() => {
        if (!activeRun || !this.activeRuns.has(runId)) return
        activeRun.timedOut = true
        activeRun.controller.abort()
        void activeRun.session.cancel().catch(() => undefined)
      }, timeoutMs)

      if (workspace) {
        await this.onEvent?.({
          runId,
          type: 'provider_response',
          payload: {
            provider: OMP_CLI_PROVIDER_ID,
            model: preferredModel ?? 'omp-acp',
            usageReported: false
          }
        })
      }

      let output = ''
      let toolCallCount = 0
      const startedToolCalls = new Map<string, string>()
      const endedToolCalls = new Set<string>()
      let usage: PiRuntimeUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }

      const promptContent = buildOmpPromptContent(payload, workspace)

      for await (const event of session.promptStream(promptContent, {
        signal: controller.signal
      })) {
        if (controller.signal.aborted) break

        if (event.type === 'thinking' && event.text) {
          await this.onEvent?.({
            runId,
            type: 'reasoning',
            level: 'info',
            payload: { delta: event.text }
          })
        } else if (event.type === 'delta' && event.text) {
          output += event.text
          await this.onEvent?.({
            runId,
            type: 'text',
            level: 'info',
            payload: { delta: event.text }
          })
        } else if (event.type === 'tool_call' && event.toolCall) {
          const { toolCallId, toolName, args } = event.toolCall
          if (!startedToolCalls.has(toolCallId)) {
            startedToolCalls.set(toolCallId, toolName)
            toolCallCount += 1
            await this.onEvent?.({
              runId,
              type: 'tool_execution_start',
              level: 'info',
              payload: {
                toolCallId,
                toolName,
                args: this.sanitizeToolOutput(args ?? {})
              }
            })
          }
        } else if (event.type === 'tool_result' && event.toolCall) {
          const { toolCallId, isError, result } = event.toolCall
          const toolName = startedToolCalls.get(toolCallId) ?? event.toolCall.toolName
          if (!endedToolCalls.has(toolCallId)) {
            endedToolCalls.add(toolCallId)
            await this.onEvent?.({
              runId,
              type: 'tool_execution_end',
              level: isError ? 'warn' : 'info',
              payload: {
                toolCallId,
                toolName,
                result: normalizeToolResultPayload(result, this.sanitizeToolOutput),
                isError: isError === true
              }
            })
          }
        } else if (event.type === 'usage' && event.usage) {
          usage = {
            promptTokens: event.usage.inputTokens ?? usage.promptTokens,
            completionTokens: event.usage.outputTokens ?? usage.completionTokens,
            totalTokens: event.usage.totalTokens ?? usage.totalTokens,
            cacheReadTokens: event.usage.cacheReadTokens ?? usage.cacheReadTokens,
            cost: event.usage.cost?.total ?? usage.cost
          }
        }
      }

      if (activeRun.interrupted) throw createRunInterruptedError()
      if (activeRun.timedOut)
        throw createRunFailedError(`OMP runtime timed out after ${timeoutMs}ms`)
      if (activeRun.cancelled || controller.signal.aborted) throw createRunCancelledError()

      if (workspace) {
        await this.onEvent?.({
          runId,
          type: 'message_end',
          payload: {
            message: {
              role: 'assistant',
              stopReason: 'stop',
              content: [{ type: 'text', text: output }]
            }
          }
        })
        if (usage.totalTokens > 0) {
          await this.onEvent?.({
            runId,
            type: 'provider_response',
            payload: {
              provider: OMP_CLI_PROVIDER_ID,
              model: preferredModel ?? 'omp-acp',
              usageReported: true,
              usage
            }
          })
        }
      }

      await this.onRecord?.(runId, {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: output }],
          stopReason: 'stop'
        },
        modelSteps: 1,
        toolCalls: toolCallCount,
        usage,
        costKnown: typeof usage.cost === 'number'
      })

      return {
        runId,
        output,
        usage
      }
    } catch (error) {
      if (activeRun?.interrupted) throw createRunInterruptedError()
      if (activeRun?.timedOut) {
        throw createRunFailedError(`OMP runtime timed out after ${timeoutMs}ms`)
      }
      if (activeRun?.cancelled) throw createRunCancelledError()
      if (isPiRuntimeControlError(error)) throw error
      throw createRunFailedError(projectRunFailureDetail(error) || 'OMP runtime execution failed')
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      herdrBridge?.dispose()
      this.activeRuns.delete(runId)
      if (session?.sessionId && this.sessionToRunId.get(session.sessionId) === runId) {
        this.sessionToRunId.delete(session.sessionId)
      }
      if (session) {
        await session.close().catch(() => undefined)
      }
    }
  }

  cancel(runId: string): boolean {
    const run = this.activeRuns.get(runId)
    if (!run) return false
    run.cancelled = true
    run.controller.abort()
    void run.session.cancel().catch(() => undefined)
    return true
  }
}
