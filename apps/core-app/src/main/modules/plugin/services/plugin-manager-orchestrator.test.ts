import { describe, expect, it, vi } from 'vitest'
import { buildPluginManagerRuntime } from './plugin-manager-orchestrator'

describe('plugin-manager-orchestrator', () => {
  it('builds manager runtime and wires health monitor', () => {
    const manager = {} as any
    const installQueue = { id: 'queue' } as any
    manager.__installQueue = installQueue

    const healthMonitor = { id: 'hm' } as any
    const createManager = vi.fn(() => manager)
    const createHealthMonitor = vi.fn(() => healthMonitor)

    const runtime = buildPluginManagerRuntime({
      pluginRootDir: '/tmp/plugins',
      transport: {} as any,
      channel: {
        broadcastPlugin: () => {}
      },
      mainWindowId: 1,
      createManager,
      createHealthMonitor
    })

    expect(runtime.pluginManager).toBe(manager)
    expect(runtime.installQueue).toBe(installQueue)
    expect(runtime.healthMonitor).toBe(healthMonitor)
    expect(manager.healthMonitor).toBe(healthMonitor)
  })
})
