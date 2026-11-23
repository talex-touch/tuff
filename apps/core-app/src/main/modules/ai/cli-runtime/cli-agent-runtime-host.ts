import type {
  AcpMcpServerConfig,
  AcpPermissionOption,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  AcpPromptContent,
  CliAgentRuntimeHostOptions,
  CliDriverResolution,
  CliPermissionDecision,
  CliPermissionRequest,
  CliRuntimeClient,
  CliRuntimeKind,
  CliRuntimeProtocol,
  CliRuntimeSession,
  CliWorktreeRequestOptions,
  ReleaseWorktreeOptions,
  ReleaseWorktreeResult,
  WorktreeDiffResult,
  WorktreeLease
} from './types'
import type { PiWorkspaceAuthority } from '../pi-agent-runtime-host'
import type {
  PiRuntimeStartPayload,
  PiRuntimeRunResult,
  PiRuntimeUsage
} from '../pi-agent-runtime-protocol'
import type { GitWorktreeManager } from '../worktree'
import { createHash } from 'node:crypto'
import process from 'node:process'
import {
  AcpClient,
  ClaudeStreamClient,
  CodexAppServerClient,
  OmpAcpClient
} from '@talex-touch/tuff-intelligence'
import { createLogger } from '../../../utils/logger'
import { buildObjectivePrompt } from '../pi-agent-run-log'
import {
  createRunCancelledError,
  createRunFailedError,
  createRunInterruptedError,
  isPiRuntimeControlError
} from '../pi-agent-runtime-control-error'
import { withExecutableDirOnPath } from '../providers/cli/cli-executable'
import { PI_CLI_PROVIDER_ID } from '../providers/pi-cli-runtime'
import { projectRunFailureDetail } from '../run-failure-detail'
import { gitWorktreeManager, isGitWorktreeError } from '../worktree'
import {
  CLI_DRIVER_REGISTRY,
  cliDefaultModelLabel,
  cliProviderIdForKind,
  parseWorktreeRequestOptions,
  resolveCliDriver,
  resolveCliPermissionRisk,
  resolveCliProfileKind
} from './driver-resolver'

const cliHostLog = createLogger('Intelligence').child('CliAgentRuntimeHost')

const DATA_URL_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i
const MAX_CLI_TOOL_OUTPUT_CHARS = 64 * 1024
const MAX_TRACKED_RUN_PROTOCOLS = 256
const PROVIDER_MODEL_SENTINELS = new Set<string>([
  PI_CLI_PROVIDER_ID,
  ...Object.values(CLI_DRIVER_REGISTRY).map((descriptor) => descriptor.providerId)
])

interface PersistentClientEntry {
  kind: CliRuntimeKind
  protocol: CliRuntimeProtocol
  executablePath: string
  argsKey: string
  mcpFingerprint: string
  client: CliRuntimeClient
}

interface ActiveCliRun {
  runId: string
  kind: CliRuntimeKind
  protocol: CliRuntimeProtocol
  sessionId: string
  session: CliRuntimeSession
  controller: AbortController
  payload: PiRuntimeStartPayload
  workspace?: PiWorkspaceAuthority
  cancelled: boolean
  interrupted: boolean
  timedOut: boolean
  timeoutMs: number
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function defaultSanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, MAX_CLI_TOOL_OUTPUT_CHARS)
  if (value === null || typeof value !== 'object') return value
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return null
    if (serialized.length <= MAX_CLI_TOOL_OUTPUT_CHARS) return value
    return `${serialized.slice(0, MAX_CLI_TOOL_OUTPUT_CHARS)}…[truncated]`
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
    return { content: [{ type: 'text', text: sanitized.slice(0, MAX_CLI_TOOL_OUTPUT_CHARS) }] }
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
      return { content: [{ type: 'text', text: textParts.slice(0, MAX_CLI_TOOL_OUTPUT_CHARS) }] }
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
      return { content: [{ type: 'text', text: textParts.slice(0, MAX_CLI_TOOL_OUTPUT_CHARS) }] }
    }
  }
  let serialized = ''
  try {
    serialized = sanitized === undefined ? '' : (JSON.stringify(sanitized) ?? '')
  } catch {
    serialized = '[unserializable tool output]'
  }
  return { content: [{ type: 'text', text: serialized.slice(0, MAX_CLI_TOOL_OUTPUT_CHARS) }] }
}

