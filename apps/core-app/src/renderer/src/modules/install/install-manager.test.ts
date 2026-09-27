import type * as PermissionRequestCardModule from '~/modules/permission/permission-request-card'
import { INSTALL_CONFIRM_BUDGET_MS } from '@talex-touch/utils/plugin/install-budgets'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pluginSdkState = vi.hoisted(() => ({
  progressHandler: undefined as ((payload: Record<string, unknown>) => void) | undefined,
  confirmHandler: undefined as ((payload: Record<string, unknown>) => void) | undefined,
  sendInstallConfirmResponse: vi.fn()
}))

const permissionCardState = vi.hoisted(() => ({
  decision: 'deny' as 'deny' | 'session' | 'always',
  showPermissionRequestCard: vi.fn()
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
  useI18nText: (fallback?: (key: string, params?: Record<string, unknown>) => string) => ({
    t: fallback ?? ((key: string) => key)
  })
}))

vi.mock('~/modules/mention/dialog-mention', () => ({
  forTouchTip: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('~/modules/permission/permission-request-card', () => ({
  PERMISSION_REQUEST_TIMEOUT_MS: 30_000,
  showPermissionRequestCard: permissionCardState.showPermissionRequestCard
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('install-manager task indexing', () => {
  beforeEach(() => {
    vi.resetModules()
    pluginSdkState.progressHandler = undefined
    pluginSdkState.confirmHandler = undefined
    pluginSdkState.sendInstallConfirmResponse.mockReset()
    permissionCardState.decision = 'deny'
    permissionCardState.showPermissionRequestCard.mockReset()
    permissionCardState.showPermissionRequestCard.mockImplementation(() => ({
      id: 'permission-card',
      result: Promise.resolve(permissionCardState.decision)
    }))
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

  it('uses the unified permission request card for install permission confirmation', async () => {
    permissionCardState.decision = 'session'
    const { useInstallManager } = await import('./install-manager')
    useInstallManager()

    pluginSdkState.confirmHandler?.({
      taskId: 'task-permission',
      kind: 'permissions',
      pluginId: 'touch-intelligence',
      pluginName: 'touch-intelligence',
      permissions: {
        required: ['intelligence.basic', 'search.root-results'],
        optional: [],
        reasons: {
          'intelligence.basic': '调用智能能力完成问答'
        }
      }
    })

    await vi.waitFor(() => {
      expect(pluginSdkState.sendInstallConfirmResponse).toHaveBeenCalledWith({
        taskId: 'task-permission',
        decision: 'accept',
        grantMode: 'session'
      })
    })
    expect(permissionCardState.showPermissionRequestCard).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'plugin.permissions.startup.requestMessage',
        permissions: [
          {
            id: 'intelligence.basic',
            reason: '调用智能能力完成问答'
          },
          {
            id: 'search.root-results',
            reason: undefined
          }
        ]
      })
    )
  })
})

/**
 * The install's transport wall is derived from `INSTALL_CONFIRM_BUDGET_MS`, which is how long the
 * main process waits for the user. A card that auto-denies later than that budget lets the main
 * process give up first, so the install is reported as failed even though the user did answer.
 */
describe('install permission budget coupling', () => {
  it('auto-denies the permission card within the confirm budget the install deadline was sized for', async () => {
    // The module is mocked above for the task-indexing specs; read the real export so a drifted
    // card budget is caught instead of the mock's stand-in value.
    const { PERMISSION_REQUEST_TIMEOUT_MS } = await vi.importActual<
      typeof PermissionRequestCardModule
    >('~/modules/permission/permission-request-card')

    expect(PERMISSION_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(INSTALL_CONFIRM_BUDGET_MS)
  })
})
