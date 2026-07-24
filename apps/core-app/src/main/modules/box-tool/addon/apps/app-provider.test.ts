import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { IExecuteArgs, TuffItem } from '@talex-touch/utils'
import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWatchPathMock,
  appRuntimeApplyDeltaMock,
  appRuntimeResetMock,
  appRuntimeScanMock,
  asPrivateProvider,
  createDeferred,
  flushPromises,
  getAppInfoByPathMock,
  getAppsBySourceMock,
  getAppsMock,
  getMainConfigMock,
  loadSubject,
  getWatchPathsMock,
  pinyinMock,
  resetAppRuntimeDelegateMocks,
  runMdlsUpdateScanMock,
  searchRecordExecuteMock,
  upsertExtensionRows,
  withPlatform
} from './app-provider-test-harness'
import { buildAppExtensions } from './app-index-metadata'

const { scheduleAppLaunchMock } = vi.hoisted(() => ({
  scheduleAppLaunchMock: vi.fn()
}))

vi.mock('./app-launcher', () => ({
  scheduleAppLaunch: scheduleAppLaunchMock
}))

type TestFileRow = {
  id: number
  path: string
  name?: string
  displayName?: string | null
  type?: string
  mtime?: Date
  ctime?: Date
}

type TestFilePayload = Record<string, unknown> & {
  path: string
  displayName?: string | null
}

function executeItem(overrides: Partial<TuffItem>): TuffItem {
  return {
    id: 'test-app',
    source: {
      type: 'application',
      id: 'app-provider',
      name: 'Applications',
      permission: 'safe'
    },
    render: {
      mode: 'default',
      basic: {
        title: 'Test App'
      }
    },
    ...overrides
  } as TuffItem
}

type TestAppSearchRow = {
  id: number
  path: string
  name: string
  displayName: string | null
  extension: string | null
  size: number | null
  mtime: Date
  ctime: Date
  lastIndexedAt: Date
  isDir: boolean
  type: string
  content: string | null
  embeddingStatus: 'none' | 'pending' | 'completed'
  extensions: Record<string, string | null>
}

function createAppSearchRow(id: number, appPath: string, name: string): TestAppSearchRow {
  return {
    id,
    path: appPath,
    name,
    displayName: name,
    extension: null,
    size: null,
    mtime: new Date(0),
    ctime: new Date(0),
    lastIndexedAt: new Date(0),
    isDir: false,
    type: 'app',
    content: null,
    embeddingStatus: 'none',
    extensions: {
      appIdentity: appPath,
      launchKind: 'path',
      launchTarget: appPath
    }
  }
}

function extractSqlParamValues(value: unknown, seen = new Set<object>()): unknown[] {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const record = value as Record<string, unknown>
  if (value.constructor?.name === 'Param' && 'value' in record) {
    return [record.value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractSqlParamValues(entry, seen))
  }

  const queryChunks = record.queryChunks
  if (Array.isArray(queryChunks)) {
    return queryChunks.flatMap((entry) => extractSqlParamValues(entry, seen))
  }

  return []
}

function createAppSearchDb(options: {
  fileExtensionsTable: unknown
  filesTable: unknown
  rows: TestAppSearchRow[]
}) {
  const whereMock = vi.fn(async (predicate: unknown) => {
    const params = extractSqlParamValues(predicate)
    return options.rows.filter((row) => params.includes(row.path))
  })
  const selectMock = vi.fn((selection?: Record<string, unknown>) => {
    if (selection && 'itemId' in selection) {
      throw new Error('App search exact lookup must use SearchIndexService.lookupByKeywords')
    }

    if (selection && 'fileId' in selection) {
      return {
        from: vi.fn((table: unknown) => {
          expect(table).toBe(options.fileExtensionsTable)
          return { where: vi.fn(() => ({ __candidateSubquery: true })) }
        })
      }
    }

    return {
      from: vi.fn((table: unknown) => {
        expect(table).toBe(options.filesTable)
        return { where: whereMock }
      })
    }
  })

  return { db: { select: selectMock }, selectMock, whereMock }
}

