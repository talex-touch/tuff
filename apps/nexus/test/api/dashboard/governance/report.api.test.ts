import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listPlatformGovernanceEvents,
  recordPlatformGovernanceEvent,
  type PlatformGovernanceReportSnapshot,
} from '../../../../server/utils/platformGovernanceStore'

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

function findEvidence(result: PlatformGovernanceReportSnapshot, key: string) {
  return result.report.evidenceStatus.find(item => item.key === key)
}

function findNewEvent<T extends { id: string }>(before: T[], after: T[]): T | undefined {
  const beforeIds = new Set(before.map(item => item.id))
  return after.find(item => !beforeIds.has(item.id))
}

describe('/api/dashboard/governance/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
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
    const operatorEventsBefore = await listPlatformGovernanceEvents(event, {
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      limit: 1000,
    })

    const result = await reportHandler(event)
    const serialized = JSON.stringify(result)
    const operatorEventsAfter = await listPlatformGovernanceEvents(event, {
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      limit: 1000,
    })

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    const operatorEvent = findNewEvent(operatorEventsBefore, operatorEventsAfter)
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
        key: 'preview-admin-cockpit',
        status: 'open',
        blocker: 'preview-authenticated-browser-evidence-required',
      }),
      expect.objectContaining({
        key: 'production-admin-cockpit',
        status: 'open',
        blocker: 'production-authenticated-browser-evidence-required',
      }),
      expect.objectContaining({
        key: 'd1-production',
        status: 'open',
        blocker: 'production-d1-binding-required',
      }),
    ]))
    expect(serialized).not.toContain('admin@example.com')
    expect(serialized).not.toContain('searcher@example.com')
    expect(serialized).not.toContain('provider-user@example.com')
    expect(serialized).not.toContain('secure://')
    expect(operatorEventsAfter).toHaveLength(operatorEventsBefore.length + 1)
    expect(operatorEvent).toMatchObject({
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      resourceId: 'local',
      channel: 'data-governance',
      unit: 'view',
      quantity: 1,
      metadata: expect.objectContaining({
        environment: 'local',
        format: 'json',
        deploymentId: null,
        evidenceSource: 'local-only',
      }),
    })
    expect(JSON.stringify(operatorEvent)).not.toContain('admin@example.com')
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
    const operatorEventsBefore = await listPlatformGovernanceEvents(event, {
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      limit: 1000,
    })

    const result = await reportHandler(event)
    const operatorEventsAfter = await listPlatformGovernanceEvents(event, {
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      limit: 1000,
    })

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(event)
    const operatorEvent = findNewEvent(operatorEventsBefore, operatorEventsAfter)
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
    expect(operatorEventsAfter).toHaveLength(operatorEventsBefore.length + 1)
    expect(operatorEvent?.metadata).toEqual(expect.objectContaining({
      environment: 'local',
      format: 'markdown',
      evidenceSource: 'local-only',
    }))
    expect(JSON.stringify(operatorEvent)).not.toContain('admin@example.com')
  })

  it('promotes preview cockpit evidence from an authenticated Cloudflare Pages admin view', async () => {
    vi.stubEnv('CF_PAGES_BRANCH', `preview-${crypto.randomUUID()}`)
    vi.stubEnv('CF_PAGES_PRODUCTION_BRANCH', 'main')

    const event = makeEvent(`preview-cockpit-${crypto.randomUUID()}`)
    const result = await reportHandler(event)

    expect(findEvidence(result, 'preview-admin-cockpit')).toMatchObject({
      key: 'preview-admin-cockpit',
      status: 'live',
      blocker: null,
    })
    expect(findEvidence(result, 'production-admin-cockpit')).toMatchObject({
      key: 'production-admin-cockpit',
      status: 'open',
      blocker: 'production-authenticated-browser-evidence-required',
    })
  })

  it('keeps Cloudflare Pages non-production branch evidence on the preview cockpit when production branch is not exposed', async () => {
    vi.stubEnv('CF_PAGES_BRANCH', `preview-${crypto.randomUUID()}`)

    const event = makeEvent(`preview-cockpit-no-production-branch-${crypto.randomUUID()}`)
    const result = await reportHandler(event)

    expect(findEvidence(result, 'preview-admin-cockpit')).toMatchObject({
      key: 'preview-admin-cockpit',
      status: 'live',
      blocker: null,
    })
    expect(findEvidence(result, 'production-admin-cockpit')).toMatchObject({
      key: 'production-admin-cockpit',
      status: 'open',
      blocker: 'production-authenticated-browser-evidence-required',
    })
  })

  it('keeps local production builds without Cloudflare Pages branch metadata as local-only cockpit evidence', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NITRO_PRESET', 'cloudflare-pages')

    const event = makeEvent(`local-production-cockpit-${crypto.randomUUID()}`)
    const operatorEventsBefore = await listPlatformGovernanceEvents(event, {
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      limit: 1000,
    })

    await reportHandler(event)
    const operatorEventsAfter = await listPlatformGovernanceEvents(event, {
      scope: 'governance',
      action: 'governance.operator_cockpit.viewed',
      resourceType: 'governance_report',
      limit: 1000,
    })

    expect(findNewEvent(operatorEventsBefore, operatorEventsAfter)).toMatchObject({
      resourceId: 'local',
      metadata: expect.objectContaining({
        environment: 'local',
        evidenceSource: 'local-only',
      }),
    })
  })

  it('promotes production cockpit evidence from an authenticated Cloudflare Pages production admin view', async () => {
    vi.stubEnv('CF_PAGES_BRANCH', 'main')
    vi.stubEnv('CF_PAGES_PRODUCTION_BRANCH', 'main')

    const event = makeEvent(`production-cockpit-${crypto.randomUUID()}`)
    const result = await reportHandler(event)

    expect(findEvidence(result, 'production-admin-cockpit')).toMatchObject({
      key: 'production-admin-cockpit',
      status: 'live',
      blocker: null,
    })
  })

  it('keeps local storage smoke and consumed quota smoke as local-only evidence', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(`local-evidence-${marker}`)
    await recordPlatformGovernanceEvent(event, {
      scope: 'storage',
      action: 'storage.channel_smoke.sent',
      actorId: 'storage-admin@example.com',
      resourceType: 'storage_channel',
      resourceId: `storage-policy-${marker}`,
      channel: 'r2',
      unit: 'smoke',
      quantity: 1,
      metadata: {
        policyName: `Local smoke ${marker}`,
        provider: 'cloudflare-r2',
        mode: 'write',
        reason: 'storage-channel-write-read-delete-ok',
        operations: ['resolve', 'write', 'read', 'delete'],
        storageChannel: 'memory',
        storageProvider: 'memory',
      },
    })
    await recordPlatformGovernanceEvent(event, {
      scope: 'intelligence',
      action: 'provider.quota_smoke.consumed',
      actorId: 'provider-admin@example.com',
      resourceType: 'provider',
      resourceId: `provider-${marker}`,
      channel: 'text.chat',
      unit: 'smoke',
      quantity: 1,
      metadata: {
        mode: 'consume',
        reason: 'provider-quota-consumed',
        requestRecorded: true,
        tokensRecorded: 1,
      },
    })

    const result = await reportHandler(event)

    expect(findEvidence(result, 'storage-smoke')).toMatchObject({
      key: 'storage-smoke',
      status: 'local-only',
    })
    expect(findEvidence(result, 'provider-quota')).toMatchObject({
      key: 'provider-quota',
      status: 'local-only',
    })
  })

  it('does not promote provider quota evidence from smoke-only blocked events', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(`quota-smoke-blocked-${marker}`)
    await recordPlatformGovernanceEvent(event, {
      scope: 'intelligence',
      action: 'provider.quota_smoke.blocked',
      actorId: 'provider-admin@example.com',
      resourceType: 'provider',
      resourceId: `provider-${marker}`,
      channel: 'text.chat',
      unit: 'smoke',
      quantity: 0,
      metadata: {
        evidenceSource: 'live',
        mode: 'consume',
        reason: 'request-quota-exceeded',
        requestRecorded: true,
        tokensRecorded: 10,
      },
    })

    const result = await reportHandler(event)

    expect(findEvidence(result, 'provider-quota')).toMatchObject({
      key: 'provider-quota',
      status: 'local-only',
    })
  })

  it('promotes provider quota evidence only after a live provider call is fail-closed', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(`quota-blocked-${marker}`)
    await recordPlatformGovernanceEvent(event, {
      scope: 'intelligence',
      action: 'provider.quota_blocked',
      actorId: 'provider-admin@example.com',
      resourceType: 'provider',
      resourceId: `provider-${marker}`,
      channel: 'text.chat',
      unit: 'blocked',
      quantity: 0,
      metadata: {
        evidenceSource: 'live',
        reason: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
        requestBlocked: true,
      },
    })

    const result = await reportHandler(event)

    expect(findEvidence(result, 'provider-quota')).toMatchObject({
      key: 'provider-quota',
      status: 'live',
    })
  })

  it('keeps browser notification delivery evidence as local-only', async () => {
    const marker = crypto.randomUUID()
    const event = makeEvent(`notification-local-${marker}`)
    await recordPlatformGovernanceEvent(event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      actorId: 'notification-admin@example.com',
      resourceType: 'notification',
      resourceId: `notification-${marker}`,
      channel: 'browser',
      unit: 'delivery',
      quantity: 1,
      metadata: {
        notificationAction: 'channel-test',
        provider: 'browser',
        providerType: 'browser',
        adapter: 'browser',
        credentialRequired: false,
        hasCredentialRef: false,
        evidenceSource: 'local-only',
        reason: 'delivery-sent',
      },
    })

    const result = await reportHandler(event)

    expect(findEvidence(result, 'notification-send')).toMatchObject({
      key: 'notification-send',
      status: 'local-only',
    })
  })
})
