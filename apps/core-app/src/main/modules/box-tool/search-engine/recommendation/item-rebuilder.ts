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

    console.log(`[ItemRebuilder] Rebuilding ${scoredItems.length} scored items`)
    const grouped = this.groupByNormalizedSource(scoredItems)
    
    for (const [sourceId, items] of grouped.entries()) {
      console.log(`[ItemRebuilder]   - ${sourceId}: ${items.length} items`)
    }
    
    const results = await Promise.all([
      this.rebuildAppItems(grouped.get('app-provider') || []),
      this.rebuildFileItems(grouped.get('file-provider') || []),
      this.rebuildPluginFeatureItems(grouped.get('plugin-features') || []),
      this.rebuildSystemItems(grouped.get('system-provider') || []),
      this.rebuildClipboardItems(grouped.get('clipboard-history') || []),
    ])

    const allItems = results.flat()
    console.log(`[ItemRebuilder] Rebuilt ${allItems.length} items total`)

    return this.mergeAndEnrichItems(allItems, scoredItems)
  }

  private normalizeSourceId(sourceId: string): string {
    const sourceIdMap: Record<string, string> = {
      'application': 'app-provider',
      'app': 'app-provider',
      'file': 'file-provider',
      'system': 'system-provider',
      'clipboard': 'clipboard-history',
    }
    
    return sourceIdMap[sourceId] || sourceId
  }

  private groupByNormalizedSource(items: ScoredItem[]): Map<string, ScoredItem[]> {
    const groups = new Map<string, ScoredItem[]>()
    
    for (const item of items) {
      const normalized = this.normalizeSourceId(item.sourceId)
      if (!groups.has(normalized)) {
        groups.set(normalized, [])
      }
      groups.get(normalized)!.push(item)
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

  /**
   * 重建插件功能项
   */
  private async rebuildPluginFeatureItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0)
      return []

    try {
      const { pluginModule } = await import('../../../plugin/plugin-module')
      const pluginManager = pluginModule.pluginManager
      if (!pluginManager) {
        console.warn('[ItemRebuilder] PluginManager not available')
        return []
      }

      const rebuiltItems: TuffItem[] = []
      
      for (const item of items) {
        // itemId 格式: "pluginName/featureId"
        const [pluginName, featureId] = item.itemId.split('/')
        if (!pluginName || !featureId) {
          console.warn(`[ItemRebuilder] Invalid plugin feature itemId: ${item.itemId}`)
          continue
        }

        const plugin = pluginManager.plugins.get(pluginName)
        if (!plugin) {
          console.debug(`[ItemRebuilder] Plugin not found: ${pluginName}`)
          continue
        }

        const feature = plugin.getFeature(featureId)
        if (!feature) {
          console.debug(`[ItemRebuilder] Feature not found: ${featureId} in ${pluginName}`)
          continue
        }

        // 使用 PluginFeaturesAdapter 的逻辑创建 TuffItem
        const { default: adapter } = await import('../../../plugin/adapters/plugin-features-adapter')
        const tuffItem = (adapter as any).createTuffItem(plugin, feature)
        rebuiltItems.push(tuffItem)
      }

      return rebuiltItems
    }
    catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild plugin feature items:', error)
      return []
    }
  }

  private async rebuildSystemItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0)
      return []

    try {
      const { systemProvider } = await import('../../addon/system/system-provider')
      const rebuiltItems: TuffItem[] = []

      for (const item of items) {
        const actionId = item.itemId
        const searchResult = await systemProvider.onSearch(
          { text: actionId, inputs: [] },
          new AbortController().signal
        )

        const matchedItem = searchResult.items.find(resultItem => 
          resultItem.meta?.raw?.systemActionId === actionId
        )

        if (matchedItem) {
          rebuiltItems.push(matchedItem)
        } else {
          console.debug(`[ItemRebuilder] System action not found: ${actionId}`)
        }
      }

      return rebuiltItems
    }
    catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild system items:', error)
      return []
    }
  }

  private async rebuildClipboardItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0)
      return []

    try {
      const db = this.dbUtils.getDb()
      const { clipboardHistory } = await import('../../../../db/schema')
      const { eq } = await import('drizzle-orm')
      const rebuiltItems: TuffItem[] = []

      for (const item of items) {
        const clipboardId = Number.parseInt(item.itemId, 10)
        if (Number.isNaN(clipboardId))
          continue

        const record = await db
          .select()
          .from(clipboardHistory)
          .where(eq(clipboardHistory.id, clipboardId))
          .get()

        if (record) {
          const { ClipboardProvider } = await import('../providers/clipboard')
          const provider = new ClipboardProvider()
          const tuffItem = (provider as any).transformToSearchItem(record)
          rebuiltItems.push(tuffItem)
        }
      }

      return rebuiltItems
    }
    catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild clipboard items:', error)
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
          isIntelligent: true,              // 新增: 标识这是智能推荐
          badge: this.generateBadge(scored),  // 新增: 徽章信息
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

  /**
   * 生成推荐徽章
   */
  private generateBadge(scored: ScoredItem): {
    text: string
    icon: string
    variant: string
  } {
    switch (scored.source) {
      case 'frequent':
        return { text: '常用', icon: '🔥', variant: 'frequent' }
      case 'time-based':
        return { text: '推荐', icon: '🕐', variant: 'intelligent' }
      case 'recent':
        return { text: '最近', icon: '⏰', variant: 'recent' }
      case 'trending':
        return { text: '趋势', icon: '📈', variant: 'trending' }
      case 'context':
        return { text: '智能推荐', icon: '✨', variant: 'intelligent' }
      default:
        return { text: '推荐', icon: '💡', variant: 'intelligent' }
    }
  }
}
