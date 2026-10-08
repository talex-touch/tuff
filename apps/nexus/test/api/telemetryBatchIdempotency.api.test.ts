import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h3Mocks = vi.hoisted(() => ({
  getHeader: vi.fn(),
  readBody: vi.fn(),
}))

const ipMocks = vi.hoisted(() => ({
  guardTelemetryIp: vi.fn(),
}))

const identityMocks = vi.hoisted(() => ({
  resolveTelemetryUserId: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  DEFAULT_USER_PRIVACY_SETTINGS: {
    analytics: true,
    crashReports: true,
    usageData: false,
    personalization: true,
  },
  getUserById: vi.fn(),
}))

/**
 * The store is mocked at the boundary the route actually uses: plan (`prepareTelemetryWrite`),
 * then one commit carrying the receipt. `fakeDb` / `fakeBatch` are opaque tokens the route must
 * hand back untouched; `buildTelemetryBatchReceiptStatement` returns its input so the test can
 * read what the receipt would say.
 */
const telemetryMocks = vi.hoisted(() => ({
  fakeDb: { kind: 'd1' },
  fakeBatch: { kind: 'batch' },
  digestTelemetryBatchPayload: vi.fn(),
  getTelemetryBatchReceipt: vi.fn(),
  prepareTelemetryWrite: vi.fn(),
  commitTelemetryWrite: vi.fn(),
  buildTelemetryBatchReceiptStatement: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getHeader: h3Mocks.getHeader,
    readBody: h3Mocks.readBody,
  }
})

vi.mock('../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../server/utils/ipSecurityStore', () => ipMocks)
vi.mock('../../server/utils/telemetryIdentity', () => identityMocks)
vi.mock('../../server/utils/telemetryStore', async () => {
  const actual = await vi.importActual<typeof import('../../server/utils/telemetryStore')>('../../server/utils/telemetryStore')
  return {
    normalizeTelemetryIdempotencyKey: actual.normalizeTelemetryIdempotencyKey,
    digestTelemetryBatchPayload: telemetryMocks.digestTelemetryBatchPayload,
    getTelemetryBatchReceipt: telemetryMocks.getTelemetryBatchReceipt,
    prepareTelemetryWrite: telemetryMocks.prepareTelemetryWrite,
    commitTelemetryWrite: telemetryMocks.commitTelemetryWrite,
    buildTelemetryBatchReceiptStatement: telemetryMocks.buildTelemetryBatchReceiptStatement,
  }
})

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../server/api/telemetry/batch.post')).default as (event: any) => Promise<any>
})

function acceptEverything() {
  telemetryMocks.prepareTelemetryWrite.mockImplementation(async (_event: unknown, inputs: unknown[]) => ({
    db: telemetryMocks.fakeDb,
    batch: telemetryMocks.fakeBatch,
    results: inputs.map(() => ({ status: 'accepted' })),
  }))
  telemetryMocks.commitTelemetryWrite.mockResolvedValue(undefined)
  telemetryMocks.buildTelemetryBatchReceiptStatement.mockImplementation((_db: unknown, input: unknown) => ({ receipt: input }))
}

function preparedInputs(): any[] {
  return telemetryMocks.prepareTelemetryWrite.mock.calls[0]?.[1] ?? []
}

function committedReceipt(): any {
  const options = telemetryMocks.commitTelemetryWrite.mock.calls[0]?.[2]
  return options?.extraStatements?.[0]?.receipt
}

