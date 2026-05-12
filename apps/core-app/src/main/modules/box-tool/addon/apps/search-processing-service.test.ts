import type { TuffItem } from '@talex-touch/utils/core-box'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mapAppsToRecommendationItems, processSearchResults } from './search-processing-service'

type AppSearchTestRow = Parameters<typeof mapAppsToRecommendationItems>[0][number]

function getBasicIcon(item: TuffItem): unknown {
  return item.render.basic?.icon
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
        {
          name: '\u5FAE\u4FE1',
          displayName: '\u03A2\uFFFD\uFFFD',
          path: 'D:\\Weixin\\Weixin.exe',
          extensions: {
            appIdentity: 'path:d:\\weixin\\weixin.exe',
            launchKind: 'path',
            launchTarget: 'D:\\Weixin\\Weixin.exe'
          }
        }
      ] as any,
      { text: '\u5FAE', inputs: [] } as any,
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
    const [item] = mapAppsToRecommendationItems([
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
    ] as any)

    expect((item.render as any)?.basic?.subtitle).toBe('Windows Store')
    expect((item.render as any)?.basic?.description).toBe('Fast calculations')
    expect((item.render as any)?.basic?.icon).toMatchObject({
      type: 'url',
      value: 'data:image/png;base64,AA=='
    })
    expect((item.meta as any)?.app?.launchKind).toBe('uwp')
    expect((item.meta as any)?.app?.launchTarget).toBe(
      'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
    )
    expect((item.meta as any)?.app?.bundleId).toBe('')
    expect((item.meta as any)?.app?.bundle_id).toBeUndefined()
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
    const [item] = mapAppsToRecommendationItems([
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
    ] as any)

    expect((item.render as any)?.basic?.icon).toMatchObject({
      type: 'file',
      value: ''
    })
  })

  it('skips disabled managed launcher entries in recommendation mapping', () => {
    const items = mapAppsToRecommendationItems([
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
      }
    ] as any)

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
})
