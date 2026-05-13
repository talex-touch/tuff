import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWatchPathMock,
  asPrivateProvider,
  createDeferred,
  flushPromises,
  getAppInfoByPathMock,
  getAppsMock,
  getMainConfigMock,
  getWatchPathsMock,
  loadSubject,
  pinyinMock,
  removeByProviderMock,
  runMdlsUpdateScanMock,
  shellOpenPathMock,
  showInternalSystemNotificationMock,
  spawnSafeMock,
  upsertExtensionRows,
  withPlatform
} from './app-provider-test-harness'
import { buildAppExtensions } from './app-index-metadata'

describe('appProvider rebuild maintenance', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    addWatchPathMock.mockResolvedValue(undefined)
    getWatchPathsMock.mockReturnValue([])
    getAppsMock.mockResolvedValue([])
    spawnSafeMock.mockReturnValue({ unref: vi.fn() })
    runMdlsUpdateScanMock.mockResolvedValue({
      updatedApps: [],
      updatedCount: 0,
      deletedApps: []
    })
    getMainConfigMock.mockReturnValue(undefined)
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (options?.pattern === 'first') {
        return value === '微信' ? 'WX' : value
      }
      return value === '微信' ? 'WEI XIN' : value
    })
  })

  it('subscribes and watches Start Menu paths on Windows', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const { touchEventBus, TalexEvents } = await import('../../../../core/eventbus/touch-event')
      const watchPaths = [
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
        'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
      ]
      getWatchPathsMock.mockReturnValue(watchPaths)

      await appProvider.onLoad({
        databaseManager: { getDb: vi.fn() },
        searchIndex: { indexItems: vi.fn() }
      } as any)

      expect(touchEventBus.on).toHaveBeenCalledWith(TalexEvents.FILE_ADDED, expect.any(Function))
      expect(touchEventBus.on).toHaveBeenCalledWith(TalexEvents.FILE_CHANGED, expect.any(Function))
      expect(touchEventBus.on).toHaveBeenCalledWith(TalexEvents.FILE_UNLINKED, expect.any(Function))
      expect(addWatchPathMock).toHaveBeenCalledWith(watchPaths[0], 4)
      expect(addWatchPathMock).toHaveBeenCalledWith(watchPaths[1], 4)
    })
  })

  it('processes Windows shortcut changes and ignores unrelated file events', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const shortcutPath =
        'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk'
      const appInfo = {
        name: 'Foo',
        displayName: 'Foo',
        path: shortcutPath,
        icon: '',
        bundleId: '',
        uniqueId: 'shortcut:c:\\program files\\foo\\foo.exe|',
        stableId: 'shortcut:c:\\program files\\foo\\foo.exe|',
        launchKind: 'shortcut' as const,
        launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
        lastModified: new Date('2026-05-08T00:00:00.000Z')
      }
      const insertedFile = {
        id: 42,
        path: shortcutPath,
        name: 'Foo',
        displayName: 'Foo',
        type: 'app',
        mtime: appInfo.lastModified,
        ctime: appInfo.lastModified
      }
      const valuesMock = vi.fn(() => ({
        returning: vi.fn(async () => [insertedFile])
      }))

      getAppInfoByPathMock.mockResolvedValue(appInfo)
      ;(privateProvider as any)._waitForItemStable = vi.fn(async () => true)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: vi.fn(() => ({
            values: valuesMock
          }))
        }),
        addFileExtensions: vi.fn(async () => undefined)
      }
      privateProvider.searchIndex = { indexItems: vi.fn(async () => undefined) }

      const processResult = await (privateProvider as any).handleItemAddedOrChanged({
        filePath: shortcutPath
      })
      await processResult

      expect(getAppInfoByPathMock).toHaveBeenCalledWith(shortcutPath)
      expect(valuesMock).toHaveBeenCalled()

      getAppInfoByPathMock.mockClear()
      await (privateProvider as any).handleItemAddedOrChanged({
        filePath:
          'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\note.txt'
      })

      expect(getAppInfoByPathMock).not.toHaveBeenCalled()
    })
  })

  it('processes Windows ClickOnce appref-ms changes as app index entries', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const apprefPath =
        'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Work Tool.appref-ms'
      const appInfo = {
        name: 'Work Tool',
        displayName: 'Work Tool',
        path: apprefPath,
        icon: '',
        bundleId: '',
        uniqueId: apprefPath.toLowerCase(),
        stableId: apprefPath.toLowerCase(),
        launchKind: 'path' as const,
        launchTarget: apprefPath,
        lastModified: new Date('2026-05-08T00:00:00.000Z')
      }
      const insertedFile = {
        id: 43,
        path: apprefPath,
        name: 'Work Tool',
        displayName: 'Work Tool',
        type: 'app',
        mtime: appInfo.lastModified,
        ctime: appInfo.lastModified
      }
      const valuesMock = vi.fn(() => ({
        returning: vi.fn(async () => [insertedFile])
      }))

      getAppInfoByPathMock.mockResolvedValue(appInfo)
      ;(privateProvider as any)._waitForItemStable = vi.fn(async () => true)
      const addFileExtensionsMock = vi.fn(async () => undefined)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: vi.fn(() => ({
            values: valuesMock
          }))
        }),
        addFileExtensions: addFileExtensionsMock
      }
      privateProvider.searchIndex = { indexItems: vi.fn(async () => undefined) }

      await (privateProvider as any).handleItemAddedOrChanged({
        filePath: apprefPath
      })

      expect(getAppInfoByPathMock).toHaveBeenCalledWith(apprefPath)
      expect(valuesMock).toHaveBeenCalled()
      expect(addFileExtensionsMock).toHaveBeenCalledWith(
        expect.not.arrayContaining([
          expect.objectContaining({ fileId: 43, key: 'entrySource', value: 'manual' }),
          expect.objectContaining({ fileId: 43, key: 'entryEnabled', value: '1' })
        ])
      )
    })
  })

  it('adds copied Windows UWP shell paths without file stability checks', async () => {
    await withPlatform('win32', async () => {
      vi.resetModules()
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const shellPath = 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      const appInfo = {
        name: 'Calculator',
        displayName: 'Calculator',
        path: shellPath,
        icon: '',
        bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
        appIdentity: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        uniqueId: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app',
        stableId: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app',
        launchKind: 'uwp' as const,
        launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        lastModified: new Date(0)
      }
      const insertedFile = {
        id: 44,
        path: shellPath,
        name: 'Calculator',
        displayName: 'Calculator',
        type: 'app',
        mtime: appInfo.lastModified,
        ctime: appInfo.lastModified
      }
      const valuesMock = vi.fn(() => ({
        returning: vi.fn(async () => [insertedFile])
      }))
      const insertMock = vi.fn(() => ({
        values: valuesMock
      }))
      const deleteMock = vi.fn(() => ({
        where: vi.fn(async () => undefined)
      }))
      const indexItemsMock = vi.fn(async () => undefined)
      const waitForItemStable = vi.fn(async () => true)

      getAppInfoByPathMock.mockResolvedValue(appInfo)
      ;(privateProvider as any)._waitForItemStable = waitForItemStable
      const addFileExtensionsMock = vi.fn(async () => undefined)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: insertMock,
          delete: deleteMock
        }),
        addFileExtensions: addFileExtensionsMock
      }
      privateProvider.searchIndex = { indexItems: indexItemsMock }

      const result = await appProvider.addAppByPath(shellPath)

      expect(result).toEqual({ success: true, status: 'added', path: shellPath })
      expect(waitForItemStable).not.toHaveBeenCalled()
      expect(getAppInfoByPathMock).toHaveBeenCalledWith(shellPath)
      expect(valuesMock).toHaveBeenCalled()
      expect(addFileExtensionsMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          { fileId: 44, key: 'entrySource', value: 'manual' },
          { fileId: 44, key: 'entryEnabled', value: '1' }
        ])
      )
      expect(indexItemsMock).toHaveBeenCalledTimes(1)
    })
  })

  it('normalizes copied Windows UWP app ids before app indexing', async () => {
    await withPlatform('win32', async () => {
      vi.resetModules()
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const appId = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      const shellPath = `shell:AppsFolder\\${appId}`
      const appInfo = {
        name: 'Calculator',
        displayName: 'Calculator',
        path: shellPath,
        icon: '',
        bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
        appIdentity: appId,
        uniqueId: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app',
        stableId: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app',
        launchKind: 'uwp' as const,
        launchTarget: appId,
        lastModified: new Date(0)
      }
      const insertedFile = {
        id: 45,
        path: shellPath,
        name: 'Calculator',
        displayName: 'Calculator',
        type: 'app',
        mtime: appInfo.lastModified,
        ctime: appInfo.lastModified
      }
      const valuesMock = vi.fn(() => ({
        returning: vi.fn(async () => [insertedFile])
      }))
      const insertMock = vi.fn(() => ({
        values: valuesMock
      }))
      const indexItemsMock = vi.fn(async () => undefined)
      const waitForItemStable = vi.fn(async () => true)

      getAppInfoByPathMock.mockResolvedValue(appInfo)
      ;(privateProvider as any)._waitForItemStable = waitForItemStable
      const addFileExtensionsMock = vi.fn(async () => undefined)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: insertMock,
          delete: vi.fn(() => ({
            where: vi.fn(async () => undefined)
          }))
        }),
        addFileExtensions: addFileExtensionsMock
      }
      privateProvider.searchIndex = { indexItems: indexItemsMock }

      const result = await appProvider.addAppByPath(appId)

      expect(result).toEqual({ success: true, status: 'added', path: shellPath })
      expect(waitForItemStable).not.toHaveBeenCalled()
      expect(getAppInfoByPathMock).toHaveBeenCalledWith(shellPath)
      expect(addFileExtensionsMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          { fileId: 45, key: 'entrySource', value: 'manual' },
          { fileId: 45, key: 'entryEnabled', value: '1' }
        ])
      )
      expect(indexItemsMock).toHaveBeenCalledTimes(1)
    })
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

    const scannedAppIds = [1]
    let fileRows = [
      { id: 1, path: '/Applications/Scanned.app', type: 'app' },
      { id: 2, path: '/Users/demo/bin/custom.sh', type: 'app' },
      { id: 3, type: 'file' }
    ]
    let extensionRows = [
      { fileId: 1, key: 'bundleId', value: 'com.demo.scanned' },
      { fileId: 2, key: 'entrySource', value: 'manual' },
      { fileId: 2, key: 'entryEnabled', value: '1' },
      { fileId: 3, key: 'sha1', value: 'abc123' }
    ]

    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(async () => {
            if (table === files) {
              return fileRows.filter((row) => row.type === 'app')
            }
            if (table === fileExtensions) {
              return extensionRows.filter((row) => row.fileId === 1 || row.fileId === 2)
            }
            return []
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
                  extensionRows = extensionRows.filter((row) => !scannedAppIds.includes(row.fileId))
                }
                if (table === files) {
                  fileRows = fileRows.filter((row) => !scannedAppIds.includes(row.id))
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
    privateProvider.reindexManagedEntries = vi.fn().mockResolvedValue(undefined)

    const result = await appProvider.rebuildIndex()

    expect(result.success).toBe(true)
    expect(fileRows).toEqual([
      { id: 2, path: '/Users/demo/bin/custom.sh', type: 'app' },
      { id: 3, type: 'file' }
    ])
    expect(extensionRows).toEqual([
      { fileId: 2, key: 'entrySource', value: 'manual' },
      { fileId: 2, key: 'entryEnabled', value: '1' },
      { fileId: 3, key: 'sha1', value: 'abc123' }
    ])
    expect(removeByProviderMock).toHaveBeenCalledWith('app-provider')
    expect(privateProvider.reindexManagedEntries).toHaveBeenCalledTimes(1)
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

  it('repairs corrupted display names during startup backfill', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const dbRow = {
      id: 80,
      path: 'D:\\Weixin\\Weixin.exe',
      name: 'Weixin',
      displayName: '\u03A2\uFFFD\uFFFD',
      type: 'app',
      mtime: new Date('2026-05-05T08:00:00Z'),
      ctime: new Date('2026-05-05T08:00:00Z')
    }
    const scannedApp = {
      name: 'WeChat',
      displayName: 'WeChat',
      displayNameQuality: 'localized',
      path: 'D:\\Weixin\\Weixin.exe',
      icon: '',
      bundleId: '',
      uniqueId: 'path:d:\\weixin\\weixin.exe',
      stableId: 'path:d:\\weixin\\weixin.exe',
      launchKind: 'path' as const,
      launchTarget: 'D:\\Weixin\\Weixin.exe',
      lastModified: new Date('2026-05-05T09:00:00Z')
    }
    let updatedDisplayName: string | null = dbRow.displayName

    getAppsMock.mockResolvedValue([scannedApp])

    privateProvider.dbUtils = {
      getFilesByType: vi.fn().mockResolvedValue([dbRow]),
      getDb: () => ({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() => ({
              returning: vi.fn(async () => [])
            }))
          }))
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: { displayName?: string }) => ({
            where: vi.fn(async () => {
              if (values.displayName) {
                updatedDisplayName = values.displayName
              }
            })
          }))
        }))
      }),
      addFileExtensions: vi.fn(async () => undefined)
    }
    privateProvider.searchIndex = { indexItems: vi.fn(async () => undefined) }
    privateProvider.fetchExtensionsForFiles = vi.fn(async (files: unknown[]) =>
      files.map((file) => ({
        ...(file as typeof dbRow),
        extensions: {
          appIdentity: 'path:d:\\weixin\\weixin.exe',
          displayNameQuality: 'filename'
        }
      }))
    )
    privateProvider._recordMissingIconApps = vi.fn().mockResolvedValue(undefined)

    await privateProvider._performStartupBackfill()

    expect(updatedDisplayName).toBe('WeChat')
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

    const extensions = buildAppExtensions(7, {
      bundleId: '',
      icon: '',
      stableId: 'uwp:calculator',
      uniqueId: 'uwp:calculator',
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

  it('normalizes displayName pinyin keywords to lowercase', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    const keywords = await privateProvider._generateKeywordsForApp({
      name: 'WeChat',
      displayName: '微信',
      fileName: 'WeChat',
      path: '/Applications/WeChat.app',
      launchKind: 'path',
      launchTarget: '/Applications/WeChat.app',
      stableId: '/Applications/WeChat.app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(keywords).toContain('微信')
    expect(keywords).toContain('weixin')
    expect(keywords).toContain('wx')
    expect(keywords).not.toContain('WEIXIN')
    expect(keywords).not.toContain('WX')
  })

  it('generates keywords from alternate localized names', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (value === '网易云音乐') {
        return options?.pattern === 'first' ? 'WYYY' : 'WANG YI YUN YIN YUE'
      }
      return value
    })

    const keywords = await privateProvider._generateKeywordsForApp({
      name: 'NeteaseMusic 2',
      displayName: 'NeteaseMusic 2',
      alternateNames: ['网易云音乐'],
      path: '/Applications/NeteaseMusic 2.app',
      launchKind: 'path',
      launchTarget: '/Applications/NeteaseMusic 2.app',
      stableId: '/Applications/NeteaseMusic 2.app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(keywords).toContain('网易云音乐')
    expect(keywords).toContain('wangyiyunyinyue')
    expect(keywords).toContain('wyyy')
  })

  it('indexes app keywords by stable path before bundle id to avoid duplicate bundle collisions', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const indexItemsMock = vi.fn(async () => undefined)
    const removeItemsMock = vi.fn(async () => undefined)
    privateProvider.searchIndex = {
      indexItems: indexItemsMock,
      removeItems: removeItemsMock
    }

    await privateProvider._syncKeywordsForApp({
      name: 'NeteaseMusic 2',
      displayName: 'NeteaseMusic 2',
      alternateNames: ['网易云音乐'],
      bundleId: 'com.netease.163music',
      path: '/Applications/NeteaseMusic 2.app',
      launchKind: 'path',
      launchTarget: '/Applications/NeteaseMusic 2.app',
      stableId: '/Applications/NeteaseMusic 2.app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(indexItemsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: '/Applications/NeteaseMusic 2.app',
        tags: expect.arrayContaining(['com.netease.163music']),
        keywords: expect.arrayContaining([expect.objectContaining({ value: '网易云音乐' })])
      })
    ])
    expect(removeItemsMock).toHaveBeenCalledWith(['com.netease.163music'])
  })

  it('indexes Windows Store app keywords by UWP stable id', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const indexItemsMock = vi.fn(async () => undefined)
    privateProvider.searchIndex = { indexItems: indexItemsMock }

    await privateProvider._syncKeywordsForApp({
      name: 'Codex',
      displayName: 'Codex',
      fileName: 'Codex',
      bundleId: 'OpenAI.Codex_2p2nqsd0c76g0',
      path: 'shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App',
      launchKind: 'uwp',
      launchTarget: 'OpenAI.Codex_2p2nqsd0c76g0!App',
      stableId: 'uwp:openai.codex_2p2nqsd0c76g0!app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(indexItemsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: 'uwp:openai.codex_2p2nqsd0c76g0!app',
        extension: '.uwp',
        path: 'shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App',
        tags: expect.arrayContaining([
          'OpenAI.Codex_2p2nqsd0c76g0',
          'uwp:openai.codex_2p2nqsd0c76g0!app',
          'shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'
        ]),
        keywords: expect.arrayContaining([expect.objectContaining({ value: 'codex' })])
      })
    ])
  })

  it('keeps steady-state keyword sync removal as a no-op when no retired ids exist', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const indexItemsMock = vi.fn(async () => undefined)
    const removeItemsMock = vi.fn(async () => undefined)
    privateProvider.searchIndex = {
      indexItems: indexItemsMock,
      removeItems: removeItemsMock
    }

    await privateProvider._syncKeywordsForApp({
      name: 'NeteaseMusic 2',
      displayName: 'NeteaseMusic 2',
      alternateNames: ['网易云音乐'],
      bundleId: '',
      path: '/Applications/NeteaseMusic 2.app',
      launchKind: 'path',
      launchTarget: '/Applications/NeteaseMusic 2.app',
      stableId: '/Applications/NeteaseMusic 2.app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(removeItemsMock).not.toHaveBeenCalled()
    expect(indexItemsMock).toHaveBeenCalledTimes(1)
  })

  it('diagnoses indexed app keywords and query recall stages', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (value === '网易云音乐') {
        return options?.pattern === 'first' ? 'WYYY' : 'WANG YI YUN YIN YUE'
      }
      return value
    })

    const appRow = {
      id: 7,
      path: '/Applications/NeteaseMusic 2.app',
      name: 'NeteaseMusic 2',
      displayName: 'NeteaseMusic 2',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        bundleId: 'com.netease.163music',
        appIdentity: '/Applications/NeteaseMusic 2.app',
        alternateNames: JSON.stringify(['网易云音乐']),
        launchKind: 'path',
        launchTarget: '/Applications/NeteaseMusic 2.app'
      }
    }
    const keywordRows = [
      { value: 'neteasemusic', priority: 1.1 },
      { value: '网易云音乐', priority: 1.1 },
      { value: 'wangyiyunyinyue', priority: 1.1 },
      { value: 'wyyy', priority: 1.1 },
      { value: 'ng:wy', priority: 1.1 }
    ]
    const limitMock = vi.fn(async () => keywordRows)
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: limitMock
          }))
        }))
      }))
    }
    const lookupByKeywordsMock = vi.fn(async () => {
      return new Map([
        [
          'wyyy',
          [
            {
              itemId: '/Applications/NeteaseMusic 2.app',
              priority: 1.1
            }
          ]
        ]
      ])
    })

    privateProvider.dbUtils = {
      getDb: () => db,
      getFilesByType: vi.fn(async () => [appRow])
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [appRow])
    privateProvider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: vi.fn(async () => [
        {
          itemId: '/Applications/NeteaseMusic 2.app',
          keyword: 'wyyy',
          priority: 1.1
        }
      ]),
      search: vi.fn(async () => [{ itemId: '/Applications/NeteaseMusic 2.app', score: -1 }]),
      lookupByNgrams: vi.fn(async () => [
        { itemId: '/Applications/NeteaseMusic 2.app', overlapCount: 2 }
      ]),
      lookupBySubsequence: vi.fn(async () => [
        {
          itemId: '/Applications/NeteaseMusic 2.app',
          keyword: 'wangyiyunyinyue',
          priority: 1.1
        }
      ])
    }

    const result = await appProvider.diagnoseAppSearch({
      target: 'com.netease.163music',
      query: 'wyyy'
    })

    expect(result).toMatchObject({
      success: true,
      status: 'found',
      app: {
        path: '/Applications/NeteaseMusic 2.app',
        displayName: 'NeteaseMusic 2',
        rawDisplayName: 'NeteaseMusic 2',
        displayNameStatus: 'clean',
        bundleId: 'com.netease.163music',
        alternateNames: ['网易云音乐']
      },
      index: {
        itemId: '/Applications/NeteaseMusic 2.app',
        generatedKeywords: expect.arrayContaining(['网易云音乐', 'wangyiyunyinyue', 'wyyy']),
        storedKeywords: expect.arrayContaining(['neteasemusic', '网易云音乐', 'wyyy'])
      },
      query: {
        normalized: 'wyyy',
        ftsQuery: 'wyyy',
        stages: {
          precise: { ran: true, targetHit: true },
          prefix: { ran: true, targetHit: true },
          fts: { ran: true, targetHit: true },
          ngram: { ran: true, targetHit: true },
          subsequence: { ran: true, targetHit: true }
        }
      }
    })
    expect(result).not.toMatchObject({
      index: {
        storedKeywords: expect.arrayContaining(['ng:wy'])
      }
    })
  })

  it('diagnoses corrupted displayName fallback status for app index evidence', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const appRow = {
      id: 8,
      path: 'D:\\Weixin\\Weixin.exe',
      name: 'WeChat',
      displayName: '\u03A2\uFFFD\uFFFD',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        appIdentity: 'path:d:\\weixin\\weixin.exe',
        launchKind: 'path',
        launchTarget: 'D:\\Weixin\\Weixin.exe'
      }
    }

    privateProvider.dbUtils = {
      getDb: () => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [])
            }))
          }))
        }))
      }),
      getFilesByType: vi.fn(async () => [appRow])
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [appRow])
    privateProvider.searchIndex = {
      lookupByKeywords: vi.fn(async () => new Map()),
      lookupByKeywordPrefix: vi.fn(async () => []),
      search: vi.fn(async () => []),
      lookupByNgrams: vi.fn(async () => []),
      lookupBySubsequence: vi.fn(async () => [])
    }

    const result = await appProvider.diagnoseAppSearch({
      target: 'WeChat',
      query: 'wechat'
    })

    expect(result).toMatchObject({
      success: true,
      status: 'found',
      app: {
        name: 'WeChat',
        displayName: 'WeChat',
        rawDisplayName: '\u03A2\uFFFD\uFFFD',
        displayNameStatus: 'fallback',
        launchKind: 'path',
        launchTarget: 'D:\\Weixin\\Weixin.exe'
      }
    })
  })

  it('requires confirmation before reindexing a matched diagnostic target', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const indexItemsMock = vi.fn(async () => undefined)
    const appRow = {
      id: 9,
      path: '/Applications/NeteaseMusic 2.app',
      name: 'NeteaseMusic 2',
      displayName: 'NeteaseMusic 2',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        bundleId: 'com.netease.163music',
        appIdentity: '/Applications/NeteaseMusic 2.app',
        alternateNames: JSON.stringify(['网易云音乐']),
        launchKind: 'path',
        launchTarget: '/Applications/NeteaseMusic 2.app'
      }
    }

    privateProvider.dbUtils = {
      getFilesByType: vi.fn(async () => [appRow])
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [appRow])
    privateProvider.searchIndex = { indexItems: indexItemsMock }

    const result = await appProvider.reindexAppSearchTarget({
      target: '网易云音乐',
      mode: 'keywords'
    })

    expect(result).toEqual({
      success: false,
      status: 'reindexed',
      requiresConfirm: true,
      path: '/Applications/NeteaseMusic 2.app',
      message: 'App index reindex requires confirmation'
    })
    expect(indexItemsMock).not.toHaveBeenCalled()
    expect(getAppInfoByPathMock).not.toHaveBeenCalled()
  })

  it('reindexes a matched diagnostic target only after confirmation', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const indexItemsMock = vi.fn(async () => undefined)
    const appRow = {
      id: 9,
      path: '/Applications/NeteaseMusic 2.app',
      name: 'NeteaseMusic 2',
      displayName: 'NeteaseMusic 2',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        bundleId: 'com.netease.163music',
        appIdentity: '/Applications/NeteaseMusic 2.app',
        alternateNames: JSON.stringify(['网易云音乐']),
        launchKind: 'path',
        launchTarget: '/Applications/NeteaseMusic 2.app'
      }
    }

    privateProvider.dbUtils = {
      getFilesByType: vi.fn(async () => [appRow])
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [appRow])
    privateProvider.searchIndex = { indexItems: indexItemsMock }

    const result = await appProvider.reindexAppSearchTarget({
      target: '网易云音乐',
      mode: 'keywords',
      force: true
    })

    expect(result).toEqual({
      success: true,
      status: 'reindexed',
      path: '/Applications/NeteaseMusic 2.app',
      message: 'App index reindex complete'
    })
    expect(indexItemsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: '/Applications/NeteaseMusic 2.app',
        keywords: expect.arrayContaining([expect.objectContaining({ value: '网易云音乐' })])
      })
    ])
    expect(getAppInfoByPathMock).not.toHaveBeenCalled()
  })

  it('clears stale optional app extensions when a later scan has none', async () => {
    const { appProvider } = await loadSubject()
    const { fileExtensions } = await import('../../../../db/schema')
    const privateProvider = asPrivateProvider(appProvider)
    type ExtensionRow = { fileId: number; key: string; value: string }
    const addFileExtensionsMock = vi.fn(async (_rows: ExtensionRow[]) => undefined)
    const deleteWhereMock = vi.fn(async () => undefined)
    const deleteMock = vi.fn((table: unknown) => {
      expect(table).toBe(fileExtensions)
      return { where: deleteWhereMock }
    })

    privateProvider.dbUtils = {
      addFileExtensions: addFileExtensionsMock,
      getDb: () => ({
        delete: deleteMock
      })
    }

    await privateProvider.syncScannedAppExtensions(7, {
      bundleId: 'com.example.music',
      stableId: '/Applications/Music.app',
      launchKind: 'path',
      launchTarget: '/Applications/Music.app'
    })

    expect(addFileExtensionsMock).toHaveBeenCalled()
    const extensions = addFileExtensionsMock.mock.calls[0]?.[0] ?? []
    expect(extensions).toEqual(
      expect.arrayContaining([
        { fileId: 7, key: 'bundleId', value: 'com.example.music' },
        { fileId: 7, key: 'appIdentity', value: '/Applications/Music.app' }
      ])
    )
    expect(extensions.some((extension) => extension.key === 'alternateNames')).toBe(false)
    expect(extensions.some((extension) => extension.key === 'icon')).toBe(false)
    expect(deleteWhereMock).toHaveBeenCalledTimes(1)
  })

  it('updates app extensions when the stored icon path is missing', async () => {
    const { appProvider } = await loadSubject()
    const { files, fileExtensions } = await import('../../../../db/schema')
    const privateProvider = asPrivateProvider(appProvider)
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-provider-icon-drift-'))
    const nextIconPath = path.join(tempDir, 'next-icon.png')
    const missingIconPath = path.join(tempDir, 'missing-icon.png')
    await fs.writeFile(nextIconPath, 'png')

    const scannedApp = {
      name: 'Icon Drift',
      displayName: 'Icon Drift',
      path: '/Applications/Icon Drift.app',
      icon: nextIconPath,
      bundleId: 'com.example.icondrift',
      uniqueId: 'com.example.icondrift',
      stableId: 'com.example.icondrift',
      launchKind: 'path' as const,
      launchTarget: '/Applications/Icon Drift.app',
      lastModified: new Date('2026-05-01T00:00:00Z')
    }
    const dbApp = {
      id: 91,
      path: scannedApp.path,
      name: scannedApp.name,
      displayName: scannedApp.displayName,
      type: 'app',
      mtime: scannedApp.lastModified,
      ctime: scannedApp.lastModified,
      extensions: {
        bundleId: scannedApp.bundleId,
        appIdentity: scannedApp.stableId,
        icon: missingIconPath,
        launchKind: 'path',
        launchTarget: scannedApp.launchTarget
      }
    }
    const updateSetMock = vi.fn(() => ({ where: vi.fn(async () => undefined) }))
    const updateMock = vi.fn((table: unknown) => {
      expect(table).toBe(files)
      return { set: updateSetMock }
    })
    const deleteWhereMock = vi.fn(async () => undefined)
    const deleteMock = vi.fn((table: unknown) => {
      expect(table).toBe(fileExtensions)
      return { where: deleteWhereMock }
    })
    const addFileExtensionsMock = vi.fn(
      async (_rows: Array<{ fileId: number; key: string; value: string }>) => undefined
    )
    const indexItemsMock = vi.fn(async () => undefined)

    privateProvider.dbUtils = {
      getFilesByType: vi.fn(async () => [dbApp]),
      getDb: () => ({
        update: updateMock,
        delete: deleteMock
      }),
      addFileExtensions: addFileExtensionsMock
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [dbApp])
    privateProvider.loadScannedApps = vi.fn(async () => [scannedApp])
    privateProvider._recordMissingIconApps = vi.fn(async () => undefined)
    privateProvider._processAppsForDeletion = vi.fn(async () => [])
    privateProvider.searchIndex = { indexItems: indexItemsMock }

    try {
      await privateProvider._initialize({ forceRefresh: true })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }

    expect(addFileExtensionsMock).toHaveBeenCalledWith(
      expect.arrayContaining([{ fileId: 91, key: 'icon', value: nextIconPath }])
    )
    expect(indexItemsMock).toHaveBeenCalledTimes(1)
  })

  it('upserts managed launcher entries with manual extension flags', async () => {
    const { appProvider } = await loadSubject()
    const { files, fileExtensions } = await import('../../../../db/schema')
    const privateProvider = asPrivateProvider(appProvider)

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-provider-managed-'))
    const scriptPath = path.join(tempDir, 'demo-script.sh')
    await fs.writeFile(scriptPath, '#!/bin/sh\nexit 0\n', 'utf8')

    let nextId = 1
    let fileRows: Array<Record<string, any>> = []
    const extensionRows: Array<{ fileId: number; key: string; value: string }> = []
    const indexItemsMock = vi.fn(async () => undefined)
    const removeItemsMock = vi.fn(async () => undefined)

    const db = {
      insert: vi.fn((table: unknown) => {
        expect(table).toBe(files)
        return {
          values: vi.fn((payload: Record<string, any>) => ({
            returning: vi.fn(async () => {
              const row = {
                id: nextId++,
                ...payload,
                displayName: payload.displayName ?? null
              }
              fileRows.push(row)
              return [row]
            })
          }))
        }
      }),
      update: vi.fn((table: unknown) => {
        expect(table).toBe(files)
        return {
          set: vi.fn((payload: Record<string, any>) => ({
            where: vi.fn(async () => {
              fileRows = fileRows.map((row) =>
                row.path === scriptPath
                  ? { ...row, ...payload, displayName: payload.displayName ?? row.displayName }
                  : row
              )
            })
          }))
        }
      }),
      transaction: vi.fn(
        async (
          callback: (tx: {
            delete: (table: unknown) => { where: (predicate: unknown) => Promise<void> }
          }) => Promise<void>
        ) => {
          const managedFileId = fileRows.find((row) => row.path === scriptPath)?.id ?? -1
          const tx = {
            delete: vi.fn((table: unknown) => ({
              where: vi.fn(async (_predicate: unknown) => {
                if (table === fileExtensions) {
                  for (let index = extensionRows.length - 1; index >= 0; index -= 1) {
                    if (extensionRows[index]?.fileId === managedFileId) {
                      extensionRows.splice(index, 1)
                    }
                  }
                }
                if (table === files) {
                  fileRows = fileRows.filter((row) => row.id !== managedFileId)
                }
              })
            }))
          }
          await callback(tx)
        }
      )
    }

    privateProvider.dbUtils = {
      getDb: () => db,
      getFileByPath: vi.fn(async (value: string) => fileRows.find((row) => row.path === value)),
      getFileExtensions: vi.fn(async (fileId: number) =>
        extensionRows
          .filter((row) => row.fileId === fileId)
          .map((row) => ({ ...row, value: row.value }))
      ),
      addFileExtensions: vi.fn(
        async (rows: Array<{ fileId: number; key: string; value: string }>) => {
          upsertExtensionRows(extensionRows, rows)
        }
      ),
      addFileExtension: vi.fn(async (fileId: number, key: string, value: string) => {
        upsertExtensionRows(extensionRows, [{ fileId, key, value }])
      })
    }
    privateProvider.searchIndex = {
      indexItems: indexItemsMock,
      removeItems: removeItemsMock
    }

    const added = await appProvider.upsertManagedEntry({
      path: scriptPath,
      displayName: 'Demo Script',
      launchKind: 'shortcut'
    })

    expect(added).toMatchObject({
      success: true,
      status: 'added',
      entry: {
        path: scriptPath,
        displayName: 'Demo Script',
        enabled: true,
        launchKind: 'shortcut',
        launchTarget: scriptPath
      }
    })
    expect(extensionRows).toEqual(
      expect.arrayContaining([
        { fileId: 1, key: 'entrySource', value: 'manual' },
        { fileId: 1, key: 'entryEnabled', value: '1' },
        { fileId: 1, key: 'launchKind', value: 'shortcut' },
        { fileId: 1, key: 'launchTarget', value: scriptPath }
      ])
    )
    expect(indexItemsMock).toHaveBeenCalledTimes(1)
    const disabled = await appProvider.setManagedEntryEnabled(scriptPath, false)

    expect(disabled).toMatchObject({
      success: true,
      status: 'updated',
      entry: {
        path: scriptPath,
        enabled: false
      }
    })
    expect(removeItemsMock).toHaveBeenCalledWith([scriptPath])

    const removed = await appProvider.removeManagedEntry(scriptPath)

    expect(removed).toMatchObject({
      success: true,
      status: 'removed',
      entry: {
        path: scriptPath
      }
    })
    expect(fileRows).toEqual([])
  })

  it('rejects managed launcher entries that collide with scanned apps', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-provider-managed-conflict-'))
    const scriptPath = path.join(tempDir, 'wechat.app')
    await fs.writeFile(scriptPath, 'not-a-real-app', 'utf8')

    privateProvider.dbUtils = {
      getDb: () => ({
        insert: vi.fn(),
        update: vi.fn(),
        transaction: vi.fn()
      }),
      getFileByPath: vi.fn(async () => ({
        id: 7,
        path: scriptPath,
        name: 'WeChat',
        displayName: 'WeChat',
        type: 'app',
        mtime: new Date(0),
        ctime: new Date(0)
      })),
      getFileExtensions: vi.fn(async () => [
        { fileId: 7, key: 'bundleId', value: 'com.tencent.xinWeChat' }
      ])
    }

    const result = await appProvider.upsertManagedEntry({
      path: scriptPath,
      displayName: '微信',
      launchKind: 'path'
    })

    expect(result).toEqual({
      success: false,
      status: 'invalid',
      reason: 'path-conflicts-with-scanned-app'
    })
  })
})
