import type { H3Event } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installDefineEventHandlerGlobal,
  makeCreditPricingEvent,
  MockCreditPricingD1Database,
} from '../../helpers/credit-pricing-test-utils'

const authMocks = vi.hoisted(() => ({
  requireVerifiedEmail: vi.fn(),
}))

vi.mock('../../../server/utils/auth', () => authMocks)

interface PublicPricingRule {
  capability: string
  unit: string
  creditsPerUnit: number
  secondaryUnit: string | null
  secondaryCreditsPerUnit: number | null
  minCredits: number
}

let getPricingHandler: (event: H3Event) => Promise<{ unit: string, rules: PublicPricingRule[] }>

beforeAll(async () => {
  installDefineEventHandlerGlobal()
  // The route module calls the Nitro global at import time, so it cannot be imported
  // statically from a test that does not run inside Nuxt.
  getPricingHandler = (await import('../../../server/api/credits/pricing.get')).default as (event: H3Event) => Promise<{ unit: string, rules: PublicPricingRule[] }>
})

const PUBLIC_COLUMNS = ['capability', 'creditsPerUnit', 'minCredits', 'secondaryCreditsPerUnit', 'secondaryUnit', 'unit']

describe('GET /api/credits/pricing', () => {
  let db: MockCreditPricingD1Database

  beforeEach(() => {
    vi.clearAllMocks()
    db = new MockCreditPricingD1Database()
    authMocks.requireVerifiedEmail.mockResolvedValue({ userId: 'user_1' })
  })

  it('只返回公开价格列，不暴露上游成本与预留倍数', async () => {
    const result = await getPricingHandler(makeCreditPricingEvent(db))

    expect(result.unit).toBe('credits')
    expect(result.rules.find(rule => rule.capability === 'text.translate')).toEqual({
      capability: 'text.translate',
      unit: '1k_tokens',
      creditsPerUnit: 1000,
      secondaryUnit: null,
      secondaryCreditsPerUnit: null,
      minCredits: 1,
    })
    expect(result.rules.find(rule => rule.capability === 'audio.transcribe')).toEqual({
      capability: 'audio.transcribe',
      unit: 'audio_second',
      creditsPerUnit: 4,
      secondaryUnit: 'transcript_unit',
      secondaryCreditsPerUnit: 1,
      minCredits: 1,
    })
    expect(result.rules.map(rule => Object.keys(rule).sort())).toEqual(
      result.rules.map(() => PUBLIC_COLUMNS),
    )
  })

  it('未验证邮箱的调用者拿不到价目表', async () => {
    authMocks.requireVerifiedEmail.mockRejectedValue({
      statusCode: 403,
      statusMessage: 'Email not verified.',
    })

    await expect(getPricingHandler(makeCreditPricingEvent(db))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Email not verified.',
    })
    expect(db.rows.size).toBe(0)
  })

  it('停用的 capability 不再出现在公开价目表', async () => {
    const seeded = await getPricingHandler(makeCreditPricingEvent(db))
    expect(seeded.rules.some(rule => rule.capability === 'code.debug')).toBe(true)

    const retired = db.rows.get('code.debug')
    if (!retired)
      throw new Error('code.debug was not seeded.')
    retired.active = 0

    const result = await getPricingHandler(makeCreditPricingEvent(db))

    expect(result.rules.some(rule => rule.capability === 'code.debug')).toBe(false)
    expect(result.rules.some(rule => rule.capability === 'text.translate')).toBe(true)
  })
})