describe('/api/telemetry/batch idempotency and honest ACKs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getHeader.mockReturnValue('sentry:00000000-0000-4000-8000-000000000001')
    h3Mocks.readBody.mockResolvedValue({
      events: [
        { eventType: 'search', clientId: 'client-1', searchDurationMs: 12 },
        { eventType: 'not-real' },
      ],
    })
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    identityMocks.resolveTelemetryUserId.mockResolvedValue('user-1')
    authStoreMocks.getUserById.mockResolvedValue({
      privacySettings: {
        analytics: true,
        crashReports: true,
        usageData: true,
        personalization: true,
      },
    })
    telemetryMocks.digestTelemetryBatchPayload.mockReturnValue('payload-hash')
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue(null)
    acceptEverything()
  })

  it('reports accepted, rejected, and processed from actual writes', async () => {
    const result = await handler({})

    expect(result).toEqual({
      success: true,
      accepted: 1,
      rejected: 1,
      duplicate: false,
      dropped: 0,
      processed: 1,
    })
    expect(preparedInputs()).toHaveLength(1)
    expect(preparedInputs()[0]).toMatchObject({ eventType: 'search', clientId: 'client-1' })
    expect(committedReceipt()).toMatchObject({
      scope: 'telemetry.batch',
      idempotencyKey: 'sentry:00000000-0000-4000-8000-000000000001',
      payloadHash: 'payload-hash',
      response: expect.objectContaining({ accepted: 1, rejected: 1, processed: 1 }),
    })
  })

  it('commits rows and receipt through one call, on the prepared db and batch', async () => {
    await handler({})

    expect(telemetryMocks.commitTelemetryWrite).toHaveBeenCalledTimes(1)
    const [, prepared, options] = telemetryMocks.commitTelemetryWrite.mock.calls[0]
    expect(prepared).toEqual({ db: telemetryMocks.fakeDb, batch: telemetryMocks.fakeBatch })
    expect(options.extraStatements).toHaveLength(1)
    expect(telemetryMocks.buildTelemetryBatchReceiptStatement).toHaveBeenCalledWith(telemetryMocks.fakeDb, expect.anything())
  })

  it('counts quarantined events as rejected', async () => {
    telemetryMocks.prepareTelemetryWrite.mockResolvedValue({
      db: telemetryMocks.fakeDb,
      batch: telemetryMocks.fakeBatch,
      results: [{ status: 'quarantined', reason: 'invalid_event' }],
    })

    await expect(handler({})).resolves.toMatchObject({ accepted: 0, rejected: 2, processed: 0 })
    expect(committedReceipt().response).toMatchObject({ accepted: 0, rejected: 2 })
  })

  it('returns the stored ACK for the same idempotency key and payload', async () => {
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue({
      payloadHash: 'payload-hash',
      response: {
        success: true,
        accepted: 2,
        rejected: 0,
        duplicate: false,
        dropped: 0,
        processed: 2,
      },
    })

    await expect(handler({})).resolves.toMatchObject({
      accepted: 2,
      duplicate: true,
      processed: 2,
    })
    expect(telemetryMocks.prepareTelemetryWrite).not.toHaveBeenCalled()
    expect(telemetryMocks.commitTelemetryWrite).not.toHaveBeenCalled()
  })

  it('rejects an idempotency key reused with a different payload', async () => {
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue({
      payloadHash: 'other-hash',
      response: { success: true, accepted: 1, rejected: 0, duplicate: false, dropped: 0, processed: 1 },
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Idempotency key reused with different telemetry payload',
    })
    expect(telemetryMocks.prepareTelemetryWrite).not.toHaveBeenCalled()
  })

  it('fails before recording when the batch has no usable idempotency key', async () => {
    h3Mocks.getHeader.mockReturnValue(null)

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'X-Idempotency-Key header required',
    })
    expect(ipMocks.guardTelemetryIp).not.toHaveBeenCalled()
    expect(telemetryMocks.prepareTelemetryWrite).not.toHaveBeenCalled()
  })

  it('surfaces a failed commit and never acknowledges separately from the rows', async () => {
    telemetryMocks.commitTelemetryWrite.mockRejectedValue(new Error('D1 write failed'))

    await expect(handler({})).rejects.toThrow('D1 write failed')
    // The receipt only ever travels inside the commit; there is no second write to skip.
    expect(telemetryMocks.commitTelemetryWrite).toHaveBeenCalledTimes(1)
    expect(committedReceipt()).toBeDefined()
  })

  it('answers 503 instead of a false success when no database is bound', async () => {
    telemetryMocks.prepareTelemetryWrite.mockResolvedValue({
      db: null,
      batch: null,
      results: [{ status: 'dropped', reason: 'database_unavailable' }],
    })

    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
    expect(telemetryMocks.commitTelemetryWrite).not.toHaveBeenCalled()
  })
})

