import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTrustedTestPluginContext,
  issuePluginSecurityContext
} from '@talex-touch/utils/transport/security/plugin-identity'
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
    declaredPermissions: {
      required: ['clipboard.read', 'search.root-results', 'storage.plugin'],
      optional: [] as string[]
    },
    status: 3,
    dev: { enable: false },
    disable: vi.fn(),
    getActivationIdentity: vi.fn(() => ({
      name: 'calendar',
      pluginInstanceId: 'calendar-instance',
      activationGeneration: 1,
      key: 'calendar-key'
    })),
    getDataPath: vi.fn(() => '/fixture/calendar/data')
  }
  const manager = {
    plugins: new Map<string, typeof plugin>(),
    getPluginByName: vi.fn<(name: string) => typeof plugin | undefined>(),
    enablePlugin: vi.fn<(name: string) => Promise<boolean>>()
  }
  const healthMonitor = { destroy: vi.fn() }
  const installQueue = { enqueue: vi.fn(), handleConfirmResponse: vi.fn() }
  const mainBrowserWindow = {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn()
  }

  return {
    buildPluginManagerRuntime: vi.fn(() => ({
      pluginManager: manager,
      installQueue,
      healthMonitor
    })),
    browserWindowFromId: vi.fn(),
    checkPermission: vi.fn(),
    permissionHasPermission: vi.fn(),
    permissionGetStore: vi.fn(),
    runtimeOptions: null as Record<string, unknown> | null,
    databaseGetDb: vi.fn(),
    dialogShowMessageBox: vi.fn(),
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
    keyResolveCurrentIdentity: vi.fn(),
    mainBrowserWindow,
    manager,
    networkCleanup: vi.fn(),
    plugin,
    registerMainRuntime: vi.fn(),
    resolvePluginModuleIoRuntime: vi.fn(),
    runtimeDispose: vi.fn(async () => undefined),
    runtimeResolve: vi.fn(),
    setRuntimeService: vi.fn(),
    setSnipasteProcessCapabilityFactory: vi.fn(),
    setSystemActionCapabilityFactory: vi.fn(),
    setBrowserOpenCapabilityFactory: vi.fn(),
    setBrowserDataCapabilityFactory: vi.fn(),
    setWindowManagerCapabilityFactory: vi.fn(),
    setWindowPresetCapabilityFactory: vi.fn(),
    setWorkspaceScriptCapabilityFactory: vi.fn(),
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
  keyManager: { resolveCurrentIdentity: mocks.keyResolveCurrentIdentity },
  sendToWindow: vi.fn()
}

