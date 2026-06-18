import { describe, expect, it } from 'vitest'
import { normalizeCreditSummary } from './credits-summary-normalizer'

describe('credits summary normalizer', () => {
  it('normalizes user and team balances with remaining credits', () => {
    expect(
      normalizeCreditSummary({
        month: '2026-05',
        user: { quota: 1000, used: 275.5 },
        team: { quota: '5000', used: '1250' },
        teamContext: { id: 'org_1', name: 'Acme', type: 'organization' }
      })
    ).toEqual({
      month: '2026-05',
      user: { quota: 1000, used: 275.5, remaining: 724.5 },
      team: { quota: 5000, used: 1250, remaining: 3750 },
      teamContext: { id: 'org_1', name: 'Acme', type: 'organization', hasTeamPool: true }
    })
  })

  it('falls back to zero balances for missing or invalid fields', () => {
    expect(normalizeCreditSummary({ user: null, team: { quota: 'bad', used: -5 } })).toEqual({
      month: '',
      user: { quota: 0, used: 0, remaining: 0 },
      team: { quota: 0, used: 0, remaining: 0 },
      teamContext: null
    })
  })

  it('never returns a negative remaining balance', () => {
    expect(normalizeCreditSummary({ user: { quota: 10, used: 20 } }).user.remaining).toBe(0)
  })

  it('does not expose a team pool for personal team context', () => {
    expect(
      normalizeCreditSummary({
        teamContext: { id: 'team_u1', name: 'Personal', type: 'personal', hasTeamPool: true }
      }).teamContext
    ).toEqual({
      id: 'team_u1',
      name: 'Personal',
      type: 'personal',
      hasTeamPool: false
    })
  })
})
