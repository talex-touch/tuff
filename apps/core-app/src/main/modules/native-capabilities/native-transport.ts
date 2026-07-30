import { Buffer } from 'node:buffer'
import { validateControl } from '@talex-touch/tuff-native/protocol-contract'
import type {
  NativeAttachmentDescriptor,
  NativeCapabilityDescriptor,
  NativeControlV1,
  NativePacket,
  NativeProtocolError,
  NativeRequestV1,
  NativeResponseV1,
  NativeRunMeta,
  NativeServerHelloV1,
  NativeStreamFrameV1
} from '@talex-touch/tuff-native/protocol-contract'
import { randomBytes } from 'node:crypto'

const PROTOCOL = { major: 1, minor: 0 } as const
const DEFAULT_INVOKE_TIMEOUT_MS = 30_000
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 3_000
const DEFAULT_DISPOSE_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 15 * 60_000
const MAX_TOMBSTONES = 256

export interface NativeCarrierLike {
  readonly id: string
  handshake(): NativeServerHelloV1 | Promise<NativeServerHelloV1>
  invoke(control: NativeRequestV1, attachments?: Buffer[]): Promise<NativePacket<NativeResponseV1>>
  openStream(
    control: NativeRequestV1,
    attachments: Buffer[] | undefined,
    onFrame: (packet: NativePacket<NativeStreamFrameV1>) => void
  ): NativePacket<NativeResponseV1>
  acknowledge(streamId: string, ackSequence: number): boolean
  cancel(
    targetType: 'request' | 'stream',
    id: string,
    reason?: 'caller' | 'consumer_closed' | 'deadline' | 'dispose'
  ): boolean
  health(): Promise<NativeResponseV1>
  releaseStream(streamId: string): boolean
  dispose(): Promise<void>
}

export interface NativeTransportLogger {
  info(
    message: string,
    metadata: Record<string, string | number | boolean | null | undefined>
  ): void
  warn(
    message: string,
    metadata: Record<string, string | number | boolean | null | undefined>
  ): void
}

export interface NativeTransportPolicy {
  handshakeTimeoutMs?: number
  maxTransportDisposeMs?: number
  defaultInvokeTimeoutMs?: number
}

export interface NativeInputAttachment {
  id: string
  data: Buffer
  mediaType?: string
  purpose?: string
}

export interface NativeInvokeOptions {
  attachments?: NativeInputAttachment[]
  signal?: AbortSignal
  timeoutMs?: number
}

export interface NativeStreamOptions extends NativeInvokeOptions {
  initialWindow?: number
}

export interface NativeResult<T> {
  value: T
  attachments: Buffer[]
  attachmentDescriptors: NativeAttachmentDescriptor[]
  meta: NativeRunMeta
}

export interface NativeStreamTerminal {
  kind: 'end' | 'error' | 'cancelled'
  value?: unknown
  attachments?: Buffer[]
  attachmentDescriptors?: NativeAttachmentDescriptor[]
  error?: NativeTransportError
}

export interface NativeStream<T> extends AsyncIterable<NativeResult<T>> {
  readonly id: string
  readonly closed: Promise<NativeStreamTerminal>
  cancel(): void
}

export interface NativeCarrierHealth {
  carrierId: string
  state: 'ready' | 'unavailable' | 'error'
  snapshot?: NativeServerHelloV1
  response?: NativeResponseV1
  code?: string
}

export interface NativeTransportSnapshot {
  state: 'ready'
  carriers: NativeCarrierHealth[]
  capabilities: NativeCapabilityDescriptor[]
  conflicts: string[]
}

export interface NativeTransportHealth {
  state: NativeTransportState
  carriers: NativeCarrierHealth[]
  inFlightUnary: number
  openStreams: number
}

type NativeTransportState = 'new' | 'initializing' | 'ready' | 'disposing' | 'disposed'
type CancelReason = 'caller' | 'consumer_closed' | 'deadline' | 'dispose'

interface UnaryState {
  readonly token: object
  readonly carrier: NativeCarrierLike
  readonly requestId: string
  readonly reject: (error: unknown) => void
  settled: boolean
  timer: ReturnType<typeof setTimeout> | null
  removeAbort: (() => void) | null
}

interface StreamQueueItem<T> {
  result: NativeResult<T>
  sequence: number
}

interface StreamWaiter<T> {
  resolve: (result: IteratorResult<NativeResult<T>>) => void
  reject: (error: unknown) => void
}

interface PendingStreamCancellation {
  terminal: NativeStreamTerminal
  reason: 'caller' | 'consumer_closed'
}

export class NativeTransportError extends Error {
  readonly code: string
  readonly category: string
  readonly retryable: boolean
  readonly requestId?: string
  readonly streamId?: string
  readonly carrierId?: string
  readonly details?: Record<string, string | number | boolean>

