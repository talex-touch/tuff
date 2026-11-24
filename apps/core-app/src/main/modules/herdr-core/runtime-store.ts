import type { HerdrCoreSettings } from '@talex-touch/utils/common/storage/entity/app-settings'
import type {
  HerdrBinaryInfo,
  HerdrBlockedKind,
  HerdrConnectionState,
  HerdrCoreSummary,
  HerdrEnsureStartedRequest,
  HerdrMachineState,
  HerdrMachineView,
  HerdrOscState,
  HerdrOwnership,
  HerdrRuntimeSnapshot,
  HerdrSessionEventKind,
  HerdrSessionStatus,
  HerdrSessionUpsertPayload,
  HerdrSessionView,
  HerdrTemplateView
} from '@talex-touch/utils/transport/events/herdr'
import type { HerdrHelloResult, HerdrRpcNotification } from './framed-client'
import type {
  DiscoverAndConnectOptions,
  DiscoveredHerdrConnection,
  HerdrBinarySource as DiscoveryBinarySource,
  HerdrDiscoveryDeps
} from './socket-discovery'
import {
  DEFAULT_HERDR_CORE_SETTINGS,
  normalizeHerdrCoreSettings
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { HerdrBinaryManager } from './binary-manager'
import { HerdrClientError, HerdrFramedClient } from './framed-client'
import {
  DEFAULT_HERDR_BOOTSTRAP_TIMEOUT_MS,
  DEFAULT_HERDR_CONNECT_TIMEOUT_MS,
  discoverAndConnectHerdrSocket,
  HerdrDiscoveryError,
  resolveHerdrSession
} from './socket-discovery'

export const DEFAULT_HERDR_HEARTBEAT_TIMEOUT_MS = 45_000
export const DEFAULT_HERDR_RECONNECT_BASE_MS = 500
export const DEFAULT_HERDR_RECONNECT_MAX_MS = 15_000

const VALID_OSC_STATES = new Set<HerdrOscState>(['idle', 'working', 'done', 'blocked', 'error'])
const VALID_BLOCKED_KINDS = new Set<HerdrBlockedKind>(['permission', 'question', 'auth'])
const VALID_MACHINE_STATES = new Set<HerdrMachineState>([
  'connecting',
  'connected',
  'needs_login',
  'unreachable'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry
    }
  }
  return result
}

export function extractMachineFromAddress(address: string): string | null {
  const slashIndex = address.indexOf('/')
  if (slashIndex <= 0) return null
  return address.slice(0, slashIndex)
}

export function normalizeWireStatus(raw: unknown): HerdrSessionStatus | null {
  if (!isRecord(raw)) return null
  const rawState = raw.state
  if (typeof rawState !== 'string' || !VALID_OSC_STATES.has(rawState as HerdrOscState)) {
    return null
  }
  const status: HerdrSessionStatus = {
    state: rawState as HerdrOscState
  }
  if (typeof raw.app === 'string') status.app = raw.app
  if (typeof raw.title === 'string') status.title = raw.title
  if (typeof raw.msg === 'string') status.msg = raw.msg
  if (raw.kind === null) {
    status.kind = null
  } else if (
    typeof raw.kind === 'string' &&
    VALID_BLOCKED_KINDS.has(raw.kind as HerdrBlockedKind)
  ) {
    status.kind = raw.kind as HerdrBlockedKind
  }
  if (raw.progress === null) {
    status.progress = null
  } else if (typeof raw.progress === 'number' && Number.isFinite(raw.progress)) {
    status.progress = raw.progress
  }
  return status
}

function normalizeWireRecords(raw: unknown): Record<string, HerdrSessionStatus> | undefined {
  if (!isRecord(raw)) return undefined
  const out: Record<string, HerdrSessionStatus> = {}
  let count = 0
  for (const [id, value] of Object.entries(raw)) {
    const normalized = normalizeWireStatus(value)
    if (normalized) {
      out[id] = normalized
      count += 1
    }
  }
  return count > 0 ? out : undefined
}

export function normalizeWireTerminal(raw: Record<string, unknown>): HerdrSessionView {
  const address = typeof raw.address === 'string' ? raw.address : ''
  const foreground = isRecord(raw.foreground) ? raw.foreground : null
  const records = normalizeWireRecords(raw.records)

  return {
    address,
    machine: extractMachineFromAddress(address),
    name: asNullableString(raw.name),
    title: typeof raw.title === 'string' ? raw.title : '',
    argv: Array.isArray(raw.argv) ? raw.argv.map((item) => String(item)) : [],
    cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
    foregroundName: foreground ? asNullableString(foreground.name) : null,
    foregroundCwd: foreground ? asNullableString(foreground.cwd) : null,
    foregroundPid: foreground ? asNullableNumber(foreground.pid) : null,
    state: raw.state === 'finished' ? 'finished' : 'live',
    status: normalizeWireStatus(raw.status),
    statusMs: asNullableNumber(raw.status_ms),
    ...(records ? { records } : {}),
    reported: raw.reported === true,
    turn: asNumber(raw.turn, 0),
    keep: raw.keep === true,
    template: asNullableString(raw.template),
    parent: asNullableString(raw.parent),
    labels: asStringRecord(raw.labels),
    cols: asNumber(raw.cols, 0),
    rows: asNumber(raw.rows, 0),
    pid: asNullableNumber(raw.pid),
    exitCode: asNullableNumber(raw.exit_code),
    signal: asNullableNumber(raw.signal),
    reason: asNullableString(raw.reason),
    screen: raw.screen === 'inexact' ? 'inexact' : 'exact',
    createdMs: asNumber(raw.created_ms, 0),
    finishedMs: asNullableNumber(raw.finished_ms)
  }
}

