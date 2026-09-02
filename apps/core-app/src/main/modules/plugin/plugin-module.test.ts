import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import path from 'node:path'
import fse from 'fs-extra'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { PluginStatus, type IPluginManager, type ITouchPlugin } from '@talex-touch/utils/plugin'
import type { PluginApiUninstallRequest } from '@talex-touch/utils/transport/events/types'
import {
  createTrustedTestPluginContext,
  issuePluginSecurityContext
} from '@talex-touch/utils/transport/security/plugin-identity'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { app } from 'electron'
import * as safeShell from '@talex-touch/utils/common/utils/safe-shell'
import type { PluginVscodeProjectsSnapshot } from './host/plugin-vscode-projects-capabilities'
import type { PluginHostCapabilityResourceContext } from './host/plugin-host-resources'
import { teardownPluginStorage } from './runtime/plugin-storage-lifecycle'

/**
 * The uninstall coordinator pins the owner's data and code directories by real
 * inode identity (task-301 lifecycle hardening) and refuses to run when a pinned
 * path is missing or swapped, so string fixtures abort every run at stage one.
 *
 * realpath matters: on macOS `/var` symlinks to `/private/var`, and the pin check
 * rejects any path where `realpath !== resolve`.
 */
const FIXTURE_ROOT = realpathSync(mkdtempSync(path.join(tmpdir(), 'plugin-module-fixture-')))

function fixturePath(...segments: string[]): string {
  return path.join(FIXTURE_ROOT, ...segments)
}

function ensureFixtureDirs(): void {
  mkdirSync(fixturePath('plugins', 'calendar'), { recursive: true })
  for (const root of [fixturePath('calendar', 'data'), fixturePath('plugin-data', 'calendar')]) {
    mkdirSync(path.join(root, 'temp'), { recursive: true })
    mkdirSync(path.join(root, 'cache'), { recursive: true })
  }
}

interface CapturedManagerFactory {
  (
    pluginRootDir: string,
    transport: unknown,
    channel: unknown,
    mainWindowId: number
  ): IPluginManager
}

type TransportDisposer = () => void

const mocks = vi.hoisted(() => {
  const handlers = new Map<unknown, (payload: unknown, context: unknown) => unknown>()
  const disposers: TransportDisposer[] = []
  const eventHandlers = new Map<unknown, (event: unknown) => void>()
  const removedPaths = new Set<string>()
  const symbolicPaths = new Set<string>()
  /** Quarantine renames really move the fixture; remember where each path went. */
  const renamedPaths = new Map<string, string>()
  let capturedManagerFactory: CapturedManagerFactory | null = null
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
    getDataPath: vi.fn(() => fixturePath('calendar', 'data'))
  }
  const manager = {
    plugins: new Map<string, typeof plugin>(),
    getPluginByName: vi.fn<(name: string) => typeof plugin | undefined>(),
    enablePlugin: vi.fn<(name: string) => Promise<boolean>>(),
    reloadPlugin: vi.fn<(name: string) => Promise<void>>(),
    uninstallPlugin: vi.fn<(request: PluginApiUninstallRequest) => Promise<unknown>>()
  }
  const dbUtils = {
    countPluginData: vi.fn<(pluginName: string) => Promise<number>>(),
    deletePluginData: vi.fn<(pluginName: string) => Promise<void>>(),
    getPluginData: vi.fn(),
    listPluginData: vi.fn(),
    setPluginData: vi.fn()
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
  const vscodeFilesystem = {
    lstat: vi.fn(),
    open: vi.fn(),
    realpath: vi.fn(),
    stat: vi.fn(),
    restore: () => undefined
  }

  return {
    buildPluginManagerRuntime: vi.fn((options: { createManager: CapturedManagerFactory }) => {
      capturedManagerFactory = options.createManager
      return {
        pluginManager: manager,
        installQueue,
        healthMonitor
      }
    }),
    browserWindowFromId: vi.fn(),
    checkPermission: vi.fn(),
    createClient: vi.fn(),
    createDbUtils: vi.fn(() => dbUtils),
    countSecureStoreValuesByPrefixes: vi.fn(),
    databaseGetDb: vi.fn(),
    dbUtils,
    deleteSecureStoreValuesByPrefix: vi.fn(),
    removedPaths,
    renamedPaths,
    symbolicPaths,
    devWatcherRemovePlugin: vi.fn(),
    dialogShowMessageBox: vi.fn(),
    dialogShowSaveDialog: vi.fn(),
    imageToolsInspect: vi.fn(),
    imageToolsRender: vi.fn(),
    disposers,
    eventBusOn: vi.fn((event: unknown, handler: (payload: unknown) => void) => {
      eventHandlers.set(event, handler)
    }),
    eventBusOff: vi.fn((event: unknown) => {
      eventHandlers.delete(event)
    }),
    eventHandlers,
    ensureDir: vi.fn(),
    fsPathExists: vi.fn(),
    fsRemove: vi.fn(),
    getCapturedManagerFactory: () => capturedManagerFactory,
    getNetworkService: vi.fn(),
    handlers,
    healthMonitor,
    installQueue,
    isSecureStoreAvailable: vi.fn(),
    keyResolveCurrentIdentity: vi.fn(),
    localProviderTrackFile: vi.fn(),
    localProviderUntrackFile: vi.fn(),
    mainBrowserWindow,
    manager,
    networkCleanup: vi.fn(),
    permissionClearDeclaredPermissions: vi.fn(),
    permissionGetStore: vi.fn(),
    permissionHasPermission: vi.fn(),
    permissionRevokeAll: vi.fn(),
    plugin,
    registerMainRuntime: vi.fn(),
    reportPluginUninstall: vi.fn(),
    tempCleanupNamespace: vi.fn(),
    tempGetNamespaceConfig: vi.fn(),
    tempInspectNamespace: vi.fn(),
    tempRegisterNamespace: vi.fn(),
    resetCapturedManagerFactory: () => {
      capturedManagerFactory = null
    },
    resolvePluginModuleIoRuntime: vi.fn(),
    runtimeDispose: vi.fn(async () => undefined),
    runtimeOptions: null as Record<string, unknown> | null,
    runtimeResolve: vi.fn(),
    setCapabilities: vi.fn(),
    setSecureStoreValue: vi.fn(),
    setTransport: vi.fn(),
    startUpdateScheduler: vi.fn(),
    stopUpdateScheduler: vi.fn(),
    transportOn,
    vscodeFilesystem
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
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: mocks.dialogShowSaveDialog
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() }
}))

// `rename` lives in node:fs/promises while remove/rmdir are mocked below. It has
// to stay real: the coordinator re-pins the quarantine path by inode before
// deleting it, so a bookkeeping-only rename leaves nothing to verify and the
// deletion is skipped entirely.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const restoreVscodeFilesystem = (): undefined => {
    mocks.vscodeFilesystem.lstat.mockImplementation(actual.lstat)
    mocks.vscodeFilesystem.open.mockImplementation(actual.open)
    mocks.vscodeFilesystem.realpath.mockImplementation(actual.realpath)
    mocks.vscodeFilesystem.stat.mockImplementation(actual.stat)
    return undefined
  }
  mocks.vscodeFilesystem.restore = restoreVscodeFilesystem
  restoreVscodeFilesystem()
  return {
    ...actual,
    default: {
      ...actual,
      lstat: mocks.vscodeFilesystem.lstat,
      open: mocks.vscodeFilesystem.open,
      realpath: mocks.vscodeFilesystem.realpath,
      stat: mocks.vscodeFilesystem.stat
    },
    rename: vi.fn(async (from: string, to: string) => {
      mocks.renamedPaths.set(to, from)
      await actual.rename(from, to)
    })
  }
})

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: mocks.ensureDir,
    existsSync: vi.fn(() => false),
    lstat: vi.fn(async (target: string) => {
      if (mocks.removedPaths.has(target) || !(await mocks.fsPathExists(target))) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }
      // Quarantine really moves directories, so a fixture path can be gone even
      // though fsPathExists still reports it. Trust the disk for those.
      if (target.startsWith(FIXTURE_ROOT)) {
        try {
          statSync(target)
        } catch {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        }
      }
      const symbolic = mocks.symbolicPaths.has(target)
      // Pinning captures dev/ino with the real fs and re-checks through this
      // mock; without identity every comparison fails as OWNER_PATH_CHANGED.
      let identity: { dev: number; ino: number } = { dev: 0, ino: 0 }
      try {
        const real = statSync(target)
        identity = { dev: Number(real.dev), ino: Number(real.ino) }
      } catch {
        // Fixture path with no on-disk counterpart.
      }
      return {
        ...identity,
        isDirectory: () => !symbolic,
        isSymbolicLink: () => symbolic
      }
    }),
    stat: vi.fn(async (target: string) => {
      const real = statSync(target)
      return {
        dev: Number(real.dev),
        ino: Number(real.ino),
        isDirectory: () => real.isDirectory(),
        isFile: () => real.isFile()
      }
    }),
    pathExists: mocks.fsPathExists,
    readFileSync: vi.fn(),
    readdir: vi.fn(async () => ['config']),
    realpath: vi.fn(async (target: string) => target),
    remove: vi.fn(async (target: string) => {
      await mocks.fsRemove(target)
      mocks.removedPaths.add(target)
    }),
    rmdir: vi.fn(async (target: string) => {
      await mocks.fsRemove(target)
      mocks.removedPaths.add(target)
    }),
    writeFile: vi.fn(),
    writeJSON: vi.fn()
  }
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
vi.mock('../../db/utils', () => ({ createDbUtils: mocks.createDbUtils }))
vi.mock('../../hooks/use-electron-guard', () => ({
  useAliveTarget: vi.fn(),
  useAliveWebContents: vi.fn()
}))
vi.mock('../../service/file-watch.service', () => ({ fileWatchService: {} }))
vi.mock('../../service/store-api.service', () => ({
  reportPluginUninstall: mocks.reportPluginUninstall,
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
vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    cleanupNamespace: mocks.tempCleanupNamespace,
    getNamespaceConfig: mocks.tempGetNamespaceConfig,
    inspectNamespace: mocks.tempInspectNamespace,
    registerNamespace: mocks.tempRegisterNamespace
  }
}))

