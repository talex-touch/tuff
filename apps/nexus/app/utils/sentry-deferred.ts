/**
 * Holds errors that happen before the Sentry SDK is loaded, so deferring the SDK past
 * hydration loses nothing.
 *
 * The SDK used to be awaited inside a Nuxt plugin, which put its ~47 KB chunk and one full
 * round trip between DOMContentLoaded and the first interactive frame on every page. Now the
 * page installs these two listeners synchronously (a few dozen bytes of work), mounts, and only
 * then loads the SDK; whatever was caught in between is handed over once `flush` runs.
 */
export interface BufferedError {
  error: unknown
  kind: 'error' | 'unhandledrejection'
}

export interface ErrorBufferTarget {
  addEventListener: (type: 'error' | 'unhandledrejection', listener: (event: any) => void) => void
  removeEventListener: (type: 'error' | 'unhandledrejection', listener: (event: any) => void) => void
}

export const ERROR_BUFFER_LIMIT = 20

export interface ErrorBuffer {
  readonly size: number
  /** Removes the listeners and hands every buffered error to `capture`, oldest first. */
  flush: (capture: (error: unknown, hint: { kind: BufferedError['kind'] }) => void) => number
  /** Removes the listeners and drops what was buffered. */
  dispose: () => void
}

export function installErrorBuffer(target: ErrorBufferTarget, limit = ERROR_BUFFER_LIMIT): ErrorBuffer {
  const buffered: BufferedError[] = []
  let dropped = 0

  const push = (entry: BufferedError) => {
    if (buffered.length >= limit) {
      dropped += 1
      return
    }
    buffered.push(entry)
  }
  const onError = (event: { error?: unknown, message?: unknown }) => {
    push({ error: event?.error ?? event?.message ?? event, kind: 'error' })
  }
  const onRejection = (event: { reason?: unknown }) => {
    push({ error: event?.reason ?? event, kind: 'unhandledrejection' })
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)

  let installed = true
  const remove = () => {
    if (!installed)
      return
    installed = false
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }

  return {
    get size() {
      return buffered.length
    },
    flush(capture) {
      remove()
      const entries = buffered.splice(0, buffered.length)
      for (const entry of entries)
        capture(entry.error, { kind: entry.kind })
      if (dropped > 0)
        capture(new Error(`${dropped} earlier error(s) were dropped before Sentry loaded`), { kind: 'error' })
      const flushed = entries.length + (dropped > 0 ? 1 : 0)
      dropped = 0
      return flushed
    },
    dispose() {
      remove()
      buffered.length = 0
      dropped = 0
    },
  }
}

/**
 * Runs `task` after the page has had a chance to become interactive: on the idle callback when
 * the browser has one, and no later than `timeoutMs` either way.
 */
export function scheduleAfterIdle(task: () => void, timeoutMs: number, win: {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  setTimeout: (callback: () => void, ms: number) => unknown
}) {
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(task, { timeout: timeoutMs })
    return
  }
  win.setTimeout(task, timeoutMs)
}
