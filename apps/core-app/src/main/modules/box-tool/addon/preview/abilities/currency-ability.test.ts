import { afterEach, describe, expect, it, vi } from 'vitest'

const fxRateProviderMock = vi.hoisted(() => ({
  normalizeCurrency: vi.fn((input: string) => {
    const normalized = input.trim().toUpperCase()
    const aliases: Record<string, string> = {
      美元: 'USD',
      人民币: 'CNY',
      欧元: 'EUR'
    }
    return (aliases[input.trim()] ?? normalized) as string | null
  }),
  convert: vi.fn(),
  getStatus: vi.fn(() => ({
    lastRefresh: Date.parse('2026-05-09T00:00:00.000Z'),
    source: 'default',
    isStale: false,
    currencyCount: 3
  })),
  applyExternalRates: vi.fn()
}))

const sceneMocks = vi.hoisted(() => ({
  runNexusScene: vi.fn(),
  extractFxConvertFromSceneRun: vi.fn(),
  extractFxRateSnapshotFromSceneRun: vi.fn()
}))

vi.mock('../providers', () => ({
  fxRateProvider: fxRateProviderMock
}))

vi.mock('../../../../nexus/scene-client', () => sceneMocks)

import { CurrencyPreviewAbility } from './currency-ability'

function context(text: string) {
  return {
    query: {
      text,
      inputs: []
    },
    signal: new AbortController().signal
  }
}

describe('CurrencyPreviewAbility', () => {
  afterEach(() => {
    vi.clearAllMocks()
    fxRateProviderMock.getStatus.mockReturnValue({
      lastRefresh: Date.parse('2026-05-09T00:00:00.000Z'),
      source: 'default',
      isStale: false,
      currencyCount: 3
    })
  })

  it('uses corebox.fx.convert scene for USD conversion', async () => {
    fxRateProviderMock.normalizeCurrency
      .mockImplementationOnce(() => 'USD')
      .mockReturnValueOnce(null)
    sceneMocks.runNexusScene.mockResolvedValueOnce({ status: 'completed' })
    sceneMocks.extractFxConvertFromSceneRun.mockReturnValueOnce({
      base: 'USD',
      target: 'NOK',
      amount: 10,
      rate: 10.5,
      converted: 105,
      source: 'live',
      updatedAt: '2026-05-10T00:00:00.000Z'
    })
    fxRateProviderMock.convert.mockReturnValueOnce({
      result: 10,
      rate: {
        base: 'USD',
        quote: 'USD',
        rate: 1,
        updatedAt: Date.parse('2026-05-09T00:00:00.000Z'),
        source: 'default'
      },
      formatted: '10.00 USD'
    })

    const result = await new CurrencyPreviewAbility().execute(context('10 USD to NOK'))

    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.fx.convert', {
      input: {
        base: 'USD',
        target: 'NOK',
        amount: 10
      },
      capability: 'fx.convert',
      timeoutMs: 2500
    })
    expect(result?.payload.primaryValue).toBe('105.0000')
    expect(result?.payload.subtitle).toContain('Nexus')
    expect(result?.payload.chips).toContainEqual({ label: '数据源', value: 'NEXUS' })
  })

  it('falls back to local FxRateProvider when scene conversion is unavailable', async () => {
    sceneMocks.runNexusScene.mockResolvedValueOnce(null)
    sceneMocks.extractFxConvertFromSceneRun.mockReturnValueOnce(null)
    fxRateProviderMock.convert
      .mockReturnValueOnce({
        result: 72.5,
        rate: {
          base: 'USD',
          quote: 'CNY',
          rate: 7.25,
          updatedAt: Date.parse('2026-05-09T00:00:00.000Z'),
          source: 'default'
        },
        formatted: '72.50 CNY'
      })
      .mockReturnValueOnce({
        result: 10,
        rate: {
          base: 'USD',
          quote: 'USD',
          rate: 1,
          updatedAt: Date.parse('2026-05-09T00:00:00.000Z'),
          source: 'default'
        },
        formatted: '10.00 USD'
      })

    const result = await new CurrencyPreviewAbility().execute(context('10 USD to CNY'))

    expect(result?.payload.primaryValue).toBe('72.5000')
    expect(result?.payload.chips).toContainEqual({ label: '数据源', value: 'DEFAULT' })
  })

  it('hydrates local rates from corebox.fx.latest scene for cross conversion', async () => {
    sceneMocks.runNexusScene.mockResolvedValueOnce({ status: 'completed' })
    sceneMocks.extractFxRateSnapshotFromSceneRun.mockReturnValueOnce({
      base: 'USD',
      rates: {
        USD: 1,
        EUR: 0.9,
        CNY: 7.2
      },
      source: 'live',
      asOf: '2026-05-10T00:00:00.000Z'
    })
    fxRateProviderMock.getStatus.mockReturnValueOnce({
      lastRefresh: Date.parse('2026-05-10T00:00:00.000Z'),
      source: 'nexus',
      isStale: false,
      currencyCount: 3
    })
    fxRateProviderMock.convert
      .mockReturnValueOnce({
        result: 80,
        rate: {
          base: 'EUR',
          quote: 'CNY',
          rate: 8,
          updatedAt: Date.parse('2026-05-10T00:00:00.000Z'),
          source: 'nexus'
        },
        formatted: '80.00 CNY'
      })
      .mockReturnValueOnce({
        result: 11.1111,
        rate: {
          base: 'EUR',
          quote: 'USD',
          rate: 1.11111,
          updatedAt: Date.parse('2026-05-10T00:00:00.000Z'),
          source: 'nexus'
        },
        formatted: '11.11 USD'
      })

    const result = await new CurrencyPreviewAbility().execute(context('10 EUR to CNY'))

    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.fx.latest', {
      capability: 'fx.rate.latest',
      timeoutMs: 2500
    })
    expect(fxRateProviderMock.applyExternalRates).toHaveBeenCalledWith({
      base: 'USD',
      rates: {
        USD: 1,
        EUR: 0.9,
        CNY: 7.2
      },
      fetchedAt: Date.parse('2026-05-10T00:00:00.000Z'),
      providerUpdatedAt: Date.parse('2026-05-10T00:00:00.000Z'),
      source: 'nexus'
    })
    expect(result?.payload.primaryValue).toBe('80.0000')
    expect(result?.payload.subtitle).toContain('Nexus')
  })
})
