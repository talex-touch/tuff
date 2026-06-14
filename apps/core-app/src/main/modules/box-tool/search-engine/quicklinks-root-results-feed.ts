import type { TuffItem } from '@talex-touch/utils'
import type { IndexedSourceEvidence } from '@talex-touch/utils/search'
import type {
  QuicklinkIndexedSourceItem,
  QuicklinksIndexedSourceSnapshot
} from './quicklinks-indexed-source'
import { getBoxItemManager } from '../item-sdk'
import { getQuicklinksLinkedProviderIds } from './quicklinks-source-config'

function getMetaPayload(item: TuffItem): Record<string, unknown> | null {
  const payload = (item.meta as Record<string, unknown> | undefined)?.payload
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
}

function normalizeHttpUrl(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null

  try {
    const parsed = new URL(text)
    const protocol = parsed.protocol.toLowerCase()
    return protocol === 'http:' || protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function getQuicklinkUrl(item: TuffItem): string | null {
  const payload = getMetaPayload(item)
  if (payload && Object.hasOwn(payload, 'url')) {
    return normalizeHttpUrl(payload.url)
  }

  return normalizeHttpUrl(item.render.basic?.subtitle)
}

function getQuicklinkTitle(item: TuffItem, url: string): string {
  const payloadTitle = getMetaPayload(item)?.title
  const title = String(payloadTitle ?? item.render.basic?.title ?? '').trim()
  if (title) return title.replace(/^(打开|最近)\s*[·:]\s*/u, '')

  return url
}

export function mapRootResultToQuicklinkItem(item: TuffItem): QuicklinkIndexedSourceItem | null {
  const url = getQuicklinkUrl(item)
  if (!url) return null

  return {
    id: String(item.id),
    title: getQuicklinkTitle(item, url),
    url,
    subtitle: item.render.basic?.subtitle,
    icon:
      item.icon?.type === 'class' || item.icon?.type === 'emoji' || item.icon?.type === 'url'
        ? item.icon.value
        : undefined,
    tags: item.render.basic?.tags?.map((tag) => tag.text).filter(Boolean),
    metadata: {
      pluginName: item.meta?.pluginName,
      featureId: item.meta?.featureId,
      searchProviderId: item.meta?.searchProviderId,
      source: 'root-results'
    }
  }
}

export function loadQuicklinksRootResultsSnapshot(): QuicklinksIndexedSourceSnapshot {
  const linkedProviders = new Set(getQuicklinksLinkedProviderIds())
  const items = getBoxItemManager()
    .getVisibleItems()
    .filter((item) => linkedProviders.has(String(item.meta?.searchProviderId ?? '')))
    .map(mapRootResultToQuicklinkItem)
    .filter((item): item is QuicklinkIndexedSourceItem => Boolean(item))

  const evidence: IndexedSourceEvidence[] = [
    {
      id: 'quicklinks:root-results-feed',
      label: 'Visible root results feed',
      status: items.length > 0 ? 'ready' : 'degraded',
      itemCount: items.length,
      reason: items.length > 0 ? undefined : 'quicklinks-root-results-feed-empty',
      metadata: {
        providerCount: linkedProviders.size,
        storage: 'root-results-visible'
      }
    }
  ]

  return {
    items,
    evidence,
    lastLoadedAt: Date.now()
  }
}
