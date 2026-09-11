import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pollAsrTranscription, startAsrTranscription } from './asrTranscriptionService'
import { DEFAULT_CREDIT_PRICING, selectCreditPricingRule } from './creditPricingStore'
import { DashScopeAsrError, type DashScopeFiletransAdapter, type DashScopeFiletransTask } from './dashscopeAsrProvider'
import type { AsrRequestRecord } from './asrTranscriptionStore'
import type * as AsrTranscriptionStoreModule from './asrTranscriptionStore'
import type * as CreditPricingStoreModule from './creditPricingStore'
import type { ProviderRegistryRecord } from './providerRegistryStore'

const runtimeConfig = vi.hoisted(() => ({
  auth: { origin: 'https://nexus.example.com' },
}))

const creditsMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
  releaseConsumedCredits: vi.fn(),
}))

const registryMocks = vi.hoisted(() => ({
  getProviderRegistryEntry: vi.fn(),
  listProviderRegistryEntries: vi.fn(),
}))

const pricingMocks = vi.hoisted(() => ({
  resolveCreditPricingRule: vi.fn(),
}))

const storeMocks = vi.hoisted(() => ({
  ASR_AUDIO_MAX_BYTES: 20 * 1024 * 1024,
  createAsrRequest: vi.fn(),
  deleteAsrHandoffObject: vi.fn(),
  getAsrRequest: vi.fn(),
  markAsrDispatching: vi.fn(),
  markAsrFailed: vi.fn(),
  markAsrReleased: vi.fn(),
  markAsrReserved: vi.fn(),
  markAsrSettled: vi.fn(),
  normalizeAsrContentType: vi.fn(() => 'audio/wav'),
  normalizeAsrIdempotencyKey: vi.fn(() => 'idempotency-key'),
  parseWavDurationSeconds: vi.fn(() => 1),
  toAsrSafeStatus: vi.fn((request: AsrRequestRecord) => ({
    requestId: request.id,
    status: request.status,
    creditsCharged: request.chargedCredits,
    billedSeconds: request.billedSeconds,
    failureCode: request.failureCode,
  })),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))
vi.mock('./creditsStore', () => creditsMocks)
vi.mock('./providerRegistryStore', () => registryMocks)
// Only the stored price list needs a database; the pricing math stays real so the
// settled credits are the shipped ASR price rather than a fixture.
vi.mock('./creditPricingStore', async (importOriginal) => {
  const actual = await importOriginal<typeof CreditPricingStoreModule>()
  return { ...actual, resolveCreditPricingRule: pricingMocks.resolveCreditPricingRule }
})
vi.mock('./asrTranscriptionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof AsrTranscriptionStoreModule>()
  return {
    ...storeMocks,
    calculateFiletransCredits: actual.calculateFiletransCredits,
    calculateFiletransProviderCost: actual.calculateFiletransProviderCost,
  }
})

const provider: ProviderRegistryRecord = {
  id: 'dashscope-provider',
  name: 'dashscope-provider',
  displayName: 'DashScope',
  vendor: 'dashscope',
  status: 'enabled',
  authType: 'api_key',
  authRef: 'secure://dashscope',
  ownerScope: 'system',
  ownerId: null,
  description: null,
  endpoint: 'https://dashscope.example.com/api/v1',
  region: null,
  metadata: null,
  capabilities: [{
    id: 'audio-transcribe',
    providerId: 'dashscope-provider',
    capability: 'audio.transcribe',
    schemaRef: null,
    metering: null,
    constraints: null,
    metadata: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
  }],
  createdBy: 'test',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
}

