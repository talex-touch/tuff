/**
 * @fileoverview Renderer-side TuffTransport implementation
 * @module @talex-touch/utils/transport/sdk/renderer-transport
 */

import type {
  ITuffTransport,
  SendOptions,
  StreamController,
  StreamOptions,
} from '../types'
import type { TuffEvent } from '../event/types'
import { useChannel } from '../../renderer/hooks/use-channel'
import { assertTuffEvent } from '../event/builder'
import { STREAM_SUFFIXES } from './constants'

type BatchEntry<TRes> = {
  key: string
  payload: unknown
  resolvers: Array<{
    resolve: (value: TRes) => void
    reject: (error: unknown) => void
  }>
}

type BatchQueue<TRes> = {
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
  private handlers = new Map<string, Set<(payload: any) => any>>()
  private streamControllers = new Map<string, StreamController>()
  private batchQueues = new Map<string, BatchQueue<any>>()

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
    const isImmediate = options?.immediate === true

    const batch = event._batch
    if (!isImmediate && batch?.enabled === true) {
      return this.enqueueBatch(eventName, batch, payload)
    }

    try {
      const shouldPassPayload = payload !== undefined
      return await this.channel.send(eventName, shouldPassPayload ? payload : undefined)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`[TuffTransport] Failed to send "${eventName}": ${errorMessage}`)
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
    } else {
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
        } else {
          queue!.latest.payload = payload
          queue!.latest.resolvers.push(entryResolver)
        }
      } else if (queue!.mergeStrategy === 'dedupe') {
        const existing = queue!.dedupe.get(key)
        if (existing) {
          existing.resolvers.push(entryResolver)
        } else {
          queue!.dedupe.set(key, { key, payload, resolvers: [entryResolver] })
        }
      } else {
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
    } catch {
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
      Promise.resolve()
    )
  }

  private async flushEntry<TRes>(eventName: string, entry: BatchEntry<TRes>): Promise<void> {
    try {
      const shouldPassPayload = entry.payload !== undefined
      const result = await this.channel.send(eventName, shouldPassPayload ? entry.payload : undefined)
      for (const { resolve } of entry.resolvers) {
        resolve(result as TRes)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const wrapped = new Error(`[TuffTransport] Failed to send "${eventName}": ${errorMessage}`)
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
    let cleanup: (() => void) | null = null

    // Register stream data handler
    if (this.channel.regChannel) {
      const dataEventName = `${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`
      const endEventName = `${eventName}${STREAM_SUFFIXES.END}:${streamId}`
      const errorEventName = `${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`

      const dataHandler = (raw: unknown) => {
        if (cancelled)
          return

        const data = this.unwrapChannelPayload<{ chunk?: TChunk; error?: string }>(raw)

        if (data?.error) {
          options.onError?.(new Error(data.error))
          return
        }

        if (data?.chunk !== undefined) {
          options.onData(data.chunk)
        }
      }

      const endHandler = () => {
        if (cancelled)
          return
        options.onEnd?.()
        cleanup?.()
      }

      const errorHandler = (raw: unknown) => {
        if (cancelled)
          return
        const data = this.unwrapChannelPayload<{ error: string }>(raw)
        options.onError?.(new Error(data?.error))
        cleanup?.()
      }

      const dataCleanup = this.channel.regChannel(dataEventName, dataHandler)
      const endCleanup = this.channel.regChannel(endEventName, endHandler)
      const errorCleanup = this.channel.regChannel(errorEventName, errorHandler)

      cleanup = () => {
        dataCleanup()
        endCleanup()
        errorCleanup()
        this.streamControllers.delete(streamId)
      }
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
        cleanup?.()
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
  }
}
