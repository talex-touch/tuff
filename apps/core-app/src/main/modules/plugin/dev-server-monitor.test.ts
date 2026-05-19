import type { IPluginManager, ITouchPlugin } from '@talex-touch/utils/plugin'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    request: requestMock
  })
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => ({
      isRegistered: vi.fn(() => false),
      register: vi.fn(),
      unregister: vi.fn(),
      start: vi.fn()
    })
  }
}))

vi.mock('../../hooks/use-electron-guard', () => ({
  useAliveTarget: (target: unknown) => target
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

import { DevServerHealthMonitor } from './dev-server-monitor'

type MonitorWithPrivateCheck = DevServerHealthMonitor & {
  checkHealth(plugin: ITouchPlugin): Promise<void>
}

function createPlugin(): ITouchPlugin {
  return {
    name: 'demo-plugin',
    status: PluginStatus.ENABLED,
    dev: {
      enable: true,
      source: true,
      address: 'http://127.0.0.1:3488/'
    },
    issues: [],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } as unknown as ITouchPlugin
}

function createManager(plugin: ITouchPlugin): IPluginManager {
  return {
    getPluginByName: vi.fn(() => plugin),
    reloadPlugin: vi.fn(async () => {}),
    emitIssueDelta: vi.fn()
  } as unknown as IPluginManager
}

describe('DevServerHealthMonitor', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('reloads a dev plugin when virtual index.js changes after the baseline check', async () => {
    const plugin = createPlugin()
    const manager = createManager(plugin)
    const monitor = new DevServerHealthMonitor(manager) as MonitorWithPrivateCheck

    requestMock
      .mockResolvedValueOnce({
        data: {
          'index.js': {
            exist: true,
            changed: true,
            lastModified: 100,
            path: '/tmp/demo/src/prelude/main.ts',
            size: 12,
            source: 'prelude'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          'index.js': {
            exist: true,
            changed: true,
            lastModified: 200,
            path: '/tmp/demo/src/prelude/main.ts',
            size: 24,
            source: 'prelude'
          }
        }
      })

    await monitor.checkHealth(plugin)
    expect(manager.reloadPlugin).not.toHaveBeenCalled()

    await monitor.checkHealth(plugin)
    expect(manager.reloadPlugin).toHaveBeenCalledWith('demo-plugin')
  })
})
