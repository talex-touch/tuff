/**
 * Runs `register` against `nitroApp` with the `error` hooks it adds detached from the request.
 *
 * Nitro hands each error hook's promise to the request's `waitUntil`. On Cloudflare, Sentry's
 * request wrapper replaces that `waitUntil` with one that holds its flush lock until every promise
 * given to it settles, and `@sentry/nuxt`'s error hook captures the error and then awaits a flush.
 * The flush waits for the lock, the lock waits for the hook, the hook waits for the flush: on every
 * unhandled error the runtime reported the request's code as hung and cancelled what was still
 * pending for it, the flush that was to send the event among it (`@sentry/nuxt` 10.65.0; 10.76.2
 * and 11.6.0 still await the flush).
 *
 * A detached hook still runs at once, so the capture happens inside the request, but its promise
 * is not the one Nitro waits on: the hook's flush no longer waits for itself, and the request
 * wrapper's own flush — given to the runtime's original `waitUntil` — sends the event once the
 * request's other `waitUntil` work has settled.
 */
interface HookRegistry {
  // `name` is `any` so Nitro's generic, key-typed `hook` fits.
  hook: (name: any, fn: (...args: any[]) => unknown, ...rest: any[]) => unknown
}

export function withDetachedErrorHooks<T extends { hooks: HookRegistry }>(nitroApp: T, register: (nitroApp: T) => void): void {
  const hooks = nitroApp.hooks
  const hook = hooks.hook
  hooks.hook = (name, fn, ...rest) => {
    if (name !== 'error')
      return hook.call(hooks, name, fn, ...rest)
    return hook.call(hooks, name, (...args: unknown[]) => {
      const pending = fn(...args)
      if (pending instanceof Promise) {
        pending.catch((error: unknown) => {
          console.warn('[sentry] error hook failed:', error instanceof Error ? error.message : String(error))
        })
      }
    }, ...rest)
  }
  try {
    register(nitroApp)
  }
  finally {
    hooks.hook = hook
  }
}
