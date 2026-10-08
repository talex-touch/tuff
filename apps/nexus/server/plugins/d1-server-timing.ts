import type { H3Event } from 'h3'
import { readCloudflareBindings } from '../utils/cloudflare'
import { createD1RequestTiming, formatD1ServerTiming, instrumentD1Database, runWithD1Timing, type D1RequestTiming } from '../utils/d1Timing'

/**
 * `Server-Timing: d1;desc="N round trips";dur=…, app;dur=…` on every response while
 * `NEXUS_SERVER_TIMING=1` is set for the deployment: how many D1 round trips the request made before
 * responding, how long it waited on them, and how long the handler took. Work deferred past the
 * response (`runAfterResponse`) is not in it. Off unless the variable is set.
 */
function serverTimingEnabled(): boolean {
  // The Pages entry stores the request's env on `globalThis.__env__` before handing it to Nitro.
  const env = (globalThis as { __env__?: Record<string, unknown> }).__env__ ?? process.env
  return env?.NEXUS_SERVER_TIMING === '1'
}

function timingOf(event: H3Event): D1RequestTiming | undefined {
  return (event.context as { d1Timing?: D1RequestTiming }).d1Timing
}

export default defineNitroPlugin((nitroApp) => {
  // Wrapping the app handler is what puts the whole request — hooks, middleware, handler — in one
  // async context; it is how Nitro's own `asyncContext` option does it.
  const handler = nitroApp.h3App.handler
  nitroApp.h3App.handler = (event) => {
    if (!serverTimingEnabled())
      return handler(event)
    const context = event.context as { d1Timing?: D1RequestTiming }
    const timing = createD1RequestTiming()
    context.d1Timing = timing
    return runWithD1Timing(timing, () => handler(event))
  }

  nitroApp.hooks.hook('request', (event) => {
    const db = timingOf(event) ? readCloudflareBindings(event)?.DB : undefined
    if (db)
      instrumentD1Database(db)
  })

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const timing = timingOf(event)
    if (timing && !event.node.res.headersSent)
      setResponseHeader(event, 'server-timing', formatD1ServerTiming(timing))
  })
})
