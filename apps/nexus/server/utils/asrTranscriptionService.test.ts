import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pollAsrTranscription, startAsrTranscription } from './asrTranscriptionService'
import { DEFAULT_CREDIT_PRICING, selectCreditPricingRule } from './creditPricingStore'
import {
  DashScopeAsrError,
  QWEN_AUDIO_ASR_MAX_DURATION_SECONDS,
  type DashScopeFiletransAdapter,
  type DashScopeFiletransTask,
  type DashScopeQwenAudioAsrAdapter,
} from './dashscopeAsrProvider'
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
  deleteAsrResultObject: vi.fn(),
  getAsrRequest: vi.fn(),
  getAsrResultObject: vi.fn(),
  markAsrDispatching: vi.fn(),
  markAsrFailed: vi.fn(),
  markAsrReleased: vi.fn(),
  markAsrReserved: vi.fn(),
  markAsrSettled: vi.fn(),
  markAsrSettledFromReserved: vi.fn(),
  putAsrResultObject: vi.fn(),
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
vi.mock('./creditPricingStore', async importOriginal => {
  const actual = await importOriginal<typeof CreditPricingStoreModule>()
  return {
    ...actual,
    resolveCreditPricingRule: pricingMocks.resolveCreditPricingRule,
    // Admission charges through the sellable lookup; "the row is disabled" is refused by
    // the store itself, so here it resolves to the same stubbed rule.
    resolveSellableCreditPricingRule: pricingMocks.resolveCreditPricingRule,
  }
})
vi.mock('./asrTranscriptionStore', async importOriginal => {
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
  capabilities: [
    {
      id: 'audio-transcribe',
      providerId: 'dashscope-provider',
      capability: 'audio.transcribe',
      schemaRef: null,
      metering: null,
      constraints: null,
      metadata: null,
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    },
  ],
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
    // Every admitted request carries the price it was quoted, so the fixture does too.
    pricing: selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING),
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

function adapter(task: DashScopeFiletransTask | Error): DashScopeFiletransAdapter {
  return {
    submit: vi.fn(async () => ({ taskId: 'task-1' })),
    getTask: vi.fn(async () => {
      if (task instanceof Error) throw task
      return task
    }),
  } as unknown as DashScopeFiletransAdapter
}

const QWEN_METADATA = {
  adapter: 'dashscope-qwen-audio-asr',
  transport: 'qwen-audio-sync',
  defaultModel: 'qwen-audio-3.0-asr-flash',
  models: ['qwen-audio-3.0-asr-flash'],
}

function qwenProvider(metadata: Record<string, unknown> | null = QWEN_METADATA): ProviderRegistryRecord {
  return { ...provider, metadata }
}

function qwenAdapter(
  result: { transcript: string; billedSeconds: number; requestId?: string } | Error,
): DashScopeQwenAudioAsrAdapter {
  return {
    transcribe: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    }),
  } as unknown as DashScopeQwenAudioAsrAdapter
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
  storeMocks.markAsrReleased.mockImplementation(async (_event, requestId: string, failureCode: string) =>
    request({
      id: requestId,
      status: 'released',
      failureCode,
    }),
  )
  storeMocks.markAsrFailed.mockImplementation(async (_event, requestId: string, failureCode: string) =>
    request({
      id: requestId,
      status: 'failed',
      failureCode,
    }),
  )
  storeMocks.markAsrSettled.mockImplementation(
    async (_event, requestId: string, chargedCredits: number, billedSeconds: number) =>
      request({
        id: requestId,
        status: 'settled',
        chargedCredits,
        billedSeconds,
      }),
  )
  storeMocks.markAsrSettledFromReserved.mockImplementation(
    async (_event, requestId: string, chargedCredits: number, billedSeconds: number) =>
      request({
        id: requestId,
        status: 'settled',
        providerTaskId: null,
        chargedCredits,
        billedSeconds,
      }),
  )
  // The store deletes resolve to promises; the service chains `.catch` on them.
  storeMocks.deleteAsrHandoffObject.mockResolvedValue(undefined)
  storeMocks.deleteAsrResultObject.mockResolvedValue(undefined)
  storeMocks.putAsrResultObject.mockResolvedValue(undefined)
  storeMocks.getAsrResultObject.mockResolvedValue(null)
  storeMocks.parseWavDurationSeconds.mockReturnValue(1)
  storeMocks.getAsrRequest.mockResolvedValue(request())
})

