import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'
import { evaluateRecoveryRateLimit, getUserById } from '../authStore'

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

/**
 * Bounding recovery-code guesses (#904).
 *
 * Nothing counted attempts: the route called recoverKeyrings on every request, so an app
 * token for the account was enough to submit codes indefinitely. The step-up in that route
 * does not compensate — requireStepUpIfPasskeyEnabled returns early when the device is
 * already trusted or the user has registered no passkeys.
 */

let sqlite: SqliteD1Database

function createEvent(): H3Event {
  return {
    context: { cloudflare: { env: { DB: sqlite } } },
    node: { req: { headers: {} } },
  } as unknown as H3Event
}

function insertAudit(action: string, status: string, ids: { userId?: string, deviceId?: string }) {
  sqlite.sqlite.prepare(`
    INSERT INTO auth_device_auth_audits (id, action, status, user_id, device_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), action, status, ids.userId ?? null, ids.deviceId ?? null, new Date().toISOString())
}

beforeEach(async () => {
  sqlite = createSqliteD1()
  // Creates the auth tables through the schema gate.
  await getUserById(createEvent(), 'warm')
})

describe('evaluateRecoveryRateLimit', () => {
  it('allows an attempt when nothing has failed recently', async () => {
    // Positive control: a limiter that refused everything would satisfy the assertions below
    // while locking every user out of recovery entirely.
    expect(await evaluateRecoveryRateLimit(createEvent(), { userId: 'u1', deviceId: 'd1' }))
      .toEqual({ allowed: true })
  })

  it('blocks once the per-device budget is spent', async () => {
    for (let index = 0; index < 5; index++)
      insertAudit('recover', 'failed', { userId: 'u1', deviceId: 'd1' })
    const decision = await evaluateRecoveryRateLimit(createEvent(), { userId: 'u1', deviceId: 'd1' })
    expect(decision.allowed).toBe(false)
    expect(decision.scope).toBe('device')
  })

  it('falls back to the per-user budget when no device id is known', async () => {
    // Without this, dropping the device header would sidestep the limit entirely.
    for (let index = 0; index < 10; index++)
      insertAudit('recover', 'failed', { userId: 'u1', deviceId: `d${index}` })
    const decision = await evaluateRecoveryRateLimit(createEvent(), { userId: 'u1' })
    expect(decision.allowed).toBe(false)
    expect(decision.scope).toBe('user')
  })

  it('counts only failed recovery attempts', async () => {
    // A successful recovery must not consume anyone's budget, and other device-auth actions
    // in the same audit table must not be mistaken for recovery guesses.
    for (let index = 0; index < 10; index++) {
      insertAudit('recover', 'success', { userId: 'u1', deviceId: 'd1' })
      insertAudit('request', 'failed', { userId: 'u1', deviceId: 'd1' })
    }
    expect(await evaluateRecoveryRateLimit(createEvent(), { userId: 'u1', deviceId: 'd1' }))
      .toEqual({ allowed: true })
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
