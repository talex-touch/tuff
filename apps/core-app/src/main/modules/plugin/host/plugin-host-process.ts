import process from 'node:process'
import {
  loadPluginPrelude,
  parsePluginHostLoadPayload,
  PluginHostChildError,
  type PluginPreludeLifecycleCall,
  type PluginPreludeRuntime
} from './plugin-host-child-runtime'
import { PluginHostChildCapabilityClient } from './plugin-host-child-capabilities'
import { takePluginHostControlPort, type PluginHostControlPortLike } from './plugin-host-bootstrap'
import { PluginHostSession, type PluginHostPendingRequest } from './plugin-host-session'
import { encodeHostWireValue } from './plugin-host-wire-codec'
import {
  HOST_PROTOCOL_VERSION,
  type HostInit,
  type HostMessageOwner,
  type HostWireMessage,
  type PluginHostViolationCode,
  type StableHostError
} from './plugin-host-wire'

interface UtilityMessageEvent {
  readonly data: unknown
  readonly ports?: UtilityMessagePort[]
}

interface UtilityMessagePort extends PluginHostControlPortLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (event: UtilityMessageEvent) => void): void
  on(event: 'close', listener: () => void): void
  off(event: 'message', listener: (event: UtilityMessageEvent) => void): void
  off(event: 'close', listener: () => void): void
  start(): void
  close(): void
}

interface UtilityParentPort {
  once(event: 'message', listener: (event: UtilityMessageEvent) => void): void
}

interface UtilityProcessShape {
  readonly parentPort?: UtilityParentPort
  once(event: 'disconnect', listener: () => void): void
  exit(code?: number): never
}

const runtimeProcess = process as unknown as UtilityProcessShape
const parentPort = runtimeProcess.parentPort

let controlPort: UtilityMessagePort | null = null
let session: PluginHostSession | null = null
let runtime: PluginPreludeRuntime | null = null
let capabilityClient: PluginHostChildCapabilityClient | null = null
let owner: HostMessageOwner | null = null
let stopping = false
let childRequestId = 0
const activeLifecycle = new Map<number, PluginPreludeLifecycleCall>()

function stableError(code: string): StableHostError {
  return Object.freeze({ code })
}

function childErrorCode(error: unknown, fallback: string): string {
  return error instanceof PluginHostChildError ? error.code : fallback
}

function allocateChildRequestId(): number {
  childRequestId += 1
  return childRequestId
}

function closeAndExit(code: number): void {
  if (stopping) return
  stopping = true
  session?.close()
  session = null
  for (const call of activeLifecycle.values()) call.cancel()
  activeLifecycle.clear()
  runtime?.shutdown()
  runtime = null
  capabilityClient?.close()
  capabilityClient = null
  try {
    controlPort?.off('message', handleControlMessage)
    controlPort?.off('close', handleControlClose)
    controlPort?.close()
  } catch {
    // The process exit remains the final resource barrier.
  }
  controlPort = null
  setImmediate(() => runtimeProcess.exit(code))
}

function failProtocol(code: PluginHostViolationCode): void {
  if (stopping) return
  if (owner && controlPort) {
    const violation: HostWireMessage = {
      ...owner,
      type: 'violation',
      requestId: allocateChildRequestId(),
      error: stableError(code) as StableHostError & { code: PluginHostViolationCode }
    }
    try {
      controlPort.postMessage(violation)
    } catch {
      // A broken port cannot receive diagnostics; process exit is authoritative.
    }
  }
  closeAndExit(1)
}

function readInitialOwner(value: unknown): HostMessageOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
  const expectedKeys = new Set([
    'protocolVersion',
    'activationHandle',
    'hostGeneration',
    'type',
    'requestId',
    'handshakeNonce'
  ])
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== expectedKeys.size) throw new Error()
  const fields: Record<string, unknown> = {}
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expectedKeys.has(key)) throw new Error()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error()
    fields[key] = descriptor.value
  }
  if (
    fields.protocolVersion !== HOST_PROTOCOL_VERSION ||
    fields.type !== 'host-init' ||
    typeof fields.activationHandle !== 'string' ||
    fields.activationHandle.length < 1 ||
    fields.activationHandle.length > 128 ||
    !Number.isSafeInteger(fields.hostGeneration) ||
    Number(fields.hostGeneration) < 1
  ) {
    throw new Error()
  }
  return Object.freeze({
    protocolVersion: HOST_PROTOCOL_VERSION,
    activationHandle: fields.activationHandle,
    hostGeneration: Number(fields.hostGeneration)
  })
}

function send(message: HostWireMessage): void {
  if (stopping || !session || !controlPort) return
  try {
    const wireMessage = session.accept('child-to-main', message)
    controlPort.postMessage(wireMessage)
  } catch {
    failProtocol('PLUGIN_HOST_VIOLATION_PROTOCOL')
  }
}

function rejectPending(pending: PluginHostPendingRequest): void {
  if (pending.requestType === 'capability-call' && pending.direction === 'child-to-main') {
    capabilityClient?.rejectFromSession(pending.requestId)
    return
  }
  if (pending.direction !== 'main-to-child') return
  const active = activeLifecycle.get(pending.requestId)
  if (!active) return
  activeLifecycle.delete(pending.requestId)
  active.cancel()
}

