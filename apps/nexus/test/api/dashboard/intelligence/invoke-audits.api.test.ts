import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const usageMocks = vi.hoisted(() => ({
  listProviderUsageLedgerEntries: vi.fn(),
}))

interface CloudflareEventShape {
  context?: { cloudflare?: { env?: unknown } }
}

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: (event: CloudflareEventShape) => event.context?.cloudflare?.env,
}))
vi.mock('../../../../server/utils/providerUsageLedgerStore', () => usageMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

/**
 * One credit_ledger row as D1 returns it. An invoke now writes several rows per trace
 * (a hold, the settled remainder, the released over-hold), so the audit is driven
 * against real ledger rows rather than a pre-netted fixture: netting them per trace is
 * exactly what the reconciliation is required to do.
 */
interface CreditLedgerRow {
  id: string
  scope: string
  scope_id: string
  delta: number
  reason: string
  created_at: string
  metadata: string
}

class MockStatement {
  private args: unknown[] = []

  constructor(
    private readonly db: MockCreditLedgerDatabase,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async run() {
    return { meta: { changes: 0 } }
  }

  async first() {
    return null
  }

  async all() {
    return this.db.all(this.sql, this.args)
  }
}

class MockCreditLedgerDatabase {
  readonly rows: CreditLedgerRow[] = []

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  all(sql: string, args: unknown[]) {
    if (sql.includes('PRAGMA table_info')) {
      return { results: ['idempotency_key', 'idempotency_hash'].map(name => ({ name })) }
    }

    if (sql.includes('FROM credit_ledger')) {
      const traceIds = args.filter((value): value is string => typeof value === 'string')
      const results = this.rows
        .filter((row) => {
          const metadata = JSON.parse(row.metadata) as { traceId?: string }
          const billedReason = row.reason === 'intelligence-invoke' || row.reason.startsWith('intelligence-invoke-')
          return billedReason && traceIds.includes(metadata.traceId ?? '')
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(row => ({
          id: row.id,
          scope_id: row.scope_id,
          delta: row.delta,
          reason: row.reason,
          created_at: row.created_at,
          metadata: row.metadata,
          team_id: row.scope_id,
          owner_user_id: 'user_1',
          team_type: 'personal',
          email: 'user@example.com',
          name: 'User',
        }))

      return { results }
    }

    return { results: [] }
  }
}

interface InvokeAuditsResult {
  entries: Array<Record<string, unknown>>
  pagination: { page: number, limit: number, total: number, totalPages: number }
}

let invokeAuditsHandler: (event: unknown) => Promise<InvokeAuditsResult>

beforeAll(async () => {
  // The route module calls defineEventHandler at import time, so the global has to be
  // installed before the dynamic import below; that ordering is why this is not static.
  const globalScope = globalThis as unknown as { defineEventHandler: (fn: unknown) => unknown }
  globalScope.defineEventHandler = fn => fn
  invokeAuditsHandler = (await import('../../../../server/api/dashboard/intelligence/invoke-audits.get')).default as (event: unknown) => Promise<InvokeAuditsResult>
})

let ledgerDb: MockCreditLedgerDatabase

function makeEvent() {
  return {
    path: '/api/dashboard/intelligence/invoke-audits',
    node: { req: { url: '/api/dashboard/intelligence/invoke-audits' } },
    context: { params: {}, cloudflare: { env: { DB: ledgerDb } } },
  }
}

function usageEntry(traceId: string, usageLedgerId: string) {
  return {
    id: usageLedgerId,
    runId: `intelligence_invoke_${traceId}`,
    sceneId: 'nexus.intelligence.invoke',
    mode: 'execute',
    status: 'completed',
    strategyMode: 'priority',
    capability: 'text.chat',
    providerId: 'ip_ai',
    unit: '1k_tokens',
    quantity: 700,
    billable: true,
    estimated: false,
    pricingRef: null,
    providerUsageRef: traceId,
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
  }
}

function ledgerRow(
  id: string,
  traceId: string,
  reason: string,
  delta: number,
  createdAt: string,
): CreditLedgerRow {
  return {
    id,
    scope: 'team',
    scope_id: 'team_user_1',
    delta,
    reason,
    created_at: createdAt,
    metadata: JSON.stringify({
      traceId,
      source: 'core-app',
      workflowId: 'workflow_1',
      workflowRunId: 'run_1',
    }),
  }
}

describe('/api/dashboard/intelligence/invoke-audits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ledgerDb = new MockCreditLedgerDatabase()
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
      entries: [usageEntry('trace_1', 'usage_1')],
      page: 1,
      limit: 20,
      total: 1,
    })
    // A 700-credit reply against a 512-credit hold: the hold is taken before dispatch,
    // then the 188-credit remainder is debited as a supplementary settle.
    ledgerDb.rows.push(
      ledgerRow('credit_reserve_1', 'trace_1', 'intelligence-invoke-reserve', -512, '2026-05-15T00:00:02.000Z'),
      ledgerRow('credit_settle_1', 'trace_1', 'intelligence-invoke-settle', -188, '2026-05-15T00:00:03.000Z'),
    )
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
    expect(result.entries[0]).toMatchObject({
      traceId: 'trace_1',
      usageLedgerId: 'usage_1',
      creditLedgerId: 'credit_settle_1',
      chargedCredits: 700,
      billingMatched: true,
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

  it('回滚了全部预扣的 trace 净额为 0 但仍算已对账', async () => {
    usageMocks.listProviderUsageLedgerEntries.mockResolvedValueOnce({
      entries: [usageEntry('trace_2', 'usage_2')],
      page: 1,
      limit: 20,
      total: 1,
    })
    ledgerDb.rows.push(
      ledgerRow('credit_reserve_2', 'trace_2', 'intelligence-invoke-reserve', -512, '2026-05-15T00:00:02.000Z'),
      ledgerRow('credit_release_2', 'trace_2', 'intelligence-invoke-release', 512, '2026-05-15T00:00:04.000Z'),
    )

    const result = await invokeAuditsHandler(makeEvent())

    expect(result.entries[0]).toMatchObject({
      traceId: 'trace_2',
      chargedCredits: 0,
      billingMatched: true,
    })
  })

  it('usage 无匹配 credit ledger 时返回未对账状态', async () => {
    ledgerDb.rows.length = 0

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
