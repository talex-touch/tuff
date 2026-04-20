import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getAppsMock,
  getAppInfoByPathMock,
  getLoggerMock,
  getMainConfigMock,
  getWatchPathsMock,
  registerPollingMock,
  removeByProviderMock,
  runAdaptiveTaskQueueMock,
  runAppTaskMock,
  runMdlsUpdateScanMock,
  saveMainConfigMock,
  scheduleDbWriteMock,
  searchRecordExecuteMock,
  shellOpenPathMock,
  showInternalSystemNotificationMock,
  spawnSafeMock,
  unregisterPollingMock,
  withSqliteRetryMock
} = vi.hoisted(() => ({
  getAppsMock: vi.fn(),
  getAppInfoByPathMock: vi.fn(),
  getLoggerMock: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })),
  getMainConfigMock: vi.fn(),
  getWatchPathsMock: vi.fn(() => []),
  registerPollingMock: vi.fn(),
  removeByProviderMock: vi.fn(),
  runAdaptiveTaskQueueMock: vi.fn(async (items, handler) => {
    for (let index = 0; index < items.length; index += 1) {
      await handler(items[index], index)
    }
  }),
  runAppTaskMock: vi.fn(async (task: () => Promise<unknown>) => await task()),
  runMdlsUpdateScanMock: vi.fn(),
  saveMainConfigMock: vi.fn(),
  scheduleDbWriteMock: vi.fn(async (_label: string, task: () => Promise<unknown>) => await task()),
  searchRecordExecuteMock: vi.fn(),
  shellOpenPathMock: vi.fn(),
  showInternalSystemNotificationMock: vi.fn(),
  spawnSafeMock: vi.fn(),
  unregisterPollingMock: vi.fn(),
  withSqliteRetryMock: vi.fn(async (task: () => Promise<unknown>) => await task())
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

vi.mock('@talex-touch/utils', () => ({
  completeTiming: vi.fn((_label: string, startedAt: number) => Date.now() - startedAt),
  createRetrier: vi.fn(() => {
    return <T>(task: () => Promise<T>) => {
      return async () => await task()
    }
  }),
  sleep: vi.fn(async () => undefined),
  startTiming: vi.fn(() => Date.now()),
  StorageList: {
    APP_INDEX_SETTINGS: 'APP_INDEX_SETTINGS'
  },
  timingLogger: {
    print: vi.fn((_label: string, durationMs: number) => durationMs)
  }
}))

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'zh-CN')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  shell: {
    openPath: shellOpenPathMock
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: getLoggerMock
}))

vi.mock('@talex-touch/utils/common/utils', () => ({
  runAdaptiveTaskQueue: runAdaptiveTaskQueueMock
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: registerPollingMock,
    unregister: unregisterPollingMock
  }
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  spawnSafe: spawnSafeMock
}))

vi.mock('../../../../core/eventbus/touch-event', () => ({
  TalexEvents: {},
  touchEventBus: {
    on: vi.fn(),
    off: vi.fn()
  },
  DirectoryAddedEvent: class {},
  DirectoryUnlinkedEvent: class {},
  FileAddedEvent: class {},
  FileChangedEvent: class {},
  FileUnlinkedEvent: class {}
}))

vi.mock('../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: scheduleDbWriteMock
  }
}))

vi.mock('../../../../db/sqlite-retry', () => ({
  withSqliteRetry: withSqliteRetryMock
}))

vi.mock('../../../../db/utils', () => ({
  createDbUtils: vi.fn(() => null)
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    isActive: vi.fn(() => false),
    runAppTask: runAppTaskMock,
    waitForIdle: vi.fn(async () => true),
    getSnapshot: vi.fn(() => ({ activeCount: 0, activeLabels: {} }))
  }
}))

vi.mock('../../../../service/device-idle-service', () => ({
  deviceIdleService: {
    canRun: vi.fn(async () => ({ allowed: true })),
    getSettings: vi.fn(() => ({ blockBatteryBelowPercent: 20 })),
    getBatteryStatus: vi.fn(async () => null)
  }
}))

vi.mock('../../../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock
}))

vi.mock('../../../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: showInternalSystemNotificationMock
  }
}))

vi.mock('../../../../utils/i18n-helper', () => ({
  t: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (key === 'notifications.appLaunchFailedTitle') return 'App Launch Failed'
    if (key === 'notifications.appLaunchFailedBody') {
      return `Failed to launch ${params?.name}\n${params?.error}`
    }
    return key
  })
}))

