import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppEvents } from '@talex-touch/utils/transport/events'

const { fsReadFileMock, loggerWarnMock, perfDisposeMock } = vi.hoisted(() => ({
  fsReadFileMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  perfDisposeMock: vi.fn()
}))

vi.mock('@talex-touch/utils', () => ({
  isLocalhostUrl: vi.fn(() => false)
}))

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
  getTuffTransportMain: vi.fn(() => null)
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: fsReadFileMock,
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn()
  }
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null)
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
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
  }
}))

vi.mock('../config/default', () => ({
  APP_SCHEMA: 'app',
  FILE_SCHEMA: 'tfile'
}))

vi.mock('../core/channel-core', () => ({
  genTouchChannel: vi.fn(() => ({}))
}))

vi.mock('../core/eventbus/touch-event', () => ({
  TalexEvents: {},
  touchEventBus: {
    on: vi.fn(),
    off: vi.fn()
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
    list: vi.fn(() => [])
  },
  registerDefaultPlatformCapabilities: vi.fn()
}))

vi.mock('../modules/storage', () => ({
  storageModule: {
    getStorage: vi.fn(() => ({
      remove: vi.fn()
    }))
  }
}))

vi.mock('../modules/system/active-app', () => ({
  activeAppService: {
    getActiveApp: vi.fn()
  }
}))

vi.mock('../service/device-idle-service', () => ({
  deviceIdleService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn()
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
  checkPlatformCompatibility: vi.fn(() => null)
}))

vi.mock('../utils/i18n-helper', () => ({
  setLocale: vi.fn()
}))

vi.mock('../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    warn: loggerWarnMock,
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }))
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

interface CommonChannelModuleTestInstance extends CommonChannelModule {
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
    const result = await registeredHandler?.({}, {})

    expect(result).toEqual({ success: false, error: 'command failed' })
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  it('readSystemFile reuses inflight promise and caches successful reads', async () => {
    const module = new CommonChannelModule() as unknown as CommonChannelModuleTestInstance

    let resolveRead: ((value: string) => void) | null = null
    const readPromise = new Promise<string>((resolve) => {
      resolveRead = resolve
    })

    fsReadFileMock.mockReturnValueOnce(readPromise)

    const payload = { source: '/tmp/common-channel-read.txt' }
    const first = module.readSystemFile(payload)
    const second = module.readSystemFile(payload)

    resolveRead?.('hello-world')

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
})
