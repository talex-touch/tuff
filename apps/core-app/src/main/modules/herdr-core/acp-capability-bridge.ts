import type {
  AcpClientCapabilities,
  AcpClientCapabilityMethod,
  AcpFsReadTextFileParams,
  AcpFsReadTextFileResult,
  AcpFsWriteTextFileParams,
  AcpFsWriteTextFileResult,
  AcpTerminalCreateParams,
  AcpTerminalCreateResult,
  AcpTerminalEnvVar,
  AcpTerminalExitStatus,
  AcpTerminalKillParams,
  AcpTerminalKillResult,
  AcpTerminalOutputParams,
  AcpTerminalOutputResult,
  AcpTerminalReleaseParams,
  AcpTerminalReleaseResult,
  AcpTerminalWaitForExitParams,
  AcpTerminalWaitForExitResult
} from '@talex-touch/tuff-intelligence'
import type {
  HerdrExecRequest,
  HerdrExecResult,
  HerdrFileEditRequest,
  HerdrFileReadRequest,
  HerdrFileReadResult,
  HerdrFileWriteRequest,
  HerdrFileWriteResult,
  HerdrSendResult,
  HerdrSessionView,
  HerdrTerminalControlResult,
  HerdrTerminalReadRequest,
  HerdrTerminalReadResult,
  HerdrTerminalRunRequest,
  HerdrTerminalSendRequest
} from '@talex-touch/utils/transport/events/herdr'
import type { HerdrAcpCapabilityBridge, HerdrRuntimePlane } from './runtime-plane'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

export const HERDR_ACP_CLIENT_CAPABILITIES: AcpClientCapabilities = {
  fs: {
    readTextFile: true,
    writeTextFile: true
  },
  terminal: true
}

export const HERDR_ACP_CAPABILITY_METHODS: ReadonlySet<AcpClientCapabilityMethod> = new Set([
  'fs/read_text_file',
  'fs/write_text_file',
  'terminal/create',
  'terminal/output',
  'terminal/wait_for_exit',
  'terminal/kill',
  'terminal/release'
])

export type HerdrAcpMutatingMethod = 'fs/write_text_file' | 'terminal/create' | 'terminal/kill'

export const HERDR_ACP_MUTATING_METHODS: ReadonlySet<HerdrAcpMutatingMethod> = new Set([
  'fs/write_text_file',
  'terminal/create',
  'terminal/kill'
])

export function isHerdrAcpCapabilityMethod(method: string): method is AcpClientCapabilityMethod {
  return HERDR_ACP_CAPABILITY_METHODS.has(method as AcpClientCapabilityMethod)
}

export function isHerdrAcpMutatingMethod(method: string): method is HerdrAcpMutatingMethod {
  return HERDR_ACP_MUTATING_METHODS.has(method as HerdrAcpMutatingMethod)
}

export interface HerdrAcpAuthorizationRequest {
  method: HerdrAcpMutatingMethod
  sessionId: string
  machine: string | null
  summary: string
  params: unknown
}

export interface HerdrAcpServerRequestContext {
  signal?: AbortSignal
}

export interface DefaultHerdrAcpCapabilityBridgeOptions {
  id?: string
  plane: HerdrRuntimePlane
  /** Optional remote SSH machine name (`null`/omitted for local core). */
  machine?: string | null
  /** Default working directory for relative file paths and terminal commands. */
  cwd?: string | null
  /**
   * Optional fail-closed authorization hook for mutating/exec calls
   * (`fs/write_text_file`, `terminal/create`, `terminal/kill`).
   * Returning anything other than `true` or throwing rejects without invoking `plane`.
   */
  authorize?: (action: HerdrAcpAuthorizationRequest) => boolean | Promise<boolean>
  /** Default timeout in seconds for `terminal/wait_for_exit`. */
  waitTimeoutSeconds?: number
}

interface OwnedTerminalRecord {
  address: string
  outputByteLimit?: number
}

