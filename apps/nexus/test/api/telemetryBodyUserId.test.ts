import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Both telemetry ingestion routes are unauthenticated, so a `userId` in the body
 * is a claim anyone can make about anyone. #901 removed those reads and replaced
 * them with `resolveTelemetryUserId(event)`, which derives identity from the
 * bearer token or session cookie.
 *
 * Nothing pinned that. Reintroducing `body.userId` into record.post.ts passes the
 * entire suite — 266/266 — because the existing telemetryIdentity tests cover the
 * resolver in isolation and never assert what the endpoints feed it (#700).
 *
 * This is a source-level guard, and its limits are worth stating: it proves the
 * body value is not read, not that the resolver is correct. The resolver has its
 * own tests. What it catches is the specific regression of someone re-adding
 * `userId` to the destructured body — which is how the hole existed originally.
 */

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../server')

const ROUTES = ['api/telemetry/record.post.ts', 'api/telemetry/batch.post.ts'] as const

function source(route: string): string {
  return readFileSync(resolve(SERVER_ROOT, route), 'utf8')
}

describe('telemetry ingestion identity', () => {
  it.each(ROUTES)('%s resolves the user from credentials, not from the body', (route) => {
    expect(source(route)).toContain('resolveTelemetryUserId(event)')
  })

  it.each(ROUTES)('%s never destructures userId out of the request body', (route) => {
    const text = source(route)

    // The original defect: `const { eventType, userId, ... } = body`. Also catches
    // the property-access form, which is how I reintroduced it while checking that
    // this gap was real.
    expect(text).not.toMatch(/^\s*userId,\s*$/m)
    expect(text).not.toMatch(/\bbody\s*\.\s*userId\b/)
    expect(text).not.toMatch(/\bbody\s*(?:as[^)]*)?\)?\s*\.\s*userId\b/)
  })

  it('batch resolves once per request rather than once per event', () => {
    // Credentials belong to the connection, so a single batch must not attribute
    // different events to different people.
    const text = source('api/telemetry/batch.post.ts')
    const resolveCalls = text.match(/resolveTelemetryUserId\(/g) ?? []

    expect(resolveCalls).toHaveLength(1)
    // The call has to sit above the per-event map, not inside it.
    expect(text.indexOf('resolveTelemetryUserId(')).toBeLessThan(
      text.indexOf('eventsToProcess.map'),
    )
  })

  it('finds the routes it claims to be checking', () => {
    // Positive control. A moved or renamed route would otherwise make every
    // assertion above vacuous rather than failing.
    for (const route of ROUTES) {
      expect(source(route).length).toBeGreaterThan(200)
    }
  })
})