function resolvePreferredCliModel(
  payload: PiRuntimeStartPayload,
  workspace?: PiWorkspaceAuthority
): string | undefined {
  const workspaceModel = workspace?.model?.trim()
  if (workspaceModel && !PROVIDER_MODEL_SENTINELS.has(workspaceModel)) {
    return workspaceModel
  }
  for (const candidate of payload.profile.modelPreference ?? []) {
    const trimmed = typeof candidate === 'string' ? candidate.trim() : ''
    if (trimmed && !PROVIDER_MODEL_SENTINELS.has(trimmed)) {
      return trimmed
    }
  }
  return undefined
}

function resolveReasoningEffort(workspace?: PiWorkspaceAuthority): string | undefined {
  const effort = workspace?.reasoningEffort
  if (!effort || String(effort) === 'auto') return undefined
  return effort
}

function buildCliPromptContent(
  payload: PiRuntimeStartPayload,
  workspace: PiWorkspaceAuthority | undefined,
  includeSystemPrompt: boolean
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

  const promptText = [
    includeSystemPrompt ? payload.profile.systemPrompt : '',
    historyBlock,
    objectiveWithInput
  ]
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

function pickPermissionOption(
  options: readonly AcpPermissionOption[] | undefined,
  preferredKinds: readonly string[]
): AcpPermissionOption | undefined {
  if (!Array.isArray(options) || options.length === 0) return undefined
  for (const kind of preferredKinds) {
    const match = options.find(
      (option) => option.kind === kind && typeof option.optionId === 'string'
    )
    if (match) return match
  }
  return undefined
}

function normalizeKeyValues(
  value: Record<string, string> | ReadonlyArray<{ name: string; value: string }> | undefined
): Array<[string, string]> {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry): [string, string] => [entry.name, entry.value])
      .sort(([a], [b]) => a.localeCompare(b))
  }
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
}

