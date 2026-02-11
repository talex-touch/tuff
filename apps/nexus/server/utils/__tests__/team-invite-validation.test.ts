import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubscriptionPlan } from '../subscriptionStore'
import type { TeamInvite } from '../teamStore'
import type { TeamRecord, UserTeamRecord } from '../creditsStore'

import { joinTeamWithInvite, validateInviteForUser } from '../teamInviteValidation'

const teamStoreMocks = vi.hoisted(() => ({
  getInviteByCode: vi.fn(),
  getTeamQuota: vi.fn(),
  updateTeamSeats: vi.fn(),
  useInvite: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  addTeamMember: vi.fn(),
  countTeamMembers: vi.fn(),
  getTeamById: vi.fn(),
  isUserTeamMember: vi.fn(),
  listUserTeams: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}))

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
}))

vi.mock('../teamStore', () => teamStoreMocks)
vi.mock('../creditsStore', () => creditsMocks)
vi.mock('../authStore', () => authStoreMocks)
vi.mock('../subscriptionStore', () => subscriptionMocks)

function createInvite(overrides: Partial<TeamInvite> = {}): TeamInvite {
  return {
    id: 'inv_1',
    code: 'ABCD1234',
    organizationId: 'org_1',
    createdBy: 'owner_1',
    email: null,
    role: 'member',
    maxUses: 1,
    uses: 0,
    expiresAt: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  }
}

function createTeam(overrides: Partial<TeamRecord> = {}): TeamRecord {
  return {
    id: 'org_1',
    name: 'Acme Team',
    type: 'organization',
    ownerUserId: 'owner_1',
    createdAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

function setupBase(plan: SubscriptionPlan = 'TEAM', seatsUsed = 1, seatsLimit = 5) {
  teamStoreMocks.getInviteByCode.mockResolvedValue(createInvite())
  creditsMocks.getTeamById.mockResolvedValue(createTeam())
  subscriptionMocks.getUserSubscription.mockResolvedValue({ plan })
  teamStoreMocks.getTeamQuota.mockResolvedValue({ seatsLimit })
  creditsMocks.countTeamMembers.mockResolvedValue(seatsUsed)
  authStoreMocks.getUserById.mockResolvedValue({ id: 'user_1', email: 'user@example.com' })
  creditsMocks.listUserTeams.mockResolvedValue([] as UserTeamRecord[])
  creditsMocks.isUserTeamMember.mockResolvedValue(false)
  creditsMocks.addTeamMember.mockResolvedValue(undefined)
  teamStoreMocks.useInvite.mockResolvedValue(undefined)
  teamStoreMocks.updateTeamSeats.mockResolvedValue(undefined)
}

describe('validateInviteForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('邮箱绑定不匹配返回 email_mismatch', async () => {
    setupBase('TEAM')
    teamStoreMocks.getInviteByCode.mockResolvedValue(createInvite({ email: 'other@example.com' }))

    const result = await validateInviteForUser({} as any, 'user_1', 'ABCD1234')

    expect(result.canJoin).toBe(false)
    expect(result.reason).toBe('email_mismatch')
  })

  it('团队已满返回 seat_full', async () => {
    setupBase('TEAM', 5, 5)

    const result = await validateInviteForUser({} as any, 'user_1', 'ABCD1234')

    expect(result.canJoin).toBe(false)
    expect(result.reason).toBe('seat_full')
  })

  it('owner 套餐不支持协作返回 plan_locked', async () => {
    setupBase('PRO')

    const result = await validateInviteForUser({} as any, 'user_1', 'ABCD1234')

    expect(result.canJoin).toBe(false)
    expect(result.reason).toBe('plan_locked')
  })

  it('满足条件返回 ok', async () => {
    setupBase('TEAM', 2, 5)

    const result = await validateInviteForUser({} as any, 'user_1', 'ABCD1234')

    expect(result.canJoin).toBe(true)
    expect(result.reason).toBe('ok')
  })
})

describe('joinTeamWithInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('验证失败时抛错并带 reason', async () => {
    setupBase('PRO')

    await expect(joinTeamWithInvite({} as any, 'user_1', 'ABCD1234')).rejects.toMatchObject({
      statusCode: 400,
      data: {
        reason: 'plan_locked',
      },
    })
  })

  it('成功加入时写入成员、消耗邀请码并同步 seats', async () => {
    setupBase('TEAM', 1, 5)
    creditsMocks.countTeamMembers.mockResolvedValueOnce(1).mockResolvedValueOnce(2)

    const result = await joinTeamWithInvite({} as any, 'user_1', 'ABCD1234')

    expect(teamStoreMocks.useInvite).toHaveBeenCalledWith(expect.anything(), 'ABCD1234')
    expect(creditsMocks.addTeamMember).toHaveBeenCalledWith(expect.anything(), 'org_1', 'user_1', 'member')
    expect(teamStoreMocks.updateTeamSeats).toHaveBeenCalledWith(expect.anything(), 'org_1', 2)
    expect(result.seatsUsed).toBe(2)
  })
})
