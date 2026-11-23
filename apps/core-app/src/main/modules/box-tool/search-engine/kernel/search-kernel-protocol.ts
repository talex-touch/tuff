export const SEARCH_KERNEL_PROTOCOL_VERSION = 1 as const

/** The utility process name Electron reports for the Search & Index Kernel. */
export const SEARCH_KERNEL_SERVICE_NAME = 'Tuff Search & Index Kernel'

/** Bundled entry filename emitted by electron-vite for the Search & Index Kernel utility process. */
export const SEARCH_KERNEL_ENTRY_FILENAME = 'search-kernel-process.js'

export const SEARCH_KERNEL_ERROR_CODES = {
  INVALID_MESSAGE: 'KERNEL_INVALID_MESSAGE',
  PROTOCOL_ERROR: 'KERNEL_PROTOCOL_ERROR',
  UNKNOWN_OPERATION: 'KERNEL_UNKNOWN_OPERATION',
  UNKNOWN_TASK: 'KERNEL_UNKNOWN_TASK',
  TASK_FAILED: 'KERNEL_TASK_FAILED',
  SHUTTING_DOWN: 'KERNEL_SHUTTING_DOWN',
  NOT_READY: 'KERNEL_NOT_READY',
  TIMEOUT: 'KERNEL_TIMEOUT',
  ABORTED: 'KERNEL_ABORTED',
  EXITED: 'KERNEL_EXITED',
  DEGRADED: 'KERNEL_DEGRADED',
  INVALID_RESPONSE: 'KERNEL_INVALID_RESPONSE'
} as const

export type SearchKernelErrorCode =
  (typeof SEARCH_KERNEL_ERROR_CODES)[keyof typeof SEARCH_KERNEL_ERROR_CODES]

export type SearchKernelProcessState = 'starting' | 'ready' | 'draining' | 'stopped'

export type SearchKernelLifecycleState =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'draining'
  | 'stopped'
  | 'degraded'

export type SearchKernelOperation =
  | 'kernel.ping'
  | 'kernel.health'
  | 'kernel.memory'
  | 'kernel.shutdown'
  | 'kernel.task'

export interface SearchKernelMemorySnapshot {
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  externalBytes: number
  arrayBuffersBytes: number
  pid: number
  capturedAt: number
}

export interface SearchKernelErrorPayload {
  code: string
  message: string
  retryable: boolean
}

export interface SearchKernelPingResult {
  ok: true
  pid: number
  uptimeMs: number
  version: number
}

export interface SearchKernelHealthResult {
  ok: true
  state: SearchKernelProcessState
  pid: number
  uptimeMs: number
  memory: SearchKernelMemorySnapshot
  capabilities: string[]
  activeRequests: number
}

export interface SearchKernelShutdownResult {
  ok: true
  pid: number
  drainedRequests: number
}

export interface SearchKernelPingRequest {
  kind: 'request'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.ping'
}

export interface SearchKernelHealthRequest {
  kind: 'request'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.health'
}

export interface SearchKernelMemoryRequest {
  kind: 'request'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.memory'
}

export interface SearchKernelShutdownRequest {
  kind: 'request'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.shutdown'
  reason?: string
}

export interface SearchKernelTaskRequest<TPayload = unknown> {
  kind: 'request'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.task'
  taskType: string
  payload?: TPayload
}

export type SearchKernelRequest =
  | SearchKernelPingRequest
  | SearchKernelHealthRequest
  | SearchKernelMemoryRequest
  | SearchKernelShutdownRequest
  | SearchKernelTaskRequest

export interface SearchKernelPingResponse {
  kind: 'response'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.ping'
  ok: true
  result: SearchKernelPingResult
}

export interface SearchKernelHealthResponse {
  kind: 'response'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.health'
  ok: true
  result: SearchKernelHealthResult
}

export interface SearchKernelMemoryResponse {
  kind: 'response'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.memory'
  ok: true
  result: SearchKernelMemorySnapshot
}

export interface SearchKernelShutdownResponse {
  kind: 'response'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.shutdown'
  ok: true
  result: SearchKernelShutdownResult
}

