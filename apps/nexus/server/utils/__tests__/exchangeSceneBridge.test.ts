import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const creditMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
}))

const serviceMocks = vi.hoisted(() => ({
  getUsdRates: vi.fn(),
  convertUsd: vi.fn(),
}))

const sceneMocks = vi.hoisted(() => ({
  runSceneOrchestrator: vi.fn(),
}))

vi.mock('../../utils/auth', () => authMocks)
vi.mock('../../utils/creditsStore', () => creditMocks)
vi.mock('../../utils/exchangeRateService', () => serviceMocks)
vi.mock('../../utils/sceneOrchestrator', () => sceneMocks)

let latestHandler: (event: any) => Promise<any>
let convertHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  latestHandler = (await import('../../api/exchange/latest.get')).default as (event: any) => Promise<any>
  convertHandler = (await import('../../api/exchange/convert.get')).default as (event: any) => Promise<any>
})

describe('/api/exchange Scene bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1' })
    creditMocks.consumeCredits.mockResolvedValue(undefined)
  })

  it('latest 优先使用 corebox.fx.latest Scene 输出并保持响应外形', async () => {
    sceneMocks.runSceneOrchestrator.mockResolvedValueOnce({
      runId: 'scene_run_fx_latest',
      status: 'completed',
      output: {
        base: 'USD',
        asOf: '2026-05-10T00:00:00.000Z',
        providerUpdatedAt: '2026-05-10T00:00:00.000Z',
        fetchedAt: '2026-05-10T00:01:00.000Z',
        providerNextUpdateAt: '2026-05-11T00:00:00.000Z',
        source: 'live',
        rates: { USD: 1, CNY: 7.1 },
      },
    })

    const result = await latestHandler({ context: {} })

    expect(sceneMocks.runSceneOrchestrator).toHaveBeenCalledWith(expect.anything(), 'corebox.fx.latest', {
      capability: 'fx.rate.latest',
    })
    expect(serviceMocks.getUsdRates).not.toHaveBeenCalled()
    expect(creditMocks.consumeCredits).toHaveBeenCalledWith(expect.anything(), 'u1', 1, 'exchange-latest', {
      base: 'USD',
    })
    expect(result).toEqual({
      base: 'USD',
      asOf: '2026-05-10T00:00:00.000Z',
      providerUpdatedAt: '2026-05-10T00:00:00.000Z',
      fetchedAt: '2026-05-10T00:01:00.000Z',
      providerNextUpdateAt: '2026-05-11T00:00:00.000Z',
      source: 'live',
      rates: { USD: 1, CNY: 7.1 },
      sceneRunId: 'scene_run_fx_latest',
      degradedReason: undefined,
    })
  })

  it('latest 在 Scene 不可用时 fallback 到 exchangeRateService', async () => {
    sceneMocks.runSceneOrchestrator.mockRejectedValueOnce({
      data: { code: 'SCENE_NOT_FOUND' },
    })
    serviceMocks.getUsdRates.mockResolvedValueOnce({
      source: 'cache',
      snapshot: {
        baseCurrency: 'USD',
        providerUpdatedAt: Date.parse('2026-05-09T00:00:00.000Z'),
        fetchedAt: Date.parse('2026-05-10T00:01:00.000Z'),
        providerNextUpdateAt: null,
        rates: { USD: 1, CNY: 7.2 },
      },
    })

    const result = await latestHandler({ context: {} })

    expect(result).toMatchObject({
      base: 'USD',
      source: 'cache',
      rates: { USD: 1, CNY: 7.2 },
      degradedReason: 'SCENE_NOT_FOUND',
    })
    expect(result.sceneRunId).toBeUndefined()
  })

  it('convert 优先使用 corebox.fx.convert Scene 输出并保持响应外形', async () => {
    sceneMocks.runSceneOrchestrator.mockResolvedValueOnce({
      runId: 'scene_run_fx_convert',
      status: 'completed',
      output: {
        base: 'USD',
        target: 'CNY',
        amount: 10,
        rate: 7.1,
        converted: 71,
        source: 'live',
        updatedAt: '2026-05-10T00:00:00.000Z',
        providerUpdatedAt: '2026-05-10T00:00:00.000Z',
        fetchedAt: '2026-05-10T00:01:00.000Z',
        providerNextUpdateAt: null,
      },
    })

    const result = await convertHandler({
      path: '/api/exchange/convert?target=CNY&amount=10',
      node: { req: { url: '/api/exchange/convert?target=CNY&amount=10' } },
      context: {},
    })

    expect(sceneMocks.runSceneOrchestrator).toHaveBeenCalledWith(expect.anything(), 'corebox.fx.convert', {
      input: {
        base: 'USD',
        target: 'CNY',
        amount: 10,
      },
      capability: 'fx.convert',
    })
    expect(serviceMocks.convertUsd).not.toHaveBeenCalled()
    expect(creditMocks.consumeCredits).toHaveBeenCalledWith(expect.anything(), 'u1', 0.1, 'exchange-convert', {
      base: 'USD',
      target: 'CNY',
      amount: 10,
    })
    expect(result).toEqual({
      base: 'USD',
      target: 'CNY',
      amount: 10,
      rate: 7.1,
      converted: 71,
      source: 'live',
      updatedAt: '2026-05-10T00:00:00.000Z',
      providerUpdatedAt: '2026-05-10T00:00:00.000Z',
      fetchedAt: '2026-05-10T00:01:00.000Z',
      providerNextUpdateAt: null,
      sceneRunId: 'scene_run_fx_convert',
      degradedReason: undefined,
    })
  })

  it('convert 在 Scene 输出无效时 fallback 到 exchangeRateService', async () => {
    sceneMocks.runSceneOrchestrator.mockResolvedValueOnce({
      runId: 'scene_run_invalid',
      status: 'completed',
      output: { invalid: true },
    })
    serviceMocks.convertUsd.mockResolvedValueOnce({
      rate: 7.2,
      converted: 72,
      source: 'cache',
      updatedAt: '2026-05-09T00:00:00.000Z',
      providerUpdatedAt: '2026-05-09T00:00:00.000Z',
      fetchedAt: '2026-05-10T00:01:00.000Z',
      providerNextUpdateAt: null,
    })

    const result = await convertHandler({
      path: '/api/exchange/convert?target=CNY&amount=10',
      node: { req: { url: '/api/exchange/convert?target=CNY&amount=10' } },
      context: {},
    })

    expect(result).toMatchObject({
      base: 'USD',
      target: 'CNY',
      amount: 10,
      rate: 7.2,
      converted: 72,
      source: 'cache',
      degradedReason: 'scene_invalid_output',
    })
    expect(result.sceneRunId).toBeUndefined()
  })
})
