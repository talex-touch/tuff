import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { evaluatePasswordSignInRateLimit } from '../authStore'

/**
 * Bounding password guesses (#897).
 *
 * Every failure was written to the login history and never read back, so a loop against the
 * credentials callback with one victim email and a password list ran until it succeeded.
 * PBKDF2 at 210k iterations raises the cost of each guess; it does not limit how many.
 */

/** A database whose COUNT(*) answers with `count`, recording what it was asked. */
function createEvent(count: number, seen: string[][] = [], ip = '203.0.113.5'): H3Event {
  const db = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => {
          if (sql.includes('COUNT'))
            seen.push([sql.replace(/\s+/g, ' ').trim(), ...args.map(String)])
          return {
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
    node: { req: { headers: { 'x-forwarded-for': ip } } },
  } as unknown as H3Event
}

describe('evaluatePasswordSignInRateLimit', () => {
  it('allows a sign-in when nothing has failed recently', async () => {
    // Positive control: a limiter that refused everything would satisfy the assertions below
    // while locking every user out of the site.
    expect(await evaluatePasswordSignInRateLimit(createEvent(0), { userId: 'u1' }))
      .toEqual({ allowed: true })
  })

  it('blocks once the per-account budget is spent', async () => {
    const decision = await evaluatePasswordSignInRateLimit(createEvent(10), { userId: 'u1' })
    expect(decision.allowed).toBe(false)
    expect(decision.scope).toBe('user')
  })

  it('falls back to the per-IP budget when the email matches no account', async () => {
    // userId is null for an address that does not exist, so per-account counting alone would
    // leave guessing against unknown addresses unbounded.
    const decision = await evaluatePasswordSignInRateLimit(createEvent(30), {})
    expect(decision.allowed).toBe(false)
    expect(decision.scope).toBe('ip')
  })

  it('gives the IP a wider budget than a single account', async () => {
    // One shared NAT must not lock out innocent users at the per-account threshold.
    const decision = await evaluatePasswordSignInRateLimit(createEvent(10), {})
    expect(decision.allowed).toBe(true)
  })

  it('counts only failures', async () => {
    // A successful sign-in must never spend anyone's budget.
    const seen: string[][] = []
    await evaluatePasswordSignInRateLimit(createEvent(0, seen), { userId: 'u1' })
    expect(seen.length).toBeGreaterThan(0)
    for (const [sql] of seen)
      expect(sql).toContain('success = 0')
  })
})

/**
 * That the credentials provider applies it. next-auth builds its options inside a Nuxt
 * handler, so the call site is guarded at source level.
 */
describe('credentials sign-in wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../api/auth/[...].ts', import.meta.url)),
    'utf8',
  )

  it('evaluates the limit before verifying the password', () => {
    const limitAt = source.indexOf('evaluatePasswordSignInRateLimit(')
    const verifyAt = source.indexOf('verifyUserPassword(authEvent, email, password)')
    expect(limitAt, 'rate limit call not found').toBeGreaterThan(-1)
    expect(verifyAt).toBeGreaterThan(limitAt)
  })

  it('refuses rather than falling through when the budget is spent', () => {
    expect(source).toMatch(/if \(!rateLimit\.allowed\)[\s\S]*?return null/)
  })

  it('still records the refused attempt', () => {
    // Without a write the limiter would read an always-empty table and never fire again once
    // the window rolled — the quiet way this kind of fix stops working.
    expect(source).toMatch(/reason: 'rate_limited'/)
  })
})
