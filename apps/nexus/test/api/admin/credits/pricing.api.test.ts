import type { H3Event } from 'h3'
import type * as H3Module from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installDefineEventHandlerGlobal,
  makeCreditPricingEvent,
  MockCreditPricingD1Database,
} from '../../../helpers/credit-pricing-test-utils'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireVerifiedEmail: vi.fn(),
}))

const adminAuditMocks = vi.hoisted(() => ({
  logAdminAudit: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof H3Module>()
  return { ...actual, readBody: h3Mocks.readBody }
})

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/adminAuditStore', () => adminAuditMocks)

interface PricingRulePayload {
  capability: string
  unit: string
  creditsPerUnit: number
  secondaryUnit: string | null
  secondaryCreditsPerUnit: number | null
  minCredits: number
  reserveMultiplier: number
  upstreamCostUsdPerUnit: number | null
  active: boolean
  updatedAt: string
}

let adminPricingHandler: (event: H3Event) => Promise<{ unit: string, rules: PricingRulePayload[] }>
let adminPricingPatchHandler: (event: H3Event) => Promise<{ rule: PricingRulePayload }>
let publicPricingHandler: (event: H3Event) => Promise<{ unit: string, rules: PricingRulePayload[] }>

beforeAll(async () => {
  installDefineEventHandlerGlobal()
  // Route modules call the Nitro global at import time, so they cannot be imported
  // statically from a test that does not run inside Nuxt.
  adminPricingHandler = (await import('../../../../server/api/admin/credits/pricing.get')).default as (event: H3Event) => Promise<{ unit: string, rules: PricingRulePayload[] }>
  adminPricingPatchHandler = (await import('../../../../server/api/admin/credits/pricing.patch')).default as (event: H3Event) => Promise<{ rule: PricingRulePayload }>
  publicPricingHandler = (await import('../../../../server/api/credits/pricing.get')).default as (event: H3Event) => Promise<{ unit: string, rules: PricingRulePayload[] }>
})

describe('/api/admin/credits/pricing', () => {
  let db: MockCreditPricingD1Database

  beforeEach(() => {
    vi.clearAllMocks()
    db = new MockCreditPricingD1Database()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    authMocks.requireVerifiedEmail.mockResolvedValue({ userId: 'admin_1' })
    adminAuditMocks.logAdminAudit.mockResolvedValue(undefined)
    h3Mocks.readBody.mockResolvedValue({})
  })

  it('非管理员既不能读价目表也不能改价格', async () => {
    authMocks.requireAdmin.mockRejectedValue({
      statusCode: 403,
      statusMessage: 'Admin permission required.',
    })
    h3Mocks.readBody.mockResolvedValue({ capability: 'text.translate', creditsPerUnit: 1 })

    await expect(adminPricingHandler(makeCreditPricingEvent(db))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Admin permission required.',
    })
    await expect(adminPricingPatchHandler(makeCreditPricingEvent(db))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Admin permission required.',
    })
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
    expect(db.rows.size).toBe(0)
  })

  it('管理员价目表包含上游成本与预留倍数', async () => {
    await adminPricingHandler(makeCreditPricingEvent(db))
    h3Mocks.readBody.mockResolvedValue({
      capability: 'text.translate',
      creditsPerUnit: 1000,
      reserveMultiplier: 3,
      upstreamCostUsdPerUnit: 0.002,
    })
    await adminPricingPatchHandler(makeCreditPricingEvent(db))

    const result = await adminPricingHandler(makeCreditPricingEvent(db))

    expect(result.rules.find(rule => rule.capability === 'text.translate')).toMatchObject({
      unit: '1k_tokens',
      creditsPerUnit: 1000,
      reserveMultiplier: 3,
      upstreamCostUsdPerUnit: 0.002,
      active: true,
    })
  })

  it('拒绝未知 capability 且不写审计', async () => {
    h3Mocks.readBody.mockResolvedValue({ capability: 'audio.mix', creditsPerUnit: 5 })

    await expect(adminPricingPatchHandler(makeCreditPricingEvent(db))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Capability has no price.',
    })
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
    expect(db.rows.size).toBe(0)
  })

  it.each([
    ['creditsPerUnit 为负数', { creditsPerUnit: -1 }, 'Invalid credits per unit.'],
    ['creditsPerUnit 为零', { creditsPerUnit: 0 }, 'Invalid credits per unit.'],
    ['creditsPerUnit 超过上限', { creditsPerUnit: 1_000_001 }, 'Invalid credits per unit.'],
    ['creditsPerUnit 不是数字', { creditsPerUnit: 'lots' }, 'Invalid credits per unit.'],
    ['minCredits 为负数', { minCredits: -1 }, 'Invalid minimum credits.'],
    ['minCredits 不是整数', { minCredits: 1.5 }, 'Invalid minimum credits.'],
    ['reserveMultiplier 小于 1', { reserveMultiplier: 0.5 }, 'Invalid reserve multiplier.'],
    ['reserveMultiplier 超过上限', { reserveMultiplier: 101 }, 'Invalid reserve multiplier.'],
    ['upstreamCostUsdPerUnit 为负数', { upstreamCostUsdPerUnit: -0.01 }, 'Invalid upstream cost.'],
    ['active 不是布尔值', { active: 'yes' }, 'Invalid active flag.'],
    ['没有任何价格字段', {}, 'No pricing fields to update.'],
  ])('拒绝 %s 且不触碰存储', async (_label, patch, statusMessage) => {
    h3Mocks.readBody.mockResolvedValue({ capability: 'text.translate', ...patch })

    await expect(adminPricingPatchHandler(makeCreditPricingEvent(db))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage,
    })
    expect(adminAuditMocks.logAdminAudit).not.toHaveBeenCalled()
    expect(db.rows.size).toBe(0)
  })

  it('拒绝修改 capability 的计费基准 unit', async () => {
    await adminPricingHandler(makeCreditPricingEvent(db))
    h3Mocks.readBody.mockResolvedValue({
      capability: 'text.chat',
      unit: 'image',
      creditsPerUnit: 5000,
      minCredits: 2,
    })

    const updated = await adminPricingPatchHandler(makeCreditPricingEvent(db))

    expect(updated.rule).toMatchObject({
      capability: 'text.chat',
      unit: '1k_tokens',
      creditsPerUnit: 5000,
      minCredits: 2,
    })

    const publicList = await publicPricingHandler(makeCreditPricingEvent(db))
    expect(publicList.rules.find(rule => rule.capability === 'text.chat')).toMatchObject({
      unit: '1k_tokens',
      creditsPerUnit: 5000,
    })
    expect(db.rows.get('text.chat')?.unit).toBe('1k_tokens')
  })

  it('写入管理员审计，且新价格出现在公开价目表', async () => {
    await adminPricingHandler(makeCreditPricingEvent(db))
    h3Mocks.readBody.mockResolvedValue({
      capability: 'audio.transcribe',
      creditsPerUnit: 6,
      upstreamCostUsdPerUnit: 0.004,
    })

    const updated = await adminPricingPatchHandler(makeCreditPricingEvent(db))

    expect(adminAuditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), {
      adminUserId: 'admin_1',
      action: 'credits.pricing.update',
      targetType: 'capability',
      targetId: 'audio.transcribe',
      metadata: {
        creditsPerUnit: 6,
        minCredits: 1,
        reserveMultiplier: 2.5,
        active: true,
      },
    })
    expect(updated.rule).toMatchObject({
      creditsPerUnit: 6,
      minCredits: 1,
      reserveMultiplier: 2.5,
      upstreamCostUsdPerUnit: 0.004,
    })

    const publicList = await publicPricingHandler(makeCreditPricingEvent(db))
    expect(publicList.rules.find(rule => rule.capability === 'audio.transcribe')).toEqual({
      capability: 'audio.transcribe',
      unit: 'audio_second',
      creditsPerUnit: 6,
      secondaryUnit: 'transcript_unit',
      secondaryCreditsPerUnit: 1,
      minCredits: 1,
    })
  })
})
