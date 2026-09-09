import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useTeamRole } from './useTeamRole'

describe('useTeamRole', () => {
  it('treats owner and admin alike, matching teamContext isAdminLike', () => {
    for (const role of ['owner', 'admin']) {
      const { isTeamAdmin } = useTeamRole({ type: 'organization', role })
      expect(isTeamAdmin.value, role).toBe(true)
    }
  })

  it('denies a plain member', () => {
    const { isTeamAdmin } = useTeamRole({ type: 'organization', role: 'member' })
    expect(isTeamAdmin.value).toBe(false)
  })

  /**
   * Everyone has a personal team and is its owner, so without the organization
   * check every account would pass as a team admin.
   */
  it('grants nothing on a personal team, whatever the role says', () => {
    const { isTeamAdmin } = useTeamRole({ type: 'personal', role: 'owner' })
    expect(isTeamAdmin.value).toBe(false)
  })

  it('is false while the team is still loading', () => {
    expect(useTeamRole(null).isTeamAdmin.value).toBe(false)
    expect(useTeamRole(undefined).isTeamAdmin.value).toBe(false)
  })

  it('tracks a ref and a getter, both of which call sites use', () => {
    const team = ref<{ type?: string, role?: string } | null>(null)
    const fromRef = useTeamRole(team)
    const fromGetter = useTeamRole(() => team.value)

    expect(fromRef.isTeamAdmin.value).toBe(false)
    team.value = { type: 'organization', role: 'OWNER' }
    expect(fromRef.isTeamAdmin.value).toBe(true)
    expect(fromGetter.isTeamAdmin.value).toBe(true)
  })
})
