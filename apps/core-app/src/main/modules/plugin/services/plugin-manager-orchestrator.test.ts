import type { IPluginManager } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { PluginInstallQueue } from '../install-queue'
import type { DevServerHealthMonitor } from '../dev-server-monitor'
import { describe, expect, it, vi } from 'vitest'
import { buildPluginManagerRuntime } from './plugin-manager-orchestrator'

type TestPluginManager = IPluginManager & {
  __installQueue?: PluginInstallQueue
  healthMonitor?: DevServerHealthMonitor
}

describe('plugin-manager-orchestrator', () => {
  it('builds manager runtime and wires health monitor', () => {
    const manager = {} as TestPluginManager
    const installQueue = { id: 'queue' } as unknown as PluginInstallQueue
    manager.__installQueue = installQueue

    const healthMonitor = { id: 'hm' } as unknown as DevServerHealthMonitor
    const createManager = vi.fn(() => manager)
    const createHealthMonitor = vi.fn(() => healthMonitor)

    const runtime = buildPluginManagerRuntime({
      pluginRootDir: '/tmp/plugins',
      transport: {} as ITuffTransportMain,
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
