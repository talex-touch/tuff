import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import type { DbUtils } from '../../../../db/utils'
import type { ScoredItem } from './recommendation-engine'

/**
 * Rebuilds complete TuffItems from recommendation results.
 * Converts lightweight ScoredItems (sourceId + itemId) into full TuffItems
 * by querying the database and applying provider transformation logic.
 */
export class ItemRebuilder {
  constructor(private dbUtils: DbUtils) {}

  async rebuildItems(scoredItems: ScoredItem[]): Promise<TuffItem[]> {
    if (scoredItems.length === 0)
      return []

    const grouped = this.groupBySource(scoredItems)
    
    const [appItems, fileItems] = await Promise.all([
      this.rebuildAppItems(grouped.get('app-provider') || []),
      this.rebuildFileItems(grouped.get('file-provider') || []),
    ])

    return this.mergeAndEnrichItems([...appItems, ...fileItems], scoredItems)
  }

  private groupBySource(items: ScoredItem[]): Map<string, ScoredItem[]> {
    const groups = new Map<string, ScoredItem[]>()
    
    for (const item of items) {
      const key = item.sourceId
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(item)
    }
    
    return groups
  }

  private async rebuildAppItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0)
      return []

    try {
      const paths = items.map(item => item.itemId)
      const apps = await this.dbUtils.getFilesByPaths(paths)
      
      if (apps.length === 0)
        return []

      const appsWithExtensions = await this.fetchExtensionsForApps(apps)
      const { processSearchResults } = await import('../../addon/apps/search-processing-service')
      
      const dummyQuery: TuffQuery = { text: '' }
      return processSearchResults(appsWithExtensions, dummyQuery, false, {})
    }
    catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild app items:', error)
      return []
    }
  }

  private async fetchExtensionsForApps(apps: any[]): Promise<any[]> {
    const fileIds = apps.map(app => app.id)
    const extensions = await this.dbUtils.getFileExtensionsByFileIds(fileIds)
    
    return apps.map(app => ({
      ...app,
      extensions: extensions
        .filter(ext => ext.fileId === app.id)
        .reduce((acc, ext) => {
          acc[ext.key] = ext.value
          return acc
        }, {} as Record<string, string | null>),
    }))
  }

  private async rebuildFileItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0)
      return []

    try {
      const paths = items.map(item => item.itemId)
      const files = await this.dbUtils.getFilesByPaths(paths)
      
      if (files.length === 0)
        return []

      const { mapFileToTuffItem } = await import('../../addon/files/utils')
      return files.map(file => mapFileToTuffItem(file, {}, 'file-provider', 'File Provider'))
    }
    catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild file items:', error)
      return []
    }
  }

  private mergeAndEnrichItems(
    items: TuffItem[],
    scoredItems: ScoredItem[],
  ): TuffItem[] {
    const scoreMap = new Map(scoredItems.map(s => [s.itemId, s]))
    
    return items
      .map((item) => {
        const scored = scoreMap.get(item.id)
        if (!scored)
          return null
        
        const meta: any = item.meta || {}
        meta.recommendation = {
          score: scored.score,
          source: scored.source,
          reason: this.getReasonLabel(scored),
        }
        item.meta = meta
        
        return item
      })
      .filter((item): item is TuffItem => item !== null)
  }

  private getReasonLabel(scored: ScoredItem): string {
    switch (scored.source) {
      case 'frequent':
        return '🔥 Frequent'
      case 'time-based':
        return '🕐 Popular Now'
      case 'recent':
        return '⏰ Recent'
      case 'trending':
        return '📈 Trending'
      case 'context':
        return '✨ Smart Match'
      default:
        return '💡 Recommended'
    }
  }
}
