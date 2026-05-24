import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordPlatformGovernanceEvent } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  setHeader: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
    return {
      ...actual,
      getQuery: h3Mocks.getQuery,
      setHeader: h3Mocks.setHeader,
    }
})

let reportHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  reportHandler = (await import('../../../../server/api/dashboard/governance/report.get')).default as (event: any) => Promise<any>
})

function makeEvent(marker: string) {
  return {
    path: `/api/dashboard/governance/report/${marker}`,
    node: {
      req: {
        url: '/api/dashboard/governance/report',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/governance/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin@example.com',
      user: { role: 'admin' },
    })
    h3Mocks.getQuery.mockReturnValue({})
  })

  it('requires admin and returns a sanitized operations report snapshot', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    await recordPlatformGovernanceEvent(event, {
      scope: 'app',
      action: 'search',
      actorId: 'searcher@example.com',
      resourceType: 'search',
      resourceId: `raw-search-${marker}`,
      channel: 'all',
      unit: 'search',
      quantity: 1,
      metadata: {
        queryType: 'text',
        selected: false,
        searchResultCount: 0,
        providerErrorCount: 1,
        providerTimeoutCount: 1,
      },
    })
    await recordPlatformGovernanceEvent(event, {
      scope: 'intelligence',
      action: 'provider.usage',
      actorId: 'provider-user@example.com',
      resourceType: 'provider',
      resourceId: `provider-${marker}`,
      channel: 'chat.completion',
      unit: 'token',
      quantity: 128,
      metadata: {
        model: `model-${marker}`,
        providerType: 'openai',
        credentialRef: 'secure://providers/report',
      },
    })

    h3Mocks.getQuery.mockReturnValue({
      days: '30',
      limit: '100',
      topLimit: '5',
    })

    const result = await reportHandler(event)
    const serialized = JSON.stringify(result)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    expect(result.report.scorecards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'search-demand',
        status: 'watch',
        reason: 'search-problem-rate',
      }),
      expect.objectContaining({
        key: 'provider-tokens',
        value: 128,
      }),
    ]))
    expect(result.report.riskQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: 'search',
        suggestedAction: 'review-search-provider-and-zero-result-segments',
      }),
    ]))
    expect(result.report.evidenceStatus).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'admin-cockpit',
        status: 'open',
        blocker: 'authenticated-browser-evidence-required',
      }),
      expect.objectContaining({
        key: 'd1-production',
        status: 'open',
        blocker: 'production-d1-backfill-required',
      }),
    ]))
    expect(serialized).not.toContain('admin@example.com')
    expect(serialized).not.toContain('searcher@example.com')
    expect(serialized).not.toContain('provider-user@example.com')
    expect(serialized).not.toContain('secure://')
  })

  it('exports the sanitized operations report as markdown', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(marker)
    await recordPlatformGovernanceEvent(event, {
      scope: 'app',
      action: 'search',
      actorId: 'searcher@example.com',
      resourceType: 'search',
      resourceId: `raw-search-${marker}`,
      channel: 'all',
      unit: 'search',
      quantity: 1,
      metadata: {
        providerErrorCount: 1,
        credentialRef: 'secure://report/markdown',
      },
    })

    h3Mocks.getQuery.mockReturnValue({
      format: 'markdown',
      days: '30',
      limit: '100',
      topLimit: '5',
    })

    const result = await reportHandler(event)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    expect(h3Mocks.setHeader).toHaveBeenCalledWith(event, 'Content-Type', 'text/markdown; charset=utf-8')
    expect(h3Mocks.setHeader).toHaveBeenCalledWith(event, 'Content-Disposition', expect.stringContaining('nexus-governance-report-'))
    expect(result).toContain('# Nexus Data Governance Operations Report')
    expect(result).toContain('## Scorecards')
    expect(result).toContain('## Evidence Status')
    expect(result).toContain('## Risk Queue')
    expect(result).toContain('search-demand')
    expect(result).not.toContain('searcher@example.com')
    expect(result).not.toContain(`raw-search-${marker}`)
    expect(result).not.toContain('secure://')
  })
})
