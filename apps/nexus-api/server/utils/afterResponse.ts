import type { H3Event } from 'h3'

/**
 * Runs `task` after the response, on the Worker's `waitUntil` when the runtime offers one, so a write
 * the response does not depend on (a "last used" stamp, an audit row) costs the caller no round trip.
 * Without `waitUntil` (Node dev server, tests) the task still runs, unawaited. Failures are logged,
 * never thrown: the response has already been decided.
 */
export function runAfterResponse(event: H3Event | undefined, label: string, task: () => Promise<unknown>): void {
  const pending = Promise.resolve()
    .then(task)
    .catch((error) => {
      console.warn(`[after-response] ${label} failed:`, error instanceof Error ? error.message : String(error))
    })

  // Called as methods: the Worker's ExecutionContext rejects a detached `waitUntil`.
  const context = event?.context as Record<string, any> | undefined
  if (typeof context?.waitUntil === 'function')
    context.waitUntil(pending)
  else if (typeof context?.cloudflare?.context?.waitUntil === 'function')
    context.cloudflare.context.waitUntil(pending)
  else if (typeof context?._platform?.cloudflare?.context?.waitUntil === 'function')
    context._platform.cloudflare.context.waitUntil(pending)
}