function computeMcpFingerprint(
  mcpServers: readonly AcpMcpServerConfig[],
  strictMcpServers: boolean
): string {
  const canonical = {
    strict: strictMcpServers,
    servers: [...mcpServers]
      .map((server) => ({
        name: server.name,
        type: server.type,
        url: server.url,
        command: server.command,
        args: server.args,
        env: normalizeKeyValues(server.env),
        headers: normalizeKeyValues(server.headers)
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export class CliAgentRuntimeHost {
  private generation = 0
  private readonly persistentClients = new Map<CliRuntimeKind, PersistentClientEntry>()
  private readonly startPromises = new Map<string, Promise<PersistentClientEntry>>()
  private readonly clientActiveRuns = new WeakMap<CliRuntimeClient, Set<string>>()
  private readonly retiredClients = new Set<CliRuntimeClient>()
  private readonly ephemeralClients = new Set<CliRuntimeClient>()
  private readonly readyKinds = new Set<CliRuntimeKind>()
  private readonly activeRuns = new Map<string, ActiveCliRun>()
  private readonly sessionToRunId = new Map<string, string>()
  private readonly runWorktrees = new Map<string, WorktreeLease>()
  private readonly runProtocols = new Map<string, CliRuntimeProtocol>()

  private readonly onEvent?: CliAgentRuntimeHostOptions['onEvent']
  private readonly onRecord?: CliAgentRuntimeHostOptions['onRecord']
  private readonly resolveMcpServers?: CliAgentRuntimeHostOptions['resolveMcpServers']
  private readonly onPermissionRequest?: CliAgentRuntimeHostOptions['onPermissionRequest']
  private readonly sanitizeToolOutput: (value: unknown) => unknown
  private readonly worktreeManager: GitWorktreeManager
  private readonly resolveDriver: (kind: CliRuntimeKind) => Promise<CliDriverResolution>

  constructor(options: CliAgentRuntimeHostOptions = {}) {
    this.onEvent = options.onEvent
    this.onRecord = options.onRecord
    this.resolveMcpServers = options.resolveMcpServers
    this.onPermissionRequest = options.onPermissionRequest
    this.sanitizeToolOutput = options.sanitizeToolOutput ?? defaultSanitizeValue
    this.worktreeManager = options.worktreeManager ?? gitWorktreeManager
    this.resolveDriver = options.resolveDriver ?? resolveCliDriver
  }

  private isPersistentEntryReady(kind: CliRuntimeKind): boolean {
    const entry = this.persistentClients.get(kind)
    if (!entry) return false
    if (typeof entry.client.isClosed === 'function' && entry.client.isClosed()) {
      this.persistentClients.delete(kind)
      return false
    }
    return true
  }

  isReady(kind?: CliRuntimeKind): boolean {
    if (kind) {
      return this.isPersistentEntryReady(kind) || this.readyKinds.has(kind)
    }
    for (const registeredKind of Array.from(this.persistentClients.keys())) {
      if (this.isPersistentEntryReady(registeredKind)) return true
    }
    return this.readyKinds.size > 0
  }

  isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId)
  }

  getRunProtocol(runId: string): CliRuntimeProtocol | undefined {
    return this.runProtocols.get(runId)
  }

  private recordRunProtocol(runId: string, protocol: CliRuntimeProtocol): void {
    this.runProtocols.set(runId, protocol)
    while (this.runProtocols.size > MAX_TRACKED_RUN_PROTOCOLS) {
      const oldest = this.runProtocols.keys().next().value
      if (oldest === undefined) break
      this.runProtocols.delete(oldest)
    }
  }

  getRunWorktreeLease(runId: string): WorktreeLease | undefined {
    const lease = this.runWorktrees.get(runId)
    if (!lease) return undefined
    const current = this.worktreeManager.getLease(lease.worktreeId)
    if (!current) {
      this.runWorktrees.delete(runId)
      return undefined
    }
    return current
  }

  async getRunWorktreeDiff(
    runId: string,
    options?: { maxBytes?: number }
  ): Promise<WorktreeDiffResult | null> {
    const lease = this.getRunWorktreeLease(runId)
    if (!lease) return null
    return await this.worktreeManager.getWorktreeDiff(lease.worktreeId, options)
  }

  async releaseRunWorktree(
    runId: string,
    options?: ReleaseWorktreeOptions
  ): Promise<ReleaseWorktreeResult | null> {
    const lease = this.getRunWorktreeLease(runId)
    if (!lease) return null
    if (this.activeRuns.has(runId) && options?.force !== true) {
      throw new Error(`WORKTREE_RUN_ACTIVE: Cannot release worktree while run ${runId} is active`)
    }
    const result = await this.worktreeManager.releaseWorktree(lease.worktreeId, options)
    if (result.removed) {
      this.runWorktrees.delete(runId)
    }
    return result
  }

  private retainClientForRun(client: CliRuntimeClient, runId: string): void {
    let runs = this.clientActiveRuns.get(client)
    if (!runs) {
      runs = new Set<string>()
      this.clientActiveRuns.set(client, runs)
    }
    runs.add(runId)
  }

  private async releaseClientForRun(client: CliRuntimeClient, runId: string): Promise<void> {
    const runs = this.clientActiveRuns.get(client)
    if (runs) {
      runs.delete(runId)
    }
    if (this.retiredClients.has(client) && (!runs || runs.size === 0)) {
      this.retiredClients.delete(client)
      await client.close().catch(() => undefined)
    }
  }

  private retireClient(client: CliRuntimeClient): void {
    const runs = this.clientActiveRuns.get(client)
    if (!runs || runs.size === 0) {
      void client.close().catch(() => undefined)
      return
    }
    this.retiredClients.add(client)
  }

  async start(
    kind: CliRuntimeKind,
    options?: { mcpServers?: AcpMcpServerConfig[]; strictMcpServers?: boolean }
  ): Promise<void> {
    const startGen = this.generation
    const driver = await this.resolveDriver(kind)
    if (this.generation !== startGen) {
      throw createRunInterruptedError()
    }
    if (driver.protocol === 'claude-stream-json') {
      this.readyKinds.add('claude')
      return
    }
    await this.ensurePersistentClient(driver, {
      mcpServers: options?.mcpServers ?? [],
      strictMcpServers: options?.strictMcpServers === true
    })
  }

  private async ensurePersistentClient(
    driver: CliDriverResolution,
    options: { mcpServers: AcpMcpServerConfig[]; strictMcpServers: boolean }
  ): Promise<PersistentClientEntry> {
    const driverArgs = driver.args ? [...driver.args] : []
    const argsKey = JSON.stringify(driverArgs)
    const mcpFingerprint =
      driver.protocol === 'codex-app-server'
        ? computeMcpFingerprint(options.mcpServers, options.strictMcpServers)
        : ''

    const existing = this.persistentClients.get(driver.kind)
    if (
      existing &&
      !(typeof existing.client.isClosed === 'function' && existing.client.isClosed()) &&
      existing.protocol === driver.protocol &&
      existing.executablePath === driver.executablePath &&
      existing.argsKey === argsKey &&
      existing.mcpFingerprint === mcpFingerprint
    ) {
      return existing
    }

    const flightKey = `${driver.kind}:${driver.protocol}:${driver.executablePath}:${argsKey}:${mcpFingerprint}`
    const inFlight = this.startPromises.get(flightKey)
    if (inFlight) return inFlight

    const startGen = this.generation
    const promise = (async (): Promise<PersistentClientEntry> => {
      cliHostLog.info(`Starting ${driver.kind} (${driver.protocol}) CLI runtime client`)
      const env = withExecutableDirOnPath(process.env, driver.executablePath)
      let spawned: CliRuntimeClient

      if (driver.kind === 'omp') {
        spawned = await OmpAcpClient.spawn({
          executablePath: driver.executablePath,
          ...(driverArgs.length > 0 ? { args: driverArgs } : {}),
          env,
          onRequest: (method, params) => this.handleAcpServerRequest('omp', method, params)
        })
      } else if (driver.protocol === 'acp') {
        spawned = await AcpClient.spawn({
          executablePath: driver.executablePath,
          args: driverArgs,
          env,
          label: driver.adapterName,
          onRequest: (method, params) => this.handleAcpServerRequest(driver.kind, method, params)
        })
      } else {
        spawned = await CodexAppServerClient.spawn({
          executablePath: driver.executablePath,
          env,
          ...(options.mcpServers.length > 0 ? { mcpServers: options.mcpServers } : {}),
          ...(options.strictMcpServers ? { strictMcpServers: true } : {}),
          onPermission: (req) =>
            this.handleDirectPermissionRequest('codex', 'codex-app-server', req)
        })
      }

      if (this.generation !== startGen) {
        await spawned.close().catch(() => undefined)
        throw createRunInterruptedError()
      }

      const entry: PersistentClientEntry = {
        kind: driver.kind,
        protocol: driver.protocol,
        executablePath: driver.executablePath,
        argsKey,
        mcpFingerprint,
        client: spawned
      }

      if (typeof spawned.on === 'function') {
        spawned.on('close', () => {
          if (this.persistentClients.get(driver.kind)?.client === spawned) {
            this.persistentClients.delete(driver.kind)
          }
          this.retiredClients.delete(spawned)
        })
      }

      const previous = this.persistentClients.get(driver.kind)
      this.persistentClients.set(driver.kind, entry)
      if (previous && previous.client !== spawned) {
        this.retireClient(previous.client)
      }

      cliHostLog.info(`${driver.kind} (${driver.protocol}) CLI runtime client initialized`, {
        meta: {
          agentName: spawned.agentInfo?.name,
          agentVersion: spawned.agentInfo?.version
        }
      })
      return entry
    })().finally(() => {
      if (this.startPromises.get(flightKey) === promise) {
        this.startPromises.delete(flightKey)
      }
    })

    this.startPromises.set(flightKey, promise)
    return promise
  }

  async stop(): Promise<void> {
    this.generation += 1
    this.readyKinds.clear()

    const runs = Array.from(this.activeRuns.values())
    for (const run of runs) {
      run.interrupted = true
      run.controller.abort()
      void run.session.cancel().catch(() => undefined)
      void run.session.close().catch(() => undefined)
    }
    this.activeRuns.clear()
    this.sessionToRunId.clear()

    const clientsToClose = new Set<CliRuntimeClient>()
    for (const entry of this.persistentClients.values()) {
      clientsToClose.add(entry.client)
    }
    this.persistentClients.clear()

    for (const client of this.retiredClients) {
      clientsToClose.add(client)
    }
    this.retiredClients.clear()

    for (const client of this.ephemeralClients) {
      clientsToClose.add(client)
    }
    this.ephemeralClients.clear()

    if (clientsToClose.size > 0) {
      await Promise.allSettled(Array.from(clientsToClose).map((client) => client.close()))
    }

    if (this.startPromises.size > 0) {
      await Promise.allSettled(Array.from(this.startPromises.values()))
      const lateClients = new Set<CliRuntimeClient>()
      for (const entry of this.persistentClients.values()) {
        lateClients.add(entry.client)
      }
      this.persistentClients.clear()
      for (const client of this.retiredClients) {
        lateClients.add(client)
      }
      this.retiredClients.clear()
      if (lateClients.size > 0) {
        await Promise.allSettled(Array.from(lateClients).map((client) => client.close()))
      }
    }
  }

  private async handleAcpServerRequest(
    kind: CliRuntimeKind,
    method: string,
    params: unknown
  ): Promise<unknown> {
    if (method !== 'session/request_permission') {
      throw new Error(`Unsupported ACP client request: ${method}`)
    }
    const requestParams =
      params && typeof params === 'object' ? (params as AcpPermissionRequestParams) : null
    const options = Array.isArray(requestParams?.options) ? requestParams.options : []
    const rejectFallback = (): AcpPermissionRequestResult => {
      const reject = pickPermissionOption(options, ['reject_once', 'reject_always'])
      return reject
        ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
        : { outcome: { outcome: 'cancelled' } }
    }

    const sessionId = typeof requestParams?.sessionId === 'string' ? requestParams.sessionId : ''
    const runId = sessionId ? this.sessionToRunId.get(sessionId) : undefined
    const activeRun = runId ? this.activeRuns.get(runId) : undefined
    if (!requestParams || !activeRun || activeRun.controller.signal.aborted) {
      return { outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult
    }
    if (!this.onPermissionRequest) {
      return { outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult
    }

    const toolName =
      typeof requestParams.toolCall?.title === 'string' && requestParams.toolCall.title.trim()
        ? requestParams.toolCall.title.trim()
        : typeof requestParams.toolCall?.kind === 'string' && requestParams.toolCall.kind.trim()
          ? requestParams.toolCall.kind.trim()
          : `${kind}.tool`
    const risk = resolveCliPermissionRisk(requestParams.toolCall?.kind, undefined, toolName)
    const permissionReq: CliPermissionRequest = {
      sessionId,
      protocol: 'acp',
      ...(typeof requestParams.toolCall?.toolCallId === 'string'
        ? { toolCallId: requestParams.toolCall.toolCallId }
        : {}),
      toolName,
      ...(typeof requestParams.toolCall?.kind === 'string'
        ? { kind: requestParams.toolCall.kind }
        : {}),
      riskHint: risk,
      summary: toolName,
      input: requestParams.toolCall?.rawInput ?? {},
      acpOptions: options,
      raw: requestParams
    }

    try {
      const decision = await this.onPermissionRequest(permissionReq, {
        runId: activeRun.runId,
        kind,
        protocol: 'acp',
        payload: activeRun.payload,
        workspace: activeRun.workspace,
        signal: activeRun.controller.signal
      })
      if (decision.cancelled || activeRun.controller.signal.aborted) {
        return { outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult
      }
      if (!decision.approved) {
        return rejectFallback()
      }
      const preferred =
        decision.remember && risk === 'read'
          ? ['allow_always', 'allow_once']
          : ['allow_once', 'allow_always']
      const allow = pickPermissionOption(options, preferred)
      return allow
        ? ({
            outcome: { outcome: 'selected', optionId: allow.optionId }
          } satisfies AcpPermissionRequestResult)
        : rejectFallback()
    } catch {
      return activeRun.controller.signal.aborted
        ? ({ outcome: { outcome: 'cancelled' } } satisfies AcpPermissionRequestResult)
        : rejectFallback()
    }
  }

  private async handleDirectPermissionRequest(
    kind: CliRuntimeKind,
    protocol: CliRuntimeProtocol,
    req: CliPermissionRequest,
    boundRunId?: string
  ): Promise<CliPermissionDecision> {
    const resolvedRunId =
      boundRunId ?? (req.sessionId ? this.sessionToRunId.get(req.sessionId) : undefined)
    const activeRun = resolvedRunId ? this.activeRuns.get(resolvedRunId) : undefined
    if (!activeRun || activeRun.controller.signal.aborted) {
      return { approved: false, cancelled: true, reason: 'Run is no longer active' }
    }
    if (!this.onPermissionRequest) {
      return { approved: false, cancelled: false, reason: 'Permission handler unavailable' }
    }

    const risk = resolveCliPermissionRisk(req.kind, req.riskHint, req.toolName)
    try {
      const decision = await this.onPermissionRequest(
        {
          ...req,
          protocol,
          riskHint: risk
        },
        {
          runId: activeRun.runId,
          kind,
          protocol,
          payload: activeRun.payload,
          workspace: activeRun.workspace,
          signal: activeRun.controller.signal
        }
      )
      if (activeRun.controller.signal.aborted) {
        return { approved: false, cancelled: true, reason: 'Run was aborted' }
      }
      return {
        ...decision,
        approved: decision.approved === true,
        remember: decision.approved === true && decision.remember === true && risk === 'read'
      }
    } catch {
      return {
        approved: false,
        cancelled: activeRun.controller.signal.aborted,
        reason: 'Permission request failed'
      }
    }
  }

  async execute(
    payload: PiRuntimeStartPayload,
    workspace?: PiWorkspaceAuthority
  ): Promise<PiRuntimeRunResult> {
    const kind = resolveCliProfileKind(payload.profile.id)
    if (!kind) {
      throw createRunFailedError(
        `CLI_PROFILE_UNSUPPORTED: profile ${payload.profile.id} is not an external CLI scheduler`
      )
    }

    const runId = payload.run.id
    if (this.activeRuns.has(runId)) {
      throw new Error(`Run ${runId} is already active`)
    }

    const timeoutMs = Math.max(
      1_000,
      payload.request.timeoutMs || payload.profile.timeoutMs || 10 * 60 * 1000
    )

    const runGen = this.generation
    let session: CliRuntimeSession | null = null
    let runOwnedClient: CliRuntimeClient | null = null
    let retainedPersistentClient: CliRuntimeClient | null = null
    let activeRun: ActiveCliRun | null = null
    let timeoutTimer: NodeJS.Timeout | undefined
    let worktreeLease: WorktreeLease | null = null
    let worktreeOpts: CliWorktreeRequestOptions | null = null

    try {
      await workspace?.assertAuthority()

      const driver = await this.resolveDriver(kind)
      if (this.generation !== runGen) throw createRunInterruptedError()
      this.recordRunProtocol(runId, driver.protocol)

      const preferredModel = resolvePreferredCliModel(payload, workspace)
      const reasoningEffort = resolveReasoningEffort(workspace)
      const mcpServers = (await this.resolveMcpServers?.(payload, workspace)) ?? []
      const requestMetadata = toRecord(payload.request.metadata)
      const hasAutomationPolicy = Boolean(requestMetadata.automationPolicy)
      worktreeOpts = parseWorktreeRequestOptions(requestMetadata.worktree)

      if (worktreeOpts) {
        worktreeLease = await this.worktreeManager.acquireWorktree({
          runId,
          conversationId: workspace?.conversationId ?? payload.run.sessionId,
          repoRoot: payload.run.cwd,
          ...(worktreeOpts.baseRef ? { baseRef: worktreeOpts.baseRef } : {}),
          ...(worktreeOpts.branchPrefix ? { branchPrefix: worktreeOpts.branchPrefix } : {}),
          ...(worktreeOpts.detached !== undefined ? { detached: worktreeOpts.detached } : {})
        })
        this.runWorktrees.set(runId, worktreeLease)
      }

      if (this.generation !== runGen) throw createRunInterruptedError()

      const effectiveCwd = worktreeLease?.effectiveCwd ?? payload.run.cwd
      const controller = new AbortController()

      if (driver.protocol === 'claude-stream-json') {
        const systemPrompt = payload.profile.systemPrompt?.trim() || undefined
        const spawnedClaude = await ClaudeStreamClient.spawn({
          executablePath: driver.executablePath,
          cwd: effectiveCwd,
          env: withExecutableDirOnPath(process.env, driver.executablePath),
          ...(preferredModel ? { model: preferredModel } : {}),
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          ...(mcpServers.length > 0 ? { mcpServers } : {}),
          ...(hasAutomationPolicy ? { strictMcpConfig: true } : {}),
          onPermission: (req) =>
            this.handleDirectPermissionRequest('claude', 'claude-stream-json', req, runId)
        })
        if (this.generation !== runGen) {
          await spawnedClaude.close().catch(() => undefined)
          throw createRunInterruptedError()
        }
        runOwnedClient = spawnedClaude
        this.ephemeralClients.add(spawnedClaude)
        session = await spawnedClaude.createSession({
          cwd: effectiveCwd,
          ...(preferredModel ? { model: preferredModel } : {}),
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          ...(mcpServers.length > 0 ? { mcpServers } : {}),
          permissionMode: 'review'
        })
      } else {
        const entry = await this.ensurePersistentClient(driver, {
          mcpServers,
          strictMcpServers: hasAutomationPolicy
        })
        if (this.generation !== runGen) throw createRunInterruptedError()
        retainedPersistentClient = entry.client
        this.retainClientForRun(entry.client, runId)
        if (driver.protocol === 'acp') {
          session = await entry.client.createSession({
            cwd: effectiveCwd,
            ...(preferredModel ? { model: preferredModel } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            ...(mcpServers.length > 0 ? { mcpServers } : {})
          })
        } else {
          const systemPrompt = payload.profile.systemPrompt?.trim() || undefined
          session = await entry.client.createSession({
            cwd: effectiveCwd,
            ...(preferredModel ? { model: preferredModel } : {}),
            ...(systemPrompt ? { systemPrompt } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            permissionMode: 'review'
          })
        }
      }

      if (this.generation !== runGen) {
        throw createRunInterruptedError()
      }

      activeRun = {
        runId,
        kind,
        protocol: driver.protocol,
        sessionId: session.sessionId,
        session,
        controller,
        payload,
        workspace,
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

      const providerId = cliProviderIdForKind(kind)
      const defaultModel = cliDefaultModelLabel(kind, driver.protocol)

      if (workspace) {
        await this.onEvent?.({
          runId,
          type: 'provider_response',
          payload: {
            provider: providerId,
            model: preferredModel ?? defaultModel,
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

      // ACP does not accept a standalone system role on prompt input, while Codex app-server
      // receives `developerInstructions` on `thread/start` and Claude receives `--system-prompt`.
      const promptContent = buildCliPromptContent(payload, workspace, driver.protocol === 'acp')

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
      if (activeRun.timedOut) {
        throw createRunFailedError(`${kind.toUpperCase()} runtime timed out after ${timeoutMs}ms`)
      }
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
              provider: providerId,
              model: preferredModel ?? defaultModel,
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
        throw createRunFailedError(`${kind.toUpperCase()} runtime timed out after ${timeoutMs}ms`)
      }
      if (activeRun?.cancelled) throw createRunCancelledError()
      if (isPiRuntimeControlError(error)) throw error
      throw createRunFailedError(
        projectRunFailureDetail(error) || `${kind.toUpperCase()} runtime execution failed`
      )
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      this.activeRuns.delete(runId)
      if (session?.sessionId && this.sessionToRunId.get(session.sessionId) === runId) {
        this.sessionToRunId.delete(session.sessionId)
      }
      if (session) {
        await session.close().catch(() => undefined)
      }
      if (runOwnedClient) {
        this.ephemeralClients.delete(runOwnedClient)
        await runOwnedClient.close().catch(() => undefined)
      }
      if (retainedPersistentClient) {
        await this.releaseClientForRun(retainedPersistentClient, runId)
      }
      if (
        worktreeLease &&
        worktreeOpts &&
        (!activeRun || worktreeOpts.cleanupOnComplete !== false)
      ) {
        try {
          const released = await this.worktreeManager.releaseWorktree(worktreeLease.worktreeId, {
            force: worktreeOpts.forceCleanup === true
          })
          if (released.removed) {
            this.runWorktrees.delete(runId)
          }
        } catch (releaseError) {
          const code = isGitWorktreeError(releaseError) ? releaseError.code : 'UNKNOWN'
          cliHostLog.warn('Preserving run worktree after completion', {
            meta: { runId, worktreeId: worktreeLease.worktreeId, reason: code }
          })
        }
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

export { CliAgentRuntimeHost as AcpAgentRuntimeHost }
