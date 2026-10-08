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

const telemetryMocks = vi.hoisted(() => ({
  fakeDb: { kind: 'd1' },
  fakeBatch: { kind: 'batch' },
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

vi.mock('../../server/utils/ipSecurityStore', () => ipMocks)
vi.mock('../../server/utils/telemetryIdentity', () => identityMocks)
vi.mock('../../server/utils/telemetryStore', async () => {
  const actual = await vi.importActual<typeof import('../../server/utils/telemetryStore')>('../../server/utils/telemetryStore')
  return {
    // The key normaliser and the payload digest are pure; the real ones are what a duplicate
    // detection test has to agree with.
    normalizeTelemetryIdempotencyKey: actual.normalizeTelemetryIdempotencyKey,
    digestTelemetryBatchPayload: actual.digestTelemetryBatchPayload,
    getTelemetryBatchReceipt: telemetryMocks.getTelemetryBatchReceipt,
    prepareTelemetryWrite: telemetryMocks.prepareTelemetryWrite,
    commitTelemetryWrite: telemetryMocks.commitTelemetryWrite,
    buildTelemetryBatchReceiptStatement: telemetryMocks.buildTelemetryBatchReceiptStatement,
  }
})

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../server/api/telemetry/record.post')).default as (event: any) => Promise<any>
})

const STARTUP_KEY = 'startup:1f0b2a3c-aaaa-4bbb-8ccc-000000000001'

function startupBody(extra: Record<string, unknown> = {}) {
  return {
    eventType: 'visit',
    clientId: 'client-1',
    platform: 'darwin',
    version: '2.4.14',
    isAnonymous: true,
    metadata: { kind: 'startup', idempotencyKey: STARTUP_KEY, totalStartupTime: 1234 },
    ...extra,
  }
}

function acceptEverything() {
  telemetryMocks.prepareTelemetryWrite.mockImplementation(async (_event: unknown, inputs: unknown[]) => ({
    db: telemetryMocks.fakeDb,
    batch: telemetryMocks.fakeBatch,
    results: inputs.map(() => ({ status: 'accepted' })),
  }))
  telemetryMocks.commitTelemetryWrite.mockResolvedValue(undefined)
  telemetryMocks.buildTelemetryBatchReceiptStatement.mockImplementation((_db: unknown, input: unknown) => ({ receipt: input }))
}

function committedReceipt(): any {
  const options = telemetryMocks.commitTelemetryWrite.mock.calls[0]?.[2]
  return options?.extraStatements?.[0]?.receipt
}

function preparedInput(): any {
  return telemetryMocks.prepareTelemetryWrite.mock.calls[0]?.[1]?.[0]
}

describe('/api/telemetry/record idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getHeader.mockReturnValue(null)
    h3Mocks.readBody.mockResolvedValue(startupBody())
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    identityMocks.resolveTelemetryUserId.mockResolvedValue(null)
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue(null)
    acceptEverything()
  })

  it('takes the key from the header and commits the receipt with the event', async () => {
    h3Mocks.getHeader.mockReturnValue(' sentry:11111111-2222-4333-8444-555555555555 ')

    await expect(handler({})).resolves.toEqual({ success: true, accepted: 1, rejected: 0, duplicate: false })

    expect(telemetryMocks.getTelemetryBatchReceipt).toHaveBeenCalledWith(
      expect.anything(),
      'telemetry.record',
      'sentry:11111111-2222-4333-8444-555555555555',
    )
    expect(committedReceipt()).toMatchObject({
      scope: 'telemetry.record',
      idempotencyKey: 'sentry:11111111-2222-4333-8444-555555555555',
      response: { success: true, accepted: 1, rejected: 0, duplicate: false },
    })
    expect(telemetryMocks.commitTelemetryWrite).toHaveBeenCalledTimes(1)
    expect(telemetryMocks.commitTelemetryWrite.mock.calls[0][1]).toEqual({
      db: telemetryMocks.fakeDb,
      batch: telemetryMocks.fakeBatch,
    })
  })

  it('falls back to the startup report key already in the metadata when no header is sent', async () => {
    await handler({})

    expect(telemetryMocks.getTelemetryBatchReceipt).toHaveBeenCalledWith(expect.anything(), 'telemetry.record', STARTUP_KEY)
    expect(committedReceipt()).toMatchObject({ scope: 'telemetry.record', idempotencyKey: STARTUP_KEY })
  })

  it('returns the stored ACK for a retried report instead of recording it again', async () => {
    await handler({})
    const firstReceipt = committedReceipt()
    expect(firstReceipt.payloadHash).toEqual(expect.any(String))

    vi.clearAllMocks()
    acceptEverything()
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    identityMocks.resolveTelemetryUserId.mockResolvedValue(null)
    h3Mocks.readBody.mockResolvedValue(startupBody())
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue({
      payloadHash: firstReceipt.payloadHash,
      response: firstReceipt.response,
    })

    await expect(handler({})).resolves.toEqual({ success: true, accepted: 1, rejected: 0, duplicate: true })
    expect(telemetryMocks.prepareTelemetryWrite).not.toHaveBeenCalled()
    expect(telemetryMocks.commitTelemetryWrite).not.toHaveBeenCalled()
  })

  it('rejects a key reused with a different payload', async () => {
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue({
      payloadHash: 'something-else',
      response: { success: true, accepted: 1, rejected: 0, duplicate: false },
    })

    await expect(handler({})).rejects.toMatchObject({ statusCode: 409 })
    expect(telemetryMocks.prepareTelemetryWrite).not.toHaveBeenCalled()
  })

  it('records without a receipt when the client sent no usable key', async () => {
    h3Mocks.readBody.mockResolvedValue(startupBody({ metadata: { kind: 'startup', idempotencyKey: 'short' } }))

    await expect(handler({})).resolves.toEqual({ success: true, accepted: 1, rejected: 0, duplicate: false })
    expect(telemetryMocks.getTelemetryBatchReceipt).not.toHaveBeenCalled()
    expect(telemetryMocks.commitTelemetryWrite.mock.calls[0][2]).toEqual({ extraStatements: [] })
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

  it('reports a quarantined event as rejected, not accepted', async () => {
    telemetryMocks.prepareTelemetryWrite.mockResolvedValue({
      db: telemetryMocks.fakeDb,
      batch: telemetryMocks.fakeBatch,
      results: [{ status: 'quarantined', reason: 'invalid_event' }],
    })

    await expect(handler({})).resolves.toEqual({ success: true, accepted: 0, rejected: 1, duplicate: false })
  })
})