  constructor(
    code: string,
    message: string,
    options: {
      category?: string
      retryable?: boolean
      requestId?: string
      streamId?: string
      carrierId?: string
      details?: Record<string, string | number | boolean>
    } = {}
  ) {
    super(message)
    this.name = 'NativeTransportError'
    this.code = code
    this.category = options.category ?? 'internal'
    this.retryable = options.retryable ?? false
    this.requestId = options.requestId
    this.streamId = options.streamId
    this.carrierId = options.carrierId
    this.details = options.details
  }

  static fromProtocol(
    error: NativeProtocolError,
    correlation: { requestId?: string; streamId?: string; carrierId?: string }
  ): NativeTransportError {
    return new NativeTransportError(error.code, error.message, {
      category: error.category,
      retryable: error.retryable,
      details: error.details,
      ...correlation
    })
  }
}

export class NativeTransport {
  private readonly carriers: NativeCarrierLike[]
  private readonly logger: NativeTransportLogger | null
  private readonly handshakeTimeoutMs: number
  private readonly maxTransportDisposeMs: number
  private readonly defaultInvokeTimeoutMs: number
  private readonly processNonce = randomBytes(12).toString('hex')
  private readonly routes = new Map<string, NativeCarrierLike>()
  private readonly carrierSnapshots = new Map<string, NativeServerHelloV1>()
  private readonly carrierHealth = new Map<string, NativeCarrierHealth>()
  private readonly unary = new Map<string, UnaryState>()
  private readonly streams = new Map<string, NativeStreamImpl<unknown>>()
  private readonly tombstones: string[] = []
  private state: NativeTransportState = 'new'
  private counter = 0n
  private initializePromise: Promise<NativeTransportSnapshot> | null = null
  private disposePromise: Promise<void> | null = null
  private disposeRequested = false
  private snapshot: NativeTransportSnapshot | null = null

  constructor(options: {
    carriers: NativeCarrierLike[]
    logger?: NativeTransportLogger
    policy?: NativeTransportPolicy
  }) {
    this.carriers = [...options.carriers]
    this.logger = options.logger ?? null
    this.handshakeTimeoutMs = normalizeTimeout(
      options.policy?.handshakeTimeoutMs,
      DEFAULT_HANDSHAKE_TIMEOUT_MS
    )
    this.maxTransportDisposeMs = normalizeTimeout(
      options.policy?.maxTransportDisposeMs,
      DEFAULT_DISPOSE_TIMEOUT_MS
    )
    this.defaultInvokeTimeoutMs = normalizeTimeout(
      options.policy?.defaultInvokeTimeoutMs,
      DEFAULT_INVOKE_TIMEOUT_MS
    )
  }

  initialize(): Promise<NativeTransportSnapshot> {
    if (this.snapshot && this.state === 'ready') return Promise.resolve(this.snapshot)
    if (this.initializePromise) return this.initializePromise
    if (this.state === 'disposing' || this.state === 'disposed') {
      return Promise.reject(this.error('TRANSPORT_DISPOSED', 'Native transport is disposed'))
    }

    this.state = 'initializing'
    this.initializePromise = this.initializeCarriers()
    return this.initializePromise
  }

  invoke<TInput, TOutput>(
    capability: string,
    operation: string,
    input: TInput,
    options: NativeInvokeOptions = {}
  ): Promise<NativeResult<TOutput>> {
    const ownedOptions: NativeInvokeOptions = {
      ...options,
      attachments: ownInputAttachments(options.attachments)
    }
    return this.invokeOwned<TInput, TOutput>(capability, operation, input, ownedOptions)
  }

  private async invokeOwned<TInput, TOutput>(
    capability: string,
    operation: string,
    input: TInput,
    options: NativeInvokeOptions
  ): Promise<NativeResult<TOutput>> {
    await this.initialize()
    this.ensureReady()
    const carrier = this.routes.get(capability)
    if (!carrier) {
      throw this.error('CAPABILITY_NOT_FOUND', 'Native capability is not available')
    }

    const requestId = this.nextId('request')
    const { descriptors, buffers } = normalizeAttachments(options.attachments)
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.defaultInvokeTimeoutMs)
    const control: NativeRequestV1 = {
      kind: 'request',
      protocol: PROTOCOL,
      requestId,
      capability,
      operation,
      deadlineUnixMs: Date.now() + timeoutMs,
      payload: input,
      attachments: descriptors
    }

    if (options.signal?.aborted) {
      throw this.error('CANCELLED', 'Native operation was cancelled', {
        category: 'cancelled',
        requestId,
        carrierId: carrier.id
      })
    }

