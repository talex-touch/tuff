import type { TuffItem } from '@talex-touch/utils'

export interface DetachedDivisionConfig {
  itemId?: string
  sourceId?: string
  providerSourceId?: string
  query?: string
}

function getDetachedItemPluginId(item: TuffItem): string | undefined {
  const pluginName = item.meta?.pluginName
  if (typeof pluginName === 'string' && pluginName.trim()) {
    return pluginName
  }
  if (item.source?.type === 'plugin' && item.source.id !== 'plugin-features') {
    return item.source.id
  }
  return undefined
}

export function parseDetachedDivisionConfig(
  url: string | undefined
): DetachedDivisionConfig | null {
  if (!url || !url.startsWith('tuff://detached')) {
    return null
  }
  try {
    const parsed = new URL(url)
    return {
      itemId: parsed.searchParams.get('itemId') || undefined,
      sourceId: parsed.searchParams.get('source') || undefined,
      providerSourceId: parsed.searchParams.get('providerSource') || undefined,
      query: parsed.searchParams.get('query') || undefined
    }
  } catch {
    return null
  }
}

export function isDetachedDivisionItemMatch(
  item: TuffItem,
  config: DetachedDivisionConfig | null
): boolean {
  if (!config?.itemId) return true
  if (item.id !== config.itemId) return false
  if (config.providerSourceId) {
    return item.source?.id === config.providerSourceId
  }
  if (config.sourceId) {
    return item.source?.id === config.sourceId || getDetachedItemPluginId(item) === config.sourceId
  }
  return true
}
