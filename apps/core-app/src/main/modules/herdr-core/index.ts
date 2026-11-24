import type { AppSetting, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { PluginKeyManager, TuffEvent } from '@talex-touch/utils/transport'
import type {
  HerdrEnsureStartedRequest,
  HerdrProjectedConversation,
  HerdrProjectionGetRequest,
  HerdrProjectionUnwatchRequest,
  HerdrProjectionWatchRequest,
  HerdrRuntimeSnapshot,
  HerdrSessionUpsertPayload,
  HerdrStreamAttachRequest,
  HerdrStreamAttachResult,
  HerdrStreamCloseReason,
  HerdrStreamIoRequest,
  HerdrTerminalControlRequest,
  HerdrTerminalKeysRequest,
  HerdrTerminalPutRequest,
  HerdrTerminalReadRequest,
  HerdrTerminalRunRequest,
  HerdrTerminalSendRequest
} from '@talex-touch/utils/transport/events/herdr'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { WebContents } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { PtyOwnerWatch } from '../terminal/pty-session-core'
import type { DefaultHerdrAcpCapabilityBridgeOptions } from './acp-capability-bridge'
import type { HerdrAttachedStream } from './runtime-plane'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { StorageList } from '@talex-touch/utils'
import { normalizeHerdrCoreSettings } from '@talex-touch/utils/common/storage/entity/app-settings'
import { HerdrEvents } from '@talex-touch/utils/transport/events/herdr'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { isBetaFeatureEnabled } from '../../../shared/beta-features'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { getMainConfig, subscribeMainConfig } from '../storage'
import { watchPtyOwner } from '../terminal/pty-session-core'
import { DefaultHerdrAcpCapabilityBridge } from './acp-capability-bridge'
import { HerdrNativeSessionProjector } from './content-projector'
import {
  getRegisteredHerdrRuntimePlane,
  HerdrRuntimePlane,
  registerHerdrRuntimePlane
} from './runtime-plane'
import { HerdrRuntimeStore } from './runtime-store'

export * from './acp-capability-bridge'
export * from './binary-manager'
export * from './content-projector'
export * from './frame-codec'
export * from './framed-client'
export * from './runtime-plane'
export * from './runtime-store'
export * from './socket-discovery'

const herdrLog = createLogger('HerdrCore')

interface OwnedHerdrStream {
  readonly streamId: string
  readonly terminal: string
  readonly sender: WebContents
  readonly senderId: number
  readonly handle: HerdrAttachedStream
  readonly decoder: StringDecoder
  readonly watcher: PtyOwnerWatch
  readonly disposeAbort: () => void
  closed: boolean
}

interface ProjectionOwnerState {
  readonly ownerId: string
  readonly sender: WebContents
  readonly watcher: PtyOwnerWatch
  readonly addresses: Set<string>
  readonly disposeAbort: () => void
}

function assertHostCaller(context: HandlerContext, keyManager?: PluginKeyManager): WebContents {
  if (!context || context.plugin) {
    throw new Error('HERDR_CALLER_FORBIDDEN')
  }
  const sender = context.sender as WebContents | undefined
  if (
    !sender ||
    typeof sender.id !== 'number' ||
    typeof sender.isDestroyed !== 'function' ||
    sender.isDestroyed()
  ) {
    throw new Error('HERDR_CALLER_FORBIDDEN')
  }
  if (keyManager?.resolveSenderIdentity?.(sender)) {
    throw new Error('HERDR_CALLER_FORBIDDEN')
  }
  return sender
}

function validateTerminalDimension(value: number, label: 'cols' | 'rows'): number {
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error(`HERDR_STREAM_${label.toUpperCase()}_INVALID`)
  }
  return value
}

function mapCloseReason(
  rawReason: string | undefined,
  sessionState: 'live' | 'finished' | null,
  sessionReason: string | null
): HerdrStreamCloseReason | (string & {}) {
  if (rawReason === 'core-disconnected') return 'core-disconnected'
  if (rawReason === 'detached') return 'detached'
  if (rawReason === 'restarted') return 'restarted'
  if (sessionState === 'finished') return 'exited'
  if (rawReason && rawReason.includes('lost')) return 'lost'
  if (sessionReason === 'holder_lost' || sessionReason === 'signaled') return 'lost'
  return rawReason || 'detached'
}

