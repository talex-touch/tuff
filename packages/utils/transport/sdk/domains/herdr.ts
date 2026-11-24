import type {
  HerdrEnsureStartedRequest,
  HerdrProjectedConversation,
  HerdrProjectionGetRequest,
  HerdrProjectionUnwatchRequest,
  HerdrProjectionWatchRequest,
  HerdrRuntimeSnapshot,
  HerdrSendResult,
  HerdrSessionUpsertPayload,
  HerdrSessionView,
  HerdrStreamAttachRequest,
  HerdrStreamClosedPayload,
  HerdrStreamDataPayload,
  HerdrTerminalControlRequest,
  HerdrTerminalControlResult,
  HerdrTerminalKeysRequest,
  HerdrTerminalKeysResult,
  HerdrTerminalPutRequest,
  HerdrTerminalPutResult,
  HerdrTerminalReadRequest,
  HerdrTerminalReadResult,
  HerdrTerminalRunRequest,
  HerdrTerminalSendRequest,
} from '../../events/herdr'
import type { ITuffTransport } from '../../types'
import { HerdrEvents } from '../../events/herdr'

export * from '../../events/herdr'

export interface HerdrStreamHandlers {
  /**
   * Invoked for each decoded output chunk. When `awaitDisplay` is true, credit
   * acknowledgement (`ack(bytes)`) is held until the returned promise settles.
   */
  onData?: (data: string, payload: HerdrStreamDataPayload) => unknown
  /**
   * Delays `ack(bytes)` until the promise returned by `onData` settles so
   * herdr-core's CREDIT flow control paces output to the renderer's display rate.
   */
  awaitDisplay?: boolean
  /** Invoked when a server-sent RESIZE frame accompanies or precedes a paint. */
  onResize?: (size: { cols: number, rows: number }) => void
  /** Invoked when the stream ends (detached, exited, lost, restarted, disconnected). */
  onClosed?: (payload: HerdrStreamClosedPayload) => void
  /** Optional AbortSignal to cancel attach in flight or detach an active stream. */
  signal?: AbortSignal
}

export interface HerdrStreamHandle {
  readonly streamId: string
  readonly terminal: HerdrSessionView
  readonly automaticInput: boolean
  readonly resizeNotifications: boolean
  write: (data: string) => Promise<void>
  sendAutoInput: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  focus: (focused: boolean) => Promise<void>
  detach: () => Promise<void>
}

export interface HerdrSdk {
  getSnapshot: () => Promise<HerdrRuntimeSnapshot>
  ensureStarted: (request?: HerdrEnsureStartedRequest) => Promise<HerdrRuntimeSnapshot>
  reconnect: () => Promise<HerdrRuntimeSnapshot>
  run: (request: HerdrTerminalRunRequest) => Promise<HerdrSessionView>
  send: (request: HerdrTerminalSendRequest) => Promise<HerdrSendResult>
  keys: (request: HerdrTerminalKeysRequest) => Promise<HerdrTerminalKeysResult>
  control: (request: HerdrTerminalControlRequest) => Promise<HerdrTerminalControlResult>
  interrupt: (terminal: string, timeout?: number) => Promise<HerdrTerminalControlResult>
  kill: (terminal: string) => Promise<HerdrTerminalControlResult>
  rm: (terminal: string) => Promise<HerdrTerminalControlResult>
  keep: (terminal: string, enabled: boolean) => Promise<HerdrTerminalControlResult>
  read: (request: HerdrTerminalReadRequest) => Promise<HerdrTerminalReadResult>
  put: (request: HerdrTerminalPutRequest) => Promise<HerdrTerminalPutResult>
  attachStream: (
    request: HerdrStreamAttachRequest,
    handlers?: HerdrStreamHandlers,
  ) => Promise<HerdrStreamHandle>
  getProjection: (request: HerdrProjectionGetRequest) => Promise<HerdrProjectedConversation>
  watchProjection: (request: HerdrProjectionWatchRequest) => Promise<HerdrProjectedConversation>
  unwatchProjection: (request: HerdrProjectionUnwatchRequest) => Promise<void>
  onProjectionUpdated: (listener: (conversation: HerdrProjectedConversation) => void) => () => void
  projection: {
    get: (request: HerdrProjectionGetRequest) => Promise<HerdrProjectedConversation>
    watch: (request: HerdrProjectionWatchRequest) => Promise<HerdrProjectedConversation>
    unwatch: (request: HerdrProjectionUnwatchRequest) => Promise<void>
    onUpdated: (listener: (conversation: HerdrProjectedConversation) => void) => () => void
  }
  onSnapshotChanged: (listener: (snapshot: HerdrRuntimeSnapshot) => void) => () => void
  onSessionUpsert: (listener: (payload: HerdrSessionUpsertPayload) => void) => () => void
}

