import {
  decodeHostWireValue,
  encodeHostWireValue,
  type HostWireLimits
} from './plugin-host-wire-codec'
import {
  HOST_PROTOCOL_VERSION,
  parseHostMessage,
  type HostMessageDirection,
  type HostMessageOwner,
  type HostWireMessage,
  type PluginHostResourceKind
} from './plugin-host-wire'

export type PluginHostSessionState =
  | 'handshake'
  | 'ready'
  | 'loading'
  | 'active'
  | 'closing'
  | 'closed'
  | 'violated'

export type PluginHostSessionErrorCode =
  | 'PLUGIN_HOST_SESSION_INVALID_OWNER'
  | 'PLUGIN_HOST_SESSION_INVALID_OPTIONS'
  | 'PLUGIN_HOST_SESSION_ILLEGAL_STATE'
  | 'PLUGIN_HOST_SESSION_DUPLICATE_REQUEST_ID'
  | 'PLUGIN_HOST_SESSION_PENDING_LIMIT'
  | 'PLUGIN_HOST_SESSION_REQUEST_LIMIT'
  | 'PLUGIN_HOST_SESSION_UNKNOWN_RESPONSE'
  | 'PLUGIN_HOST_SESSION_RESPONSE_MISMATCH'
  | 'PLUGIN_HOST_SESSION_HANDSHAKE_MISMATCH'
  | 'PLUGIN_HOST_SESSION_INVALID_CANCEL'
  | 'PLUGIN_HOST_SESSION_REQUEST_CANCELLED'
  | 'PLUGIN_HOST_SESSION_LATE_RESPONSE'
  | 'PLUGIN_HOST_SESSION_SHUTTING_DOWN'
  | 'PLUGIN_HOST_SESSION_CLOSED'
  | 'PLUGIN_HOST_SESSION_VIOLATED'

export class PluginHostSessionError extends Error {
  constructor(readonly code: PluginHostSessionErrorCode) {
    super(code)
    this.name = 'PluginHostSessionError'
  }
}

export interface PluginHostPendingRequest {
  readonly requestId: number
  readonly requestType: RequestMessageType
  readonly direction: HostMessageDirection
  readonly expectedResponse: ResponseMessageType
}

export interface PluginHostSessionCodecOptions {
  limits?: Partial<HostWireLimits>
  registerCallback?: (owner: HostMessageOwner, callback: (...args: unknown[]) => unknown) => string
  unregisterCallback?: (owner: HostMessageOwner, id: string) => void
  resolveCallback?: (
    owner: HostMessageOwner,
    id: string
  ) => ((...args: unknown[]) => unknown) | undefined
  resolveCancel?: (owner: HostMessageOwner, id: string) => unknown
  resolveResource?: (owner: HostMessageOwner, id: string, kind: PluginHostResourceKind) => unknown
}

export interface PluginHostSessionOptions {
  owner: HostMessageOwner
  endpoint?: 'main' | 'child'
  maxPendingRequests?: number
  maxTrackedRequestIds?: number
  codec?: PluginHostSessionCodecOptions
  onPendingRejected?: (pending: PluginHostPendingRequest, error: PluginHostSessionError) => void
  onFatalViolation?: (code: string) => void
}

export type RequestMessageType =
  | 'host-init'
  | 'host-load'
  | 'lifecycle-call'
  | 'capability-call'
  | 'callback-call'

export type ResponseMessageType =
  | 'host-ready'
  | 'load-result'
  | 'lifecycle-result'
  | 'capability-result'
  | 'callback-result'

interface InternalPendingRequest extends PluginHostPendingRequest {
  readonly handshakeNonce?: string
}

const DEFAULT_MAX_PENDING_REQUESTS = 32
const MAX_PENDING_REQUESTS = 32
const DEFAULT_MAX_TRACKED_REQUEST_IDS = 65_536
const MAX_TRACKED_REQUEST_IDS = 65_536
const DIRECTIONS: readonly HostMessageDirection[] = ['main-to-child', 'child-to-main']

