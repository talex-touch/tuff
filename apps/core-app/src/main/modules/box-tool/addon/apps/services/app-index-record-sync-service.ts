import type { IndexedSourceSearchProjection } from '@talex-touch/utils/search'
import path from 'node:path'
import { resolveAppItemId, resolveAppItemIds } from '../app-index-metadata'
import type { ScannedAppInfo } from '../app-types'
import { resolveDisplayName } from '../display-name-sync-utils'
import { normalizeStringList } from '../app-utils'

export interface AppIndexedSourceRecordMapperOptions {
  generateKeywords: (appInfo: ScannedAppInfo) => Promise<Set<string>>
  getAliases: (appInfo: ScannedAppInfo) => string[]
  resolveToolSourceIds: (appInfo: ScannedAppInfo) => string[]
}

export interface AppIndexedSourceSearchRecord {
  itemId: string
  search: IndexedSourceSearchProjection
  tags: string[]
  toolSourceIds: string[]
}
export class AppIndexedSourceRecordMapper {
  constructor(private readonly options: AppIndexedSourceRecordMapperOptions) {}

  public async map(appInfo: ScannedAppInfo): Promise<AppIndexedSourceSearchRecord> {
    const app = { ...appInfo, displayName: resolveDisplayName(appInfo.displayName, appInfo.name) }
    const itemId = resolveAppItemId(app)
    const aliases = this.buildAliases(app)
    const keywords = await this.options.generateKeywords(app)
    const toolSourceIds = this.options.resolveToolSourceIds(app)

    return {
      itemId,
      search: {
        aliases: aliases.map((value) => ({ value, priority: 1.5 })),
        keywords: Array.from(keywords).map((value) => ({
          value,
          priority: this.isAcronym(value, app) || this.isAlias(value, app) ? 1.5 : 1.1
        })),
        legacyItemIds: normalizeStringList([...resolveAppItemIds(app), app.launchTarget]).filter(
          (legacyItemId) => legacyItemId !== itemId
        )
      },
      tags: normalizeStringList([
        app.bundleId,
        app.stableId,
        app.uniqueId,
        app.path,
        app.launchTarget,
        ...toolSourceIds.map((sourceId) => `tool-source:${sourceId}`)
      ]),
      toolSourceIds
    }
  }

  private buildAliases(app: ScannedAppInfo): string[] {
    return normalizeStringList([
      ...this.options.getAliases(app),
      app.displayName,
      app.name,
      app.fileName,
      ...(app.alternateNames ?? []),
      app.bundleId,
      app.uniqueId,
      app.stableId,
      app.path,
      app.launchTarget,
      app.displayPath,
      path.basename(app.path, path.extname(app.path) || undefined),
      path.basename(app.launchTarget || '', path.extname(app.launchTarget || '') || undefined)
    ])
  }

  private isAcronym(keyword: string, appInfo: ScannedAppInfo): boolean {
    return [appInfo.name, appInfo.displayName, appInfo.fileName, ...(appInfo.alternateNames ?? [])]
      .filter(Boolean)
      .some((name) => {
        if (!name || !name.includes(' ')) return false
        return (
          name
            .split(' ')
            .filter(Boolean)
            .map((word) => word.charAt(0))
            .join('')
            .toLowerCase() === keyword
        )
      })
  }

  private isAlias(keyword: string, appInfo: ScannedAppInfo): boolean {
    return this.options.getAliases(appInfo).includes(keyword)
  }
}