export interface SearchKernelTaskResponse<TResult = unknown> {
  kind: 'response'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: 'kernel.task'
  ok: true
  result: TResult
}

export interface SearchKernelErrorResponse {
  kind: 'response'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  requestId: string
  op: SearchKernelOperation | 'unknown'
  ok: false
  error: SearchKernelErrorPayload
}

export type SearchKernelSuccessResponse =
  | SearchKernelPingResponse
  | SearchKernelHealthResponse
  | SearchKernelMemoryResponse
  | SearchKernelShutdownResponse
  | SearchKernelTaskResponse

export type SearchKernelResponse = SearchKernelSuccessResponse | SearchKernelErrorResponse

export interface SearchKernelReadyEvent {
  kind: 'event'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  event: 'kernel.ready'
  pid: number
  version: number
  capabilities: string[]
  startedAt: number
}

export interface SearchKernelDrainingEvent {
  kind: 'event'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  event: 'kernel.draining'
  pid: number
  activeRequests: number
  reason?: string
}

export interface SearchKernelErrorEvent {
  kind: 'event'
  protocolVersion: typeof SEARCH_KERNEL_PROTOCOL_VERSION
  event: 'kernel.error'
  pid: number
  error: SearchKernelErrorPayload
}

export type SearchKernelEvent =
  | SearchKernelReadyEvent
  | SearchKernelDrainingEvent
  | SearchKernelErrorEvent

export const MAX_SEARCH_KERNEL_ERROR_CODE_LENGTH = 64
export const MAX_SEARCH_KERNEL_ERROR_MESSAGE_LENGTH = 512

const VALID_OPERATIONS = new Set<string>([
  'kernel.ping',
  'kernel.health',
  'kernel.memory',
  'kernel.shutdown',
  'kernel.task'
])

const VALID_PROCESS_STATES = new Set<string>(['starting', 'ready', 'draining', 'stopped'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isSearchKernelOperation(value: unknown): value is SearchKernelOperation {
  return typeof value === 'string' && VALID_OPERATIONS.has(value)
}

export function isSearchKernelMemorySnapshot(value: unknown): value is SearchKernelMemorySnapshot {
  if (!isRecord(value)) return false
  return (
    isNonNegativeFiniteNumber(value.rssBytes) &&
    isNonNegativeFiniteNumber(value.heapUsedBytes) &&
    isNonNegativeFiniteNumber(value.heapTotalBytes) &&
    isNonNegativeFiniteNumber(value.externalBytes) &&
    isNonNegativeFiniteNumber(value.arrayBuffersBytes) &&
    isNonNegativeFiniteNumber(value.pid) &&
    isNonNegativeFiniteNumber(value.capturedAt)
  )
}

export function isSearchKernelErrorPayload(value: unknown): value is SearchKernelErrorPayload {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value.code) &&
    value.code.length <= MAX_SEARCH_KERNEL_ERROR_CODE_LENGTH &&
    isNonEmptyString(value.message) &&
    value.message.length <= MAX_SEARCH_KERNEL_ERROR_MESSAGE_LENGTH &&
    typeof value.retryable === 'boolean'
  )
}

export function isSearchKernelPingResult(value: unknown): value is SearchKernelPingResult {
  if (!isRecord(value)) return false
  return (
    value.ok === true &&
    isNonNegativeFiniteNumber(value.pid) &&
    isNonNegativeFiniteNumber(value.uptimeMs) &&
    isNonNegativeFiniteNumber(value.version)
  )
}

export function isSearchKernelHealthResult(value: unknown): value is SearchKernelHealthResult {
  if (!isRecord(value)) return false
  return (
    value.ok === true &&
    typeof value.state === 'string' &&
    VALID_PROCESS_STATES.has(value.state) &&
    isNonNegativeFiniteNumber(value.pid) &&
    isNonNegativeFiniteNumber(value.uptimeMs) &&
    isSearchKernelMemorySnapshot(value.memory) &&
    isStringArray(value.capabilities) &&
    isNonNegativeFiniteNumber(value.activeRequests)
  )
}

