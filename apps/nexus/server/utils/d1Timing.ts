import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Counts the D1 round trips a request makes, for its `Server-Timing` header.
 *
 * A round trip is what the Worker waits for: a statement run on its own (`first`, `all`, `run`,
 * `raw`), a `batch` however many statements it carries, or an `exec`. That is the number this
 * codebase optimises against, and the one a response can now report from the deployment itself
 * rather than from tests or a reading of the code.
 *
 * The binding is instrumented in place, not wrapped: schema, configuration and pricing caches are
 * keyed by the identity of `env.DB`, and a per-request wrapper would miss every one of them. Calls
 * are attributed to the request whose async context made them, so concurrent requests in an isolate
 * do not count each other's queries; calls made outside a timed request pass straight through.
 */

export interface D1RequestTiming {
  roundTrips: number
  /** Wall time with at least one D1 call in flight — parallel calls are not counted twice. */
  busyMs: number
  readonly startedAt: number
  inFlight: number
  busySince: number
}

const timingStorage = new AsyncLocalStorage<D1RequestTiming>()
const INSTRUMENTED = Symbol.for('nexus.d1-timing.instrumented')
const STATEMENT_METHODS = ['first', 'all', 'run', 'raw'] as const

export function createD1RequestTiming(now = Date.now()): D1RequestTiming {
  return { roundTrips: 0, busyMs: 0, startedAt: now, inFlight: 0, busySince: 0 }
}

export function runWithD1Timing<T>(timing: D1RequestTiming, task: () => T): T {
  return timingStorage.run(timing, task)
}

async function timed<T>(call: () => Promise<T>): Promise<T> {
  const timing = timingStorage.getStore()
  if (!timing)
    return call()

  timing.roundTrips += 1
  if (timing.inFlight === 0)
    timing.busySince = Date.now()
  timing.inFlight += 1
  try {
    return await call()
  }
  finally {
    timing.inFlight -= 1
    if (timing.inFlight === 0)
      timing.busyMs += Date.now() - timing.busySince
  }
}

function instrumentStatement(statement: D1PreparedStatement): D1PreparedStatement {
  const target = statement as unknown as Record<string, unknown>
  for (const method of STATEMENT_METHODS) {
    const original = target[method]
    if (typeof original === 'function')
      target[method] = (...args: unknown[]) => timed(() => original.apply(statement, args))
  }
  const bind = target.bind
  if (typeof bind === 'function')
    target.bind = (...values: unknown[]) => instrumentStatement(bind.apply(statement, values))
  return statement
}

/**
 * Instruments `db` once per binding object. Returns false, leaving it untouched, when the binding
 * does not allow its methods to be replaced.
 */
export function instrumentD1Database(db: D1Database): boolean {
  const target = db as unknown as Record<string | symbol, unknown>
  if (target[INSTRUMENTED])
    return true

  const prepare = target.prepare
  const batch = target.batch
  const exec = target.exec
  if (typeof prepare !== 'function')
    return false

  try {
    target.prepare = (sql: string) => instrumentStatement(prepare.call(db, sql))
    if (typeof batch === 'function')
      target.batch = (statements: D1PreparedStatement[]) => timed(() => batch.call(db, statements))
    if (typeof exec === 'function')
      target.exec = (sql: string) => timed(() => exec.call(db, sql))
    target[INSTRUMENTED] = true
    return true
  }
  catch {
    // A frozen binding: put back whatever was replaced before the throw.
    try {
      target.prepare = prepare
      if (typeof batch === 'function')
        target.batch = batch
      if (typeof exec === 'function')
        target.exec = exec
    }
    catch {}
    return false
  }
}

/** `d1;desc="5 round trips";dur=812, app;dur=930` — D1 wait and the whole handler, in ms. */
export function formatD1ServerTiming(timing: D1RequestTiming, now = Date.now()): string {
  const busyMs = timing.busyMs + (timing.inFlight > 0 ? now - timing.busySince : 0)
  const label = timing.roundTrips === 1 ? 'round trip' : 'round trips'
  return `d1;desc="${timing.roundTrips} ${label}";dur=${busyMs}, app;dur=${Math.max(0, now - timing.startedAt)}`
}
