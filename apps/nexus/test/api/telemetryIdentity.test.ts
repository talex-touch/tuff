import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTelemetryUserId } from '../../server/utils/telemetryIdentity'

/**
 * Who a telemetry event is attributed to (#901).
 *
 * The telemetry routes are unauthenticated — an IP guard only — and took `userId` from the
 * body. Anyone could POST `{eventType: 'search', userId: '<victim>', searchQuery: '…'}` and
 * have it stored as that person's activity, surfacing in the per-user dashboard and in admin
 * analytics. The batch route accepted up to 100 of those per request.
 */

const { requireAppAuth, requireSessionAuth } = vi.hoisted(() => ({
  requireAppAuth: vi.fn(),
  requireSessionAuth: vi.fn(),
}))

vi.mock('../../server/utils/auth', () => ({ requireAppAuth, requireSessionAuth }))

const event = {} as never

describe('resolveTelemetryUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the bearer app token, which is how the desktop app authenticates', async () => {
    requireAppAuth.mockResolvedValue({ userId: 'app-user' })
    expect(await resolveTelemetryUserId(event)).toBe('app-user')
    expect(requireSessionAuth).not.toHaveBeenCalled()
  })

  it('falls back to the session cookie, which is how the dashboard authenticates', async () => {
    // Checking only one credential shape would silently anonymise the other.
    requireAppAuth.mockRejectedValue(new Error('no bearer token'))
    requireSessionAuth.mockResolvedValue({ userId: 'web-user' })
    expect(await resolveTelemetryUserId(event)).toBe('web-user')
  })

  it('returns null when the caller proved nothing', async () => {
    requireAppAuth.mockRejectedValue(new Error('no bearer token'))
    requireSessionAuth.mockRejectedValue(new Error('no session'))
    expect(await resolveTelemetryUserId(event)).toBeNull()
  })

  it('treats an authenticated context with no user id as anonymous', async () => {
    requireAppAuth.mockResolvedValue({ userId: '' })
    requireSessionAuth.mockRejectedValue(new Error('no session'))
    expect(await resolveTelemetryUserId(event)).toBeNull()
  })
})

/**
 * That the routes use it and no longer read the body field.
 *
 * Both handlers need an IP guard, a database and a live request to stand up, so the call
 * sites are guarded at source level. Without this the resolver could be correct and unused.
 */
describe('telemetry route wiring', () => {
  const routes = ['record', 'batch'].map(name => ({
    name,
    source: readFileSync(
      fileURLToPath(new URL(`../../server/api/telemetry/${name}.post.ts`, import.meta.url)),
      'utf8',
    ),
  }))

  it.each(routes)('$name resolves the user id from credentials', ({ source }) => {
    expect(source).toContain('resolveTelemetryUserId(event)')
    expect(source).toContain('userId: resolvedUserId || undefined')
  })

  it.each(routes)('$name no longer takes a user id from the body', ({ source }) => {
    // The specific shapes that used to do it. A body still carrying `userId` is harmless as
    // long as nothing reads it, which is what these assert.
    expect(source).not.toContain('userId: userId || undefined')
    expect(source).not.toContain('userId: e.userId || undefined')
  })

  it.each(routes)('$name marks an unattributed event anonymous whatever the body claims', ({ source }) => {
    // Otherwise an event with no owner could still be stored as non-anonymous, which is the
    // state the per-user dashboard reads.
    expect(source).toMatch(/isAnonymous: resolvedUserId \?/)
  })
})