type EarlyStreamEvent
  = | { type: 'data', payload: HerdrStreamDataPayload }
    | { type: 'closed', payload: HerdrStreamClosedPayload }

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

function measureUtf8Bytes(text: string): number {
  if (!text) return 0
  if (utf8Encoder) return utf8Encoder.encode(text).byteLength
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xD800 && code <= 0xDBFF) {
      bytes += 4
      i += 1
    }
    else bytes += 3
  }
  return bytes
}

function createAttachToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `herdr-attach-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createAttachAbortError(): Error {
  const error = new Error('Herdr stream attach aborted')
  error.name = 'AbortError'
  return error
}

export function createHerdrSdk(transport: Pick<ITuffTransport, 'send' | 'on'>): HerdrSdk {
  const control = (request: HerdrTerminalControlRequest): Promise<HerdrTerminalControlResult> =>
    transport.send(HerdrEvents.terminal.control, request)
  const getProjection = (request: HerdrProjectionGetRequest): Promise<HerdrProjectedConversation> =>
    transport.send(HerdrEvents.projection.get, request)
  const watchProjection = (request: HerdrProjectionWatchRequest): Promise<HerdrProjectedConversation> =>
    transport.send(HerdrEvents.projection.watch, request)
  const unwatchProjection = (request: HerdrProjectionUnwatchRequest): Promise<void> =>
    transport.send(HerdrEvents.projection.unwatch, request)
  const onProjectionUpdated = (
    listener: (conversation: HerdrProjectedConversation) => void,
  ): (() => void) => transport.on(HerdrEvents.push.projectionUpdated, listener)

  return {
    getSnapshot: () => transport.send(HerdrEvents.runtime.getSnapshot),
    ensureStarted: request => transport.send(HerdrEvents.runtime.ensureStarted, request),
    reconnect: () => transport.send(HerdrEvents.runtime.reconnect),
    run: request => transport.send(HerdrEvents.terminal.run, request),
    send: request => transport.send(HerdrEvents.terminal.send, request),
    keys: request => transport.send(HerdrEvents.terminal.keys, request),
    control,
    interrupt: (terminal, timeout) =>
      control({
        terminal,
        action: 'interrupt',
        ...(timeout !== undefined ? { timeout } : {}),
      }),
    kill: terminal => control({ terminal, action: 'kill' }),
    rm: terminal => control({ terminal, action: 'rm' }),
    keep: (terminal, enabled) => control({ terminal, action: enabled ? 'keep-on' : 'keep-off' }),
    read: request => transport.send(HerdrEvents.terminal.read, request),
    put: request => transport.send(HerdrEvents.terminal.put, request),
    getProjection,
    watchProjection,
    unwatchProjection,
    onProjectionUpdated,
    projection: {
      get: getProjection,
      watch: watchProjection,
      unwatch: unwatchProjection,
      onUpdated: onProjectionUpdated,
    },
    onSnapshotChanged: listener => transport.on(HerdrEvents.push.snapshotChanged, listener),
    onSessionUpsert: listener => transport.on(HerdrEvents.push.sessionUpsert, listener),

    attachStream(request, handlers = {}) {
      let resolve!: (value: HerdrStreamHandle | PromiseLike<HerdrStreamHandle>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<HerdrStreamHandle>((res, rej) => {
        resolve = res
        reject = rej
      })

      const { signal } = handlers
      if (signal?.aborted) {
        reject(createAttachAbortError())
        return promise
      }

      const attachToken = request.attachToken ?? createAttachToken()
      let streamId: string | undefined
      let closed = false
      let observedClosed = false
      let detaching = false
      let cancelled = false
      let flushing = false
      let settled = false
      let detachPromise: Promise<void> | undefined
      const early: EarlyStreamEvent[] = []
      const disposers: (() => void)[] = []

      const cleanup = (): void => {
        for (const dispose of disposers.splice(0)) dispose()
        signal?.removeEventListener('abort', onAbort)
        early.length = 0
      }

      const sendDetach = (targetStreamId: string): Promise<void> => {
        return transport.send(
          HerdrEvents.stream.io,
          { streamId: targetStreamId, op: 'detach' },
          { immediate: true },
        )
      }

      const detach = (): Promise<void> => {
        if (detachPromise) return detachPromise
        if (closed) {
          cleanup()
          detachPromise = Promise.resolve()
          return detachPromise
        }
        if (streamId === undefined) {
          closed = true
          cleanup()
          detachPromise = Promise.resolve()
          return detachPromise
        }
        detaching = true
        const currentStreamId = streamId
        try {
          detachPromise = sendDetach(currentStreamId).catch((error) => {
            if (!observedClosed) throw error
          }).finally(() => {
            closed = true
            detaching = false
            cleanup()
          })
        }
        catch (error) {
          closed = true
          detaching = false
          cleanup()
          detachPromise = Promise.reject(error)
        }
        return detachPromise
      }

      const onAbort = (): void => {
        if (settled) {
          void detach().catch(() => {})
          return
        }
        cancelled = true
        closed = true
        cleanup()
        reject(createAttachAbortError())
      }

      const acknowledge = (bytes: number): void => {
        if (bytes <= 0 || closed || detaching || streamId === undefined) return
        void transport.send(
          HerdrEvents.stream.io,
          { streamId, op: 'ack', bytes },
          { immediate: true },
        ).catch(() => {})
      }

      const dispatch = (event: EarlyStreamEvent): void => {
        if (closed || event.payload.streamId !== streamId) return
        if (event.type === 'data') {
          const { payload } = event
          if (payload.resize) {
            handlers.onResize?.(payload.resize)
            if (payload.data.length === 0 && payload.bytes <= 0) {
              return
            }
          }
          const ackBytes = Number.isFinite(payload.bytes) && payload.bytes > 0
            ? Math.floor(payload.bytes)
            : measureUtf8Bytes(payload.data)
          const shown = handlers.onData?.(payload.data, payload)
          if (ackBytes > 0) {
            const release = (): void => acknowledge(ackBytes)
            if (handlers.awaitDisplay) {
              void Promise.resolve(shown).then(release, release)
            }
            else {
              release()
            }
          }
          return
        }

        observedClosed = true
        closed = true
        cleanup()
        handlers.onClosed?.(event.payload)
      }

      const receive = (event: EarlyStreamEvent): void => {
        if (closed || cancelled) return
        if (streamId === undefined || flushing) {
          early.push(event)
          return
        }
        try {
          dispatch(event)
        }
        catch (error) {
          cancelled = true
          void detach().catch(() => {})
          throw error
        }
      }

      try {
        // Subscribe before attach so first paint bytes or fast close are never missed.
        disposers.push(transport.on(HerdrEvents.push.streamData, (payload) => {
          receive({ type: 'data', payload })
        }))
        disposers.push(transport.on(HerdrEvents.push.streamClosed, (payload) => {
          receive({ type: 'closed', payload })
        }))

        signal?.addEventListener('abort', onAbort, { once: true })
        if (signal?.aborted) {
          onAbort()
          return promise
        }

        const attached = transport.send(
          HerdrEvents.stream.attach,
          { ...request, attachToken },
          { immediate: true },
        )

        void attached.then((result) => {
          streamId = result.streamId
          if (cancelled) {
            void sendDetach(result.streamId).catch(() => {})
            return
          }
          try {
            flushing = true
            while (early.length > 0) {
              if (closed) break
              const batch = early.splice(0)
              for (const event of batch) {
                if (closed) break
                dispatch(event)
              }
            }
            early.length = 0
            flushing = false

            const activeStreamId = result.streamId

            settled = true
            resolve({
              streamId: activeStreamId,
              terminal: result.terminal,
              automaticInput: result.automaticInput,
              resizeNotifications: result.resizeNotifications,
              write: (data: string) => {
                if (closed || detaching) return Promise.reject(new Error('HERDR_STREAM_CLOSED'))
                return transport.send(
                  HerdrEvents.stream.io,
                  { streamId: activeStreamId, op: 'write', data },
                  { immediate: true },
                )
              },
              sendAutoInput: (data: string) => {
                if (closed || detaching) return Promise.reject(new Error('HERDR_STREAM_CLOSED'))
                return transport.send(
                  HerdrEvents.stream.io,
                  { streamId: activeStreamId, op: 'auto-input', data },
                  { immediate: true },
                )
              },
              resize: (cols: number, rows: number) => {
                if (closed || detaching) return Promise.reject(new Error('HERDR_STREAM_CLOSED'))
                return transport.send(
                  HerdrEvents.stream.io,
                  { streamId: activeStreamId, op: 'resize', cols, rows },
                  { immediate: true },
                )
              },
              focus: (focused: boolean) => {
                if (closed || detaching) return Promise.reject(new Error('HERDR_STREAM_CLOSED'))
                return transport.send(
                  HerdrEvents.stream.io,
                  { streamId: activeStreamId, op: 'focus', focused },
                  { immediate: true },
                )
              },
              detach,
            })
          }
          catch (error) {
            flushing = false
            cancelled = true
            settled = true
            void detach().catch(() => {})
            reject(error)
          }
        }, (error) => {
          if (cancelled) return
          cancelled = true
          closed = true
          settled = true
          cleanup()
          reject(error)
        })
      }
      catch (error) {
        if (!cancelled) {
          cancelled = true
          closed = true
          settled = true
          cleanup()
          reject(error)
        }
      }

      return promise
    },
  }
}