describe('ASR terminal accounting', () => {
  it('marks an accepted provider task failure as failed without releasing its reservation', async () => {
    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'failed' }),
    })

    expect(result).toMatchObject({
      requestId: 'asr-request-1',
      status: 'failed',
      failureCode: 'ASR_PROVIDER_FAILED',
    })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_FAILED')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })

  it.each(['ASR_PROVIDER_UNAVAILABLE', 'ASR_PROVIDER_RESPONSE_INVALID'] as const)(
    'turns accepted DashScope polling error %s into a stable failed request',
    async code => {
      const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
        adapter: adapter(new DashScopeAsrError(code, true)),
      })

      expect(result).toMatchObject({
        requestId: 'asr-request-1',
        status: 'failed',
        failureCode: code,
      })
      expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', code)
      expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
      expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
    },
  )

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

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { adapter: providerAdapter },
      ),
    ).rejects.toBe(debitRejected)

    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_REQUEST_FAILED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        status: 'released',
        failureCode: 'ASR_REQUEST_FAILED',
      }),
    )
    expect(providerAdapter.submit).not.toHaveBeenCalled()
  })

  it('compensates exactly once when reserving the request fails after a successful debit', async () => {
    const reservationFailed = new Error('reserve state persistence failed')
    const providerAdapter = adapter({ status: 'pending' })
    storeMocks.markAsrReserved.mockRejectedValueOnce(reservationFailed)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { adapter: providerAdapter },
      ),
    ).rejects.toBe(reservationFailed)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({
        requestId: 'asr-request-1',
        failureCode: 'ASR_REQUEST_FAILED',
      }),
      { idempotencyKey: 'asr-release:asr-request-1:0' },
    )
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_REQUEST_FAILED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        status: 'released',
        failureCode: 'ASR_REQUEST_FAILED',
      }),
    )
    expect(providerAdapter.submit).not.toHaveBeenCalled()
  })

  it('releases the entire reservation when DashScope rejects submission before task acceptance', async () => {
    const providerRejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)
    const providerAdapter = adapter({ status: 'pending' })
    vi.mocked(providerAdapter.submit).mockRejectedValueOnce(providerRejected)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { adapter: providerAdapter },
      ),
    ).rejects.toBe(providerRejected)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({
        requestId: 'asr-request-1',
        failureCode: 'ASR_PROVIDER_REJECTED',
      }),
      { idempotencyKey: 'asr-release:asr-request-1:0' },
    )
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_REJECTED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        status: 'released',
        failureCode: 'ASR_PROVIDER_REJECTED',
      }),
    )
  })
})

describe('ASR settlement accounting', () => {
  it('settles the larger of transcript units and billed seconds and returns the unused hold', async () => {
    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }),
    })

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
    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({
        status: 'succeeded',
        transcript: '一二三四五六七八九十一二三四五六七八九十',
        billedSeconds: 0.1,
      }),
    })

    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_RESERVATION_EXCEEDED')
    expect(storeMocks.markAsrSettled).not.toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'failed', failureCode: 'ASR_RESERVATION_EXCEEDED' })
  })

  it('settles at the price the request was admitted under, not a price changed mid-flight', async () => {
    const admitted = selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING)
    // The operator raises the price while the provider is still transcribing. Re-pricing
    // finished work would fail the request as ASR_RESERVATION_EXCEEDED; the hold is a
    // quote, so the settlement has to read the price it was quoted.
    pricingMocks.resolveCreditPricingRule.mockResolvedValue({ ...admitted, creditsPerUnit: 400 })
    storeMocks.getAsrRequest.mockResolvedValue(request({ pricing: admitted }))

    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }),
    })

    // Nine transcript units at the admitted price; one billed second at the new price
    // would have cost 400 and overrun the hold.
    expect(storeMocks.markAsrSettled).toHaveBeenCalledWith({}, 'asr-request-1', 9, 1, expect.any(Number))
    expect(result).toMatchObject({ status: 'settled', creditsCharged: 9 })
  })

  it('falls back to the live price list only for a request admitted before the quote was stored', async () => {
    // Legacy in-flight requests carry no snapshot; they settle at the current price
    // rather than failing the transcription outright.
    storeMocks.getAsrRequest.mockResolvedValue(request({ pricing: null }))

    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }),
    })

    expect(result).toMatchObject({ status: 'settled', creditsCharged: 9 })
  })
})