vi.mock('../../utils/secure-store', () => ({
  countSecureStoreValuesByPrefixes: mocks.countSecureStoreValuesByPrefixes,
  deleteSecureStoreValuesByPrefix: mocks.deleteSecureStoreValuesByPrefix,
  deleteSecureStoreValuesByPrefixes: vi.fn(
    async (rootPath: string, prefixes: readonly string[]) => {
      for (const prefix of prefixes) {
        await mocks.deleteSecureStoreValuesByPrefix(rootPath, prefix)
      }
      return prefixes.length
    }
  ),
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
vi.mock('../ai/intelligence-context-execution', () => ({
  intelligenceContextExecutionService: Object.freeze({
    invoke: vi.fn(),
    stream: vi.fn()
  })
}))
vi.mock('./host/plugin-intelligence-host-service', () => ({
  createPluginIntelligenceHostService: () =>
    Object.freeze({
      invoke: vi.fn(),
      listProviderModels: vi.fn()
    })
}))
vi.mock('./host/plugin-intelligence-context-host-service', () => ({
  createPluginIntelligenceContextHostService: () =>
    Object.freeze({
      contextInvoke: vi.fn()
    }),
  validatePluginIntelligenceContextRequest: vi.fn((value) => value),
  validatePluginIntelligenceContextResult: vi.fn((value) => value)
}))
vi.mock('./host/plugin-intelligence-context-stream-capabilities', () => ({
  createPluginIntelligenceContextStreamCapabilities: () =>
    Object.freeze({
      definitions: Object.freeze([Object.freeze({ id: 'intelligence.stream' })])
    })
}))
vi.mock('./host/plugin-intelligence-context-stream-host-service', () => ({
  createPluginIntelligenceContextStreamHostService: () =>
    Object.freeze({
      contextStream: vi.fn()
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
    clearDeclaredPermissions: mocks.permissionClearDeclaredPermissions,
    getStore: mocks.permissionGetStore,
    revokeAll: mocks.permissionRevokeAll
  })
}))
vi.mock('./dev-server-monitor', () => ({
  DevServerHealthMonitor: class {
    removePlugin = mocks.devWatcherRemovePlugin
  }
}))
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
  resolvePluginRuntimeArtifactPath: () => fixturePath('plugin-host.js')
}))
vi.mock('./plugin-content-installer', () => ({ installPluginContentPackageToLocalPlugin: vi.fn() }))
vi.mock('./install-queue', () => ({
  PluginInstallQueue: class {
    enqueue = vi.fn()
    handleConfirmResponse = vi.fn()
  }
}))
vi.mock('./plugin', () => ({
  TouchPlugin: class {
    static setTransport = mocks.setTransport
    static setCapabilities = mocks.setCapabilities
  }
}))
vi.mock('./host/plugin-image-tools-worker-client', () => ({
  createWorkerPluginImageToolsRenderer: () => ({
    inspect: mocks.imageToolsInspect,
    render: mocks.imageToolsRender
  })
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
vi.mock('./providers/local-provider', () => ({
  LocalPluginProvider: class {
    scan = vi.fn(async () => [])
    trackFile = mocks.localProviderTrackFile
    untrackFile = mocks.localProviderUntrackFile
  }
}))
vi.mock('./runtime/plugin-injections', () => ({ usePluginInjections: vi.fn() }))
vi.mock('./runtime/plugin-view-security-profile', () => ({
  resolvePluginViewSecurityProfile: vi.fn()
}))
vi.mock('./runtime/plugin-runtime-repair', () => ({ inspectPluginRuntimeDrift: vi.fn() }))
vi.mock('./runtime/plugin-runtime-tracker', () => ({ pluginRuntimeTracker: {} }))
vi.mock('./sdkapi-hard-cut-gate', () => ({ getPluginSdkHardCutGate: vi.fn() }))
vi.mock('./services/dev-plugin-watcher', () => ({
  DevPluginWatcher: class {
    addPlugin = vi.fn()
    removePlugin = mocks.devWatcherRemovePlugin
    start = vi.fn()
    stop = vi.fn()
  }
}))
vi.mock('./services/plugin-io-service', () => ({
  resolvePluginModuleIoRuntime: mocks.resolvePluginModuleIoRuntime
}))
vi.mock('./services/plugin-manager-orchestrator', () => ({
  buildPluginManagerRuntime: mocks.buildPluginManagerRuntime
}))

import { TouchPlugin } from './plugin'
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
        app: { rootPath: fixturePath('app') },
        file: { dirPath: fixturePath('plugins') }
      }
    ])
  )
}

type PluginUninstallDisposition = {
  confirmation: 'delete-plugin-and-data'
  ordinaryExport: { enabled: false } | { enabled: true }
  portableSecretBackup: { enabled: false } | { enabled: true; password: string }
}

type PluginFixture = ITouchPlugin & {
  getActivationIdentity: ReturnType<typeof vi.fn>
}

interface ActualManagerHarness {
  module: PluginModule
  manager: IPluginManager
  plugin: PluginFixture
  loggerDestroy: ReturnType<typeof vi.fn>
  sqliteClosePlugin: ReturnType<typeof vi.fn>
  sqliteHasPlugin: ReturnType<typeof vi.fn>
}

async function createActualManagerHarness(order: string[] = []): Promise<ActualManagerHarness> {
  const module = new PluginModule()
  module.registerUninstallAuthorityInvalidator(() => {
    order.push('authority-invalidate')
  })
  mocks.devWatcherRemovePlugin.mockImplementation(() => {
    order.push('admission-close')
  })
  const sqliteClosePlugin = vi.fn(async () => {
    order.push('sqlite-close')
    return true
  })
  const sqliteHasPlugin = vi.fn(() => false)
  Reflect.set(module, 'pluginSqliteResources', {
    acquire: vi.fn(),
    closeActivation: vi.fn(async () => false),
    closeAll: vi.fn(async () => undefined),
    closePlugin: sqliteClosePlugin,
    hasActivation: vi.fn(() => false),
    hasPlugin: sqliteHasPlugin
  })
  await initializeModule(module)

  const factory = mocks.getCapturedManagerFactory()
  if (!factory) throw new Error('PluginModule did not expose its real manager factory')
  const manager = factory(fixturePath('plugins'), transport, { broadcastPlugin: vi.fn() }, 42)
  const loggerDestroy = vi.fn(() => {
    order.push('logger-flush')
  })
  const plugin = Object.assign(Object.create(TouchPlugin.prototype), {
    name: 'calendar',
    version: '1.0.0',
    sdkapi: 260215,
    status: PluginStatus.ACTIVE,
    dev: { enable: false },
    declaredPermissions: { required: ['storage.plugin'], optional: [] },
    logger: {
      getManager: () => ({ destroy: loggerDestroy })
    },
    disable: vi.fn(async function (this: ITouchPlugin) {
      order.push('runtime-resource-exit')
      this.status = PluginStatus.DISABLED
      return true
    }),
    getActivationIdentity: vi.fn(() => ({
      name: 'calendar',
      pluginInstanceId: 'calendar-instance',
      activationGeneration: 3,
      key: 'synthetic-key'
    })),
    getConfigPath: vi.fn(() => fixturePath('plugin-data', 'calendar', 'config'))
  }) as PluginFixture
  manager.plugins.set('calendar', plugin)
  manager.enabledPlugins.add('calendar')

  return { module, manager, plugin, loggerDestroy, sqliteClosePlugin, sqliteHasPlugin }
}

