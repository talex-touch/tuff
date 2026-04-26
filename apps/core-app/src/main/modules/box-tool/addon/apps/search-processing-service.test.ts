import { describe, expect, it } from 'vitest'
import { mapAppsToRecommendationItems, processSearchResults } from './search-processing-service'

describe('search-processing-service', () => {
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