describe('/api/telemetry/record attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getHeader.mockReturnValue(null)
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue(null)
    acceptEverything()
  })

  it('attributes an authenticated event only when it explicitly opts out of anonymity', async () => {
    identityMocks.resolveTelemetryUserId.mockResolvedValue('user-1')

    h3Mocks.readBody.mockResolvedValue(startupBody({ isAnonymous: false }))
    await handler({})
    expect(preparedInput()).toMatchObject({ userId: 'user-1', isAnonymous: false })

    vi.clearAllMocks()
    acceptEverything()
    ipMocks.guardTelemetryIp.mockResolvedValue(undefined)
    identityMocks.resolveTelemetryUserId.mockResolvedValue('user-1')
    telemetryMocks.getTelemetryBatchReceipt.mockResolvedValue(null)
    h3Mocks.readBody.mockResolvedValue(startupBody({ isAnonymous: true }))
    await handler({})
    expect(preparedInput()).toMatchObject({ userId: undefined, isAnonymous: true })
  })

  it('never attributes an unauthenticated event, whatever the body says', async () => {
    identityMocks.resolveTelemetryUserId.mockResolvedValue(null)
    h3Mocks.readBody.mockResolvedValue(startupBody({ isAnonymous: false }))

    await handler({})

    expect(preparedInput()).toMatchObject({ userId: undefined, isAnonymous: true })
  })
})