function request(overrides: Partial<AsrRequestRecord> = {}): AsrRequestRecord {
  return {
    id: 'asr-request-1',
    userId: 'user-1',
    providerId: provider.id,
    capability: 'audio.transcribe',
    idempotencyKey: 'idempotency-key',
    requestHash: 'request-hash',
    objectKey: 'private/asr-request-1.wav',
    contentType: 'audio/wav',
    byteSize: 48,
    durationSeconds: 1,
    deliveryTokenHash: 'delivery-token-hash',
    deliveryExpiresAt: '2026-09-08T00:15:00.000Z',
    providerTaskId: 'task-1',
    status: 'dispatching',
    reservedCredits: 10,
    chargedCredits: null,
    billedSeconds: null,
    providerCostCny: null,
    failureCode: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

function adapter(task: DashScopeFiletransTask | Error): DashScopeFiletransAdapter {
  return {
    submit: vi.fn(async () => ({ taskId: 'task-1' })),
    getTask: vi.fn(async () => {
      if (task instanceof Error)
        throw task
      return task
    }),
  } as unknown as DashScopeFiletransAdapter
}

beforeEach(() => {
  vi.clearAllMocks()
  pricingMocks.resolveCreditPricingRule.mockImplementation(async (_event, capability: string) =>
    selectCreditPricingRule(capability, DEFAULT_CREDIT_PRICING),
  )
  registryMocks.listProviderRegistryEntries.mockResolvedValue([provider])
  registryMocks.getProviderRegistryEntry.mockResolvedValue(provider)
  storeMocks.createAsrRequest.mockResolvedValue({
    created: true,
    deliveryToken: 'opaque-delivery-token',
    request: request({ status: 'pending', providerTaskId: null }),
  })
  storeMocks.markAsrReserved.mockResolvedValue(request({ status: 'reserved', providerTaskId: null }))
  storeMocks.markAsrDispatching.mockResolvedValue(request())
  storeMocks.markAsrReleased.mockImplementation(async (_event, requestId: string, failureCode: string) => request({
    id: requestId,
    status: 'released',
    failureCode,
  }))
  storeMocks.markAsrFailed.mockImplementation(async (_event, requestId: string, failureCode: string) => request({
    id: requestId,
    status: 'failed',
    failureCode,
  }))
  storeMocks.markAsrSettled.mockImplementation(
    async (_event, requestId: string, chargedCredits: number, billedSeconds: number) => request({
      id: requestId,
      status: 'settled',
      chargedCredits,
      billedSeconds,
    }),
  )
  storeMocks.getAsrRequest.mockResolvedValue(request())
})

describe('ASR terminal accounting', () => {
  it('marks an accepted provider task failure as failed without releasing its reservation', async () => {
    const result = await pollAsrTranscription(
      {} as never,
      'user-1',
      'asr-request-1',
      { adapter: adapter({ status: 'failed' }) },
    )

    expect(result).toMatchObject({
      requestId: 'asr-request-1',
      status: 'failed',
      failureCode: 'ASR_PROVIDER_FAILED',
    })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_FAILED')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })

  it.each([
    'ASR_PROVIDER_UNAVAILABLE',
    'ASR_PROVIDER_RESPONSE_INVALID',
  ] as const)('turns accepted DashScope polling error %s into a stable failed request', async (code) => {
    const result = await pollAsrTranscription(
      {} as never,
      'user-1',
      'asr-request-1',
      { adapter: adapter(new DashScopeAsrError(code, true)) },
    )

    expect(result).toMatchObject({
      requestId: 'asr-request-1',
      status: 'failed',
      failureCode: code,
    })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', code)
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })

  it('fails without refunding when task acceptance is followed by dispatch-state persistence conflict', async () => {
    const persistenceConflict = new Error('dispatch state conflict')
    storeMocks.markAsrDispatching.mockRejectedValueOnce(persistenceConflict)

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { adapter: adapter({ status: 'pending' }) },
    )

    expect(result).toMatchObject({
      requestId: 'asr-request-1',
      status: 'failed',
      failureCode: 'ASR_DISPATCH_STATE_UNCERTAIN',
    })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_DISPATCH_STATE_UNCERTAIN')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })
})

describe('ASR pre-acceptance rollback', () => {
  it('releases the request without refunding when the credit debit is rejected before reservation', async () => {
    const debitRejected = new Error('credit debit rejected')
    const providerAdapter = adapter({ status: 'pending' })
    creditsMocks.consumeCredits.mockRejectedValueOnce(debitRejected)

    await expect(startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { adapter: providerAdapter },
    )).rejects.toBe(debitRejected)

    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_REQUEST_FAILED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith({}, expect.objectContaining({
      status: 'released',
      failureCode: 'ASR_REQUEST_FAILED',
    }))
    expect(providerAdapter.submit).not.toHaveBeenCalled()
  })

  it('compensates exactly once when reserving the request fails after a successful debit', async () => {
    const reservationFailed = new Error('reserve state persistence failed')
    const providerAdapter = adapter({ status: 'pending' })
    storeMocks.markAsrReserved.mockRejectedValueOnce(reservationFailed)

    await expect(startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { adapter: providerAdapter },
    )).rejects.toBe(reservationFailed)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith({}, 'user-1', 10, 'asr-reservation-release', expect.objectContaining({
      requestId: 'asr-request-1',
      failureCode: 'ASR_REQUEST_FAILED',
    }), { idempotencyKey: 'asr-release:asr-request-1:0' })
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_REQUEST_FAILED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith({}, expect.objectContaining({
      status: 'released',
      failureCode: 'ASR_REQUEST_FAILED',
    }))
    expect(providerAdapter.submit).not.toHaveBeenCalled()
  })

  it('releases the entire reservation when DashScope rejects submission before task acceptance', async () => {
    const providerRejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)
    const providerAdapter = adapter({ status: 'pending' })
    vi.mocked(providerAdapter.submit).mockRejectedValueOnce(providerRejected)

    await expect(startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { adapter: providerAdapter },
    )).rejects.toBe(providerRejected)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith({}, 'user-1', 10, 'asr-reservation-release', expect.objectContaining({
      requestId: 'asr-request-1',
      failureCode: 'ASR_PROVIDER_REJECTED',
    }), { idempotencyKey: 'asr-release:asr-request-1:0' })
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_REJECTED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith({}, expect.objectContaining({
      status: 'released',
      failureCode: 'ASR_PROVIDER_REJECTED',
    }))
  })
})

describe('ASR settlement accounting', () => {
  it('settles the larger of transcript units and billed seconds and returns the unused hold', async () => {
    const result = await pollAsrTranscription(
      {} as never,
      'user-1',
      'asr-request-1',
      { adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }) },
    )

    // Nine transcript units beat the four credits a single billed second would charge;
    // the ten-credit hold covered them, so exactly one credit goes back.
    expect(storeMocks.markAsrSettled).toHaveBeenCalledWith({}, 'asr-request-1', 9, 1, expect.any(Number))
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      1,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:9' },
    )
    expect(result).toMatchObject({ status: 'settled', creditsCharged: 9, billedSeconds: 1 })
  })

  it('fails a transcription whose transcript costs more than the hold instead of over-charging', async () => {
    const result = await pollAsrTranscription(
      {} as never,
      'user-1',
      'asr-request-1',
      { adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九十一二三四五六七八九十', billedSeconds: 0.1 }) },
    )

    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_RESERVATION_EXCEEDED')
    expect(storeMocks.markAsrSettled).not.toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'failed', failureCode: 'ASR_RESERVATION_EXCEEDED' })
  })
})
