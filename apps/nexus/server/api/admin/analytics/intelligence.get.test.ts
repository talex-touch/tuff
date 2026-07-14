import type { IntelligenceAuditRecord } from '../../../utils/intelligenceStore'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const intelligenceStoreMocks = vi.hoisted(() => ({
  listRuntimeAudits: vi.fn(),
}))

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/intelligenceStore', () => intelligenceStoreMocks)

let handler: (event: unknown) => Promise<unknown>
let getQueryMock: ReturnType<typeof vi.fn>

const routeGlobals = vi.hoisted(() => {
  const globals = globalThis as typeof globalThis & {
    defineEventHandler?: unknown
    getQuery?: unknown
  }
  return {
    originalDefineEventHandler: globals.defineEventHandler,
    originalGetQuery: globals.getQuery,
  }
})

function audit(overrides: Partial<IntelligenceAuditRecord>): IntelligenceAuditRecord {
  return {
    id: 'audit-default',
    userId: 'admin-1',
    providerId: 'provider-1',
    providerType: 'openai-compatible',
    providerName: 'Nexus provider',
    model: 'model-1',
    endpoint: null,
    status: 500,
    latency: 120,
    success: false,
    errorMessage: null,
    traceId: null,
    metadata: null,
    createdAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  }
}

beforeAll(async () => {
  ;(globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler = handler => handler
  getQueryMock = vi.fn()
  ;(globalThis as typeof globalThis & { getQuery?: unknown }).getQuery = getQueryMock
  handler = (await import('./intelligence.get')).default as (event: unknown) => Promise<unknown>
})

beforeEach(() => {
  vi.resetAllMocks()
  getQueryMock.mockReturnValue({ days: '7' })
  authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1' })
})

afterAll(() => {
  const globals = globalThis as typeof globalThis & {
    defineEventHandler?: unknown
    getQuery?: unknown
  }
  if (routeGlobals.originalDefineEventHandler === undefined)
    delete globals.defineEventHandler
  else
    globals.defineEventHandler = routeGlobals.originalDefineEventHandler
  if (routeGlobals.originalGetQuery === undefined)
    delete globals.getQuery
  else
    globals.getQuery = routeGlobals.originalGetQuery
  vi.restoreAllMocks()
})

describe('/api/admin/analytics/intelligence', () => {
  it('reports sorted canonical error codes for failed current and legacy runtime audits without exposing raw failures', async () => {
    const rawQuotaMessage = 'raw-quota-message-must-not-leak'
    const rawNetworkMessage = 'raw-network-message-must-not-leak'
    const rawUnknownMessage = 'raw-unknown-message-must-not-leak'
    const rawStack = 'raw-stack-must-not-leak'

    intelligenceStoreMocks.listRuntimeAudits.mockResolvedValue([
      audit({
        id: 'current-quota',
        traceId: 'trace-current-quota',
        metadata: {
          source: 'intelligence-agent-runtime',
          status: 'failed',
          sessionId: 'current-quota-session',
          errorCode: 'QUOTA_EXHAUSTED',
          error: { message: rawQuotaMessage, stack: rawStack },
        },
      }),
      audit({
        id: 'legacy-network',
        traceId: 'trace-legacy-network',
        metadata: {
          source: 'intelligence-lab-runtime',
          status: 'failed',
          sessionId: 'legacy-network-session',
          error: { message: `fetch failed: socket reset (${rawNetworkMessage})`, stack: rawStack },
        },
      }),
      audit({
        id: 'current-quota-duplicate',
        traceId: 'trace-current-quota-duplicate',
        metadata: {
          source: 'intelligence-agent-runtime',
          status: 'failed',
          sessionId: 'current-quota-duplicate-session',
          errorCode: 'QUOTA_EXHAUSTED',
        },
      }),
      audit({
        id: 'legacy-unknown',
        traceId: 'trace-legacy-unknown',
        metadata: {
          source: 'intelligence-lab-runtime',
          status: 'failed',
          sessionId: 'legacy-unknown-session',
          error: { message: rawUnknownMessage, stack: rawStack },
        },
      }),
      audit({
        id: 'current-success-with-stale-error',
        status: 200,
        success: true,
        traceId: 'trace-current-success',
        metadata: {
          source: 'intelligence-agent-runtime',
          status: 'completed',
          sessionId: 'current-success-session',
          errorCode: 'QUOTA_EXHAUSTED',
          error: { message: rawQuotaMessage, stack: rawStack },
        },
      }),
    ])

    const response = await handler({}) as {
      summary: { days: number, totalRuns: number, successRuns: number, failureRuns: number }
      errorCodeDistribution: Array<{ code: string, count: number }>
      recentRuns: Array<{ sessionId: string, errorCode?: string }>
    }
    const serializedResponse = JSON.stringify(response)
    const serializedBody = JSON.parse(serializedResponse) as typeof response

    expect(response.summary).toMatchObject({
      days: 7,
      totalRuns: 5,
      successRuns: 1,
      failureRuns: 4,
    })
    expect(response.errorCodeDistribution).toEqual([
      { code: 'QUOTA_EXHAUSTED', count: 2 },
      { code: 'NETWORK_FAILURE', count: 1 },
      { code: 'UNKNOWN', count: 1 },
    ])
    expect(response.recentRuns.map(run => ({ sessionId: run.sessionId, errorCode: run.errorCode }))).toEqual([
      { sessionId: 'current-quota-session', errorCode: 'QUOTA_EXHAUSTED' },
      { sessionId: 'legacy-network-session', errorCode: 'NETWORK_FAILURE' },
      { sessionId: 'current-quota-duplicate-session', errorCode: 'QUOTA_EXHAUSTED' },
      { sessionId: 'legacy-unknown-session', errorCode: 'UNKNOWN' },
      { sessionId: 'current-success-session', errorCode: undefined },
    ])
    expect(serializedBody.recentRuns.at(-1)).not.toHaveProperty('errorCode')
    expect(serializedResponse).not.toContain(rawQuotaMessage)
    expect(serializedResponse).not.toContain(rawNetworkMessage)
    expect(serializedResponse).not.toContain(rawUnknownMessage)
    expect(serializedResponse).not.toContain(rawStack)
  })
})
