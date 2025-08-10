import { ISearchProvider, TuffItem, TuffQuery } from '../../search-engine/types'
import PinyinMatch from 'pinyin-match'
import { exec } from 'child_process'

// A simple in-memory cache for the apps
let cachedApps: TuffItem[] = []
let isCacheInitialized = false

class AppProvider implements ISearchProvider {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'plugin'

  async onActivate() {
    if (isCacheInitialized) {
      return
    }

    console.log('[AppProvider] Initializing app cache...')

    const apps = await this.getAppsByPlatform()
    cachedApps = apps.map((app) => {
      return {
        key: app.path,
        title: app.name,
        // Pre-calculate pinyin for better performance
        pinyin: PinyinMatch.match(app.name, '') || [],
        ...app
      }
    })

    isCacheInitialized = true
    console.log(`[AppProvider] Cached ${cachedApps.length} apps.`)
  }

  onDeactivate() {
    // Optional: Clear cache on deactivate if needed
    // cachedApps = [];
    // isCacheInitialized = false;
  }

  onExecute(item: TuffItem) {
    const action = `open -a "${item.key}"`
    exec(action, (err) => {
      if (err) {
        console.error(`Failed to execute action: ${action}`, err)
      }
    })
  }

  async onSearch(query: TuffQuery): Promise<TuffItem[]> {
    if (!isCacheInitialized) {
      await this.onActivate()
    }

    if (!query.text) {
      return cachedApps.slice(0, 20) // Return some apps if query is empty
    }

    const searchResults = cachedApps
      .map((app) => {
        const matchResult = PinyinMatch.match(app.title, query.text)
        if (matchResult) {
          let score = matchResult.length
          // Bonus for consecutive matches
          for (let i = 0; i < matchResult.length - 1; i++) {
            if (matchResult[i + 1] === matchResult[i] + 1) {
              score += 1
            }
          }
          return {
            ...app,
            from: this.id, // Add provider id to item
            scoring: {
              match: score
            },
            matchResult
          }
        }
        return null
      })
      .filter((result): result is TuffItem => result !== null)
      .sort((a, b) => (b.scoring?.match || 0) - (a.scoring?.match || 0))

    return searchResults
  }

  private async getAppsByPlatform(): Promise<{ name: string; path: string }[]> {
    switch (process.platform) {
      case 'darwin': {
        const { getApps } = await import('./darwin')
        return getApps()
      }
      case 'win32': {
        const { getApps } = await import('./win')
        return getApps()
      }
      case 'linux': {
        const { getApps } = await import('./linux')
        return getApps()
      }
      default:
        return []
    }
  }
}

export const appProvider = new AppProvider()
