import type { TuffEvent } from '../event/types'
import type {
  TransportPortConfirmPayload,
  TransportPortEnvelope,
  TransportPortUpgradeRequest,
  TransportPortUpgradeResponse,
} from '../events'
import type {
  ITuffTransport,
  SendOptions,
  StreamController,
  StreamOptions,
  TransportPortHandle,
  TransportPortOpenOptions,
} from '../types'
import { assertTuffEvent } from '../event/builder'
import { TransportEvents } from '../events'
import { isPortChannelEnabled } from './port-policy'

interface IpcRendererLike {
  on?: (channel: string, listener: (event: any, ...args: any[]) => void) => void
  removeListener?: (channel: string, listener: (event: any, ...args: any[]) => void) => void
}

interface PortConfirmRecord {
  port: MessagePort
  payload: TransportPortConfirmPayload
}

const PORT_CONFIRM_TIMEOUT_MS = 10000

function resolveIpcRenderer(): IpcRendererLike | null {
  if (typeof globalThis === 'undefined') {
    return null
  }

  const g = globalThis as any
  const electron = g.electron ?? g.window?.electron
  if (electron?.ipcRenderer) {
    return electron.ipcRenderer as IpcRendererLike
  }

  const requireFn = typeof g.require === 'function'
    ? g.require
    : typeof require === 'function'
      ? require
      : null
  if (!requireFn) {
    return null
  }

  try {
    const electronModule = requireFn('electron')
    return electronModule?.ipcRenderer as IpcRendererLike
  }
  catch {
    return null
  }
}

function resolvePluginName(): string | undefined {
  const plugin = (globalThis as any)?.$plugin
  const name = plugin?.name
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : undefined
}

interface CacheEntry {
  value: unknown
  expiresAt?: number
}

interface PortEventSubscription {
  refCount: number
  handle: TransportPortHandle | null
  cleanup: (() => void) | null
  opening: Promise<TransportPortHandle | null> | null
  closing: boolean
}

interface CacheConfig {
  key?: string
  mode: 'prefer' | 'only'
  ttlMs?: number
}

function normalizeCacheOptions(options?: SendOptions): CacheConfig | null {
  if (!options?.cache) {
    return null
  }

  if (options.cache === true) {
    return { mode: 'prefer' }
  }

  const mode = options.cache.mode ?? 'prefer'
  return {
    key: options.cache.key,
    mode,
    ttlMs: options.cache.ttlMs,
  }
}

function buildCacheKey(eventName: string, payload: unknown, overrideKey?: string): string {
  if (overrideKey) {
    return overrideKey
  }

  if (payload === undefined) {
    return `${eventName}:__void__`
  }

  try {
    return `${eventName}:${JSON.stringify(payload)}`
  }
  catch {
    return `${eventName}:${Object.prototype.toString.call(payload)}`
  }
}

interface PluginChannelLike {
  send?: (eventName: string, payload?: any) => Promise<any>
  sendToMain?: (eventName: string, payload?: any) => Promise<any>
  regChannel?: (eventName: string, handler: (data: any) => any) => () => void
  onMain?: (eventName: string, handler: (event: any) => any) => () => void
}

function unwrapPayload<T>(raw: unknown): T {
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    if ('data' in record && 'header' in record) {
      return (record as any).data as T
    }
  }
  return raw as T
}

export class TuffPluginTransport implements ITuffTransport {
  private cache = new Map<string, CacheEntry>()
  private handlers = new Map<string, Set<(payload: any) => any>>()
  private portCache = new Map<string, TransportPortHandle>()
  private portHandlesById = new Map<string, TransportPortHandle>()
  private pendingPortConfirms = new Map<
    string,
    { resolve: (record: PortConfirmRecord) => void, timeout?: NodeJS.Timeout }
  >()

  private queuedPortConfirms = new Map<string, PortConfirmRecord>()
  private abandonedPorts = new Set<string>()
  private portListenerCleanup: (() => void) | null = null
  private portEventSubscriptions = new Map<string, PortEventSubscription>()

  constructor(private readonly channel: PluginChannelLike) {}

