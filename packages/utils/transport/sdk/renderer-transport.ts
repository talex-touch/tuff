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
import { useChannel, tryUseChannel } from '../../renderer/hooks/use-channel'
import { assertTuffEvent } from '../event/builder'
import { DEFAULT_TIMEOUT, STREAM_SUFFIXES } from './constants'

/**
 * Renderer-side transport implementation.
 * Adapts the legacy TouchChannel to the new TuffTransport interface.
 */
export class TuffRendererTransport implements ITuffTransport {
  private _channel: ReturnType<typeof useChannel> | null = null
  private handlers = new Map<string, Set<(payload: any) => any>>()
  private streamControllers = new Map<string, StreamController>()

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
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT

    // If immediate flag is set, skip batching (future implementation)
    // For now, all requests go through the channel directly
    try {
      // If payload is undefined and event expects void, don't pass payload
      const shouldPassPayload = payload !== undefined
      return await this.channel.send(eventName, shouldPassPayload ? payload : undefined)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `[TuffTransport] Failed to send "${eventName}": ${errorMessage}`,
      )
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

      const dataHandler = (data: { chunk?: TChunk; error?: string }) => {
        if (cancelled)
          return

        if (data.error) {
          options.onError?.(new Error(data.error))
          return
        }

        if (data.chunk !== undefined) {
          options.onData(data.chunk)
        }
      }

      const endHandler = () => {
        if (cancelled)
          return
        options.onEnd?.()
        cleanup?.()
      }

      const errorHandler = (data: { error: string }) => {
        if (cancelled)
          return
        options.onError?.(new Error(data.error))
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
        return await handler(data)
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
    // Phase 1: No batching implementation yet
    return Promise.resolve()
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

