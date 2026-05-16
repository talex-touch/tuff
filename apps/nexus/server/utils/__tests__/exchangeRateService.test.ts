import { describe, expect, it, vi } from 'vitest'
import { convertUsd, getUsdRates } from '../exchangeRateService'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    exchangeRate: {
      apiKey: 'test-key',
      baseUrl: 'https://v6.exchangerate-api.com/v6',
      ttlMs: 60_000,
      timeoutMs: 10_000,
    },
  }),
}))

const getLatestSnapshot = vi.fn()
const saveSnapshotWithRates = vi.fn()
const cleanupHistory = vi.fn()
const listRateHistory = vi.fn()
const listSnapshotHistory = vi.fn()

vi.mock('../exchangeRateStore', () => ({
  getLatestSnapshot: (...args: unknown[]) => getLatestSnapshot(...args),
  saveSnapshotWithRates: (...args: unknown[]) => saveSnapshotWithRates(...args),
  cleanupHistory: (...args: unknown[]) => cleanupHistory(...args),
  listRateHistory: (...args: unknown[]) => listRateHistory(...args),
  listSnapshotHistory: (...args: unknown[]) => listSnapshotHistory(...args),
}))

const recordTelemetryMessages = vi.fn()
const networkRequest = vi.fn()

vi.mock('../messageStore', () => ({
  recordTelemetryMessages: (...args: unknown[]) => recordTelemetryMessages(...args),
}))

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: (...args: unknown[]) => networkRequest(...args),
  },
}))

function buildSnapshot(overrides: Partial<import('../exchangeRateStore').ExchangeRateSnapshot> = {}) {
  return {
    id: 'snap-1',
    baseCurrency: 'USD',
    fetchedAt: Date.now(),
    providerUpdatedAt: Date.now() - 1000,
    providerNextUpdateAt: Date.now() + 1000,
    payload: { result: 'success' },
    rates: { USD: 1, CNY: 7.1 },
    ...overrides,
  }
}

describe('exchangeRateService', () => {
  it('缓存未过期时直接返回缓存', async () => {
    const snapshot = buildSnapshot({ fetchedAt: Date.now() - 1000 })
    getLatestSnapshot.mockResolvedValueOnce(snapshot)

    networkRequest.mockClear()

    const result = await getUsdRates({} as any)
    expect(result.source).toBe('cache')
    expect(result.snapshot).toEqual(snapshot)
    expect(networkRequest).not.toHaveBeenCalled()
  })

  it('缓存过期会触发回源并写入', async () => {
    const snapshot = buildSnapshot({ fetchedAt: Date.now() - 120_000 })
    getLatestSnapshot.mockResolvedValueOnce(snapshot)

    networkRequest.mockResolvedValue({
      status: 200,
      data: {
        result: 'success',
        time_last_update_unix: 1700000000,
        time_next_update_unix: 1700003600,
        base_code: 'USD',
        conversion_rates: { USD: 1, CNY: 7.2 },
      },
    })

    const result = await getUsdRates({} as any)
    expect(result.source).toBe('live')
    expect(saveSnapshotWithRates).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      baseCurrency: 'USD',
    }), expect.objectContaining({
      storeRateRows: true,
    }))
  })

  it('上游失败时无缓存会抛错', async () => {
    getLatestSnapshot.mockResolvedValueOnce(null)

    networkRequest.mockResolvedValue({
      status: 200,
      data: {
        result: 'error',
        'error-type': 'quota-reached',
      },
    })

    await expect(getUsdRates({} as any)).rejects.toMatchObject({ statusCode: 429 })
    expect(recordTelemetryMessages).toHaveBeenCalled()
  })

  it('convertUsd 会返回换算结果', async () => {
    const snapshot = buildSnapshot({ fetchedAt: Date.now() - 1000 })
    getLatestSnapshot.mockResolvedValueOnce(snapshot)

    const result = await convertUsd({} as any, { target: 'CNY', amount: 10 })
    expect(result.rate).toBe(7.1)
    expect(result.converted).toBeCloseTo(71)
    expect(result.providerUpdatedAt).toBeTruthy()
    expect(result.fetchedAt).toBeTruthy()
  })
})
