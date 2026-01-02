import type { TuffItem, TuffQuery, TuffRender } from '@talex-touch/utils'
import type { DbUtils } from '../../../../db/utils'
import type { ScoredItem } from './recommendation-engine'

/** Rebuilds TuffItems from ScoredItems by querying DB and applying provider logic */
export class ItemRebuilder {
  constructor(private dbUtils: DbUtils) {}

  async rebuildItems(scoredItems: ScoredItem[]): Promise<TuffItem[]> {
    if (scoredItems.length === 0) return []

    const grouped = this.groupByNormalizedSource(scoredItems)

    const results = await Promise.all([
      this.rebuildAppItems(grouped.get('app-provider') || []),
      this.rebuildFileItems(grouped.get('file-provider') || []),
      this.rebuildPluginFeatureItems(grouped.get('plugin-features') || []),
      this.rebuildSystemItems(grouped.get('system-provider') || []),
      this.rebuildClipboardItems(grouped.get('clipboard-history') || [])
    ])

    const allItems = results.flat()
    return this.mergeAndEnrichItems(allItems, scoredItems)
  }

  private normalizeSourceId(sourceId: string): string {
    const sourceIdMap: Record<string, string> = {
      application: 'app-provider',
      app: 'app-provider',
      file: 'file-provider',
      system: 'system-provider',
      clipboard: 'clipboard-history'
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
    if (items.length === 0) return []

    try {
      const pathItems = items.filter((item) => item.itemId.startsWith('/'))
      const bundleIdItems = items.filter((item) => !item.itemId.startsWith('/'))

      const [appsByPath, appsByBundleId] = await Promise.all([
        pathItems.length > 0
          ? this.dbUtils.getFilesByPaths(pathItems.map((i) => i.itemId))
          : Promise.resolve([]),
        bundleIdItems.length > 0
          ? this.dbUtils.getFilesByBundleIds(bundleIdItems.map((i) => i.itemId))
          : Promise.resolve([])
      ])

      const apps = [...appsByPath, ...appsByBundleId]
      if (apps.length === 0) return []

      const appsWithExtensions = await this.fetchExtensionsForApps(apps)
      const { processSearchResults } = await import('../../addon/apps/search-processing-service')

      const dummyQuery: TuffQuery = { text: '' }
      return processSearchResults(appsWithExtensions, dummyQuery, false, {})
    } catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild app items:', error)
      return []
    }
  }

  private async fetchExtensionsForApps(apps: any[]): Promise<any[]> {
    const fileIds = apps.map((app) => app.id)
    const extensions = await this.dbUtils.getFileExtensionsByFileIds(fileIds)

    return apps.map((app) => ({
      ...app,
      extensions: extensions
        .filter((ext) => ext.fileId === app.id)
        .reduce(
          (acc, ext) => {
            acc[ext.key] = ext.value
            return acc
          },
          {} as Record<string, string | null>
        )
    }))
  }

