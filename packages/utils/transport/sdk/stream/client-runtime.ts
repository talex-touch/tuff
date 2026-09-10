import type {
  StreamController,
  StreamOptions,
  TransportPortHandle,
  TransportPortOpenOptions,
} from '../../types'
import { isPortChannelEnabled } from '../port-policy'
import {
  buildStreamStartPayload,
  createStreamId,
  getStreamEventNames,
  normalizePortStreamMessage,
  toStreamError,
  unwrapChannelPayload,
} from './protocol'

// Mirrors the renderer transport budget: the confirm handshake blocks stream start,
// so this has to clear startup contention without stalling the caller for long.
const DEFAULT_STREAM_PORT_TIMEOUT_MS = 3000

export interface ClientStreamRuntimeAdapter {
  streamControllers: Map<string, StreamController>
  send: (eventName: string, payload?: unknown) => Promise<unknown>
  registerChannel: (
    eventName: string,
    handler: (raw: unknown) => void,
  ) => () => void
  openPort?: (
    options: TransportPortOpenOptions,
  ) => Promise<TransportPortHandle | null>
  logPortFallback?: (channel: string, reason: string, error?: unknown) => void
  streamPortTimeoutMs?: number
}

function createStreamAbortError(): Error {
  return new DOMException('Stream aborted', 'AbortError')
}

