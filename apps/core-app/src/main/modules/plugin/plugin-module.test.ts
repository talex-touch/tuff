import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '@talex-touch/utils/transport/events'

type TransportDisposer = () => void

const mocks = vi.hoisted(() => {
  const handlers = new Map<unknown, (payload: unknown, context: unknown) => unknown>()
  const disposers: TransportDisposer[] = []
  const eventHandlers = new Map<unknown, (event: unknown) => void>()
  const transportOn = vi.fn(
    (channel: unknown, handler: (payload: unknown, context: unknown) => unknown) => {
      handlers.set(channel, handler)
      const dispose = vi.fn(() => {
        handlers.delete(channel)
      })
      disposers.push(dispose)
      return dispose
    }
  )
  const plugin = {
    name: 'calendar',
    sdkapi: 260215,
    disable: vi.fn(),
    getDataPath: vi.fn(() => '/fixture/calendar/data')
  }
  const manager = {
    plugins: new Map<string, typeof plugin>(),
    getPluginByName: vi.fn<(name: string) => typeof plugin | undefined>(),
    enablePlugin: vi.fn<(name: string) => Promise<boolean>>()
  }
  const healthMonitor = { destroy: vi.fn() }
  const installQueue = { enqueue: vi.fn(), handleConfirmResponse: vi.fn() }

  return {
    buildPluginManagerRuntime: vi.fn(() => ({
      pluginManager: manager,
      installQueue,
      healthMonitor
    })),
    checkPermission: vi.fn(),
    databaseGetDb: vi.fn(),
    createClient: vi.fn(),
    disposers,
    eventBusOn: vi.fn((event: unknown, handler: (payload: unknown) => void) => {
      eventHandlers.set(event, handler)
    }),
    eventBusOff: vi.fn((event: unknown) => {
      eventHandlers.delete(event)
    }),
    eventHandlers,
    getNetworkService: vi.fn(),
    handlers,
    healthMonitor,
    installQueue,
    isSecureStoreAvailable: vi.fn(),
    manager,
    networkCleanup: vi.fn(),
    plugin,
    registerMainRuntime: vi.fn(),
    resolvePluginModuleIoRuntime: vi.fn(),
    setSecureStoreValue: vi.fn(),
    setTransport: vi.fn(),
    startUpdateScheduler: vi.fn(),
    stopUpdateScheduler: vi.fn(),
    transportOn
  }
})

const transport = {
  on: mocks.transportOn,
  broadcast: vi.fn(),
  broadcastPlugin: vi.fn(),
  sendToWindow: vi.fn()
}

vi.mock('electron', () => ({
  app: { getAppMetrics: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), off: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  MessageChannelMain: class MessageChannelMain {
    port1 = {
      close: vi.fn(),
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn()
    }
    port2 = {
      close: vi.fn(),
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn()
    }
  },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() }
}))

vi.mock('@libsql/client', () => ({ createClient: mocks.createClient }))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    child: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

vi.mock('../../core/eventbus/touch-event', () => ({
  TalexEvents: { PERMISSION_GRANTED: 'permission-granted' },
  touchEventBus: { off: mocks.eventBusOff, on: mocks.eventBusOn }
}))

vi.mock('../../core/runtime-accessor', () => ({
  registerMainRuntime: mocks.registerMainRuntime,
  resolveMainRuntime: vi.fn(() => ({ runtime: 'main' }))
}))

