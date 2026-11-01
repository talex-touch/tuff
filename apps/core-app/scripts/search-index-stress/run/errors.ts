export type DriverErrorKind =
  | 'page-missing' // the injected driver is gone (page reloaded or target closed)
  | 'cdp' // the debugging connection failed
  | 'main-error' // main answered with a non-200 code
  | 'timeout' // no answer within the allowed time
  | 'protocol' // an answer arrived but not in the expected shape

/** Anything that stops the driver from observing the app; never an app verdict by itself. */
export class DriverError extends Error {
  constructor(
    readonly kind: DriverErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'DriverError'
  }
}

/** Raised to end a run early; `reason` is machine-readable and lands in the report meta. */
export class RunAbort extends Error {
  constructor(
    readonly reason: string,
    message: string
  ) {
    super(message)
    this.name = 'RunAbort'
  }
}

/** A precondition for starting is not met; nothing was launched or changed (exit code 2). */
export class RunRefused extends Error {
  constructor(
    message: string,
    readonly reasons: readonly string[] = [message]
  ) {
    super(message)
    this.name = 'RunRefused'
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RunAbort('aborted', 'run aborted')
}