export interface HerdrCoreModuleDeps {
  store?: HerdrRuntimeStore
  plane?: HerdrRuntimePlane
  projector?: HerdrNativeSessionProjector
  readAppSettings?: () => Partial<AppSetting> | null
  subscribeAppSettings?: (listener: (settings: Partial<AppSetting>) => void) => () => void
  autoConnectOnInit?: boolean
}

export class HerdrCoreModule extends BaseModule {
  static key = Symbol.for('herdr-core')
  name: ModuleKey = HerdrCoreModule.key

  readonly store: HerdrRuntimeStore
  readonly plane: HerdrRuntimePlane
  readonly projector: HerdrNativeSessionProjector

  private readonly readAppSettings: () => Partial<AppSetting> | null
  private readonly subscribeAppSettings: (
    listener: (settings: Partial<AppSetting>) => void
  ) => () => void
  private readonly autoConnectOnInit: boolean

  private transport: ITuffTransportMain | null = null
  private lifecycle = new AbortController()
  private readonly disposers: Array<() => void> = []
  private readonly streams = new Map<string, OwnedHerdrStream>()
  private readonly projectionOwners = new Map<WebContents, ProjectionOwnerState>()

  constructor(deps: HerdrCoreModuleDeps = {}) {
    super(HerdrCoreModule.key, { create: false })
    this.store =
      deps.store ??
      new HerdrRuntimeStore({
        onLog: (level, message, meta) => {
          herdrLog[level](message, meta ? { meta } : undefined)
        }
      })
    this.plane = deps.plane ?? new HerdrRuntimePlane(this.store)
    this.projector =
      deps.projector ??
      new HerdrNativeSessionProjector({
        getSession: (address) => this.store.getSession(address)
      })
    this.plane.registerContentProjector(this.projector)
    registerHerdrRuntimePlane(this.plane)
    this.readAppSettings =
      deps.readAppSettings ??
      (() => {
        try {
          return getMainConfig(StorageList.APP_SETTING)
        } catch {
          return null
        }
      })
    this.subscribeAppSettings =
      deps.subscribeAppSettings ??
      ((listener) => {
        try {
          return subscribeMainConfig(StorageList.APP_SETTING, (data) => {
            listener(data as Partial<AppSetting>)
          })
        } catch {
          return () => undefined
        }
      })
    this.autoConnectOnInit = deps.autoConnectOnInit ?? true
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'HerdrCoreModule.onInit')
    const channel = runtime.app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)
    this.transport = transport
    this.lifecycle = new AbortController()

    const initialSettings = this.readAppSettings()
    if (initialSettings) {
      this.applyAppSettings(initialSettings, false)
    }

    this.disposers.push(
      this.subscribeAppSettings((settings) => {
        this.applyAppSettings(settings, true)
      })
    )

    this.disposers.push(
      this.store.onSnapshotChanged((snapshot) => {
        this.broadcastHost(HerdrEvents.push.snapshotChanged, snapshot)
      }),
      this.store.onSessionUpsert((payload) => {
        this.broadcastHost(HerdrEvents.push.sessionUpsert, payload)
      })
    )

    const register = <TReq, TRes>(
      event: TuffEvent<TReq, TRes>,
      handler: (payload: TReq, sender: WebContents) => TRes | Promise<TRes>
    ): void => {
      this.disposers.push(
        transport.on(event, (payload, context) => {
          const sender = assertHostCaller(context, transport.keyManager)
          return handler(payload, sender)
        })
      )
    }

    register(HerdrEvents.runtime.getSnapshot, () => this.plane.getSnapshot())
    register(HerdrEvents.runtime.ensureStarted, (payload: HerdrEnsureStartedRequest | void) =>
      this.plane.ensureStarted(payload ?? undefined)
    )
    register(HerdrEvents.runtime.reconnect, () => this.plane.reconnect())

    register(HerdrEvents.terminal.run, (payload: HerdrTerminalRunRequest) =>
      this.plane.terminals.run(payload)
    )
    register(HerdrEvents.terminal.send, (payload: HerdrTerminalSendRequest) =>
      this.plane.terminals.send(payload)
    )
    register(HerdrEvents.terminal.keys, (payload: HerdrTerminalKeysRequest) =>
      this.plane.terminals.keys(payload)
    )
    register(HerdrEvents.terminal.control, (payload: HerdrTerminalControlRequest) =>
      this.plane.terminals.control(payload)
    )
    register(HerdrEvents.terminal.read, (payload: HerdrTerminalReadRequest) =>
      this.plane.terminals.read(payload)
    )
    register(HerdrEvents.terminal.put, (payload: HerdrTerminalPutRequest) =>
      this.plane.terminals.put(payload)
    )

    register(HerdrEvents.stream.attach, (payload: HerdrStreamAttachRequest, sender) =>
      this.handleStreamAttach(payload, sender)
    )
    register(HerdrEvents.stream.io, (payload: HerdrStreamIoRequest, sender) =>
      this.handleStreamIo(payload, sender)
    )

    register(HerdrEvents.projection.get, (payload: HerdrProjectionGetRequest) =>
      this.handleProjectionGet(payload)
    )
    register(HerdrEvents.projection.watch, (payload: HerdrProjectionWatchRequest, sender) =>
      this.handleProjectionWatch(payload, sender)
    )
    register(HerdrEvents.projection.unwatch, (payload: HerdrProjectionUnwatchRequest, sender) =>
      this.handleProjectionUnwatch(payload, sender)
    )

    // Non-blocking async connect: NEVER delay Electron startup waiting on socket/bootstrap.
    if (this.autoConnectOnInit) {
      queueMicrotask(() => {
        if (this.lifecycle.signal.aborted) return
        void this.store.connect().catch((error) => {
          herdrLog.warn('Async herdr-core initial connect failed', {
            meta: { message: error instanceof Error ? error.message : String(error) }
          })
        })
      })
    }
  }

  async onDestroy(): Promise<void> {
    this.lifecycle.abort()

    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        // Ignore teardown disposal errors.
      }
    }

    // Detach all active streams via CLOSE frames ONLY — NEVER call terminal.kill or server.stop.
    for (const streamId of [...this.streams.keys()]) {
      this.detachOwnedStream(streamId, 'detached', false)
    }

    for (const sender of [...this.projectionOwners.keys()]) {
      this.releaseProjectionOwner(sender)
    }

    this.plane.dispose()
    this.store.dispose()
    if (getRegisteredHerdrRuntimePlane() === this.plane) {
      registerHerdrRuntimePlane(null)
    }
    this.transport = null
  }

  /**
   * Creates a run-scoped ACP capability bridge backed by `HerdrRuntimePlane`.
   * Returns `null` when `herdrRuntime` is disabled or `herdr-core` is not connected.
   */
  createAcpCapabilityBridge(
    options: Omit<DefaultHerdrAcpCapabilityBridgeOptions, 'plane'> = {}
  ): DefaultHerdrAcpCapabilityBridge | null {
    const snapshot = this.plane.getSnapshot()
    if (!snapshot.enabled || snapshot.connection !== 'connected') {
      return null
    }
    return new DefaultHerdrAcpCapabilityBridge({
      ...options,
      plane: this.plane
    })
  }

  private applyAppSettings(settings: Partial<AppSetting>, autoReconnect: boolean): void {
    const enabled = isBetaFeatureEnabled(settings, 'herdrRuntime')
    const herdrCore = normalizeHerdrCoreSettings(settings.herdrCore)
    this.store.updateConfig(enabled, herdrCore, { autoReconnect })
  }

  private broadcastHost<T>(event: TuffEvent<T, void>, payload: T): void {
    const transport = this.transport
    if (!transport) return
    try {
      transport.broadcast(event, payload)
    } catch {
      herdrLog.debug('Herdr host broadcast skipped', {
        meta: { eventName: event.toEventName() }
      })
    }
  }

  private notifyOwner<T>(sender: WebContents, event: TuffEvent<T, void>, payload: T): void {
    const transport = this.transport
    if (!transport || sender.isDestroyed()) return
    try {
      transport.notifyTo(sender, event, payload)
    } catch {
      herdrLog.debug('Herdr owner stream notification dropped', {
        meta: { eventName: event.toEventName(), senderId: sender.id }
      })
    }
  }

  private async handleStreamAttach(
    payload: HerdrStreamAttachRequest,
    sender: WebContents
  ): Promise<HerdrStreamAttachResult> {
    if (!payload || typeof payload !== 'object' || typeof payload.terminal !== 'string') {
      throw new Error('HERDR_STREAM_ATTACH_INVALID')
    }
    const terminalAddress = payload.terminal.trim()
    if (!terminalAddress) {
      throw new Error('HERDR_STREAM_ATTACH_INVALID')
    }
    const cols = validateTerminalDimension(payload.cols, 'cols')
    const rows = validateTerminalDimension(payload.rows, 'rows')

    const watcher = watchPtyOwner(sender, this.lifecycle.signal)
    const streamId = randomUUID()
    const decoder = new StringDecoder('utf8')

    let record: OwnedHerdrStream | null = null
    let closedEarly = false

    try {
      const handle = await this.plane.terminals.attach(
        {
          ...payload,
          terminal: terminalAddress,
          cols,
          rows
        },
        {
          onData: (chunk) => {
            if (watcher.signal.aborted || closedEarly || record?.closed) return
            const text = decoder.write(chunk)
            this.notifyOwner(sender, HerdrEvents.push.streamData, {
              streamId,
              data: text,
              bytes: chunk.length
            })
          },
          onResize: (size) => {
            if (watcher.signal.aborted || closedEarly || record?.closed) return
            this.notifyOwner(sender, HerdrEvents.push.streamData, {
              streamId,
              data: '',
              bytes: 0,
              resize: size
            })
          },
          onClose: (rawReason) => {
            const current = this.streams.get(streamId)
            if (closedEarly || (current && current.closed)) return
            if (current) {
              current.closed = true
              this.streams.delete(streamId)
              current.disposeAbort()
              current.watcher.dispose()
            } else {
              closedEarly = true
              watcher.dispose()
            }

            const trailing = decoder.end()
            if (trailing && !watcher.signal.aborted) {
              this.notifyOwner(sender, HerdrEvents.push.streamData, {
                streamId,
                data: trailing,
                bytes: 0
              })
            }

            if (!watcher.signal.aborted) {
              const session = this.store.getSession(terminalAddress)
              const mappedReason = mapCloseReason(
                rawReason,
                session?.state ?? null,
                session?.reason ?? null
              )
              this.notifyOwner(sender, HerdrEvents.push.streamClosed, {
                streamId,
                terminal: terminalAddress,
                reason: mappedReason,
                ...(session ? { exitCode: session.exitCode, signal: session.signal } : {})
              })
            }
          }
        }
      )

      if (watcher.signal.aborted) {
        // Owner navigated/destroyed during async attach: send CLOSE detach ONLY.
        if (!closedEarly) {
          handle.detach()
        }
        watcher.dispose()
        throw new Error('HERDR_STREAM_ATTACH_CANCELLED')
      }

      if (closedEarly) {
        // Server already closed the channel via an early CLOSE frame during attach;
        // do not leak a dead record into `this.streams` or rebind the disposed watcher.
        return {
          streamId,
          terminal: handle.terminal,
          automaticInput: handle.automaticInput,
          resizeNotifications: handle.resizeNotifications
        }
      }

      const onOwnerAborted = (): void => {
        // WebContents destroyed/navigated: detach via CLOSE frame ONLY, NEVER terminal.kill!
        this.detachOwnedStream(streamId, 'detached', false)
      }
      watcher.signal.addEventListener('abort', onOwnerAborted, { once: true })

      record = {
        streamId,
        terminal: handle.terminal.address || terminalAddress,
        sender,
        senderId: sender.id,
        handle,
        decoder,
        watcher,
        disposeAbort: () => watcher.signal.removeEventListener('abort', onOwnerAborted),
        closed: false
      }
      this.streams.set(streamId, record)

      return {
        streamId,
        terminal: handle.terminal,
        automaticInput: handle.automaticInput,
        resizeNotifications: handle.resizeNotifications
      }
    } catch (error) {
      watcher.dispose()
      throw error
    }
  }

  private handleStreamIo(payload: HerdrStreamIoRequest, sender: WebContents): void {
    if (!payload || typeof payload !== 'object' || typeof payload.streamId !== 'string') {
      throw new Error('HERDR_STREAM_NOT_FOUND')
    }
    const record = this.streams.get(payload.streamId)
    if (!record || record.closed || record.sender !== sender || record.senderId !== sender.id) {
      throw new Error('HERDR_STREAM_NOT_FOUND')
    }

    switch (payload.op) {
      case 'write':
        record.handle.write(payload.data)
        return
      case 'auto-input':
        record.handle.sendAutoInput(payload.data)
        return
      case 'resize':
        record.handle.resize(
          validateTerminalDimension(payload.cols, 'cols'),
          validateTerminalDimension(payload.rows, 'rows')
        )
        return
      case 'focus':
        record.handle.focus(Boolean(payload.focused))
        return
      case 'ack':
        if (typeof payload.bytes === 'number' && payload.bytes > 0) {
          record.handle.ack(payload.bytes)
        }
        return
      case 'detach':
        this.detachOwnedStream(record.streamId, 'detached', false)
        return
      default:
        throw new Error('HERDR_STREAM_IO_INVALID')
    }
  }

  private handleProjectionGet(
    payload: HerdrProjectionGetRequest
  ): Promise<HerdrProjectedConversation> {
    if (!payload || typeof payload !== 'object' || typeof payload.address !== 'string') {
      throw new Error('HERDR_PROJECTION_ADDRESS_INVALID')
    }
    const address = payload.address.trim()
    if (!address) {
      throw new Error('HERDR_PROJECTION_ADDRESS_INVALID')
    }
    return this.projector.projectAddress(address, payload.limit)
  }

  private async handleProjectionWatch(
    payload: HerdrProjectionWatchRequest,
    sender: WebContents
  ): Promise<HerdrProjectedConversation> {
    if (!payload || typeof payload !== 'object' || typeof payload.address !== 'string') {
      throw new Error('HERDR_PROJECTION_ADDRESS_INVALID')
    }
    const address = payload.address.trim()
    if (!address) {
      throw new Error('HERDR_PROJECTION_ADDRESS_INVALID')
    }

    let owner = this.projectionOwners.get(sender)
    if (!owner) {
      const ownerId = `proj-owner-${randomUUID()}`
      const watcher = watchPtyOwner(sender, this.lifecycle.signal)
      const onOwnerAborted = (): void => {
        this.releaseProjectionOwner(sender)
      }
      watcher.signal.addEventListener('abort', onOwnerAborted, { once: true })
      owner = {
        ownerId,
        sender,
        watcher,
        addresses: new Set<string>(),
        disposeAbort: () => watcher.signal.removeEventListener('abort', onOwnerAborted)
      }
      this.projectionOwners.set(sender, owner)
    }

    owner.addresses.add(address)
    const ownerRef = owner
    const initial = await this.projector.watch(address, ownerRef.ownerId, {
      limit: payload.limit,
      onUpdate: (conversation) => {
        if (ownerRef.watcher.signal.aborted || !ownerRef.addresses.has(address)) return
        this.notifyOwner(sender, HerdrEvents.push.projectionUpdated, conversation)
      }
    })

    if (ownerRef.watcher.signal.aborted || !ownerRef.addresses.has(address)) {
      this.projector.unwatch(address, ownerRef.ownerId)
    }

    return initial
  }

  private handleProjectionUnwatch(
    payload: HerdrProjectionUnwatchRequest,
    sender: WebContents
  ): void {
    if (!payload || typeof payload !== 'object' || typeof payload.address !== 'string') {
      return
    }
    const address = payload.address.trim()
    if (!address) return
    const owner = this.projectionOwners.get(sender)
    if (!owner) return
    owner.addresses.delete(address)
    this.projector.unwatch(address, owner.ownerId)
    if (owner.addresses.size === 0) {
      this.releaseProjectionOwner(sender)
    }
  }

  private releaseProjectionOwner(sender: WebContents): void {
    const owner = this.projectionOwners.get(sender)
    if (!owner) return
    this.projectionOwners.delete(sender)
    owner.addresses.clear()
    owner.disposeAbort()
    owner.watcher.dispose()
    this.projector.unwatchOwner(owner.ownerId)
  }

  private detachOwnedStream(
    streamId: string,
    reason: HerdrStreamCloseReason,
    notifyOwner: boolean
  ): void {
    const record = this.streams.get(streamId)
    if (!record || record.closed) return
    record.closed = true
    this.streams.delete(streamId)
    record.disposeAbort()
    record.watcher.dispose()

    // Sends CLOSE frame ONLY — never kills the underlying herdr-core terminal process.
    record.handle.detach()

    if (notifyOwner && !record.sender.isDestroyed()) {
      this.notifyOwner(record.sender, HerdrEvents.push.streamClosed, {
        streamId: record.streamId,
        terminal: record.terminal,
        reason
      })
    }
  }
}

export const herdrCoreModule = new HerdrCoreModule()

export function getHerdrRuntimePlane(): HerdrRuntimePlane {
  return herdrCoreModule.plane
}

export function getHerdrRuntimeSnapshot(): HerdrRuntimeSnapshot {
  return herdrCoreModule.plane.getSnapshot()
}

export function createHerdrAcpCapabilityBridge(
  options?: Omit<DefaultHerdrAcpCapabilityBridgeOptions, 'plane'>
): DefaultHerdrAcpCapabilityBridge | null {
  return herdrCoreModule.createAcpCapabilityBridge(options)
}

export type { HerdrRuntimeSnapshot, HerdrSessionUpsertPayload }
