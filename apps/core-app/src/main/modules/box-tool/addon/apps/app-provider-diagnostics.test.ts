import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asPrivateProvider, loadSubject, pinyinMock } from './app-provider-test-harness'

describe('appProvider app search diagnostics recall', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    pinyinMock.mockImplementation((value: string, options?: { pattern?: string }) => {
      if (options?.pattern === 'first') {
        return value === '微信' ? 'WX' : value
      }
      return value === '微信' ? 'WEI XIN' : value
    })
  })

  it('diagnoses an app from a single search query input', async () => {
    const { appProvider } = await loadSubject()
    const privateProvider = asPrivateProvider(appProvider)
    const appRow = {
      id: 9,
      path: 'D:\\Weixin\\Weixin.exe',
      name: 'WeChat',
      displayName: '微信',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        appIdentity: 'path:d:\\weixin\\weixin.exe',
        bundleId: '',
        alternateNames: JSON.stringify(['WeChat']),
        launchKind: 'path',
        launchTarget: 'D:\\Weixin\\Weixin.exe'
      }
    }
    const keywordRows = [
      { value: 'wechat', priority: 1.1 },
      { value: 'weixin', priority: 1.1 },
      { value: '微信', priority: 1.1 }
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
            'weixin',
            [
              {
                itemId: 'path:d:\\weixin\\weixin.exe',
                priority: 1.1
              }
            ]
          ]
        ])
      }),
      lookupByKeywordPrefix: vi.fn(async () => [
        {
          itemId: 'path:d:\\weixin\\weixin.exe',
          keyword: 'weixin',
          priority: 1.1
        }
      ]),
      search: vi.fn(async () => [{ itemId: 'path:d:\\weixin\\weixin.exe', score: -1 }]),
      lookupByNgrams: vi.fn(async () => [
        { itemId: 'path:d:\\weixin\\weixin.exe', overlapCount: 2 }
      ]),
      lookupBySubsequence: vi.fn(async () => [
        {
          itemId: 'path:d:\\weixin\\weixin.exe',
          keyword: 'weixin',
          priority: 1.1
        }
      ])
    }

    const result = await appProvider.diagnoseAppSearch({
      target: 'weixin',
      query: 'weixin'
    })

    expect(result).toMatchObject({
      success: true,
      status: 'found',
      app: {
        path: 'D:\\Weixin\\Weixin.exe',
        displayName: '微信',
        alternateNames: ['WeChat']
      },
      query: {
        normalized: 'weixin',
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
      path: '/Applications/WeChat.app',
      name: 'WeChat',
      displayName: '微信',
      type: 'app',
      mtime: new Date(0),
      ctime: new Date(0),
      extensions: {
        appIdentity: '/Applications/WeChat.app',
        bundleId: 'com.tencent.xinWeChat',
        alternateNames: JSON.stringify(['WeChat']),
        launchKind: 'path',
        launchTarget: '/Applications/WeChat.app'
      }
    }
    const keywordRows = [
      { itemId: '/Applications/WeChat.app', priority: 1.1 },
      { itemId: 'com.tencent.xinWeChat', priority: 1.1 }
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
        path: '/Applications/WeChat.app',
        displayName: '微信',
        bundleId: 'com.tencent.xinWeChat'
      }
    })
  })
})
