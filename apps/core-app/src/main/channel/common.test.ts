import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppEvents, PlatformEvents, PluginEvents } from '@talex-touch/utils/transport/events'

const {
  fsReadFileMock,
  execFileMock,
  loggerWarnMock,
  perfDisposeMock,
  getTuffTransportMainMock,
  deviceIdleGetSettingsMock,
  deviceIdleUpdateSettingsMock,
  deviceIdleCanRunMock,
  activeAppGetActiveAppMock,
  tempFileCreateFileMock,
  tempFileDeleteFileMock,
  tempFileRegisterNamespaceMock,
  platformCapabilityListMock,
  getActiveAppCapabilityPatchMock,
  getSelectionCaptureCapabilityPatchMock,
  getAutoPasteCapabilityPatchMock,
  getNativeShareCapabilityPatchMock,
  getPermissionDeepLinkCapabilityPatchMock,
  getEverythingCapabilityPatchMock,
  getTuffCliCapabilityPatchMock,
  indexedRuntimeGetDiagnosticsMock,
  indexedRuntimeResetSourceRuntimeStateMock,
  indexedRuntimeReconcileSourceMock,
  indexedRuntimeScanSourceMock,
  pluginManagerPluginsMock,
  boxItemManagerHandleSyncRequestMock,
  setLocaleMock,
  touchEventBusEmitMock,
  getMainConfigMock,
  saveMainConfigMock
} = vi.hoisted(() => ({
  fsReadFileMock: vi.fn(),
  execFileMock: vi.fn(
    (
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout?: string, stderr?: string) => void
    ) => {
      callback(Object.assign(new Error('command not found'), { code: 'ENOENT' }))
    }
  ),
  loggerWarnMock: vi.fn(),
  perfDisposeMock: vi.fn(),
  getTuffTransportMainMock: vi.fn<(channel?: unknown, keyManager?: unknown) => unknown>(() => null),
  setLocaleMock: vi.fn(),
  touchEventBusEmitMock: vi.fn(),
  deviceIdleGetSettingsMock: vi.fn(),
  deviceIdleUpdateSettingsMock: vi.fn(),
  deviceIdleCanRunMock: vi.fn(),
  activeAppGetActiveAppMock: vi.fn<(forceRefresh?: unknown) => Promise<unknown>>(),
  tempFileCreateFileMock: vi.fn(),
  tempFileDeleteFileMock: vi.fn(),
  tempFileRegisterNamespaceMock: vi.fn(),
  platformCapabilityListMock: vi.fn<() => Array<Record<string, unknown>>>(() => []),
  getActiveAppCapabilityPatchMock: vi.fn(async () => ({ supportLevel: 'unsupported' })),
  getSelectionCaptureCapabilityPatchMock: vi.fn(async () => ({ supportLevel: 'unsupported' })),
  getAutoPasteCapabilityPatchMock: vi.fn(async () => ({ supportLevel: 'unsupported' })),
  getNativeShareCapabilityPatchMock: vi.fn(() => ({ supportLevel: 'unsupported' })),
  getPermissionDeepLinkCapabilityPatchMock: vi.fn(() => ({ supportLevel: 'best_effort' })),
  getEverythingCapabilityPatchMock: vi.fn(() => ({ supportLevel: 'unsupported' })),
  getTuffCliCapabilityPatchMock: vi.fn(async () => ({ supportLevel: 'unsupported' })),
  indexedRuntimeGetDiagnosticsMock: vi.fn(),
  indexedRuntimeResetSourceRuntimeStateMock: vi.fn(),
  indexedRuntimeReconcileSourceMock: vi.fn(),
  indexedRuntimeScanSourceMock: vi.fn(),
  pluginManagerPluginsMock: new Map<string, Record<string, unknown>>(),
  boxItemManagerHandleSyncRequestMock: vi.fn(),
  getMainConfigMock: vi.fn(() => ({})),
  saveMainConfigMock: vi.fn()
}))

vi.mock('@talex-touch/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils')>()
  return {
    ...actual,
    isLocalhostUrl: vi.fn(() => false)
  }
})

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      isRegistered: vi.fn(() => false),
      register: vi.fn(),
      start: vi.fn(),
      unregister: vi.fn()
    }))
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: getTuffTransportMainMock
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: fsReadFileMock,
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn()
  }
}))

vi.mock('node:fs', () => ({
  promises: {
    readFile: fsReadFileMock,
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    access: vi.fn()
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}))

vi.mock('node:child_process', () => {
  execFileMock[Symbol.for('nodejs.util.promisify.custom')] = (command: string, args: string[]) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFileMock(command, args, {}, (error: Error | null, stdout = '', stderr = '') => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      })
    })
  return { execFile: execFileMock }
})

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.4.9-test'),
    getPath: vi.fn(() => '/tmp'),
    getAppPath: vi.fn(() => '/tmp/app'),
    setPath: vi.fn(),
    setAppLogsPath: vi.fn(),
    isPackaged: false
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null)
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      size: { width: 1920, height: 1080 },
      workAreaSize: { width: 1920, height: 1040 }
    }))
  },
  powerMonitor: {
    on: vi.fn()
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
    openPath: vi.fn(async () => '')
  },
  default: {
    app: {
      getVersion: vi.fn(() => '2.4.9-test'),
      getPath: vi.fn(() => '/tmp'),
      getAppPath: vi.fn(() => '/tmp/app'),
      setPath: vi.fn(),
      setAppLogsPath: vi.fn(),
      isPackaged: false
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
      getFocusedWindow: vi.fn(() => null)
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        id: 1,
        size: { width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1040 }
      }))
    }
  }
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(
    (fn: (scope: { setTag: unknown; setContext: unknown; setExtra: unknown }) => void) =>
      fn({
        setTag: vi.fn(),
        setContext: vi.fn(),
        setExtra: vi.fn()
      })
  ),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn()
  })),
  flush: vi.fn(async () => true)
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  MicaBrowserWindow: class {},
  setMicaEffect: vi.fn(),
  disableMicaEffect: vi.fn()
}))

vi.mock('../config/default', () => ({
  APP_FOLDER_NAME: 'tuff',
  APP_SCHEMA: 'app',
  FILE_SCHEMA: 'tfile'
}))

vi.mock('../core/channel-core', () => ({
  genTouchChannel: vi.fn(() => ({}))
}))

vi.mock('../core/precore', () => ({
  rootPath: '/tmp/tuff',
  innerRootPath: '/tmp/tuff',
  getRootPath: vi.fn(() => '/tmp/tuff')
}))

vi.mock('../core/eventbus/touch-event', () => ({
  LanguageChangedEvent: class LanguageChangedEvent {
    language: string

    constructor(language: string) {
      this.language = language
    }
  },
  TalexEvents: {
    LANGUAGE_CHANGED: 'language/changed'
  },
  touchEventBus: {
    emit: touchEventBusEmitMock,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn()
  }
}))

vi.mock('../modules/abstract-base-module', () => ({
  BaseModule: class BaseModule {
    constructor(..._args: unknown[]) {}
  }
}))

vi.mock('../modules/analytics', () => ({
  getStartupAnalytics: vi.fn(() => ({
    setRendererProcessMetrics: vi.fn()
  }))
}))