const DEFAULT_TERMINAL_READ_LINES = 1_000
const DEFAULT_WAIT_TIMEOUT_SECONDS = 180
const SHELL_LINE_PATTERN = /[\s|&;<>()$`'"\\]/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeMachine(machine?: string | null): string | null {
  const trimmed = typeof machine === 'string' ? machine.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

function normalizeEnvRecord(
  env?: AcpTerminalEnvVar[] | Record<string, string>
): Record<string, string> | undefined {
  if (!env) return undefined
  if (Array.isArray(env)) {
    const record: Record<string, string> = {}
    for (const entry of env) {
      if (entry && typeof entry.name === 'string' && typeof entry.value === 'string') {
        record[entry.name] = entry.value
      }
    }
    return Object.keys(record).length > 0 ? record : undefined
  }
  if (isRecord(env)) {
    const record: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        record[key] = value
      }
    }
    return Object.keys(record).length > 0 ? record : undefined
  }
  return undefined
}

/**
 * Truncates text to at most `byteLimit` UTF-8 bytes from the tail without splitting
 * a multi-byte UTF-8 sequence.
 */
function truncateTailUtf8(text: string, byteLimit: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length <= byteLimit) {
    return { text, truncated: false }
  }
  let start = bytes.length - byteLimit
  // Advance past UTF-8 continuation bytes (10xxxxxx) so decoding starts on a valid scalar boundary.
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) {
    start += 1
  }
  return {
    text: bytes.subarray(start).toString('utf8'),
    truncated: true
  }
}

/**
 * Bridges ACP agent->client filesystem and terminal requests onto `HerdrRuntimePlane`.
 * Supports local and remote (`machine`) targets with strict terminal ownership scoping
 * and fail-closed authorization for mutating/exec operations.
 */
export class DefaultHerdrAcpCapabilityBridge implements HerdrAcpCapabilityBridge {
  readonly id: string
  private readonly plane: HerdrRuntimePlane
  private readonly machine: string | null
  private readonly defaultCwd: string | null
  private readonly authorize?: DefaultHerdrAcpCapabilityBridgeOptions['authorize']
  private readonly waitTimeoutSeconds: number
  private readonly ownedTerminals = new Map<string, OwnedTerminalRecord>()
  private disposed = false

  constructor(options: DefaultHerdrAcpCapabilityBridgeOptions) {
    this.id = options.id?.trim() || `herdr-acp-bridge-${randomUUID()}`
    this.plane = options.plane
    this.machine = normalizeMachine(options.machine)
    this.defaultCwd = options.cwd?.trim() ? options.cwd.trim() : null
    this.authorize = options.authorize
    this.waitTimeoutSeconds = options.waitTimeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  get ownedTerminalIds(): string[] {
    return [...this.ownedTerminals.keys()]
  }

  hasOwnedTerminal(terminalId: unknown): boolean {
    return typeof terminalId === 'string' && this.ownedTerminals.has(terminalId)
  }

  resolveMachineTarget(addressOrMachine: string): string | null {
    const trimmed = addressOrMachine.trim()
    if (!trimmed) return this.machine
    const slash = trimmed.indexOf('/')
    if (slash > 0) return trimmed.slice(0, slash)
    return this.machine
  }

  readTextFile(request: HerdrFileReadRequest): Promise<HerdrFileReadResult> {
    return this.plane.files.read({
      ...request,
      cwd: request.cwd ?? this.defaultCwd,
      on: request.on !== undefined ? request.on : this.machine
    })
  }

  writeTextFile(request: HerdrFileWriteRequest): Promise<HerdrFileWriteResult> {
    return this.plane.files.write({
      ...request,
      cwd: request.cwd ?? this.defaultCwd,
      on: request.on !== undefined ? request.on : this.machine
    })
  }

  editTextFile(request: HerdrFileEditRequest): Promise<HerdrFileWriteResult> {
    return this.plane.files.edit({
      ...request,
      cwd: request.cwd ?? this.defaultCwd,
      on: request.on !== undefined ? request.on : this.machine
    })
  }

  exec(request: HerdrExecRequest): Promise<HerdrExecResult> {
    return this.plane.exec({
      ...request,
      cwd: request.cwd ?? this.defaultCwd,
      on: request.on !== undefined ? request.on : this.machine
    })
  }

  createTerminal(request: HerdrTerminalRunRequest): Promise<HerdrSessionView> {
    return this.plane.terminals.run({
      ...request,
      cwd: request.cwd ?? this.defaultCwd ?? undefined,
      on: request.on !== undefined ? request.on : this.machine
    })
  }

  readTerminalOutput(request: HerdrTerminalReadRequest): Promise<HerdrTerminalReadResult> {
    return this.plane.terminals.read(request)
  }

  sendTerminalInput(request: HerdrTerminalSendRequest): Promise<HerdrSendResult> {
    return this.plane.terminals.send(request)
  }

  killTerminal(terminal: string): Promise<HerdrTerminalControlResult> {
    return this.plane.terminals.kill(terminal)
  }

  /**
   * Dispatches standard ACP agent->client JSON-RPC capability requests.
   */
  async handleServerRequest(
    method: string,
    params: unknown,
    context?: HerdrAcpServerRequestContext
  ): Promise<unknown> {
    if (this.disposed) {
      throw new Error('HERDR_ACP_BRIDGE_DISPOSED')
    }
    if (context?.signal?.aborted) {
      throw new Error('HERDR_ACP_REQUEST_ABORTED')
    }

    switch (method) {
      case 'fs/read_text_file':
        return await this.handleReadTextFile(params)
      case 'fs/write_text_file':
        return await this.handleWriteTextFile(params, context)
      case 'terminal/create':
        return await this.handleTerminalCreate(params, context)
      case 'terminal/output':
        return await this.handleTerminalOutput(params)
      case 'terminal/wait_for_exit':
        return await this.handleTerminalWaitForExit(params)
      case 'terminal/kill':
        return await this.handleTerminalKill(params, context)
      case 'terminal/release':
        return await this.handleTerminalRelease(params)
      default:
        throw new Error(`HERDR_ACP_METHOD_UNSUPPORTED: ${method}`)
    }
  }

  /**
   * Releases tracked terminal references for this bridge run.
   * NEVER calls `server.stop` and NEVER kills unrelated user terminals.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ownedTerminals.clear()
  }

  private async ensureAuthorized(
    method: HerdrAcpMutatingMethod,
    sessionId: string,
    summary: string,
    params: unknown,
    context?: HerdrAcpServerRequestContext
  ): Promise<void> {
    if (context?.signal?.aborted) {
      throw new Error('HERDR_ACP_PERMISSION_DENIED')
    }
    if (!this.authorize) return
    let allowed = false
    try {
      allowed =
        (await this.authorize({
          method,
          sessionId,
          machine: this.machine,
          summary,
          params
        })) === true
    } catch {
      allowed = false
    }
    if (!allowed || context?.signal?.aborted) {
      throw new Error('HERDR_ACP_PERMISSION_DENIED')
    }
  }

  private requireOwnedTerminal(terminalId: unknown): OwnedTerminalRecord {
    if (typeof terminalId !== 'string' || !terminalId.trim()) {
      throw new Error('HERDR_ACP_TERMINAL_FORBIDDEN')
    }
    const owned = this.ownedTerminals.get(terminalId)
    if (!owned) {
      throw new Error('HERDR_ACP_TERMINAL_FORBIDDEN')
    }
    return owned
  }

  private async handleReadTextFile(raw: unknown): Promise<AcpFsReadTextFileResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpFsReadTextFileParams) : null
    if (!params || typeof params.path !== 'string' || !params.path.trim()) {
      throw new Error('HERDR_ACP_PARAMS_INVALID: fs/read_text_file requires path')
    }
    const result = await this.readTextFile({
      path: params.path,
      offset:
        typeof params.line === 'number' && Number.isInteger(params.line) && params.line >= 1
          ? params.line
          : undefined,
      limit:
        typeof params.limit === 'number' && Number.isInteger(params.limit) && params.limit >= 1
          ? params.limit
          : undefined
    })
    return { content: result.text }
  }

  private async handleWriteTextFile(
    raw: unknown,
    context?: HerdrAcpServerRequestContext
  ): Promise<AcpFsWriteTextFileResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpFsWriteTextFileParams) : null
    if (
      !params ||
      typeof params.path !== 'string' ||
      !params.path.trim() ||
      typeof params.content !== 'string'
    ) {
      throw new Error('HERDR_ACP_PARAMS_INVALID: fs/write_text_file requires path and content')
    }
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : ''
    await this.ensureAuthorized(
      'fs/write_text_file',
      sessionId,
      `Write file ${params.path}`,
      params,
      context
    )
    await this.writeTextFile({
      path: params.path,
      data: Buffer.from(params.content, 'utf8').toString('base64')
    })
    return {}
  }

  private async handleTerminalCreate(
    raw: unknown,
    context?: HerdrAcpServerRequestContext
  ): Promise<AcpTerminalCreateResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpTerminalCreateParams) : null
    if (!params || typeof params.command !== 'string' || !params.command.trim()) {
      throw new Error('HERDR_ACP_PARAMS_INVALID: terminal/create requires command')
    }
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : ''
    const command = params.command.trim()
    const args = Array.isArray(params.args) ? params.args.map((arg) => String(arg)) : undefined
    const commandSummary = args && args.length > 0 ? `${command} ${args.join(' ')}` : command

    await this.ensureAuthorized(
      'terminal/create',
      sessionId,
      `Run command: ${commandSummary}`,
      params,
      context
    )

    const env = normalizeEnvRecord(params.env)
    const useShellLine = (!args || args.length === 0) && SHELL_LINE_PATTERN.test(command)

    const created = await this.createTerminal({
      ...(useShellLine ? { line: command } : { argv: [command, ...(args ?? [])] }),
      cwd: typeof params.cwd === 'string' && params.cwd.trim() ? params.cwd : undefined,
      ...(env ? { env } : {}),
      labels: {
        'tuff.acp.bridge': this.id,
        ...(sessionId ? { 'tuff.acp.session': sessionId } : {})
      }
    })

    const outputByteLimit =
      typeof params.outputByteLimit === 'number' &&
      Number.isFinite(params.outputByteLimit) &&
      params.outputByteLimit > 0
        ? Math.floor(params.outputByteLimit)
        : undefined

    const terminalId = created.address
    if (!this.disposed) {
      this.ownedTerminals.set(terminalId, {
        address: created.address,
        outputByteLimit
      })
    }

    return { terminalId }
  }

  private async handleTerminalOutput(raw: unknown): Promise<AcpTerminalOutputResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpTerminalOutputParams) : null
    const owned = this.requireOwnedTerminal(params?.terminalId)

    const [readRes, info] = await Promise.all([
      this.readTerminalOutput({
        terminal: owned.address,
        lines: DEFAULT_TERMINAL_READ_LINES
      }),
      this.plane.terminals.get(owned.address).catch(() => null)
    ])

    let output = readRes.text
    let truncated = !readRes.complete
    if (owned.outputByteLimit !== undefined) {
      const clamped = truncateTailUtf8(output, owned.outputByteLimit)
      output = clamped.text
      truncated = truncated || clamped.truncated
    }

    const exitStatus: AcpTerminalExitStatus | null =
      info && info.state === 'finished'
        ? {
            exitCode: info.exitCode,
            signal: info.signal
          }
        : null

    return {
      output,
      truncated,
      exitStatus
    }
  }

  private async handleTerminalWaitForExit(raw: unknown): Promise<AcpTerminalWaitForExitResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpTerminalWaitForExitParams) : null
    const owned = this.requireOwnedTerminal(params?.terminalId)

    const current = await this.plane.terminals.get(owned.address).catch(() => null)
    if (current && current.state === 'finished') {
      return {
        exitCode: current.exitCode,
        signal: current.signal
      }
    }

    const waitRes = await this.plane.terminals.wait({
      terminal: owned.address,
      timeout: this.waitTimeoutSeconds
    })

    const after = await this.plane.terminals.get(owned.address).catch(() => null)
    if (after) {
      return {
        exitCode: after.exitCode,
        signal: after.signal
      }
    }

    return {
      exitCode: typeof waitRes.exit_code === 'number' ? waitRes.exit_code : null,
      signal:
        typeof waitRes.signal === 'number' || typeof waitRes.signal === 'string'
          ? waitRes.signal
          : null
    }
  }

  private async handleTerminalKill(
    raw: unknown,
    context?: HerdrAcpServerRequestContext
  ): Promise<AcpTerminalKillResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpTerminalKillParams) : null
    // Enforce terminal ownership BEFORE asking for permission so foreign IDs fail immediately.
    const owned = this.requireOwnedTerminal(params?.terminalId)
    const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : ''

    await this.ensureAuthorized(
      'terminal/kill',
      sessionId,
      `Kill terminal ${owned.address}`,
      params,
      context
    )

    await this.killTerminal(owned.address)
    return {}
  }

  private async handleTerminalRelease(raw: unknown): Promise<AcpTerminalReleaseResult> {
    const params = isRecord(raw) ? (raw as unknown as AcpTerminalReleaseParams) : null
    const owned = this.requireOwnedTerminal(params?.terminalId)
    this.ownedTerminals.delete(params!.terminalId)

    try {
      const info = await this.plane.terminals.get(owned.address).catch(() => null)
      if (info && info.state === 'live') {
        await this.plane.terminals.kill(owned.address).catch(() => undefined)
      }
      await this.plane.terminals.rm(owned.address).catch(() => undefined)
    } catch {
      // Best-effort cleanup of bridge-owned terminal resources.
    }

    return {}
  }
}
