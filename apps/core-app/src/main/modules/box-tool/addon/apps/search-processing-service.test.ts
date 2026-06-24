import type { TuffItem, TuffQuery } from '@talex-touch/utils/core-box'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mapAppsToRecommendationItems, processSearchResults } from './search-processing-service'

type AppSearchTestRow = Parameters<typeof mapAppsToRecommendationItems>[0][number]

function getBasicIcon(item: TuffItem): unknown {
  return item.render.basic?.icon
}

function getAppMeta(item: TuffItem):
  | {
      launchKind?: string
      launchTarget?: string
      bundleId?: string
      bundle_id?: string
    }
  | undefined {
  return item.meta?.app as
    | {
        launchKind?: string
        launchTarget?: string
        bundleId?: string
        bundle_id?: string
      }
    | undefined
}

function createAppSearchRow(
  overrides: Partial<AppSearchTestRow> & Pick<AppSearchTestRow, 'name' | 'path' | 'extensions'>
): AppSearchTestRow {
  const { name, path: filePath, extensions, ...rest } = overrides
  return {
    id: 1,
    name,
    path: filePath,
    displayName: rest.displayName ?? name,
    extension: null,
    size: null,
    mtime: new Date(0),
    ctime: new Date(0),
    lastIndexedAt: new Date(0),
    isDir: false,
    type: 'app',
    content: null,
    embeddingStatus: 'none',
    ...rest,
    extensions
  }
}

