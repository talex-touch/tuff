import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const subscriptionMocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
  getPlanFeatures: vi.fn(),
}))

const teamContextMocks = vi.hoisted(() => ({
  resolveActiveTeamContext: vi.fn(),
}))

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/subscriptionStore', () => subscriptionMocks)
vi.mock('../../../utils/teamContext', () => teamContextMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../status.get')).default as (event: any) => Promise<any>
})

describe('/api/subscription/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('返回兼容字段并附带 team 摘要', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    subscriptionMocks.getUserSubscription.mockResolvedValue({
      plan: 'TEAM',
      expiresAt: '2026-12-31T00:00:00.000Z',
      activatedAt: '2026-01-01T00:00:00.000Z',
      isActive: true,
    })
    subscriptionMocks.getPlanFeatures.mockReturnValue({
      aiRequestsLimit: 5000,
      aiTokensLimit: 1000000,
      customModels: true,
      prioritySupport: true,
      apiAccess: true,
    })
    teamContextMocks.resolveActiveTeamContext.mockResolvedValue({
      team: {
        id: 'org_1',
        name: 'Acme Team',
        type: 'organization',
      },
      role: 'owner',
      collaborationEnabled: true,
      seatsUsed: 3,
      seatsLimit: 5,
      permissions: {
        canInvite: true,
        canManageMembers: true,
        canDisband: true,
        canCreateTeam: false,
      },
      upgrade: {
        required: false,
        targetPlan: null,
      },
      quota: {
        aiRequestsUsed: 120,
        aiTokensUsed: 3500,
      },
    })

    const result = await handler({})

    expect(result).toMatchObject({
      plan: 'TEAM',
      expiresAt: '2026-12-31T00:00:00.000Z',
      activatedAt: '2026-01-01T00:00:00.000Z',
      isActive: true,
      features: {
        aiRequests: {
          limit: 5000,
          used: 120,
        },
        aiTokens: {
          limit: 1000000,
          used: 3500,
        },
      },
      team: {
        id: 'org_1',
        name: 'Acme Team',
        type: 'organization',
        role: 'owner',
        collaborationEnabled: true,
        seats: {
          used: 3,
          total: 5,
        },
      },
    })
  })
})
