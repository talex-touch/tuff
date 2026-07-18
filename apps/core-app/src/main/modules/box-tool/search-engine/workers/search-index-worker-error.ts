const MAX_CAUSE_DEPTH = 4

export interface SerializedSearchIndexWorkerError {
  name?: string
  message: string
  stack?: string
  code?: string
  rawCode?: number
  cause?: SerializedSearchIndexWorkerError
}

export class SearchIndexWorkerRemoteError extends Error {
  readonly code?: string
  readonly rawCode?: number
  readonly workerStack?: string

  constructor(payload: SerializedSearchIndexWorkerError, cause?: Error) {
    super(payload.message, cause ? { cause } : undefined)
    this.name = payload.name || 'SearchIndexWorkerRemoteError'
    this.code = payload.code
    this.rawCode = payload.rawCode
    this.workerStack = payload.stack
    if (payload.stack) this.stack = payload.stack
  }
}

export function serializeSearchIndexWorkerError(error: unknown): SerializedSearchIndexWorkerError {
  return serializeErrorNode(error, 0, new Set<unknown>())
}

export function deserializeSearchIndexWorkerError(
  payload: SerializedSearchIndexWorkerError | string
): Error {
  if (typeof payload === 'string') return new Error(payload)
  return deserializeErrorNode(payload, 0)
}

function serializeErrorNode(
  error: unknown,
  depth: number,
  visited: Set<unknown>
): SerializedSearchIndexWorkerError {
  if (!error || typeof error !== 'object') {
    return { message: String(error) }
  }
  if (visited.has(error)) {
    return { message: 'Circular worker error cause' }
  }
  visited.add(error)

  const node = error as {
    name?: unknown
    message?: unknown
    stack?: unknown
    code?: unknown
    rawCode?: unknown
    cause?: unknown
    original?: unknown
    error?: unknown
  }
  const nestedCause = node.cause ?? node.original ?? node.error
  return {
    name: typeof node.name === 'string' && node.name.length > 0 ? node.name : undefined,
    message:
      typeof node.message === 'string' && node.message.length > 0 ? node.message : String(error),
    stack: typeof node.stack === 'string' && node.stack.length > 0 ? node.stack : undefined,
    code: typeof node.code === 'string' && node.code.length > 0 ? node.code : undefined,
    rawCode:
      typeof node.rawCode === 'number' && Number.isFinite(node.rawCode) ? node.rawCode : undefined,
    ...(depth < MAX_CAUSE_DEPTH && nestedCause !== undefined
      ? { cause: serializeErrorNode(nestedCause, depth + 1, visited) }
      : {})
  }
}

function deserializeErrorNode(
  payload: SerializedSearchIndexWorkerError,
  depth: number
): SearchIndexWorkerRemoteError {
  const cause =
    depth < MAX_CAUSE_DEPTH && payload.cause
      ? deserializeErrorNode(payload.cause, depth + 1)
      : undefined
  return new SearchIndexWorkerRemoteError(payload, cause)
}