vi.mock('../../file-system-watcher', () => ({
  default: {
    addPath: vi.fn()
  }
}))

vi.mock('../../search-engine/search-core', () => ({
  default: {
    recordExecute: searchRecordExecuteMock
  }
}))

vi.mock('./app-scanner', () => ({
  appScanner: {
    getApps: getAppsMock,
    getAppInfoByPath: getAppInfoByPathMock,
    getWatchPaths: getWatchPathsMock,
    runMdlsUpdateScan: runMdlsUpdateScanMock
  }
}))

vi.mock('./display-name-sync-utils', () => ({
  normalizeDisplayName: vi.fn((value: string | null | undefined) => value ?? null),
  shouldUpdateDisplayName: vi.fn(
    (current: string | null | undefined, next: string | null | undefined) => {
      const normalizedCurrent = current ?? null
      const normalizedNext = next ?? null
      return normalizedCurrent !== normalizedNext
    }
  )
}))

vi.mock('./app-noise-filter', () => ({
  matchNoisySystemAppRule: vi.fn(() => null)
}))

vi.mock('./app-utils', () => ({
  formatLog: vi.fn((_scope: string, message: string) => message),
  LogStyle: {
    info: (message: string) => message,
    warning: (message: string) => message,
    error: (message: string) => message,
    process: (message: string) => message,
    success: (message: string) => message
  }
}))

vi.mock('./search-processing-service', () => ({
  processSearchResults: vi.fn(async () => [])
}))

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

async function loadSubject() {
  return await import('./app-provider')
}

type AppProviderPrivate = {
  buildAppExtensions: (
    fileId: number,
    app: {
      bundleId?: string
      icon?: string
      stableId?: string
      launchKind: string
      launchTarget: string
      launchArgs?: string
      workingDirectory?: string
      displayPath?: string
      description?: string
    }
  ) => Array<{ fileId: number; key: string; value: string }>
  context: unknown
  dbUtils: unknown
  searchIndex: unknown
  fetchExtensionsForFiles: (files: unknown[]) => Promise<unknown[]>
  _clearPendingDeletions: () => Promise<void>
  _initialize: (options?: { forceRefresh?: boolean }) => Promise<void>
  _performFullSync: (forced: boolean) => Promise<void>
  _performMdlsUpdateScan: () => Promise<void>
  _performRebuild: () => Promise<void>
  _performStartupBackfill: () => Promise<void>
  _recordMissingIconApps: (apps: unknown[]) => Promise<void>
  _runFullSync: (forced: boolean) => Promise<void>
  _runMdlsUpdateScan: () => Promise<void>
  _runStartupBackfill: () => Promise<void>
  _setLastFullSyncTime: (timestamp: number) => Promise<void>
  _mapDbAppToScannedInfo: (app: {
    name: string
    displayName?: string | null
    path: string
    mtime: Date
    extensions: Record<string, string>
  }) => {
    description?: string
    displayName?: string
    launchKind: string
  }
}

function asPrivateProvider(provider: unknown): AppProviderPrivate {
  return provider as AppProviderPrivate
}