  async send<TReq, TRes>(
    event: TuffEvent<TReq, TRes> | TuffEvent<void, TRes>,
    payload?: TReq | void,
    options?: SendOptions,
  ): Promise<TRes> {
    assertTuffEvent(event as any, 'TuffPluginTransport.send')

    const eventName = (event as any).toEventName() as string
    const cacheConfig = normalizeCacheOptions(options)
    const cacheKey = cacheConfig ? buildCacheKey(eventName, payload, cacheConfig.key) : ''
    if (cacheConfig) {
      const entry = this.cache.get(cacheKey)
      if (entry) {
        if (entry.expiresAt === undefined || entry.expiresAt > Date.now()) {
          return entry.value as TRes
        }
        this.cache.delete(cacheKey)
      }
      if (cacheConfig.mode === 'only') {
        throw new Error(`[TuffTransport] Cache miss for \"${eventName}\"`)
      }
    }

    const sender = typeof this.channel.sendToMain === 'function'
      ? this.channel.sendToMain.bind(this.channel)
      : this.channel.send

    if (!sender) {
      throw new Error('[TuffPluginTransport] Channel send function not available')
    }

    const shouldPassPayload = payload !== undefined
    const result = await sender(eventName, shouldPassPayload ? payload : undefined)
    if (cacheConfig) {
      const expiresAt = typeof cacheConfig.ttlMs === 'number' && Number.isFinite(cacheConfig.ttlMs)
        ? Date.now() + Math.max(0, cacheConfig.ttlMs)
        : undefined
      this.cache.set(cacheKey, { value: result, expiresAt })
    }
    return result as TRes
  }

  private formatPortErrorMessage(error?: unknown): string | null {
    if (!error)
      return null
    const raw = error instanceof Error ? error.message : String(error)
    if (!raw)
      return null
    const normalized = raw.replace(/\s+/g, ' ').trim()
    if (!normalized)
      return null
    return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized
  }

  private logPortIssue(channel: string, reason: string, error?: unknown): void {
    const channelName = channel.trim() || 'unknown'
    const detail = this.formatPortErrorMessage(error)
    const suffix = detail ? `: ${detail}` : ''
    console.warn(`[TuffTransport] Port issue for \"${channelName}\": ${reason}${suffix}`)
  }

  private ensurePortListener(): boolean {
    if (this.portListenerCleanup) {
      return true
    }

    const ipcRenderer = resolveIpcRenderer()
    if (!ipcRenderer?.on || !ipcRenderer.removeListener) {
      return false
    }

    const eventName = TransportEvents.port.confirm.toEventName()
    const handler = (event: any, payload: TransportPortConfirmPayload) => {
      this.handlePortConfirm(event, payload)
    }

    ipcRenderer.on(eventName, handler)
    this.portListenerCleanup = () => {
      ipcRenderer.removeListener?.(eventName, handler)
    }

    return true
  }

  private handlePortConfirm(event: any, payload: TransportPortConfirmPayload): void {
    const portId = payload?.portId
    const channel = payload?.channel
    const port = event?.ports?.[0] as MessagePort | undefined
    if (!portId || !channel || !port) {
      this.logPortIssue(channel ?? 'unknown', 'confirm_payload_invalid')
      return
    }

    if (this.abandonedPorts.has(portId)) {
      this.abandonedPorts.delete(portId)
      try {
        port.close()
      }
      catch {}
      void this.send(TransportEvents.port.close, { channel, portId, reason: 'confirm_timeout' }).catch(() => {})
      return
    }

    const record: PortConfirmRecord = { port, payload }
    const pending = this.pendingPortConfirms.get(portId)
    if (pending) {
      this.pendingPortConfirms.delete(portId)
      if (pending.timeout) {
        clearTimeout(pending.timeout)
      }
      pending.resolve(record)
    }
    else {
      this.queuedPortConfirms.set(portId, record)
    }

    void this.send(TransportEvents.port.confirm, payload).catch(() => {})
  }

  private waitForPortConfirm(
    portId: string,
    channel: string,
    timeoutMs: number,
  ): Promise<PortConfirmRecord | null> {
    const queued = this.queuedPortConfirms.get(portId)
    if (queued) {
      this.queuedPortConfirms.delete(portId)
      return Promise.resolve(queued)
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPortConfirms.delete(portId)
        this.abandonedPorts.add(portId)
        this.logPortIssue(channel, 'confirm_timeout')
        resolve(null)
      }, timeoutMs)

