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

const telemetryMocks = vi.hoisted(() => ({
  digestTelemetryBatchPayload: vi.fn(),
  getTelemetryBatchReceipt: vi.fn(),
  recordTelemetryEvent: vi.fn(),
  storeTelemetryBatchReceipt: vi.fn(),
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
vi.mock('../../server/utils/telemetryStore', () => telemetryMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../server/api/telemetry/batch.post')).default as (event: any) => Promise<any>
})

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
    telemetryMocks.recordTelemetryEvent.mockResolvedValue({ status: 'accepted' })
    telemetryMocks.storeTelemetryBatchReceipt.mockResolvedValue(undefined)
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
    expect(telemetryMocks.recordTelemetryEvent).toHaveBeenCalledTimes(1)
    expect(telemetryMocks.storeTelemetryBatchReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      payloadHash: 'payload-hash',
      response: expect.objectContaining({ accepted: 1, rejected: 1, processed: 1 }),
    }))
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
    expect(telemetryMocks.recordTelemetryEvent).not.toHaveBeenCalled()
    expect(telemetryMocks.storeTelemetryBatchReceipt).not.toHaveBeenCalled()
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
    expect(telemetryMocks.recordTelemetryEvent).not.toHaveBeenCalled()
  })

  it('fails before recording when the batch has no usable idempotency key', async () => {
    h3Mocks.getHeader.mockReturnValue(null)

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'X-Idempotency-Key header required',
    })
    expect(ipMocks.guardTelemetryIp).not.toHaveBeenCalled()
    expect(telemetryMocks.recordTelemetryEvent).not.toHaveBeenCalled()
  })

  it('does not persist a receipt when an event write fails', async () => {
    telemetryMocks.recordTelemetryEvent.mockRejectedValue(new Error('D1 write failed'))

    await expect(handler({})).rejects.toThrow('D1 write failed')
    expect(telemetryMocks.storeTelemetryBatchReceipt).not.toHaveBeenCalled()
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
    telemetryMocks.recordTelemetryEvent.mockResolvedValue({ status: 'accepted' })
    telemetryMocks.storeTelemetryBatchReceipt.mockResolvedValue(undefined)
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
    expect(telemetryMocks.recordTelemetryEvent).not.toHaveBeenCalled()
    expect(telemetryMocks.storeTelemetryBatchReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      response: expect.objectContaining({ accepted: 0, rejected: 2, processed: 0 }),
    }))
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
    expect(telemetryMocks.recordTelemetryEvent).toHaveBeenCalledTimes(1)
    expect(telemetryMocks.recordTelemetryEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'error',
    }))
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
    expect(telemetryMocks.recordTelemetryEvent).not.toHaveBeenCalled()
  })
})
