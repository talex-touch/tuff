import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppEvents, PlatformEvents } from '@talex-touch/utils/transport/events'

const {
  fsReadFileMock,
  loggerWarnMock,
  perfDisposeMock,
  getTuffTransportMainMock,
  activeAppGetActiveAppMock,
  isActiveAppCapabilityAvailableMock,
  nativeShareGetAvailableTargetsMock,
  platformCapabilityListMock
} = vi.hoisted(() => ({
  fsReadFileMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  perfDisposeMock: vi.fn(),
  getTuffTransportMainMock: vi.fn<(channel?: unknown, keyManager?: unknown) => unknown>(() => null),
  activeAppGetActiveAppMock: vi.fn<(forceRefresh?: unknown) => Promise<unknown>>(),
  isActiveAppCapabilityAvailableMock: vi.fn(async () => false),
  nativeShareGetAvailableTargetsMock: vi.fn<() => Array<Record<string, unknown>>>(() => []),
  platformCapabilityListMock: vi.fn<() => Array<Record<string, unknown>>>(() => [])
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
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8')),
    decryptString: vi.fn(() => '')
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
  withScope: vi.fn((fn: (scope: any) => void) =>
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
  TalexEvents: {},
  touchEventBus: {
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
    updateAppIndexSettings: vi.fn()
  }
}))

vi.mock('../modules/box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    getIndexingStatus: vi.fn(),
    getIndexStats: vi.fn(),
    getBatteryLevel: vi.fn(),
    rebuildIndex: vi.fn(),
    registerProgressStream: vi.fn()
  }
}))

vi.mock('../modules/build-verification', () => ({
  buildVerificationModule: {
    getStatus: vi.fn()
  }
}))

vi.mock('../modules/clipboard', () => ({
  clipboardModule: {}
}))

vi.mock('../modules/database', () => ({
  databaseModule: {
    getDb: vi.fn()
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
  getMainConfig: vi.fn(() => ({})),
  saveMainConfig: vi.fn(async () => undefined),
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
  },
  isActiveAppCapabilityAvailable: isActiveAppCapabilityAvailableMock
}))

vi.mock('../modules/flow-bus/native-share', () => ({
  nativeShareService: {
    getAvailableTargets: nativeShareGetAvailableTargetsMock
  }
}))

vi.mock('../service/device-idle-service', () => ({
  deviceIdleService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
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
    registerNamespace: vi.fn(),
    startCleanup: vi.fn(),
    create: vi.fn(),
    remove: vi.fn()
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
  setLocale: vi.fn()
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
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CommonChannelModule private helpers', () => {
  it('createSafeOperationHandler wraps failures as { success: false, error }', async () => {
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

    expect(result).toEqual({ success: false, error: 'command failed' })
    expect(loggerWarnMock).toHaveBeenCalled()
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

  it('does not register legacy active-app event and capability list still includes dynamic entries', async () => {
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
      isActiveAppCapabilityAvailableMock.mockResolvedValue(true)
      nativeShareGetAvailableTargetsMock.mockReturnValue([{ id: 'mail' }] as never)
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
        'platform.native-share',
        'platform.permission-checker',
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
      isActiveAppCapabilityAvailableMock.mockResolvedValue(true)

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
})