    return await new Promise<NativeResult<TOutput>>((resolve, reject) => {
      const state: UnaryState = {
        token: {},
        carrier,
        requestId,
        reject,
        settled: false,
        timer: null,
        removeAbort: null
      }
      this.unary.set(requestId, state)

      const finish = (
        result: { ok: true; value: NativeResult<TOutput> } | { ok: false; error: unknown },
        localReason?: CancelReason
      ): void => {
        if (!this.claimUnary(state)) return
        if (localReason) {
          try {
            carrier.cancel('request', requestId, localReason)
          } catch {
            // Local terminal ownership is authoritative.
          }
        }
        if (result.ok) resolve(result.value)
        else reject(result.error)
      }

      state.timer = setTimeout(() => {
        finish(
          {
            ok: false,
            error: this.error('DEADLINE_EXCEEDED', 'Native operation deadline was exceeded', {
              category: 'timeout',
              retryable: true,
              requestId,
              carrierId: carrier.id
            })
          },
          'deadline'
        )
      }, timeoutMs)

      if (options.signal) {
        const onAbort = (): void => {
          finish(
            {
              ok: false,
              error: this.error('CANCELLED', 'Native operation was cancelled', {
                category: 'cancelled',
                requestId,
                carrierId: carrier.id
              })
            },
            'caller'
          )
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
        state.removeAbort = () => options.signal?.removeEventListener('abort', onAbort)
      }

      void carrier.invoke(control, buffers).then(
        (packet) => {
          if (this.unary.get(requestId)?.token !== state.token || state.settled) return
          if (!isValidResponsePacket(packet, requestId)) {
            finish({
              ok: false,
              error: this.error('NATIVE_PROTOCOL_VIOLATION', 'Native response packet is invalid', {
                category: 'protocol',
                requestId,
                carrierId: carrier.id
              })
            })
            return
          }
          if (!packet.control.ok) {
            finish({
              ok: false,
              error: NativeTransportError.fromProtocol(packet.control.error, {
                requestId,
                carrierId: carrier.id
              })
            })
            return
          }
          finish({
            ok: true,
            value: {
              value: packet.control.payload as TOutput,
              attachments: packet.attachments,
              attachmentDescriptors: packet.control.attachments,
              meta: packet.control.meta
            }
          })
        },
        () => {
          finish({
            ok: false,
            error: this.error('CARRIER_INVOKE_FAILED', 'Native carrier invocation failed', {
              category: 'availability',
              retryable: true,
              requestId,
              carrierId: carrier.id
            })
          })
        }
      )
    })
  }

  openStream<TInput, TChunk>(
    capability: string,
    operation: string,
    input: TInput,
    options: NativeStreamOptions = {}
  ): NativeStream<TChunk> {
    this.ensureReady()
    const carrier = this.routes.get(capability)
    if (!carrier) {
      throw this.error('CAPABILITY_NOT_FOUND', 'Native capability is not available')
    }
    const requestId = this.nextId('request')
    const streamId = this.nextId('stream')
    const { descriptors, buffers } = normalizeAttachments(options.attachments, true)
    const initialWindow = normalizeWindow(options.initialWindow)
    const cancelGraceMs = normalizeTimeout(
      this.carrierSnapshots.get(carrier.id)?.limits.cancelGraceMs,
      1000
    )
    const timeoutMs =
      options.timeoutMs === undefined
        ? undefined
        : normalizeTimeout(options.timeoutMs, this.defaultInvokeTimeoutMs)
    const control: NativeRequestV1 = {
      kind: 'request',
      protocol: PROTOCOL,
      requestId,
      capability,
      operation,
      ...(timeoutMs === undefined ? {} : { deadlineUnixMs: Date.now() + timeoutMs }),
      payload: { streamId, initialWindow, input },
      attachments: descriptors
    }

    const stream = new NativeStreamImpl<TChunk>({
      id: streamId,
      carrier,
      requestedWindow: initialWindow,
      cancelGraceMs,
      signal: options.signal,
      timeoutMs,
      onRelease: () => {
        if (this.streams.get(streamId) === stream) this.streams.delete(streamId)
        this.addTombstone(streamId)
      },
      createError: (code, message, errorOptions) =>
        this.error(code, message, {
          ...errorOptions,
          streamId,
          carrierId: carrier.id
        })
    })
    this.streams.set(streamId, stream as NativeStreamImpl<unknown>)

    if (options.signal?.aborted) {
      stream.failLocal(
        this.error('CANCELLED', 'Native stream was cancelled', {
          category: 'cancelled',
          streamId,
          carrierId: carrier.id
        }),
        'caller'
      )
      return stream
    }

    let accepted: NativePacket<NativeResponseV1>
    try {
      accepted = carrier.openStream(control, buffers, (packet) => stream.push(packet))
    } catch {
      stream.failLocal(
        this.error('CARRIER_OPEN_STREAM_FAILED', 'Native carrier could not open the stream', {
          category: 'availability',
          retryable: true,
          streamId,
          carrierId: carrier.id
        })
      )
      return stream
    }

    if (!isValidResponsePacket(accepted, requestId)) {
      stream.failLocal(
        this.error('NATIVE_PROTOCOL_VIOLATION', 'Native stream response packet is invalid', {
          category: 'protocol',
          requestId,
          streamId,
          carrierId: carrier.id
        }),
        'consumer_closed'
      )
      return stream
    }
    if (!accepted.control.ok) {
      stream.failLocal(
        NativeTransportError.fromProtocol(accepted.control.error, {
          requestId,
          streamId,
          carrierId: carrier.id
        })
      )
      return stream
    }
    const acceptedPayload = accepted.control.payload
    const effectiveWindow =
      acceptedPayload && typeof acceptedPayload === 'object' && 'effectiveWindow' in acceptedPayload
        ? Number(acceptedPayload.effectiveWindow)
        : Number.NaN
    if (
      !acceptedPayload ||
      typeof acceptedPayload !== 'object' ||
      !('streamId' in acceptedPayload) ||
      acceptedPayload.streamId !== streamId
    ) {
      stream.failLocal(
        this.error('NATIVE_PROTOCOL_VIOLATION', 'Native stream acceptance is invalid', {
          category: 'protocol',
          requestId,
          streamId,
          carrierId: carrier.id
        }),
        'consumer_closed'
      )
      return stream
    }
    stream.accept(effectiveWindow)
    return stream
  }