vi.mock('../modules/box-tool/addon/apps/app-provider', () => ({
  appProvider: {
    getAppIndexSettings: vi.fn(),
    updateAppIndexSettings: vi.fn(),
    addAppByPath: vi.fn(),
    listManagedEntries: vi.fn(),
    upsertManagedEntry: vi.fn(),
    removeManagedEntry: vi.fn(),
    setManagedEntryEnabled: vi.fn(),
    diagnoseAppSearch: vi.fn(),
    reindexAppSearchTarget: vi.fn()
  }
}))

vi.mock('../modules/box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    getIndexingStatus: vi.fn(),
    getIndexStats: vi.fn(),
    getBatteryLevel: vi.fn(),
    getFailedFiles: vi.fn(),
    addWatchPath: vi.fn(),
    rebuildIndex: vi.fn(),
    registerProgressStream: vi.fn()
  }
}))

vi.mock('../modules/box-tool/search-engine/indexing-runtime', () => ({
  indexingRuntime: {
    getDiagnostics: indexedRuntimeGetDiagnosticsMock,
    resetSourceRuntimeState: indexedRuntimeResetSourceRuntimeStateMock,
    reconcileSource: indexedRuntimeReconcileSourceMock,
    scanSource: indexedRuntimeScanSourceMock
  }
}))

vi.mock('../modules/box-tool/item-sdk', () => ({
  getBoxItemManager: () => ({
    handleSyncRequest: boxItemManagerHandleSyncRequestMock
  })
}))

vi.mock('../modules/build-verification', () => ({
  buildVerificationModule: {
    getStatus: vi.fn()
  }
}))

vi.mock('../modules/plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: pluginManagerPluginsMock
    }
  }
}))

vi.mock('../modules/clipboard', () => ({
  clipboardModule: {}
}))

vi.mock('../modules/database', () => ({
  databaseModule: {
    getDb: vi.fn(),
    getSearchDb: vi.fn(),
    getSearchClient: vi.fn(),
    getSearchDatabaseFilePath: vi.fn(() => ':memory:'),
    isSearchSplitEnabled: vi.fn(() => false),
    isSearchDbReady: vi.fn(() => false)
  }
}))

vi.mock('../db/utils', () => ({
  createDbUtils: vi.fn(() => ({}))
}))

vi.mock('../modules/platform/capability-registry', () => ({
  platformCapabilityRegistry: {
    list: platformCapabilityListMock
  },
  registerDefaultPlatformCapabilities: vi.fn()
}))

vi.mock('../modules/storage', () => ({
  storageModule: {
    getStorage: vi.fn(() => ({
      remove: vi.fn()
    }))
  },
  isMainStorageReady: vi.fn(() => true),
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock,
  subscribeMainConfig: vi.fn(() => vi.fn())
}))

vi.mock('../modules/sentry/sentry-service', () => ({
  sentryService: {
    configure: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    trackSearchMetrics: vi.fn(),
    isTelemetryEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn(),
    isEnabled: vi.fn(() => false),
    recordSearchMetrics: vi.fn()
  },
  SentryServiceModule: class SentryServiceModule {
    preInitBeforeReady = vi.fn()
    onInit = vi.fn()
    onDestroy = vi.fn()
    configure = vi.fn()
    captureException = vi.fn()
    captureMessage = vi.fn()
    trackSearchMetrics = vi.fn()
    isTelemetryEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
    isEnabled = vi.fn(() => false)
    recordSearchMetrics = vi.fn()
  },
  getSentryService: vi.fn(() => ({
    configure: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    trackSearchMetrics: vi.fn(),
    isTelemetryEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn(),
    isEnabled: vi.fn(() => false),
    recordSearchMetrics: vi.fn()
  })),
  setSentryServiceInstance: vi.fn()
}))

vi.mock('../modules/system/active-app', () => ({
  activeAppService: {
    getActiveApp: activeAppGetActiveAppMock
  }
}))

vi.mock('../modules/platform/capability-adapter', () => ({
  applyCapabilityRuntimePatch: (
    capability: Record<string, unknown>,
    patch?: Record<string, unknown>
  ) => ({
    ...capability,
    supportLevel: 'supported',
    ...(patch ?? {})
  }),
  getActiveAppCapabilityPatch: getActiveAppCapabilityPatchMock,
  getSelectionCaptureCapabilityPatch: getSelectionCaptureCapabilityPatchMock,
  getAutoPasteCapabilityPatch: getAutoPasteCapabilityPatchMock,
  getNativeShareCapabilityPatch: getNativeShareCapabilityPatchMock,
  getPermissionDeepLinkCapabilityPatch: getPermissionDeepLinkCapabilityPatchMock,
  getEverythingCapabilityPatch: getEverythingCapabilityPatchMock,
  getTuffCliCapabilityPatch: getTuffCliCapabilityPatchMock
}))

vi.mock('../service/device-idle-service', () => ({
  deviceIdleService: {
    getSettings: deviceIdleGetSettingsMock,
    updateSettings: deviceIdleUpdateSettingsMock,
    canRun: deviceIdleCanRunMock,
    isOnBatteryPower: vi.fn(() => false),
    getBatteryPercent: vi.fn(async () => null)
  }
}))

vi.mock('../service/storage-maintenance', () => ({
  cleanupAnalytics: vi.fn(),
  cleanupClipboard: vi.fn(),
  cleanupConfig: vi.fn(),
  cleanupDownloads: vi.fn(),
  cleanupFileIndex: vi.fn(),
  cleanupIntelligence: vi.fn(),
  cleanupLogs: vi.fn(),
  cleanupOcr: vi.fn(),
  cleanupTemp: vi.fn(),
  cleanupUpdates: vi.fn(),
  cleanupUsage: vi.fn()
}))

vi.mock('../service/temp-file.service', () => ({
  tempFileService: {
    registerNamespace: tempFileRegisterNamespaceMock,
    startCleanup: vi.fn(),
    createFile: tempFileCreateFileMock,
    deleteFileFromNamespaces: tempFileDeleteFileMock
  }
}))

vi.mock('../types', () => ({
  TalexTouch: {
    AppVersion: {
      DEV: 'dev',
      RELEASE: 'release'
    }
  }
}))

vi.mock('../utils/common-util', () => ({
  checkDirWithCreate: vi.fn(() => true)
}))

vi.mock('../utils/i18n-helper', () => ({
  setLocale: setLocaleMock
}))

vi.mock('../utils/logger', () => ({
  createLogger: vi.fn(() => {
    const buildLogger = (): Record<string, unknown> => ({
      warn: loggerWarnMock,
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      child: vi.fn(() => buildLogger()),
      time: vi.fn(() => ({
        end: vi.fn(),
        split: vi.fn()
      }))
    })

    return buildLogger()
  })
}))

vi.mock('../utils/perf-context', () => ({
  enterPerfContext: vi.fn(() => perfDisposeMock)
}))

vi.mock('../utils/perf-monitor', () => ({
  perfMonitor: {
    recordRendererReport: vi.fn()
  }
}))

vi.mock('../utils/storage-usage', () => ({
  getStorageUsageReport: vi.fn(async () => ({}))
}))

import { CommonChannelModule } from './common'

type CommonChannelModuleTestInstance = {
  createSafeOperationHandler: (transport: {
    on: (
      event: unknown,
      handler: (payload: unknown, context: unknown) => Promise<unknown>
    ) => unknown
  }) => (
    event: { toEventName: () => string },
    handler: (payload: unknown, context: unknown) => Promise<unknown> | unknown
  ) => unknown
  readSystemFile: (payload: { source?: string; allowMissing?: boolean }) => Promise<string>
  buildTraySettingsFromAppSettings: (
    appSettings: Record<string, unknown>,
    touchApp: {
      moduleManager: { getModule: () => null }
      window: { window: { isVisible: () => boolean } }
    }
  ) => { hideDock: boolean }
  updateTraySettings: (
    payload: undefined,
    touchApp: {
      moduleManager: { getModule: () => null }
      window: { window: { isVisible: () => boolean } }
    }
  ) => { hideDock: boolean }
}