export function isSearchKernelShutdownResult(value: unknown): value is SearchKernelShutdownResult {
  if (!isRecord(value)) return false
  return (
    value.ok === true &&
    isNonNegativeFiniteNumber(value.pid) &&
    isNonNegativeFiniteNumber(value.drainedRequests)
  )
}

export function isSearchKernelRequest(value: unknown): value is SearchKernelRequest {
  if (!isRecord(value)) return false
  if (value.kind !== 'request') return false
  if (value.protocolVersion !== SEARCH_KERNEL_PROTOCOL_VERSION) return false
  if (!isNonEmptyString(value.requestId)) return false
  if (!isSearchKernelOperation(value.op)) return false

  if (value.op === 'kernel.shutdown') {
    return value.reason === undefined || typeof value.reason === 'string'
  }
  if (value.op === 'kernel.task') {
    return isNonEmptyString(value.taskType)
  }
  return true
}

export function isSearchKernelResponse(value: unknown): value is SearchKernelResponse {
  if (!isRecord(value)) return false
  if (value.kind !== 'response') return false
  if (value.protocolVersion !== SEARCH_KERNEL_PROTOCOL_VERSION) return false
  if (!isNonEmptyString(value.requestId)) return false
  if (typeof value.ok !== 'boolean') return false

  if (value.ok === false) {
    const validOp = value.op === 'unknown' || isSearchKernelOperation(value.op)
    return validOp && isSearchKernelErrorPayload(value.error)
  }

  if (!isSearchKernelOperation(value.op)) return false

  switch (value.op) {
    case 'kernel.ping':
      return isSearchKernelPingResult(value.result)
    case 'kernel.health':
      return isSearchKernelHealthResult(value.result)
    case 'kernel.memory':
      return isSearchKernelMemorySnapshot(value.result)
    case 'kernel.shutdown':
      return isSearchKernelShutdownResult(value.result)
    case 'kernel.task':
      return 'result' in value
  }
}

export function isSearchKernelEvent(value: unknown): value is SearchKernelEvent {
  if (!isRecord(value)) return false
  if (value.kind !== 'event') return false
  if (value.protocolVersion !== SEARCH_KERNEL_PROTOCOL_VERSION) return false
  if (!isNonNegativeFiniteNumber(value.pid)) return false

  switch (value.event) {
    case 'kernel.ready':
      return (
        isNonNegativeFiniteNumber(value.version) &&
        isStringArray(value.capabilities) &&
        isNonNegativeFiniteNumber(value.startedAt)
      )
    case 'kernel.draining':
      return (
        isNonNegativeFiniteNumber(value.activeRequests) &&
        (value.reason === undefined || typeof value.reason === 'string')
      )
    case 'kernel.error':
      return isSearchKernelErrorPayload(value.error)
    default:
      return false
  }
}

/**
 * Normalizes an arbitrary thrown value into a bounded, IPC-safe error payload.
 * Stack frames and multiline internals are stripped so child internals do not leak over IPC.
 */
export function serializeSearchKernelError(
  error: unknown,
  fallbackCode: string = SEARCH_KERNEL_ERROR_CODES.TASK_FAILED,
  fallbackRetryable = false
): SearchKernelErrorPayload {
  const rawCode =
    isRecord(error) && isNonEmptyString(error.code) ? error.code.trim() : fallbackCode.trim()
  const code = (rawCode || SEARCH_KERNEL_ERROR_CODES.TASK_FAILED).slice(
    0,
    MAX_SEARCH_KERNEL_ERROR_CODE_LENGTH
  )

  const retryable =
    isRecord(error) && typeof error.retryable === 'boolean' ? error.retryable : fallbackRetryable

  let rawMessage = ''
  if (error instanceof Error) {
    rawMessage = error.message
  } else if (isRecord(error) && typeof error.message === 'string') {
    rawMessage = error.message
  } else if (typeof error === 'string') {
    rawMessage = error
  }

  const firstLine = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('at '))

  const sanitized = (firstLine || 'Search kernel operation failed').slice(
    0,
    MAX_SEARCH_KERNEL_ERROR_MESSAGE_LENGTH
  )

  return {
    code,
    message: sanitized,
    retryable
  }
}
