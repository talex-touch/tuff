import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as H3 from 'h3'
import type { H3Event } from 'h3'

const authMocks = vi.hoisted(() => ({
  requireAppAuth: vi.fn(),
  requireVerifiedEmail: vi.fn(),
}))

const rateLimitMocks = vi.hoisted(() => ({
  enforceAdminRateLimit: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
  releaseConsumedCredits: vi.fn(),
}))

const pricingMocks = vi.hoisted(() => ({
  computeCreditReservation: vi.fn(),
  resolveSellableCreditPricingRule: vi.fn(),
}))

const realtimeStoreMocks = vi.hoisted(() => ({
  REALTIME_ASR_MAX_CONCURRENT_SESSIONS: 2,
  REALTIME_ASR_TTL_SECONDS: 300,
  REALTIME_ASR_SETTLE_GRACE_MS: 60_000,
  countActiveRealtimeAsrSessions: vi.fn(),
  createRealtimeAsrSession: vi.fn(),
  expireStaleRealtimeAsrSessions: vi.fn(),
  markRealtimeAsrSessionReleased: vi.fn(),
  claimRealtimeAsrSessionForSettlement: vi.fn(),
  getRealtimeAsrSession: vi.fn(),
  markRealtimeAsrSessionCreditsReleased: vi.fn(),
  markRealtimeAsrSessionExpired: vi.fn(),
}))

const asrServiceMocks = vi.hoisted(() => ({
  resolveDashScopeAsrProvider: vi.fn(),
}))

