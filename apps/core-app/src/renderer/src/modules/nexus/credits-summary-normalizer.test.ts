import { describe, expect, it } from 'vitest'
import { normalizeCreditSummary } from './credits-summary-normalizer'

describe('credits summary normalizer', () => {
  it('normalizes user and team balances with remaining credits', () => {
    expect(
      normalizeCreditSummary({
        month: '2026-05',
        user: { quota: 1000, used: 275.5 },
        team: { quota: '5000', used: '1250' }
      })
    ).toEqual({
      month: '2026-05',
      user: { quota: 1000, used: 275.5, remaining: 724.5 },
      team: { quota: 5000, used: 1250, remaining: 3750 }
    })
  })

  it('falls back to zero balances for missing or invalid fields', () => {
    expect(normalizeCreditSummary({ user: null, team: { quota: 'bad', used: -5 } })).toEqual({
      month: '',
      user: { quota: 0, used: 0, remaining: 0 },
      team: { quota: 0, used: 0, remaining: 0 }
    })
  })

  it('never returns a negative remaining balance', () => {
    expect(normalizeCreditSummary({ user: { quota: 10, used: 20 } }).user.remaining).toBe(0)
  })
})