describe('appProvider rebuild maintenance', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAppRuntimeDelegateMocks()
    addWatchPathMock.mockResolvedValue(undefined)
    getWatchPathsMock.mockReturnValue([])
    getAppsMock.mockResolvedValue([])
    getAppsBySourceMock.mockResolvedValue(null)
    runMdlsUpdateScanMock.mockResolvedValue({
      updatedApps: [],
      updatedCount: 0,
      deletedApps: []
    })
    getMainConfigMock.mockReturnValue(undefined)
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (options?.pattern === 'first') {
        return value === '聊天应用' ? 'WX' : value
      }
      return value === '聊天应用' ? 'WEI XIN' : value
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
        databaseManager: {
          getDb: vi.fn(),
          getSearchDb: vi.fn(),
          isSearchSplitEnabled: vi.fn(() => false)
        },
        searchIndex: {}
      } as unknown as Parameters<typeof appProvider.onLoad>[0])

      expect(touchEventBus.on).not.toHaveBeenCalledWith(
        TalexEvents.FILE_ADDED,
        expect.any(Function)
      )
      expect(touchEventBus.on).not.toHaveBeenCalledWith(
        TalexEvents.FILE_CHANGED,
        expect.any(Function)
      )
      expect(touchEventBus.on).not.toHaveBeenCalledWith(
        TalexEvents.FILE_UNLINKED,
        expect.any(Function)
      )
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
      privateProvider._waitForItemStable = vi.fn(async () => true)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: vi.fn(() => ({
            values: valuesMock
          })),
          delete: vi.fn(() => ({
            where: vi.fn(async () => undefined)
          })),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async () => [])
            }))
          }))
        }),
        addFileExtensions: vi.fn(async () => undefined)
      }
      privateProvider.searchIndex = {}

      await privateProvider.handleIndexedSourceWatchEvent({
        sourceId: 'app-provider',
        action: 'change',
        path: shortcutPath,
        occurredAt: 1700000000000
      })

      expect(getAppInfoByPathMock).toHaveBeenCalledWith(shortcutPath)
      expect(valuesMock).toHaveBeenCalled()

      getAppInfoByPathMock.mockClear()
      await privateProvider.handleIndexedSourceWatchEvent({
        sourceId: 'app-provider',
        action: 'change',
        path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\note.txt',
        occurredAt: 1700000000001
      })

      expect(getAppInfoByPathMock).not.toHaveBeenCalled()
    })
  })

  it('returns concrete app watch records for runtime store updates', async () => {
    await withPlatform('win32', async () => {
      vi.resetModules()
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const shortcutPath =
        'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Runtime App.lnk'
      const watchRoot =
        'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
      const appInfo = {
        name: 'Runtime App',
        displayName: 'Runtime App',
        path: shortcutPath,
        icon: '',
        bundleId: '',
        uniqueId: 'shortcut:c:\\program files\\runtime app\\runtime.exe|',
        stableId: 'shortcut:c:\\program files\\runtime app\\runtime.exe|',
        launchKind: 'shortcut' as const,
        launchTarget: 'C:\\Program Files\\Runtime App\\Runtime.exe',
        lastModified: new Date('2026-05-30T00:00:00.000Z')
      }
      getWatchPathsMock.mockReturnValue([watchRoot])
      privateProvider.processAppPath = vi.fn(async () => ({
        success: true,
        status: 'added',
        path: shortcutPath,
        appInfo
      }))

      const watchDeltas = await privateProvider.handleIndexedSourceWatchEvent({
        sourceId: 'app-provider',
        action: 'change',
        path: shortcutPath,
        occurredAt: 1700000000000
      })

      expect(privateProvider.processAppPath).toHaveBeenCalledWith(shortcutPath)
      expect(watchDeltas).toEqual([
        {
          sourceId: 'app-provider',
          action: 'change',
          record: expect.objectContaining({
            sourceId: 'app-provider',
            recordId: appInfo.stableId,
            stableKey: appInfo.stableId,
            kind: 'app',
            title: 'Runtime App',
            path: shortcutPath
          }),
          path: shortcutPath,
          reason: 'app-provider-watch-event'
        }
      ])
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
      privateProvider._waitForItemStable = vi.fn(async () => true)
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
      privateProvider.searchIndex = {}

      await privateProvider.handleIndexedSourceWatchEvent({
        sourceId: 'app-provider',
        action: 'change',
        path: apprefPath,
        occurredAt: 1700000000000
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
      const waitForItemStable = vi.fn(async () => true)

      getAppInfoByPathMock.mockResolvedValue(appInfo)
      privateProvider._waitForItemStable = waitForItemStable
      const addFileExtensionsMock = vi.fn(async () => undefined)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: vi.fn(() => ({ values: valuesMock })),
          delete: vi.fn(() => ({ where: vi.fn(async () => undefined) }))
        }),
        addFileExtensions: addFileExtensionsMock
      }

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
      expect(appRuntimeApplyDeltaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'app-provider',
          action: 'change',
          path: shellPath,
          reason: 'app-manual-path-upsert',
          record: expect.objectContaining({
            recordId: appInfo.stableId,
            stableKey: appInfo.stableId,
            path: shellPath,
            metadata: expect.objectContaining({ extension: '.uwp' })
          })
        })
      )
    })
  })

  it('expands pasted Windows env var paths before app indexing', async () => {
    await withPlatform('win32', async () => {
      const originalLocalAppData = process.env.LOCALAPPDATA
      process.env.LOCALAPPDATA = 'C:\\Users\\demo\\AppData\\Local'
      try {
        vi.resetModules()
        const { appProvider } = await loadSubject()
        const privateProvider = asPrivateProvider(appProvider)
        const rawPath = '%LOCALAPPDATA%\\Programs\\Demo App\\Demo Tool.exe'
        const expandedPath = 'C:\\Users\\demo\\AppData\\Local\\Programs\\Demo App\\Demo Tool.exe'
        const appInfo = {
          name: 'Demo Tool',
          displayName: 'Demo Tool',
          path: expandedPath,
          icon: '',
          bundleId: '',
          uniqueId: expandedPath.toLowerCase(),
          stableId: expandedPath.toLowerCase(),
          launchKind: 'path' as const,
          launchTarget: expandedPath,
          lastModified: new Date('2026-05-13T00:00:00.000Z')
        }

        getAppInfoByPathMock.mockResolvedValue(appInfo)
        ;(
          privateProvider as typeof privateProvider & {
            _waitForItemStable: (filePath: string) => Promise<boolean>
          }
        )._waitForItemStable = vi.fn(async () => true)
        privateProvider.dbUtils = {
          getFileByPath: vi.fn(async () => null),
          getDb: () => ({
            insert: vi.fn(() => ({
              values: vi.fn(() => ({
                returning: vi.fn(async () => [
                  {
                    id: 46,
                    path: expandedPath,
                    name: 'Demo Tool',
                    displayName: 'Demo Tool',
                    type: 'app',
                    mtime: appInfo.lastModified,
                    ctime: appInfo.lastModified
                  }
                ])
              }))
            })),
            delete: vi.fn(() => ({ where: vi.fn(async () => undefined) }))
          }),
          addFileExtensions: vi.fn(async () => undefined)
        }
        const result = await appProvider.addAppByPath(rawPath)

        expect(result).toEqual({ success: true, status: 'added', path: expandedPath })
        expect(getAppInfoByPathMock).toHaveBeenCalledWith(expandedPath)
        expect(appRuntimeApplyDeltaMock).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceId: 'app-provider',
            action: 'change',
            path: expandedPath,
            reason: 'app-manual-path-upsert',
            record: expect.objectContaining({ stableKey: appInfo.stableId })
          })
        )
      } finally {
        if (originalLocalAppData === undefined) {
          delete process.env.LOCALAPPDATA
        } else {
          process.env.LOCALAPPDATA = originalLocalAppData
        }
      }
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
      const waitForItemStable = vi.fn(async () => true)

      getAppInfoByPathMock.mockResolvedValue(appInfo)
      privateProvider._waitForItemStable = waitForItemStable
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
      expect(appRuntimeApplyDeltaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'app-provider',
          action: 'change',
          path: shellPath,
          reason: 'app-manual-path-upsert',
          record: expect.objectContaining({
            recordId: appInfo.stableId,
            stableKey: appInfo.stableId,
            uri: appId
          })
        })
      )
    })
  })

  it('records a session-scoped usage event before handing the app to the launch boundary', async () => {
    const { appProvider } = await loadSubject()
    searchRecordExecuteMock.mockResolvedValueOnce(undefined)
    const item = executeItem({
      id: 'recorded-app',
      render: { mode: 'default', basic: { title: 'Recorded App' } },
      meta: {
        app: {
          path: '/Applications/Recorded.app',
          launchKind: 'path',
          launchTarget: '/Applications/Recorded.app'
        }
      }
    })

    await appProvider.onExecute({
      item,
      searchResult: { sessionId: 'search-session-42' }
    } as IExecuteArgs)

    expect(searchRecordExecuteMock).toHaveBeenCalledWith('search-session-42', item)
    expect(scheduleAppLaunchMock).toHaveBeenCalledWith({
      name: 'Recorded App',
      path: '/Applications/Recorded.app',
      launchKind: 'path',
      launchTarget: '/Applications/Recorded.app',
      launchArgs: undefined,
      workingDirectory: undefined,
      sourceItemId: 'recorded-app'
    })
  })

  it('requests a runtime reset for public rebuilds', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    privateProvider.context = {}
    privateProvider.dbUtils = {}

    await expect(appProvider.rebuildIndex()).resolves.toEqual({
      success: true,
      message: 'App index rebuild complete'
    })
    expect(appRuntimeResetMock).toHaveBeenCalledWith({
      sourceId: 'app-provider',
      reason: 'manual-rebuild',
      clearSearchIndex: true,
      clearScanProgress: false
    })
  })

  it('local reset only clears scanned app records and preserves managed and file records', async () => {
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
    privateProvider._clearPendingDeletions = vi.fn().mockResolvedValue(undefined)
    privateProvider._performFullSync = vi.fn().mockResolvedValue(undefined)

    await privateProvider.resetIndexedSourceLocalState({
      sourceId: 'app-provider',
      reason: 'manual-rebuild',
      clearSearchIndex: true,
      clearScanProgress: false
    })

    expect(appRuntimeResetMock).not.toHaveBeenCalled()
    expect(fileRows).toEqual([
      { id: 2, path: '/Users/demo/bin/custom.sh', type: 'app' },
      { id: 3, type: 'file' }
    ])
    expect(extensionRows).toEqual([
      { fileId: 2, key: 'entrySource', value: 'manual' },
      { fileId: 2, key: 'entryEnabled', value: '1' },
      { fileId: 3, key: 'sha1', value: 'abc123' }
    ])
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

  it('routes scheduled startup and full sync through the App runtime delegate', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const scan = vi.fn(async () => undefined)
    const reconcile = vi.fn(async () => undefined)
    privateProvider.setIndexedSourceRuntimeDelegate({
      scan,
      reconcile,
      applyDelta: vi.fn(async () => undefined),
      reset: vi.fn(async (request) => ({
        sourceId: request.sourceId,
        reason: request.reason,
        clearedSearchIndex: true,
        clearedScanProgress: false,
        startedAt: 0,
        completedAt: 0
      }))
    })
    privateProvider._shouldRunStartupBackfill = vi.fn(async () => ({ allowed: true }))
    privateProvider.dbUtils = {}
    privateProvider._getLastFullSyncTime = vi.fn(async () => null)

    await privateProvider._runStartupBackfillWithRetry()
    await privateProvider._runFullSyncIfDue()

    expect(scan).toHaveBeenCalledWith('startup')
    expect(reconcile).toHaveBeenCalledWith('app-provider-scheduled-full-sync')
  })

  it('repairs corrupted display names during startup backfill', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const dbRow = {
      id: 80,
      path: 'D:\\ChatApp\\ChatApp.exe',
      name: 'ChatApp',
      displayName: '\u03A2\uFFFD\uFFFD',
      type: 'app',
      mtime: new Date('2026-05-05T08:00:00Z'),
      ctime: new Date('2026-05-05T08:00:00Z')
    }
    const scannedApp = {
      name: 'ChatApp',
      displayName: 'ChatApp',
      displayNameQuality: 'localized',
      path: 'D:\\ChatApp\\ChatApp.exe',
      icon: '',
      bundleId: '',
      uniqueId: 'path:d:\\chatapp\\chatapp.exe',
      stableId: 'path:d:\\chatapp\\chatapp.exe',
      launchKind: 'path' as const,
      launchTarget: 'D:\\ChatApp\\ChatApp.exe',
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
    privateProvider.searchIndex = {}
    privateProvider.fetchExtensionsForFiles = vi.fn(async (files: unknown[]) =>
      files.map((file) => ({
        ...(file as typeof dbRow),
        extensions: {
          appIdentity: 'path:d:\\chatapp\\chatapp.exe',
          displayNameQuality: 'filename'
        }
      }))
    )
    privateProvider._recordMissingIconApps = vi.fn().mockResolvedValue(undefined)

    await privateProvider._performStartupBackfill()

    expect(updatedDisplayName).toBe('ChatApp')
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

    const rebuildPromise = privateProvider.resetIndexedSourceLocalState({
      sourceId: 'app-provider',
      reason: 'manual-rebuild',
      clearSearchIndex: true,
      clearScanProgress: false
    })
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

  it('hands shortcut launch arguments to the app-launch adapter boundary', async () => {
    const { appProvider } = await loadSubject()

    await appProvider.onExecute({
      item: executeItem({
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
      })
    } satisfies IExecuteArgs)

    expect(scheduleAppLaunchMock).toHaveBeenCalledWith({
      name: 'Test App',
      path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk',
      launchKind: 'shortcut',
      launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
      launchArgs: '--profile work --flag',
      workingDirectory: 'C:\\Program Files\\Foo',
      sourceItemId: 'shortcut-app'
    })
  })

  it('hands normalized Windows Store identity to the app-launch adapter', async () => {
    const { appProvider } = await loadSubject()

    await appProvider.onExecute({
      item: executeItem({
        id: 'uwp-app',
        meta: {
          app: {
            path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
            launchKind: 'uwp',
            launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
          }
        }
      })
    } satisfies IExecuteArgs)

    expect(scheduleAppLaunchMock).toHaveBeenCalledWith({
      name: 'Test App',
      path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      launchKind: 'uwp',
      launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      launchArgs: undefined,
      workingDirectory: undefined,
      sourceItemId: 'uwp-app'
    })
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
      name: 'ChatApp',
      displayName: '聊天应用',
      fileName: 'ChatApp',
      path: '/Applications/ChatApp.app',
      launchKind: 'path',
      launchTarget: '/Applications/ChatApp.app',
      stableId: '/Applications/ChatApp.app',
      icon: '',
      lastModified: new Date(0)
    })

    expect(keywords).toContain('聊天应用')
    expect(keywords).toContain('chatapp')
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

  it('maps path-stable app records with semantic and external aliases', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const appPath = '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app'
    await appProvider.setAliases({ [appPath]: ['retouch'] })

    const record = await privateProvider.mapScannedAppToIndexedSourceRecord('app-provider', {
      name: 'Adobe Photoshop 2026',
      displayName: 'Adobe Photoshop 2026',
      fileName: 'Adobe Photoshop 2026',
      bundleId: 'com.adobe.Photoshop',
      path: appPath,
      launchKind: 'path',
      launchTarget: appPath,
      stableId: appPath,
      icon: '',
      lastModified: new Date(0)
    })

    expect(record).toMatchObject({
      sourceId: 'app-provider',
      recordId: appPath,
      stableKey: appPath,
      tags: expect.arrayContaining(['com.adobe.Photoshop', appPath, 'tool-source:design']),
      search: expect.objectContaining({
        aliases: expect.arrayContaining([
          expect.objectContaining({ value: 'retouch', priority: 1.5 }),
          expect.objectContaining({ value: 'ps', priority: 1.5 }),
          expect.objectContaining({ value: 'design', priority: 1.5 })
        ]),
        keywords: expect.arrayContaining([
          expect.objectContaining({ value: 'retouch', priority: 1.5 }),
          expect.objectContaining({ value: 'ps', priority: 1.5 }),
          expect.objectContaining({ value: 'design', priority: 1.5 })
        ])
      })
    })
  })

  it('exposes tool source alias catalog through indexed source evidence', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    privateProvider.dbUtils = {
      getFilesByType: vi.fn(async () => [])
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [])

    const evidence = await appProvider.getIndexedSourceEvidence()

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'app-provider:tool-sources',
          label: 'Tool source aliases',
          status: 'ready',
          itemCount: 6,
          metadata: expect.objectContaining({
            catalogVersion: 1,
            sources: expect.arrayContaining([
              expect.objectContaining({ id: 'dev', appCount: 2 }),
              expect.objectContaining({ id: 'im', appCount: 3 }),
              expect.objectContaining({ id: 'design', appCount: 1 })
            ])
          })
        })
      ])
    )
  })

  it('maps scanned high-frequency tools to indexed record aliases and tool source metadata', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    const record = await privateProvider.mapScannedAppToIndexedSourceRecord('app-provider', {
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

    expect(record).toMatchObject({
      sourceId: 'app-provider',
      recordId: 'uwp:openai.codex_2p2nqsd0c76g0!app',
      keywords: expect.arrayContaining(['codex', 'dev', 'code']),
      tags: expect.arrayContaining(['tool-source:dev']),
      metadata: expect.objectContaining({
        toolSources: ['dev']
      })
    })
  })

  it('uses one batched keyword lookup for multi-term app search exact matches', async () => {
    const { appProvider } = await loadSubject()
    const { fileExtensions, files } = await import('../../../../db/schema')
    const { processSearchResults } = await import('./search-processing-service')
    const privateProvider = asPrivateProvider(appProvider)
    const mutableProvider = privateProvider as typeof privateProvider & {
      appIndexSettings: { hideNoisySystemApps: boolean }
      isMac: boolean
    }
    mutableProvider.isMac = false
    mutableProvider.appIndexSettings = { hideNoisySystemApps: false }

    const sharedApp = createAppSearchRow(11, '/Applications/Chat Studio.app', 'Chat Studio')
    const chatOnlyApp = createAppSearchRow(12, '/Applications/Chat Notes.app', 'Chat Notes')
    const studioOnlyApp = createAppSearchRow(13, '/Applications/Studio Paint.app', 'Studio Paint')
    const { db, selectMock } = createAppSearchDb({
      fileExtensionsTable: fileExtensions,
      filesTable: files,
      rows: [sharedApp, chatOnlyApp, studioOnlyApp]
    })
    const lookupByKeywordsMock = vi.fn(async () => {
      return new Map([
        [
          'chat',
          [
            { itemId: sharedApp.path, priority: 1.1 },
            { itemId: chatOnlyApp.path, priority: 1 }
          ]
        ],
        [
          'studio',
          [
            { itemId: sharedApp.path, priority: 1.1 },
            { itemId: studioOnlyApp.path, priority: 1 }
          ]
        ],
        ['chat studio', [{ itemId: sharedApp.path, priority: 1.2 }]]
      ])
    })
    const lookupByKeywordPrefixMock = vi.fn(async () => [])
    const ftsSearchMock = vi.fn(async () => [])
    const ngramMock = vi.fn(async () => [])
    const subsequenceMock = vi.fn(async () => [])
    vi.mocked(processSearchResults).mockImplementation(async (apps) =>
      apps.map((app) => ({
        ...executeItem({
          id: app.path,
          render: {
            mode: 'default',
            basic: {
              title: app.displayName ?? app.name ?? app.path
            }
          }
        }),
        score: 100
      }))
    )

    privateProvider.dbUtils = { getDb: () => db }
    privateProvider.fetchExtensionsForFiles = vi.fn(async (apps) => apps)
    privateProvider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock,
      lookupByNgrams: ngramMock,
      lookupBySubsequence: subsequenceMock
    }

    const result = await appProvider.onSearch({ text: 'chat studio', inputs: [] })

    expect(lookupByKeywordsMock).toHaveBeenCalledTimes(1)
    expect(lookupByKeywordsMock).toHaveBeenCalledWith(
      'app-provider',
      ['chat', 'studio', 'chat studio'],
      600
    )
    expect(selectMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ itemId: expect.anything() })
    )
    expect(processSearchResults).toHaveBeenCalledWith(
      [sharedApp],
      expect.anything(),
      false,
      expect.anything()
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe(sharedApp.path)
    expect(lookupByKeywordPrefixMock).not.toHaveBeenCalled()
    expect(ftsSearchMock).toHaveBeenCalledWith('app-provider', 'chat studio', 150)
    expect(ngramMock).toHaveBeenCalledWith('app-provider', 'chat studio', 30)
    expect(subsequenceMock).toHaveBeenCalledWith('app-provider', 'chat studio', 50)
  })

  it('starts precise, prefix, and FTS app search-index reads in parallel before precise resolves', async () => {
    const { appProvider } = await loadSubject()
    // Dynamic imports must run after loadSubject()/vi.resetModules() so test mocks share the isolated module graph.
    const { fileExtensions, files } = await import('../../../../db/schema')
    // Dynamic import keeps this mock aligned with vi.resetModules() and loadSubject().
    const { processSearchResults } = await import('./search-processing-service')
    const privateProvider = asPrivateProvider(appProvider)
    const mutableProvider = privateProvider as typeof privateProvider & {
      appIndexSettings: { hideNoisySystemApps: boolean }
      isMac: boolean
    }
    mutableProvider.isMac = false
    mutableProvider.appIndexSettings = { hideNoisySystemApps: false }

    const preciseApp = createAppSearchRow(21, '/Applications/Chat.app', 'Chat')
    const preciseAltApp = createAppSearchRow(22, '/Applications/Chat Classic.app', 'Chat Classic')
    const prefixApp = createAppSearchRow(23, '/Applications/Chatty.app', 'Chatty')
    const prefixAltApp = createAppSearchRow(24, '/Applications/Chatter.app', 'Chatter')
    const ftsApp = createAppSearchRow(25, '/Applications/Team Chat.app', 'Team Chat')
    const { db, whereMock } = createAppSearchDb({
      fileExtensionsTable: fileExtensions,
      filesTable: files,
      rows: [preciseApp, preciseAltApp, prefixApp, prefixAltApp, ftsApp]
    })
    const preciseDeferred =
      createDeferred<Map<string, Array<{ itemId: string; priority: number }>>>()
    const lookupByKeywordsMock = vi.fn(() => preciseDeferred.promise)
    const lookupByKeywordPrefixMock = vi.fn(async () => [
      { itemId: prefixApp.path, keyword: 'chatty', priority: 0.9 },
      { itemId: prefixAltApp.path, keyword: 'chatter', priority: 0.8 }
    ])
    const ftsSearchMock = vi.fn(async () => [{ itemId: ftsApp.path, score: 0.25 }])
    const ngramMock = vi.fn(async () => [])
    const subsequenceMock = vi.fn(async () => [])
    vi.mocked(processSearchResults).mockImplementation(async (apps) =>
      apps.map((app) => ({
        ...executeItem({
          id: app.path,
          render: {
            mode: 'default',
            basic: {
              title: app.displayName ?? app.name ?? app.path
            }
          }
        }),
        score: 100
      }))
    )

    privateProvider.dbUtils = { getDb: () => db }
    privateProvider.fetchExtensionsForFiles = vi.fn(async (apps) => apps)
    privateProvider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock,
      lookupByNgrams: ngramMock,
      lookupBySubsequence: subsequenceMock
    }

    const resultPromise = appProvider.onSearch({ text: 'chat', inputs: [] })

    expect(lookupByKeywordsMock).toHaveBeenCalledWith('app-provider', ['chat'], 200)
    expect(lookupByKeywordPrefixMock).toHaveBeenCalledWith('app-provider', 'chat', 200)
    expect(ftsSearchMock).toHaveBeenCalledWith('app-provider', 'chat', 150)
    expect(ngramMock).not.toHaveBeenCalled()
    expect(subsequenceMock).not.toHaveBeenCalled()
    expect(whereMock).not.toHaveBeenCalled()

    preciseDeferred.resolve(
      new Map([
        [
          'chat',
          [
            { itemId: preciseApp.path, priority: 1.2 },
            { itemId: preciseAltApp.path, priority: 1.1 }
          ]
        ]
      ])
    )
    const result = await resultPromise

    expect(processSearchResults).toHaveBeenCalledWith(
      [preciseApp, preciseAltApp, prefixApp, prefixAltApp, ftsApp],
      expect.anything(),
      false,
      expect.anything()
    )
    expect(result.items.map((item) => item.id)).toEqual([
      preciseApp.path,
      preciseAltApp.path,
      prefixApp.path,
      prefixAltApp.path,
      ftsApp.path
    ])
    expect(ngramMock).not.toHaveBeenCalled()
    expect(subsequenceMock).not.toHaveBeenCalled()
  })

  it('returns immediately when aborted before app search work starts', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const controller = new AbortController()
    controller.abort()

    const getDbMock = vi.fn(() => ({ select: vi.fn() }))
    const lookupByKeywordsMock = vi.fn()
    const lookupByKeywordPrefixMock = vi.fn()
    const ftsSearchMock = vi.fn()
    const ngramMock = vi.fn()
    const subsequenceMock = vi.fn()

    privateProvider.dbUtils = { getDb: getDbMock }
    privateProvider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock,
      lookupByNgrams: ngramMock,
      lookupBySubsequence: subsequenceMock
    }

    const result = await appProvider.onSearch({ text: 'chat', inputs: [] }, controller.signal)

    expect(result.items).toEqual([])
    expect(getDbMock).not.toHaveBeenCalled()
    expect(lookupByKeywordsMock).not.toHaveBeenCalled()
    expect(lookupByKeywordPrefixMock).not.toHaveBeenCalled()
    expect(ftsSearchMock).not.toHaveBeenCalled()
    expect(ngramMock).not.toHaveBeenCalled()
    expect(subsequenceMock).not.toHaveBeenCalled()
  })

  it('does not fetch app rows when aborted after search-index candidate reads', async () => {
    const { appProvider } = await loadSubject()
    const { fileExtensions, files } = await import('../../../../db/schema')
    const { processSearchResults } = await import('./search-processing-service')
    const privateProvider = asPrivateProvider(appProvider)
    const controller = new AbortController()
    const candidateApp = createAppSearchRow(26, '/Applications/Chat.app', 'Chat')
    const { db, selectMock, whereMock } = createAppSearchDb({
      fileExtensionsTable: fileExtensions,
      filesTable: files,
      rows: [candidateApp]
    })
    const lookupByKeywordsMock = vi.fn(async () => {
      controller.abort()
      return new Map([['chat', [{ itemId: candidateApp.path, priority: 1.2 }]]])
    })
    const lookupByKeywordPrefixMock = vi.fn(async () => [])
    const ftsSearchMock = vi.fn(async () => [])
    const ngramMock = vi.fn(async () => [])
    const subsequenceMock = vi.fn(async () => [])
    const fetchExtensionsForFilesMock = vi.fn(async (apps: unknown[]) => apps as TestAppSearchRow[])

    privateProvider.dbUtils = { getDb: () => db }
    privateProvider.fetchExtensionsForFiles = fetchExtensionsForFilesMock
    privateProvider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock,
      lookupByNgrams: ngramMock,
      lookupBySubsequence: subsequenceMock
    }

    const result = await appProvider.onSearch({ text: 'chat', inputs: [] }, controller.signal)

    expect(result.items).toEqual([])
    expect(lookupByKeywordsMock).toHaveBeenCalledWith('app-provider', ['chat'], 200)
    expect(lookupByKeywordPrefixMock).toHaveBeenCalledWith('app-provider', 'chat', 200)
    expect(ftsSearchMock).toHaveBeenCalledWith('app-provider', 'chat', 150)
    expect(ngramMock).not.toHaveBeenCalled()
    expect(subsequenceMock).not.toHaveBeenCalled()
    expect(selectMock).not.toHaveBeenCalled()
    expect(whereMock).not.toHaveBeenCalled()
    expect(fetchExtensionsForFilesMock).not.toHaveBeenCalled()
    expect(processSearchResults).not.toHaveBeenCalled()
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
      path: 'D:\\ChatApp\\ChatApp.exe',
      name: 'ChatApp',
      displayName: '\u03A2\uFFFD\uFFFD',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        appIdentity: 'path:d:\\chatapp\\chatapp.exe',
        launchKind: 'path',
        launchTarget: 'D:\\ChatApp\\ChatApp.exe'
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
      target: 'ChatApp',
      query: 'chatapp'
    })

    expect(result).toMatchObject({
      success: true,
      status: 'found',
      app: {
        name: 'ChatApp',
        displayName: 'ChatApp',
        rawDisplayName: '\u03A2\uFFFD\uFFFD',
        displayNameStatus: 'fallback',
        launchKind: 'path',
        launchTarget: 'D:\\ChatApp\\ChatApp.exe'
      }
    })
  })

  it('requires confirmation before reindexing a matched diagnostic target', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
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
    privateProvider.searchIndex = {}

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
    expect(appRuntimeApplyDeltaMock).not.toHaveBeenCalled()
    expect(getAppInfoByPathMock).not.toHaveBeenCalled()
  })

  it('reindexes a matched diagnostic target only after confirmation', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
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
    privateProvider.searchIndex = {}

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
    expect(appRuntimeApplyDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'app-provider',
        action: 'change',
        reason: 'app-diagnostics-reindex',
        path: '/Applications/NeteaseMusic 2.app',
        record: expect.objectContaining({
          stableKey: '/Applications/NeteaseMusic 2.app',
          search: expect.objectContaining({
            keywords: expect.arrayContaining([expect.objectContaining({ value: '网易云音乐' })])
          })
        })
      })
    )
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

    let stats: unknown
    try {
      stats = await privateProvider._initialize({ forceRefresh: true })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }

    expect(stats).toMatchObject({
      added: 0,
      changed: 1,
      deleted: 0,
      skipped: 0,
      errors: 0
    })
    expect(addFileExtensionsMock).toHaveBeenCalledWith(
      expect.arrayContaining([{ fileId: 91, key: 'icon', value: nextIconPath }])
    )
  })

  it('upserts managed launcher entries with manual extension flags', async () => {
    const { appProvider } = await loadSubject()
    const { files, fileExtensions } = await import('../../../../db/schema')
    const privateProvider = asPrivateProvider(appProvider)

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-provider-managed-'))
    const scriptPath = path.join(tempDir, 'demo-script.sh')
    await fs.writeFile(scriptPath, '#!/bin/sh\nexit 0\n', 'utf8')

    let nextId = 1
    let fileRows: TestFileRow[] = []
    const extensionRows: Array<{ fileId: number; key: string; value: string }> = []

    const db = {
      insert: vi.fn((table: unknown) => {
        expect(table).toBe(files)
        return {
          values: vi.fn((payload: TestFilePayload) => ({
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
          set: vi.fn((payload: Partial<TestFilePayload>) => ({
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
    expect(appRuntimeApplyDeltaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'app-provider',
        action: 'change',
        path: scriptPath,
        reason: 'app-managed-entry-upsert',
        record: expect.objectContaining({ stableKey: scriptPath })
      })
    )
    const disabled = await appProvider.setManagedEntryEnabled(scriptPath, false)

    expect(disabled).toMatchObject({
      success: true,
      status: 'updated',
      entry: {
        path: scriptPath,
        enabled: false
      }
    })
    expect(appRuntimeApplyDeltaMock).toHaveBeenLastCalledWith({
      sourceId: 'app-provider',
      action: 'delete',
      stableKey: scriptPath,
      reason: 'app-managed-entry-disabled'
    })

    const removed = await appProvider.removeManagedEntry(scriptPath)

    expect(removed).toMatchObject({
      success: true,
      status: 'removed',
      entry: {
        path: scriptPath
      }
    })
    expect(appRuntimeApplyDeltaMock).toHaveBeenLastCalledWith({
      sourceId: 'app-provider',
      action: 'delete',
      stableKey: scriptPath,
      reason: 'app-managed-entry-delete'
    })
    expect(fileRows).toEqual([])
  })

  it('lists scanned and manual app index entries with management metadata', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const scannedPath = '/Applications/Preview.app'
    const manualPath = '/Users/demo/bin/demo-script.sh'
    const appRows = [
      {
        id: 1,
        path: scannedPath,
        name: 'Preview',
        displayName: 'Preview',
        type: 'app',
        mtime: new Date(0),
        ctime: new Date(0)
      },
      {
        id: 2,
        path: manualPath,
        name: 'Demo Script',
        displayName: 'Demo Script',
        type: 'app',
        mtime: new Date(0),
        ctime: new Date(0)
      }
    ]
    const rowsWithExtensions = [
      {
        ...appRows[0],
        extensions: {
          bundleId: 'com.apple.Preview',
          appIdentity: 'bundle:com.apple.preview',
          identityKind: 'macos-bundle',
          launchKind: 'path',
          launchTarget: scannedPath,
          entryEnabled: '0'
        }
      },
      {
        ...appRows[1],
        extensions: {
          entrySource: 'manual',
          entryEnabled: '1',
          launchKind: 'shortcut',
          launchTarget: manualPath
        }
      }
    ]

    privateProvider.dbUtils = {
      getFilesByType: vi.fn(async () => appRows)
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => rowsWithExtensions)

    const entries = await appProvider.listManagedEntries()

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: scannedPath,
          enabled: false,
          source: 'scanned',
          removable: false,
          bundleId: 'com.apple.Preview',
          identityKind: 'macos-bundle'
        }),
        expect.objectContaining({
          path: manualPath,
          enabled: true,
          source: 'manual',
          removable: true,
          launchKind: 'shortcut'
        })
      ])
    )
  })

  it('allows disabling scanned app entries but keeps them non-removable', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const scannedPath = '/Applications/Preview.app'
    const scannedFile = {
      id: 7,
      path: scannedPath,
      name: 'Preview',
      displayName: 'Preview',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0)
    }
    const extensionRows = [
      { fileId: 7, key: 'bundleId', value: 'com.apple.Preview' },
      { fileId: 7, key: 'appIdentity', value: 'bundle:com.apple.preview' },
      { fileId: 7, key: 'identityKind', value: 'macos-bundle' },
      { fileId: 7, key: 'launchKind', value: 'path' },
      { fileId: 7, key: 'launchTarget', value: scannedPath }
    ]
    const addFileExtensionMock = vi.fn(async (fileId: number, key: string, value: string) => {
      upsertExtensionRows(extensionRows, [{ fileId, key, value }])
    })
    const getDbMock = vi.fn()

    privateProvider.dbUtils = {
      getDb: getDbMock,
      getFileByPath: vi.fn(async (value: string) =>
        value === scannedPath ? scannedFile : undefined
      ),
      getFileExtensions: vi.fn(async (fileId: number) =>
        extensionRows.filter((row) => row.fileId === fileId)
      ),
      addFileExtension: addFileExtensionMock
    }
    const disabled = await appProvider.setManagedEntryEnabled(scannedPath, false)

    expect(disabled).toMatchObject({
      success: true,
      status: 'updated',
      entry: {
        path: scannedPath,
        enabled: false,
        source: 'scanned',
        removable: false
      }
    })
    expect(addFileExtensionMock).toHaveBeenCalledWith(7, 'entryEnabled', '0')
    expect(appRuntimeApplyDeltaMock.mock.calls.map(([delta]) => delta)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'app-provider',
          action: 'delete',
          stableKey: 'bundle:com.apple.preview',
          reason: 'app-managed-entry-disabled'
        }),
        expect.objectContaining({
          sourceId: 'app-provider',
          action: 'delete',
          stableKey: scannedPath,
          reason: 'app-managed-entry-disabled'
        }),
        expect.objectContaining({
          sourceId: 'app-provider',
          action: 'delete',
          stableKey: 'com.apple.Preview',
          reason: 'app-managed-entry-disabled'
        })
      ])
    )

    const removed = await appProvider.removeManagedEntry(scannedPath)

    expect(removed).toEqual({
      success: false,
      status: 'invalid',
      reason: 'not-user-managed'
    })
    expect(getDbMock).not.toHaveBeenCalled()
  })

  it('records semantic alias catalog migration while deferring projection to runtime scans', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const configStore = new Map<string, string>([
      ['app_provider_semantic_alias_catalog_version', '1']
    ])
    privateProvider.dbUtils = {
      getDb: () => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                { key: 'app_provider_semantic_alias_catalog_version', value: '1' }
              ])
            }))
          }))
        })),
        insert: vi.fn(() => ({
          values: vi.fn((row: { key: string; value: string }) => ({
            onConflictDoUpdate: vi.fn(async () => {
              configStore.set(row.key, row.value)
            })
          }))
        }))
      })
    }
    privateProvider.searchIndex = {}

    await privateProvider._syncSemanticAliasCatalogIfNeeded()

    expect(appRuntimeApplyDeltaMock).not.toHaveBeenCalled()
    expect(configStore.get('app_provider_semantic_alias_catalog_version')).toBe('3')
  })

  it('rejects managed launcher entries that collide with scanned apps', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-provider-managed-conflict-'))
    const scriptPath = path.join(tempDir, 'chatapp.app')
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
        name: 'ChatApp',
        displayName: 'ChatApp',
        type: 'app',
        mtime: new Date(0),
        ctime: new Date(0)
      })),
      getFileExtensions: vi.fn(async () => [
        { fileId: 7, key: 'bundleId', value: 'com.example.chatapp' }
      ])
    }

    const result = await appProvider.upsertManagedEntry({
      path: scriptPath,
      displayName: '聊天应用',
      launchKind: 'path'
    })

    expect(result).toEqual({
      success: false,
      status: 'invalid',
      reason: 'path-conflicts-with-scanned-app'
    })
  })

  it('exposes indexed source scan, reconcile, and watch lifecycle hooks', async () => {
    await withPlatform('darwin', async () => {
      vi.resetModules()
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)

      privateProvider._runStartupBackfill = vi.fn(async () => undefined)
      privateProvider._runFullSync = vi.fn(async () => ({
        added: 2,
        changed: 3,
        deleted: 1,
        skipped: 4,
        errors: 0
      }))
      privateProvider._runMdlsUpdateScan = vi.fn(async () => ({
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 0
      }))
      privateProvider.handleItemUnlinked = vi.fn(async () => undefined)
      const appInfo = {
        name: 'Example',
        displayName: 'Example',
        path: '/Applications/Example.app',
        icon: '',
        bundleId: 'com.example.app',
        uniqueId: 'com.example.app',
        stableId: 'com.example.app',
        launchKind: 'bundle' as const,
        launchTarget: '/Applications/Example.app',
        lastModified: new Date('2026-05-30T00:00:00.000Z')
      }
      getAppInfoByPathMock.mockResolvedValue(appInfo)
      privateProvider._waitForItemStable = vi.fn(async () => true)
      privateProvider.dbUtils = {
        getFilesByType: vi.fn(async () => []),
        getFileByPath: vi.fn(async () => null),
        getDb: () => ({
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(async () => [
                {
                  id: 48,
                  path: appInfo.path,
                  name: 'Example',
                  displayName: 'Example',
                  type: 'app',
                  mtime: appInfo.lastModified,
                  ctime: appInfo.lastModified
                }
              ])
            }))
          })),
          delete: vi.fn(() => ({
            where: vi.fn(async () => undefined)
          })),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async () => [])
            }))
          }))
        }),
        addFileExtensions: vi.fn(async () => undefined)
      }
      privateProvider.fetchExtensionsForFiles = vi.fn(async () => [])

      const scanBatches: IndexedSourceRecordBatch[] = []
      for await (const batch of appProvider.scanIndexedSource({
        sourceId: 'app-provider',
        reason: 'startup'
      })) {
        scanBatches.push(batch)
      }

      expect(privateProvider._runStartupBackfill).toHaveBeenCalledTimes(1)
      expect(scanBatches).toEqual([{ sourceId: 'app-provider', records: [], done: true }])

      const reconcileResult = await privateProvider.reconcileIndexedSource({
        sourceId: 'app-provider'
      })

      expect(privateProvider._runFullSync).toHaveBeenCalledWith(true, true)
      expect(reconcileResult).toMatchObject({
        sourceId: 'app-provider',
        added: 2,
        changed: 3,
        deleted: 1,
        skipped: 4,
        errors: 0,
        reason: 'full-sync+mdls-update-scan'
      })

      await expect(
        privateProvider.handleIndexedSourceWatchEvent({
          sourceId: 'app-provider',
          action: 'change',
          path: '/Applications/Example.app',
          occurredAt: 1700000000000
        })
      ).resolves.toEqual([
        {
          sourceId: 'app-provider',
          action: 'change',
          record: expect.objectContaining({
            sourceId: 'app-provider',
            recordId: appInfo.stableId,
            stableKey: appInfo.stableId,
            kind: 'app',
            title: 'Example',
            path: '/Applications/Example.app'
          }),
          path: '/Applications/Example.app',
          reason: 'app-provider-watch-event'
        }
      ])
      await privateProvider.handleIndexedSourceWatchEvent({
        sourceId: 'app-provider',
        action: 'delete',
        path: '/Applications/Example.app',
        occurredAt: 1700000000001
      })

      expect(privateProvider.handleItemUnlinked).toHaveBeenCalledWith({
        filePath: '/Applications/Example.app'
      })
    })
  })

  it('exposes app indexed source evidence by platform sub-source', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const watchPaths = [
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
        'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
      ]
      getWatchPathsMock.mockReturnValue(watchPaths)
      const now = new Date()
      const appRows = [
        { id: 1, path: 'C:\\Start\\Foo.lnk', name: 'Foo' },
        { id: 2, path: 'shell:AppsFolder\\Pkg!App', name: 'Store App' },
        { id: 3, path: 'C:\\Program Files\\Reg\\Reg.exe', name: 'Reg' },
        { id: 4, path: 'C:\\Program Files\\AppPath\\App.exe', name: 'AppPath' },
        { id: 5, path: 'steam://rungameid/123', name: 'Steam Game' }
      ].map((row) => ({
        ...row,
        displayName: row.name,
        extension: null,
        size: null,
        mtime: now,
        ctime: now,
        lastIndexedAt: now,
        isDir: false,
        type: 'app',
        content: null,
        embeddingStatus: 'pending' as const
      }))

      privateProvider.dbUtils = {
        getFilesByType: vi.fn(async () => [...appRows]),
        getDb: () => ({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async () => [
                { fileId: 1, key: 'identityKind', value: 'windows-shortcut' },
                { fileId: 1, key: 'displayPath', value: 'C:\\Start\\Foo.lnk' },
                { fileId: 2, key: 'identityKind', value: 'windows-uwp' },
                { fileId: 2, key: 'launchKind', value: 'uwp' },
                { fileId: 3, key: 'displayNameSource', value: 'registry display name' },
                { fileId: 4, key: 'displayNameSource', value: 'App Paths registry' },
                { fileId: 5, key: 'launchKind', value: 'protocol' },
                { fileId: 5, key: 'launchTarget', value: 'steam://rungameid/123' }
              ])
            }))
          }))
        })
      } as unknown

      const evidence = await appProvider.getIndexedSourceEvidence()

      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'app-provider:watch-roots', rootCount: 2 }),
          expect.objectContaining({ id: 'app-provider:windows-start-menu', itemCount: 1 }),
          expect.objectContaining({ id: 'app-provider:windows-uwp', itemCount: 1 }),
          expect.objectContaining({ id: 'app-provider:windows-registry', itemCount: 1 }),
          expect.objectContaining({ id: 'app-provider:windows-app-paths', itemCount: 1 }),
          expect.objectContaining({ id: 'app-provider:windows-steam', itemCount: 1 })
        ])
      )
    })
  })

  it('prefers Windows scanner grouped source evidence over indexed metadata inference', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)

      getWatchPathsMock.mockReturnValue([
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
      ])
      getAppsBySourceMock.mockResolvedValue([
        {
          sourceId: 'windows-start-menu',
          label: 'Windows Start Menu',
          apps: [{ name: 'Start App' }]
        },
        {
          sourceId: 'windows-uwp',
          label: 'Windows UWP / Get-StartApps',
          apps: [{ name: 'Store App' }]
        },
        {
          sourceId: 'windows-registry',
          label: 'Windows Uninstall Registry',
          apps: [],
          error: 'registry-denied'
        },
        {
          sourceId: 'windows-app-paths',
          label: 'Windows App Paths Registry',
          apps: [{ name: 'App Path A' }, { name: 'App Path B' }]
        },
        {
          sourceId: 'windows-steam',
          label: 'Steam app manifests',
          apps: []
        }
      ])
      privateProvider.dbUtils = {
        getFilesByType: vi.fn(async () => {
          throw new Error('db metadata fallback should not be used')
        })
      } as unknown

      const evidence = await appProvider.getIndexedSourceEvidence()

      expect(getAppsBySourceMock).toHaveBeenCalled()
      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'app-provider:windows-start-menu',
            itemCount: 1,
            status: 'ready',
            metadata: expect.objectContaining({ evidenceSource: 'scanner' })
          }),
          expect.objectContaining({
            id: 'app-provider:windows-registry',
            itemCount: 0,
            status: 'degraded',
            reason: 'registry-denied'
          }),
          expect.objectContaining({
            id: 'app-provider:windows-app-paths',
            itemCount: 2,
            status: 'ready'
          }),
          expect.objectContaining({
            id: 'app-provider:windows-steam',
            itemCount: 0,
            status: 'degraded',
            reason: 'windows-steam-empty'
          }),
          expect.objectContaining({
            id: 'app-provider:manual',
            reason: 'manual-app-entries-not-scanned'
          })
        ])
      )
    })
  })

  it('returns indexed source record batches from app scans', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      privateProvider._runStartupBackfill = vi.fn(async () => undefined)
      vi.spyOn(privateProvider as never, '_setLastBackfillTime').mockResolvedValue(undefined)
      const appPath = 'C:\\Start\\Example App.lnk'
      const appId = 'shortcut:c:\\program files\\example\\example.exe|'
      const dbApp = createAppSearchRow(48, appPath, 'Example App')
      dbApp.mtime = new Date('2026-05-30T00:00:00.000Z')
      const extensionRows = [
        { fileId: 48, key: 'appIdentity', value: appId },
        { fileId: 48, key: 'launchKind', value: 'shortcut' },
        { fileId: 48, key: 'launchTarget', value: 'C:\\Program Files\\Example\\Example.exe' },
        { fileId: 48, key: 'displayPath', value: 'Example App.lnk' },
        { fileId: 48, key: 'alternateNames', value: JSON.stringify(['Example']) },
        { fileId: 48, key: 'identityKind', value: 'windows-shortcut' },
        { fileId: 48, key: 'displayNameSource', value: 'shortcut' },
        { fileId: 48, key: 'displayNameQuality', value: 'system' }
      ]
      privateProvider.dbUtils = {
        getFilesByType: vi.fn(async () => [dbApp]),
        getDb: () => ({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(async () => extensionRows)
            }))
          }))
        })
      }

      const batches: IndexedSourceRecordBatch[] = []
      for await (const batch of appProvider.scanIndexedSource({
        sourceId: 'app-provider',
        reason: 'startup'
      })) {
        batches.push(batch)
      }

      expect(batches).toEqual([
        expect.objectContaining({
          sourceId: 'app-provider',
          records: [
            expect.objectContaining({
              sourceId: 'app-provider',
              recordId: 'shortcut:c:\\program files\\example\\example.exe|',
              stableKey: 'shortcut:c:\\program files\\example\\example.exe|',
              kind: 'app',
              title: 'Example App',
              path: 'C:\\Start\\Example App.lnk',
              mtime: new Date('2026-05-30T00:00:00.000Z').getTime(),
              keywords: expect.arrayContaining(['exampleapp', 'example', 'app', 'ea']),
              search: expect.objectContaining({
                aliases: expect.arrayContaining([
                  expect.objectContaining({ value: 'Example App' }),
                  expect.objectContaining({ value: 'Example App.lnk' }),
                  expect.objectContaining({ value: 'Example' })
                ])
              }),
              metadata: expect.objectContaining({
                extension: '.exe',
                launchKind: 'shortcut',
                launchTarget: 'C:\\Program Files\\Example\\Example.exe',
                identityKind: 'windows-shortcut'
              })
            })
          ]
        }),
        { sourceId: 'app-provider', records: [], done: true }
      ])
    })
  })

  it('routes scheduled mdls reconciliation through Runtime with changed and deleted records', async () => {
    await withPlatform('darwin', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const previousRecord = {
        sourceId: 'app-provider',
        recordId: 'bundle:com.example.current',
        stableKey: 'bundle:com.example.current',
        kind: 'app',
        title: 'Example',
        path: '/Applications/Example.app'
      }
      const removedRecord = {
        sourceId: 'app-provider',
        recordId: 'bundle:com.example.removed',
        stableKey: 'bundle:com.example.removed',
        kind: 'app',
        title: 'Removed',
        path: '/Applications/Removed.app'
      }
      const changedRecord = { ...previousRecord, title: 'Localized Example' }
      privateProvider.collectIndexedSourceRecords = vi
        .fn()
        .mockResolvedValueOnce([previousRecord, removedRecord])
        .mockResolvedValueOnce([changedRecord])
      privateProvider._runFullSync = vi.fn(async () => ({
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 0
      }))
      privateProvider._runMdlsUpdateScan = vi.fn(async () => ({
        added: 0,
        changed: 1,
        deleted: 1,
        skipped: 0,
        errors: 0
      }))
      let runtimeResult: unknown
      const reconcile = vi.fn(async () => {
        runtimeResult = await privateProvider.reconcileIndexedSource({ sourceId: 'app-provider' })
      })
      privateProvider.setIndexedSourceRuntimeDelegate({
        scan: vi.fn(async () => undefined),
        reconcile,
        applyDelta: vi.fn(async () => undefined),
        reset: vi.fn(async (request) => ({
          sourceId: request.sourceId,
          reason: request.reason,
          clearedSearchIndex: true,
          clearedScanProgress: false,
          startedAt: 0,
          completedAt: 0
        }))
      })

      await privateProvider._runScheduledMdlsReconcile()

      expect(reconcile).toHaveBeenCalledWith('app-provider-scheduled-mdls')
      expect(runtimeResult).toMatchObject({
        deltas: [
          expect.objectContaining({
            action: 'change',
            record: expect.objectContaining({
              stableKey: changedRecord.stableKey,
              title: 'Localized Example'
            })
          }),
          expect.objectContaining({
            action: 'delete',
            stableKey: removedRecord.stableKey,
            path: removedRecord.path
          })
        ]
      })
    })
  })

  it('deletes Windows shortcut records by stored stable and legacy identities', async () => {
    await withPlatform('win32', async () => {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const storedPath =
        'C:\\Users\\Demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk'
      const stableKey = 'shortcut:c:\\program files\\foo\\foo.exe|--background'
      const storedFile = {
        id: 72,
        path: storedPath,
        name: 'Foo',
        displayName: 'Foo',
        type: 'app',
        mtime: new Date('2026-06-01T00:00:00.000Z')
      }
      const deleteWhere = vi.fn(async () => undefined)
      privateProvider.dbUtils = {
        getFileByPath: vi.fn(async () => storedFile),
        getDb: () => ({
          transaction: vi.fn(async (run: (tx: unknown) => Promise<void>) => {
            await run({ delete: vi.fn(() => ({ where: deleteWhere })) })
          })
        })
      }
      privateProvider.fetchExtensionsForFiles = vi.fn(async () => [
        {
          ...storedFile,
          extensions: {
            appIdentity: stableKey,
            launchKind: 'shortcut',
            launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
            launchArgs: '--background'
          }
        }
      ])

      const deltas = await appProvider.handleIndexedSourceWatchEvent({
        sourceId: 'app-provider',
        action: 'delete',
        path: storedPath.toLowerCase(),
        occurredAt: 1700000000000
      })

      expect(deltas).toEqual([
        expect.objectContaining({ action: 'delete', stableKey }),
        expect.objectContaining({ action: 'delete', stableKey: storedPath })
      ])
      expect(deleteWhere).toHaveBeenCalledTimes(2)
    })
  })

  it('keeps a returned startup scan pending until its backfill settles', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const backfill = createDeferred<void>()
    const firstRecord = {
      sourceId: 'app-provider',
      recordId: 'app-first',
      stableKey: 'app-first',
      kind: 'app',
      title: 'First App'
    }
    privateProvider._runStartupBackfill = vi.fn(() => backfill.promise)
    vi.spyOn(privateProvider as never, '_setLastBackfillTime').mockResolvedValue(undefined)
    privateProvider.buildIndexedSourceRecordBatches = vi.fn(async function* () {
      yield { sourceId: 'app-provider', records: [firstRecord] }
    })

    const iterator = appProvider
      .scanIndexedSource({ sourceId: 'app-provider', reason: 'startup' })
      [Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      value: { sourceId: 'app-provider', records: [firstRecord] },
      done: false
    })

    let closed = false
    const close = iterator.return!().then(() => {
      closed = true
    })
    await flushPromises()
    expect(closed).toBe(false)

    backfill.resolve()
    await expect(close).resolves.toBeUndefined()
  })

  it('keeps an aborted startup scan pending until its backfill settles', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const backfill = createDeferred<void>()
    const controller = new AbortController()
    const firstRecord = {
      sourceId: 'app-provider',
      recordId: 'app-first',
      stableKey: 'app-first',
      kind: 'app',
      title: 'First App'
    }
    privateProvider._runStartupBackfill = vi.fn(() => backfill.promise)
    privateProvider.buildIndexedSourceRecordBatches = vi.fn(async function* (_sourceId, signal) {
      yield { sourceId: 'app-provider', records: [firstRecord] }
      if (signal?.aborted) throw signal.reason
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })

    const iterator = appProvider
      .scanIndexedSource({
        sourceId: 'app-provider',
        reason: 'startup',
        signal: controller.signal
      })
      [Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      value: { sourceId: 'app-provider', records: [firstRecord] },
      done: false
    })

    controller.abort(new Error('shutdown'))
    const aborted = iterator.next()
    let settled = false
    void aborted.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await flushPromises()
    expect(settled).toBe(false)

    backfill.resolve()
    await expect(aborted).rejects.toThrow('shutdown')
  })

  it('retires a superseded startup identity through scan onDelta without bypassing the Runtime lease', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const backfill = createDeferred<void>()
    const oldRecord = {
      sourceId: 'app-provider',
      recordId: 'shortcut:c:\\program files\\foo\\foo.exe|',
      stableKey: 'shortcut:c:\\program files\\foo\\foo.exe|',
      kind: 'app',
      title: 'Foo',
      path: 'C:\\Start\\Foo.lnk'
    }
    const currentRecord = {
      ...oldRecord,
      recordId: 'shortcut:c:\\program files\\foo\\foo.exe|--background',
      stableKey: 'shortcut:c:\\program files\\foo\\foo.exe|--background'
    }
    const visibleStableKeys = new Set<string>()
    const onDelta = vi.fn(async (delta: { action: string; stableKey?: string }) => {
      if (delta.action === 'delete' && delta.stableKey) visibleStableKeys.delete(delta.stableKey)
    })
    privateProvider._runStartupBackfill = vi.fn(() => backfill.promise)
    vi.spyOn(privateProvider as never, '_setLastBackfillTime').mockResolvedValue(undefined)
    let snapshot = 0
    privateProvider.buildIndexedSourceRecordBatches = vi.fn(async function* () {
      snapshot += 1
      yield {
        sourceId: 'app-provider',
        records: [snapshot === 1 ? oldRecord : currentRecord]
      }
    })

    const iterator = appProvider
      .scanIndexedSource({ sourceId: 'app-provider', reason: 'startup', onDelta })
      [Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first).toEqual({
      value: { sourceId: 'app-provider', records: [oldRecord] },
      done: false
    })
    visibleStableKeys.add(oldRecord.stableKey)

    backfill.resolve()
    while (true) {
      const step = await iterator.next()
      if (step.done || step.value.done) break
      for (const record of step.value.records) visibleStableKeys.add(record.stableKey)
    }

    expect(onDelta).toHaveBeenCalledWith({
      sourceId: 'app-provider',
      action: 'delete',
      stableKey: oldRecord.stableKey,
      reason: 'app-provider-startup-identity-replaced'
    })
    expect(appRuntimeApplyDeltaMock).not.toHaveBeenCalled()
    expect([...visibleStableKeys]).toEqual([currentRecord.stableKey])
  })

  it('stops delayed startup health and backfill producers before either can request a Runtime scan', async () => {
    vi.useFakeTimers()
    try {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      privateProvider.dbUtils = {}
      privateProvider.searchIndex = {}
      privateProvider.appIndexSettings.startupBackfillEnabled = true
      privateProvider.getAppSearchIndexHealth = vi.fn(async () => ({
        healthy: false,
        appCount: 2,
        indexedItemCount: 0
      }))
      privateProvider.waitForMainRendererReady = vi.fn(async () => undefined)
      privateProvider._shouldRunStartupBackfill = vi.fn(async () => ({ allowed: true }))

      privateProvider._scheduleStartupIndexHealthCheck()
      privateProvider._scheduleStartupBackfill()
      await appProvider.onDestroy()
      await vi.advanceTimersByTimeAsync(15_000)

      expect(appRuntimeScanMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts an in-flight startup backfill retry sleep and waits for its tracked producer', async () => {
    vi.useFakeTimers()
    try {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const retryStarted = createDeferred<void>()
      const retrySleepStarted = createDeferred<void>()
      const waitForStartupProducerDelay =
        privateProvider.waitForStartupProducerDelay.bind(privateProvider)
      privateProvider.waitForStartupProducerDelay = vi.fn(async (delayMs) => {
        retrySleepStarted.resolve()
        await waitForStartupProducerDelay(delayMs)
      })
      privateProvider.appIndexSettings.startupBackfillEnabled = true
      privateProvider.appIndexSettings.startupBackfillRetryMax = 1
      privateProvider.appIndexSettings.startupBackfillRetryBaseMs = 10_000
      privateProvider.appIndexSettings.startupBackfillRetryMaxMs = 10_000
      privateProvider._shouldRunStartupBackfill = vi.fn(async () => {
        retryStarted.resolve()
        return { allowed: false, reason: 'renderer-not-ready' }
      })

      privateProvider._scheduleStartupBackfill()
      await vi.advanceTimersByTimeAsync(15_000)
      await retryStarted.promise
      await retrySleepStarted.promise
      const retryTask = privateProvider.startupBackfillTask
      expect(retryTask).not.toBeNull()
      let retrySettled = false
      void retryTask?.then(() => {
        retrySettled = true
      })

      await appProvider.prepareForSearchIndexShutdown()

      expect(retrySettled).toBe(true)
      expect(appRuntimeScanMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drains an in-flight DB-to-Runtime mutation before rejecting later public mutations', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const publishStarted = createDeferred<void>()
    const releasePublish = createDeferred<void>()
    const appPath = '/Applications/Manual.app'
    const appInfo = {
      name: 'Manual',
      displayName: 'Manual',
      path: appPath,
      icon: '',
      bundleId: 'com.example.manual',
      stableId: 'bundle:com.example.manual',
      uniqueId: 'bundle:com.example.manual',
      launchKind: 'bundle' as const,
      launchTarget: appPath,
      lastModified: new Date('2026-07-17T00:00:00.000Z')
    }
    privateProvider.processAppPath = vi.fn(async () => ({
      success: true,
      status: 'added',
      path: appPath,
      appInfo
    }))
    privateProvider.publishAppRuntimeUpsert = vi.fn(async () => {
      publishStarted.resolve()
      await releasePublish.promise
    })

    const inFlightAdd = appProvider.addAppByPath(appPath)
    await publishStarted.promise
    let shutdownSettled = false
    const shutdown = appProvider.prepareForSearchIndexShutdown().then(() => {
      shutdownSettled = true
    })
    await Promise.resolve()
    expect(shutdownSettled).toBe(false)

    releasePublish.resolve()
    await shutdown
    await expect(inFlightAdd).resolves.toEqual({ success: true, status: 'added', path: appPath })

    privateProvider.processAppPath = vi.fn()
    privateProvider.publishAppRuntimeUpsert = vi.fn()
    const dbAccess = vi.fn()
    privateProvider.dbUtils = { getDb: dbAccess }
    appRuntimeApplyDeltaMock.mockClear()
    appRuntimeResetMock.mockClear()
    const mutations: Array<{ name: string; invoke: () => Promise<unknown> }> = [
      { name: 'add path', invoke: async () => await appProvider.addAppByPath(appPath) },
      {
        name: 'upsert managed entry',
        invoke: async () =>
          await appProvider.upsertManagedEntry({
            path: '/Users/demo/bin/managed.sh',
            displayName: 'Managed',
            launchKind: 'path'
          })
      },
      {
        name: 'remove managed entry',
        invoke: async () => await appProvider.removeManagedEntry('/Users/demo/bin/managed.sh')
      },
      {
        name: 'set managed entry enabled',
        invoke: async () =>
          await appProvider.setManagedEntryEnabled('/Users/demo/bin/managed.sh', false)
      },
      {
        name: 'set aliases',
        invoke: async () => await appProvider.setAliases({ [appPath]: ['manual'] })
      },
      {
        name: 'reindex diagnostic target',
        invoke: async () =>
          await appProvider.reindexAppSearchTarget({
            target: 'Managed',
            mode: 'keywords',
            force: true
          })
      },
      { name: 'rebuild index', invoke: async () => await appProvider.rebuildIndex() }
    ]

    for (const mutation of mutations) {
      await expect(mutation.invoke()).rejects.toThrow('APP_PROVIDER_SHUTTING_DOWN')
    }

    expect(privateProvider.processAppPath).not.toHaveBeenCalled()
    expect(privateProvider.publishAppRuntimeUpsert).not.toHaveBeenCalled()
    expect(dbAccess).not.toHaveBeenCalled()
    expect(appRuntimeApplyDeltaMock).not.toHaveBeenCalled()
    expect(appRuntimeResetMock).not.toHaveBeenCalled()
  })

  it('drains a synchronously admitted rebuild reset when shutdown begins in the same tick', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const resetStarted = createDeferred<void>()
    const releaseReset = createDeferred<void>()
    const reset = vi.fn(async (request) => {
      resetStarted.resolve()
      await releaseReset.promise
      return {
        sourceId: request.sourceId,
        reason: request.reason,
        clearedSearchIndex: true,
        clearedScanProgress: false,
        startedAt: 0,
        completedAt: 0
      }
    })
    privateProvider.context = {}
    privateProvider.dbUtils = {}
    privateProvider.setIndexedSourceRuntimeDelegate({
      scan: vi.fn(async () => undefined),
      reconcile: vi.fn(async () => undefined),
      applyDelta: vi.fn(async () => undefined),
      reset
    })

    const rebuild = appProvider.rebuildIndex()
    let shutdownSettled = false
    const shutdown = appProvider.prepareForSearchIndexShutdown().then(() => {
      shutdownSettled = true
    })
    await resetStarted.promise
    expect(shutdownSettled).toBe(false)

    releaseReset.resolve()
    await shutdown
    await expect(rebuild).resolves.toEqual({
      success: true,
      message: 'App index rebuild complete'
    })
    expect(reset).toHaveBeenCalledWith({
      sourceId: 'app-provider',
      reason: 'manual-rebuild',
      clearSearchIndex: true,
      clearScanProgress: false
    })
  })

  it('times out a tracked Runtime mutation then retries shutdown after the mutation settles', async () => {
    vi.useFakeTimers()
    try {
      const { appProvider } = await loadSubject()
      const privateProvider = asPrivateProvider(appProvider)
      const runtimeMutationStarted = createDeferred<void>()
      const releaseRuntimeMutation = createDeferred<void>()
      const appPath = '/Applications/Manual.app'
      const appInfo = {
        name: 'Manual',
        displayName: 'Manual',
        path: appPath,
        icon: '',
        bundleId: 'com.example.manual',
        stableId: 'bundle:com.example.manual',
        uniqueId: 'bundle:com.example.manual',
        launchKind: 'bundle' as const,
        launchTarget: appPath,
        lastModified: new Date('2026-07-17T00:00:00.000Z')
      }
      const applyDelta = vi.fn(async () => {
        runtimeMutationStarted.resolve()
        await releaseRuntimeMutation.promise
      })
      privateProvider.processAppPath = vi.fn(async () => ({
        success: true,
        status: 'added',
        path: appPath,
        appInfo
      }))
      privateProvider.setIndexedSourceRuntimeDelegate({
        scan: vi.fn(async () => undefined),
        reconcile: vi.fn(async () => undefined),
        applyDelta,
        reset: vi.fn(async (request) => ({
          sourceId: request.sourceId,
          reason: request.reason,
          clearedSearchIndex: true,
          clearedScanProgress: false,
          startedAt: 0,
          completedAt: 0
        }))
      })

      let mutationSettled = false
      const mutation = appProvider.addAppByPath(appPath)
      void mutation.then(
        () => {
          mutationSettled = true
        },
        () => {
          mutationSettled = true
        }
      )
      await runtimeMutationStarted.promise

      const timedOutShutdown = appProvider
        .prepareForSearchIndexShutdown()
        .catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(30_000)

      await expect(timedOutShutdown).resolves.toMatchObject({
        message: 'APP_PROVIDER_SHUTDOWN_PRODUCER_TIMEOUT'
      })
      expect(mutationSettled).toBe(false)
      expect(applyDelta).toHaveBeenCalledTimes(1)
      await expect(appProvider.addAppByPath('/Applications/Blocked.app')).rejects.toThrow(
        'APP_PROVIDER_SHUTTING_DOWN'
      )
      expect(privateProvider.processAppPath).toHaveBeenCalledTimes(1)

      releaseRuntimeMutation.resolve()
      await expect(mutation).resolves.toEqual({ success: true, status: 'added', path: appPath })
      await expect(appProvider.prepareForSearchIndexShutdown()).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
