/**
 * Shared pure event-loop yield and abortable async helpers extracted from `file-provider.ts` (F3).
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

export async function sleepWithAbort(durationMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      finish()
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      finish()
      resolve()
    }, durationMs)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

export async function awaitWithAbort(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await promise
    return
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      () => {
        signal.removeEventListener('abort', abort)
        resolve()
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
    if (signal.aborted) abort()
  })
}
