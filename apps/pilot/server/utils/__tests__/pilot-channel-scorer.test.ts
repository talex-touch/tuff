import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeChannelModelStats } from '../pilot-channel-scorer'
import { buildRouteKey } from '../pilot-route-health'
import { listPilotRoutingMetrics } from '../pilot-routing-metrics'

vi.mock('../pilot-routing-metrics', () => ({
  listPilotRoutingMetrics: vi.fn(),
}))

describe('pilot-channel-scorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('prefers routes with better success and latency', async () => {
    vi.mocked(listPilotRoutingMetrics).mockResolvedValue([
      {
        id: 4,
        requestId: 'req-4',
        sessionId: 's1',
        userId: 'u1',
        modelId: 'quota-auto',
        routeComboId: 'default-auto',
        channelId: 'fast',
        providerModel: 'gpt-5.4',
        queueWaitMs: 10,
        ttftMs: 500,
        totalDurationMs: 1200,
        outputChars: 320,
        outputTokens: 80,
        success: true,
        errorCode: '',
        finishReason: 'completed',
        createdAt: new Date().toISOString(),
      },
      {
        id: 3,
        requestId: 'req-3',
        sessionId: 's1',
        userId: 'u1',
        modelId: 'quota-auto',
        routeComboId: 'default-auto',
        channelId: 'fast',
        providerModel: 'gpt-5.4',
        queueWaitMs: 20,
        ttftMs: 700,
        totalDurationMs: 1600,
        outputChars: 400,
        outputTokens: 100,
        success: true,
        errorCode: '',
        finishReason: 'completed',
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        requestId: 'req-2',
        sessionId: 's1',
        userId: 'u1',
        modelId: 'quota-auto',
        routeComboId: 'default-auto',
        channelId: 'slow',
        providerModel: 'gpt-5.4',
        queueWaitMs: 300,
        ttftMs: 8_500,
        totalDurationMs: 25_000,
        outputChars: 320,
        outputTokens: 80,
        success: false,
        errorCode: 'UPSTREAM_TIMEOUT',
        finishReason: 'error',
        createdAt: new Date().toISOString(),
      },
      {
        id: 1,
        requestId: 'req-1',
        sessionId: 's1',
        userId: 'u1',
        modelId: 'quota-auto',
        routeComboId: 'default-auto',
        channelId: 'slow',
        providerModel: 'gpt-5.4',
        queueWaitMs: 320,
        ttftMs: 9_200,
        totalDurationMs: 28_000,
        outputChars: 280,
        outputTokens: 70,
        success: false,
        errorCode: 'UPSTREAM_TIMEOUT',
        finishReason: 'error',
        createdAt: new Date().toISOString(),
      },
    ] as any)

    const stats = await computeChannelModelStats({} as any, [
      { channelId: 'fast', providerModel: 'gpt-5.4' },
      { channelId: 'slow', providerModel: 'gpt-5.4' },
    ], {
      metricWindowHours: 24,
      recentRequestWindow: 200,
    })

    const fast = stats.get(buildRouteKey('fast', 'gpt-5.4'))
    const slow = stats.get(buildRouteKey('slow', 'gpt-5.4'))
    expect(fast).toBeDefined()
    expect(slow).toBeDefined()
    expect((fast?.score || 0)).toBeGreaterThan(slow?.score || 0)
    expect(fast?.successRate).toBe(1)
    expect(slow?.successRate).toBe(0)
  })
})