export function normalizeWireMachine(raw: Record<string, unknown>): HerdrMachineView {
  const rawState = typeof raw.state === 'string' ? raw.state : 'unreachable'
  const state: HerdrMachineState = VALID_MACHINE_STATES.has(rawState as HerdrMachineState)
    ? (rawState as HerdrMachineState)
    : 'unreachable'
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    target: typeof raw.target === 'string' ? raw.target : '',
    id: typeof raw.id === 'string' ? raw.id : '',
    host: typeof raw.host === 'string' ? raw.host : '',
    version: typeof raw.version === 'string' ? raw.version : '',
    state,
    session: asNullableString(raw.session),
    temporary: raw.temporary === true,
    via: raw.via === true,
    sinceMs: asNullableNumber(raw.since_ms),
    why: asNullableString(raw.why)
  }
}

export function normalizeWireTemplate(raw: Record<string, unknown>): HerdrTemplateView {
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    command: typeof raw.command === 'string' ? raw.command : '',
    error: asNullableString(raw.error)
  }
}

function cloneSession(session: HerdrSessionView): HerdrSessionView {
  return {
    ...session,
    argv: [...session.argv],
    labels: { ...session.labels },
    status: session.status ? { ...session.status } : null,
    ...(session.records
      ? {
          records: Object.fromEntries(
            Object.entries(session.records).map(([key, value]) => [key, { ...value }])
          )
        }
      : {})
  }
}

function sameBinaryInfo(a: HerdrBinaryInfo | null, b: HerdrBinaryInfo | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.source === b.source &&
    a.path === b.path &&
    a.version === b.version &&
    a.platform === b.platform &&
    a.arch === b.arch &&
    a.supported === b.supported &&
    a.installHint === b.installHint
  )
}

export interface HerdrDocEvent {
  name: string
  version: number
  seq: number
}

export interface HerdrSessionRestartedEvent {
  address: string
  session: HerdrSessionView
  seq: number
}

export interface HerdrRuntimeStoreOptions {
  enabled?: boolean
  settings?: Partial<HerdrCoreSettings>
  heartbeatTimeoutMs?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  connectTimeoutMs?: number
  bootstrapTimeoutMs?: number
  discoveryDeps?: HerdrDiscoveryDeps
  binaryManager?: HerdrBinaryManager
  discoverAndConnect?: (options: DiscoverAndConnectOptions) => Promise<DiscoveredHerdrConnection>
  createClient?: (connection: DiscoveredHerdrConnection) => HerdrFramedClient
  now?: () => number
  onLog?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, string | number | boolean | null | undefined>
  ) => void
}

interface SubscribeWireResult {
  channel?: number | null
  seq: number
  terminals: Record<string, unknown>[]
}

interface StatusWireResult {
  core: { id: string; name: string }
  version: string
  pid: number
  uptime_ms: number
  live: number
  finished: number
}

/**
 * Main-process state machine & `events.subscribe` cache for herdr-core.
 * Owns discovery/bootstrap/handshake/reconnect lifecycle, ordered delta updates,
 * `heartbeat` watchdog, `missed` snapshot replacement, and metadata hydration.
 */
