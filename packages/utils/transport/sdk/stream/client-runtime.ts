import type { StreamController, StreamOptions, TransportPortHandle, TransportPortOpenOptions } from '../../types'
import { isPortChannelEnabled } from '../port-policy'
import {
  buildStreamStartPayload,
  createStreamId,
  getStreamEventNames,
  normalizePortStreamMessage,
  toStreamError,
  unwrapChannelPayload,
} from './protocol'

const DEFAULT_STREAM_PORT_TIMEOUT_MS = 1500

export interface ClientStreamRuntimeAdapter {
  streamControllers: Map<string, StreamController>
  send: (eventName: string, payload?: unknown) => Promise<unknown>
  registerChannel: (eventName: string, handler: (raw: unknown) => void) => (() => void)
  openPort?: (options: TransportPortOpenOptions) => Promise<TransportPortHandle | null>
  logPortFallback?: (channel: string, reason: string, error?: unknown) => void
  streamPortTimeoutMs?: number
}

export async function startClientStream<TReq, TChunk>(
  adapter: ClientStreamRuntimeAdapter,
  eventName: string,
  payload: TReq,
  options: StreamOptions<TChunk>,
): Promise<StreamController> {
  const streamId = createStreamId()
  const streamEvents = getStreamEventNames(eventName)

  let cancelled = false
  let cleaned = false
  let portHandle: TransportPortHandle | null = null
  let portActive = false

  const cleanupCallbacks: Array<() => void> = []
  const cleanup = () => {
    if (cleaned) {
      return
    }
    cleaned = true
    cleanupCallbacks.forEach(callback => callback())
    adapter.streamControllers.delete(streamId)
  }

  const fallbackToChannel = (reason: string, error?: unknown) => {
    if (!portHandle) {
      return
    }
    if (portActive) {
      portActive = false
    }
    adapter.logPortFallback?.(eventName, reason, error)
    void portHandle.close(reason)
  }

  const openPort = adapter.openPort
  const portOptions = openPort && options.port !== false && isPortChannelEnabled(eventName)
    ? {
        channel: eventName,
        ...options.port,
        timeoutMs: options.port?.timeoutMs ?? adapter.streamPortTimeoutMs ?? DEFAULT_STREAM_PORT_TIMEOUT_MS,
      }
    : null

  if (portOptions && openPort) {
    try {
      portHandle = await openPort(portOptions)
      if (!portHandle) {
        adapter.logPortFallback?.(eventName, 'port_unavailable')
      }
    }
    catch (error) {
      adapter.logPortFallback?.(eventName, 'open_failed', error)
    }
  }

  if (portHandle) {
    const port = portHandle.port

    const portMessageHandler = (event: MessageEvent) => {
      if (cancelled) {
        return
      }

      const message = normalizePortStreamMessage<TChunk>(event?.data)
      if (!message || message.streamId !== streamId) {
        return
      }

      portActive = true

      if (message.type === 'data' && message.chunk !== undefined) {
        options.onData(message.chunk)
        return
      }

      if (message.type === 'error') {
        options.onError?.(toStreamError(message.error))
        cleanup()
        return
      }

      if (message.type === 'end') {
        options.onEnd?.()
        cleanup()
      }
    }

    const portCloseHandler = () => {
      if (cancelled) {
        return
      }
      fallbackToChannel('port_closed')
    }

    const portErrorHandler = () => {
      if (cancelled) {
        return
      }
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

  const dataCleanup = adapter.registerChannel(streamEvents.data(streamId), (raw) => {
    if (cancelled || portActive) {
      return
    }

    const data = unwrapChannelPayload<{ chunk?: TChunk, error?: string }>(raw)
    if (data?.error) {
      options.onError?.(new Error(data.error))
      return
    }

    if (data?.chunk !== undefined) {
      options.onData(data.chunk)
    }
  })

  const endCleanup = adapter.registerChannel(streamEvents.end(streamId), () => {
    if (cancelled || portActive) {
      return
    }
    options.onEnd?.()
    cleanup()
  })

  const errorCleanup = adapter.registerChannel(streamEvents.error(streamId), (raw) => {
    if (cancelled || portActive) {
      return
    }
    const data = unwrapChannelPayload<{ error?: string }>(raw)
    options.onError?.(new Error(data?.error ?? 'Stream error'))
    cleanup()
  })

  cleanupCallbacks.push(() => {
    dataCleanup()
    endCleanup()
    errorCleanup()
  })

  const controller: StreamController = {
    cancel: () => {
      if (cancelled) {
        return
      }
      cancelled = true
      adapter.send(streamEvents.cancel, { streamId }).catch(() => {})
      cleanup()
    },
    get cancelled() {
      return cancelled
    },
    streamId,
  }

  adapter.streamControllers.set(streamId, controller)

  try {
    await adapter.send(streamEvents.start, buildStreamStartPayload(payload, streamId))
  }
  catch (error) {
    controller.cancel()
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`[TuffTransport] Failed to start stream "${eventName}": ${errorMessage}`)
  }

  return controller
}