vi.mock('../../core/touch-window', () => ({ TouchWindow: class {} }))
vi.mock('../../core/window-security-profile', () => ({ buildWindowWebPreferences: vi.fn() }))
vi.mock('../../db/utils', () => ({ createDbUtils: vi.fn() }))
vi.mock('../../hooks/use-electron-guard', () => ({
  useAliveTarget: vi.fn(),
  useAliveWebContents: vi.fn()
}))
vi.mock('../../service/file-watch.service', () => ({ fileWatchService: {} }))
vi.mock('../../service/store-api.service', () => ({
  reportPluginUninstall: vi.fn(),
  startUpdateScheduler: mocks.startUpdateScheduler,
  stopUpdateScheduler: mocks.stopUpdateScheduler,
  triggerUpdateCheck: vi.fn()
}))
vi.mock('../../service/store-http.service', () => ({ performStoreHttpRequest: vi.fn() }))
vi.mock('../../service/official-plugin.service', () => ({ getOfficialPlugins: vi.fn() }))
vi.mock('../../utils/common-util', () => ({ debounce: (callback: unknown) => callback }))
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn()
    }),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  })
}))
vi.mock('../../utils/secure-store', () => ({
  getSecureStoreHealth: vi.fn(),
  getSecureStoreValue: vi.fn(),
  isSecureStoreAvailable: mocks.isSecureStoreAvailable,
  setSecureStoreValue: mocks.setSecureStoreValue
}))
vi.mock('../database', () => ({ databaseModule: { getDb: mocks.databaseGetDb } }))
vi.mock('../network', () => ({ getNetworkService: mocks.getNetworkService }))
vi.mock('../permission', () => ({
  createProtectedRegister:
    () =>
    (
      channel: unknown,
      _options: unknown,
      handler: (payload: unknown, context: unknown) => unknown
    ) =>
      mocks.transportOn(channel, handler),
  getPermissionModule: () => ({ checkPermission: mocks.checkPermission })
}))
vi.mock('./dev-server-monitor', () => ({ DevServerHealthMonitor: class {} }))
vi.mock('./plugin-content-installer', () => ({ installPluginContentPackageToLocalPlugin: vi.fn() }))
vi.mock('./install-queue', () => ({ PluginInstallQueue: class {} }))
vi.mock('./plugin', () => ({
  TouchPlugin: class {
    static setTransport = mocks.setTransport
  }
}))
vi.mock('./plugin-installer', () => ({ PluginInstaller: class {} }))
vi.mock('./plugin-loaders', () => ({
  createPluginLoadShell: vi.fn(),
  createPluginLoader: vi.fn()
}))
vi.mock('./widget/widget-issue', () => ({ isWidgetFeatureEnabled: vi.fn() }))
vi.mock('./widget/widget-manager', () => ({ widgetManager: {} }))
vi.mock('./plugin-preflight-helper', () => ({
  applyLoadedPluginPreflightState: vi.fn(),
  applyPluginPreflightFailure: vi.fn(),
  broadcastPluginPreflightState: vi.fn(),
  buildLoaderFatalPreflightFailure: vi.fn(),
  buildRuntimeDriftPreflightFailure: vi.fn()
}))
vi.mock('./plugin-runtime-integrity', () => ({ mergePackagedManifestMetadata: vi.fn() }))
vi.mock('./providers/local-provider', () => ({ LocalPluginProvider: class {} }))
vi.mock('./runtime/plugin-injections', () => ({ usePluginInjections: vi.fn() }))
vi.mock('./runtime/plugin-view-security-profile', () => ({
  resolvePluginViewSecurityProfile: vi.fn()
}))
vi.mock('./runtime/plugin-runtime-repair', () => ({ inspectPluginRuntimeDrift: vi.fn() }))
vi.mock('./runtime/plugin-runtime-tracker', () => ({ pluginRuntimeTracker: {} }))
vi.mock('./sdkapi-hard-cut-gate', () => ({ getPluginSdkHardCutGate: vi.fn() }))
vi.mock('./services/plugin-io-service', () => ({
  resolvePluginModuleIoRuntime: mocks.resolvePluginModuleIoRuntime
}))
vi.mock('./services/plugin-manager-orchestrator', () => ({
  buildPluginManagerRuntime: mocks.buildPluginManagerRuntime
}))

import { PluginModule } from './plugin-module'