function initializeSession(value: unknown): void {
  try {
    owner = readInitialOwner(value)
    session = new PluginHostSession({
      owner,
      endpoint: 'child',
      onPendingRejected: rejectPending,
      onFatalViolation: () => undefined
    })
    const init = session.accept('main-to-child', value) as HostInit
    send({
      ...owner,
      type: 'host-ready',
      requestId: init.requestId,
      handshakeNonce: init.handshakeNonce
    })
  } catch {
    failProtocol('PLUGIN_HOST_VIOLATION_PROTOCOL')
  }
}

function handleLoad(message: Extract<HostWireMessage, { type: 'host-load' }>): void {
  if (!owner || runtime) {
    failProtocol('PLUGIN_HOST_VIOLATION_STATE')
    return
  }
  try {
    const payload = parsePluginHostLoadPayload(message.payload)
    capabilityClient = new PluginHostChildCapabilityClient({
      owner,
      session: session!,
      capabilityManifest: payload.capabilityManifest,
      allocateRequestId: allocateChildRequestId,
      postMessage: (wireMessage) => controlPort!.postMessage(wireMessage),
      onFatalViolation: failProtocol
    })
    runtime = loadPluginPrelude(payload, {
      invokeCapability: (capability, capabilityPayload) =>
        capabilityClient!.invoke(capability, capabilityPayload),
      cancelCapabilities: () => capabilityClient?.cancelAll(),
      onUnhandledError: () => failProtocol('PLUGIN_HOST_VIOLATION_RUNTIME')
    })
    send({
      ...owner,
      type: 'load-result',
      requestId: message.requestId,
      ok: true,
      result: { methods: runtime.methods }
    })
  } catch (error) {
    capabilityClient?.close()
    capabilityClient = null
    send({
      ...owner,
      type: 'load-result',
      requestId: message.requestId,
      ok: false,
      error: stableError(childErrorCode(error, 'PLUGIN_HOST_CHILD_SCRIPT_FAILED'))
    })
  }
}

function handleLifecycle(message: Extract<HostWireMessage, { type: 'lifecycle-call' }>): void {
  if (!owner || !runtime || activeLifecycle.has(message.requestId)) {
    failProtocol('PLUGIN_HOST_VIOLATION_STATE')
    return
  }
  const call = runtime.callLifecycle(message.method, message.payload)
  activeLifecycle.set(message.requestId, call)
  void call.promise.then(
    (result) => {
      if (stopping || activeLifecycle.get(message.requestId) !== call) return
      activeLifecycle.delete(message.requestId)
      try {
        encodeHostWireValue(result)
        send({
          ...owner!,
          type: 'lifecycle-result',
          requestId: message.requestId,
          ok: true,
          result
        })
      } catch {
        send({
          ...owner!,
          type: 'lifecycle-result',
          requestId: message.requestId,
          ok: false,
          error: stableError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        })
      }
    },
    (error) => {
      if (stopping || activeLifecycle.get(message.requestId) !== call) return
      activeLifecycle.delete(message.requestId)
      send({
        ...owner!,
        type: 'lifecycle-result',
        requestId: message.requestId,
        ok: false,
        error: stableError(childErrorCode(error, 'PLUGIN_HOST_CHILD_LIFECYCLE_FAILED'))
      })
    }
  )
}

function handleCallback(message: Extract<HostWireMessage, { type: 'callback-call' }>): void {
  if (!owner) return
  send({
    ...owner,
    type: 'callback-result',
    requestId: message.requestId,
    ok: false,
    error: stableError('PLUGIN_HOST_CHILD_CALLBACK_UNSUPPORTED')
  })
}

function handleControlMessage(event: UtilityMessageEvent): void {
  if (stopping) return
  if (!session) {
    initializeSession(event.data)
    return
  }

  let message: HostWireMessage
  try {
    message = session.accept('main-to-child', event.data)
  } catch {
    failProtocol('PLUGIN_HOST_VIOLATION_PROTOCOL')
    return
  }

  switch (message.type) {
    case 'host-load':
      handleLoad(message)
      return
    case 'lifecycle-call':
      handleLifecycle(message)
      return
    case 'capability-result':
      capabilityClient?.acceptResult(message)
      return
    case 'callback-call':
      handleCallback(message)
      return
    case 'cancel':
    case 'resource-dispose':
      return
    case 'shutdown':
      closeAndExit(0)
      return
    default:
      failProtocol('PLUGIN_HOST_VIOLATION_STATE')
  }
}

function handleControlClose(): void {
  closeAndExit(0)
}

function acceptControlPort(event: UtilityMessageEvent): void {
  const accepted = takePluginHostControlPort(event)
  if (!accepted) {
    closeAndExit(1)
    return
  }
  controlPort = accepted as UtilityMessagePort
  try {
    controlPort.on('message', handleControlMessage)
    controlPort.on('close', handleControlClose)
    controlPort.start()
  } catch {
    closeAndExit(1)
  }
}

runtimeProcess.once('disconnect', () => closeAndExit(0))
if (parentPort) parentPort.once('message', acceptControlPort)
else closeAndExit(1)