const dashscopeMocks = vi.hoisted(() => ({
  createDashScopeEphemeralToken: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof H3>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../../server/utils/adminRateLimitStore', () => rateLimitMocks)
vi.mock('../../../../../server/utils/creditsStore', () => creditsMocks)
vi.mock('../../../../../server/utils/creditPricingStore', () => pricingMocks)
vi.mock('../../../../../server/utils/asrRealtimeSessionStore', () => realtimeStoreMocks)
vi.mock('../../../../../server/utils/asrTranscriptionService', () => asrServiceMocks)
vi.mock('../../../../../server/utils/dashscopeAsrProvider', () => dashscopeMocks)

interface GlobalEventHandlerScope {
  defineEventHandler?: (fn: unknown) => unknown
}
const globalScope = globalThis as unknown as GlobalEventHandlerScope
const originalDefineEventHandler = globalScope.defineEventHandler

let tokenHandler: (event: H3Event) => Promise<any>
let settleHandler: (event: H3Event) => Promise<any>

beforeAll(async () => {
  globalScope.defineEventHandler = (fn: unknown) => fn

  const tokenModule = await import('../../../../../server/api/v1/ai/audio/token.post')
  tokenHandler = tokenModule.default as (event: H3Event) => Promise<any>

  const settleModule = await import('../../../../../server/api/v1/ai/audio/settle.post')
  settleHandler = settleModule.default as (event: H3Event) => Promise<any>
})

afterAll(() => {
  if (originalDefineEventHandler === undefined)
    delete globalScope.defineEventHandler
  else
    globalScope.defineEventHandler = originalDefineEventHandler
})

describe('Nexus voice token issuance and settlement', () => {
  const fakeEvent = {} as H3Event

  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAppAuth.mockResolvedValue({ userId: 'user-123', deviceId: 'dev-1' })
    authMocks.requireVerifiedEmail.mockResolvedValue({ userId: 'user-123', deviceId: 'dev-1' })
    rateLimitMocks.enforceAdminRateLimit.mockResolvedValue(undefined)
    realtimeStoreMocks.expireStaleRealtimeAsrSessions.mockResolvedValue(0)
    realtimeStoreMocks.countActiveRealtimeAsrSessions.mockResolvedValue(0)
    realtimeStoreMocks.createRealtimeAsrSession.mockResolvedValue({ created: true })
    realtimeStoreMocks.markRealtimeAsrSessionReleased.mockResolvedValue(undefined)
    realtimeStoreMocks.markRealtimeAsrSessionCreditsReleased.mockResolvedValue(undefined)
    realtimeStoreMocks.markRealtimeAsrSessionExpired.mockResolvedValue(undefined)
    asrServiceMocks.resolveDashScopeAsrProvider.mockResolvedValue({
      provider: { id: 'dashscope-main', authRef: 'ref-1' },
    })
    dashscopeMocks.createDashScopeEphemeralToken.mockResolvedValue({
      token: 'st-mock-token-xyz',
      expiresAt: 1791761400,
    })
    pricingMocks.resolveSellableCreditPricingRule.mockResolvedValue({
      creditsPerUnit: 4,
      secondaryCreditsPerUnit: 1,
      minCredits: 1,
    })
    pricingMocks.computeCreditReservation.mockReturnValue(1200)
    creditsMocks.consumeCredits.mockResolvedValue({
      ledgerId: 'ledger-reserve-1',
      amount: 1200,
    })
    creditsMocks.releaseConsumedCredits.mockResolvedValue({
      ledgerId: 'ledger-release-1',
      amount: 1175,
    })
  })

  describe('POST /api/v1/ai/audio/token', () => {
    it('requires verified email, reserves max 300s credits upfront, persists session, and returns sessionId', async () => {
      const result = await tokenHandler(fakeEvent)

      expect(authMocks.requireVerifiedEmail).toHaveBeenCalledWith(fakeEvent, { userId: 'user-123', deviceId: 'dev-1' })
      expect(pricingMocks.computeCreditReservation).toHaveBeenCalledWith(expect.anything(), { seconds: 300 })
      expect(creditsMocks.consumeCredits).toHaveBeenCalledWith(
        fakeEvent,
        'user-123',
        1200,
        'asr-realtime-reservation',
        expect.objectContaining({ ttlSeconds: 300, reservedCredits: 1200 }),
        expect.objectContaining({ idempotencyKey: expect.stringMatching(/^asr-rt-reserve:/) }),
      )
      expect(realtimeStoreMocks.createRealtimeAsrSession).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({
        token: 'st-mock-token-xyz',
        expiresAt: 1791761400,
        reservedCredits: 1200,
        sessionId: expect.any(String),
      })
    })

    it('rejects unverified email accounts before reserving credits or calling DashScope', async () => {
      authMocks.requireVerifiedEmail.mockRejectedValueOnce(Object.assign(new Error('Email verification required'), { statusCode: 403 }))

      await expect(tokenHandler(fakeEvent)).rejects.toMatchObject({ statusCode: 403 })
      expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
      expect(dashscopeMocks.createDashScopeEphemeralToken).not.toHaveBeenCalled()
    })

    it('returns 402 INSUFFICIENT_CREDITS when upfront credit reservation fails', async () => {
      creditsMocks.consumeCredits.mockRejectedValueOnce(new Error('User credits exceeded.'))

      await expect(tokenHandler(fakeEvent)).rejects.toMatchObject({
        statusCode: 402,
        statusMessage: 'INSUFFICIENT_CREDITS',
        data: { errorCode: 'INSUFFICIENT_CREDITS' },
      })
      expect(dashscopeMocks.createDashScopeEphemeralToken).not.toHaveBeenCalled()
    })

    it('enforces concurrent session cap with 429', async () => {
      realtimeStoreMocks.countActiveRealtimeAsrSessions.mockResolvedValueOnce(2)

      await expect(tokenHandler(fakeEvent)).rejects.toMatchObject({
        statusCode: 429,
        statusMessage: 'ASR_CONCURRENT_LIMIT_EXCEEDED',
      })
      expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    })

    it('releases the credit hold when DashScope token issuance fails', async () => {
      dashscopeMocks.createDashScopeEphemeralToken.mockRejectedValueOnce(new Error('upstream down'))

      await expect(tokenHandler(fakeEvent)).rejects.toThrow('upstream down')
      expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
        fakeEvent,
        'user-123',
        1200,
        'asr-realtime-reservation-release',
        expect.objectContaining({ reasonCode: 'provider_token_failed' }),
        expect.objectContaining({ reservationLedgerId: 'ledger-reserve-1' }),
      )
      expect(realtimeStoreMocks.markRealtimeAsrSessionReleased).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /api/v1/ai/audio/settle', () => {
    it('settles against persisted reservation and refunds unused reserved credits', async () => {
      const nowIso = new Date().toISOString()
      const futureIso = new Date(Date.now() + 300_000).toISOString()
      const session = {
        id: 'session-abc-123',
        userId: 'user-123',
        providerId: 'dashscope-main',
        status: 'active',
        ttlSeconds: 300,
        reservedCredits: 1200,
        chargedCredits: null,
        reservationLedgerId: 'ledger-reserve-1',
        pricing: { creditsPerUnit: 4, secondaryCreditsPerUnit: 1, minCredits: 1 },
        createdAt: nowIso,
        expiresAt: futureIso,
        creditsReleasedAt: null,
      }
      realtimeStoreMocks.getRealtimeAsrSession.mockResolvedValueOnce(session)
      realtimeStoreMocks.claimRealtimeAsrSessionForSettlement.mockResolvedValueOnce({ ...session, status: 'settled', chargedCredits: 25 })
      h3Mocks.readBody.mockResolvedValueOnce({
        sessionId: 'session-abc-123',
        durationMs: 4200, // 5s -> 20 credits
        transcriptUnits: 25, // 25 credits -> max = 25
        requestId: 'req-realtime-1',
      })

      const result = await settleHandler(fakeEvent)

      expect(realtimeStoreMocks.claimRealtimeAsrSessionForSettlement).toHaveBeenCalledWith(
        fakeEvent,
        'user-123',
        'session-abc-123',
        expect.objectContaining({ chargedCredits: 25, durationMs: 4200, transcriptUnits: 25 }),
      )
      expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
        fakeEvent,
        'user-123',
        1175,
        'asr-realtime-reservation-release',
        expect.objectContaining({ sessionId: 'session-abc-123', chargedCredits: 25, reservedCredits: 1200 }),
        { idempotencyKey: 'asr-rt-release:session-abc-123:25', reservationLedgerId: 'ledger-reserve-1' },
      )
      expect(result).toEqual({
        settled: true,
        creditsCharged: 25,
        creditsRefunded: 1175,
        ledgerId: 'ledger-reserve-1',
      })
    })

    it('enforces server wall-clock elapsed floor so reporting 0ms after 60s still bills >= 60s', async () => {
      const createdAt = new Date(Date.now() - 60_500).toISOString()
      const expiresAt = new Date(Date.now() + 240_000).toISOString()
      const session = {
        id: 'session-floor',
        userId: 'user-123',
        providerId: 'dashscope-main',
        status: 'active',
        ttlSeconds: 300,
        reservedCredits: 1200,
        chargedCredits: null,
        reservationLedgerId: 'ledger-reserve-2',
        pricing: { creditsPerUnit: 4, secondaryCreditsPerUnit: 1, minCredits: 1 },
        createdAt,
        expiresAt,
        creditsReleasedAt: null,
      }
      realtimeStoreMocks.getRealtimeAsrSession.mockResolvedValueOnce(session)
      realtimeStoreMocks.claimRealtimeAsrSessionForSettlement.mockImplementationOnce(async (_e, _u, _s, params) => ({
        ...session,
        status: 'settled',
        chargedCredits: params.chargedCredits,
      }))
      h3Mocks.readBody.mockResolvedValueOnce({
        sessionId: 'session-floor',
        durationMs: 0,
        transcriptUnits: 0,
      })

      const result = await settleHandler(fakeEvent)
      expect(result.creditsCharged).toBeGreaterThanOrEqual(240)
      expect(result.creditsRefunded).toBe(1200 - result.creditsCharged)
    })

    it('rejects unknown sessionId with 404', async () => {
      realtimeStoreMocks.getRealtimeAsrSession.mockResolvedValueOnce(null)
      h3Mocks.readBody.mockResolvedValueOnce({ sessionId: 'unknown-session', durationMs: 1000 })

      await expect(settleHandler(fakeEvent)).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: 'ASR_SESSION_NOT_FOUND',
      })
    })

    it('rejects invalid parameters', async () => {
      h3Mocks.readBody.mockResolvedValueOnce({
        sessionId: '',
        durationMs: -10,
      })

      await expect(settleHandler(fakeEvent)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'INVALID_USAGE_PARAMETERS',
      })
    })
  })
})