export class HerdrRuntimeStore {
  private readonly heartbeatTimeoutMs: number
  private readonly reconnectBaseMs: number
  private readonly reconnectMaxMs: number
  private readonly connectTimeoutMs: number
  private readonly bootstrapTimeoutMs: number
  private readonly discoveryDeps?: HerdrDiscoveryDeps
  private readonly binaryManager: HerdrBinaryManager
  private readonly allowBackgroundBinaryScan: boolean
  private readonly discoverAndConnectFn: (
    options: DiscoverAndConnectOptions
  ) => Promise<DiscoveredHerdrConnection>
  private readonly createClientFn: (connection: DiscoveredHerdrConnection) => HerdrFramedClient
  private readonly now: () => number
  private readonly log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, string | number | boolean | null | undefined>
  ) => void

  private enabled: boolean
  private settings: HerdrCoreSettings
  private revision = 0
  private seq = 0
  private connection: HerdrConnectionState = 'disconnected'
  private ownership: HerdrOwnership = 'none'
  private socketPath: string | null = null
  private sessionName: string
  private binaryPath: string | null = null
  private binary: HerdrBinaryInfo | null = null
  private binaryInspectSeq = 0
  private error: string | null = null
  private core: HerdrCoreSummary | null = null
  private readonly sessions = new Map<string, HerdrSessionView>()
  private machines: HerdrMachineView[] = []
  private templates: HerdrTemplateView[] = []
  private updatedAt: number

  private client: HerdrFramedClient | null = null
  private detachEventChannel: (() => void) | null = null
  private detachCloseListener: (() => void) | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private connectEpoch = 0
  private connectPromise: Promise<HerdrRuntimeSnapshot> | null = null
  private resyncInFlight = false
  private disposed = false

  private readonly snapshotListeners = new Set<(snapshot: HerdrRuntimeSnapshot) => void>()
  private readonly upsertListeners = new Set<(payload: HerdrSessionUpsertPayload) => void>()
  private readonly restartedListeners = new Set<(event: HerdrSessionRestartedEvent) => void>()
  private readonly docListeners = new Set<(event: HerdrDocEvent) => void>()
  private readonly disconnectListeners = new Set<(reason: string) => void>()

  constructor(options: HerdrRuntimeStoreOptions = {}) {
    this.enabled = options.enabled ?? true
    this.settings = normalizeHerdrCoreSettings(options.settings ?? DEFAULT_HERDR_CORE_SETTINGS)
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HERDR_HEARTBEAT_TIMEOUT_MS
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_HERDR_RECONNECT_BASE_MS
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_HERDR_RECONNECT_MAX_MS
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_HERDR_CONNECT_TIMEOUT_MS
    this.bootstrapTimeoutMs = options.bootstrapTimeoutMs ?? DEFAULT_HERDR_BOOTSTRAP_TIMEOUT_MS
    this.discoveryDeps = options.discoveryDeps
    this.binaryManager =
      options.binaryManager ??
      new HerdrBinaryManager(this.discoveryDeps ? { discoveryDeps: this.discoveryDeps } : {})
    this.allowBackgroundBinaryScan = !options.discoverAndConnect || Boolean(options.binaryManager)
    this.discoverAndConnectFn = options.discoverAndConnect ?? discoverAndConnectHerdrSocket
    this.createClientFn =
      options.createClient ?? ((conn) => new HerdrFramedClient({ socket: conn.socket }))
    this.now = options.now ?? (() => Date.now())
    this.log = options.onLog ?? (() => undefined)
    this.sessionName = resolveHerdrSession(this.settings, this.discoveryDeps)
    this.updatedAt = this.now()
  }

  getClient(): HerdrFramedClient | null {
    return this.client && this.client.isConnected ? this.client : null
  }

  getConnectionState(): HerdrConnectionState {
    return this.connection
  }

  getSession(address: string): HerdrSessionView | null {
    const found = this.sessions.get(address)
    return found ? cloneSession(found) : null
  }

  getSnapshot(): HerdrRuntimeSnapshot {
    const sessions = [...this.sessions.values()]
      .sort((a, b) => {
        if (a.state !== b.state) return a.state === 'live' ? -1 : 1
        return a.createdMs - b.createdMs || a.address.localeCompare(b.address)
      })
      .map(cloneSession)

    return {
      revision: this.revision,
      seq: this.seq,
      enabled: this.enabled,
      connection: this.connection,
      ownership: this.ownership,
      socketPath: this.socketPath,
      session: this.sessionName,
      binaryPath: this.binaryPath,
      ...(this.binary ? { binary: { ...this.binary } } : {}),
      error: this.error,
      core: this.core ? { ...this.core, features: [...this.core.features] } : null,
      sessions,
      machines: this.machines.map((machine) => ({ ...machine })),
      templates: this.templates.map((template) => ({ ...template })),
      updatedAt: this.updatedAt
    }
  }

  onSnapshotChanged(listener: (snapshot: HerdrRuntimeSnapshot) => void): () => void {
    this.snapshotListeners.add(listener)
    return () => {
      this.snapshotListeners.delete(listener)
    }
  }

  onSessionUpsert(listener: (payload: HerdrSessionUpsertPayload) => void): () => void {
    this.upsertListeners.add(listener)
    return () => {
      this.upsertListeners.delete(listener)
    }
  }

  onSessionRestarted(listener: (event: HerdrSessionRestartedEvent) => void): () => void {
    this.restartedListeners.add(listener)
    return () => {
      this.restartedListeners.delete(listener)
    }
  }

  onDocChanged(listener: (event: HerdrDocEvent) => void): () => void {
    this.docListeners.add(listener)
    return () => {
      this.docListeners.delete(listener)
    }
  }

  onDisconnected(listener: (reason: string) => void): () => void {
    this.disconnectListeners.add(listener)
    return () => {
      this.disconnectListeners.delete(listener)
    }
  }

  /**
   * Updates enabled flag and connection settings (from `StorageList.APP_SETTING`).
   * Automatically connects, disconnects, or reconnects when relevant fields change.
   */
  updateConfig(
    enabled: boolean,
    rawSettings?: Partial<HerdrCoreSettings>,
    options: { autoReconnect?: boolean } = {}
  ): void {
    if (this.disposed) return
    const autoReconnect = options.autoReconnect ?? true
    const nextSettings = normalizeHerdrCoreSettings(rawSettings ?? this.settings)
    const prevEnabled = this.enabled
    const prevSettings = this.settings

    this.enabled = enabled
    this.settings = nextSettings
    this.sessionName = resolveHerdrSession(nextSettings, this.discoveryDeps)

    const binaryPathChanged = prevSettings.binaryPath !== nextSettings.binaryPath

    if (!autoReconnect) {
      if (this.allowBackgroundBinaryScan && (!this.binary || binaryPathChanged)) {
        void this.refreshBinaryInfo(nextSettings).catch(() => undefined)
      }
      return
    }

    const endpointChanged =
      prevSettings.socketPath !== nextSettings.socketPath ||
      prevSettings.session !== nextSettings.session ||
      binaryPathChanged
    const autoStartEnabled = !prevSettings.autoStart && nextSettings.autoStart

    if (!enabled) {
      if (prevEnabled || this.client || this.connection !== 'disconnected') {
        this.disconnectInternal('disabled')
        this.setConnectionState('disconnected', null, 'none')
      } else {
        this.emitSnapshot()
      }
      if (this.allowBackgroundBinaryScan && (!this.binary || binaryPathChanged)) {
        void this.refreshBinaryInfo(nextSettings).catch(() => undefined)
      }
      return
    }

    if (!prevEnabled || endpointChanged) {
      void this.reconnect().catch(() => undefined)
      return
    }

    if (
      autoStartEnabled &&
      (this.connection === 'fallback-pty' ||
        this.connection === 'disconnected' ||
        this.connection === 'unavailable')
    ) {
      void this.connect().catch(() => undefined)
    }
  }

  /**
   * Starts the connection sequence if enabled. Never blocks startup when called fire-and-forget.
   */
  connect(options?: {
    forceBootstrap?: boolean
    overrideSettings?: Partial<HerdrCoreSettings>
  }): Promise<HerdrRuntimeSnapshot> {
    if (this.disposed) {
      return Promise.resolve(this.getSnapshot())
    }
    if (!this.enabled && !options?.forceBootstrap) {
      this.setConnectionState('disconnected', null, 'none')
      return Promise.resolve(this.getSnapshot())
    }
    if (this.connection === 'connected' && this.client?.isConnected && !options?.overrideSettings) {
      return Promise.resolve(this.getSnapshot())
    }
    if (this.connectPromise && !options?.overrideSettings && !options?.forceBootstrap) {
      return this.connectPromise
    }

    this.clearReconnectTimer()
    const epoch = ++this.connectEpoch
    const promise = this.runConnect(epoch, options).finally(() => {
      if (this.connectPromise === promise) {
        this.connectPromise = null
      }
    })
    this.connectPromise = promise
    return promise
  }

  ensureStarted(request?: HerdrEnsureStartedRequest): Promise<HerdrRuntimeSnapshot> {
    const overrideSettings: Partial<HerdrCoreSettings> = {
      ...this.settings,
      ...(request?.socketPath !== undefined ? { socketPath: request.socketPath } : {}),
      ...(request?.session !== undefined ? { session: request.session } : {}),
      ...(request?.binaryPath !== undefined ? { binaryPath: request.binaryPath } : {})
    }
    const forceBootstrap = request?.forceBootstrap ?? true
    if (this.connection === 'connected' && this.client?.isConnected) {
      const sameTarget =
        overrideSettings.socketPath === this.settings.socketPath &&
        overrideSettings.session === this.settings.session &&
        overrideSettings.binaryPath === this.settings.binaryPath
      if (sameTarget) {
        if (
          this.allowBackgroundBinaryScan &&
          (!this.binary || (this.binary.path && !this.binary.version))
        ) {
          void this.refreshBinaryInfo(overrideSettings).catch(() => undefined)
        }
        return Promise.resolve(this.getSnapshot())
      }
    }
    this.disconnectInternal('ensure-started')
    this.reconnectAttempt = 0
    return this.connect({
      forceBootstrap,
      overrideSettings
    })
  }

  reconnect(): Promise<HerdrRuntimeSnapshot> {
    if (this.disposed) {
      return Promise.resolve(this.getSnapshot())
    }
    this.clearReconnectTimer()
    this.disconnectInternal('reconnect')
    this.reconnectAttempt = 0
    if (!this.enabled) {
      this.setConnectionState('disconnected', null, 'none')
      return Promise.resolve(this.getSnapshot())
    }
    return this.connect()
  }

  /**
   * Refreshes `server.status`, `machine.list`, and `templates.list` from the active core.
   */
  async refreshMetadata(): Promise<void> {
    const client = this.getClient()
    if (!client) return
    await this.hydrateMetadata(client, client.hello)
    this.emitSnapshot()
  }

  /**
   * Inspects the resolved `herdr-core` binary (source, path, version, platform support)
   * without blocking startup and updates `snapshot.binary` if anything changed.
   */
  async refreshBinaryInfo(settings?: Partial<HerdrCoreSettings>): Promise<HerdrBinaryInfo> {
    const inspectSeq = ++this.binaryInspectSeq
    const info = await this.binaryManager.inspect(settings ?? this.settings)
    if (this.disposed || inspectSeq !== this.binaryInspectSeq) {
      return this.binary ? { ...this.binary } : info
    }
    const changed = !sameBinaryInfo(this.binary, info)
    this.binary = info
    if (this.connection !== 'connected' || !this.binaryPath) {
      this.binaryPath = info.path
    }
    if (changed) {
      this.emitSnapshot()
    }
    return { ...info }
  }

  /**
   * Upserts a session locally from an RPC return value (e.g. `terminal.run` / `terminal.kill`)
   * without advancing or clobbering `events.subscribe` sequence ordering.
   */
  recordSessionLocally(session: HerdrSessionView): void {
    this.sessions.set(session.address, cloneSession(session))
    this.syncCoreCounts()
  }

  /**
   * Gracefully detaches stream subscriptions and closes the client socket.
   * NEVER calls `server.stop` or `server.restart`.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.connectEpoch += 1
    this.binaryInspectSeq += 1
    this.clearReconnectTimer()
    this.disconnectInternal('dispose')
    this.snapshotListeners.clear()
    this.upsertListeners.clear()
    this.restartedListeners.clear()
    this.docListeners.clear()
    this.disconnectListeners.clear()
  }

  private async runConnect(
    epoch: number,
    options?: {
      forceBootstrap?: boolean
      overrideSettings?: Partial<HerdrCoreSettings>
    }
  ): Promise<HerdrRuntimeSnapshot> {
    const effectiveSettings = options?.overrideSettings
      ? normalizeHerdrCoreSettings({ ...this.settings, ...options.overrideSettings })
      : this.settings
    this.sessionName = resolveHerdrSession(effectiveSettings, this.discoveryDeps)

    let discovered: DiscoveredHerdrConnection
    try {
      discovered = await this.discoverAndConnectFn({
        settings: effectiveSettings,
        forceBootstrap: options?.forceBootstrap,
        connectTimeoutMs: this.connectTimeoutMs,
        bootstrapTimeoutMs: this.bootstrapTimeoutMs,
        deps: this.discoveryDeps,
        onStateChange: (phase) => {
          if (this.isStaleEpoch(epoch)) return
          this.setConnectionState(phase, null)
        }
      })
    } catch (error) {
      if (this.isStaleEpoch(epoch)) return this.getSnapshot()
      const message = error instanceof Error ? error.message : String(error)
      if (
        error instanceof HerdrDiscoveryError &&
        (error.code === 'BINARY_NOT_FOUND' || error.code === 'CORE_NOT_RUNNING')
      ) {
        if (error.code === 'BINARY_NOT_FOUND') {
          this.binaryInspectSeq += 1
          this.binaryPath = null
          this.binary = this.binaryManager.buildMissingInfo()
        }
        this.log('info', 'herdr-core unavailable, downgrading to fallback-pty', {
          code: error.code,
          message
        })
        this.setConnectionState('fallback-pty', message, 'none')
        if (error.code !== 'BINARY_NOT_FOUND' && this.allowBackgroundBinaryScan) {
          void this.refreshBinaryInfo(effectiveSettings).catch(() => undefined)
        }
      } else {
        this.log('warn', 'herdr-core discovery/bootstrap failed', { message })
        this.setConnectionState('unavailable', message, 'none')
        if (this.allowBackgroundBinaryScan) {
          void this.refreshBinaryInfo(effectiveSettings).catch(() => undefined)
        }
      }
      return this.getSnapshot()
    }

    if (this.isStaleEpoch(epoch)) {
      discovered.socket.destroy()
      return this.getSnapshot()
    }

    this.socketPath = discovered.socketPath
    this.sessionName = discovered.session
    this.binaryPath = discovered.binaryPath
    this.ownership = discovered.ownership
    this.seedAndProbeDiscoveredBinary(discovered, effectiveSettings)
    this.setConnectionState('handshaking', null, discovered.ownership)

    const client = this.createClientFn(discovered)
    this.client = client

    let connected = false
    let midConnectCloseError: Error | undefined
    this.detachCloseListener = client.onClose((closeError) => {
      if (this.client !== client) return
      if (!connected) {
        midConnectCloseError =
          closeError ??
          new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core disconnected during connect')
        return
      }
      this.handleUnexpectedDisconnect(closeError)
    })

    try {
      const hello = await client.handshake()
      if (this.isStaleEpoch(epoch)) {
        client.close()
        return this.getSnapshot()
      }

      const subscribed = await client.request<SubscribeWireResult>('events.subscribe', {})
      if (this.isStaleEpoch(epoch)) {
        client.close()
        return this.getSnapshot()
      }

      this.replaceSessionCache(subscribed.terminals, subscribed.seq)

      if (typeof subscribed.channel === 'number' && subscribed.channel > 0) {
        this.detachEventChannel = client.registerEventChannel(subscribed.channel, {
          onNotification: (notification) => {
            if (this.client !== client || this.isStaleEpoch(epoch)) return
            this.handleEventNotification(notification)
          },
          onClose: (reason) => {
            if (this.client !== client || this.isStaleEpoch(epoch)) return
            this.log('warn', 'herdr-core event channel closed', { reason })
            client.close()
          },
          onError: (err) => {
            this.log('warn', 'herdr-core event decode error', { message: err.message })
          }
        })
      }

      if (!client.isConnected || midConnectCloseError) {
        this.handleUnexpectedDisconnect(
          midConnectCloseError ??
            new HerdrClientError(
              'CLIENT_DISCONNECTED',
              'herdr-core disconnected immediately after events.subscribe'
            )
        )
        return this.getSnapshot()
      }

      await this.hydrateMetadata(client, hello)
      if (this.isStaleEpoch(epoch)) {
        client.close()
        return this.getSnapshot()
      }

      if (!client.isConnected || midConnectCloseError) {
        this.handleUnexpectedDisconnect(
          midConnectCloseError ??
            new HerdrClientError(
              'CLIENT_DISCONNECTED',
              'herdr-core disconnected during metadata hydration'
            )
        )
        return this.getSnapshot()
      }

      connected = true
      this.reconnectAttempt = 0
      this.error = null
      this.connection = 'connected'
      this.armHeartbeatWatchdog(epoch)
      this.emitSnapshot()
      return this.getSnapshot()
    } catch (error) {
      if (this.client === client) {
        this.client = null
        this.detachEventChannel = null
        const removeClose = this.detachCloseListener
        this.detachCloseListener = null
        removeClose?.()
      }
      client.close()

      if (this.isStaleEpoch(epoch)) {
        return this.getSnapshot()
      }

      const message = error instanceof Error ? error.message : String(error)
      this.log('warn', 'herdr-core handshake or subscribe failed', { message })
      this.core = null
      this.sessions.clear()
      this.machines = []
      this.templates = []

      if (error instanceof HerdrClientError && error.code === 'PROTOCOL_UNSUPPORTED') {
        this.setConnectionState('unavailable', message, 'none')
      } else {
        this.setConnectionState('unavailable', message, 'none')
      }
      return this.getSnapshot()
    }
  }

  private seedAndProbeDiscoveredBinary(
    discovered: DiscoveredHerdrConnection,
    effectiveSettings: HerdrCoreSettings
  ): void {
    const inspectSeq = ++this.binaryInspectSeq
    if (!discovered.binaryPath) {
      this.binary = this.binaryManager.buildMissingInfo()
      return
    }
    const discoverySource: DiscoveryBinarySource =
      discovered.binarySource ?? (effectiveSettings.binaryPath.trim() ? 'settings' : 'path')
    const initial = this.binaryManager.buildFromPath(discovered.binaryPath, discoverySource)
    this.binary = initial

    if (initial.version !== null) {
      return
    }

    const targetPath = discovered.binaryPath
    void this.binaryManager
      .probeVersion(targetPath)
      .then((version) => {
        if (this.disposed || inspectSeq !== this.binaryInspectSeq) return
        if (!this.binary || this.binary.path !== targetPath) return
        if (version && this.binary.version !== version) {
          this.binary = { ...this.binary, version }
          this.emitSnapshot()
        }
      })
      .catch(() => undefined)
  }

  private async hydrateMetadata(
    client: HerdrFramedClient,
    hello: HerdrHelloResult | null
  ): Promise<void> {
    const [statusResult, machinesResult, templatesResult] = await Promise.allSettled([
      client.request<StatusWireResult>('server.status', {}),
      client.request<{ machines?: Record<string, unknown>[] }>('machine.list', {}),
      client.request<{ templates?: Record<string, unknown>[] }>('templates.list', {})
    ])

    const status = statusResult.status === 'fulfilled' ? statusResult.value : null
    if (status || hello) {
      const counts = this.countSessions()
      this.core = {
        id: status?.core?.id ?? hello?.core?.id ?? '',
        name: status?.core?.name ?? hello?.core?.name ?? '',
        version: status?.version ?? hello?.version ?? 'unknown',
        pid: status ? asNullableNumber(status.pid) : null,
        uptimeMs: status ? asNullableNumber(status.uptime_ms) : null,
        liveCount: status ? asNumber(status.live, counts.live) : counts.live,
        finishedCount: status ? asNumber(status.finished, counts.finished) : counts.finished,
        socketPath: this.socketPath ?? '',
        session: this.sessionName,
        generation: hello?.generation ?? 1,
        features: hello ? [...hello.features] : []
      }
    }

    if (machinesResult.status === 'fulfilled' && Array.isArray(machinesResult.value?.machines)) {
      this.machines = machinesResult.value.machines
        .filter(isRecord)
        .map((entry) => normalizeWireMachine(entry))
    }

    if (templatesResult.status === 'fulfilled' && Array.isArray(templatesResult.value?.templates)) {
      this.templates = templatesResult.value.templates
        .filter(isRecord)
        .map((entry) => normalizeWireTemplate(entry))
    }
  }

  private handleEventNotification(notification: HerdrRpcNotification): void {
    this.armHeartbeatWatchdog(this.connectEpoch)

    if (notification.method === 'heartbeat') {
      return
    }

    const params = isRecord(notification.params) ? notification.params : {}

    if (notification.method === 'missed' || params.type === 'missed') {
      this.handleMissedNotification(params)
      return
    }

    if (notification.method !== 'event') {
      return
    }

    const rawSeq = params.seq
    if (typeof rawSeq === 'number' && rawSeq <= this.seq) {
      // Ignore stale events at or below the latest snapshot/event sequence.
      return
    }
    if (typeof rawSeq === 'number') {
      this.seq = rawSeq
    }

    const eventType = typeof params.type === 'string' ? params.type : ''
    const address = typeof params.terminal === 'string' ? params.terminal : ''
    const data = isRecord(params.data) ? params.data : {}

    this.applyDeltaEvent(eventType, address, data)
  }

  private handleMissedNotification(params: Record<string, unknown>): void {
    const nextSeq = typeof params.seq === 'number' ? params.seq : this.seq
    if (Array.isArray(params.terminals)) {
      this.replaceSessionCache(params.terminals.filter(isRecord), nextSeq)
      this.emitSnapshot()
      return
    }

    this.seq = Math.max(this.seq, nextSeq)
    if (this.resyncInFlight) return
    const client = this.getClient()
    if (!client) return
    this.resyncInFlight = true
    void client
      .request<{ terminals?: Record<string, unknown>[] }>('terminal.list', { all: true })
      .then((res) => {
        if (this.client !== client || this.disposed) return
        if (Array.isArray(res?.terminals)) {
          this.replaceSessionCache(res.terminals.filter(isRecord), this.seq)
          this.emitSnapshot()
        }
      })
      .catch((error) => {
        this.log('warn', 'Failed to resync after missed event', {
          message: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        this.resyncInFlight = false
      })
  }

  private applyDeltaEvent(eventType: string, address: string, data: Record<string, unknown>): void {
    if (eventType === 'doc') {
      const name = typeof data.name === 'string' ? data.name : ''
      const version = asNumber(data.version, 0)
      this.revision += 1
      this.updatedAt = this.now()
      for (const listener of [...this.docListeners]) {
        listener({ name, version, seq: this.seq })
      }
      this.emitUpsert('doc', name, null)
      this.emitSnapshot(false)
      return
    }

    const targetAddress = address || (typeof data.address === 'string' ? data.address : '')
    if (!targetAddress) return

    let upsertKind: HerdrSessionEventKind = 'sync'
    let updatedSession: HerdrSessionView | null = null
    let restartedSession: HerdrSessionView | null = null

    switch (eventType) {
      case 'created': {
        const created = normalizeWireTerminal({ ...data, address: targetAddress })
        this.sessions.set(created.address, created)
        upsertKind = 'created'
        updatedSession = created
        break
      }

      case 'removed': {
        this.sessions.delete(targetAddress)
        upsertKind = 'removed'
        updatedSession = null
        break
      }

      case 'lost': {
        const existing = this.sessions.get(targetAddress)
        if (typeof data.address === 'string' && Array.isArray(data.argv)) {
          updatedSession = normalizeWireTerminal(data)
        } else if (existing) {
          updatedSession = {
            ...existing,
            pid: null,
            foregroundName: null,
            foregroundCwd: null,
            foregroundPid: null,
            status: null,
            reason: asNullableString(data.reason) ?? existing.reason ?? 'lost'
          }
        }
        if (updatedSession) {
          this.sessions.set(targetAddress, updatedSession)
        }
        upsertKind = 'lost'
        break
      }

      case 'restarted': {
        const existing = this.sessions.get(targetAddress)
        if (typeof data.address === 'string' && Array.isArray(data.argv)) {
          updatedSession = normalizeWireTerminal(data)
        } else if (existing) {
          updatedSession = {
            ...existing,
            state: 'live',
            pid: data.pid !== undefined ? asNullableNumber(data.pid) : existing.pid,
            cwd: typeof data.cwd === 'string' ? data.cwd : existing.cwd,
            argv: Array.isArray(data.argv) ? data.argv.map(String) : existing.argv,
            cols: data.cols !== undefined ? asNumber(data.cols, existing.cols) : existing.cols,
            rows: data.rows !== undefined ? asNumber(data.rows, existing.rows) : existing.rows,
            reason: null,
            exitCode: null,
            signal: null,
            finishedMs: null,
            status: null,
            foregroundName: null,
            foregroundCwd: null,
            foregroundPid: null
          }
        } else {
          updatedSession = normalizeWireTerminal({ ...data, address: targetAddress, state: 'live' })
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'restarted'
        restartedSession = updatedSession
        break
      }

      case 'keep': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        updatedSession = {
          ...existing,
          keep: data.keep === true
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'keep'
        break
      }

      case 'finished': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        updatedSession = {
          ...existing,
          state: 'finished',
          exitCode: asNullableNumber(data.exit_code),
          signal: asNullableNumber(data.signal),
          reason: asNullableString(data.reason),
          finishedMs: asNullableNumber(data.finished_ms) ?? this.now(),
          foregroundName: null,
          foregroundCwd: null,
          foregroundPid: null,
          status: null
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'finished'
        break
      }

      case 'status': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        const hasNestedStatus = 'status' in data
        const nextStatus = hasNestedStatus
          ? normalizeWireStatus(data.status)
          : normalizeWireStatus(data)
        const nextRecords =
          'records' in data ? normalizeWireRecords(data.records) : existing.records
        const nextStatusMs =
          data.status_ms !== undefined
            ? asNullableNumber(data.status_ms)
            : nextStatus
              ? this.now()
              : existing.statusMs

        updatedSession = {
          ...existing,
          status: nextStatus,
          statusMs: nextStatusMs,
          ...(nextRecords ? { records: nextRecords } : {}),
          reported:
            typeof data.reported === 'boolean'
              ? data.reported
              : existing.reported || nextStatus !== null,
          turn: typeof data.turn === 'number' ? data.turn : existing.turn
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'status'
        break
      }

      case 'turn': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        updatedSession = {
          ...existing,
          turn: asNumber(data.turn, existing.turn),
          ...('status' in data ? { status: normalizeWireStatus(data.status) } : {}),
          ...(data.status_ms !== undefined ? { statusMs: asNullableNumber(data.status_ms) } : {})
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'turn'
        break
      }

      case 'title': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        updatedSession = {
          ...existing,
          title: typeof data.title === 'string' ? data.title : ''
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'title'
        break
      }

      case 'labels': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        updatedSession = {
          ...existing,
          labels: asStringRecord(data.labels ?? data)
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'labels'
        break
      }

      case 'size': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        updatedSession = {
          ...existing,
          cols: asNumber(data.cols, existing.cols),
          rows: asNumber(data.rows, existing.rows)
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'size'
        break
      }

      case 'foreground': {
        const existing = this.sessions.get(targetAddress)
        if (!existing) return
        const hasForeground = typeof data.name === 'string' || typeof data.pid === 'number'
        updatedSession = {
          ...existing,
          foregroundName: hasForeground ? asNullableString(data.name) : null,
          foregroundCwd: hasForeground ? asNullableString(data.cwd) : null,
          foregroundPid: hasForeground ? asNullableNumber(data.pid) : null
        }
        this.sessions.set(targetAddress, updatedSession)
        upsertKind = 'sync'
        break
      }

      default:
        return
    }

    this.syncCoreCounts()
    this.revision += 1
    this.updatedAt = this.now()

    const cloned = updatedSession ? cloneSession(updatedSession) : null
    this.emitUpsert(upsertKind, targetAddress, cloned)

    if (restartedSession) {
      const restartedClone = cloneSession(restartedSession)
      for (const listener of [...this.restartedListeners]) {
        listener({
          address: targetAddress,
          session: restartedClone,
          seq: this.seq
        })
      }
    }

    this.emitSnapshot(false)
  }

  private replaceSessionCache(rawTerminals: Record<string, unknown>[], nextSeq: number): void {
    this.sessions.clear()
    for (const raw of rawTerminals) {
      const normalized = normalizeWireTerminal(raw)
      if (normalized.address) {
        this.sessions.set(normalized.address, normalized)
      }
    }
    this.seq = nextSeq
    this.syncCoreCounts()
  }

  private countSessions(): { live: number; finished: number } {
    let live = 0
    let finished = 0
    for (const session of this.sessions.values()) {
      if (session.state === 'live') live += 1
      else finished += 1
    }
    return { live, finished }
  }

  private syncCoreCounts(): void {
    if (!this.core) return
    const counts = this.countSessions()
    this.core = {
      ...this.core,
      liveCount: counts.live,
      finishedCount: counts.finished
    }
  }

  private armHeartbeatWatchdog(epoch: number): void {
    this.clearHeartbeatTimer()
    if (this.heartbeatTimeoutMs <= 0) return
    this.heartbeatTimer = setTimeout(() => {
      if (this.disposed || this.isStaleEpoch(epoch) || this.connection !== 'connected') return
      this.log(
        'warn',
        'herdr-core heartbeat watchdog expired; closing socket to trigger reconnect',
        {
          heartbeatTimeoutMs: this.heartbeatTimeoutMs
        }
      )
      const currentClient = this.client
      if (currentClient && !currentClient.isClosed) {
        currentClient.close()
      } else {
        this.handleUnexpectedDisconnect(
          new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core heartbeat watchdog expired')
        )
      }
    }, this.heartbeatTimeoutMs)
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private handleUnexpectedDisconnect(error?: Error): void {
    this.clearHeartbeatTimer()
    this.detachEventChannel = null
    const removeClose = this.detachCloseListener
    this.detachCloseListener = null
    removeClose?.()
    const currentClient = this.client
    this.client = null
    if (currentClient && !currentClient.isClosed) {
      currentClient.close()
    }

    const reason = error?.message || 'herdr-core connection lost'
    for (const listener of [...this.disconnectListeners]) {
      listener(reason)
    }

    if (this.disposed || !this.enabled) {
      this.setConnectionState('disconnected', null, 'none')
      return
    }

    this.setConnectionState('reconnecting', reason)
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    if (this.disposed || !this.enabled) return

    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt)
    )
    this.reconnectAttempt += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.disposed || !this.enabled) return
      void this.connect().then((snapshot) => {
        if (this.disposed || !this.enabled) return
        if (snapshot.connection === 'unavailable') {
          // Transient reconnect failure: continue backing off while enabled.
          this.setConnectionState('reconnecting', snapshot.error)
          this.scheduleReconnect()
        }
      })
    }, delay)
  }

  private disconnectInternal(reason: string): void {
    this.clearHeartbeatTimer()
    this.connectEpoch += 1
    const detachEvents = this.detachEventChannel
    this.detachEventChannel = null
    detachEvents?.()
    const removeClose = this.detachCloseListener
    this.detachCloseListener = null
    removeClose?.()

    const currentClient = this.client
    this.client = null
    if (currentClient) {
      currentClient.close()
      for (const listener of [...this.disconnectListeners]) {
        listener(reason)
      }
    }
  }

  private isStaleEpoch(epoch: number): boolean {
    return this.disposed || epoch !== this.connectEpoch
  }

  private setConnectionState(
    nextState: HerdrConnectionState,
    error: string | null,
    ownership?: HerdrOwnership
  ): void {
    this.connection = nextState
    this.error = error
    if (ownership !== undefined) {
      this.ownership = ownership
    }
    this.emitSnapshot()
  }

  private emitUpsert(
    kind: HerdrSessionEventKind,
    address: string,
    session: HerdrSessionView | null
  ): void {
    const payload: HerdrSessionUpsertPayload = {
      revision: this.revision,
      seq: this.seq,
      kind,
      address,
      session
    }
    for (const listener of [...this.upsertListeners]) {
      listener(payload)
    }
  }

  private emitSnapshot(bumpRevision = true): void {
    if (bumpRevision) {
      this.revision += 1
      this.updatedAt = this.now()
    }
    const snapshot = this.getSnapshot()
    for (const listener of [...this.snapshotListeners]) {
      listener(snapshot)
    }
  }
}
