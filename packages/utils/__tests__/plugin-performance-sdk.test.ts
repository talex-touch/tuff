import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  usePluginName: vi.fn(() => 'demo-plugin'),
}))

import { createPerformanceSDK } from '../plugin/sdk/performance'

describe('Plugin Performance SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
  })

  it('maps performance operations to typed plugin events', async () => {
    const sdk = createPerformanceSDK({ send: vi.fn() } as any)

    await sdk.getStorageStats()
    await sdk.getMetrics()
    await sdk.getPaths()

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.storage.getStats,
      { pluginName: 'demo-plugin' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.performance.getMetrics,
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.performance.getPaths,
    )
  })

  it('preserves wrapped data response compatibility', async () => {
    mocks.send
      .mockResolvedValueOnce({
        data: {
          totalSize: 128,
          fileCount: 2,
          dirCount: 1,
          maxSize: 1024,
          usagePercent: 12.5,
        },
      })
      .mockResolvedValueOnce({
        data: {
          loadTime: 42,
          memoryUsage: 2048,
          cpuUsage: 1.5,
          lastActiveTime: 123,
        },
      })
      .mockResolvedValueOnce({
        data: {
          pluginPath: '/plugin',
          dataPath: '/data',
          configPath: '/config',
          logsPath: '/logs',
          tempPath: '/temp',
        },
      })

    const sdk = createPerformanceSDK({ send: vi.fn() } as any)

    await expect(sdk.getAll()).resolves.toEqual({
      storage: {
        totalSize: 128,
        fileCount: 2,
        dirCount: 1,
        maxSize: 1024,
        usagePercent: 12.5,
      },
      metrics: {
        loadTime: 42,
        memoryUsage: 2048,
        cpuUsage: 1.5,
        lastActiveTime: 123,
      },
      paths: {
        pluginPath: '/plugin',
        dataPath: '/data',
        configPath: '/config',
        logsPath: '/logs',
        tempPath: '/temp',
      },
    })
  })
})
