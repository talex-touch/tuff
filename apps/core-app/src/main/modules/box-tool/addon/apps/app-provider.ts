import { ISearchProvider, TuffItem, TuffQuery } from '../../search-engine/types'
import PinyinMatch from 'pinyin-match'
import { exec } from 'child_process'

class AppProvider implements ISearchProvider {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'system' as const // System-level provider

  private cachedApps: TuffItem[] = []
  private isInitializing: Promise<void> | null = null

  private async _initialize(): Promise<void> {
    console.log('[AppProvider] Initializing app cache...')
    const apps = await this.getAppsByPlatform()
    this.cachedApps = apps.map(
      (app: { name: string; path: string; icon: string; bundleId: string }): TuffItem => {
        return {
          id: app.path,
          source: {
            type: this.type,
            id: this.id,
            name: this.name
          },
          kind: 'app',
          render: {
            mode: 'default',
            basic: {
              title: app.name,
              subtitle: app.path,
              icon: {
                type: 'base64',
                value: app.icon
              }
            }
          },
          actions: [
            {
              id: 'open-app',
              type: 'open',
              label: 'Open',
              primary: true,
              payload: {
                path: app.path
              }
            }
          ],
          meta: {
            app: {
              path: app.path,
              bundle_id: app.bundleId
            },
            extension: {
              keyWords: [
                ...new Set([app.name, app.path.split('/').pop()?.split('.')[0] || ''])
              ].filter(Boolean)
            }
          }
        }
      }
    )
    console.log(`[AppProvider] Cached ${this.cachedApps.length} apps.`)
  }

  onExecute(item: TuffItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const appPath = item.meta?.app?.path
      if (!appPath) {
        const err = new Error('Application path not found in TuffItem')
        console.error(err)
        return reject(err)
      }
      const action = `open -a "${appPath}"`
      exec(action, (err) => {
        if (err) {
          console.error(`Failed to execute action: ${action}`, err)
          return reject(err)
        }
        resolve()
      })
    })
  }

  async onSearch(query: TuffQuery): Promise<TuffItem[]> {
    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
    }
    await this.isInitializing

    if (!query.text) {
      return this.cachedApps.slice(0, 20) // Return some apps if query is empty
    }

    const searchResults = this.cachedApps
      .map((app) => {
        const title = app.render.basic?.title
        if (!title) return null

        const keyWords = app.meta?.extension?.keyWords || []
        const searchKeyWords = [...keyWords, title]
        for (const keyWord of searchKeyWords) {
          const matchResult = PinyinMatch.match(keyWord, query.text)
          if (matchResult && matchResult.length > 0) {
            const score = 1 - matchResult[0] / title.length // Higher score for earlier match
            const updatedItem: TuffItem = {
              ...app,
              scoring: {
                ...app.scoring,
                match: score,
                final: score
              },
              meta: {
                ...app.meta,
                extension: {
                  ...app.meta?.extension,
                  matchResult: [matchResult[0], matchResult[1]],
                  from: this.id
                }
              }
            }
            return { item: updatedItem, score }
          }
        }
        return null
      })
      .filter((result): result is { item: TuffItem; score: number } => result !== null)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.item)

    return searchResults
  }


  private async getAppsByPlatform(): Promise<
    { name: string; path: string; icon: string; bundleId: string }[]
  > {
    switch (process.platform) {
      case 'darwin': {
        const getApps = (await import('./darwin')).default
        return getApps()
      }
      case 'win32': {
        const getApps = (await import('./win')).default
        return getApps()
      }
      case 'linux': {
        const getApps = (await import('./linux')).default
        return getApps()
      }
      default:
        return []
    }
  }
}

export const appProvider = new AppProvider()
