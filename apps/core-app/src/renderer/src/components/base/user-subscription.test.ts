import { describe, expect, it } from 'vitest'
import { computeSubscriptionActive } from './user-subscription'

describe('user-subscription', () => {
  it('prefers explicit isActive when present', () => {
    const now = Date.parse('2026-03-21T08:00:00.000Z')

    expect(
      computeSubscriptionActive(
        {
          isActive: false,
          status: 'ACTIVE',
          expiresAt: '2099-01-01T00:00:00.000Z'
        },
        now
      )
    ).toBe(false)

    expect(
      computeSubscriptionActive(
        {
          isActive: true,
          status: 'EXPIRED',
          expiresAt: '2000-01-01T00:00:00.000Z'
        },
        now
      )
    ).toBe(true)
  })

  it('uses status fallback when isActive is missing', () => {
    expect(computeSubscriptionActive({ status: 'ACTIVE' })).toBe(true)
    expect(computeSubscriptionActive({ status: 'TRIALING' })).toBe(true)
    expect(computeSubscriptionActive({ status: 'EXPIRED' })).toBe(false)
  })

  it('falls back to expiresAt and avoids false expired on missing fields', () => {
    const now = Date.parse('2026-03-21T08:00:00.000Z')

    expect(
      computeSubscriptionActive(
        {
          expiresAt: '2026-03-22T00:00:00.000Z'
        },
        now
      )
    ).toBe(true)

    expect(
      computeSubscriptionActive(
        {
          expiresAt: '2026-03-20T00:00:00.000Z'
        },
        now
      )
    ).toBe(false)

    expect(computeSubscriptionActive({})).toBe(true)
    expect(computeSubscriptionActive(null)).toBe(true)
  })
})