describe('/api/telemetry/batch attribution follows the event flag, not just the token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getHeader.mockReturnValue('sentry:00000000-0000-4000-8000-000000000003')
    h3Mocks.readBody.mockResolvedValue({
      events: [
        { eventType: 'search', clientId: 'client-1', isAnonymous: false },
        { eventType: 'search', clientId: 'client-1', isAnonymous: true },
        { eventType: 'search', clientId: 'client-1' },
      ],
    })
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    authStoreMocks.getUserById.mockResolvedValue({
      privacySettings: { analytics: true, crashReports: true, usageData: true, personalization: true },
    })
    telemetryMocks.digestTelemetryBatchPayload.mockReturnValue('attribution-hash')
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue(null)
    acceptEverything()
  })

  it('attributes only events that explicitly opt out of anonymity on an authenticated request', async () => {
    identityMocks.resolveTelemetryUserId.mockResolvedValue('user-1')

    await handler({})

    expect(preparedInputs().map((input: any) => [input.userId, input.isAnonymous])).toEqual([
      ['user-1', false],
      [undefined, true],
      [undefined, true],
    ])
  })

  it('keeps every event anonymous on an unauthenticated request whatever the body claims', async () => {
    identityMocks.resolveTelemetryUserId.mockResolvedValue(null)

    await handler({})

    expect(preparedInputs().map((input: any) => [input.userId, input.isAnonymous])).toEqual([
      [undefined, true],
      [undefined, true],
      [undefined, true],
    ])
  })
})

describe('/api/telemetry/batch privacy settings gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getHeader.mockReturnValue('sentry:00000000-0000-4000-8000-000000000002')
    h3Mocks.readBody.mockResolvedValue({
      events: [
        { eventType: 'search', clientId: 'client-1', searchDurationMs: 12 },
        { eventType: 'error', clientId: 'client-1' },
      ],
    })
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    identityMocks.resolveTelemetryUserId.mockResolvedValue('user-1')
    telemetryMocks.digestTelemetryBatchPayload.mockReturnValue('privacy-payload-hash')
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue(null)
    acceptEverything()
  })

  it('rejects every logged-in telemetry event when analytics is disabled', async () => {
    authStoreMocks.getUserById.mockResolvedValue({
      privacySettings: {
        analytics: false,
        crashReports: true,
        usageData: true,
        personalization: true,
      },
    })

    await expect(handler({})).resolves.toMatchObject({
      accepted: 0,
      rejected: 2,
      processed: 0,
    })
    expect(preparedInputs()).toEqual([])
    expect(committedReceipt().response).toMatchObject({ accepted: 0, rejected: 2, processed: 0 })
  })

  it('keeps crash reports while rejecting usage telemetry when usageData is disabled', async () => {
    authStoreMocks.getUserById.mockResolvedValue({
      privacySettings: {
        analytics: true,
        crashReports: true,
        usageData: false,
        personalization: true,
      },
    })

    await expect(handler({})).resolves.toMatchObject({
      accepted: 1,
      rejected: 1,
      processed: 1,
    })
    expect(preparedInputs()).toHaveLength(1)
    expect(preparedInputs()[0]).toMatchObject({ eventType: 'error' })
  })

  it('rejects crash telemetry when crashReports is disabled', async () => {
    h3Mocks.readBody.mockResolvedValue({
      events: [
        { eventType: 'error', clientId: 'client-1' },
      ],
    })
    authStoreMocks.getUserById.mockResolvedValue({
      privacySettings: {
        analytics: true,
        crashReports: false,
        usageData: true,
        personalization: true,
      },
    })

    await expect(handler({})).resolves.toMatchObject({
      accepted: 0,
      rejected: 1,
      processed: 0,
    })
    expect(preparedInputs()).toEqual([])
  })
})