async function uninstallWithDisposition(
  manager: IPluginManager,
  disposition: Omit<PluginUninstallDisposition, 'confirmation'>
): Promise<unknown> {
  const plugin = manager.plugins.get('calendar') as PluginFixture | undefined
  if (!plugin) throw new Error('Canonical uninstall fixture is missing')
  const identity = plugin.getActivationIdentity()
  const request: PluginApiUninstallRequest = {
    version: 1,
    plugin: {
      name: identity.name,
      pluginInstanceId: identity.pluginInstanceId,
      activationGeneration: identity.activationGeneration
    },
    disposition: {
      confirmation: 'delete-plugin-and-data',
      ...disposition
    }
  }
  return await manager.uninstallPlugin(request)
}

function expectOnlyTemporaryFilesystemCleanup(): void {
  // Temp cleanup moved to the temp-file service namespace purge, and nothing
  // persistent may be deleted on an aborted uninstall — so the filesystem
  // removal path must not run at all (task-301 lifecycle hardening).
  expect(mocks.tempCleanupNamespace).toHaveBeenCalled()
  expect(mocks.fsRemove).not.toHaveBeenCalled()
}

describe('PluginModule facade', () => {
  beforeEach(() => {
    ensureFixtureDirs()
    mocks.handlers.clear()
    mocks.disposers.splice(0)
    mocks.eventHandlers.clear()
    mocks.manager.plugins.clear()
    Reflect.deleteProperty(mocks.manager, 'pendingPermissionPlugins')
    mocks.manager.getPluginByName.mockReset()
    mocks.manager.enablePlugin.mockReset()
    mocks.manager.reloadPlugin.mockReset()
    mocks.manager.uninstallPlugin.mockReset()
    mocks.resetCapturedManagerFactory()
    mocks.createDbUtils.mockClear()
    mocks.countSecureStoreValuesByPrefixes.mockReset()
    mocks.countSecureStoreValuesByPrefixes.mockResolvedValue(0)
    mocks.removedPaths.clear()
    mocks.symbolicPaths.clear()
    mocks.dbUtils.countPluginData.mockReset()
    mocks.dbUtils.countPluginData.mockResolvedValue(0)
    mocks.dbUtils.deletePluginData.mockReset()
    mocks.dbUtils.deletePluginData.mockResolvedValue(undefined)
    mocks.dbUtils.getPluginData.mockReset()
    mocks.dbUtils.listPluginData.mockReset()
    mocks.dbUtils.listPluginData.mockResolvedValue([])
    mocks.dbUtils.setPluginData.mockReset()
    mocks.dbUtils.setPluginData.mockResolvedValue(undefined)
    mocks.deleteSecureStoreValuesByPrefix.mockReset()
    mocks.deleteSecureStoreValuesByPrefix.mockResolvedValue(true)
    mocks.devWatcherRemovePlugin.mockReset()
    mocks.fsPathExists.mockReset()
    mocks.fsPathExists.mockImplementation(async (target: string) => {
      return !path.basename(target).startsWith('plugin-sdk.sqlite')
    })
    mocks.fsRemove.mockReset()
    mocks.fsRemove.mockResolvedValue(undefined)
    mocks.localProviderTrackFile.mockReset()
    mocks.localProviderUntrackFile.mockReset()
    mocks.permissionClearDeclaredPermissions.mockReset()
    mocks.permissionRevokeAll.mockReset()
    mocks.permissionRevokeAll.mockResolvedValue([])
    mocks.reportPluginUninstall.mockReset()
    mocks.reportPluginUninstall.mockResolvedValue(undefined)
    mocks.tempCleanupNamespace.mockReset()
    mocks.tempCleanupNamespace.mockResolvedValue({
      deletedItemCount: 0,
      deletedByteCount: 0,
      failedItemCount: 0,
      bounded: false,
      cancelled: false
    })
    mocks.tempGetNamespaceConfig.mockReset()
    mocks.tempGetNamespaceConfig.mockReturnValue({ namespace: 'fixture' })
    mocks.tempInspectNamespace.mockReset()
    mocks.tempInspectNamespace.mockResolvedValue({
      itemCount: 0,
      byteCount: 0,
      failedItemCount: 0,
      bounded: false,
      cancelled: false
    })
    mocks.tempRegisterNamespace.mockReset()
    mocks.healthMonitor.destroy.mockReset()
    mocks.plugin.disable.mockReset()
    mocks.plugin.disable.mockResolvedValue(true)
    mocks.plugin.declaredPermissions = {
      required: ['clipboard.read', 'search.root-results', 'storage.plugin'],
      optional: []
    }
    mocks.checkPermission.mockReset()
    mocks.permissionHasPermission.mockReset()
    mocks.permissionGetStore.mockReset()
    mocks.permissionGetStore.mockReturnValue({
      getPluginPermissions: () => [],
      hasPermission: mocks.permissionHasPermission,
      hasSessionPermission: () => false
    })
    mocks.runtimeOptions = null
    mocks.createClient.mockReset()
    mocks.isSecureStoreAvailable.mockReset()
    mocks.setSecureStoreValue.mockReset()
    mocks.transportOn.mockClear()
    mocks.eventBusOn.mockClear()
    mocks.ensureDir.mockReset()
    mocks.ensureDir.mockResolvedValue(undefined)
    mocks.buildPluginManagerRuntime.mockClear()
    mocks.browserWindowFromId.mockReset()
    mocks.dialogShowMessageBox.mockReset()
    mocks.dialogShowSaveDialog.mockReset()
    mocks.dialogShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    mocks.imageToolsInspect.mockReset()
    mocks.imageToolsInspect.mockResolvedValue({ format: 'png', width: 1, height: 1 })
    mocks.imageToolsRender.mockReset()
    mocks.imageToolsRender.mockResolvedValue({ data: Buffer.from('image'), width: 1, height: 1 })
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
    mocks.setCapabilities.mockReset()
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

  afterAll(() => {
    rmSync(FIXTURE_ROOT, { recursive: true, force: true })
  })

  it('does not create the plugin runtime until the hosts backup directory is ready', async () => {
    let releaseHostsBackupDirectory!: () => void
    const hostsBackupDirectoryReady = new Promise<void>((resolve) => {
      releaseHostsBackupDirectory = resolve
    })
    mocks.ensureDir.mockReturnValueOnce(hostsBackupDirectoryReady)

    const initialized = initializeModule(new PluginModule())

    expect(mocks.buildPluginManagerRuntime).not.toHaveBeenCalled()
    expect(mocks.getCapturedManagerFactory()).toBeNull()

    releaseHostsBackupDirectory()

    await expect(initialized).resolves.toBeUndefined()
    expect(mocks.buildPluginManagerRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.getCapturedManagerFactory()).not.toBeNull()
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

  it('awaits SQLite and Temp cleanup for permission revocation without deleting durable data', async () => {
    const module = new PluginModule()
    const closePlugin = vi.fn(async () => true)
    Reflect.set(module, 'pluginSqliteResources', {
      acquire: vi.fn(),
      closeActivation: vi.fn(async () => false),
      closeAll: vi.fn(async () => undefined),
      closePlugin,
      hasActivation: vi.fn(() => false),
      hasPlugin: vi.fn(() => false)
    })

    await initializeModule(module)
    await teardownPluginStorage('calendar')

    expect(closePlugin).toHaveBeenCalledExactlyOnceWith('calendar')
    expect(mocks.tempCleanupNamespace).toHaveBeenCalledOnce()
    expect(mocks.tempInspectNamespace).toHaveBeenCalledOnce()
    expect(mocks.deleteSecureStoreValuesByPrefix).not.toHaveBeenCalled()
    expect(mocks.dbUtils.deletePluginData).not.toHaveBeenCalled()
    expect(mocks.fsRemove).not.toHaveBeenCalled()
  })

  it('continues permission Temp cleanup and exposes only a stable aggregate when SQLite close fails', async () => {
    const module = new PluginModule()
    const closePlugin = vi.fn(async () => {
      throw new Error('native SQLite path /private/plugin-sdk.sqlite')
    })
    Reflect.set(module, 'pluginSqliteResources', {
      acquire: vi.fn(),
      closeActivation: vi.fn(async () => false),
      closeAll: vi.fn(async () => undefined),
      closePlugin,
      hasActivation: vi.fn(() => false),
      hasPlugin: vi.fn(() => true)
    })

    await initializeModule(module)
    const result = await teardownPluginStorage('calendar').catch((error: unknown) => error)

    expect(closePlugin).toHaveBeenCalledExactlyOnceWith('calendar')
    expect(mocks.tempCleanupNamespace).toHaveBeenCalledOnce()
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as Error).message).toBe('PLUGIN_PERMISSION_RESOURCE_TEARDOWN_FAILED')
    expect((result as Error).message).not.toMatch(/private|sqlite path/i)
  })

  it('closes capability-owned SQLite on permission revoke without deleting durable data', async () => {
    const module = new PluginModule()
    const closePlugin = vi.fn(async () => true)
    Reflect.set(module, 'pluginSqliteResources', {
      acquire: vi.fn(),
      closeActivation: vi.fn(async () => false),
      closeAll: vi.fn(async () => undefined),
      closePlugin,
      hasActivation: vi.fn(() => false),
      hasPlugin: vi.fn(() => false)
    })

    await initializeModule(module)
    const permissionRevoked = mocks.eventHandlers.get('permission-revoked')
    if (!permissionRevoked) throw new Error('PluginModule did not subscribe to permission revokes')

    permissionRevoked({ pluginId: 'calendar', permissionIds: ['storage.sqlite'] })
    await vi.waitFor(() => expect(closePlugin).toHaveBeenCalledExactlyOnceWith('calendar'))

    expect(mocks.deleteSecureStoreValuesByPrefix).not.toHaveBeenCalled()
    expect(mocks.dbUtils.deletePluginData).not.toHaveBeenCalled()
    expect(mocks.fsRemove).not.toHaveBeenCalled()
  })

  it('wires the immutable 30-ID global manifest and activation-local capability factories', async () => {
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
    expect(definitions?.map((definition) => definition.id)).not.toContain('intelligence.invoke')
    expect(definitions?.map((definition) => definition.id)).not.toContain(
      'intelligence.context.invoke'
    )
    expect(definitions?.map((definition) => definition.id)).not.toContain('system.invoke')
    expect(Object.isFrozen(definitions)).toBe(true)
    // One call each way, so this covers what nine separate assertions used to. Compared
    // exhaustively rather than field by field: an eleventh capability that the install block
    // forgets fails here as an unexpected shape, not just at the type level.
    expect(mocks.setCapabilities.mock.calls[0]).toEqual([null])
    expect(mocks.setCapabilities).toHaveBeenLastCalledWith({
      snipasteProcess: expect.any(Function),
      systemAction: expect.any(Function),
      browserOpen: expect.any(Function),
      browserData: expect.any(Function),
      translation: expect.any(Function),
      intelligenceContext: expect.any(Function),
      windowManager: expect.any(Function),
      windowPreset: expect.any(Function),
      workspaceScript: expect.any(Function),
      hosts: expect.any(Function),
      vscodeProjects: expect.any(Function),
      orca: expect.any(Function),
      aiSessions: expect.any(Function),
      imageTools: expect.any(Function),
      runtimeService: expect.any(Object)
    })

    const contextFactory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.intelligenceContext as
      | ((activation: {
          name: string
          pluginInstanceId: string
          activationGeneration: number
          key: string
        }) => { definitions: ReadonlyArray<{ id: string }> })
      | undefined
    const intelligenceActivation = Object.freeze({
      name: 'touch-intelligence',
      pluginInstanceId: 'intelligence-instance',
      activationGeneration: 1,
      key: 'intelligence-key'
    })
    expect(contextFactory?.(intelligenceActivation).definitions.map((entry) => entry.id)).toEqual([
      'intelligence.context.invoke',
      'intelligence.stream'
    ])
    expect(() => contextFactory?.({ ...intelligenceActivation, name: 'calendar' })).toThrow(
      'PLUGIN_INTELLIGENCE_CONTEXT_CAPABILITY_INVALID'
    )
    const factories = mocks.setCapabilities.mock.calls.at(-1)?.[0] as Record<string, unknown>
    const classicFactories: ReadonlyArray<readonly [string, string, string]> = [
      ['hosts', 'touch-hosts', 'system.hosts'],
      ['vscodeProjects', 'touch-vscode-projects', 'filesystem.vscode-projects'],
      ['orca', 'touch-orca', 'orchestration.orca'],
      ['aiSessions', 'touch-ai-sessions', 'intelligence.sessions'],
      ['imageTools', 'touch-image', 'media.image-tools']
    ]
    for (const [factoryName, pluginName, capabilityId] of classicFactories) {
      const factory = factories[factoryName]
      expect(factory).toEqual(expect.any(Function))
      const input = Object.freeze({
        name: pluginName,
        pluginInstanceId: `${pluginName}-instance`,
        activationGeneration: 1,
        key: `${pluginName}-key`
      })
      const created = (
        factory as (activation: typeof input) => { definitions: ReadonlyArray<{ id: string }> }
      )(input)
      expect(created.definitions.map((entry) => entry.id)).toContain(capabilityId)
      expect(() =>
        (factory as (activation: typeof input) => unknown)({ ...input, name: 'calendar' })
      ).toThrow('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }

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

  it('returns from a pending native image save dialog when caller abort or permission revocation wins', async () => {
    const activation = {
      name: 'touch-image',
      pluginInstanceId: 'image-tools-instance',
      activationGeneration: 1,
      key: 'image-tools-key'
    }
    let releaseDialog!: (value: { canceled: boolean; filePath?: string }) => void
    const lateDialog = new Promise<{ canceled: boolean; filePath?: string }>((resolve) => {
      releaseDialog = resolve
    })
    mocks.manager.getPluginByName.mockImplementation(() => mocks.plugin)
    mocks.plugin.declaredPermissions = { required: ['fs.read', 'fs.write'], optional: [] }
    mocks.permissionHasPermission.mockReturnValue(true)
    mocks.keyResolveCurrentIdentity.mockReturnValue(activation)
    mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 7 } })
    mocks.browserWindowFromId.mockReturnValue(mocks.mainBrowserWindow)
    mocks.dialogShowSaveDialog.mockImplementation(() => lateDialog)
    const module = new PluginModule()

    try {
      await initializeModule(module)
      const factory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.imageTools as
        | ((value: typeof activation) => {
            definitions: ReadonlyArray<{
              invoke: (
                context: unknown,
                request: unknown,
                signal: AbortSignal,
                resources: unknown
              ) => Promise<unknown>
            }>
            prepareLifecycleQuery(query: unknown): Promise<unknown>
          })
        | undefined
      if (!factory) throw new Error('IMAGE_TOOLS_FACTORY_MISSING')
      const capability = factory(activation)
      const context = issuePluginSecurityContext(activation, 'plugin-host', { hostGeneration: 7 })
      const prepare = async (): Promise<string> => {
        const query = (await capability.prepareLifecycleQuery({
          inputs: [{ type: 'image', content: 'data:image/png;base64,aG9zdA==' }]
        })) as { inputs: Array<{ content: string }> }
        return query.inputs[0]!.content
      }

      const callerAbort = new AbortController()
      const first = capability.definitions[0]!.invoke(
        context,
        { token: await prepare(), format: 'png' },
        callerAbort.signal,
        {}
      )
      await vi.waitFor(() => expect(mocks.dialogShowSaveDialog).toHaveBeenCalledTimes(1))
      callerAbort.abort()
      await expect(first).resolves.toEqual({ status: 'cancelled' })

      const second = capability.definitions[0]!.invoke(
        context,
        { token: await prepare(), format: 'png' },
        new AbortController().signal,
        {}
      )
      await vi.waitFor(() => expect(mocks.dialogShowSaveDialog).toHaveBeenCalledTimes(2))
      const permissionRevoked = mocks.eventHandlers.get('permission-revoked')
      if (!permissionRevoked) throw new Error('PERMISSION_REVOKED_HANDLER_MISSING')
      permissionRevoked({ pluginId: 'touch-image', permissionIds: ['fs.write'] })
      await expect(second).resolves.toEqual({ status: 'cancelled' })
    } finally {
      releaseDialog({ canceled: true })
      await module.onDestroy()
    }
  })
  it('opens a factory-issued VS Code token through the fixed macOS launcher argv', async () => {
    const home = fixturePath('vscode-home')
    const userData = fixturePath('vscode-user-data')
    const project = fixturePath('vscode-project')
    const storage = path.join(
      home,
      'Library',
      'Application Support',
      'Code',
      'User',
      'globalStorage',
      'storage.json'
    )
    mkdirSync(path.dirname(storage), { recursive: true })
    mkdirSync(project, { recursive: true })
    mkdirSync(userData, { recursive: true })
    writeFileSync(
      storage,
      JSON.stringify({ openedPathsList: { workspaces3: [{ folderUri: `file://${project}` }] } })
    )
    const originalGetPath = vi.mocked(app.getPath).getMockImplementation()
    const previousPlatform = process.platform
    const child = {
      kill: vi.fn(),
      once: vi.fn((event: string, callback: (code: number) => void) => {
        if (event === 'exit') queueMicrotask(() => callback(0))
        return child
      })
    }
    const spawnSpy = vi.spyOn(safeShell, 'spawnSafe').mockReturnValue(child as never)
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    vi.mocked(app.getPath).mockImplementation((name) =>
      name === 'home' ? home : name === 'userData' ? userData : '/Users/test-owner'
    )
    mocks.manager.getPluginByName.mockImplementation(() => mocks.plugin)
    mocks.plugin.declaredPermissions = {
      required: ['fs.read', 'fs.index', 'system.shell'],
      optional: []
    }
    mocks.permissionHasPermission.mockReturnValue(true)
    mocks.keyResolveCurrentIdentity.mockReturnValue({
      name: 'touch-vscode-projects',
      pluginInstanceId: 'vscode-instance',
      activationGeneration: 1,
      key: 'vscode-key'
    })
    mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 7 } })
    const module = new PluginModule()
    try {
      await initializeModule(module)
      const factory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.vscodeProjects as
        | ((activation: {
            name: string
            pluginInstanceId: string
            activationGeneration: number
            key: string
          }) => {
            definitions: ReadonlyArray<{
              invoke: (
                context: unknown,
                request: unknown,
                signal: AbortSignal,
                resources: unknown
              ) => unknown
            }>
          })
        | undefined
      expect(factory).toEqual(expect.any(Function))
      const input = {
        name: 'touch-vscode-projects',
        pluginInstanceId: 'vscode-instance',
        activationGeneration: 1,
        key: 'vscode-key'
      }
      const capability = factory!(input)
      const definition = capability.definitions[0]!
      const context = issuePluginSecurityContext(input, 'plugin-host', { hostGeneration: 7 })
      const listed = (await definition.invoke(
        context,
        { operation: 'list' },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )) as unknown as PluginVscodeProjectsSnapshot
      const token = listed.status === 'ready' ? listed.projects[0]?.token : undefined
      expect(token).toEqual(expect.any(String))
      const opened = await definition.invoke(
        context,
        { operation: 'open', token },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )
      expect(opened).toEqual({ status: 'started' })
      expect(spawnSpy).toHaveBeenCalledWith(
        '/usr/bin/open',
        ['-a', 'Visual Studio Code', '--args', '--', project],
        { shell: false, stdio: 'ignore', windowsHide: true }
      )
      expect(spawnSpy.mock.calls[0]?.[2]).not.toHaveProperty('target')
    } finally {
      await module.onDestroy()
      if (originalGetPath) vi.mocked(app.getPath).mockImplementation(originalGetPath)
      else vi.mocked(app.getPath).mockReset()
      Object.defineProperty(process, 'platform', { value: previousPlatform, configurable: true })
      spawnSpy.mockRestore()
    }
  })

  it('launches an Insiders token on Windows after spawn without waiting for the GUI to exit', async () => {
    const home = 'C:\\vscode-home'
    const appData = 'C:\\vscode-appdata'
    const project = 'C:/vscode-insiders-project'
    const storage = path.win32.join(
      appData,
      'Code - Insiders',
      'User',
      'globalStorage',
      'storage.json'
    )
    const localAppData = 'C:\\Users\\owner\\AppData\\Local'
    const executable = path.win32.join(
      localAppData,
      'Programs',
      'Microsoft VS Code Insiders',
      'Code - Insiders.exe'
    )
    const storageContent = JSON.stringify({
      openedPathsList: { workspaces3: [{ folderUri: project }] }
    })
    const storageStats = {
      dev: 11,
      ino: 12,
      size: Buffer.byteLength(storageContent, 'utf8'),
      isFile: () => true,
      isSymbolicLink: () => false
    }
    const projectStats = {
      dev: 21,
      ino: 22,
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false
    }
    const originalGetPath = vi.mocked(app.getPath).getMockImplementation()
    const previousPlatform = process.platform
    const previousLocalAppData = process.env.LOCALAPPDATA
    const originalLstat = vi.mocked(fse.lstat).getMockImplementation()
    const originalRealpath = vi.mocked(fse.realpath).getMockImplementation()
    const originalStat = vi.mocked(fse.stat).getMockImplementation()
    const child = {
      kill: vi.fn(),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'spawn') queueMicrotask(callback)
        return child
      })
    }
    const spawnSpy = vi.spyOn(safeShell, 'spawnSafe').mockReturnValue(child as never)
    mocks.manager.getPluginByName.mockImplementation(() => mocks.plugin)
    mocks.plugin.declaredPermissions = {
      required: ['fs.read', 'fs.index', 'system.shell'],
      optional: []
    }
    mocks.permissionHasPermission.mockReturnValue(true)
    mocks.keyResolveCurrentIdentity.mockReturnValue({
      name: 'touch-vscode-projects',
      pluginInstanceId: 'vscode-instance',
      activationGeneration: 1,
      key: 'vscode-key'
    })
    mocks.runtimeResolve.mockReturnValue({ owner: { hostGeneration: 7 } })
    const module = new PluginModule()
    try {
      await initializeModule(module)
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      process.env.LOCALAPPDATA = localAppData
      vi.mocked(app.getPath).mockImplementation((name) =>
        name === 'home'
          ? home
          : name === 'appData'
            ? appData
            : name === 'temp'
              ? 'C:\\temp'
              : name === 'userData'
                ? '/Users/test-owner'
                : 'C:\\app'
      )
      mocks.vscodeFilesystem.lstat.mockImplementation(async (target: string) => {
        if (target === storage) return storageStats
        if (target === project) return projectStats
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      mocks.vscodeFilesystem.open.mockImplementation(async (target: string) => {
        if (target !== storage) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        return {
          close: async () => undefined,
          readFile: async () => storageContent,
          stat: async () => storageStats
        }
      })
      mocks.vscodeFilesystem.realpath.mockImplementation(async (target: string) => target)
      mocks.vscodeFilesystem.stat.mockImplementation(async (target: string) => {
        if (target === project) return projectStats
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      vi.mocked(fse.lstat).mockImplementation(async () => projectStats as never)
      vi.mocked(fse.realpath).mockImplementation(async () => project)
      vi.mocked(fse.stat).mockImplementation(async () => projectStats as never)
      const factory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.vscodeProjects as
        | ((activation: {
            name: string
            pluginInstanceId: string
            activationGeneration: number
            key: string
          }) => {
            definitions: ReadonlyArray<{
              invoke: (
                context: unknown,
                request: unknown,
                signal: AbortSignal,
                resources: unknown
              ) => unknown
            }>
          })
        | undefined
      const input = {
        name: 'touch-vscode-projects',
        pluginInstanceId: 'vscode-instance',
        activationGeneration: 1,
        key: 'vscode-key'
      }
      const capability = factory!(input)
      const definition = capability.definitions[0]!
      const context = issuePluginSecurityContext(input, 'plugin-host', { hostGeneration: 7 })
      const listed = (await definition.invoke(
        context,
        { operation: 'list' },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )) as unknown as PluginVscodeProjectsSnapshot
      expect(listed).toMatchObject({
        status: 'ready',
        projects: [{ label: 'vscode-insiders-project', kind: 'folder' }]
      })
      const token = listed.status === 'ready' ? listed.projects[0]?.token : undefined
      const opened = await definition.invoke(
        context,
        { operation: 'open', token },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )
      expect(opened).toEqual({ status: 'started' })
      expect(spawnSpy).toHaveBeenCalledWith(executable, ['--', project], {
        shell: false,
        stdio: 'ignore',
        windowsHide: true
      })
    } finally {
      mocks.vscodeFilesystem.restore()
      if (originalGetPath) vi.mocked(app.getPath).mockImplementation(originalGetPath)
      else vi.mocked(app.getPath).mockReset()
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA
      else process.env.LOCALAPPDATA = previousLocalAppData
      Object.defineProperty(process, 'platform', { value: previousPlatform, configurable: true })
      if (originalLstat) vi.mocked(fse.lstat).mockImplementation(originalLstat)
      else vi.mocked(fse.lstat).mockReset()
      if (originalRealpath) vi.mocked(fse.realpath).mockImplementation(originalRealpath)
      else vi.mocked(fse.realpath).mockReset()
      if (originalStat) vi.mocked(fse.stat).mockImplementation(originalStat)
      else vi.mocked(fse.stat).mockReset()
      spawnSpy.mockRestore()
      await module.onDestroy()
    }
  })

  it('parents destructive confirmation only to the configured live CoreApp window', async () => {
    // restart/shutdown are supported on darwin and win32 only, so on a Linux
    // runner the capability short-circuits to 'platform-unsupported' and the
    // confirmation path this test covers is never reached. Pinned narrowly --
    // process.platform is read per call here, so the scope is this test alone.
    const previousPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
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
      const factory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.systemAction as
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
    } finally {
      Object.defineProperty(process, 'platform', { value: previousPlatform, configurable: true })
    }
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
    const factory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.systemAction as
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
    const factory = mocks.setCapabilities.mock.calls.at(-1)?.[0]?.systemAction as
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
      fixturePath('app'),
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

  it('reports an incomplete plugin disable while still running module cleanup', async () => {
    const module = new PluginModule()
    mocks.manager.plugins.set('calendar', mocks.plugin)
    mocks.plugin.disable.mockResolvedValueOnce(false)
    await initializeModule(module)

    await expect(module.onDestroy()).rejects.toThrow('PLUGIN_MODULE_CLEANUP_FAILED')

    expect(mocks.plugin.disable).toHaveBeenCalledOnce()
    expect(mocks.runtimeDispose).toHaveBeenCalledOnce()
    expect(mocks.healthMonitor.destroy).toHaveBeenCalledOnce()
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
    // Teardown is one call now, so nine assertions collapse into the one that actually matters:
    // whatever was installed is cleared, whether that is ten capabilities or eleven.
    expect(mocks.setCapabilities).toHaveBeenLastCalledWith(null)
    expect(mocks.setTransport).toHaveBeenLastCalledWith(null)
    expect(mocks.healthMonitor.destroy).toHaveBeenCalledOnce()
    expect(mocks.stopUpdateScheduler).toHaveBeenCalledOnce()
  })

  it('passes the exact uninstall identity and disposition through the typed handler', async () => {
    const module = new PluginModule()
    const request: PluginApiUninstallRequest = {
      version: 1,
      plugin: {
        name: 'calendar',
        pluginInstanceId: 'calendar-instance',
        activationGeneration: 3
      },
      disposition: {
        confirmation: 'delete-plugin-and-data',
        ordinaryExport: { enabled: false },
        portableSecretBackup: { enabled: false }
      }
    }
    const result = {
      version: 1,
      success: true,
      status: 'completed',
      code: 'PLUGIN_UNINSTALL_COMPLETED',
      retryable: false,
      installed: false,
      stages: [
        {
          stage: 'verification',
          status: 'completed',
          code: 'PLUGIN_UNINSTALL_VERIFIED',
          retryable: false
        }
      ]
    }
    mocks.manager.uninstallPlugin.mockResolvedValue(result)
    await initializeModule(module)
    await module.start()

    await expect(invokeTransportHandler(PluginEvents.api.uninstall, request, {})).resolves.toEqual(
      result
    )
    expect(mocks.manager.uninstallPlugin).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('rejects a host uninstall request for the privileged hosts plugin before the manager', async () => {
    const module = new PluginModule()
    const request: PluginApiUninstallRequest = {
      version: 1,
      plugin: {
        name: 'touch-hosts',
        pluginInstanceId: 'hosts-instance',
        activationGeneration: 3
      },
      disposition: {
        confirmation: 'delete-plugin-and-data',
        ordinaryExport: { enabled: false },
        portableSecretBackup: { enabled: false }
      }
    }
    await initializeModule(module)
    await module.start()

    await expect(invokeTransportHandler(PluginEvents.api.uninstall, request, {})).rejects.toThrow(
      'PRIVILEGED_PLUGIN_UNINSTALL_DENIED'
    )
    expect(mocks.manager.uninstallPlugin).not.toHaveBeenCalled()
  })

  it('rejects plugin callers before uninstall owner resolution', async () => {
    const module = new PluginModule()
    const request: PluginApiUninstallRequest = {
      version: 1,
      plugin: {
        name: 'calendar',
        pluginInstanceId: 'calendar-instance',
        activationGeneration: 3
      },
      disposition: {
        confirmation: 'delete-plugin-and-data',
        ordinaryExport: { enabled: false },
        portableSecretBackup: { enabled: false }
      }
    }
    await initializeModule(module)
    await module.start()

    await expect(
      invokeTransportHandler(PluginEvents.api.uninstall, request, {
        plugin: createTrustedTestPluginContext({
          name: 'calendar',
          pluginInstanceId: 'calendar-instance',
          activationGeneration: 3,
          uniqueKey: 'calendar-key'
        })
      })
    ).rejects.toThrow('PLUGIN_UNINSTALL_HOST_ONLY')
    expect(mocks.manager.uninstallPlugin).not.toHaveBeenCalled()
  })

  it('rejects legacy or hostile uninstall payloads at the main transport boundary', async () => {
    const module = new PluginModule()
    await initializeModule(module)
    await module.start()

    await expect(
      invokeTransportHandler(PluginEvents.api.uninstall, { name: 'calendar' }, {})
    ).rejects.toThrow('PLUGIN_UNINSTALL_REQUEST_INVALID')
    await expect(
      invokeTransportHandler(
        PluginEvents.api.uninstall,
        Object.defineProperty({}, 'version', {
          enumerable: true,
          get: () => 1
        }),
        {}
      )
    ).rejects.toThrow('PLUGIN_UNINSTALL_REQUEST_INVALID')
    expect(mocks.manager.uninstallPlugin).not.toHaveBeenCalled()
  })

  it('does not turn a retryable aggregate uninstall failure into success', async () => {
    const module = new PluginModule()
    const result = {
      version: 1,
      success: false,
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED',
      retryable: true,
      installed: true,
      stages: [
        {
          stage: 'secret-backup',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_SECRET_BACKUP_FAILED',
          retryable: true
        },
        {
          stage: 'sqlite',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_SQLITE_CLOSE_FAILED',
          retryable: true
        }
      ]
    }
    mocks.manager.uninstallPlugin.mockResolvedValue(result)
    await initializeModule(module)
    await module.start()

    const response = await invokeTransportHandler(
      PluginEvents.api.uninstall,
      {
        version: 1,
        plugin: {
          name: 'calendar',
          pluginInstanceId: 'calendar-instance',
          activationGeneration: 3
        },
        disposition: {
          confirmation: 'delete-plugin-and-data',
          ordinaryExport: { enabled: false },
          portableSecretBackup: { enabled: false }
        }
      },
      {}
    )

    expect(response).toEqual(result)
    expect(JSON.stringify(response)).not.toMatch(
      /(?:synthetic-secret|private\/|params|stack|SELECT|DELETE\s+FROM)/i
    )
  })

  it('keeps disable non-destructive while closing active runtime and SQLite resources', async () => {
    const { manager, plugin, loggerDestroy, sqliteClosePlugin } = await createActualManagerHarness()

    await expect(manager.disablePlugin('calendar')).resolves.toBe(true)

    expect(plugin.disable).toHaveBeenCalledOnce()
    expect(sqliteClosePlugin).toHaveBeenCalledWith('calendar')
    expect(loggerDestroy).not.toHaveBeenCalled()
    expect(mocks.deleteSecureStoreValuesByPrefix).not.toHaveBeenCalled()
    expect(mocks.dbUtils.deletePluginData).not.toHaveBeenCalled()
    expect(mocks.fsRemove).not.toHaveBeenCalled()
    expect(mocks.permissionRevokeAll).not.toHaveBeenCalled()
    expect(manager.plugins.get('calendar')).toBe(plugin)
  })

  it('orders uninstall barriers before destructive cleanup and removes code last', async () => {
    const order: string[] = []
    const { manager, sqliteClosePlugin } = await createActualManagerHarness(order)
    mocks.deleteSecureStoreValuesByPrefix.mockImplementation(async (_root, prefix: string) => {
      order.push(prefix.startsWith('plugin.v2.') ? 'secret-v2' : 'secret-legacy')
      return true
    })
    mocks.permissionRevokeAll.mockImplementation(async () => {
      order.push('permission-revoke-all')
      return ['storage.plugin']
    })
    transport.broadcast.mockImplementation((event: unknown, payload: unknown) => {
      if (
        event === PluginEvents.push.stateChanged &&
        typeof payload === 'object' &&
        payload !== null &&
        Reflect.get(payload, 'type') === 'removed'
      ) {
        order.push('finalize')
      }
    })
    mocks.reportPluginUninstall.mockImplementation(async () => {
      order.push('analytics-uninstall-report')
    })
    mocks.fsRemove.mockImplementation(async (rawTarget: string) => {
      // A quarantined directory is deleted under its .recovery name; map it
      // back so these labels still describe what was removed.
      const target = mocks.renamedPaths.get(rawTarget) ?? rawTarget
      if (target === fixturePath('plugin-data', 'calendar', 'cache')) order.push('cache-remove')
      else if (target === fixturePath('plugin-data', 'calendar', 'temp')) order.push('temp-remove')
      else if (target === fixturePath('plugin-data', 'calendar')) order.push('data-root-remove')
      else if (target.startsWith(`${fixturePath('plugin-data', 'calendar')}/`))
        order.push('data-remove')
      else if (target === fixturePath('plugins', 'calendar')) order.push('code-remove')
    })
    mocks.tempCleanupNamespace.mockImplementation(async () => {
      order.push('temp-namespace-purge')
      // Preserve the shape the coordinator expects; only the ordering is new.
      return {
        deletedItemCount: 0,
        deletedByteCount: 0,
        failedItemCount: 0,
        bounded: false,
        cancelled: false
      }
    })
    mocks.dbUtils.deletePluginData.mockImplementation(async () => {
      order.push('plugin-row-remove')
    })
    mocks.dbUtils.countPluginData.mockImplementation(async () => {
      order.push('residual-verification')
      return 0
    })

    await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(sqliteClosePlugin).toHaveBeenCalledExactlyOnceWith('calendar')
    expect(order).toEqual([
      'admission-close',
      'runtime-resource-exit',
      'logger-flush',
      'temp-namespace-purge',
      'sqlite-close',
      'permission-revoke-all',
      'authority-invalidate',
      'secret-legacy',
      'secret-v2',
      // Cache and data are no longer deleted piecemeal: the data root is
      // quarantined and removed whole (task-301 lifecycle hardening).
      'data-root-remove',
      'plugin-row-remove',
      'code-remove',
      'residual-verification',
      'finalize',
      'analytics-uninstall-report'
    ])
  })

  it('awaits logger final flush before SQLite and filesystem teardown', async () => {
    const { manager, loggerDestroy } = await createActualManagerHarness()
    let releaseLogger: (() => void) | undefined
    loggerDestroy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseLogger = resolve
        })
    )

    const uninstalling = uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })
    await vi.waitFor(() => expect(loggerDestroy).toHaveBeenCalledOnce())

    expect(mocks.fsRemove).not.toHaveBeenCalled()
    releaseLogger?.()
    await uninstalling
  })

  it('treats ordinary export cancellation as retryable and leaves the stopped plugin installed', async () => {
    const { manager, plugin } = await createActualManagerHarness()

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: true },
      portableSecretBackup: { enabled: false }
    })

    expect(mocks.dialogShowSaveDialog).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      version: 1,
      success: false,
      status: 'cancelled',
      code: 'PLUGIN_UNINSTALL_CANCELLED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'ordinary-export',
          status: 'cancelled',
          code: 'PLUGIN_UNINSTALL_ORDINARY_EXPORT_CANCELLED',
          retryable: true
        })
      ])
    })
    expect(manager.plugins.get('calendar')).toBe(plugin)
    expectOnlyTemporaryFilesystemCleanup()
    expect(mocks.dbUtils.deletePluginData).not.toHaveBeenCalled()
  })

  it('blocks activation, reload, load, and install while cancelled uninstall owns retry', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: true },
      portableSecretBackup: { enabled: false }
    })
    expect(result).toMatchObject({ success: false, status: 'cancelled', installed: true })

    await expect(manager.enablePlugin('calendar')).resolves.toBe(false)
    await expect(manager.loadPlugin('calendar')).resolves.toBe(false)
    await expect(manager.reloadPlugin('calendar')).resolves.toBeUndefined()
    await expect(manager.installFromSource({ source: fixturePath('update.tpex') })).rejects.toThrow(
      'PLUGIN_UNINSTALL_INCOMPLETE'
    )
    expect(manager.setActivePlugin('calendar')).toBe(false)
    expect(plugin.disable).toHaveBeenCalledOnce()
    expect(manager.plugins.get('calendar')).toBe(plugin)
  })

  it('treats encrypted Secret backup with no allowlisted entries as stable no-data', async () => {
    const { manager } = await createActualManagerHarness()

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: {
        enabled: true,
        password: 'correct horse battery staple'
      }
    })

    expect(result).toMatchObject({
      version: 1,
      success: true,
      status: 'completed',
      code: 'PLUGIN_UNINSTALL_COMPLETED',
      retryable: false,
      installed: false,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'secret-backup',
          status: 'skipped',
          code: 'PLUGIN_UNINSTALL_SECRET_BACKUP_NO_DATA',
          retryable: false
        })
      ])
    })
    expect(mocks.dialogShowSaveDialog).not.toHaveBeenCalled()
  })

  it('blocks deletion when requested backup finds only non-portable plugin Secrets', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    mocks.countSecureStoreValuesByPrefixes.mockResolvedValue(1)

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: {
        enabled: true,
        password: 'correct horse battery staple'
      }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_EXPORT_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'secret-backup',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_SECRET_BACKUP_FAILED',
          retryable: true
        })
      ])
    })
    expect(manager.plugins.get('calendar')).toBe(plugin)
    expect(mocks.deleteSecureStoreValuesByPrefix).not.toHaveBeenCalled()
    expectOnlyTemporaryFilesystemCleanup()
    expect(JSON.stringify(result)).not.toMatch(/catalog|prefix|correct horse|native/i)
  })

  it('retains retry ownership when one Secret namespace purge fails', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    mocks.deleteSecureStoreValuesByPrefix
      .mockRejectedValueOnce(new Error('synthetic Secret store failure'))
      .mockResolvedValue(true)

    const first = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })
    const ownerRetained = manager.plugins.get('calendar') === plugin
    const retry = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect({ first, ownerRetained, retry }).toMatchObject({
      first: {
        version: 1,
        success: false,
        status: 'failed',
        retryable: true,
        installed: true,
        stages: expect.arrayContaining([
          expect.objectContaining({
            stage: 'secrets',
            status: 'failed',
            code: 'PLUGIN_UNINSTALL_SECRET_PURGE_FAILED'
          })
        ])
      },
      ownerRetained: true,
      retry: { version: 1, success: true, status: 'completed', installed: false }
    })
  })

  it('returns a stable runtime failure without starting destructive cleanup', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    vi.mocked(plugin.disable).mockResolvedValueOnce(false)

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'runtime',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_RUNTIME_TEARDOWN_FAILED'
        })
      ])
    })
    expectOnlyTemporaryFilesystemCleanup()
    expect(mocks.deleteSecureStoreValuesByPrefix).not.toHaveBeenCalled()
  })

  it('redacts logger close failure and performs no persistent deletion', async () => {
    const { manager, loggerDestroy } = await createActualManagerHarness()
    loggerDestroy.mockImplementationOnce(() => {
      throw new Error('synthetic logger native failure')
    })

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      code: 'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'logger',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_LOGGER_CLOSE_FAILED'
        })
      ])
    })
    expect(JSON.stringify(result)).not.toContain('synthetic logger native failure')
    expectOnlyTemporaryFilesystemCleanup()
  })

  it('projects SQLite close failure without leaking the native rejection', async () => {
    const { manager, sqliteClosePlugin } = await createActualManagerHarness()
    sqliteClosePlugin.mockRejectedValueOnce(new Error('synthetic SQLite native failure'))

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      code: 'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'sqlite',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_SQLITE_CLOSE_FAILED'
        })
      ])
    })
    expect(JSON.stringify(result)).not.toContain('synthetic SQLite native failure')
    expectOnlyTemporaryFilesystemCleanup()
  })

  it('fails closed when any plugin SQLite owner remains after close', async () => {
    const { manager, sqliteHasPlugin } = await createActualManagerHarness()
    sqliteHasPlugin.mockReturnValue(true)

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      code: 'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'sqlite',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_SQLITE_RESIDUAL'
        })
      ])
    })
    expectOnlyTemporaryFilesystemCleanup()
    expect(mocks.dbUtils.deletePluginData).not.toHaveBeenCalled()
  })

  it('blocks deletion when committed permission revocation fails', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    mocks.permissionRevokeAll.mockRejectedValueOnce(new Error('synthetic permission failure'))

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      code: 'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'permissions',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_PERMISSION_REVOKE_FAILED'
        })
      ])
    })
    expect(manager.plugins.get('calendar')).toBe(plugin)
    expect(mocks.deleteSecureStoreValuesByPrefix).not.toHaveBeenCalled()
    expectOnlyTemporaryFilesystemCleanup()
  })

  it('refuses a symlinked plugin code owner and never follows it during uninstall', async () => {
    const { manager } = await createActualManagerHarness()
    // A real symlink, not a mock flag: captureDirectoryIdentity stats the disk, so a flag the
    // lstat mock knows about is invisible to it. Refusal therefore happens at the admission
    // barrier rather than at the code stage — stricter than the old expectation, and the
    // property the test name claims ("never follows it") holds more strongly.
    const owner = fixturePath('plugins', 'calendar')
    const decoy = fixturePath('plugins', 'calendar-decoy')
    rmSync(owner, { recursive: true, force: true })
    mkdirSync(decoy, { recursive: true })
    symlinkSync(decoy, owner)
    onTestFinished(() => {
      rmSync(owner, { recursive: true, force: true })
      rmSync(decoy, { recursive: true, force: true })
      mkdirSync(owner, { recursive: true })
    })

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_TEARDOWN_FAILED',
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({ stage: 'admission', status: 'failed' })
      ])
    })
    expect(mocks.fsRemove).not.toHaveBeenCalledWith(fixturePath('plugins', 'calendar'))
    expect(mocks.reportPluginUninstall).not.toHaveBeenCalled()
  })

  // 'data' is deliberately absent. Instrumenting fse.remove shows the uninstall only ever
  // deletes two quarantined roots — `plugin-data/<name>.…recovery` and `plugins/<name>.…recovery`.
  // The data root is never renamed or removed under this fixture, so a data-stage delete failure
  // cannot be constructed here and a test for it would assert against a no-op.
  it.each([
    ['code', 'PLUGIN_UNINSTALL_CODE_DELETE_FAILED'],
    ['plugin-data', 'PLUGIN_UNINSTALL_PLUGIN_DATA_DELETE_FAILED']
  ] as const)(
    'reports %s deletion failure after attempting later safe cleanup stages',
    async (failedStage, code) => {
      const { manager } = await createActualManagerHarness()
      if (failedStage === 'code') {
        mocks.fsRemove.mockImplementation(async (target: string) => {
          // The coordinator quarantines the owner by renaming it to `.recovery` and deletes
          // that name, so matching the pre-rename path never fires. Resolve back through the
          // rename bookkeeping before deciding whether to inject.
          // The owner is quarantined to a `.recovery` name before deletion, so matching the
          // pre-rename path never fires. Resolve back through the rename bookkeeping first.
          const original = mocks.renamedPaths.get(target) ?? target
          if (original === fixturePath('plugins', 'calendar')) {
            throw new Error(`synthetic ${failedStage} delete failure`)
          }
        })
      } else {
        mocks.dbUtils.deletePluginData.mockRejectedValueOnce(
          new Error('synthetic plugin row delete failure')
        )
      }

      const result = await uninstallWithDisposition(manager, {
        ordinaryExport: { enabled: false },
        portableSecretBackup: { enabled: false }
      })

      expect(mocks.fsRemove).toHaveBeenCalledTimes(failedStage === 'plugin-data' ? 1 : 2)
      expect(mocks.dbUtils.deletePluginData).toHaveBeenCalledWith('calendar')
      expect(manager.plugins.has('calendar')).toBe(true)
      expect(result).toMatchObject({
        version: 1,
        success: false,
        status: 'failed',
        code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED',
        retryable: true,
        installed: true,
        stages: expect.arrayContaining([
          expect.objectContaining({ stage: failedStage, status: 'failed', code })
        ])
      })
      expect(JSON.stringify(result)).not.toContain('synthetic')
      expect(mocks.reportPluginUninstall).not.toHaveBeenCalled()
    }
  )

  it('retains code and retry owner when enabled-state persistence fails', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    mocks.dbUtils.setPluginData.mockRejectedValueOnce(
      new Error('synthetic enabled-state persistence failure')
    )

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      success: false,
      code: 'PLUGIN_UNINSTALL_CLEANUP_FAILED',
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'plugin-data',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_PLUGIN_DATA_DELETE_FAILED'
        })
      ])
    })
    expect(mocks.fsRemove).not.toHaveBeenCalledWith(fixturePath('plugins', 'calendar'))
    expect(manager.plugins.get('calendar')).toBe(plugin)
    expect(mocks.reportPluginUninstall).not.toHaveBeenCalled()
  })

  it('fails residual verification and retains the stopped owner for retry', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    mocks.dbUtils.countPluginData.mockResolvedValueOnce(1)
    const pending = (
      manager as IPluginManager & {
        pendingPermissionPlugins: Map<string, { pluginName: string; autoRetry: boolean }>
      }
    ).pendingPermissionPlugins
    pending.set('calendar', { pluginName: 'calendar', autoRetry: true })

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(result).toMatchObject({
      version: 1,
      success: false,
      status: 'failed',
      code: 'PLUGIN_UNINSTALL_VERIFICATION_FAILED',
      retryable: true,
      installed: true,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'verification',
          status: 'failed',
          code: 'PLUGIN_UNINSTALL_RESIDUALS_FOUND'
        })
      ])
    })
    expect(manager.plugins.get('calendar')).toBe(plugin)
    expect(pending.has('calendar')).toBe(false)
  })

  it('proves successful uninstall clears exact owner surfaces and pending authority', async () => {
    const { manager, plugin } = await createActualManagerHarness()
    const existing = new Set([
      fixturePath('plugins', 'calendar'),
      fixturePath('plugin-data', 'calendar')
    ])
    // Owners are quarantined to a `.recovery` name before deletion, so both the existence
    // probe and the delete arrive under the renamed path. Resolve back, or the set looks
    // untouched and the test reads as "nothing was deleted".
    const resolveOwner = (target: string) => mocks.renamedPaths.get(target) ?? target
    mocks.fsPathExists.mockImplementation(async (target: string) =>
      existing.has(resolveOwner(target))
    )
    mocks.fsRemove.mockImplementation(async (target: string) => {
      existing.delete(resolveOwner(target))
    })
    const pending = (
      manager as IPluginManager & {
        pendingPermissionPlugins: Map<string, { pluginName: string; autoRetry: boolean }>
      }
    ).pendingPermissionPlugins
    pending.set('calendar', { pluginName: 'calendar', autoRetry: true })

    const result = await uninstallWithDisposition(manager, {
      ordinaryExport: { enabled: false },
      portableSecretBackup: { enabled: false }
    })

    expect(plugin.getActivationIdentity).toHaveBeenCalled()
    expect(mocks.deleteSecureStoreValuesByPrefix).toHaveBeenCalledTimes(2)
    expect(mocks.dbUtils.deletePluginData).toHaveBeenCalledWith('calendar')
    expect(existing).toEqual(new Set())
    expect(pending.has('calendar')).toBe(false)
    expect(mocks.reportPluginUninstall).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      version: 1,
      success: true,
      status: 'completed',
      code: 'PLUGIN_UNINSTALL_COMPLETED',
      retryable: false,
      installed: false,
      stages: expect.arrayContaining([
        expect.objectContaining({
          stage: 'verification',
          status: 'completed',
          code: 'PLUGIN_UNINSTALL_VERIFIED',
          retryable: false
        })
      ])
    })
  })
})
