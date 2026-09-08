export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly pending: Array<
    | { kind: 'value', value: T }
    | { kind: 'error', error: Error }
    | { kind: 'end' }
  > = []

  private waiter: (() => void) | null = null
  private terminal = false

  push(value: T): void {
    if (this.terminal)
      return
    this.pending.push({ kind: 'value', value })
    this.wake()
  }

  fail(error: Error): void {
    if (this.terminal)
      return
    this.terminal = true
    this.pending.push({ kind: 'error', error })
    this.wake()
  }

  end(): void {
    if (this.terminal)
      return
    this.terminal = true
    this.pending.push({ kind: 'end' })
    this.wake()
  }

  private wake(): void {
    const waiter = this.waiter
    this.waiter = null
    waiter?.()
  }

  async* [Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      while (this.pending.length > 0) {
        const item = this.pending.shift()!
        if (item.kind === 'value') {
          yield item.value
          continue
        }
        if (item.kind === 'error')
          throw item.error
        return
      }

      await new Promise<void>((resolve) => {
        this.waiter = resolve
      })
    }
  }
}

export function createAbortError(reason = 'Voice stream aborted'): VoiceStreamAbortError {
  return new VoiceStreamAbortError(reason)
}

export class VoiceStreamAbortError extends Error {
  readonly code = 'VOICE_STREAM_ABORTED'

  constructor(message: string) {
    super(message)
    this.name = 'VoiceStreamAbortError'
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(typeof signal.reason === 'string' ? signal.reason : undefined)
  }
}

export function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  return new Promise<void>((resolve, reject) => {
    let timer!: ReturnType<typeof setTimeout>
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(createAbortError(typeof signal?.reason === 'string' ? signal.reason : undefined))
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, Math.max(1, ms))
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number | undefined,
  signal?: AbortSignal,
  message = 'Voice provider operation timed out.',
): Promise<T> {
  throwIfAborted(signal)
  const timeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.floor(timeoutMs!)) : 30_000
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = (): void => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      reject(createAbortError(typeof signal?.reason === 'string' ? signal.reason : undefined))
    }
    timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      reject(new Error(message))
    }, timeout)
    signal?.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}
