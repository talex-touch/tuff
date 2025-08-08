import { ISearchSource, SearchContext, SearchSourceType } from '../../../search-engine/types'
import { TuffFactory, TuffItem } from '@talex-touch/utils'
import getApps from './getApps'

interface MacApp {
  _name: string
  lastModified: Date
  path: string
  version: string
}

function getAppsPromise(): Promise<MacApp[]> {
  return new Promise((resolve, reject) => {
    getApps(resolve, reject)
  })
}

export class ApplicationSource implements ISearchSource {
  readonly name = 'mac-applications'
  readonly type = SearchSourceType.Application
  readonly isVolatile = false

  private appCache: MacApp[] = []

  async onRegister(): Promise<void> {
    await this.onRefresh()
  }

  async onSearch(context: SearchContext): Promise<TuffItem[]> {
    if (!context.keyword) {
      return []
    }

    const lowerCaseKeyword = context.keyword.toLowerCase()
    const matchedApps = this.appCache.filter(app =>
      app._name.toLowerCase().includes(lowerCaseKeyword)
    )

    return matchedApps.map(app =>
      TuffFactory.createAppItem(
        app._name,
        app.path,
        '', // bundleId is not available from this script
        this.type,
        this.name
      )
    )
  }

  async onRefresh(): Promise<void> {
    try {
      this.appCache = await getAppsPromise()
      console.log(`[ApplicationSource] Refreshed app cache with ${this.appCache.length} applications.`)
    } catch (error) {
      console.error('[ApplicationSource] Failed to refresh app cache:', error)
    }
  }
}