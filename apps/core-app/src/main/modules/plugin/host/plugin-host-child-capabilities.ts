import type { PluginHostChildCallbackRegistry } from './plugin-host-callbacks'
import type { PluginHostChildResourceClient } from './plugin-host-resources'
import { PluginHostSession } from './plugin-host-session'
import {
  PLUGIN_HOST_CAPABILITIES,
  type HostCapabilityResult,
  type HostMessageOwner,
  type HostWireMessage,
  type PluginHostCapability,
  type PluginHostCapabilityDeclaration,
  type PluginHostCallbackLifetime,
  type PluginHostViolationCode
} from './plugin-host-wire'

export type PluginHostChildCapabilityErrorCode =
  | 'PLUGIN_HOST_UNKNOWN_CAPABILITY'
  | 'PLUGIN_HOST_CAPABILITY_NOT_DECLARED'
  | 'PLUGIN_HOST_CHILD_CAPABILITY_INACTIVE'
  | 'PLUGIN_HOST_CHILD_CAPABILITY_TIMEOUT'
  | 'PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED'
  | 'PLUGIN_HOST_CHILD_CAPABILITY_CLOSED'
  | 'PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL'
  | string

export class PluginHostChildCapabilityError extends Error {
  constructor(readonly code: PluginHostChildCapabilityErrorCode) {
    super(code)
    this.name = 'PluginHostChildCapabilityError'
  }
}

export interface PluginHostChildCapabilityClientOptions {
  owner: HostMessageOwner
  session: PluginHostSession
  capabilityManifest: readonly PluginHostCapabilityDeclaration[]
  callbacks?: PluginHostChildCallbackRegistry
  resources?: PluginHostChildResourceClient
  allocateRequestId: () => number
  postMessage: (message: HostWireMessage) => void
  onFatalViolation: (code: PluginHostViolationCode) => void
  timeoutMs?: number
}

interface PendingCapability {
  readonly requestId: number
  readonly resolve: (result: unknown) => void
  readonly reject: (error: PluginHostChildCapabilityError) => void
  readonly timer: NodeJS.Timeout
  readonly callbackLifetime: PluginHostCallbackLifetime
  readonly scopeId: number | null
}

const FIXED_CAPABILITIES = new Set<string>(PLUGIN_HOST_CAPABILITIES)
const MAX_TIMEOUT_MS = 120_000
// Capability definitions in main own their 5s/30s business deadlines. This is
// only a transport liveness backstop and must not preempt a valid IO call.
const DEFAULT_TIMEOUT_MS = MAX_TIMEOUT_MS
const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/

function stableResultErrorCode(message: HostCapabilityResult): string {
  return message.ok === false && STABLE_ERROR_CODE.test(message.error.code)
    ? message.error.code
    : 'PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL'
}

export class PluginHostChildCapabilityClient {
  private readonly owner: HostMessageOwner
  private readonly session: PluginHostSession
  private readonly manifest: ReadonlyMap<PluginHostCapability, PluginHostCapabilityDeclaration>
  private readonly callbacks?: PluginHostChildCallbackRegistry
  private readonly resources?: PluginHostChildResourceClient
  private readonly allocateRequestId: () => number
  private readonly postMessage: (message: HostWireMessage) => void
  private readonly onFatalViolation: (code: PluginHostViolationCode) => void
  private readonly timeoutMs: number
  private readonly pending = new Map<number, PendingCapability>()
  private readonly cancelledAwaitingResult = new Set<number>()
  private readonly cancelledScopes = new Set<number>()
  private readonly cancellationCodes = new Map<number, string>()
  private closed = false
  private fatalReported = false

  constructor(options: PluginHostChildCapabilityClientOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (
      !options.owner ||
      options.session.owner.activationHandle !== options.owner.activationHandle ||
      options.session.owner.hostGeneration !== options.owner.hostGeneration ||
      !Array.isArray(options.capabilityManifest) ||
      typeof options.allocateRequestId !== 'function' ||
      typeof options.postMessage !== 'function' ||
      typeof options.onFatalViolation !== 'function' ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > MAX_TIMEOUT_MS
    ) {
      throw new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL')
    }
    const manifest = new Map<PluginHostCapability, PluginHostCapabilityDeclaration>()
    for (const declaration of options.capabilityManifest) {
      if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
        throw new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL')
      }
      const keys = Reflect.ownKeys(declaration)
      const idDescriptor = Object.getOwnPropertyDescriptor(declaration, 'id')
      const lifetimeDescriptor = Object.getOwnPropertyDescriptor(declaration, 'callbackLifetime')
      const fieldsDescriptor = Object.getOwnPropertyDescriptor(declaration, 'callbackFields')
      const capability = idDescriptor && 'value' in idDescriptor ? idDescriptor.value : undefined
      const callbackLifetime =
        lifetimeDescriptor && 'value' in lifetimeDescriptor ? lifetimeDescriptor.value : undefined
      const callbackFields =
        fieldsDescriptor && 'value' in fieldsDescriptor ? fieldsDescriptor.value : undefined
      if (
        keys.length !== 3 ||
        !idDescriptor?.enumerable ||
        !lifetimeDescriptor?.enumerable ||
        !fieldsDescriptor?.enumerable ||
        typeof capability !== 'string' ||
        !FIXED_CAPABILITIES.has(capability) ||
        manifest.has(capability as PluginHostCapability) ||
        (callbackLifetime !== 'transient' && callbackLifetime !== 'resource') ||
        !Array.isArray(callbackFields) ||
        callbackFields.some((field) => typeof field !== 'string')
      ) {
        throw new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL')
      }
      manifest.set(
        capability as PluginHostCapability,
        Object.freeze({
          id: capability as PluginHostCapability,
          callbackLifetime,
          callbackFields: Object.freeze([...callbackFields])
        })
      )
    }
    this.owner = options.session.owner
    this.session = options.session
    this.manifest = manifest
    this.callbacks = options.callbacks
    this.resources = options.resources
    this.allocateRequestId = options.allocateRequestId
    this.postMessage = options.postMessage
    this.onFatalViolation = options.onFatalViolation
    this.timeoutMs = timeoutMs
  }

  get pendingCount(): number {
    return this.pending.size
  }

  invoke(capability: string, payload: unknown, scopeId?: number): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_CLOSED')
      )
    }
    if (scopeId !== undefined && (!Number.isSafeInteger(scopeId) || scopeId < 1)) {
      this.failProtocol()
      return Promise.reject(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL')
      )
    }
    if (scopeId !== undefined && this.cancelledScopes.has(scopeId)) {
      return Promise.reject(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED')
      )
    }
    if (!FIXED_CAPABILITIES.has(capability)) {
      return Promise.reject(new PluginHostChildCapabilityError('PLUGIN_HOST_UNKNOWN_CAPABILITY'))
    }
    const declaration = this.manifest.get(capability as PluginHostCapability)
    if (!declaration) {
      return Promise.reject(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CAPABILITY_NOT_DECLARED')
      )
    }
    if (this.session.state !== 'active') {
      return Promise.reject(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_INACTIVE')
      )
    }

    let requestId: number
    let wireMessage: HostWireMessage
    try {
      requestId = this.allocateRequestId()
      if (!Number.isSafeInteger(requestId) || requestId < 0) throw new Error()
      wireMessage = this.session.accept('child-to-main', {
        ...this.owner,
        type: 'capability-call',
        requestId,
        capability: capability as PluginHostCapability,
        payload
      })
    } catch {
      this.failProtocol()
      return Promise.reject(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL')
      )
    }

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectRequest(requestId, 'PLUGIN_HOST_CHILD_CAPABILITY_TIMEOUT', true)
        this.failProtocol()
      }, this.timeoutMs)
      timer.unref?.()
      this.pending.set(requestId, {
        requestId,
        resolve,
        reject,
        timer,
        callbackLifetime: declaration.callbackLifetime,
        scopeId: scopeId ?? null
      })
      try {
        this.postMessage(wireMessage)
      } catch {
        this.rejectRequest(requestId, 'PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL', true)
        this.failProtocol()
      }
    })
  }

  acceptResult(message: HostWireMessage): void {
    if (this.closed) {
      this.failProtocol()
      return
    }
    if (message.type !== 'capability-result') {
      this.failProtocol()
      return
    }
    if (this.cancelledAwaitingResult.has(message.requestId)) {
      this.cancelledAwaitingResult.delete(message.requestId)
      if (
        message.ok === false &&
        stableResultErrorCode(message) === 'PLUGIN_HOST_CAPABILITY_CANCELLED'
      ) {
        return
      }
      this.failProtocol()
      return
    }
    const pending = this.pending.get(message.requestId)
    if (!pending) {
      this.failProtocol()
      return
    }
    this.pending.delete(message.requestId)
    clearTimeout(pending.timer)
    if (message.ok) {
      if (
        pending.callbackLifetime === 'resource' &&
        this.callbacks?.hasRequest(message.requestId)
      ) {
        const resource = this.resources?.inspect(message.result)
        if (!resource) {
          this.callbacks.releaseRequest(message.requestId)
          this.failProtocol()
          pending.reject(
            new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL')
          )
          return
        }
        this.callbacks.retainRequest(message.requestId, resource.id)
      } else {
        this.callbacks?.releaseRequest(message.requestId)
      }
      pending.resolve(message.result)
    } else {
      this.callbacks?.releaseRequest(message.requestId)
      pending.reject(new PluginHostChildCapabilityError(stableResultErrorCode(message)))
    }
  }

  rejectFromSession(requestId: number, code = 'PLUGIN_HOST_CHILD_CAPABILITY_CLOSED'): void {
    const cancellationCode = this.cancellationCodes.get(requestId)
    if (cancellationCode) {
      this.cancellationCodes.delete(requestId)
      this.cancelledAwaitingResult.add(requestId)
    }
    this.rejectRequest(requestId, cancellationCode ?? code, false)
  }

  cancelScope(scopeId: number): void {
    if (!Number.isSafeInteger(scopeId) || scopeId < 1) {
      this.failProtocol()
      return
    }
    this.cancelledScopes.add(scopeId)
    for (const pending of [...this.pending.values()]) {
      if (pending.scopeId === scopeId) this.cancelRequest(pending.requestId)
    }
  }

  releaseScope(scopeId: number): void {
    this.cancelledScopes.delete(scopeId)
  }

  cancelAll(): void {
    this.rejectAll('PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED', true)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.rejectAll('PLUGIN_HOST_CHILD_CAPABILITY_CLOSED', true)
    this.cancelledAwaitingResult.clear()
    this.cancelledScopes.clear()
    this.cancellationCodes.clear()
  }

  private cancelRequest(requestId: number): void {
    if (!this.pending.has(requestId)) return
    const code = 'PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED'
    this.cancellationCodes.set(requestId, code)
    try {
      const message = this.session.accept('child-to-main', {
        ...this.owner,
        type: 'cancel',
        requestId: this.allocateRequestId(),
        targetRequestId: requestId
      })
      if (this.pending.has(requestId)) {
        this.cancellationCodes.delete(requestId)
        this.cancelledAwaitingResult.add(requestId)
        this.rejectRequest(requestId, code, false)
      }
      this.postMessage(message)
    } catch {
      this.cancellationCodes.delete(requestId)
      this.rejectRequest(requestId, 'PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL', true)
      this.failProtocol()
    }
  }

  private rejectAll(code: string, abandon: boolean): void {
    for (const requestId of [...this.pending.keys()]) {
      this.rejectRequest(requestId, code, abandon)
    }
  }

  private rejectRequest(requestId: number, code: string, abandon: boolean): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    clearTimeout(pending.timer)
    if (abandon) {
      try {
        this.session.abandonRequest(requestId)
      } catch {
        this.failProtocol()
      }
    }
    this.callbacks?.releaseRequest(requestId)
    pending.reject(new PluginHostChildCapabilityError(code))
  }

  private failProtocol(): void {
    if (!this.closed) {
      this.closed = true
      this.rejectAll('PLUGIN_HOST_CHILD_CAPABILITY_PROTOCOL', false)
    }
    if (this.fatalReported) return
    this.fatalReported = true
    try {
      this.onFatalViolation('PLUGIN_HOST_VIOLATION_PROTOCOL')
    } catch {
      // Fatal observers cannot preserve pending child authority.
    }
  }
}