describe('search-processing-service', () => {
  it('falls back to clean app name when displayName contains replacement chars', async () => {
    const items = await processSearchResults(
      [
        createAppSearchRow({
          name: '\u5FAE\u4FE1',
          displayName: '\u03A2\uFFFD\uFFFD',
          path: 'D:\\ChatApp\\ChatApp.exe',
          extensions: {
            appIdentity: 'path:d:\\chatapp\\chatapp.exe',
            launchKind: 'path',
            launchTarget: 'D:\\ChatApp\\ChatApp.exe'
          }
        })
      ],
      { text: '\u5FAE', inputs: [] } satisfies TuffQuery,
      false,
      {}
    )

    expect(items).toHaveLength(1)
    expect(items[0]?.render).toMatchObject({
      basic: {
        title: '\u5FAE\u4FE1'
      }
    })
  })

  it('prefers displayPath as subtitle for Windows Store apps', () => {
    const [item] = mapAppsToRecommendationItems(
      [
        {
          name: 'Calculator',
          displayName: 'Calculator',
          path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          extensions: {
            appIdentity: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app',
            displayPath: 'Windows Store',
            description: 'Fast calculations',
            icon: 'data:image/png;base64,AA==',
            launchKind: 'uwp',
            launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
          }
        }
      ].map((row) => createAppSearchRow(row))
    )

    expect(item.render.basic?.subtitle).toBe('Windows Store')
    expect(item.render.basic?.description).toBe('Fast calculations')
    expect(item.render.basic?.icon).toMatchObject({
      type: 'url',
      value: 'data:image/png;base64,AA=='
    })
    expect(getAppMeta(item)?.launchKind).toBe('uwp')
    expect(getAppMeta(item)?.launchTarget).toBe('Microsoft.WindowsCalculator_8wekyb3d8bbwe!App')
    expect(getAppMeta(item)?.bundleId).toBe('')
    expect(getAppMeta(item)?.bundle_id).toBeUndefined()
  })

  it('normalizes existing local app icon paths to tfile URLs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-search-icon-'))
    const iconPath = path.join(tempDir, 'AppIcon.png')
    fs.writeFileSync(iconPath, 'png')
    const [item] = mapAppsToRecommendationItems([
      createAppSearchRow({
        name: 'Preview',
        displayName: 'Preview',
        path: '/Applications/Preview.app',
        extensions: {
          appIdentity: '/Applications/Preview.app',
          icon: iconPath,
          launchKind: 'path',
          launchTarget: '/Applications/Preview.app'
        }
      })
    ])

    try {
      expect(getBasicIcon(item)).toMatchObject({
        type: 'url',
        value: `tfile://${iconPath}`
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('falls back when local app icon path is missing', () => {
    const [item] = mapAppsToRecommendationItems([
      createAppSearchRow({
        name: 'Preview',
        displayName: 'Preview',
        path: '/Applications/Preview.app',
        extensions: {
          appIdentity: '/Applications/Preview.app',
          icon: '/tmp/talex-touch-missing-app-icon.png',
          launchKind: 'path',
          launchTarget: '/Applications/Preview.app'
        }
      })
    ])

    expect(getBasicIcon(item)).toMatchObject({
      type: 'class',
      value: 'i-ri-apps-line'
    })
  })

  it('keeps empty app icons on the existing file fallback path', () => {
    const [item] = mapAppsToRecommendationItems(
      [
        {
          name: 'No Icon',
          displayName: 'No Icon',
          path: '/Applications/No Icon.app',
          extensions: {
            appIdentity: '/Applications/No Icon.app',
            launchKind: 'path',
            launchTarget: '/Applications/No Icon.app'
          }
        }
      ].map((row) => createAppSearchRow(row))
    )

    expect(item.render.basic?.icon).toMatchObject({
      type: 'file',
      value: ''
    })
  })

  it('skips disabled app entries in recommendation mapping', () => {
    const rows: Array<
      Partial<AppSearchTestRow> & Pick<AppSearchTestRow, 'name' | 'path' | 'extensions'>
    > = [
      {
        name: 'Managed Script',
        displayName: 'Managed Script',
        path: '/Users/demo/bin/script.sh',
        extensions: {
          entrySource: 'manual',
          entryEnabled: '0',
          launchKind: 'shortcut',
          launchTarget: '/Users/demo/bin/script.sh'
        }
      },
      {
        name: 'Disabled Scanned',
        displayName: 'Disabled Scanned',
        path: '/Applications/Disabled.app',
        extensions: {
          entryEnabled: 'false',
          appIdentity: '/Applications/Disabled.app',
          launchKind: 'path',
          launchTarget: '/Applications/Disabled.app'
        }
      }
    ]
    const items = mapAppsToRecommendationItems(rows.map((row) => createAppSearchRow(row)))

    expect(items).toEqual([])
  })

  it('matches localized alternate names stored in app extensions', async () => {
    const rows = [
      {
        name: 'NeteaseMusic 2',
        displayName: 'NeteaseMusic 2',
        path: '/Applications/NeteaseMusic 2.app',
        extensions: {
          alternateNames: JSON.stringify(['网易云音乐']),
          appIdentity: '/Applications/NeteaseMusic 2.app',
          bundleId: 'com.netease.163music',
          launchKind: 'path',
          launchTarget: '/Applications/NeteaseMusic 2.app'
        }
      }
    ] as unknown as Parameters<typeof processSearchResults>[0]
    const query = { text: '网易云', inputs: [] } as Parameters<typeof processSearchResults>[1]

    const items = await processSearchResults(rows, query, false, {})
    const render = items[0]?.render as { basic?: { title?: string } } | undefined
    const meta = items[0]?.meta as { extension?: { source?: string } } | undefined

    expect(items).toHaveLength(1)
    expect(render?.basic?.title).toBe('NeteaseMusic 2')
    expect(meta?.extension?.source).toBe('alternate-name')
  })

  it('matches localized app titles through English app tokens', async () => {
    const rows = [
      createAppSearchRow({
        name: 'wechatwebdevtools',
        displayName: '微信开发者工具',
        path: '/Applications/wechatwebdevtools.app',
        extensions: {
          appIdentity: '/Applications/wechatwebdevtools.app',
          bundleId: 'com.tencent.wechatwebdevtools',
          launchKind: 'path',
          launchTarget: '/Applications/wechatwebdevtools.app'
        }
      })
    ] as unknown as Parameters<typeof processSearchResults>[0]
    const query = { text: 'wechatw', inputs: [] } as Parameters<typeof processSearchResults>[1]

    const items = await processSearchResults(rows, query, false, {})
    const meta = items[0]?.meta as
      | {
          extension?: {
            source?: string
            matchResult?: Array<{ start: number; end: number }>
            matchAlias?: { text?: string; matchResult?: Array<{ start: number; end: number }> }
            searchTokens?: Array<{ value?: string; source?: string }>
          }
        }
      | undefined

    expect(items).toHaveLength(1)
    expect(items[0]?.render.basic?.title).toBe('微信开发者工具')
    expect(meta?.extension?.source).toBe('name')
    expect(meta?.extension?.matchResult).toEqual([])
    expect(meta?.extension?.matchAlias).toEqual({
      text: 'Wechatwebdevtools',
      matchResult: [{ start: 0, end: 'wechatw'.length }]
    })
    expect(meta?.extension?.searchTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'wechatwebdevtools', source: 'name' })
      ])
    )
  })

  it('maps camel-case app title initials to title highlights without alias noise', async () => {
    const rows = [
      createAppSearchRow({
        name: 'MacCleaner Pro',
        displayName: 'MacCleaner Pro',
        path: '/Applications/MacCleaner Pro.app',
        extensions: {
          appIdentity: '/Applications/MacCleaner Pro.app',
          launchKind: 'path',
          launchTarget: '/Applications/MacCleaner Pro.app'
        }
      })
    ] as unknown as Parameters<typeof processSearchResults>[0]
    const query = { text: 'cp', inputs: [] } as Parameters<typeof processSearchResults>[1]

    const items = await processSearchResults(rows, query, false, {})
    const meta = items[0]?.meta as
      | {
          extension?: {
            source?: string
            matchResult?: Array<{ start: number; end: number }>
            matchAlias?: { text?: string; matchResult?: Array<{ start: number; end: number }> }
          }
        }
      | undefined

    expect(items).toHaveLength(1)
    expect(items[0]?.render.basic?.title).toBe('MacCleaner Pro')
    expect(meta?.extension?.source).toBe('initials')
    expect(meta?.extension?.matchResult).toEqual([
      { start: 3, end: 4 },
      { start: 11, end: 12 }
    ])
    expect(meta?.extension?.matchAlias).toBeUndefined()
  })

  it('matches Photoshop from short and category semantic aliases', async () => {
    const rows = [
      createAppSearchRow({
        name: 'Adobe Photoshop 2026',
        displayName: 'Adobe Photoshop 2026',
        path: '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app',
        extensions: {
          appIdentity: '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app',
          bundleId: 'com.adobe.Photoshop',
          launchKind: 'path',
          launchTarget: '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app'
        }
      })
    ] as unknown as Parameters<typeof processSearchResults>[0]

    const psItems = await processSearchResults(
      rows,
      { text: 'ps', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )
    const designItems = await processSearchResults(
      rows,
      { text: 'design', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )

    expect(psItems).toHaveLength(1)
    expect(psItems[0]?.meta?.extension).toMatchObject({
      source: 'alias',
      toolSources: ['design'],
      matchAlias: {
        text: 'Ps',
        matchResult: [{ start: 0, end: 2 }]
      }
    })
    expect(designItems).toHaveLength(1)
    expect(designItems[0]?.meta?.extension).toMatchObject({
      source: 'alias',
      toolSources: ['design'],
      matchAlias: {
        text: 'Design',
        matchResult: [{ start: 0, end: 6 }]
      }
    })
  })

  it('matches IM apps from English and Chinese category semantic aliases', async () => {
    const rows = [
      createAppSearchRow({
        name: 'Feishu',
        displayName: '飞书',
        path: '/Applications/Feishu.app',
        extensions: {
          appIdentity: '/Applications/Feishu.app',
          bundleId: 'com.bytedance.feishu',
          launchKind: 'path',
          launchTarget: '/Applications/Feishu.app'
        }
      }),
      createAppSearchRow({
        id: 2,
        name: 'Telegram',
        displayName: 'Telegram',
        path: '/Applications/Telegram.app',
        extensions: {
          appIdentity: '/Applications/Telegram.app',
          bundleId: 'org.telegram.desktop',
          launchKind: 'path',
          launchTarget: '/Applications/Telegram.app'
        }
      })
    ] as unknown as Parameters<typeof processSearchResults>[0]

    const imItems = await processSearchResults(
      rows,
      { text: 'im', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )
    const chatItems = await processSearchResults(
      rows,
      { text: '即时通讯', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )

    expect(imItems.map((item) => item.render.basic?.title)).toEqual(['飞书', 'Telegram'])
    expect(chatItems.map((item) => item.render.basic?.title)).toEqual(['飞书', 'Telegram'])
    expect(imItems[0]?.meta?.extension).toMatchObject({
      source: 'alias',
      toolSources: ['im'],
      matchAlias: {
        text: 'Im',
        matchResult: [{ start: 0, end: 2 }]
      }
    })
  })

  it('matches VS Code from semantic short aliases while keeping title matches stronger', async () => {
    const rows = [
      createAppSearchRow({
        name: 'Visual Studio Code',
        displayName: 'Visual Studio Code',
        path: '/Applications/Visual Studio Code.app',
        extensions: {
          appIdentity: '/Applications/Visual Studio Code.app',
          bundleId: 'com.microsoft.VSCode',
          launchKind: 'path',
          launchTarget: '/Applications/Visual Studio Code.app'
        }
      }),
      createAppSearchRow({
        id: 2,
        name: 'Code Notes',
        displayName: 'Code Notes',
        path: '/Applications/Code Notes.app',
        extensions: {
          appIdentity: '/Applications/Code Notes.app',
          launchKind: 'path',
          launchTarget: '/Applications/Code Notes.app'
        }
      })
    ] as unknown as Parameters<typeof processSearchResults>[0]

    const vscItems = await processSearchResults(
      rows,
      { text: 'vsc', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )
    const codeItems = await processSearchResults(
      rows,
      { text: 'code', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )

    expect(vscItems).toHaveLength(1)
    expect(vscItems[0]?.render.basic?.title).toBe('Visual Studio Code')
    expect(vscItems[0]?.meta?.extension).toMatchObject({
      source: 'initials',
      matchResult: [
        { start: 0, end: 1 },
        { start: 7, end: 8 },
        { start: 14, end: 15 }
      ]
    })
    expect(codeItems.map((item) => item.render.basic?.title)).toEqual([
      'Code Notes',
      'Visual Studio Code'
    ])
  })

  it('keeps Codex searchable through direct title matching', async () => {
    const rows = [
      createAppSearchRow({
        name: 'Codex',
        displayName: 'Codex',
        path: 'shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App',
        extensions: {
          appIdentity: 'uwp:openai.codex_2p2nqsd0c76g0!app',
          bundleId: 'OpenAI.Codex_2p2nqsd0c76g0',
          launchKind: 'uwp',
          launchTarget: 'OpenAI.Codex_2p2nqsd0c76g0!App'
        }
      })
    ] as unknown as Parameters<typeof processSearchResults>[0]

    const items = await processSearchResults(
      rows,
      { text: 'codex', inputs: [] } as Parameters<typeof processSearchResults>[1],
      false,
      {}
    )

    expect(items).toHaveLength(1)
    expect(items[0]?.render.basic?.title).toBe('Codex')
    expect(items[0]?.meta?.extension).toMatchObject({
      toolSources: ['dev'],
      source: 'name',
      matchResult: [{ start: 0, end: 5 }]
    })
  })
})