function invokeTransportHandler(channel: unknown, payload: unknown, context: unknown): unknown {
  const handler = mocks.handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${String(channel)}`)
  }
  return handler(payload, context)
}

function initializeModule(module: PluginModule): Promise<void> {
  return Promise.resolve(
    Reflect.apply(module.onInit, module, [
      {
        app: { rootPath: '/fixture/app' },
        file: { dirPath: '/fixture/plugins' }
      }
    ])
  )
}

describe('PluginModule facade', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.disposers.splice(0)
    mocks.eventHandlers.clear()
    mocks.manager.plugins.clear()
    Reflect.deleteProperty(mocks.manager, 'pendingPermissionPlugins')
    mocks.manager.getPluginByName.mockReset()
    mocks.manager.enablePlugin.mockReset()
    mocks.healthMonitor.destroy.mockReset()
    mocks.plugin.disable.mockReset()
    mocks.checkPermission.mockReset()
    mocks.createClient.mockReset()
    mocks.isSecureStoreAvailable.mockReset()
    mocks.setSecureStoreValue.mockReset()
    mocks.transportOn.mockClear()
    mocks.eventBusOn.mockClear()
    mocks.buildPluginManagerRuntime.mockClear()
    mocks.getNetworkService.mockReset()
    mocks.networkCleanup.mockReset()
    mocks.registerMainRuntime.mockReset()
    mocks.setTransport.mockReset()
    mocks.startUpdateScheduler.mockReset()
    mocks.stopUpdateScheduler.mockReset()

    mocks.getNetworkService.mockReturnValue({ onStatusChange: vi.fn(() => mocks.networkCleanup) })
    mocks.resolvePluginModuleIoRuntime.mockReturnValue({
      transport,
      channel: { broadcastPlugin: vi.fn() },
      mainWindowId: 42
    })
    mocks.manager.enablePlugin.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('retries a pending plugin only after the permission-granted lifecycle event', async () => {
    const module = new PluginModule()
    const pendingPermissionPlugins = new Map([
      ['calendar', { pluginName: 'Calendar', autoRetry: true }]
    ])
    Object.assign(mocks.manager, { pendingPermissionPlugins })

    await initializeModule(module)

    const permissionGranted = mocks.eventHandlers.get('permission-granted')
    if (!permissionGranted) {
      throw new Error('PluginModule did not subscribe to permission grants')
    }

    permissionGranted({ pluginId: 'calendar' })

    expect(mocks.manager.enablePlugin).toHaveBeenCalledWith('calendar')
    expect(pendingPermissionPlugins.has('calendar')).toBe(false)
    expect(mocks.setTransport).toHaveBeenCalledWith(transport)
  })

  it('rejects secret writes without permission, permits approved writes, and disposes transport handlers', async () => {
    const module = new PluginModule()
    mocks.manager.plugins.set('calendar', mocks.plugin)
    mocks.manager.getPluginByName.mockImplementation((name) =>
      name === 'calendar' ? mocks.plugin : undefined
    )
    mocks.isSecureStoreAvailable.mockReturnValue(true)
    mocks.setSecureStoreValue.mockResolvedValue(true)

    await initializeModule(module)
    await module.start()

    const missingWindow = await invokeTransportHandler(
      PluginEvents.window.visible,
      { id: 9 },
      { plugin: { name: 'missing' } }
    )
    expect(missingWindow).toEqual({
      error: {
        code: 'PLUGIN_WINDOW_NOT_FOUND',
        message: 'Plugin not found.'
      }
    })

    mocks.checkPermission.mockReturnValue({
      allowed: false,
      permissionId: 'storage:plugin:secret',
      reason: 'Secret access was denied'
    })
    const denied = await invokeTransportHandler(
      PluginEvents.storage.setSecret,
      { key: 'token', value: 'encrypted-value' },
      { plugin: { name: 'calendar' } }
    )
    expect(denied).toEqual({ success: false, error: 'Secret access was denied' })
    expect(mocks.setSecureStoreValue).not.toHaveBeenCalled()

    mocks.checkPermission.mockReturnValue({ allowed: true, permissionId: 'storage:plugin:secret' })
    const approved = await invokeTransportHandler(
      PluginEvents.storage.setSecret,
      { key: 'token', value: 'encrypted-value' },
      { plugin: { name: 'calendar' } }
    )
    expect(approved).toEqual({ success: true })
    expect(mocks.setSecureStoreValue).toHaveBeenCalledWith(
      '/fixture/app',
      'plugin.calendar.token',
      'encrypted-value',
      'plugin-secret',
      expect.any(Function)
    )

    await module.onDestroy()
    expect(mocks.eventBusOff).toHaveBeenCalledWith('permission-granted', expect.any(Function))

    expect(() =>
      invokeTransportHandler(
        PluginEvents.window.visible,
        { id: 9 },
        { plugin: { name: 'missing' } }
      )
    ).toThrow('No handler registered')
    expect(() =>
      invokeTransportHandler(
        PluginEvents.storage.setSecret,
        { key: 'token', value: 'encrypted-value' },
        { plugin: { name: 'calendar' } }
      )
    ).toThrow('No handler registered')
    expect(mocks.plugin.disable).toHaveBeenCalledOnce()
    expect(mocks.healthMonitor.destroy).toHaveBeenCalledOnce()
    expect(mocks.networkCleanup).toHaveBeenCalledOnce()
    expect(mocks.stopUpdateScheduler).toHaveBeenCalledOnce()
  })
})
