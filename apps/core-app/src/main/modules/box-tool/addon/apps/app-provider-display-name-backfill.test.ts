import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWatchPathMock,
  asPrivateProvider,
  getAppsMock,
  getMainConfigMock,
  getWatchPathsMock,
  loadSubject,
  pinyinMock,
  runMdlsUpdateScanMock,
  spawnSafeMock
} from './app-provider-test-harness'

describe('appProvider display name backfill', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    addWatchPathMock.mockResolvedValue(undefined)
    getWatchPathsMock.mockReturnValue([])
    getAppsMock.mockResolvedValue([])
    getMainConfigMock.mockReturnValue(undefined)
    spawnSafeMock.mockReturnValue({ unref: vi.fn() })
    runMdlsUpdateScanMock.mockResolvedValue({
      updatedApps: [],
      updatedCount: 0,
      deletedApps: []
    })
    pinyinMock.mockImplementation((value: string) => value)
  })

  it('does not downgrade a localized display name during startup metadata refresh', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const dbRow = {
      id: 81,
      path: '/Applications/wechatwebdevtools.app',
      name: 'wechatwebdevtools',
      displayName: '微信开发者工具',
      type: 'app',
      mtime: new Date('2026-05-05T08:00:00Z'),
      ctime: new Date('2026-05-05T08:00:00Z')
    }
    const scannedApp = {
      name: 'wechatwebdevtools',
      displayName: 'wechatwebdevtools',
      displayNameQuality: 'manifest' as const,
      path: '/Applications/wechatwebdevtools.app',
      icon: '',
      bundleId: 'com.tencent.webplusdevtools',
      uniqueId: '/Applications/wechatwebdevtools.app',
      stableId: '/Applications/wechatwebdevtools.app',
      launchKind: 'path' as const,
      launchTarget: '/Applications/wechatwebdevtools.app',
      lastModified: new Date('2026-05-05T09:00:00Z')
    }
    let updatedDisplayName: string | null = dbRow.displayName

    getAppsMock.mockResolvedValue([scannedApp])
    privateProvider.dbUtils = {
      getFilesByType: vi.fn().mockResolvedValue([dbRow]),
      getDb: () => ({
        update: vi.fn(() => ({
          set: vi.fn((values: { displayName?: string }) => ({
            where: vi.fn(async () => {
              if (values.displayName) updatedDisplayName = values.displayName
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
          appIdentity: '/Applications/wechatwebdevtools.app',
          displayNameQuality: 'localized'
        }
      }))
    )
    privateProvider._recordMissingIconApps = vi.fn().mockResolvedValue(undefined)

    await privateProvider._performStartupBackfill()

    expect(updatedDisplayName).toBe('微信开发者工具')
  })
})
