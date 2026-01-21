/**
 * @fileoverview Renderer-side TuffTransport implementation
 * @module @talex-touch/utils/transport/sdk/renderer-transport
 */

import type { TuffEvent } from '../event/types'
import type {
  ITuffTransport,
  SendOptions,
  StreamController,
  StreamMessage,
  StreamOptions,
  TransportPortHandle,
  TransportPortOpenOptions,
} from '../types'
import type {
  TransportPortConfirmPayload,
  TransportPortEnvelope,
  TransportPortUpgradeRequest,
  TransportPortUpgradeResponse,
} from '../events'
import { useChannel } from '../../renderer/hooks/use-channel'

type CacheEntry = {
  value: unknown
  expiresAt?: number
}

type CacheConfig = {
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

function resolveInvokeSender(): ((eventName: string, payload?: unknown) => Promise<unknown>) | null {
  if (typeof globalThis === 'undefined') {
    return null
  }

  const electron = (globalThis as any).electron ?? (globalThis as any).window?.electron
  const invoke = electron?.ipcRenderer?.invoke
  if (typeof invoke !== 'function') {
    return null
  }

  return invoke.bind(electron.ipcRenderer)
}
type IpcRendererLike = {
  on?: (channel: string, listener: (event: any, ...args: any[]) => void) => void
  removeListener?: (channel: string, listener: (event: any, ...args: any[]) => void) => void
}

type PortConfirmRecord = {
  port: MessagePort
  payload: TransportPortConfirmPayload
}

const PORT_CONFIRM_TIMEOUT_MS = 10000
const STREAM_PORT_TIMEOUT_MS = 1500

function resolveIpcRenderer(): IpcRendererLike | null {
  if (typeof globalThis === 'undefined') {
    return null
  }

  const electron = (globalThis as any).electron ?? (globalThis as any).window?.electron
  const ipcRenderer = electron?.ipcRenderer
  if (!ipcRenderer) {
    return null
  }

  return ipcRenderer as IpcRendererLike
}
import { assertTuffEvent } from '../event/builder'
import { TransportEvents } from '../events'
import { STREAM_SUFFIXES } from './constants'

interface BatchEntry<TRes> {
  key: string
  payload: unknown
  resolvers: Array<{
    resolve: (value: TRes) => void
    reject: (error: unknown) => void
  }>
}

interface BatchQueue<TRes> {
  timer: ReturnType<typeof setTimeout> | null
  mergeStrategy: 'queue' | 'dedupe' | 'latest'
  windowMs: number
  maxSize: number
  queue: BatchEntry<TRes>[]
  dedupe: Map<string, BatchEntry<TRes>>
  latest: BatchEntry<TRes> | null
}

/**
 * Renderer-side transport implementation.
 * Adapts the legacy TouchChannel to the new TuffTransport interface.
 */
export class TuffRendererTransport implements ITuffTransport {
  private _channel: ReturnType<typeof useChannel> | null = null
  private invokeSender: ((eventName: string, payload?: unknown) => Promise<unknown>) | null = null
  private cache = new Map<string, CacheEntry>()
  private handlers = new Map<string, Set<(payload: any) => any>>()
  private streamControllers = new Map<string, StreamController>()
  private batchQueues = new Map<string, BatchQueue<any>>()
  private portCache = new Map<string, TransportPortHandle>()
  private portHandlesById = new Map<string, TransportPortHandle>()
  private pendingPortConfirms = new Map<string, { resolve: (record: PortConfirmRecord) => void, timeout?: ReturnType<typeof setTimeout> }>()
  private queuedPortConfirms = new Map<string, PortConfirmRecord>()
  private abandonedPorts = new Set<string>()
  private portListenerCleanup: (() => void) | null = null

  /**
   * Get the channel instance, initializing it lazily on first access.
   * This ensures TouchChannel is available when accessed.
   */
  private get channel(): ReturnType<typeof useChannel> {
    if (!this._channel) {
      this._channel = useChannel()
    }
    return this._channel
  }

  private getInvokeSender(): ((eventName: string, payload?: unknown) => Promise<unknown>) | null {
    if (!this.invokeSender) {
      this.invokeSender = resolveInvokeSender()
    }
    return this.invokeSender
  }

  private readCache<T>(cacheKey: string): { hit: boolean, value?: T } {
    const entry = this.cache.get(cacheKey)
    if (!entry) {
      return { hit: false }
    }
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey)
      return { hit: false }
    }
    return { hit: true, value: entry.value as T }
  }

  private writeCache(cacheKey: string, value: unknown, ttlMs?: number): void {
    const expiresAt = typeof ttlMs === 'number' && Number.isFinite(ttlMs)
      ? Date.now() + Math.max(0, ttlMs)
      : undefined
    this.cache.set(cacheKey, { value, expiresAt })
  }

  private async sendRaw<TReq, TRes>(eventName: string, payload?: TReq | void): Promise<TRes> {
    const invoke = this.getInvokeSender()
    if (invoke) {
      if (payload !== undefined) {
        return await invoke(eventName, payload) as TRes
      }
      return await invoke(eventName) as TRes
    }

    const shouldPassPayload = payload !== undefined
    return await this.channel.send(eventName, shouldPassPayload ? payload : undefined)
  }

  private unwrapChannelPayload<T>(data: unknown): T {
    if (!data || typeof data !== 'object')
      return data as T

    const record = data as Record<string, unknown>
    if ('data' in record && 'header' in record)
      return record.data as T

    return data as T
  }

  /**
   * Sends a request and waits for response.
   */
  async send<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
    options?: SendOptions,
  ): Promise<TRes>
  async send<TRes>(
    event: TuffEvent<void, TRes>,
    payload?: void,
    options?: SendOptions,
  ): Promise<TRes>
  async send<TReq, TRes>(
    event: TuffEvent<TReq, TRes> | TuffEvent<void, TRes>,
    payload?: TReq | void,
    options?: SendOptions,
  ): Promise<TRes> {
    assertTuffEvent(event, 'TuffRendererTransport.send')

    const eventName = event.toEventName()
    const cacheConfig = normalizeCacheOptions(options)
    const cacheKey = cacheConfig ? buildCacheKey(eventName, payload, cacheConfig.key) : ''
    if (cacheConfig) {
      const cached = this.readCache<TRes>(cacheKey)
      if (cached.hit) {
        return cached.value as TRes
      }
      if (cacheConfig.mode === 'only') {
        throw new Error(`[TuffTransport] Cache miss for "${eventName}"`)
      }
    }

    const isImmediate = options?.immediate === true || Boolean(cacheConfig)

    const batch = event._batch
    if (!isImmediate && batch?.enabled === true) {
      return this.enqueueBatch(eventName, batch, payload)
    }

    try {
      const shouldPassPayload = payload !== undefined
      const result = await this.sendRaw<TReq, TRes>(eventName, shouldPassPayload ? payload : undefined)
      if (cacheConfig) {
        this.writeCache(cacheKey, result, cacheConfig.ttlMs)
      }
      return result
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`[TuffTransport] Failed to send \"${eventName}\": ${errorMessage}`)
    }
  }

  private enqueueBatch<TReq, TRes>(
    eventName: string,
    batch: NonNullable<TuffEvent<TReq, TRes>['_batch']>,
    payload?: TReq | void,
  ): Promise<TRes> {
    const windowMs = Math.max(0, Number(batch.windowMs ?? 50))
    const maxSize = Math.max(1, Number(batch.maxSize ?? 50))
    const mergeStrategy = (batch.mergeStrategy ?? 'queue') as BatchQueue<TRes>['mergeStrategy']

    let queue = this.batchQueues.get(eventName) as BatchQueue<TRes> | undefined
    if (!queue) {
      queue = {
        timer: null,
        mergeStrategy,
        windowMs,
        maxSize,
        queue: [],
        dedupe: new Map(),
        latest: null,
      }
      this.batchQueues.set(eventName, queue)
    }
    else {
      queue.mergeStrategy = mergeStrategy
      queue.windowMs = windowMs
      queue.maxSize = maxSize
    }

    const key = this.buildBatchKey(payload)

    const promise = new Promise<TRes>((resolve, reject) => {
      const entryResolver = { resolve, reject }

      if (queue!.mergeStrategy === 'latest') {
        if (!queue!.latest) {
          queue!.latest = { key: '__latest__', payload, resolvers: [entryResolver] }
        }
        else {
          queue!.latest.payload = payload
          queue!.latest.resolvers.push(entryResolver)
        }
      }
      else if (queue!.mergeStrategy === 'dedupe') {
        const existing = queue!.dedupe.get(key)
        if (existing) {
          existing.resolvers.push(entryResolver)
        }
        else {
          queue!.dedupe.set(key, { key, payload, resolvers: [entryResolver] })
        }
      }
      else {
        queue!.queue.push({ key, payload, resolvers: [entryResolver] })
      }

      const size = queue!.mergeStrategy === 'latest'
        ? (queue!.latest ? 1 : 0)
        : queue!.mergeStrategy === 'dedupe'
          ? queue!.dedupe.size
          : queue!.queue.length

      if (size >= queue!.maxSize) {
        void this.flushEvent(eventName)
        return
      }

      if (!queue!.timer) {
        queue!.timer = setTimeout(() => {
          queue!.timer = null
          void this.flushEvent(eventName)
        }, queue!.windowMs)
      }
    })

    return promise
  }

  private buildBatchKey(payload: unknown): string {
    if (payload === undefined)
      return '__void__'
    if (payload === null)
      return '__null__'
    if (typeof payload === 'string')
      return `str:${payload}`
    try {
      return `json:${JSON.stringify(payload)}`
    }
    catch {
      return `ref:${Object.prototype.toString.call(payload)}`
    }
  }

  private async flushEvent(eventName: string): Promise<void> {
    const queue = this.batchQueues.get(eventName)
    if (!queue)
      return

    if (queue.timer) {
      clearTimeout(queue.timer)
      queue.timer = null
    }

    this.batchQueues.delete(eventName)

    if (queue.mergeStrategy === 'latest') {
      const entry = queue.latest
      if (!entry)
        return
      await this.flushEntry(eventName, entry)
      return
    }

    if (queue.mergeStrategy === 'dedupe') {
      const entries = Array.from(queue.dedupe.values())
      await Promise.all(entries.map(entry => this.flushEntry(eventName, entry)))
      return
    }

    await queue.queue.reduce<Promise<void>>(
      (promise, entry) => promise.then(() => this.flushEntry(eventName, entry)),
      Promise.resolve(),
    )
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
    console.warn(`[TuffTransport] Port issue for "${channelName}": ${reason}${suffix}`)
  }

  private logPortFallback(channel: string, reason: string, error?: unknown): void {
    const channelName = channel.trim() || 'unknown'
    const detail = this.formatPortErrorMessage(error)
    const suffix = detail ? `: ${detail}` : ''
    console.warn(`[TuffTransport] Port fallback for "${channelName}": ${reason}${suffix}`)
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
      } catch {}
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

  private async waitForPortConfirm(
    portId: string,
    channel: string,
    timeoutMs: number,
  ): Promise<PortConfirmRecord | null> {
    const queued = this.queuedPortConfirms.get(portId)
    if (queued) {
      this.queuedPortConfirms.delete(portId)
      return queued
    }

    if (timeoutMs <= 0) {
      return null
    }

    return await new Promise(resolve => {
      const timeout = setTimeout(() => {
        this.pendingPortConfirms.delete(portId)
        this.abandonedPorts.add(portId)
        void this.send(TransportEvents.port.close, { channel, portId, reason: 'confirm_timeout' }).catch(() => {})
        resolve(null)
      }, timeoutMs)

      this.pendingPortConfirms.set(portId, { resolve, timeout })
    })
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
        } catch {}
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
        this.logPortFallback(channel, 'port_closed')
      }
    }

    const onMessageError = () => {
      this.logPortFallback(channel, 'message_error')
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

  private evictPortHandle(portId: string, channel: string): void {
    this.portHandlesById.delete(portId)
    const cached = this.portCache.get(channel)
    if (cached?.portId === portId) {
      this.portCache.delete(channel)
    }
  }

  private normalizePortStreamMessage<TChunk>(raw: unknown): StreamMessage<TChunk> | null {
    if (!raw || typeof raw !== 'object') {
      return null
    }

    const record = raw as StreamMessage<TChunk> & TransportPortEnvelope<StreamMessage<TChunk>>
    const rawType = (record as { type?: string }).type
    const rawStreamId = (record as { streamId?: string | number }).streamId
    if (!rawType || rawStreamId === undefined || rawStreamId === null) {
      return null
    }

    const streamId = String(rawStreamId)

    if (rawType === 'data') {
      const chunk = (record as { chunk?: TChunk }).chunk ?? (record as { payload?: { chunk?: TChunk } }).payload?.chunk
      return { type: 'data', streamId, chunk }
    }

    if (rawType === 'error') {
      const errorRecord = record as { error?: { message?: string } | string, payload?: { error?: string } }
      const errorMessage = typeof errorRecord.error === 'string'
        ? errorRecord.error
        : errorRecord.error?.message ?? errorRecord.payload?.error
      return { type: 'error', streamId, error: errorMessage }
    }

    if (rawType === 'end' || rawType === 'close') {
      return { type: 'end', streamId }
    }

    return null
  }

  async upgrade(options: TransportPortUpgradeRequest): Promise<TransportPortUpgradeResponse> {
    const channel = options?.channel?.trim()
    if (!channel) {
      return {
        accepted: false,
        channel: '',
        error: { code: 'invalid_request', message: 'Channel is required' },
      }
    }

    return await this.send(TransportEvents.port.upgrade, {
      channel,
      scope: options.scope,
      windowId: options.windowId,
      plugin: options.plugin,
      permissions: options.permissions,
    })
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

      const response = await this.upgrade({
        channel,
        scope: options.scope,
        windowId: options.windowId,
        plugin: options.plugin,
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

  private async flushEntry<TRes>(eventName: string, entry: BatchEntry<TRes>): Promise<void> {
    try {
      const shouldPassPayload = entry.payload !== undefined
      const result = await this.sendRaw(eventName, shouldPassPayload ? entry.payload : undefined)
      for (const { resolve } of entry.resolvers) {
        resolve(result as TRes)
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const wrapped = new Error(`[TuffTransport] Failed to send \"${eventName}\": ${errorMessage}`)
      for (const { reject } of entry.resolvers) {
        reject(wrapped)
      }
    }
  }

  /**
   * Initiates a stream request.
   *
   * @remarks
   * Phase 1 implementation uses IPC events to simulate streaming.
   * Future versions will use MessagePort for true streaming.
   */
  async stream<TReq, TChunk>(
    event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    payload: TReq,
    options: StreamOptions<TChunk>,
  ): Promise<StreamController> {
    assertTuffEvent(event, 'TuffRendererTransport.stream')

    const eventName = event.toEventName()
    const streamId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const streamEventName = `${eventName}${STREAM_SUFFIXES.START}`

    let cancelled = false
    let cleaned = false
    const cleanupCallbacks: Array<() => void> = []
    const cleanup = () => {
      if (cleaned)
        return
      cleaned = true
      cleanupCallbacks.forEach(callback => callback())
      this.streamControllers.delete(streamId)
    }

    const portOptions = options.port === false
      ? null
      : {
          channel: eventName,
          ...options.port,
          timeoutMs: options.port?.timeoutMs ?? STREAM_PORT_TIMEOUT_MS,
        }

    let portHandle: TransportPortHandle | null = null
    let portActive = false

    if (portOptions) {
      try {
        portHandle = await this.openPort(portOptions)
        if (!portHandle) {
          this.logPortFallback(eventName, 'port_unavailable')
        }
      }
      catch (error) {
        this.logPortFallback(eventName, 'open_failed', error)
      }
    }

    const fallbackToChannel = (reason: string) => {
      if (!portHandle)
        return
      if (portActive) {
        portActive = false
      }
      this.logPortFallback(eventName, reason)
      void portHandle.close(reason)
    }

    if (portHandle) {
      const port = portHandle.port

      const portMessageHandler = (event: MessageEvent) => {
        if (cancelled)
          return

        const message = this.normalizePortStreamMessage<TChunk>(event?.data)
        if (!message || message.streamId !== streamId) {
          return
        }

        portActive = true

        if (message.type === 'data' && message.chunk !== undefined) {
          options.onData(message.chunk)
          return
        }

        if (message.type === 'error') {
          options.onError?.(new Error(message.error ?? 'Stream error'))
          cleanup()
          return
        }

        if (message.type === 'end') {
          options.onEnd?.()
          cleanup()
        }
      }

      const portCloseHandler = () => {
        if (cancelled)
          return
        fallbackToChannel('port_closed')
      }

      const portErrorHandler = () => {
        if (cancelled)
          return
        fallbackToChannel('message_error')
      }

      if (typeof port.addEventListener === 'function') {
        port.addEventListener('message', portMessageHandler)
        port.addEventListener('messageerror', portErrorHandler)
        port.addEventListener('close', portCloseHandler)
        port.start?.()
        cleanupCallbacks.push(() => {
          port.removeEventListener('message', portMessageHandler)
          port.removeEventListener('messageerror', portErrorHandler)
          port.removeEventListener('close', portCloseHandler)
        })
      }
      else {
        port.onmessage = portMessageHandler as any
        cleanupCallbacks.push(() => {
          port.onmessage = null
        })
      }

      cleanupCallbacks.push(() => {
        if (portOptions?.force === true) {
          void portHandle?.close('stream_cleanup')
        }
      })
    }

    // Register stream data handler (channel fallback)
    if (this.channel.regChannel) {
      const dataEventName = `${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`
      const endEventName = `${eventName}${STREAM_SUFFIXES.END}:${streamId}`
      const errorEventName = `${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`

      const dataHandler = (raw: unknown) => {
        if (cancelled || portActive)
          return

        const data = this.unwrapChannelPayload<{ chunk?: TChunk, error?: string }>(raw)

        if (data?.error) {
          options.onError?.(new Error(data.error))
          return
        }

        if (data?.chunk !== undefined) {
          options.onData(data.chunk)
        }
      }

      const endHandler = () => {
        if (cancelled || portActive)
          return
        options.onEnd?.()
        cleanup()
      }

      const errorHandler = (raw: unknown) => {
        if (cancelled || portActive)
          return
        const data = this.unwrapChannelPayload<{ error: string }>(raw)
        options.onError?.(new Error(data?.error))
        cleanup()
      }

      const dataCleanup = this.channel.regChannel(dataEventName, dataHandler)
      const endCleanup = this.channel.regChannel(endEventName, endHandler)
      const errorCleanup = this.channel.regChannel(errorEventName, errorHandler)

      cleanupCallbacks.push(() => {
        dataCleanup()
        endCleanup()
        errorCleanup()
      })
    }

    // Create controller
    const controller: StreamController = {
      cancel: () => {
        if (cancelled)
          return
        cancelled = true
        this.channel.send(`${eventName}${STREAM_SUFFIXES.CANCEL}`, { streamId }).catch(() => {
          // Ignore cancel errors
        })
        cleanup()
      },
      get cancelled() {
        return cancelled
      },
      streamId,
    }

    this.streamControllers.set(streamId, controller)

    // Start the stream
    try {
      // Handle void payload (undefined)
      const streamPayload = payload !== undefined
        ? { streamId, ...payload }
        : { streamId }
      await this.channel.send(streamEventName, streamPayload)
    }
    catch (error) {
      controller.cancel()
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `[TuffTransport] Failed to start stream "${eventName}": ${errorMessage}`,
      )
    }

    return controller
  }

  /**
   * Registers an event handler (for receiving messages from main process).
   */
  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq) => TRes | Promise<TRes>,
  ): () => void {
    assertTuffEvent(event, 'TuffRendererTransport.on')

    if (!this.channel.regChannel) {
      throw new Error(
        '[TuffTransport] Channel does not support event registration',
      )
    }

    const eventName = event.toEventName()
    const handlerSet = this.handlers.get(eventName) || new Set()
    handlerSet.add(handler)
    this.handlers.set(eventName, handlerSet)

    // Register with channel
    const cleanup = this.channel.regChannel(eventName, async (data: TReq) => {
      try {
        return await handler(this.unwrapChannelPayload<TReq>(data))
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[TuffTransport] Handler error for "${eventName}":`, errorMessage)
        throw error
      }
    })

    // Return combined cleanup
    return () => {
      handlerSet.delete(handler)
      if (handlerSet.size === 0) {
        this.handlers.delete(eventName)
      }
      cleanup()
    }
  }

  /**
   * Forces immediate flush of all pending batch requests.
   *
   * @remarks
   * Phase 1: No-op. Batching will be implemented in Phase 2.
   */
  async flush(): Promise<void> {
    const eventNames = Array.from(this.batchQueues.keys())
    await Promise.all(eventNames.map(eventName => this.flushEvent(eventName)))
  }

  /**
   * Destroys the transport instance and cleans up resources.
   */
  destroy(): void {
    // Cancel all active streams
    for (const controller of this.streamControllers.values()) {
      controller.cancel()
    }
    this.streamControllers.clear()

    // Clear all handlers
    this.handlers.clear()

    if (this.portListenerCleanup) {
      this.portListenerCleanup()
      this.portListenerCleanup = null
    }

    for (const handle of this.portHandlesById.values()) {
      void handle.close('transport_destroy').catch(() => {})
    }
    this.portHandlesById.clear()
    this.portCache.clear()
    this.pendingPortConfirms.clear()
    this.queuedPortConfirms.clear()
    this.abandonedPorts.clear()
  }
}
