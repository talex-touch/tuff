import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asPrivateProvider, loadSubject, pinyinMock } from './app-provider-test-harness'

describe('appProvider app search diagnostics recall', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (options?.pattern === 'first') {
        return value === '聊天应用' ? 'WX' : value
      }
      return value === '聊天应用' ? 'WEI XIN' : value
    })
  })

  it('diagnoses an app from a single search query input', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const appRow = {
      id: 9,
      path: 'D:\\ChatApp\\ChatApp.exe',
      name: 'ChatApp',
      displayName: '聊天应用',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        appIdentity: 'path:d:\\chatapp\\chatapp.exe',
        bundleId: '',
        alternateNames: JSON.stringify(['ChatApp']),
        identityKind: 'windows-path',
        displayNameSource: 'Get-StartApps',
        displayNameQuality: 'system',
        launchKind: 'path',
        launchTarget: 'D:\\ChatApp\\ChatApp.exe'
      }
    }
    const keywordRows = [
      { value: 'chatapp', priority: 1.1 },
      { value: 'chatapp', priority: 1.1 },
      { value: '聊天应用', priority: 1.1 }
    ]

    privateProvider.dbUtils = {
      getDb: () => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => keywordRows)
            }))
          }))
        }))
      }),
      getFilesByType: vi.fn(async () => [appRow])
    }
    privateProvider.fetchExtensionsForFiles = vi.fn(async () => [appRow])
    privateProvider.searchIndex = {
      lookupByKeywords: vi.fn(async () => {
        return new Map([
          [
            'chatapp',
            [
              {
                itemId: 'path:d:\\chatapp\\chatapp.exe',
                priority: 1.1
              }
            ]
          ]
        ])
      }),
      lookupByKeywordPrefix: vi.fn(async () => [
        {
          itemId: 'path:d:\\chatapp\\chatapp.exe',
          keyword: 'chatapp',
          priority: 1.1
        }
      ]),
      search: vi.fn(async () => [{ itemId: 'path:d:\\chatapp\\chatapp.exe', score: -1 }]),
      lookupByNgrams: vi.fn(async () => [
        { itemId: 'path:d:\\chatapp\\chatapp.exe', overlapCount: 2 }
      ]),
      lookupBySubsequence: vi.fn(async () => [
        {
          itemId: 'path:d:\\chatapp\\chatapp.exe',
          keyword: 'chatapp',
          priority: 1.1
        }
      ])
    }

    const result = await appProvider.diagnoseAppSearch({
      target: 'chatapp',
      query: 'chatapp'
    })

    expect(result).toMatchObject({
      success: true,
      status: 'found',
      app: {
        path: 'D:\\ChatApp\\ChatApp.exe',
        displayName: '聊天应用',
        alternateNames: ['ChatApp'],
        identityKind: 'windows-path',
        displayNameSource: 'Get-StartApps',
        displayNameQuality: 'system'
      },
      query: {
        normalized: 'chatapp',
        stages: {
          precise: { ran: true, targetHit: true }
        }
      }
    })
  })

  it('diagnoses an app from a stored short alias keyword', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const appRow = {
      id: 10,
      path: '/Applications/ChatApp.app',
      name: 'ChatApp',
      displayName: '聊天应用',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        appIdentity: '/Applications/ChatApp.app',
        bundleId: 'com.example.chatapp',
        alternateNames: JSON.stringify(['ChatApp']),
        launchKind: 'path',
        launchTarget: '/Applications/ChatApp.app'
      }
    }
    const keywordRows = [
      { itemId: '/Applications/ChatApp.app', priority: 1.1 },
      { itemId: 'com.example.chatapp', priority: 1.1 }
    ]

    privateProvider.dbUtils = {
      getDb: () => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => keywordRows)
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
      target: 'wx',
      query: 'wx'
    })

    expect(result).toMatchObject({
      success: true,
      status: 'found',
      app: {
        path: '/Applications/ChatApp.app',
        displayName: '聊天应用',
        bundleId: 'com.example.chatapp'
      }
    })
  })
})