describe('appProvider rebuild maintenance', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getWatchPathsMock.mockReturnValue([])
    getAppsMock.mockResolvedValue([])
    spawnSafeMock.mockReturnValue({ unref: vi.fn() })
    runMdlsUpdateScanMock.mockResolvedValue({
      updatedApps: [],
      updatedCount: 0,
      deletedApps: []
    })
    getMainConfigMock.mockReturnValue(undefined)
  })

  it('returns immediately while path launch is still pending in the background', async () => {
    const { appProvider } = await loadSubject()
    const launchDeferred = createDeferred<string>()
    shellOpenPathMock.mockReturnValueOnce(launchDeferred.promise)

    await appProvider.onExecute({
      item: {
        id: 'path-app',
        render: { mode: 'default', basic: { title: 'Slow App' } },
        meta: {
          app: {
            path: '/Applications/Slow.app',
            launchKind: 'path',
            launchTarget: '/Applications/Slow.app'
          }
        }
      }
    } as any)

    expect(shellOpenPathMock).not.toHaveBeenCalled()

    await flushPromises()

    expect(shellOpenPathMock).toHaveBeenCalledWith('/Applications/Slow.app')
    expect(showInternalSystemNotificationMock).not.toHaveBeenCalled()

    launchDeferred.resolve('')
    await flushPromises()

    expect(showInternalSystemNotificationMock).not.toHaveBeenCalled()
  })

  it('notifies when a background path launch fails', async () => {
    const { appProvider } = await loadSubject()
    shellOpenPathMock.mockResolvedValueOnce('access denied')

    await appProvider.onExecute({
      item: {
        id: 'path-app-failed',
        render: { mode: 'default', basic: { title: 'Blocked App' } },
        meta: {
          app: {
            path: '/Applications/Blocked.app',
            launchKind: 'path',
            launchTarget: '/Applications/Blocked.app'
          }
        }
      }
    } as any)

    await flushPromises()

    expect(showInternalSystemNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'App Launch Failed',
        message: 'Failed to launch Blocked App\naccess denied',
        level: 'error'
      })
    )
  })

  it('notifies when shortcut spawn fails before handoff', async () => {
    const { appProvider } = await loadSubject()
    spawnSafeMock.mockImplementationOnce(() => {
      throw new Error('spawn failed')
    })

    await appProvider.onExecute({
      item: {
        id: 'shortcut-app-failed',
        render: { mode: 'default', basic: { title: 'Shortcut App' } },
        meta: {
          app: {
            path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk',
            launchKind: 'shortcut',
            launchTarget: 'C:\\Program Files\\Foo\\Foo.exe'
          }
        }
      }
    } as any)

    await flushPromises()

    expect(showInternalSystemNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'App Launch Failed',
        message: 'Failed to launch Shortcut App\nspawn failed',
        level: 'error'
      })
    )
  })

  it('notifies when shortcut exits non-zero before handoff', async () => {
    const { appProvider } = await loadSubject()
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> }
    child.unref = vi.fn()
    spawnSafeMock.mockReturnValueOnce(child)

    await appProvider.onExecute({
      item: {
        id: 'shortcut-app-exit',
        render: { mode: 'default', basic: { title: 'Crashing Shortcut' } },
        meta: {
          app: {
            path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Crash.lnk',
            launchKind: 'shortcut',
            launchTarget: 'C:\\Program Files\\Crash\\Crash.exe'
          }
        }
      }
    } as any)

    await flushPromises()
    child.emit('exit', 1, null)
    await flushPromises()

    expect(showInternalSystemNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'App Launch Failed',
        message: 'Failed to launch Crashing Shortcut\nprocess exited early with code 1',
        level: 'error'
      })
    )
  })

  it('rebuild only clears app records and preserves file records', async () => {
    const { appProvider } = await loadSubject()
    const { files, fileExtensions } = await import('../../../../db/schema')
    const privateProvider = asPrivateProvider(appProvider)

    let selectedAppIds: number[] = []
    let fileRows = [
      { id: 1, type: 'app' },
      { id: 2, type: 'file' }
    ]
    let extensionRows = [
      { fileId: 1, key: 'bundleId' },
      { fileId: 2, key: 'sha1' }
    ]

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => {
            selectedAppIds = fileRows.filter((row) => row.type === 'app').map((row) => row.id)
            return selectedAppIds.map((id) => ({ id }))
          })
        }))
      })),
      transaction: vi.fn(
        async (
          callback: (tx: {
            delete: (table: unknown) => { where: (predicate: unknown) => Promise<void> }
          }) => Promise<void>
        ) => {
          const tx = {
            delete: vi.fn((table: unknown) => ({
              where: vi.fn(async (_predicate: unknown) => {
                if (table === fileExtensions) {
                  extensionRows = extensionRows.filter(
                    (row) => !selectedAppIds.includes(row.fileId)
                  )
                }
                if (table === files) {
                  fileRows = fileRows.filter((row) => !selectedAppIds.includes(row.id))
                }
              })
            }))
          }
          await callback(tx)
        }
      )
    }

    privateProvider.context = {}
    privateProvider.dbUtils = { getDb: () => db }
    privateProvider.searchIndex = { removeByProvider: removeByProviderMock }
    privateProvider._clearPendingDeletions = vi.fn().mockResolvedValue(undefined)
    privateProvider._performFullSync = vi.fn().mockResolvedValue(undefined)

    const result = await appProvider.rebuildIndex()

    expect(result.success).toBe(true)
    expect(fileRows).toEqual([{ id: 2, type: 'file' }])
    expect(extensionRows).toEqual([{ fileId: 2, key: 'sha1' }])
    expect(removeByProviderMock).toHaveBeenCalledWith('app-provider')
    expect(privateProvider._performFullSync).toHaveBeenCalledWith(true)
  })

  it('startup backfill and full sync request fresh scans', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    privateProvider.dbUtils = {
      getFilesByType: vi.fn().mockResolvedValue([])
    }
    privateProvider.searchIndex = {}
    privateProvider.fetchExtensionsForFiles = vi.fn().mockResolvedValue([])
    privateProvider._recordMissingIconApps = vi.fn().mockResolvedValue(undefined)

    await privateProvider._performStartupBackfill()

    expect(getAppsMock).toHaveBeenCalledWith({ forceRefresh: true })

    const initializeMock = vi.fn().mockResolvedValue(undefined)
    privateProvider.dbUtils = {}
    privateProvider._initialize = initializeMock
    privateProvider._setLastFullSyncTime = vi.fn().mockResolvedValue(undefined)

    await privateProvider._performFullSync(false)

    expect(initializeMock).toHaveBeenCalledWith({ forceRefresh: true })
  })

  it('serializes rebuild, full sync, mdls scan and startup backfill tasks', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const executionOrder: string[] = []
    const rebuildDeferred = createDeferred<void>()

    privateProvider.context = {}
    privateProvider.dbUtils = {}
    privateProvider._performRebuild = vi.fn(async () => {
      executionOrder.push('rebuild:start')
      await rebuildDeferred.promise
      executionOrder.push('rebuild:end')
    })
    privateProvider._performFullSync = vi.fn(async () => {
      executionOrder.push('full-sync')
    })
    privateProvider._performMdlsUpdateScan = vi.fn(async () => {
      executionOrder.push('mdls')
    })
    privateProvider._performStartupBackfill = vi.fn(async () => {
      executionOrder.push('startup-backfill')
    })

    const rebuildPromise = appProvider.rebuildIndex()
    await flushPromises()

    const fullSyncPromise = privateProvider._runFullSync(false)
    const mdlsPromise = privateProvider._runMdlsUpdateScan()
    const backfillPromise = privateProvider._runStartupBackfill()
    await flushPromises()

    expect(executionOrder).toEqual(['rebuild:start'])

    rebuildDeferred.resolve()
    await Promise.all([rebuildPromise, fullSyncPromise, mdlsPromise, backfillPromise])

    expect(executionOrder).toEqual([
      'rebuild:start',
      'rebuild:end',
      'full-sync',
      'mdls',
      'startup-backfill'
    ])
  })

  it('launches shortcut apps with spawn and preserved args', async () => {
    const { appProvider } = await loadSubject()

    await appProvider.onExecute({
      item: {
        id: 'shortcut-app',
        meta: {
          app: {
            path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk',
            launchKind: 'shortcut',
            launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
            launchArgs: '--profile work --flag',
            workingDirectory: 'C:\\Program Files\\Foo'
          }
        }
      }
    } as any)

    await flushPromises()

    expect(spawnSafeMock).toHaveBeenCalledWith(
      'C:\\Program Files\\Foo\\Foo.exe',
      ['--profile', 'work', '--flag'],
      {
        cwd: 'C:\\Program Files\\Foo',
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('launches Windows Store apps through explorer shell target', async () => {
    const { appProvider } = await loadSubject()

    await appProvider.onExecute({
      item: {
        id: 'uwp-app',
        meta: {
          app: {
            path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
            launchKind: 'uwp',
            launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
          }
        }
      }
    } as any)

    await flushPromises()

    expect(spawnSafeMock).toHaveBeenCalledWith(
      'explorer.exe',
      ['shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('persists and restores app description through extensions', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    const extensions = privateProvider.buildAppExtensions(7, {
      launchKind: 'uwp',
      launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      description: 'Built-in calculator app'
    })

    expect(extensions).toContainEqual({
      fileId: 7,
      key: 'description',
      value: 'Built-in calculator app'
    })

    const mapped = privateProvider._mapDbAppToScannedInfo({
      name: 'Windows Calculator',
      displayName: 'Calculator',
      path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      mtime: new Date(0),
      extensions: {
        description: 'Built-in calculator app',
        launchKind: 'uwp',
        launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      }
    })

    expect(mapped.displayName).toBe('Calculator')
    expect(mapped.description).toBe('Built-in calculator app')
    expect(mapped.launchKind).toBe('uwp')
  })
})