export async function startClientStream<TReq, TChunk>(
  adapter: ClientStreamRuntimeAdapter,
  eventName: string,
  payload: TReq,
  options: StreamOptions<TChunk>,
): Promise<StreamController> {
  const streamId = createStreamId()
  const streamEvents = getStreamEventNames(eventName)
  const signal = options.signal
  if (signal?.aborted) {
    throw createStreamAbortError()
  }

  let cancelled = false
  let stopped = false
  let cleaned = false
  let startSent = false
  let resolveStartup!: () => void
  const startupFinished = new Promise<void>((resolve) => {
    resolveStartup = resolve
  })
  let portHandle: TransportPortHandle | null = null
  let portActive = false
  let cleanupPortListeners: (() => void) | null = null

  const cleanupCallbacks: Array<() => void> = []
  const cleanup = () => {
    if (cleaned) {
      return
    }
    cleaned = true
    // Wake startup without a second rejected promise; its owner checks cancellation.
    resolveStartup()
    signal?.removeEventListener('abort', onAbort)

    const handle = portHandle
    portHandle = null
    portActive = false
    cleanupPortListeners?.()
    cleanupPortListeners = null

    cleanupCallbacks.forEach(callback => callback())
    adapter.streamControllers.delete(streamId)

    if (handle) {
      void handle.close('stream_cleanup').catch(() => {})
    }
  }

  const fallbackToChannel = (reason: string, error?: unknown) => {
    const handle = portHandle
    if (!handle) {
      return
    }

    portHandle = null
    portActive = false
    cleanupPortListeners?.()
    cleanupPortListeners = null
    adapter.logPortFallback?.(eventName, reason, error)
    void handle.close(reason).catch(() => {})
  }

  const cancel = () => {
    if (cancelled) {
      return
    }
    cancelled = true
    if (startSent && !cleaned) {
      adapter.send(streamEvents.cancel, { streamId }).catch(() => {})
    }
    cleanup()
  }

  function onAbort(): void {
    cancel()
  }

  signal?.addEventListener('abort', onAbort, { once: true })

  const deliverData = (chunk: TChunk) => {
    try {
      options.onData(chunk)
    }
    catch (error) {
      try {
        options.onError?.(toStreamError(error))
      }
      finally {
        cancel()
      }
    }
  }

  const openPort = adapter.openPort
  const portOptions
    = openPort && options.port !== false && isPortChannelEnabled(eventName)
      ? {
          channel: eventName,
          ...options.port,
          // Each stream owns its port outright: cleanup and fallback below close the
          // handle unconditionally, and the channel-keyed cache is shared with
          // `transport.on` subscriptions, so a reused handle would be torn down by
          // whichever consumer finishes first.
          force: true,
          timeoutMs:
            options.port?.timeoutMs
            ?? adapter.streamPortTimeoutMs
            ?? DEFAULT_STREAM_PORT_TIMEOUT_MS,
        }
      : null

  try {
    if (portOptions && openPort) {
      try {
        const opening = openPort(portOptions).then((handle) => {
          if (cancelled || cleaned) {
            void handle?.close('stream_cleanup').catch(() => {})
            return null
          }
          return handle
        })
        portHandle = (await Promise.race([opening, startupFinished])) ?? null
        if (!portHandle) {
          adapter.logPortFallback?.(eventName, 'port_unavailable')
        }
      }
      catch (error) {
        if (cancelled) {
          throw createStreamAbortError()
        }
        adapter.logPortFallback?.(eventName, 'open_failed', error)
      }
    }

    if (cancelled) {
      void portHandle?.close('stream_cleanup').catch(() => {})
      portHandle = null
      throw createStreamAbortError()
    }

    if (portHandle) {
      const port = portHandle.port

      const portMessageHandler = (event: MessageEvent) => {
        if (cancelled || cleaned) {
          return
        }

        const message = normalizePortStreamMessage<TChunk>(event?.data)
        if (!message || message.streamId !== streamId) {
          return
        }

        portActive = true

        if (message.type === 'data' && message.chunk !== undefined) {
          deliverData(message.chunk)
          return
        }

        if (message.type === 'error') {
          try {
            options.onError?.(toStreamError(message.error))
          }
          finally {
            cleanup()
          }
          return
        }

        if (message.type === 'end') {
          try {
            options.onEnd?.()
          }
          finally {
            cleanup()
          }
        }
      }

      const portCloseHandler = () => {
        if (cancelled || cleaned) {
          return
        }
        fallbackToChannel('port_closed')
      }

      const portErrorHandler = () => {
        if (cancelled || cleaned) {
          return
        }
        fallbackToChannel('message_error')
      }

      if (typeof port.addEventListener === 'function') {
        port.addEventListener('message', portMessageHandler)
        port.addEventListener('messageerror', portErrorHandler)
        port.addEventListener('close', portCloseHandler)
        port.start?.()
        cleanupPortListeners = () => {
          port.removeEventListener('message', portMessageHandler)
          port.removeEventListener('messageerror', portErrorHandler)
          port.removeEventListener('close', portCloseHandler)
        }
      }
      else {
        port.onmessage = portMessageHandler as any
        cleanupPortListeners = () => {
          port.onmessage = null
        }
      }
    }

    const dataCleanup = adapter.registerChannel(
      streamEvents.data(streamId),
      (raw) => {
        if (cancelled || cleaned || portActive) {
          return
        }

        const data = unwrapChannelPayload<{
          chunk?: TChunk
          error?: string
          code?: string
        }>(raw)
        if (data?.error !== undefined) {
        // A handler may report failure on the data channel rather than the error channel.
        // Without this cleanup the controller stayed in adapter.streamControllers and the
        // data/end/error registrations for this streamId stayed attached forever, so every
        // such failure leaked one controller and three listeners. Matches the dedicated error
        // handler below and the MessagePort path above.
          try {
            options.onError?.(
              toStreamError({ message: data.error, code: data.code }),
            )
          }
          finally {
            cleanup()
          }
          return
        }

        if (data?.chunk !== undefined) {
          deliverData(data.chunk)
        }
      },
    )
    cleanupCallbacks.push(dataCleanup)

    const endCleanup = adapter.registerChannel(streamEvents.end(streamId), () => {
      if (cancelled || cleaned || portActive) {
        return
      }
      try {
        options.onEnd?.()
      }
      finally {
        cleanup()
      }
    })
    cleanupCallbacks.push(endCleanup)

    const errorCleanup = adapter.registerChannel(
      streamEvents.error(streamId),
      (raw) => {
        if (cancelled || cleaned || portActive) {
          return
        }
        const data = unwrapChannelPayload<{ error?: string, code?: string }>(raw)
        try {
          options.onError?.(
            toStreamError(
              data?.error === undefined
                ? data?.code
                : { message: data.error, code: data.code },
            ),
          )
        }
        finally {
          cleanup()
        }
      },
    )

    cleanupCallbacks.push(errorCleanup)

    const controller: StreamController = {
      cancel,
      // Deliberately no `cleanup()`: the producer keeps streaming until it emits
      // `end`, and tearing the listeners down here would drop that final result.
      stop: () => {
        if (cancelled || stopped) {
          return
        }
        stopped = true
        adapter.send(streamEvents.stop, { streamId }).catch(() => {})
      },
      get cancelled() {
        return cancelled
      },
      streamId,
    }

    adapter.streamControllers.set(streamId, controller)

    if (cancelled) {
      throw createStreamAbortError()
    }
    const streamPayload = buildStreamStartPayload(payload, streamId, portHandle?.portId)
    startSent = true
    const started = adapter.send(streamEvents.start, streamPayload)
    await Promise.race([started, startupFinished])
    if (cancelled) {
      throw createStreamAbortError()
    }
    resolveStartup()
    return controller
  }
  catch (error) {
    cancel()
    if (signal?.aborted) {
      throw createStreamAbortError()
    }
    const errorMessage = toStreamError(error).message
    throw new Error(
      `[TuffTransport] Failed to start stream \"${eventName}\": ${errorMessage}`,
    )
  }
}