      this.pendingPortConfirms.set(portId, { resolve, timeout })
    })
  }

  private evictPortHandle(portId: string, channel?: string): void {
    this.portHandlesById.delete(portId)
    if (channel) {
      const cached = this.portCache.get(channel)
      if (cached?.portId === portId) {
        this.portCache.delete(channel)
      }
    }
  }

  private buildPortHandle(record: PortConfirmRecord, cache: boolean): TransportPortHandle {
    const { port, payload } = record
    const portId = payload.portId
    const channel = payload.channel

    let closing = false

    const handle: TransportPortHandle = {
      portId,
      channel,
      port,
      close: async (reason?: string) => {
        closing = true
        this.evictPortHandle(portId, channel)
        try {
          port.close()
        }
        catch {}
        await this.send(TransportEvents.port.close, {
          channel,
          portId,
          reason,
        }).catch(() => {})
      },
    }

    this.portHandlesById.set(portId, handle)
    if (cache) {
      this.portCache.set(channel, handle)
    }

    const onClose = () => {
      this.evictPortHandle(portId, channel)
      if (!closing) {
        this.logPortIssue(channel, 'port_closed')
      }
    }

    const onMessageError = () => {
      this.logPortIssue(channel, 'message_error')
      this.evictPortHandle(portId, channel)
      void this.send(TransportEvents.port.error, {
        channel,
        portId,
        error: { code: 'message_error', message: 'MessagePort messageerror' },
      }).catch(() => {})
    }

    if (typeof port.addEventListener === 'function') {
      port.addEventListener('close', onClose)
      port.addEventListener('messageerror', onMessageError)
    }
    if (typeof port.start === 'function') {
      port.start()
    }

    return handle
  }

  private normalizePortEventMessage<TReq>(raw: unknown, channel: string): TReq | null {
    if (!raw || typeof raw !== 'object') {
      return null
    }

    const record = raw as TransportPortEnvelope<TReq> & { payload?: TReq }
    if (record.channel && record.channel !== channel) {
      return null
    }

    if (record.type && record.type !== 'data') {
      if (record.type === 'error' && record.error?.message) {
        this.logPortIssue(channel, 'message_error', record.error.message)
      }
      return null
    }

    if (record.payload !== undefined) {
      return record.payload as TReq
    }

    return null
  }

  private dropPortEventSubscription(channel: string): void {
    const subscription = this.portEventSubscriptions.get(channel)
    if (!subscription)
      return
    subscription.cleanup?.()
    subscription.cleanup = null
    subscription.handle = null
    subscription.opening = null
    subscription.closing = true
    this.portEventSubscriptions.delete(channel)
  }

  private ensurePortEventSubscription(channel: string): void {
    if (!isPortChannelEnabled(channel)) {
      return
    }
    const existing = this.portEventSubscriptions.get(channel)
    if (existing) {
      existing.refCount += 1
      return
    }

    const subscription: PortEventSubscription = {
      refCount: 1,
      handle: null,
      cleanup: null,
      opening: null,
      closing: false,
    }

    this.portEventSubscriptions.set(channel, subscription)

    subscription.opening = this.openPort({ channel })
      .then((handle) => {
        if (!handle) {
          this.logPortIssue(channel, 'port_unavailable')
          this.dropPortEventSubscription(channel)
          return null
        }

        if (subscription.closing) {
          void handle.close('subscription_closed')
          this.dropPortEventSubscription(channel)
          return null
        }

        subscription.handle = handle
        const port = handle.port

        const messageHandler = (event: MessageEvent) => {
          const payload = this.normalizePortEventMessage<any>(event?.data, channel)
          if (payload === null)
            return
          const handlers = this.handlers.get(channel)
          if (!handlers || handlers.size === 0)
            return
          handlers.forEach((handler) => {
            Promise.resolve(handler(payload)).catch((error) => {
              const errorMessage = error instanceof Error ? error.message : String(error)
              console.error(`[TuffTransport] Handler error for \"${channel}\":`, errorMessage)
            })
          })
        }

        const closeHandler = () => {
          this.logPortIssue(channel, 'port_closed')
          this.dropPortEventSubscription(channel)
        }

        const errorHandler = () => {
          this.logPortIssue(channel, 'message_error')
          this.dropPortEventSubscription(channel)
        }

        if (typeof port.addEventListener === 'function') {
          port.addEventListener('message', messageHandler)
          port.addEventListener('messageerror', errorHandler)
          port.addEventListener('close', closeHandler)
          port.start?.()
          subscription.cleanup = () => {
            port.removeEventListener('message', messageHandler)
            port.removeEventListener('messageerror', errorHandler)
            port.removeEventListener('close', closeHandler)
          }
        }
        else {
          port.onmessage = messageHandler as any
          subscription.cleanup = () => {
            port.onmessage = null
          }
        }

        return handle
      })
      .catch((error) => {
        this.logPortIssue(channel, 'open_failed', error)
        this.dropPortEventSubscription(channel)
        return null
      })
  }

  private releasePortEventSubscription(channel: string): void {
    const subscription = this.portEventSubscriptions.get(channel)
    if (!subscription)
      return
    subscription.refCount -= 1
    if (subscription.refCount > 0)
      return

    subscription.closing = true
    subscription.cleanup?.()
    subscription.cleanup = null
    if (subscription.handle) {
      void subscription.handle.close('no_handlers')
    }
    this.portEventSubscriptions.delete(channel)
  }

  async upgrade(options: TransportPortUpgradeRequest): Promise<TransportPortUpgradeResponse> {
    return await this.send(TransportEvents.port.upgrade, options)
  }

  async openPort(options: TransportPortOpenOptions): Promise<TransportPortHandle | null> {
    const channel = options?.channel?.trim()
    if (!channel) {
      this.logPortIssue('unknown', 'missing_channel')
      return null
    }

    try {
      const useCache = options.force !== true
      if (useCache) {
        const cached = this.portCache.get(channel)
        if (cached) {
          return cached
        }
      }

      if (!this.ensurePortListener()) {
        this.logPortIssue(channel, 'ipc_unavailable')
        return null
      }

      const pluginName = options.plugin ?? resolvePluginName()
      const scope = options.scope ?? (pluginName ? 'plugin' : 'window')
      if (scope === 'plugin' && !pluginName) {
        this.logPortIssue(channel, 'plugin_required')
        return null
      }

      const response = await this.upgrade({
        channel,
        scope,
        windowId: options.windowId,
        plugin: scope === 'plugin' ? pluginName : options.plugin,
        permissions: options.permissions,
      })

      if (!response.accepted || !response.portId) {
        if (response.error) {
          const reason = response.error.code ? `upgrade_rejected:${response.error.code}` : 'upgrade_rejected'
          this.logPortIssue(channel, reason, response.error.message)
        }
        else {
          this.logPortIssue(channel, 'upgrade_rejected')
        }
        return null
      }

      const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
        ? Math.max(0, options.timeoutMs)
        : PORT_CONFIRM_TIMEOUT_MS
      const record = await this.waitForPortConfirm(response.portId, channel, timeoutMs)
      if (!record) {
        this.logPortIssue(channel, 'confirm_timeout')
        return null
      }

      return this.buildPortHandle(record, useCache)
    }
    catch (error) {
      this.logPortIssue(channel, 'open_failed', error)
      return null
    }
  }

  stream<TReq, TChunk>(
    _event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    _payload: TReq,
    _options: StreamOptions<TChunk>,
  ): Promise<StreamController> {
    throw new Error('[TuffPluginTransport] Stream is not supported in plugin transport')
  }

  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq) => TRes | Promise<TRes>,
  ): () => void {
    assertTuffEvent(event, 'TuffPluginTransport.on')

    const eventName = event.toEventName()
    const handlerSet = this.handlers.get(eventName) || new Set()
    const isFirstHandler = handlerSet.size === 0
    handlerSet.add(handler)
    this.handlers.set(eventName, handlerSet)
    if (isFirstHandler) {
      this.ensurePortEventSubscription(eventName)
    }

    let cleanupChannel: (() => void) | null = null
    if (typeof this.channel.onMain === 'function') {
      cleanupChannel = this.channel.onMain(eventName, raw => handler(unwrapPayload<TReq>(raw)))
    }
    else if (typeof this.channel.regChannel === 'function') {
      cleanupChannel = this.channel.regChannel(eventName, raw => handler(unwrapPayload<TReq>(raw)))
    }
    else {
      throw new TypeError('[TuffPluginTransport] Channel on function not available')
    }

    return () => {
      handlerSet.delete(handler)
      if (handlerSet.size === 0) {
        this.handlers.delete(eventName)
        this.releasePortEventSubscription(eventName)
      }
      cleanupChannel?.()
    }
  }

  async flush(): Promise<void> {

  }

  destroy(): void {
    this.handlers.clear()

    if (this.portListenerCleanup) {
      this.portListenerCleanup()
      this.portListenerCleanup = null
    }

    for (const subscription of this.portEventSubscriptions.values()) {
      subscription.cleanup?.()
      subscription.cleanup = null
      if (subscription.handle) {
        void subscription.handle.close('transport_destroy').catch(() => {})
      }
    }
    this.portEventSubscriptions.clear()

    for (const handle of this.portHandlesById.values()) {
      void handle.close('transport_destroy').catch(() => {})
    }
    this.portHandlesById.clear()
    this.portCache.clear()
    this.pendingPortConfirms.clear()
    this.queuedPortConfirms.clear()
    this.abandonedPorts.clear()
    this.cache.clear()
  }
}

export function createPluginTuffTransport(channel: PluginChannelLike): ITuffTransport {
  return new TuffPluginTransport(channel)
}
