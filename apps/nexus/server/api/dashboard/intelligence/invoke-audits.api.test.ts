import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const creditMocks = vi.hoisted(() => ({
  listCreditLedgerByTraceIds: vi.fn(),
}))

const usageMocks = vi.hoisted(() => ({
  listProviderUsageLedgerEntries: vi.fn(),
}))

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/creditsStore', () => creditMocks)
vi.mock('../../../utils/providerUsageLedgerStore', () => usageMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

let invokeAuditsHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  invokeAuditsHandler = (await import('./invoke-audits.get')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/intelligence/invoke-audits',
    node: { req: { url: '/api/dashboard/intelligence/invoke-audits' } },
    context: { params: {} },
  }
}

describe('/api/dashboard/intelligence/invoke-audits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({
      traceId: 'trace_1',
      page: '1',
      limit: '20',
    })
    usageMocks.listProviderUsageLedgerEntries.mockResolvedValue({
      entries: [
        {
          id: 'usage_1',
          runId: 'intelligence_invoke_trace_1',
          sceneId: 'nexus.intelligence.invoke',
          mode: 'execute',
          status: 'completed',
          strategyMode: 'priority',
          capability: 'text.chat',
          providerId: 'ip_ai',
          unit: 'token',
          quantity: 7,
          billable: true,
          estimated: false,
          pricingRef: null,
          providerUsageRef: 'trace_1',
          errorCode: null,
          errorMessage: null,
          trace: [
            {
              phase: 'scene.load',
              metadata: {
                source: 'core-app',
                caller: 'workflow.use-model',
                sessionId: 'session_1',
                workflowId: 'workflow_1',
                workflowName: 'Meeting Summary',
                workflowRunId: 'run_1',
                workflowStepId: 'step_1',
              },
            },
          ],
          fallbackTrail: [],
          selected: [],
          createdAt: '2026-05-15T00:00:01.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    })
    creditMocks.listCreditLedgerByTraceIds.mockResolvedValue([
      {
        id: 'credit_1',
        teamId: 'team_user_1',
        teamType: 'personal',
        userId: 'user_1',
        userEmail: 'user@example.com',
        userName: 'User',
        delta: -7,
        reason: 'intelligence-invoke',
        createdAt: '2026-05-15T00:00:02.000Z',
        metadata: {
          traceId: 'trace_1',
          source: 'core-app',
          workflowId: 'workflow_1',
          workflowRunId: 'run_1',
        },
      },
    ])
  })

  it('管理员可以按 traceId 查询 AI invoke 对账审计', async () => {
    const result = await invokeAuditsHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(usageMocks.listProviderUsageLedgerEntries).toHaveBeenCalledWith(
      expect.anything(),
      {
        sceneId: 'nexus.intelligence.invoke',
        runId: undefined,
        providerId: undefined,
        capability: undefined,
        providerUsageRef: 'trace_1',
        status: undefined,
        mode: undefined,
        page: 1,
        limit: 20,
      },
    )
    expect(creditMocks.listCreditLedgerByTraceIds).toHaveBeenCalledWith(
      expect.anything(),
      ['trace_1'],
    )
    expect(result.entries[0]).toMatchObject({
      traceId: 'trace_1',
      usageLedgerId: 'usage_1',
      creditLedgerId: 'credit_1',
      chargedCredits: 7,
      source: 'core-app',
      caller: 'workflow.use-model',
      workflowId: 'workflow_1',
      workflowName: 'Meeting Summary',
      workflowRunId: 'run_1',
      workflowStepId: 'step_1',
    })
    expect(JSON.stringify(result)).not.toContain('hello')
    expect(JSON.stringify(result)).not.toContain('translated text')
  })

  it('usage 无匹配 credit ledger 时返回未对账状态', async () => {
    creditMocks.listCreditLedgerByTraceIds.mockResolvedValueOnce([])

    const result = await invokeAuditsHandler(makeEvent())

    expect(result.entries[0]).toMatchObject({
      traceId: 'trace_1',
      usageLedgerId: 'usage_1',
      creditLedgerId: null,
      chargedCredits: 0,
      billingMatched: false,
    })
  })
})
