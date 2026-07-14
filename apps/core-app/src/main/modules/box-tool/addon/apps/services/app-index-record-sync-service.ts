import type {
  SearchIndexItem,
  SearchIndexKeyword,
  SearchIndexService
} from '../../../search-engine/search-index-service'
import path from 'node:path'
import {
  isAppEntryEnabledExtensionMap,
  resolveAppItemId,
  resolveAppItemIds
} from '../app-index-metadata'
import type { ScannedAppInfo } from '../app-types'
import { resolveDisplayName } from '../display-name-sync-utils'
import { normalizeStringList } from '../app-utils'

export interface AppIndexRecordSyncServiceOptions {
  providerId: string
  providerType: SearchIndexItem['type']
  getSearchIndex: () => SearchIndexService | null
  generateKeywords: (appInfo: ScannedAppInfo) => Promise<Set<string>>
  getAliases: (appInfo: ScannedAppInfo) => string[]
  resolveToolSourceIds: (appInfo: ScannedAppInfo) => string[]
}

export class AppIndexRecordSyncService {
  constructor(private readonly options: AppIndexRecordSyncServiceOptions) {}

  public async remove(itemIds: string[]): Promise<void> {
    const searchIndex = this.options.getSearchIndex()
    const normalizedItemIds = normalizeStringList(itemIds)
    if (!searchIndex || normalizedItemIds.length === 0) return

    const removeItems = (searchIndex as Partial<SearchIndexService>).removeItems
    if (typeof removeItems === 'function') await removeItems.call(searchIndex, normalizedItemIds)
  }

  public async sync(appInfo: ScannedAppInfo): Promise<void> {
    const searchIndex = this.options.getSearchIndex()
    if (!searchIndex) return

    const app = { ...appInfo, displayName: resolveDisplayName(appInfo.displayName, appInfo.name) }
    const itemId = resolveAppItemId(app)
    await this.remove(
      normalizeStringList([
        itemId,
        app.uniqueId,
        app.stableId,
        app.path,
        app.bundleId,
        app.launchTarget
      ]).filter((legacyItemId) => legacyItemId !== itemId)
    )

    const keywords = await this.options.generateKeywords(app)
    const keywordEntries: SearchIndexKeyword[] = Array.from(keywords).map((value) => ({
      value,
      priority: this.isAcronym(value, app) || this.isAlias(value, app) ? 1.5 : 1.1
    }))
    const aliases = normalizeStringList([
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
    const toolSourceIds = this.options.resolveToolSourceIds(app)
    const indexItem: SearchIndexItem = {
      itemId,
      providerId: this.options.providerId,
      type: this.options.providerType,
      name: app.name,
      displayName: app.displayName || undefined,
      description: app.description || undefined,
      path: app.path,
      extension:
        app.launchKind === 'uwp'
          ? '.uwp'
          : app.launchKind === 'protocol'
            ? '.protocol'
            : path.extname(app.launchTarget || app.path).toLowerCase(),
      aliases: aliases.map((value) => ({ value, priority: 1.5 })),
      keywords: keywordEntries,
      tags: normalizeStringList([
        app.bundleId,
        app.stableId,
        app.uniqueId,
        app.path,
        app.launchTarget,
        ...toolSourceIds.map((sourceId) => `tool-source:${sourceId}`)
      ])
    }
    await searchIndex.indexItems([indexItem])
  }

  public async syncState(
    appInfo: ScannedAppInfo,
    extensions: Record<string, string | null> | undefined
  ): Promise<void> {
    if (isAppEntryEnabledExtensionMap(extensions)) {
      await this.sync(appInfo)
      return
    }
    await this.remove(resolveAppItemIds(appInfo))
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