const EXPECTED_RESPONSES: Readonly<Record<RequestMessageType, ResponseMessageType>> = Object.freeze(
  {
    'host-init': 'host-ready',
    'host-load': 'load-result',
    'lifecycle-call': 'lifecycle-result',
    'capability-call': 'capability-result',
    'callback-call': 'callback-result'
  }
)

const REQUEST_TYPES = new Set<string>(Object.keys(EXPECTED_RESPONSES))
const RESPONSE_TYPES = new Set<string>(Object.values(EXPECTED_RESPONSES))

const LEGAL_MESSAGES: Readonly<Record<PluginHostSessionState, ReadonlySet<string>>> = Object.freeze(
  {
    handshake: new Set(['host-init', 'host-ready', 'cancel', 'shutdown', 'violation']),
    ready: new Set(['host-load', 'resource-dispose', 'shutdown', 'violation']),
    loading: new Set(['load-result', 'cancel', 'resource-dispose', 'shutdown', 'violation']),
    active: new Set([
      'lifecycle-call',
      'lifecycle-result',
      'capability-call',
      'capability-result',
      'callback-call',
      'callback-result',
      'cancel',
      'resource-dispose',
      'shutdown',
      'violation'
    ]),
    closing: new Set(['resource-dispose', 'violation']),
    closed: new Set<string>(),
    violated: new Set<string>()
  }
)

function oppositeDirection(direction: HostMessageDirection): HostMessageDirection {
  return direction === 'main-to-child' ? 'child-to-main' : 'main-to-child'
}

function snapshotOwner(owner: HostMessageOwner): HostMessageOwner {
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) {
    throw new PluginHostSessionError('PLUGIN_HOST_SESSION_INVALID_OWNER')
  }
  const read = (key: keyof HostMessageOwner): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_INVALID_OWNER')
    }
    return descriptor.value
  }
  const protocolVersion = read('protocolVersion')
  const activationHandle = read('activationHandle')
  const hostGeneration = read('hostGeneration')
  if (
    protocolVersion !== HOST_PROTOCOL_VERSION ||
    typeof activationHandle !== 'string' ||
    activationHandle.length < 1 ||
    activationHandle.length > 128 ||
    !Number.isSafeInteger(hostGeneration) ||
    Number(hostGeneration) < 1
  ) {
    throw new PluginHostSessionError('PLUGIN_HOST_SESSION_INVALID_OWNER')
  }
  return Object.freeze({
    protocolVersion: HOST_PROTOCOL_VERSION,
    activationHandle,
    hostGeneration: Number(hostGeneration)
  })
}

function isRequestMessage(
  message: HostWireMessage
): message is Extract<HostWireMessage, { type: RequestMessageType }> {
  return REQUEST_TYPES.has(message.type)
}

function isResponseMessage(
  message: HostWireMessage
): message is Extract<HostWireMessage, { type: ResponseMessageType }> {
  return RESPONSE_TYPES.has(message.type)
}

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object') return 'PLUGIN_HOST_SESSION_VIOLATED'
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : 'PLUGIN_HOST_SESSION_VIOLATED'
}

export class PluginHostSession {
  readonly owner: HostMessageOwner

  private readonly maxPendingRequests: number
  private readonly maxTrackedRequestIds: number
  private readonly endpoint: 'main' | 'child'
  private readonly codec: PluginHostSessionCodecOptions
  private readonly onPendingRejected?: PluginHostSessionOptions['onPendingRejected']
  private readonly onFatalViolation?: PluginHostSessionOptions['onFatalViolation']
  private readonly pending = new Map<HostMessageDirection, Map<number, InternalPendingRequest>>()
  private readonly seenRequestIds = new Map<HostMessageDirection, Set<number>>()
  private readonly cancelledRequestIds = new Map<HostMessageDirection, Set<number>>()
  private currentState: PluginHostSessionState = 'handshake'
  private initAdmitted = false
  private loadAdmitted = false
  private fatalReported = false
  private shutdownRequestId: number | null = null