vi.mock('electron', () => ({
  app: { getAppMetrics: vi.fn(() => []), getPath: vi.fn(() => '/Users/test-owner') },
  BrowserWindow: { fromId: mocks.browserWindowFromId },
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
  dialog: {
    showMessageBox: mocks.dialogShowMessageBox,
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() }
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
  TalexEvents: {
    PERMISSION_GRANTED: 'permission-granted',
    PERMISSION_REVOKED: 'permission-revoked'
  },
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
  deleteSecureStoreValuesByPrefix: vi.fn(),
  getSecureStoreHealth: vi.fn(),
  getSecureStoreValue: vi.fn(),
  getSecureStoreValueStrict: vi.fn(),
  isSecureStoreAvailable: mocks.isSecureStoreAvailable,
  setSecureStoreValue: mocks.setSecureStoreValue
}))
vi.mock('../database', () => ({ databaseModule: { getDb: mocks.databaseGetDb } }))
vi.mock('../voice/voice-service', () => ({
  voiceService: {
    dictate: vi.fn(),
    speak: vi.fn(),
    streamDictation: vi.fn()
  }
}))
vi.mock('./host/plugin-intelligence-host-service', () => ({
  createPluginIntelligenceHostService: () =>
    Object.freeze({
      invoke: vi.fn(),
      listProviderModels: vi.fn()
    })
}))
vi.mock('../network', () => ({ getNetworkService: mocks.getNetworkService }))
vi.mock('../permission', () => ({
  createProtectedRegister:
    (transport: {
      on: (event: unknown, handler: (payload: unknown, context: unknown) => unknown) => () => void
    }) =>
    (
      event: unknown,
      _options: unknown,
      callback: (payload: unknown, context: unknown) => unknown
    ) =>
      transport.on(event, callback),
  getPermissionModule: () => ({
    checkPermission: mocks.checkPermission,
    getStore: mocks.permissionGetStore
  })
}))
vi.mock('./dev-server-monitor', () => ({ DevServerHealthMonitor: class {} }))
vi.mock('./host/plugin-runtime-electron-process', () => ({
  ElectronPluginRuntimeProcessFactory: class {}
}))
vi.mock('./host/plugin-runtime-service', () => ({
  PluginRuntimeService: class {
    constructor(options: Record<string, unknown>) {
      mocks.runtimeOptions = options
    }

    dispose = mocks.runtimeDispose
    resolve = mocks.runtimeResolve
  },
  resolvePluginRuntimeArtifactPath: () => '/fixture/plugin-host.js'
}))
vi.mock('./plugin-content-installer', () => ({ installPluginContentPackageToLocalPlugin: vi.fn() }))
vi.mock('./install-queue', () => ({ PluginInstallQueue: class {} }))
vi.mock('./plugin', () => ({
  TouchPlugin: class {
    static setTransport = mocks.setTransport
    static setRuntimeService = mocks.setRuntimeService
    static setSnipasteProcessCapabilityFactory = mocks.setSnipasteProcessCapabilityFactory
    static setSystemActionCapabilityFactory = mocks.setSystemActionCapabilityFactory
    static setBrowserOpenCapabilityFactory = mocks.setBrowserOpenCapabilityFactory
    static setBrowserDataCapabilityFactory = mocks.setBrowserDataCapabilityFactory
    static setWindowManagerCapabilityFactory = mocks.setWindowManagerCapabilityFactory
    static setWindowPresetCapabilityFactory = mocks.setWindowPresetCapabilityFactory
    static setWorkspaceScriptCapabilityFactory = mocks.setWorkspaceScriptCapabilityFactory
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
    mocks.plugin.declaredPermissions = {
      required: ['clipboard.read', 'search.root-results', 'storage.plugin'],
      optional: []
    }
    mocks.checkPermission.mockReset()
    mocks.permissionHasPermission.mockReset()
    mocks.permissionGetStore.mockReset()
    mocks.permissionGetStore.mockReturnValue({ hasPermission: mocks.permissionHasPermission })
    mocks.runtimeOptions = null
    mocks.createClient.mockReset()
    mocks.isSecureStoreAvailable.mockReset()
    mocks.setSecureStoreValue.mockReset()
    mocks.transportOn.mockClear()
    mocks.eventBusOn.mockClear()
    mocks.buildPluginManagerRuntime.mockClear()
    mocks.browserWindowFromId.mockReset()
    mocks.dialogShowMessageBox.mockReset()
    mocks.getNetworkService.mockReset()
    mocks.networkCleanup.mockReset()
    mocks.registerMainRuntime.mockReset()
    mocks.runtimeDispose.mockReset()
    mocks.runtimeDispose.mockResolvedValue(undefined)
    mocks.runtimeResolve.mockReset()
    mocks.keyResolveCurrentIdentity.mockReset()
    mocks.mainBrowserWindow.isDestroyed.mockReset()
    mocks.mainBrowserWindow.isDestroyed.mockReturnValue(false)
    mocks.mainBrowserWindow.isMinimized.mockReset()
    mocks.mainBrowserWindow.isMinimized.mockReturnValue(false)
    mocks.mainBrowserWindow.restore.mockReset()
    mocks.mainBrowserWindow.show.mockReset()
    mocks.mainBrowserWindow.focus.mockReset()
    mocks.setRuntimeService.mockReset()
    mocks.setSnipasteProcessCapabilityFactory.mockReset()
    mocks.setSystemActionCapabilityFactory.mockReset()
    mocks.setBrowserOpenCapabilityFactory.mockReset()
    mocks.setBrowserDataCapabilityFactory.mockReset()
    mocks.setWindowManagerCapabilityFactory.mockReset()
    mocks.setWindowPresetCapabilityFactory.mockReset()
    mocks.setWorkspaceScriptCapabilityFactory.mockReset()
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

  it('wires the immutable 30-ID global manifest and activation-local system factory', async () => {
    const module = new PluginModule()
    mocks.manager.getPluginByName.mockImplementation((name) =>
      name === 'calendar' ? mocks.plugin : undefined
    )
    mocks.permissionHasPermission.mockReturnValue(true)

    await initializeModule(module)

    const runtimeOptions = mocks.runtimeOptions
    expect(runtimeOptions).not.toBeNull()
    const definitions = runtimeOptions?.capabilityDefinitions as
      | ReadonlyArray<{ id: string }>
      | undefined
    expect(definitions).toHaveLength(30)
    expect(definitions?.map((definition) => definition.id)).toContain('plugin.info.get')
    expect(definitions?.map((definition) => definition.id)).toContain('permission.check')
    expect(definitions?.map((definition) => definition.id)).toContain('http.request')
    expect(definitions?.map((definition) => definition.id)).toContain('channel.invoke')
    expect(definitions?.map((definition) => definition.id)).toContain('quick-ops.invoke')
    expect(definitions?.map((definition) => definition.id)).toContain('flow.invoke')
    expect(definitions?.map((definition) => definition.id)).toContain('voice.invoke')
    expect(definitions?.map((definition) => definition.id)).toContain('voice.stream')
    expect(
      definitions?.filter((definition) => definition.id === 'intelligence.invoke')
    ).toHaveLength(1)
    expect(definitions?.map((definition) => definition.id)).not.toContain('system.invoke')
    expect(Object.isFrozen(definitions)).toBe(true)
    expect(mocks.setRuntimeService).toHaveBeenCalledWith(null)
    expect(mocks.setWindowPresetCapabilityFactory.mock.calls[0]).toEqual([null])
    expect(mocks.setBrowserOpenCapabilityFactory.mock.calls[0]).toEqual([null])
    expect(mocks.setBrowserDataCapabilityFactory.mock.calls[0]).toEqual([null])
    expect(mocks.setWindowManagerCapabilityFactory.mock.calls[0]).toEqual([null])
    expect(mocks.setWorkspaceScriptCapabilityFactory.mock.calls[0]).toEqual([null])
    expect(mocks.setSnipasteProcessCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))
    expect(mocks.setSystemActionCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))
    expect(mocks.setBrowserOpenCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))
    expect(mocks.setBrowserDataCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))
    expect(mocks.setWindowManagerCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))
    expect(mocks.setWindowPresetCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))
    expect(mocks.setWorkspaceScriptCapabilityFactory).toHaveBeenLastCalledWith(expect.any(Function))

    const authorize = runtimeOptions?.authorizeCapability as
      | ((pluginName: string, permissionId: string) => boolean)
      | undefined
    expect(authorize?.('calendar', 'clipboard.read')).toBe(true)
    expect(mocks.permissionHasPermission).toHaveBeenCalledWith('calendar', 'clipboard.read', 260215)
    expect(mocks.checkPermission).not.toHaveBeenCalled()

    mocks.plugin.declaredPermissions = {
      required: ['clipboard.read'],
      optional: []
    }
    expect(authorize?.('calendar', 'storage.plugin')).toBe(false)
    expect(mocks.permissionHasPermission).not.toHaveBeenCalledWith(
      'calendar',
      'storage.plugin',
      260215
    )

    mocks.permissionHasPermission.mockReturnValue(false)
    expect(authorize?.('calendar', 'search.root-results')).toBe(false)
    mocks.permissionGetStore.mockReturnValue(null)
    expect(authorize?.('calendar', 'clipboard.write')).toBe(false)
    expect(authorize?.('missing', 'clipboard.read')).toBe(false)

    await module.onDestroy()
  })

  it('parents destructive confirmation only to the configured live CoreApp window', async () => {
    const module = new PluginModule()
    mocks.manager.getPluginByName.mockReturnValue(mocks.plugin)
    mocks.plugin.declaredPermissions = { required: ['system.shell'], optional: [] }
    mocks.permissionHasPermission.mockReturnValue(true)
    await initializeModule(module)
    const activation = Object.freeze({
      name: 'touch-quick-actions',
      pluginInstanceId: 'quick-actions-instance',
      activationGeneration: 1,
      key: 'quick-actions-key'
    })
    mocks.keyResolveCurrentIdentity.mockReturnValue(activation)
    mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 7 } })
    const factory = mocks.setSystemActionCapabilityFactory.mock.calls.at(-1)?.[0] as
      | ((input: typeof activation) => {
          definitions: ReadonlyArray<{
            invoke(
              context: ReturnType<typeof issuePluginSecurityContext>,
              request: unknown,
              signal: AbortSignal,
              resources: unknown
            ): Promise<unknown>
          }>
        })
      | undefined
    expect(factory).toEqual(expect.any(Function))
    const definition = factory?.(activation).definitions[0]
    const context = issuePluginSecurityContext(activation, 'plugin-host', {
      hostGeneration: 7
    })

    mocks.browserWindowFromId.mockReturnValueOnce(null)
    await expect(
      definition?.invoke(
        context,
        { operation: 'run-action', actionId: 'restart' },
        new AbortController().signal,
        { register: vi.fn() }
      )
    ).resolves.toEqual({
      actionId: 'restart',
      status: 'blocked',
      reason: 'confirmation-denied'
    })
    expect(mocks.dialogShowMessageBox).not.toHaveBeenCalled()

    mocks.browserWindowFromId.mockReturnValue(mocks.mainBrowserWindow)
    mocks.dialogShowMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
    await expect(
      definition?.invoke(
        context,
        { operation: 'run-action', actionId: 'shutdown' },
        new AbortController().signal,
        { register: vi.fn() }
      )
    ).resolves.toEqual({
      actionId: 'shutdown',
      status: 'blocked',
      reason: 'confirmation-denied'
    })
    expect(mocks.browserWindowFromId).toHaveBeenLastCalledWith(42)
    expect(mocks.dialogShowMessageBox).toHaveBeenCalledWith(
      mocks.mainBrowserWindow,
      expect.objectContaining({
        title: '确认关机',
        defaultId: 0,
        cancelId: 0,
        signal: expect.any(AbortSignal)
      })
    )
    await module.onDestroy()
  })

  it('shows the configured main window for the current system-actions activation without shell permission', async () => {
    const module = new PluginModule()
    mocks.manager.getPluginByName.mockReturnValue(mocks.plugin)
    mocks.plugin.declaredPermissions = {
      required: ['search.root-results'],
      optional: ['system.shell']
    }
    mocks.permissionHasPermission.mockReturnValue(false)
    await initializeModule(module)
    const activation = Object.freeze({
      name: 'touch-system-actions',
      pluginInstanceId: 'system-actions-instance',
      activationGeneration: 1,
      key: 'system-actions-key'
    })
    mocks.keyResolveCurrentIdentity.mockReturnValue(activation)
    mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 9 } })
    mocks.browserWindowFromId.mockReturnValue(mocks.mainBrowserWindow)
    mocks.mainBrowserWindow.isMinimized.mockReturnValue(true)
    const factory = mocks.setSystemActionCapabilityFactory.mock.calls.at(-1)?.[0] as
      | ((input: typeof activation) => {
          definitions: ReadonlyArray<{
            invoke(
              context: ReturnType<typeof issuePluginSecurityContext>,
              request: unknown,
              signal: AbortSignal,
              resources: unknown
            ): Promise<unknown>
          }>
        })
      | undefined
    const definition = factory?.(activation).definitions[0]
    const context = issuePluginSecurityContext(activation, 'plugin-host', {
      hostGeneration: 9
    })

    await expect(
      definition?.invoke(
        context,
        { operation: 'run-action', actionId: 'open-main-window' },
        new AbortController().signal,
        { register: vi.fn() }
      )
    ).resolves.toEqual({ actionId: 'open-main-window', status: 'started' })
    expect(mocks.permissionHasPermission).not.toHaveBeenCalled()
    expect(mocks.browserWindowFromId).toHaveBeenCalledExactlyOnceWith(42)
    expect(mocks.mainBrowserWindow.restore).toHaveBeenCalledOnce()
    expect(mocks.mainBrowserWindow.show).toHaveBeenCalledOnce()
    expect(mocks.mainBrowserWindow.focus).toHaveBeenCalledOnce()

    await module.onDestroy()
  })

  it('stops synchronous main-window mutations when the host generation rotates', async () => {
    const module = new PluginModule()
    mocks.manager.getPluginByName.mockReturnValue(mocks.plugin)
    mocks.plugin.declaredPermissions = {
      required: ['search.root-results'],
      optional: ['system.shell']
    }
    mocks.permissionHasPermission.mockReturnValue(false)
    await initializeModule(module)
    const activation = Object.freeze({
      name: 'touch-system-actions',
      pluginInstanceId: 'system-actions-instance',
      activationGeneration: 1,
      key: 'system-actions-key'
    })
    mocks.keyResolveCurrentIdentity.mockReturnValue(activation)
    mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 9 } })
    mocks.browserWindowFromId.mockReturnValue(mocks.mainBrowserWindow)
    mocks.mainBrowserWindow.isMinimized.mockReturnValue(true)
    mocks.mainBrowserWindow.restore.mockImplementationOnce(() => {
      mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 10 } })
    })
    const factory = mocks.setSystemActionCapabilityFactory.mock.calls.at(-1)?.[0] as
      | ((input: typeof activation) => {
          definitions: ReadonlyArray<{
            invoke(
              context: ReturnType<typeof issuePluginSecurityContext>,
              request: unknown,
              signal: AbortSignal,
              resources: unknown
            ): Promise<unknown>
          }>
        })
      | undefined
    const definition = factory?.(activation).definitions[0]
    const context = issuePluginSecurityContext(activation, 'plugin-host', {
      hostGeneration: 9
    })

    await expect(
      definition?.invoke(
        context,
        { operation: 'run-action', actionId: 'open-main-window' },
        new AbortController().signal,
        { register: vi.fn() }
      )
    ).resolves.toEqual({
      actionId: 'open-main-window',
      status: 'failed',
      reason: 'execution-failed'
    })
    expect(mocks.mainBrowserWindow.restore).toHaveBeenCalledOnce()
    expect(mocks.mainBrowserWindow.show).not.toHaveBeenCalled()
    expect(mocks.mainBrowserWindow.focus).not.toHaveBeenCalled()

    await module.onDestroy()
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
      error: { code: 'PLUGIN_WINDOW_NOT_FOUND', message: 'Plugin not found.' }
    })

    const authoritativeContext = {
      plugin: createTrustedTestPluginContext({
        name: 'calendar',
        pluginInstanceId: 'calendar-instance',
        activationGeneration: 1,
        uniqueKey: 'calendar-key'
      })
    }

    mocks.checkPermission.mockReturnValue({
      allowed: false,
      permissionId: 'storage:plugin:secret',
      reason: 'Secret access was denied'
    })
    const denied = await invokeTransportHandler(
      PluginEvents.storage.setSecret,
      { key: 'token', value: 'encrypted-value' },
      authoritativeContext
    )
    expect(denied).toEqual({
      success: false,
      code: 'PLUGIN_STORAGE_PERMISSION_DENIED',
      error: 'Plugin storage permission is denied.'
    })
    expect(mocks.setSecureStoreValue).not.toHaveBeenCalled()

    mocks.checkPermission.mockReturnValue({ allowed: true, permissionId: 'storage:plugin:secret' })
    const approved = await invokeTransportHandler(
      PluginEvents.storage.setSecret,
      { key: 'token', value: 'encrypted-value' },
      authoritativeContext
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

  it('continues all resource teardown when runtime and business cleanup fail', async () => {
    const module = new PluginModule()
    await initializeModule(module)
    const closeBusiness = vi.fn(async () => {
      throw new Error('business cleanup failed')
    })
    const closeSqlite = vi.fn(async () => undefined)
    Reflect.set(module, 'pluginBusinessCapabilities', {
      definitions: [],
      closeActivation: vi.fn(),
      closeAll: closeBusiness
    })
    Reflect.set(module, 'pluginSqliteResources', { closeAll: closeSqlite })
    mocks.runtimeDispose.mockRejectedValueOnce(new Error('runtime cleanup failed'))

    await expect(module.onDestroy()).rejects.toThrow('PLUGIN_MODULE_CLEANUP_FAILED')

    expect(mocks.runtimeDispose).toHaveBeenCalledOnce()
    expect(closeBusiness).toHaveBeenCalledOnce()
    expect(closeSqlite).toHaveBeenCalledOnce()
    expect(mocks.setRuntimeService).toHaveBeenLastCalledWith(null)
    expect(mocks.setSnipasteProcessCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setSystemActionCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setBrowserOpenCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setBrowserDataCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setWindowManagerCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setWindowPresetCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setWorkspaceScriptCapabilityFactory).toHaveBeenLastCalledWith(null)
    expect(mocks.setTransport).toHaveBeenLastCalledWith(null)
    expect(mocks.healthMonitor.destroy).toHaveBeenCalledOnce()
    expect(mocks.stopUpdateScheduler).toHaveBeenCalledOnce()
  })
})
