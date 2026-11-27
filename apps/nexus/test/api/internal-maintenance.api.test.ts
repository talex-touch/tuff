import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** POST /api/internal/maintenance/:task: only the maintenance Worker's secret gets in. */

const mocks = vi.hoisted(() => ({
  runExpiredAsrResultCleanup: vi.fn(async () => ({ results: { scanned: 0 }, released: { scanned: 0 } })),
  reconcileExpiredAsrSettlements: vi.fn(async () => ({ scanned: 0 })),
  holdMaintenanceRun: vi.fn(async () => {}),
  runTelemetryRetentionMaintenanceIfDue: vi.fn(async () => ({ status: 'skipped' })),
  cleanupDocEngagementRecords: vi.fn(async () => ({ sessions: 3, nonces: 1, challenges: 0 })),
  finalizeExpiredAccountDeletions: vi.fn(async () => ({ scanned: 1, finalized: 1, alreadyFinalized: 0, failed: 0, errors: [] })),
  bindings: { DB: {}, MAINTENANCE_SECRET: 'shared-secret' } as Record<string, unknown> | undefined,
}))

vi.mock('../../server/utils/asrCleanupSchedule', () => ({
  ASR_RESULT_CLEANUP_LEASE_KEY: 'asr_result_cleanup',
  runExpiredAsrResultCleanup: mocks.runExpiredAsrResultCleanup,
}))
vi.mock('../../server/utils/asrTranscriptionService', () => ({ reconcileExpiredAsrSettlements: mocks.reconcileExpiredAsrSettlements }))
vi.mock('../../server/utils/maintenanceLease', () => ({ holdMaintenanceRun: mocks.holdMaintenanceRun }))
vi.mock('../../server/utils/telemetryRetentionMaintenance', () => ({ runTelemetryRetentionMaintenanceIfDue: mocks.runTelemetryRetentionMaintenanceIfDue }))
vi.mock('../../server/utils/docAnalyticsStore', () => ({ cleanupDocEngagementRecords: mocks.cleanupDocEngagementRecords }))
vi.mock('../../server/utils/privacyDataStore', () => ({ finalizeExpiredAccountDeletions: mocks.finalizeExpiredAccountDeletions }))
vi.mock('../../server/utils/cloudflare', () => ({ readCloudflareBindings: () => mocks.bindings }))

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  const h3 = await import('h3')
  Object.assign(globalThis, {
    defineEventHandler: (fn: any) => fn,
    createError: h3.createError,
    getHeader: (event: any, name: string) => event.headers[name],
    getRouterParam: (event: any, name: string) => event.params[name],
  })
  handler = (await import('../../server/api/internal/maintenance/[task].post')).default as typeof handler
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bindings = { DB: {}, MAINTENANCE_SECRET: 'shared-secret' }
})

function event(task: string, secret?: string) {
  return { headers: secret === undefined ? {} : { 'x-maintenance-secret': secret }, params: { task } }
}

describe('/api/internal/maintenance/:task', () => {
  it('answers 404 without the secret, with a wrong one, or when the deployment has none', async () => {
    await expect(handler(event('asr'))).rejects.toMatchObject({ statusCode: 404 })
    await expect(handler(event('asr', 'shared-secreT'))).rejects.toMatchObject({ statusCode: 404 })
    mocks.bindings = { DB: {} }
    await expect(handler(event('asr', 'shared-secret'))).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.runExpiredAsrResultCleanup).not.toHaveBeenCalled()
  })

  it('holds the ASR lease ahead of the Worker\'s next run, then cleans up', async () => {
    const result = await handler(event('asr', 'shared-secret'))

    expect(mocks.holdMaintenanceRun).toHaveBeenCalledWith({}, 'asr_result_cleanup', expect.any(Date), 10 * 60 * 1000)
    expect(mocks.holdMaintenanceRun.mock.invocationCallOrder[0]).toBeLessThan(mocks.runExpiredAsrResultCleanup.mock.invocationCallOrder[0]!)
    expect(result).toMatchObject({ task: 'asr', result: { results: { scanned: 0 } } })
  })

  it('runs retention, docs cleanup, and privacy-deletions, failing closed when any deletion fails', async () => {
    expect(await handler(event('retention', 'shared-secret'))).toMatchObject({ task: 'retention', result: { status: 'skipped' } })
    expect(await handler(event('docs', 'shared-secret'))).toMatchObject({ task: 'docs', result: { sessions: 3 } })
    expect(await handler(event('privacy-deletions', 'shared-secret'))).toMatchObject({
      task: 'privacy-deletions',
      result: { scanned: 1, finalized: 1, failed: 0 },
    })

    mocks.finalizeExpiredAccountDeletions.mockResolvedValueOnce({
      scanned: 1,
      finalized: 0,
      alreadyFinalized: 0,
      failed: 1,
      errors: [{ userIdHash: 'abc', message: 'boom' }],
    })
    await expect(handler(event('privacy-deletions', 'shared-secret'))).rejects.toMatchObject({ statusCode: 500 })

    await expect(handler(event('drop-everything', 'shared-secret'))).rejects.toMatchObject({ statusCode: 404 })
  })
})