  constructor(options: PluginHostSessionOptions) {
    this.owner = snapshotOwner(options.owner)
    const maxPendingRequests = options.maxPendingRequests ?? DEFAULT_MAX_PENDING_REQUESTS
    const maxTrackedRequestIds = options.maxTrackedRequestIds ?? DEFAULT_MAX_TRACKED_REQUEST_IDS
    const codec = options.codec ?? {}
    if (
      !Number.isSafeInteger(maxPendingRequests) ||
      maxPendingRequests < 1 ||
      maxPendingRequests > MAX_PENDING_REQUESTS ||
      !Number.isSafeInteger(maxTrackedRequestIds) ||
      maxTrackedRequestIds < 1 ||
      maxTrackedRequestIds > MAX_TRACKED_REQUEST_IDS ||
      (options.endpoint !== undefined &&
        options.endpoint !== 'main' &&
        options.endpoint !== 'child') ||
      (options.onPendingRejected !== undefined &&
        typeof options.onPendingRejected !== 'function') ||
      (options.onFatalViolation !== undefined && typeof options.onFatalViolation !== 'function') ||
      (codec.registerCallback !== undefined && typeof codec.registerCallback !== 'function') ||
      (codec.unregisterCallback !== undefined && typeof codec.unregisterCallback !== 'function') ||
      (codec.resolveCallback !== undefined && typeof codec.resolveCallback !== 'function') ||
      (codec.resolveCancel !== undefined && typeof codec.resolveCancel !== 'function') ||
      (codec.resolveResource !== undefined && typeof codec.resolveResource !== 'function') ||
      (codec.registerCallback !== undefined && !codec.unregisterCallback)
    ) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_INVALID_OPTIONS')
    }
    this.maxPendingRequests = maxPendingRequests
    this.maxTrackedRequestIds = maxTrackedRequestIds
    this.endpoint = options.endpoint ?? 'main'
    this.codec = Object.freeze({
      ...codec,
      ...(codec.limits ? { limits: Object.freeze({ ...codec.limits }) } : {})
    })
    this.onPendingRejected = options.onPendingRejected
    this.onFatalViolation = options.onFatalViolation
    for (const direction of DIRECTIONS) {
      this.pending.set(direction, new Map())
      this.seenRequestIds.set(direction, new Set())
      this.cancelledRequestIds.set(direction, new Set())
    }
  }

  get state(): PluginHostSessionState {
    return this.currentState
  }

  get pendingCount(): number {
    let count = 0
    for (const pending of this.pending.values()) count += pending.size
    return count
  }

  accept(direction: HostMessageDirection, value: unknown): HostWireMessage {
    if (this.currentState === 'closed') {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_CLOSED')
    }
    if (this.currentState === 'violated') {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_VIOLATED')
    }

    try {
      const parsed = parseHostMessage(direction, this.owner, value)
      if (
        this.currentState === 'closing' &&
        parsed.type === 'shutdown' &&
        this.shutdownRequestId === parsed.requestId
      ) {
        return parsed
      }
      if (!LEGAL_MESSAGES[this.currentState].has(parsed.type)) {
        throw new PluginHostSessionError('PLUGIN_HOST_SESSION_ILLEGAL_STATE')
      }
      if (direction === 'child-to-main') {
        if (isRequestMessage(parsed)) this.assertRequestAdmissible(direction, parsed)
        if (isResponseMessage(parsed)) this.getPendingForResponse(direction, parsed)
      }
      const inboundDirection = this.endpoint === 'main' ? 'child-to-main' : 'main-to-child'
      const message =
        direction === inboundDirection ? this.transformWireValues(direction, parsed) : parsed
      this.applyMessage(direction, message)
      return direction === inboundDirection ? message : this.transformWireValues(direction, message)
    } catch (error) {
      this.enterViolated(codeOf(error))
      throw error
    }
  }

  close(): void {
    if (this.currentState === 'closed' || this.currentState === 'violated') return
    this.currentState = 'closed'
    this.rejectAll('PLUGIN_HOST_SESSION_CLOSED')
  }

  violate(): void {
    this.enterViolated()
  }

  abandonRequest(requestId: number): boolean {
    if (this.currentState === 'closed' || this.currentState === 'violated') return false
    const direction: HostMessageDirection =
      this.endpoint === 'child' ? 'child-to-main' : 'main-to-child'
    const pending = this.pending.get(direction)!.get(requestId)
    if (!pending) return false
    this.pending.get(direction)!.delete(requestId)
    this.cancelledRequestIds.get(direction)!.add(requestId)
    this.notifyRejected(pending, 'PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
    return true
  }

  private transformWireValues(
    direction: HostMessageDirection,
    message: HostWireMessage
  ): HostWireMessage {
    const key = 'payload' in message ? 'payload' : 'result' in message ? 'result' : undefined
    if (!key) return message
    const value = message[key]
    const encodeDirection = this.endpoint === 'main' ? 'main-to-child' : 'child-to-main'
    const transformed =
      direction === encodeDirection
        ? encodeHostWireValue(value, {
            limits: this.codec.limits,
            registerCallback: this.codec.registerCallback
              ? (callback) => this.codec.registerCallback!(this.owner, callback)
              : undefined,
            unregisterCallback: this.codec.unregisterCallback
              ? (id) => this.codec.unregisterCallback!(this.owner, id)
              : undefined
          })
        : decodeHostWireValue(value, {
            limits: this.codec.limits,
            resolveCallback: this.codec.resolveCallback
              ? (id) => this.codec.resolveCallback!(this.owner, id)
              : undefined,
            resolveCancel: this.codec.resolveCancel
              ? (id) => this.codec.resolveCancel!(this.owner, id)
              : undefined,
            resolveResource: this.codec.resolveResource
              ? (id, kind) => this.codec.resolveResource!(this.owner, id, kind)
              : undefined
          })
    return { ...message, [key]: transformed } as HostWireMessage
  }

  private applyMessage(direction: HostMessageDirection, message: HostWireMessage): void {
    if (message.type === 'violation') {
      this.trackRequestId(direction, message.requestId)
      this.enterViolated(message.error.code)
      return
    }

    if (message.type === 'resource-dispose') {
      this.trackRequestId(direction, message.requestId)
      return
    }

    if (message.type === 'cancel') {
      this.applyCancel(direction, message.requestId, message.targetRequestId)
      return
    }

    if (message.type === 'shutdown') {
      this.trackRequestId(direction, message.requestId, true)
      this.shutdownRequestId = message.requestId
      this.currentState = 'closing'
      this.rejectAll('PLUGIN_HOST_SESSION_SHUTTING_DOWN')
      return
    }

    if (isRequestMessage(message)) {
      if (
        (message.type === 'host-init' && this.initAdmitted) ||
        (message.type === 'host-load' && this.loadAdmitted)
      ) {
        throw new PluginHostSessionError('PLUGIN_HOST_SESSION_ILLEGAL_STATE')
      }
      this.assertPendingCapacity()
      this.trackRequestId(direction, message.requestId)
      if (message.type === 'host-init') this.initAdmitted = true
      if (message.type === 'host-load') this.loadAdmitted = true
      this.addPending(direction, message)
      if (message.type === 'host-load') this.currentState = 'loading'
      return
    }

    if (isResponseMessage(message)) {
      this.applyResponse(direction, message)
      return
    }

    throw new PluginHostSessionError('PLUGIN_HOST_SESSION_ILLEGAL_STATE')
  }

  private assertRequestAdmissible(
    direction: HostMessageDirection,
    message: Extract<HostWireMessage, { type: RequestMessageType }>
  ): void {
    if (
      (message.type === 'host-init' && this.initAdmitted) ||
      (message.type === 'host-load' && this.loadAdmitted)
    ) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_ILLEGAL_STATE')
    }
    this.assertPendingCapacity()
    this.assertRequestIdAvailable(direction, message.requestId)
  }

  private addPending(
    direction: HostMessageDirection,
    message: Extract<HostWireMessage, { type: RequestMessageType }>
  ): void {
    const pending: InternalPendingRequest = Object.freeze({
      requestId: message.requestId,
      requestType: message.type,
      direction,
      expectedResponse: EXPECTED_RESPONSES[message.type],
      ...(message.type === 'host-init' ? { handshakeNonce: message.handshakeNonce } : {})
    })
    this.pending.get(direction)!.set(message.requestId, pending)
  }

  private getPendingForResponse(
    direction: HostMessageDirection,
    message: Extract<HostWireMessage, { type: ResponseMessageType }>
  ): InternalPendingRequest {
    const requestDirection = oppositeDirection(direction)
    if (this.cancelledRequestIds.get(requestDirection)!.has(message.requestId)) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_LATE_RESPONSE')
    }
    const pending = this.pending.get(requestDirection)!.get(message.requestId)
    if (!pending) {
      if (this.seenRequestIds.get(requestDirection)!.has(message.requestId)) {
        throw new PluginHostSessionError('PLUGIN_HOST_SESSION_LATE_RESPONSE')
      }
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_UNKNOWN_RESPONSE')
    }
    if (pending.expectedResponse !== message.type) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_RESPONSE_MISMATCH')
    }
    if (message.type === 'host-ready' && pending.handshakeNonce !== message.handshakeNonce) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_HANDSHAKE_MISMATCH')
    }
    return pending
  }

  private applyResponse(
    direction: HostMessageDirection,
    message: Extract<HostWireMessage, { type: ResponseMessageType }>
  ): void {
    const requestDirection = oppositeDirection(direction)
    const pending = this.getPendingForResponse(direction, message)

    this.pending.get(requestDirection)!.delete(pending.requestId)
    switch (message.type) {
      case 'host-ready':
        this.currentState = 'ready'
        break
      case 'load-result':
        this.currentState = message.ok ? 'active' : 'closing'
        break
    }
  }

  private applyCancel(
    direction: HostMessageDirection,
    requestId: number,
    targetRequestId: number
  ): void {
    this.trackRequestId(direction, requestId)
    const pending = this.pending.get(direction)!.get(targetRequestId)
    if (!pending) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_INVALID_CANCEL')
    }
    this.pending.get(direction)!.delete(targetRequestId)
    this.cancelledRequestIds.get(direction)!.add(targetRequestId)
    this.notifyRejected(pending, 'PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
  }

  private trackRequestId(
    direction: HostMessageDirection,
    requestId: number,
    allowShutdownOverflow = false
  ): void {
    this.assertRequestIdAvailable(direction, requestId, allowShutdownOverflow)
    this.seenRequestIds.get(direction)!.add(requestId)
  }

  private assertRequestIdAvailable(
    direction: HostMessageDirection,
    requestId: number,
    allowShutdownOverflow = false
  ): void {
    const seen = this.seenRequestIds.get(direction)!
    if (seen.has(requestId)) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_DUPLICATE_REQUEST_ID')
    }
    if (!allowShutdownOverflow && seen.size >= this.maxTrackedRequestIds) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_REQUEST_LIMIT')
    }
  }

  private assertPendingCapacity(): void {
    if (this.pendingCount >= this.maxPendingRequests) {
      throw new PluginHostSessionError('PLUGIN_HOST_SESSION_PENDING_LIMIT')
    }
  }

  private enterViolated(code?: string): void {
    if (this.currentState === 'closed' || this.currentState === 'violated') return
    this.currentState = 'violated'
    this.rejectAll('PLUGIN_HOST_SESSION_VIOLATED')
    if (!code || this.fatalReported) return
    this.fatalReported = true
    try {
      this.onFatalViolation?.(code)
    } catch {
      // Fatal observers cannot keep authority or pending state alive.
    }
  }

  private rejectAll(code: PluginHostSessionErrorCode): void {
    const pending = DIRECTIONS.flatMap((direction) => [...this.pending.get(direction)!.values()])
    for (const direction of DIRECTIONS) this.pending.get(direction)!.clear()
    for (const request of pending) this.notifyRejected(request, code)
  }

  private notifyRejected(pending: InternalPendingRequest, code: PluginHostSessionErrorCode): void {
    if (!this.onPendingRejected) return
    const publicPending: PluginHostPendingRequest = Object.freeze({
      requestId: pending.requestId,
      requestType: pending.requestType,
      direction: pending.direction,
      expectedResponse: pending.expectedResponse
    })
    try {
      this.onPendingRejected(publicPending, new PluginHostSessionError(code))
    } catch {
      // Rejection observers cannot keep authority or pending state alive.
    }
  }
}
