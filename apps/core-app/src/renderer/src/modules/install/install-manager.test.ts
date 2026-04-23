import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pluginSdkState = vi.hoisted(() => ({
  progressHandler: undefined as ((payload: Record<string, unknown>) => void) | undefined,
  confirmHandler: undefined as ((payload: Record<string, unknown>) => void) | undefined,
  sendInstallConfirmResponse: vi.fn()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/plugin', () => ({
  createPluginSdk: () => ({
    onInstallProgress: (handler: (payload: Record<string, unknown>) => void) => {
      pluginSdkState.progressHandler = handler
      return () => {
        if (pluginSdkState.progressHandler === handler) {
          pluginSdkState.progressHandler = undefined
        }
      }
    },
    onInstallConfirm: (handler: (payload: Record<string, unknown>) => void) => {
      pluginSdkState.confirmHandler = handler
      return () => {
        if (pluginSdkState.confirmHandler === handler) {
          pluginSdkState.confirmHandler = undefined
        }
      }
    },
    sendInstallConfirmResponse: pluginSdkState.sendInstallConfirmResponse
  })
}))

vi.mock('~/modules/lang', () => ({
  useI18nText: (fallback: (key: string, params?: Record<string, unknown>) => string) => ({
    t: fallback
  })
}))

vi.mock('~/modules/mention/dialog-mention', () => ({
  forTouchTip: vi.fn().mockResolvedValue(undefined)
}))

describe('install-manager task indexing', () => {
  beforeEach(() => {
    vi.resetModules()
    pluginSdkState.progressHandler = undefined
    pluginSdkState.confirmHandler = undefined
    pluginSdkState.sendInstallConfirmResponse.mockReset()
    vi.stubGlobal('window', {
      addEventListener: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps provider-scoped install tasks isolated for plugins with the same id', async () => {
    const { useInstallManager } = await import('./install-manager')
    const manager = useInstallManager()

    pluginSdkState.progressHandler?.({
      taskId: 'task-nexus',
      stage: 'downloading',
      pluginId: 'touch-demo',
      providerId: 'nexus'
    })
    pluginSdkState.progressHandler?.({
      taskId: 'task-community',
      stage: 'downloading',
      pluginId: 'touch-demo',
      providerId: 'community'
    })

    expect(manager.getTaskByPluginId('touch-demo', 'nexus')?.taskId).toBe('task-nexus')
    expect(manager.getTaskByPluginId('touch-demo', 'community')?.taskId).toBe('task-community')
    expect(manager.getTaskByPluginId('touch-demo')).toBeUndefined()
  })

  it('still resolves provider-less plugins by plain plugin id', async () => {
    const { useInstallManager } = await import('./install-manager')
    const manager = useInstallManager()

    pluginSdkState.progressHandler?.({
      taskId: 'task-local',
      stage: 'installing',
      pluginId: 'local-plugin'
    })

    expect(manager.getTaskByPluginId('local-plugin')?.taskId).toBe('task-local')
  })
})
