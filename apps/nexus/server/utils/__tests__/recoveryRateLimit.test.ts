import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { evaluateRecoveryRateLimit } from '../authStore'

/**
 * Bounding recovery-code guesses (#904).
 *
 * Nothing counted attempts: the route called recoverKeyrings on every request, so an app
 * token for the account was enough to submit codes indefinitely. The step-up in that route
 * does not compensate — requireStepUpIfPasskeyEnabled returns early when the device is
 * already trusted or the user has registered no passkeys.
 */

/** A database whose COUNT(*) answers with `count`, whatever is asked. */
function createEvent(count: number, seen: string[][] = []): H3Event {
  const db = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => {
          if (sql.includes('COUNT'))
            seen.push(args.map(String))
          return {
            // countDeviceAuthAudits reads `total`, per `SELECT COUNT(*) AS total`.
            first: async () => (sql.includes('COUNT') ? { total: count } : null),
            all: async () => ({ results: [] }),
            run: async () => ({}),
          }
        },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({}),
      }
    },
    async batch() {
      return []
    },
  }

  return {
    context: { cloudflare: { env: { DB: db } } },
    node: { req: { headers: {} } },
  } as unknown as H3Event
}

describe('evaluateRecoveryRateLimit', () => {
  it('allows an attempt when nothing has failed recently', async () => {
    // Positive control: a limiter that refused everything would satisfy the assertions below
    // while locking every user out of recovery entirely.
    expect(await evaluateRecoveryRateLimit(createEvent(0), { userId: 'u1', deviceId: 'd1' }))
      .toEqual({ allowed: true })
  })

  it('blocks once the per-device budget is spent', async () => {
    const decision = await evaluateRecoveryRateLimit(createEvent(5), { userId: 'u1', deviceId: 'd1' })
    expect(decision.allowed).toBe(false)
    expect(decision.scope).toBe('device')
  })

  it('falls back to the per-user budget when no device id is known', async () => {
    // Without this, dropping the device header would sidestep the limit entirely.
    const decision = await evaluateRecoveryRateLimit(createEvent(10), { userId: 'u1' })
    expect(decision.allowed).toBe(false)
    expect(decision.scope).toBe('user')
  })

  it('counts only failed recovery attempts', async () => {
    // A successful recovery must not consume anyone's budget, and other device-auth actions
    // in the same audit table must not be mistaken for recovery guesses.
    const seen: string[][] = []
    await evaluateRecoveryRateLimit(createEvent(0, seen), { userId: 'u1', deviceId: 'd1' })
    expect(seen.length).toBeGreaterThan(0)
    for (const args of seen) {
      expect(args).toContain('recover')
      expect(args).toContain('failed')
    }
  })
})

/**
 * That the route applies it. The handler needs app auth, a device id and a database, so the
 * call sites are guarded at source level rather than by standing the whole route up.
 */
describe('recover-device route wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../api/v1/keys/recover-device.post.ts', import.meta.url)),
    'utf8',
  )

  it('evaluates the limit before recovering', () => {
    const limitAt = source.indexOf('evaluateRecoveryRateLimit(')
    const recoverAt = source.indexOf('recoverKeyrings(event')
    expect(limitAt, 'rate limit call not found').toBeGreaterThan(-1)
    expect(recoverAt).toBeGreaterThan(limitAt)
  })

  it('refuses with 429 rather than falling through', () => {
    expect(source).toMatch(/if \(!rateLimit\.allowed\)[\s\S]*?429/)
  })

  it('records a failed attempt so the next call can count it', () => {
    // Without this the limiter reads an always-empty table and never fires — the quiet way
    // this kind of fix ends up doing nothing.
    expect(source).toMatch(/status: 'failed'/)
    expect(source).toMatch(/action: 'recover'/)
  })
})
