import { describe, expect, it } from 'vitest'
import { isAdminAccountRole, normalizeAccountRole } from './account-role'

describe('isAdminAccountRole', () => {
  it('accepts the one value the server also accepts', () => {
    expect(isAdminAccountRole('admin')).toBe(true)
    expect(isAdminAccountRole('user')).toBe(false)
  })

  /**
   * The predicate this replaced (`app/utils/role.ts`'s `isAdminRole`) returned
   * true for 'owner'. 'owner' is a TeamMemberRole and never appears in
   * `auth_users.role`, so that only ever meant one thing: had anything wired it
   * up, a team owner would have been shown admin views whose every request
   * `requireAdmin` then rejects with a 403.
   */
  it('does not treat the team owner role as a platform admin', () => {
    expect(isAdminAccountRole('owner')).toBe(false)
    expect(isAdminAccountRole('member')).toBe(false)
  })

  it('normalizes case and padding, since the copies it replaced disagreed', () => {
    expect(isAdminAccountRole('ADMIN')).toBe(true)
    expect(isAdminAccountRole(' Admin ')).toBe(true)
  })

  it('is false for an absent role rather than throwing', () => {
    expect(isAdminAccountRole(undefined)).toBe(false)
    expect(isAdminAccountRole(null)).toBe(false)
    expect(isAdminAccountRole('')).toBe(false)
    expect(normalizeAccountRole(undefined)).toBe('')
  })
})
