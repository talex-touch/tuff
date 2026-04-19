import { describe, expect, it } from 'vitest'
import { mapAppsToRecommendationItems } from './search-processing-service'

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
})
