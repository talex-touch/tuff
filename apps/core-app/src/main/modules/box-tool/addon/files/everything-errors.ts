export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const getErrorCode = (error: unknown): string | undefined => {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class EverythingSearchAbortedError extends Error {
  readonly code = 'ABORT_ERR'

  constructor() {
    super('Everything search aborted')
    this.name = 'AbortError'
  }
}

export class EverythingSearchFallbackError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'EverythingSearchFallbackError'
    this.code = code
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof EverythingSearchAbortedError) {
    return true
  }
  if (!isRecord(error)) {
    return false
  }
  return error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ABORTED'
}

export function isSearchFallbackError(error: unknown): error is EverythingSearchFallbackError {
  return error instanceof EverythingSearchFallbackError
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new EverythingSearchAbortedError()
  }
}

export function createAbortPromise<T = never>(signal?: AbortSignal): Promise<T> | null {
  if (!signal) {
    return null
  }
  if (signal.aborted) {
    return Promise.reject(new EverythingSearchAbortedError())
  }
  return new Promise<T>((_, reject) => {
    signal.addEventListener('abort', () => reject(new EverythingSearchAbortedError()), {
      once: true
    })
  })
}