  async health(): Promise<NativeTransportHealth> {
    if (this.state === 'disposed' || this.state === 'disposing') {
      return {
        state: this.state,
        carriers: this.carriers.map(
          (carrier) =>
            this.carrierHealth.get(carrier.id) ?? {
              carrierId: carrier.id,
              state: 'unavailable',
              code: 'TRANSPORT_DISPOSED'
            }
        ),
        inFlightUnary: this.unary.size,
        openStreams: this.streams.size
      }
    }
    if (this.state === 'new' || this.state === 'initializing') {
      try {
        await this.initialize()
      } catch {
        // Aggregate state below remains diagnostic-only.
      }
    }
    const responses = await Promise.all(
      this.carriers.map(async (carrier): Promise<NativeCarrierHealth> => {
        const baseline = this.carrierHealth.get(carrier.id)
        if (!baseline || baseline.state !== 'ready') {
          return (
            baseline ?? { carrierId: carrier.id, state: 'unavailable', code: 'NOT_INITIALIZED' }
          )
        }
        try {
          return {
            carrierId: carrier.id,
            state: 'ready',
            snapshot: this.carrierSnapshots.get(carrier.id),
            response: await carrier.health()
          }
        } catch {
          return {
            carrierId: carrier.id,
            state: 'error',
            snapshot: this.carrierSnapshots.get(carrier.id),
            code: 'CARRIER_HEALTH_FAILED'
          }
        }
      })
    )
    return {
      state: this.state,
      carriers: responses,
      inFlightUnary: this.unary.size,
      openStreams: this.streams.size
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise
    this.disposeRequested = true
    this.state = 'disposing'
    this.disposePromise = this.performDispose()
    return this.disposePromise
  }

  getState(): NativeTransportState {
    return this.state
  }

  private async initializeCarriers(): Promise<NativeTransportSnapshot> {
    const results = await Promise.all(
      this.carriers.map(async (carrier): Promise<NativeCarrierHealth> => {
        const handshake = Promise.resolve().then(() => carrier.handshake())
        try {
          const snapshot = await withTimeout(handshake, this.handshakeTimeoutMs, () =>
            this.error('CARRIER_HANDSHAKE_TIMEOUT', 'Native carrier handshake timed out', {
              category: 'timeout',
              carrierId: carrier.id
            })
          )
          if (!isServerHello(snapshot)) {
            throw this.error('NATIVE_PROTOCOL_VIOLATION', 'Native carrier handshake is invalid', {
              category: 'protocol',
              carrierId: carrier.id
            })
          }
          if (this.disposeRequested) {
            await carrier.dispose().catch(() => undefined)
            return { carrierId: carrier.id, state: 'unavailable', code: 'TRANSPORT_DISPOSED' }
          }
          this.carrierSnapshots.set(carrier.id, snapshot)
          return { carrierId: carrier.id, state: 'ready', snapshot }
        } catch (error) {
          void handshake
            .then(
              () => carrier.dispose(),
              () => carrier.dispose()
            )
            .catch(() => undefined)
          return {
            carrierId: carrier.id,
            state: 'unavailable',
            code: error instanceof NativeTransportError ? error.code : 'CARRIER_HANDSHAKE_FAILED'
          }
        }
      })
    )

    if (this.disposeRequested) {
      throw this.error('TRANSPORT_DISPOSED', 'Native transport is disposed')
    }

    this.routes.clear()
    this.carrierHealth.clear()
    for (const result of results) this.carrierHealth.set(result.carrierId, result)
    const conflicts = new Set<string>()
    const descriptors = new Map<string, NativeCapabilityDescriptor>()
    for (const result of results) {
      if (result.state !== 'ready' || !result.snapshot) continue
      const carrier = this.carriers.find((candidate) => candidate.id === result.carrierId)
      if (!carrier) continue
      for (const descriptor of result.snapshot.capabilities) {
        if (descriptor.state === 'unavailable') continue
        if (this.routes.has(descriptor.id)) {
          conflicts.add(descriptor.id)
          this.routes.delete(descriptor.id)
          descriptors.delete(descriptor.id)
          continue
        }
        if (conflicts.has(descriptor.id)) continue
        this.routes.set(descriptor.id, carrier)
        descriptors.set(descriptor.id, descriptor)
      }
    }

    this.snapshot = {
      state: 'ready',
      carriers: results,
      capabilities: [...descriptors.values()].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
      conflicts: [...conflicts].sort()
    }
    this.state = 'ready'
    this.safeLog('info', 'initialized', {
      carrierCount: results.filter((result) => result.state === 'ready').length,
      capabilityCount: this.snapshot.capabilities.length,
      conflictCount: this.snapshot.conflicts.length
    })
    return this.snapshot
  }

  private async performDispose(): Promise<void> {
    const initializePromise = this.initializePromise
    if (initializePromise && !this.snapshot) {
      await withTimeout(
        initializePromise.then(
          () => undefined,
          () => undefined
        ),
        this.handshakeTimeoutMs,
        () =>
          this.error('CARRIER_HANDSHAKE_TIMEOUT', 'Native initialization did not settle', {
            category: 'timeout'
          })
      ).catch(() => undefined)
    }

    for (const state of [...this.unary.values()]) {
      if (!this.claimUnary(state)) continue
      try {
        state.carrier.cancel('request', state.requestId, 'dispose')
      } catch {
        // Local disposal remains authoritative.
      }
      state.reject(
        this.error('TRANSPORT_DISPOSED', 'Native transport is disposed', {
          category: 'availability',
          requestId: state.requestId,
          carrierId: state.carrier.id
        })
      )
    }
    for (const stream of [...this.streams.values()]) {
      stream.failLocal(
        this.error('TRANSPORT_DISPOSED', 'Native transport is disposed', {
          category: 'availability',
          streamId: stream.id
        }),
        'dispose'
      )
    }

    const disposals = Promise.allSettled(this.carriers.map((carrier) => carrier.dispose()))
    try {
      await withTimeout(
        disposals.then(() => undefined),
        this.maxTransportDisposeMs,
        () =>
          this.error('NATIVE_DISPOSE_TIMEOUT', 'Native transport disposal timed out', {
            category: 'timeout'
          })
      )
    } catch {
      this.safeLog('warn', 'dispose-timeout', { code: 'NATIVE_DISPOSE_TIMEOUT' })
    }
    this.routes.clear()
    this.carrierSnapshots.clear()
    this.tombstones.splice(0)
    this.snapshot = null
    this.state = 'disposed'
  }

  private claimUnary(state: UnaryState): boolean {
    if (state.settled || this.unary.get(state.requestId)?.token !== state.token) return false
    state.settled = true
    if (state.timer) clearTimeout(state.timer)
    state.removeAbort?.()
    this.unary.delete(state.requestId)
    this.addTombstone(state.requestId)
    return true
  }

  private nextId(scope: 'request' | 'stream'): string {
    this.counter += 1n
    return `nt-${this.processNonce}-${scope}-${this.counter}`
  }

  private addTombstone(id: string): void {
    this.tombstones.push(id)
    if (this.tombstones.length > MAX_TOMBSTONES) this.tombstones.shift()
  }

  private ensureReady(): void {
    if (this.state === 'disposed' || this.state === 'disposing') {
      throw this.error('TRANSPORT_DISPOSED', 'Native transport is disposed')
    }
    if (this.state !== 'ready') {
      throw this.error('TRANSPORT_NOT_READY', 'Native transport is not initialized')
    }
  }

  private error(
    code: string,
    message: string,
    options: ConstructorParameters<typeof NativeTransportError>[2] = {}
  ): NativeTransportError {
    return new NativeTransportError(code, message, options)
  }

  private safeLog(
    level: 'info' | 'warn',
    event: string,
    metadata: Record<string, string | number | boolean | null | undefined>
  ): void {
    this.logger?.[level](`Native transport ${event}`, metadata)
  }
}

class NativeStreamImpl<T> implements NativeStream<T>, AsyncIterator<NativeResult<T>> {
  readonly id: string
  readonly closed: Promise<NativeStreamTerminal>
  private readonly carrier: NativeCarrierLike
  private readonly requestedWindow: number
  private readonly cancelGraceMs: number
  private readonly onRelease: () => void
  private readonly createError: (
    code: string,
    message: string,
    options?: ConstructorParameters<typeof NativeTransportError>[2]
  ) => NativeTransportError
  private readonly queue: Array<StreamQueueItem<T>> = []
  private readonly waiters: Array<StreamWaiter<T>> = []
  private effectiveWindow = 0
  private expectedSequence = 1
  private accepted = false
  private terminal: NativeStreamTerminal | null = null
  private pendingCancellation: PendingStreamCancellation | null = null
  private released = false
  private removeAbort: (() => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private cancelTimer: ReturnType<typeof setTimeout> | null = null
  private resolveClosed!: (terminal: NativeStreamTerminal) => void

  constructor(options: {
    id: string
    carrier: NativeCarrierLike
    requestedWindow: number
    cancelGraceMs: number
    signal?: AbortSignal
    timeoutMs?: number
    onRelease: () => void
    createError: NativeStreamImpl<T>['createError']
  }) {
    this.id = options.id
    this.carrier = options.carrier
    this.requestedWindow = options.requestedWindow
    this.cancelGraceMs = options.cancelGraceMs
    this.onRelease = options.onRelease
    this.createError = options.createError
    this.closed = new Promise((resolve) => {
      this.resolveClosed = resolve
    })
    if (options.timeoutMs !== undefined) {
      this.timer = setTimeout(() => {
        this.failLocal(
          this.createError('DEADLINE_EXCEEDED', 'Native stream deadline was exceeded', {
            category: 'timeout',
            retryable: true
          }),
          'deadline'
        )
      }, options.timeoutMs)
    }
    if (options.signal) {
      const onAbort = (): void => {
        this.beginCancellation(
          {
            kind: 'cancelled',
            error: this.createError('CANCELLED', 'Native stream was cancelled', {
              category: 'cancelled'
            })
          },
          'caller'
        )
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
      this.removeAbort = () => options.signal?.removeEventListener('abort', onAbort)
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<NativeResult<T>> {
    return this
  }

  accept(effectiveWindow: number): void {
    if (this.released || this.terminal) return
    if (
      !Number.isSafeInteger(effectiveWindow) ||
      effectiveWindow < 1 ||
      effectiveWindow > this.requestedWindow
    ) {
      this.failLocal(
        this.createError('NATIVE_PROTOCOL_VIOLATION', 'Native stream window is invalid', {
          category: 'protocol'
        }),
        'consumer_closed'
      )
      return
    }
    this.effectiveWindow = effectiveWindow
    this.accepted = true
    if (this.queue.length > this.effectiveWindow) {
      this.failLocal(
        this.createError('NATIVE_PROTOCOL_VIOLATION', 'Native stream exceeded its queue window', {
          category: 'protocol'
        }),
        'consumer_closed'
      )
    }
  }

  push(packet: NativePacket<NativeStreamFrameV1>): void {
    if (this.released || this.terminal) return
    if (this.pendingCancellation) {
      if (!isValidStreamPacket(packet)) return
      const pendingFrame = packet.control
      if (pendingFrame.streamId !== this.id || pendingFrame.sequence !== this.expectedSequence) {
        return
      }
      this.expectedSequence += 1
      if (pendingFrame.kind === 'stream_end' || pendingFrame.kind === 'stream_error') {
        this.setTerminal(this.pendingCancellation.terminal)
      }
      return
    }
    if (!isValidStreamPacket(packet)) {
      this.failLocal(
        this.createError('NATIVE_PROTOCOL_VIOLATION', 'Native stream packet is invalid', {
          category: 'protocol'
        }),
        'consumer_closed'
      )
      return
    }
    const frame = packet.control
    if (frame.streamId !== this.id || frame.sequence !== this.expectedSequence) {
      this.failLocal(
        this.createError('NATIVE_PROTOCOL_VIOLATION', 'Native stream sequence is invalid', {
          category: 'protocol'
        }),
        'consumer_closed'
      )
      return
    }
    this.expectedSequence += 1

    if (frame.kind === 'stream_data') {
      const item: StreamQueueItem<T> = {
        sequence: frame.sequence,
        result: {
          value: frame.payload as T,
          attachments: packet.attachments,
          attachmentDescriptors: frame.attachments,
          meta: {
            durationMs: 0,
            ...(frame.meta ?? {})
          } as NativeRunMeta
        }
      }
      const waiter = this.waiters.shift()
      if (waiter) {
        const ackError = this.acknowledge(item.sequence)
        if (ackError) waiter.reject(ackError)
        else waiter.resolve({ done: false, value: item.result })
      } else {
        this.queue.push(item)
        const limit = this.accepted ? this.effectiveWindow : this.requestedWindow
        if (this.queue.length > limit) {
          this.failLocal(
            this.createError(
              'NATIVE_PROTOCOL_VIOLATION',
              'Native stream exceeded its queue window',
              {
                category: 'protocol'
              }
            ),
            'consumer_closed'
          )
        }
      }
      return
    }

    if (frame.kind === 'stream_end') {
      this.setTerminal({
        kind: 'end',
        value: frame.payload,
        ...(packet.attachments.length === 0
          ? {}
          : {
              attachments: packet.attachments,
              attachmentDescriptors: frame.attachments
            })
      })
    } else {
      this.setTerminal({
        kind: frame.error.code === 'CANCELLED' ? 'cancelled' : 'error',
        error: NativeTransportError.fromProtocol(frame.error, {
          streamId: this.id,
          carrierId: this.carrier.id
        })
      })
    }
  }

  next(): Promise<IteratorResult<NativeResult<T>>> {
    const item = this.queue.shift()
    if (item) {
      const ackError = this.acknowledge(item.sequence)
      if (ackError) return Promise.reject(ackError)
      return Promise.resolve({ done: false, value: item.result })
    }
    if (this.terminal) return this.finishIterator()
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
  }

  return(): Promise<IteratorResult<NativeResult<T>>> {
    if (!this.terminal && !this.pendingCancellation) {
      this.queue.splice(0)
      this.beginCancellation({ kind: 'cancelled' }, 'consumer_closed')
    }
    return Promise.resolve({ done: true, value: undefined })
  }

  cancel(): void {
    if (this.terminal || this.released || this.pendingCancellation) return
    this.queue.splice(0)
    this.beginCancellation({ kind: 'cancelled' }, 'caller')
  }

  failLocal(error: NativeTransportError, reason?: CancelReason): void {
    if (this.terminal || this.released) return
    if (this.pendingCancellation) {
      this.setTerminal(this.pendingCancellation.terminal)
      return
    }
    this.queue.splice(0)
    this.setTerminal(
      {
        kind: error.code === 'CANCELLED' ? 'cancelled' : 'error',
        error
      },
      reason
    )
  }

  private beginCancellation(
    terminal: NativeStreamTerminal,
    reason: PendingStreamCancellation['reason']
  ): void {
    if (this.terminal || this.released || this.pendingCancellation) return
    this.pendingCancellation = { terminal, reason }
    try {
      this.carrier.cancel('stream', this.id, reason)
    } catch {
      // The local grace timer still guarantees deterministic completion.
    }
    if (this.terminal || this.released || !this.pendingCancellation) return
    this.cancelTimer = setTimeout(() => {
      if (this.pendingCancellation) this.setTerminal(this.pendingCancellation.terminal)
    }, this.cancelGraceMs)
  }

  private setTerminal(terminal: NativeStreamTerminal, reason?: CancelReason): void {
    if (this.terminal || this.released) return
    this.terminal = terminal
    if (reason) {
      try {
        this.carrier.cancel('stream', this.id, reason)
      } catch {
        // Local terminal ownership is authoritative.
      }
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.cancelTimer) clearTimeout(this.cancelTimer)
    this.cancelTimer = null
    this.pendingCancellation = null
    this.removeAbort?.()
    this.removeAbort = null
    this.resolveClosed(terminal)
    this.flushTerminalIfReady()
  }

  private flushTerminalIfReady(): void {
    if (!this.terminal || this.queue.length > 0) return
    const waiters = this.waiters.splice(0)
    if (this.terminal.error) {
      for (const waiter of waiters) waiter.reject(this.terminal.error)
    } else {
      for (const waiter of waiters) waiter.resolve({ done: true, value: undefined })
    }
    if (waiters.length > 0 || this.queue.length === 0) this.release()
  }

  private finishIterator(): Promise<IteratorResult<NativeResult<T>>> {
    const terminal = this.terminal
    this.release()
    if (terminal?.error) return Promise.reject(terminal.error)
    return Promise.resolve({ done: true, value: undefined })
  }

  private acknowledge(sequence: number): NativeTransportError | null {
    try {
      this.carrier.acknowledge(this.id, sequence)
      return null
    } catch (carrierError) {
      const backpressureBroken = isBackpressureCarrierError(carrierError)
      const error = this.createError(
        backpressureBroken ? 'NATIVE_BACKPRESSURE_BROKEN' : 'CARRIER_ACK_FAILED',
        backpressureBroken
          ? 'Native stream backpressure invariant failed'
          : 'Native stream acknowledgement failed',
        {
          category: backpressureBroken ? 'protocol' : 'availability',
          retryable: !backpressureBroken
        }
      )
      this.failLocal(error, 'consumer_closed')
      return error
    }
  }

  private release(): void {
    if (this.released) return
    this.released = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.cancelTimer) clearTimeout(this.cancelTimer)
    this.cancelTimer = null
    this.pendingCancellation = null
    this.removeAbort?.()
    this.removeAbort = null
    try {
      this.carrier.releaseStream(this.id)
    } catch {
      // Carrier-local release errors cannot retain main-process state.
    } finally {
      this.onRelease()
    }
  }
}

function isBackpressureCarrierError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'NATIVE_BACKPRESSURE_BROKEN'
  )
}

function ownInputAttachments(
  attachments: NativeInputAttachment[] | undefined
): NativeInputAttachment[] | undefined {
  if (attachments === undefined) return undefined
  if (!Array.isArray(attachments)) {
    throw new NativeTransportError('ATTACHMENT_MISMATCH', 'Native attachment is invalid', {
      category: 'validation'
    })
  }
  return attachments.map((attachment) => {
    if (
      !attachment ||
      typeof attachment.id !== 'string' ||
      attachment.id.length === 0 ||
      !Buffer.isBuffer(attachment.data)
    ) {
      throw new NativeTransportError('ATTACHMENT_MISMATCH', 'Native attachment is invalid', {
        category: 'validation'
      })
    }
    return { ...attachment, data: Buffer.from(attachment.data) }
  })
}

function isServerHello(value: NativeServerHelloV1): boolean {
  try {
    return validateControl(value).kind === 'server_hello'
  } catch {
    return false
  }
}

function isValidResponsePacket(packet: NativePacket<NativeResponseV1>, requestId: string): boolean {
  try {
    const control = validateControl(packet.control)
    return (
      control.kind === 'response' &&
      control.requestId === requestId &&
      packetAttachmentsMatch(control, packet.attachments)
    )
  } catch {
    return false
  }
}

function isValidStreamPacket(packet: NativePacket<NativeStreamFrameV1>): boolean {
  try {
    const control = validateControl(packet.control)
    return (
      (control.kind === 'stream_data' ||
        control.kind === 'stream_end' ||
        control.kind === 'stream_error') &&
      packetAttachmentsMatch(control, packet.attachments)
    )
  } catch {
    return false
  }
}

function packetAttachmentsMatch(
  control: Extract<
    NativeControlV1,
    { kind: 'response' | 'stream_data' | 'stream_end' | 'stream_error' }
  >,
  attachments: unknown
): attachments is Buffer[] {
  if (!Array.isArray(attachments) || attachments.length !== control.attachments.length) {
    return false
  }
  return control.attachments.every((descriptor, index) => {
    const attachment = attachments[index]
    return (
      descriptor.index === index &&
      Buffer.isBuffer(attachment) &&
      attachment.byteLength === descriptor.byteLength
    )
  })
}

function normalizeAttachments(
  attachments: NativeInputAttachment[] | undefined,
  copyData = false
): {
  descriptors: NativeAttachmentDescriptor[]
  buffers: Buffer[]
} {
  const values = attachments ?? []
  const ids = new Set<string>()
  const descriptors: NativeAttachmentDescriptor[] = []
  const buffers: Buffer[] = []
  for (const [index, attachment] of values.entries()) {
    if (
      !attachment ||
      typeof attachment.id !== 'string' ||
      attachment.id.length === 0 ||
      ids.has(attachment.id) ||
      !Buffer.isBuffer(attachment.data)
    ) {
      throw new NativeTransportError('ATTACHMENT_MISMATCH', 'Native attachment is invalid', {
        category: 'validation'
      })
    }
    ids.add(attachment.id)
    descriptors.push({
      id: attachment.id,
      index,
      byteLength: attachment.data.byteLength,
      ...(attachment.mediaType === undefined ? {} : { mediaType: attachment.mediaType }),
      ...(attachment.purpose === undefined ? {} : { purpose: attachment.purpose })
    })
    buffers.push(copyData ? Buffer.from(attachment.data) : attachment.data)
  }
  return { descriptors, buffers }
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.trunc(value)))
}

function normalizeWindow(value: number | undefined): number {
  if (value === undefined) return 4
  if (!Number.isSafeInteger(value) || value < 1) return 4
  return Math.min(8, value)
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createError: () => Error
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(createError()), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