  private async rebuildFileItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0) return []

    try {
      const paths = items.map((item) => item.itemId)
      const files = await this.dbUtils.getFilesByPaths(paths)

      if (files.length === 0) return []

      const { mapFileToTuffItem } = await import('../../addon/files/utils')
      return files.map((file) => mapFileToTuffItem(file, {}, 'file-provider', 'File Provider'))
    } catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild file items:', error)
      return []
    }
  }

  /**
   * 重建插件功能项
   */
  private async rebuildPluginFeatureItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0) return []

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
            continue
        }

        const plugin = pluginManager.plugins.get(pluginName)
        if (!plugin) continue

        const feature = plugin.getFeature(featureId)
        if (!feature) continue

        // 使用 PluginFeaturesAdapter 的逻辑创建 TuffItem
        const { default: adapter } = await import(
          '../../../plugin/adapters/plugin-features-adapter'
        )
        const tuffItem = (adapter as any).createTuffItem(plugin, feature)
        rebuiltItems.push(tuffItem)
      }

      return rebuiltItems
    } catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild plugin feature items:', error)
      return []
    }
  }

  private async rebuildSystemItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0) return []

    try {
      const { systemProvider } = await import('../../addon/system/system-provider')
      const rebuiltItems: TuffItem[] = []

      for (const item of items) {
        const actionId = item.itemId
        const searchResult = await systemProvider.onSearch(
          { text: actionId, inputs: [] },
          new AbortController().signal
        )

        const matchedItem = searchResult.items.find(
          (resultItem) => resultItem.meta?.raw?.systemActionId === actionId
        )

        if (matchedItem) {
          rebuiltItems.push(matchedItem)
        }
      }

      return rebuiltItems
    } catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild system items:', error)
      return []
    }
  }

  private async rebuildClipboardItems(items: ScoredItem[]): Promise<TuffItem[]> {
    if (items.length === 0) return []

    try {
      const db = this.dbUtils.getDb()
      const { clipboardHistory } = await import('../../../../db/schema')
      const { eq } = await import('drizzle-orm')
      const rebuiltItems: TuffItem[] = []

      for (const item of items) {
        const clipboardId = Number.parseInt(item.itemId, 10)
        if (Number.isNaN(clipboardId)) continue

        const record = await db
          .select()
          .from(clipboardHistory)
          .where(eq(clipboardHistory.id, clipboardId))
          .get()

        if (record) {
          // 直接转换逻辑（原来在 ClipboardProvider.transformToSearchItem 中）
          const render: TuffRender = {
            mode: 'default',
            basic: {
              title: '',
            },
          }

          let kind: TuffItem['kind'] = 'document'

          if (record.type === 'text') {
            kind = 'document'
            if (render.basic) {
              render.basic.title =
                record.content.length > 100
                  ? `${record.content.substring(0, 97)}...`
                  : record.content
              render.basic.subtitle = `Text from ${record.sourceApp || 'Unknown'}`
              render.basic.icon = {
                type: 'emoji',
                value: '📄',
              }
            }
            render.preview = {
              type: 'panel',
              content: record.content,
            }
          } else if (record.type === 'image') {
            kind = 'image'
            if (render.basic) {
              render.basic.title = `Image from ${record.sourceApp || 'Unknown'}`
              render.basic.icon = record.thumbnail
                ? {
                    type: 'url',
                    value: record.thumbnail,
                  }
                : {
                    type: 'emoji',
                    value: '🖼️',
                  }
            }
            render.preview = {
              type: 'panel',
              image: record.content,
            }
          } else if (record.type === 'files') {
            kind = 'file'
            if (render.basic) {
        try {
                const files = JSON.parse(record.content)
                if (files.length === 1) {
                  const filePath = files[0]
                  render.basic.title =
                    typeof filePath === 'string'
                      ? filePath.split(/[\\/]/).pop() || 'File'
                      : 'File'
                } else {
                  render.basic.title = `${files.length} files`
                }
              } catch {
                render.basic.title = 'Files from clipboard'
              }
              render.basic.icon = {
                type: 'emoji',
                value: '📁',
              }
            }
          }

          // 处理 OCR 元数据
          let metadata: Record<string, unknown> | null = null
          if (record.metadata) {
            try {
              metadata = JSON.parse(record.metadata)
            } catch {
              metadata = null
            }
          }

          if (
            metadata?.ocr_excerpt &&
            typeof metadata.ocr_excerpt === 'string' &&
            metadata.ocr_excerpt.trim() &&
            render.basic
          ) {
            const snippet = metadata.ocr_excerpt.trim()
            render.basic.subtitle = render.basic.subtitle
              ? `${render.basic.subtitle} · ${snippet}`
              : snippet
          }

          const tuffItem: TuffItem = {
            id: `clipboard-${record.id}`,
            source: {
              id: 'clipboard-history',
              type: 'history',
              name: 'Clipboard History',
            },
            kind,
            render,
            actions: [
              {
                id: 'paste',
                type: 'execute',
                label: 'Paste',
                shortcut: 'Enter',
              },
              {
                id: 'copy',
                type: 'copy',
                label: 'Copy',
                shortcut: 'CmdOrCtrl+C',
              },
            ],
            meta: {
              raw: record,
            },
          }

          rebuiltItems.push(tuffItem)
        }
      }

      return rebuiltItems
    } catch (error) {
      console.error('[ItemRebuilder] Failed to rebuild clipboard items:', error)
      return []
    }
  }


  private findScoredByPartialMatch(item: TuffItem, scoredItems: ScoredItem[]): ScoredItem | undefined {
    const itemId = item.id
    const sourceId = item.source.id
    const originalItemId = (item.meta as any)?._originalItemId

    // Direct match with original ID (highest priority)
    if (originalItemId) {
      const match = scoredItems.find((s) => s.itemId === originalItemId && s.sourceId === sourceId)
      if (match) return match
    }

    // Plugin features: match by suffix or exact
    if (sourceId === 'plugin-features' || sourceId.includes('plugin')) {
      return scoredItems.find((s) => s.itemId.endsWith(`/${itemId}`) || s.itemId === itemId)
    }

    // App provider: match by path or bundleId inclusion
    if (sourceId === 'app-provider' || sourceId === 'application') {
      return scoredItems.find((s) => {
        if (itemId.startsWith('/') && s.itemId.startsWith('/')) return itemId === s.itemId
        return s.itemId.includes(itemId) || itemId.includes(s.itemId)
      })
    }

    return undefined
  }

  private mergeAndEnrichItems(items: TuffItem[], scoredItems: ScoredItem[]): TuffItem[] {
    const scoreMap = new Map<string, ScoredItem>()
    for (const s of scoredItems) {
      scoreMap.set(s.itemId, s)
      scoreMap.set(`${s.sourceId}:${s.itemId}`, s)
    }

    return items
      .map((item) => {
        const originalItemId = (item.meta as any)?._originalItemId
        const scored = (originalItemId && scoreMap.get(`${item.source.id}:${originalItemId}`))
          || scoreMap.get(item.id)
          || scoreMap.get(`${item.source.id}:${item.id}`)
          || this.findScoredByPartialMatch(item, scoredItems)
        if (!scored) return null

        const meta: any = item.meta || {}
        meta.recommendation = {
          score: scored.score,
          source: scored.source,
          reason: this.getReasonLabel(scored),
          isIntelligent: true,
          badge: this.generateBadge(scored)
        }
        // Store original itemId for deduplication in recommendation-engine
        meta._originalItemId = scored.itemId
        meta._originalSourceId = scored.sourceId
        item.meta = meta

        return item
      })
      .filter((item): item is TuffItem => item !== null)
  }

  private getReasonLabel(scored: ScoredItem): string {
    const labels: Record<string, string> = {
      frequent: '🔥 Frequent',
      'time-based': '🕐 Popular Now',
      recent: '⏰ Recent',
      trending: '📈 Trending',
      context: '✨ Smart Match'
    }
    return labels[scored.source] || '💡 Recommended'
  }

  private generateBadge(scored: ScoredItem): { text: string; icon: string; variant: string } {
    const badges: Record<string, { text: string; icon: string; variant: string }> = {
      frequent: { text: '常用', icon: '🔥', variant: 'frequent' },
      'time-based': { text: '推荐', icon: '🕐', variant: 'intelligent' },
      recent: { text: '最近', icon: '⏰', variant: 'recent' },
      trending: { text: '趋势', icon: '📈', variant: 'trending' },
      context: { text: '智能推荐', icon: '✨', variant: 'intelligent' }
    }
    return badges[scored.source] || { text: '推荐', icon: '💡', variant: 'intelligent' }
  }
}