describe('ASR Qwen Audio Flash synchronous path', () => {
  it('reserves before dispatch, settles from reserved, and exposes the transcript with its private recovery object', async () => {
    const order: string[] = []
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    creditsMocks.consumeCredits.mockImplementationOnce(async () => {
      order.push('reserve')
    })
    storeMocks.markAsrReserved.mockImplementationOnce(async () => {
      order.push('reserved')
      return request({ status: 'reserved', providerTaskId: null })
    })
    const qwen = qwenAdapter({ transcript: 'alpha beta', billedSeconds: 2 })
    vi.mocked(qwen.transcribe).mockImplementationOnce(async () => {
      order.push('dispatch')
      return { transcript: 'alpha beta', billedSeconds: 2 }
    })

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(order).toEqual(['reserve', 'reserved', 'dispatch'])
    // Two audio seconds at four credits each beat the four transcript units.
    expect(storeMocks.markAsrSettledFromReserved).toHaveBeenCalledWith({}, 'asr-request-1', 8, 2, expect.any(Number))
    expect(storeMocks.putAsrResultObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'asr-request-1', status: 'reserved' }),
      { transcript: 'alpha beta', billedSeconds: 2 },
    )
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      2,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:8' },
    )
    expect(storeMocks.markAsrDispatching).not.toHaveBeenCalled()
    expect(result).toEqual({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 8,
      billedSeconds: 2,
      failureCode: null,
      transcript: 'alpha beta',
    })
  })

  it('answers a same-key replay from the private result object without dispatching or reserving again', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.createAsrRequest.mockResolvedValue({
      created: false,
      request: request({ status: 'settled', providerTaskId: null, chargedCredits: 8, billedSeconds: 2 }),
    })
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'alpha beta', billedSeconds: 2 })
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(result).toEqual({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 8,
      billedSeconds: 2,
      failureCode: null,
      transcript: 'alpha beta',
    })
    expect(qwen.transcribe).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReserved).not.toHaveBeenCalled()
  })

  it('serves a settled synchronous transcript from the private result object without polling the provider', async () => {
    storeMocks.getAsrRequest.mockResolvedValue(
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        billedSeconds: 2,
      }),
    )
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'alpha beta', billedSeconds: 2 })
    const filetrans = adapter({ status: 'pending' })

    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', { adapter: filetrans })

    expect(result).toEqual({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 8,
      billedSeconds: 2,
      failureCode: null,
      transcript: 'alpha beta',
    })
    expect(filetrans.getTask).not.toHaveBeenCalled()
  })

  it('fails closed when a settled synchronous result object is no longer recoverable', async () => {
    storeMocks.getAsrRequest.mockResolvedValue(request({ status: 'settled', providerTaskId: null }))
    storeMocks.getAsrResultObject.mockResolvedValue(null)

    await expect(pollAsrTranscription({} as never, 'user-1', 'asr-request-1')).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_RESULT_UNAVAILABLE' },
    })
  })

  it.each([
    { name: 'no recognisable transport', metadata: { source: 'provider-registry' } },
    {
      name: 'two candidate models without an explicit adapter',
      metadata: { models: ['qwen-audio-3.0-asr-flash', 'qwen-audio-3.0-asr-flash-filetrans'] },
    },
    {
      name: 'a default model that disagrees with the selected transport',
      metadata: { transport: 'qwen-audio-sync', defaultModel: 'qwen-audio-3.0-asr-flash-filetrans' },
    },
  ])('refuses to admit audio when registry metadata has $name', async ({ metadata }) => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider(metadata)])
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_PROVIDER_CONFIGURATION_INVALID' },
    })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('refuses a clip longer than the synchronous cap before creating a request or holding credits', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.parseWavDurationSeconds.mockReturnValue(QWEN_AUDIO_ASR_MAX_DURATION_SECONDS + 0.1)
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { errorCode: 'ASR_AUDIO_DURATION_UNSUPPORTED' },
    })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('admits a clip exactly at the synchronous cap', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.parseWavDurationSeconds.mockReturnValue(QWEN_AUDIO_ASR_MAX_DURATION_SECONDS)

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwenAdapter({ transcript: 'ok', billedSeconds: 1 }) },
    )

    expect(storeMocks.createAsrRequest).toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'settled', transcript: 'ok' })
  })

  it('refuses audio past the admission size limit before creating a request or holding credits', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        {
          audio: Buffer.alloc(storeMocks.ASR_AUDIO_MAX_BYTES + 1),
          contentType: 'audio/wav',
          idempotencyKey: 'idempotency-key',
        },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { errorCode: 'ASR_AUDIO_INVALID' },
    })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('releases the reservation when the provider rejects the synchronous request before acceptance', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const rejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwenAdapter(rejected) },
      ),
    ).rejects.toBe(rejected)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1', failureCode: 'ASR_PROVIDER_REJECTED' }),
      { idempotencyKey: 'asr-release:asr-request-1:0' },
    )
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_REJECTED')
    expect(storeMocks.putAsrResultObject).not.toHaveBeenCalled()
    expect(storeMocks.markAsrSettledFromReserved).not.toHaveBeenCalled()
  })

  it('terminally fails an uncertain synchronous transport outcome without refunding or replaying', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const uncertain = new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwenAdapter(uncertain) },
    )

    // DashScope may have accepted and charged the request, so the hold is retained and
    // the request is failed terminally instead of refunded or silently retried.
    expect(result).toMatchObject({ status: 'failed', failureCode: 'ASR_DISPATCH_STATE_UNCERTAIN' })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_DISPATCH_STATE_UNCERTAIN')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
    expect(storeMocks.putAsrResultObject).not.toHaveBeenCalled()
  })
})