afterEach(() => {
  vi.clearAllMocks()
  pluginManagerPluginsMock.clear()
  boxItemManagerHandleSyncRequestMock.mockClear()
})

describe('CommonChannelModule private helpers', () => {
  it('createSafeOperationHandler redacts failures as a safe public error', async () => {
    const module = new CommonChannelModule() as unknown as CommonChannelModuleTestInstance
    let registeredHandler: ((payload: unknown, context: unknown) => Promise<unknown>) | null = null

    const transport = {
      on: vi.fn((_event, handler) => {
        registeredHandler = handler
        return vi.fn()
      })
    }

    const registerSafeHandler = module.createSafeOperationHandler(transport)
    registerSafeHandler(AppEvents.system.executeCommand, async () => {
      throw new Error('command failed')
    })

    expect(registeredHandler).toBeTypeOf('function')
    const result = await registeredHandler!({}, {})

    expect(result).toEqual({
      success: false,
      error: 'The operation failed. Please retry.'
    })
  })

  it('preserves false and uses the enabled Dock default in tray snapshot and update helpers', () => {
    const module = new CommonChannelModule() as unknown as CommonChannelModuleTestInstance
    const touchApp = {
      moduleManager: { getModule: () => null },
      window: { window: { isVisible: () => false } }
    }

    expect(module.buildTraySettingsFromAppSettings({ setup: {} }, touchApp).hideDock).toBe(true)
    expect(
      module.buildTraySettingsFromAppSettings({ setup: { hideDock: false } }, touchApp).hideDock
    ).toBe(false)

    getMainConfigMock
      .mockReturnValueOnce({ setup: {} })
      .mockReturnValueOnce({ setup: {} })
      .mockReturnValueOnce({ setup: { hideDock: false } })
      .mockReturnValueOnce({ setup: { hideDock: false } })

    expect(module.updateTraySettings(undefined, touchApp).hideDock).toBe(true)
    expect(saveMainConfigMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ setup: expect.objectContaining({ hideDock: true }) })
    )

    expect(module.updateTraySettings(undefined, touchApp).hideDock).toBe(false)
    expect(saveMainConfigMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ setup: expect.objectContaining({ hideDock: false }) })
    )
  })

  it('readSystemFile reuses inflight promise and caches successful reads', async () => {
    const module = new CommonChannelModule() as unknown as CommonChannelModuleTestInstance

    let resolveRead!: (value: string) => void
    const readPromise = new Promise<string>((resolve) => {
      resolveRead = resolve
    })

    fsReadFileMock.mockReturnValueOnce(readPromise)

    const payload = { source: '/tmp/common-channel-read.txt' }
    const first = module.readSystemFile(payload)
    const second = module.readSystemFile(payload)

    resolveRead('hello-world')

    await expect(first).resolves.toBe('hello-world')
    await expect(second).resolves.toBe('hello-world')
    expect(fsReadFileMock).toHaveBeenCalledTimes(1)

    await expect(module.readSystemFile(payload)).resolves.toBe('hello-world')
    expect(fsReadFileMock).toHaveBeenCalledTimes(1)
  })

  it('readSystemFile returns empty string when allowMissing=true and file does not exist', async () => {
    const module = new CommonChannelModule() as unknown as CommonChannelModuleTestInstance
    const missing = Object.assign(new Error('not found'), { code: 'ENOENT' })

    fsReadFileMock.mockRejectedValueOnce(missing)

    await expect(
      module.readSystemFile({
        source: '/tmp/common-channel-missing.txt',
        allowMissing: true
      })
    ).resolves.toBe('')
  })

  it('does not register retired active-app event and capability list still includes dynamic entries', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    })

    try {
      const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
      const transport = {
        on: vi.fn(
          (
            event: { toEventName: () => string },
            handler: (payload: unknown, context: unknown) => Promise<unknown>
          ) => {
            handlers.set(event.toEventName(), handler)
            return vi.fn()
          }
        ),
        onStream: vi.fn(() => vi.fn()),
        broadcastToWindow: vi.fn()
      }

      getTuffTransportMainMock.mockReturnValue(transport as never)
      platformCapabilityListMock.mockReturnValue([
        { id: 'platform.storage', scope: 'system', supportLevel: 'supported' }
      ] as never)
      getActiveAppCapabilityPatchMock.mockResolvedValue({ supportLevel: 'supported' } as never)
      getSelectionCaptureCapabilityPatchMock.mockResolvedValue({
        supportLevel: 'best_effort'
      } as never)
      getAutoPasteCapabilityPatchMock.mockResolvedValue({ supportLevel: 'best_effort' } as never)
      getNativeShareCapabilityPatchMock.mockReturnValue({ supportLevel: 'supported' } as never)
      getPermissionDeepLinkCapabilityPatchMock.mockReturnValue({
        supportLevel: 'supported'
      } as never)
      getEverythingCapabilityPatchMock.mockReturnValue({ supportLevel: 'unsupported' } as never)
      getTuffCliCapabilityPatchMock.mockResolvedValue({ supportLevel: 'unsupported' } as never)
      activeAppGetActiveAppMock.mockResolvedValue({ displayName: 'Finder' })

      const module = new CommonChannelModule()
      await module.onInit({
        app: {
          window: { window: {} },
          app: { addListener: vi.fn() }
        }
      } as never)

      const listHandler = handlers.get(PlatformEvents.capabilities.list.toEventName())
      expect(listHandler).toBeTypeOf('function')
      expect(handlers.has('system:get-active-app')).toBe(false)

      const capabilities = (await listHandler?.({}, {})) as Array<{
        id: string
        supportLevel?: string
        limitations?: string[]
      }>

      expect(capabilities.map((item) => item.id)).toEqual([
        'platform.storage',
        'platform.active-app',
        'platform.selection-capture',
        'platform.auto-paste',
        'platform.native-share',
        'platform.permission-deep-link',
        'platform.everything-search',
        'platform.terminal',
        'platform.tuff-cli'
      ])
      expect(capabilities.find((item) => item.id === 'platform.active-app')?.supportLevel).toBe(
        'supported'
      )
      expect(capabilities.find((item) => item.id === 'platform.native-share')?.supportLevel).toBe(
        'supported'
      )
      expect(capabilities.find((item) => item.id === 'platform.terminal')?.supportLevel).toBe(
        'best_effort'
      )
      expect(capabilities.find((item) => item.id === 'platform.tuff-cli')?.supportLevel).toBe(
        'unsupported'
      )
      expect(
        capabilities.find((item) => item.id === 'platform.terminal')?.limitations?.[0]
      ).toContain('PTY')
      expect(activeAppGetActiveAppMock).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
    }
  })

  it('syncs renderer locale to main i18n and emits language change event', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => unknown>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => unknown
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const setLocaleHandler = handlers.get(AppEvents.i18n.setLocale.toEventName())
    expect(setLocaleHandler).toBeTypeOf('function')

    setLocaleHandler?.({ locale: 'en-US' }, {})

    expect(setLocaleMock).toHaveBeenCalledWith('en-US')
    expect(touchEventBusEmitMock).toHaveBeenCalledWith(
      'language/changed',
      expect.objectContaining({ language: 'en-US' })
    )
  })

  it('blocks unsafe renderer external URL requests before reaching Electron shell', async () => {
    const { shell } = await import('electron')
    const handlers = new Map<string, (payload: unknown, context: unknown) => unknown>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => unknown
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const openExternalHandler = handlers.get(AppEvents.system.openExternal.toEventName())
    expect(openExternalHandler).toBeTypeOf('function')

    openExternalHandler?.({ url: 'javascript:alert(1)' }, {})
    expect(shell.openExternal).not.toHaveBeenCalled()

    openExternalHandler?.({ url: 'https://example.com/docs' }, {})
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('maps each supported desktop wallpaper backend output to a usable path', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }
    getTuffTransportMainMock.mockReturnValue(transport as never)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const getDesktopWallpaper = handlers.get('wallpaper:get-desktop')
    expect(getDesktopWallpaper).toBeTypeOf('function')

    const originalPlatform = process.platform
    const cases = [
      {
        platform: 'win32' as const,
        command: 'reg',
        args: ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'],
        output: 'WallPaper    REG_SZ    C:\\Wallpapers\\aurora.jpg',
        expected: 'C:\\Wallpapers\\aurora.jpg'
      },
      {
        platform: 'darwin' as const,
        command: 'osascript',
        args: [
          '-e',
          'tell application "System Events" to get POSIX path of (get picture of item 1 of desktops)'
        ],
        output: '/Users/demo/Pictures/aurora.jpg\n',
        expected: '/Users/demo/Pictures/aurora.jpg'
      },
      {
        platform: 'linux' as const,
        command: 'gsettings',
        args: ['get', 'org.gnome.desktop.background', 'picture-uri'],
        output: "'file:///home/demo/Pictures/aurora%20day.jpg'",
        expected: '/home/demo/Pictures/aurora day.jpg'
      }
    ]

    try {
      for (const testCase of cases) {
        Object.defineProperty(process, 'platform', {
          value: testCase.platform,
          configurable: true
        })
        execFileMock.mockImplementationOnce(
          (
            _command: string,
            _args: string[],
            optionsOrCallback: unknown,
            callbackMaybe?: (error: Error | null, stdout?: string, stderr?: string) => void
          ) => {
            const callback =
              typeof optionsOrCallback === 'function'
                ? (optionsOrCallback as (
                    error: Error | null,
                    stdout?: string,
                    stderr?: string
                  ) => void)
                : callbackMaybe
            callback?.(null, testCase.output, '')
          }
        )

        await expect(getDesktopWallpaper?.({}, {})).resolves.toEqual({ path: testCase.expected })
        expect(execFileMock).toHaveBeenLastCalledWith(
          testCase.command,
          testCase.args,
          {},
          expect.any(Function)
        )
      }
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
    }
  })

  it('maps desktop wallpaper command failures to the unavailable response', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }
    getTuffTransportMainMock.mockReturnValue(transport as never)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const getDesktopWallpaper = handlers.get('wallpaper:get-desktop')
    const originalPlatform = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      execFileMock.mockImplementationOnce(
        (
          _command: string,
          _args: string[],
          optionsOrCallback: unknown,
          callbackMaybe?: (error: Error | null, stdout?: string, stderr?: string) => void
        ) => {
          const callback =
            typeof optionsOrCallback === 'function'
              ? (optionsOrCallback as (
                  error: Error | null,
                  stdout?: string,
                  stderr?: string
                ) => void)
              : callbackMaybe
          callback?.(new Error('registry access denied'))
        }
      )

      await expect(getDesktopWallpaper?.({}, {})).resolves.toEqual({
        path: null,
        error: 'Desktop wallpaper path is unavailable on current system.'
      })
      expect(execFileMock).toHaveBeenLastCalledWith(
        'reg',
        ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'],
        {},
        expect.any(Function)
      )
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
    }
  })

  it('includes plugin search providers in indexed source provider config response', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)
    indexedRuntimeGetDiagnosticsMock.mockResolvedValue({
      generatedAt: 1,
      summary: {
        total: 1,
        byStatus: { ready: 1 },
        ready: 1,
        degraded: 0,
        unavailable: 0
      },
      sources: [
        {
          descriptor: {
            id: 'file-provider',
            kind: 'file',
            displayName: 'Files',
            platforms: ['darwin', 'win32', 'linux'],
            priority: 'deferred',
            storage: 'sqlite-index',
            privacy: 'medium',
            capabilities: {
              scan: true,
              watch: true,
              reconcile: true,
              clear: true,
              open: true
            },
            admission: {
              owner: 'core',
              permissionScopes: ['file-system'],
              defaultState: 'enabled',
              clearable: true,
              rebuildable: true
            }
          },
          health: {
            status: 'ready',
            permissionState: 'granted',
            itemCount: 1,
            watchState: 'active',
            reconcileState: 'idle'
          },
          roots: []
        }
      ]
    })
    pluginManagerPluginsMock.set('touch-translation', {
      name: 'touch-translation',
      searchProviders: [
        {
          id: 'touch-translation.results',
          displayName: 'Translation Results',
          kind: 'plugin',
          owner: 'third-party-plugin',
          mode: 'push',
          priority: 'fast',
          defaultOrder: 100,
          policy: {
            owner: 'third-party-plugin',
            mode: 'push',
            permissionScopes: ['root-results'],
            defaultState: 'ask',
            requiresUserConsent: true,
            pushesToRootResults: true
          }
        }
      ],
      issues: [
        {
          type: 'error',
          code: 'SEARCH_PROVIDER_PERMISSION_MISSING',
          message:
            "Search provider 'touch-translation.blocked' requires manifest permissions: search.root-results",
          source: 'searchProvider:touch-translation.blocked',
          meta: {
            providerId: 'touch-translation.blocked',
            missingPermissionIds: ['search.root-results']
          }
        }
      ]
    })

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const getConfigHandler = handlers.get(AppEvents.indexedSource.providerConfigGet.toEventName())
    expect(getConfigHandler).toBeTypeOf('function')

    const response = (await getConfigHandler?.({}, {})) as {
      providers: Array<{ providerId: string; enabled: boolean }>
      availableProviders: Array<{ id: string }>
      sourceLinks: Array<{ sourceId: string; providerIds: string[] }>
      issues: Array<{ code: string; providerId?: string; pluginName?: string }>
    }

    expect(response.availableProviders.map((provider) => provider.id)).toEqual([
      'file-provider',
      'touch-translation.results'
    ])
    expect(response.sourceLinks).toEqual([
      {
        sourceId: 'file-provider',
        providerIds: ['file-provider']
      }
    ])
    expect(response.providers.map((provider) => provider.providerId)).toEqual([
      'file-provider',
      'touch-translation.results'
    ])
    expect(
      response.providers.find((provider) => provider.providerId === 'touch-translation.results')
        ?.enabled
    ).toBe(false)
    expect(response.issues).toEqual([
      expect.objectContaining({
        code: 'SEARCH_PROVIDER_PERMISSION_MISSING',
        pluginName: 'touch-translation',
        providerId: 'touch-translation.blocked'
      })
    ])
  })

  it('refreshes pushed root items after provider config updates', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)
    indexedRuntimeGetDiagnosticsMock.mockResolvedValue({
      generatedAt: 1,
      summary: {
        total: 0,
        byStatus: {},
        ready: 0,
        degraded: 0,
        unavailable: 0
      },
      sources: []
    })

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const updateConfigHandler = handlers.get(
      AppEvents.indexedSource.providerConfigUpdate.toEventName()
    )
    expect(updateConfigHandler).toBeTypeOf('function')

    await updateConfigHandler?.(
      {
        providers: [{ providerId: 'touch-translation.results', enabled: false, order: 1 }]
      },
      {}
    )

    expect(boxItemManagerHandleSyncRequestMock).toHaveBeenCalledTimes(1)
  })

  it('registers device idle diagnostic transport handler', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    const settings = {
      idleThresholdMs: 60000,
      minBatteryPercent: 40,
      blockBatteryBelowPercent: 10,
      allowWhenCharging: true,
      forceAfterHours: 24
    }
    const decision = {
      allowed: false,
      reason: 'not-idle',
      forced: false,
      snapshot: {
        idleMs: 12000,
        battery: { level: 80, charging: true, onBattery: false }
      }
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)
    deviceIdleGetSettingsMock.mockReturnValue(settings)
    deviceIdleCanRunMock.mockResolvedValue(decision)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const diagnosticHandler = handlers.get(AppEvents.deviceIdle.getDiagnostic.toEventName())
    expect(diagnosticHandler).toBeTypeOf('function')

    await expect(diagnosticHandler?.({}, {})).resolves.toEqual({
      ...decision,
      settings
    })
    expect(deviceIdleCanRunMock).toHaveBeenCalledWith()
  })

  it('routes temp-file create/delete through shared plugin temp-file events', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)
    tempFileCreateFileMock.mockResolvedValueOnce({
      path: '/tmp/tuff-plugin-temp/example.txt',
      sizeBytes: 5,
      createdAt: 123
    })
    tempFileDeleteFileMock.mockResolvedValueOnce(true)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const createHandler = handlers.get(PluginEvents.tempFile.create.toEventName())
    const deleteHandler = handlers.get(PluginEvents.tempFile.delete.toEventName())

    expect(createHandler).toBeTypeOf('function')
    expect(deleteHandler).toBeTypeOf('function')

    await expect(
      createHandler?.(
        {
          namespace: 'icons/svg',
          ext: 'svg',
          text: 'hello',
          prefix: 'tufficon',
          retentionMs: 1000
        },
        { plugin: { name: 'demo-plugin' } }
      )
    ).resolves.toEqual({
      url: 'tfile:///tmp/tuff-plugin-temp/example.txt',
      path: '/tmp/tuff-plugin-temp/example.txt',
      sizeBytes: 5,
      createdAt: 123
    })
    await expect(
      deleteHandler?.(
        { url: 'tfile:///tmp/tuff-plugin-temp/example.txt' },
        { plugin: { name: 'demo-plugin' } }
      )
    ).resolves.toEqual({ success: true })

    await expect(createHandler?.({ text: 'unowned' }, {})).rejects.toThrow(
      'PLUGIN_CONTEXT_REQUIRED'
    )

    expect(tempFileRegisterNamespaceMock).toHaveBeenCalledTimes(1)
    expect(tempFileRegisterNamespaceMock).toHaveBeenCalledWith({
      namespace: 'plugins/runtime/demo-plugin-88ecfcc7',
      retentionMs: 24 * 60 * 60 * 1000,
      automaticCleanup: true
    })
    expect(tempFileCreateFileMock).toHaveBeenCalledWith({
      namespace: 'plugins/runtime/demo-plugin-88ecfcc7',
      ext: 'svg',
      text: 'hello',
      base64: undefined,
      prefix: 'tufficon'
    })
    expect(tempFileDeleteFileMock).toHaveBeenCalledWith('/tmp/tuff-plugin-temp/example.txt', [
      'plugins/runtime/demo-plugin-88ecfcc7'
    ])
  })

  it('marks native-share as unsupported on Windows while keeping mail-only fallback out of capability support', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    })

    try {
      const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
      const transport = {
        on: vi.fn(
          (
            event: { toEventName: () => string },
            handler: (payload: unknown, context: unknown) => Promise<unknown>
          ) => {
            handlers.set(event.toEventName(), handler)
            return vi.fn()
          }
        ),
        onStream: vi.fn(() => vi.fn()),
        broadcastToWindow: vi.fn()
      }

      getTuffTransportMainMock.mockReturnValue(transport as never)
      platformCapabilityListMock.mockReturnValue([
        { id: 'platform.storage', scope: 'system', supportLevel: 'supported' }
      ] as never)
      getActiveAppCapabilityPatchMock.mockResolvedValue({ supportLevel: 'supported' } as never)
      getSelectionCaptureCapabilityPatchMock.mockResolvedValue({
        supportLevel: 'best_effort'
      } as never)
      getAutoPasteCapabilityPatchMock.mockResolvedValue({ supportLevel: 'best_effort' } as never)
      getNativeShareCapabilityPatchMock.mockReturnValue({
        supportLevel: 'unsupported',
        limitations: [
          'Native system share is unavailable on this platform; explicit mail target remains available.'
        ]
      } as never)
      getPermissionDeepLinkCapabilityPatchMock.mockReturnValue({
        supportLevel: 'supported'
      } as never)
      getEverythingCapabilityPatchMock.mockReturnValue({ supportLevel: 'unsupported' } as never)
      getTuffCliCapabilityPatchMock.mockResolvedValue({ supportLevel: 'unsupported' } as never)

      const module = new CommonChannelModule()
      await module.onInit({
        app: {
          window: { window: {} },
          app: { addListener: vi.fn() }
        }
      } as never)

      const listHandler = handlers.get(PlatformEvents.capabilities.list.toEventName())
      expect(listHandler).toBeTypeOf('function')

      const capabilities = (await listHandler?.({}, {})) as Array<{
        id: string
        supportLevel?: string
        limitations?: string[]
      }>
      const nativeShare = capabilities.find((item) => item.id === 'platform.native-share')

      expect(nativeShare?.supportLevel).toBe('unsupported')
      expect(nativeShare?.limitations?.[0]).toContain('explicit mail target')
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
    }
  })

  it('appends Tuff CLI capability state from the shared capability adapter', async () => {
    const originalPlatform = process.platform

    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    })

    try {
      const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
      const transport = {
        on: vi.fn(
          (
            event: { toEventName: () => string },
            handler: (payload: unknown, context: unknown) => Promise<unknown>
          ) => {
            handlers.set(event.toEventName(), handler)
            return vi.fn()
          }
        ),
        onStream: vi.fn(() => vi.fn()),
        broadcastToWindow: vi.fn()
      }

      getTuffTransportMainMock.mockReturnValue(transport as never)
      platformCapabilityListMock.mockReturnValue([] as never)
      getActiveAppCapabilityPatchMock.mockResolvedValue({ supportLevel: 'unsupported' } as never)
      getSelectionCaptureCapabilityPatchMock.mockResolvedValue({
        supportLevel: 'unsupported'
      } as never)
      getAutoPasteCapabilityPatchMock.mockResolvedValue({ supportLevel: 'unsupported' } as never)
      getNativeShareCapabilityPatchMock.mockReturnValue({ supportLevel: 'unsupported' } as never)
      getPermissionDeepLinkCapabilityPatchMock.mockReturnValue({
        supportLevel: 'best_effort'
      } as never)
      getEverythingCapabilityPatchMock.mockReturnValue({ supportLevel: 'unsupported' } as never)
      getTuffCliCapabilityPatchMock.mockResolvedValue({ supportLevel: 'supported' } as never)

      const module = new CommonChannelModule()
      await module.onInit({
        app: {
          window: { window: {} },
          app: { addListener: vi.fn() }
        }
      } as never)

      const listHandler = handlers.get(PlatformEvents.capabilities.list.toEventName())
      expect(listHandler).toBeTypeOf('function')

      const capabilities = (await listHandler?.({}, {})) as Array<{
        id: string
        supportLevel?: string
      }>

      expect(getTuffCliCapabilityPatchMock).toHaveBeenCalledTimes(1)
      expect(capabilities.find((item) => item.id === 'platform.tuff-cli')?.supportLevel).toBe(
        'supported'
      )
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      })
    }
  })

  it('routes managed app-index handlers and validates remove/set-enabled payloads', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)

    const { appProvider } = await import('../modules/box-tool/addon/apps/app-provider')
    ;(appProvider.listManagedEntries as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        path: '/Applications/ChatApp.app',
        name: 'ChatApp',
        enabled: true,
        launchKind: 'path',
        launchTarget: '/Applications/ChatApp.app'
      }
    ])
    ;(appProvider.upsertManagedEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      status: 'updated'
    })
    ;(appProvider.removeManagedEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      status: 'removed'
    })
    ;(appProvider.setManagedEntryEnabled as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      status: 'updated'
    })

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const listHandler = handlers.get(AppEvents.appIndex.listEntries.toEventName())
    const upsertHandler = handlers.get(AppEvents.appIndex.upsertEntry.toEventName())
    const removeHandler = handlers.get(AppEvents.appIndex.removeEntry.toEventName())
    const setEnabledHandler = handlers.get(AppEvents.appIndex.setEntryEnabled.toEventName())

    await expect(listHandler?.({}, {})).resolves.toEqual([
      {
        path: '/Applications/ChatApp.app',
        name: 'ChatApp',
        enabled: true,
        launchKind: 'path',
        launchTarget: '/Applications/ChatApp.app'
      }
    ])
    await expect(
      upsertHandler?.(
        {
          path: '/Applications/ChatApp.app',
          displayName: '聊天应用',
          enabled: true
        },
        {}
      )
    ).resolves.toEqual({
      success: true,
      status: 'updated'
    })
    await expect(Promise.resolve(removeHandler?.({ path: '' }, {}))).resolves.toEqual({
      success: false,
      status: 'invalid',
      reason: 'path-empty'
    })
    await expect(
      Promise.resolve(removeHandler?.({ path: '/Applications/ChatApp.app' }, {}))
    ).resolves.toEqual({
      success: true,
      status: 'removed'
    })
    await expect(
      Promise.resolve(setEnabledHandler?.({ path: '/Applications/ChatApp.app' }, {}))
    ).resolves.toEqual({
      success: false,
      status: 'invalid',
      reason: 'enabled-invalid'
    })
    await expect(
      setEnabledHandler?.({ path: '/Applications/ChatApp.app', enabled: false }, {})
    ).resolves.toEqual({
      success: true,
      status: 'updated'
    })

    expect(appProvider.listManagedEntries).toHaveBeenCalledTimes(1)
    expect(appProvider.upsertManagedEntry).toHaveBeenCalledWith({
      path: '/Applications/ChatApp.app',
      displayName: '聊天应用',
      enabled: true
    })
    expect(appProvider.removeManagedEntry).toHaveBeenCalledWith('/Applications/ChatApp.app')
    expect(appProvider.setManagedEntryEnabled).toHaveBeenCalledWith(
      '/Applications/ChatApp.app',
      false
    )
  })

  it('routes app-index diagnostic handlers and falls back empty payloads', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)

    const { appProvider } = await import('../modules/box-tool/addon/apps/app-provider')
    const diagnosticResult = {
      success: true,
      status: 'found',
      target: 'JSON Formatter',
      app: {
        id: 12,
        path: '/Applications/JSON Formatter.app',
        name: 'JSON Formatter',
        displayName: 'JSON Formatter',
        launchKind: 'path',
        launchTarget: '/Applications/JSON Formatter.app',
        alternateNames: [],
        entryEnabled: true
      },
      index: {
        itemId: '/Applications/JSON Formatter.app',
        itemIds: ['/Applications/JSON Formatter.app'],
        aliases: ['JSON Formatter'],
        generatedKeywords: ['json formatter'],
        storedKeywords: ['json formatter'],
        storedKeywordEntries: [{ value: 'json formatter', priority: 1 }]
      },
      query: {
        raw: 'json formatter',
        normalized: 'json formatter',
        terms: ['json', 'formatter'],
        ftsQuery: 'json formatter',
        candidateItemIds: ['/Applications/JSON Formatter.app'],
        stages: {
          precise: { ran: true, targetHit: true, matches: [] },
          phrase: { ran: true, targetHit: true, matches: [] },
          prefix: {
            ran: false,
            targetHit: false,
            matches: [],
            reason: 'query-too-long-for-prefix-stage'
          },
          fts: { ran: true, targetHit: true, matches: [] },
          ngram: { ran: true, targetHit: true, matches: [] },
          subsequence: { ran: true, targetHit: true, matches: [] }
        }
      }
    }
    const emptyDiagnosticResult = {
      success: false,
      status: 'invalid',
      target: '',
      reason: 'target-empty'
    }
    const reindexResult = {
      success: false,
      status: 'reindexed',
      requiresConfirm: true,
      path: '/Applications/JSON Formatter.app'
    }
    const emptyReindexResult = {
      success: false,
      status: 'invalid',
      reason: 'target-empty'
    }

    ;(appProvider.diagnoseAppSearch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(diagnosticResult)
      .mockResolvedValueOnce(emptyDiagnosticResult)
    ;(appProvider.reindexAppSearchTarget as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(reindexResult)
      .mockResolvedValueOnce(emptyReindexResult)

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const diagnoseHandler = handlers.get(AppEvents.appIndex.diagnose.toEventName())
    const reindexHandler = handlers.get(AppEvents.appIndex.reindex.toEventName())
    expect(diagnoseHandler).toBeTypeOf('function')
    expect(reindexHandler).toBeTypeOf('function')

    await expect(
      diagnoseHandler?.({ target: 'JSON Formatter', query: 'json formatter' }, {})
    ).resolves.toEqual(diagnosticResult)
    await expect(
      reindexHandler?.({ target: 'JSON Formatter', mode: 'keywords', force: true }, {})
    ).resolves.toEqual(reindexResult)
    await expect(diagnoseHandler?.(undefined, {})).resolves.toEqual(emptyDiagnosticResult)
    await expect(reindexHandler?.(undefined, {})).resolves.toEqual(emptyReindexResult)

    expect(appProvider.diagnoseAppSearch).toHaveBeenNthCalledWith(1, {
      target: 'JSON Formatter',
      query: 'json formatter'
    })
    expect(appProvider.reindexAppSearchTarget).toHaveBeenNthCalledWith(1, {
      target: 'JSON Formatter',
      mode: 'keywords',
      force: true
    })
    expect(appProvider.diagnoseAppSearch).toHaveBeenNthCalledWith(2, { target: '' })
    expect(appProvider.reindexAppSearchTarget).toHaveBeenNthCalledWith(2, { target: '' })
  })

  it('routes indexed source runtime maintenance handlers', async () => {
    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }

    getTuffTransportMainMock.mockReturnValue(transport as never)
    indexedRuntimeGetDiagnosticsMock.mockResolvedValue({
      generatedAt: 1700000000000,
      summary: {
        total: 2,
        byStatus: { ready: 1, disabled: 1 },
        ready: 1,
        degraded: 0,
        unavailable: 1
      },
      sources: [
        {
          descriptor: { id: 'file-provider' },
          health: { status: 'ready' },
          roots: []
        },
        {
          descriptor: { id: 'browser-bookmarks' },
          health: { status: 'disabled' },
          roots: []
        }
      ]
    })
    indexedRuntimeResetSourceRuntimeStateMock.mockResolvedValue({
      sourceId: 'browser-bookmarks',
      reason: 'user-clear',
      clearedSearchIndex: true,
      clearedScanProgress: false,
      startedAt: 1,
      completedAt: 2
    })
    indexedRuntimeReconcileSourceMock.mockResolvedValue({
      sourceId: 'browser-bookmarks',
      added: 0,
      changed: 1,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 3,
      completedAt: 4
    })
    indexedRuntimeScanSourceMock.mockResolvedValue({
      sourceId: 'browser-bookmarks',
      batches: 1,
      records: 8,
      indexedRecords: 6,
      startedAt: 5,
      completedAt: 6
    })

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    const diagnosticsHandler = handlers.get(AppEvents.indexedSource.diagnostics.toEventName())
    const resetHandler = handlers.get(AppEvents.indexedSource.reset.toEventName())
    const reconcileHandler = handlers.get(AppEvents.indexedSource.reconcile.toEventName())
    const scanHandler = handlers.get(AppEvents.indexedSource.scan.toEventName())

    await expect(
      diagnosticsHandler?.({ sourceId: 'browser-bookmarks' }, {})
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        ready: 0,
        degraded: 0,
        unavailable: 1
      },
      sources: [{ descriptor: { id: 'browser-bookmarks' } }]
    })
    await expect(
      resetHandler?.(
        {
          sourceId: 'browser-bookmarks',
          reason: 'user-clear',
          clearSearchIndex: true
        },
        {}
      )
    ).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      clearedSearchIndex: true
    })
    await expect(
      reconcileHandler?.({ sourceId: 'browser-bookmarks', reason: 'manual-repair' }, {})
    ).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      changed: 1
    })
    await expect(
      scanHandler?.({ sourceId: 'browser-bookmarks', reason: 'manual-rebuild' }, {})
    ).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      records: 8,
      indexedRecords: 6
    })
    await expect(resetHandler?.({ sourceId: '' }, {})).resolves.toMatchObject({
      sourceId: '',
      error: 'source-id-empty'
    })
    await expect(
      scanHandler?.({ sourceId: '', reason: 'manual-rebuild' }, {})
    ).resolves.toMatchObject({
      sourceId: '',
      indexedRecords: 0,
      error: 'source-id-empty'
    })
    await expect(scanHandler?.({ sourceId: 'browser-bookmarks' }, {})).resolves.toMatchObject({
      sourceId: 'browser-bookmarks',
      indexedRecords: 0,
      error: 'reason-empty'
    })

    expect(indexedRuntimeResetSourceRuntimeStateMock).toHaveBeenCalledWith('browser-bookmarks', {
      reason: 'user-clear',
      clearSearchIndex: true,
      clearScanProgress: undefined
    })
    expect(indexedRuntimeReconcileSourceMock).toHaveBeenCalledWith('browser-bookmarks', {
      reason: 'manual-repair'
    })
    expect(indexedRuntimeScanSourceMock).toHaveBeenCalledWith('browser-bookmarks', 'manual-rebuild')
  })

  it('projects file index handler failures and diagnostics to safe public results', async () => {
    const SQL_CANARY = 'Failed query: update "files" set "name" = ?'
    const PARAMS_CANARY = 'params: locked.md,.md,2,3'
    const POSIX_CANARY = '/Users/alice/Private/report.txt'
    const WINDOWS_CANARY = 'C:\\Users\\alice\\Private\\report.txt'
    const STACK_CANARY = 'CANARY_STACK at Object.<anonymous>'
    const ALL_CANARIES = [SQL_CANARY, PARAMS_CANARY, POSIX_CANARY, WINDOWS_CANARY, STACK_CANARY]
    const expectNoCanary = (payload: unknown): void => {
      const serialized = JSON.stringify(payload) ?? ''
      for (const canary of ALL_CANARIES) {
        expect(serialized).not.toContain(canary)
      }
      expect(serialized).not.toContain('Failed query:')
      expect(serialized).not.toContain('params:')
    }
    const canaryError = new Error(`${SQL_CANARY}\n${PARAMS_CANARY}\n${POSIX_CANARY}`)
    canaryError.stack = STACK_CANARY

    const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
    const transport = {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      onStream: vi.fn(() => vi.fn()),
      broadcastToWindow: vi.fn()
    }
    getTuffTransportMainMock.mockReturnValue(transport as never)

    const { fileProvider } = await import('../modules/box-tool/addon/files/file-provider')
    const fileProviderMock = fileProvider as unknown as {
      getIndexingStatus: ReturnType<typeof vi.fn>
      getIndexStats: ReturnType<typeof vi.fn>
      getBatteryLevel: ReturnType<typeof vi.fn>
      getFailedFiles: ReturnType<typeof vi.fn>
      addWatchPath: ReturnType<typeof vi.fn>
      rebuildIndex: ReturnType<typeof vi.fn>
    }
    fileProviderMock.getIndexingStatus.mockImplementation(() => {
      throw canaryError
    })
    fileProviderMock.getIndexStats.mockRejectedValue(canaryError)
    fileProviderMock.getBatteryLevel.mockRejectedValue(canaryError)
    fileProviderMock.getFailedFiles.mockRejectedValue(canaryError)
    fileProviderMock.addWatchPath.mockRejectedValue(canaryError)
    fileProviderMock.rebuildIndex.mockRejectedValue(canaryError)

    indexedRuntimeScanSourceMock.mockRejectedValue(canaryError)
    indexedRuntimeReconcileSourceMock.mockRejectedValue(canaryError)
    indexedRuntimeResetSourceRuntimeStateMock.mockRejectedValue(canaryError)
    indexedRuntimeGetDiagnosticsMock.mockResolvedValue({
      generatedAt: 1700000000000,
      summary: { total: 2, byStatus: {}, ready: 0, degraded: 1, unavailable: 1 },
      sources: [
        {
          descriptor: { id: 'file-provider' },
          health: {
            status: 'error',
            reason: `${SQL_CANARY} ${POSIX_CANARY}`,
            lastError: `${PARAMS_CANARY} ${STACK_CANARY}`
          },
          roots: [],
          progress: { reason: POSIX_CANARY },
          evidence: [
            {
              id: 'file-provider:index-flush',
              label: 'File index flush',
              status: 'error',
              reason: SQL_CANARY,
              metadata: {
                error: `${SQL_CANARY} ${PARAMS_CANARY}`,
                storeBoundary: 'file-persistence',
                entries: 3,
                path: POSIX_CANARY
              }
            }
          ],
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 1,
              errorCode: 'runtime',
              errorMessage: `${SQL_CANARY} ${WINDOWS_CANARY}`,
              error: STACK_CANARY,
              summary: { errorMessage: POSIX_CANARY, durationMs: 5 }
            }
          ],
          lastScan: {
            startedAt: 1,
            completedAt: 2,
            batches: 0,
            records: 0,
            indexedRecords: 0,
            error: SQL_CANARY
          },
          lastWatch: {
            occurredAt: 1,
            completedAt: 2,
            action: 'add',
            path: POSIX_CANARY,
            deltas: 1,
            appliedDeltas: 0,
            failedDeltas: 1,
            error: PARAMS_CANARY
          },
          lastReconcile: {
            startedAt: 1,
            completedAt: 2,
            added: 0,
            changed: 0,
            deleted: 0,
            skipped: 0,
            errors: 1,
            error: SQL_CANARY
          },
          lastReset: {
            startedAt: 1,
            completedAt: 2,
            reason: 'user-clear',
            clearedSearchIndex: false,
            clearedScanProgress: false,
            error: POSIX_CANARY
          }
        },
        {
          descriptor: { id: 'browser-bookmarks' },
          health: {
            status: 'degraded',
            reason: 'bookmarks-import-failed',
            lastError: 'raw other-source text'
          },
          roots: []
        }
      ]
    })

    const module = new CommonChannelModule()
    await module.onInit({
      app: {
        window: { window: {} },
        app: { addListener: vi.fn() }
      }
    } as never)

    // --- File index handlers: every failure returns a stable projected result.
    const statusHandler = handlers.get(AppEvents.fileIndex.status.toEventName())
    const statusResult = await statusHandler?.(undefined, {})
    expect(statusResult).toMatchObject({
      initializationFailed: true,
      errorCode: 'FILE_INDEX_STATUS_FAILED',
      retryable: false
    })
    expect((statusResult as { reportId?: string }).reportId).toEqual(expect.any(String))
    expectNoCanary(statusResult)

    const statsHandler = handlers.get(AppEvents.fileIndex.stats.toEventName())
    const statsResult = await statsHandler?.(undefined, {})
    expect(statsResult).toMatchObject({ totalFiles: 0, errorCode: 'FILE_INDEX_STATS_FAILED' })
    expectNoCanary(statsResult)

    const failedFilesHandler = handlers.get(AppEvents.fileIndex.failedFiles.toEventName())
    const failedFilesResult = await failedFilesHandler?.(undefined, {})
    expect(failedFilesResult).toMatchObject({
      files: [],
      errorCode: 'FILE_INDEX_FAILED_FILES_FAILED'
    })
    expectNoCanary(failedFilesResult)

    const batteryHandler = handlers.get(AppEvents.fileIndex.batteryLevel.toEventName())
    await expect(batteryHandler?.(undefined, {})).resolves.toBeNull()

    const addPathHandler = handlers.get(AppEvents.fileIndex.addPath.toEventName())
    const addPathResult = await addPathHandler?.({ path: '/tmp/canary' }, {})
    expect(addPathResult).toMatchObject({
      success: false,
      status: 'error',
      errorCode: 'FILE_INDEX_ADD_PATH_FAILED'
    })
    expectNoCanary(addPathResult)

    const rebuildHandler = handlers.get(AppEvents.fileIndex.rebuild.toEventName())
    const rebuildResult = await rebuildHandler?.({}, {})
    expect(rebuildResult).toMatchObject({
      success: false,
      errorCode: 'FILE_INDEX_REBUILD_HANDLER_FAILED'
    })
    expect(rebuildResult).not.toHaveProperty('error')
    expect(rebuildResult).not.toHaveProperty('message')
    expectNoCanary(rebuildResult)

    // --- Indexed-source handlers: thrown failures are projected per source.
    const scanHandler = handlers.get(AppEvents.indexedSource.scan.toEventName())
    const scanResult = await scanHandler?.(
      { sourceId: 'file-provider', reason: 'manual-rebuild' },
      {}
    )
    expect(scanResult).toMatchObject({
      sourceId: 'file-provider',
      errorCode: 'FILE_INDEX_SCAN_FAILED',
      error: 'FILE_INDEX_SCAN_FAILED',
      retryable: false
    })
    expectNoCanary(scanResult)

    const otherScanResult = await scanHandler?.(
      { sourceId: 'browser-bookmarks', reason: 'manual-rebuild' },
      {}
    )
    expect(otherScanResult).toMatchObject({
      sourceId: 'browser-bookmarks',
      errorCode: 'INDEXED_SOURCE_SCAN_FAILED'
    })
    expectNoCanary(otherScanResult)

    const reconcileHandler = handlers.get(AppEvents.indexedSource.reconcile.toEventName())
    const reconcileResult = await reconcileHandler?.(
      { sourceId: 'file-provider', reason: 'manual-repair' },
      {}
    )
    expect(reconcileResult).toMatchObject({
      sourceId: 'file-provider',
      errorCode: 'FILE_INDEX_RECONCILE_FAILED',
      reason: 'FILE_INDEX_RECONCILE_FAILED'
    })
    expectNoCanary(reconcileResult)

    const resetHandler = handlers.get(AppEvents.indexedSource.reset.toEventName())
    const resetResult = await resetHandler?.(
      { sourceId: 'file-provider', reason: 'user-clear', clearSearchIndex: true },
      {}
    )
    expect(resetResult).toMatchObject({
      sourceId: 'file-provider',
      errorCode: 'FILE_INDEX_RESET_FAILED',
      error: 'FILE_INDEX_RESET_FAILED'
    })
    expectNoCanary(resetResult)

    // --- Diagnostics: file-provider raw runtime state is sanitized; other sources untouched.
    const diagnosticsHandler = handlers.get(AppEvents.indexedSource.diagnostics.toEventName())
    const diagnostics = (await diagnosticsHandler?.(undefined, {})) as {
      sources: Array<{
        descriptor: { id: string }
        health: Record<string, unknown>
        progress: Record<string, unknown>
        evidence: Array<{ reason?: unknown; metadata?: unknown }>
        recentTasks: Array<Record<string, unknown>>
        lastScan: Record<string, unknown>
        lastWatch: Record<string, unknown>
        lastReconcile: Record<string, unknown>
        lastReset: Record<string, unknown>
      }>
    }
    expectNoCanary(diagnostics)

    const fileSource = diagnostics.sources.find(
      (source) => source.descriptor.id === 'file-provider'
    )!
    expect(fileSource.health.lastError).toBeUndefined()
    expect(fileSource.health.reason).toBeUndefined()
    expect(fileSource.progress.reason).toBeUndefined()
    expect(fileSource.evidence[0].reason).toBeUndefined()
    expect(fileSource.evidence[0].metadata).toEqual({
      storeBoundary: 'file-persistence',
      entries: 3
    })
    expect(fileSource.recentTasks[0].errorCode).toBe('runtime')
    expect(fileSource.recentTasks[0].errorMessage).toBeUndefined()
    expect(fileSource.recentTasks[0].error).toBeUndefined()
    expect(fileSource.recentTasks[0].summary).toEqual({ durationMs: 5 })
    expect(fileSource.lastScan.error).toBeUndefined()
    expect(fileSource.lastWatch.path).toBe('')
    expect(fileSource.lastWatch.error).toBeUndefined()
    expect(fileSource.lastReconcile.error).toBeUndefined()
    expect(fileSource.lastReset.error).toBeUndefined()

    const otherSource = diagnostics.sources.find(
      (source) => source.descriptor.id === 'browser-bookmarks'
    )!
    expect(otherSource.health.lastError).toBe('raw other-source text')
  })
})
