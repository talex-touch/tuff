import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamMemberRole, TeamRecord, UserTeamRecord } from '../creditsStore'
import type { SubscriptionPlan } from '../subscriptionStore'

import { resolveActiveTeamContext } from '../teamContext'

const creditsMocks = vi.hoisted(() => ({
  ensurePersonalTeam: vi.fn(),
  getTeamById: vi.fn(),
  getUserRoleInTeam: vi.fn(),
  listUserTeams: vi.fn(),
  countTeamMembers: vi.fn(),
}))

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))

const teamStoreMocks = vi.hoisted(() => ({
  getTeamQuota: vi.fn(),
  updateTeamSeats: vi.fn(),
}))

vi.mock('../creditsStore', () => creditsMocks)
vi.mock('../subscriptionStore', () => subscriptionMocks)
vi.mock('../teamStore', () => teamStoreMocks)

function setupBase(
  plan: SubscriptionPlan,
  team: TeamRecord,
  role: TeamMemberRole,
  seatsUsed = 1,
  seatsLimit = 1,
) {
  creditsMocks.ensurePersonalTeam.mockResolvedValue(undefined)
  creditsMocks.listUserTeams.mockResolvedValue([
    {
      ...team,
      role,
      joinedAt: '2026-01-01T00:00:00.000Z',
    } as UserTeamRecord,
  ])
  creditsMocks.getTeamById.mockResolvedValue(team)
  creditsMocks.getUserRoleInTeam.mockResolvedValue(role)
  subscriptionMocks.getUserSubscription.mockResolvedValue({ plan })
  teamStoreMocks.getTeamQuota.mockResolvedValue({
    organizationId: team.id,
    plan,
    aiRequestsUsed: 0,
    aiRequestsLimit: 50,
    aiTokensUsed: 0,
    aiTokensLimit: 10000,
    seatsUsed,
    seatsLimit,
    weekStartDate: '2026-02-09',
    updatedAt: '2026-02-10T00:00:00.000Z',
  })
  creditsMocks.countTeamMembers.mockResolvedValue(seatsUsed)
}

describe('resolveActiveTeamContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FREE 个人团队返回升级提示，且不可创建组织团队', async () => {
    const team: TeamRecord = {
      id: 'team_u1',
      name: 'Personal',
      type: 'personal',
      ownerUserId: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    setupBase('FREE', team, 'owner', 1, 1)

    const context = await resolveActiveTeamContext({} as any, 'u1')

    expect(context.collaborationEnabled).toBe(false)
    expect(context.permissions.canCreateTeam).toBe(false)
    expect(context.permissions.canInvite).toBe(false)
    expect(context.upgrade).toEqual({ required: true, targetPlan: 'TEAM' })
  })

  it('TEAM 个人团队允许创建组织团队', async () => {
    const team: TeamRecord = {
      id: 'team_u2',
      name: 'Personal',
      type: 'personal',
      ownerUserId: 'u2',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    setupBase('TEAM', team, 'owner', 1, 5)

    const context = await resolveActiveTeamContext({} as any, 'u2')

    expect(context.collaborationEnabled).toBe(true)
    expect(context.permissions.canCreateTeam).toBe(true)
    expect(context.permissions.canInvite).toBe(false)
  })

  it('组织团队 admin 可邀请，不可解散', async () => {
    const team: TeamRecord = {
      id: 'org_123',
      name: 'Org Team',
      type: 'organization',
      ownerUserId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    setupBase('TEAM', team, 'admin', 3, 5)

    const context = await resolveActiveTeamContext({} as any, 'admin-1')

    expect(context.permissions.canInvite).toBe(true)
    expect(context.permissions.canManageMembers).toBe(true)
    expect(context.permissions.canDisband).toBe(false)
  })

  it('组织团队 owner 即使非协作套餐也可解散团队', async () => {
    const team: TeamRecord = {
      id: 'org_789',
      name: 'Legacy Org',
      type: 'organization',
      ownerUserId: 'owner-3',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    setupBase('FREE', team, 'owner', 1, 1)

    const context = await resolveActiveTeamContext({} as any, 'owner-3')

    expect(context.permissions.canInvite).toBe(false)
    expect(context.permissions.canDisband).toBe(true)
  })

  it('座位数不一致时会同步 seats_used', async () => {
    const team: TeamRecord = {
      id: 'org_456',
      name: 'Org Team',
      type: 'organization',
      ownerUserId: 'owner-2',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    setupBase('TEAM', team, 'owner', 2, 5)
    creditsMocks.countTeamMembers.mockResolvedValue(4)

    const context = await resolveActiveTeamContext({} as any, 'owner-2')

    expect(teamStoreMocks.updateTeamSeats).toHaveBeenCalledWith(expect.anything(), team.id, 4)
    expect(context.seatsUsed).toBe(4)
  })
})
