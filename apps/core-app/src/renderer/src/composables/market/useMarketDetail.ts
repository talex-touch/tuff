import { computed, type ComputedRef } from 'vue'
import type { MarketPluginListItem } from './useMarketData'

interface DetailMetaItem {
  icon: string
  label: string
  value: string
}

export function useMarketDetail(
  plugin: ComputedRef<MarketPluginListItem | null>,
  t: (key: string) => string
) {
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return ''
    const date =
      typeof timestamp === 'number'
        ? new Date(timestamp)
        : new Date(Number(timestamp) || Date.parse(timestamp))
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
    } catch {
      return ''
    }
  }

  const detailMeta = computed<DetailMetaItem[]>(() => {
    const p = plugin.value
    if (!p) return []

    const meta: DetailMetaItem[] = []
    if (p.author)
      meta.push({
        icon: 'i-ri-user-line',
        label: t('market.detailDialog.author'),
        value: p.author
      })
    if (p.version)
      meta.push({
        icon: 'i-ri-price-tag-3-line',
        label: t('market.detailDialog.version'),
        value: `v${p.version}`
      })

    const time = formatTimestamp(p.timestamp)
    if (time)
      meta.push({ icon: 'i-ri-time-line', label: t('market.detailDialog.updateTime'), value: time })

    meta.push({
      icon: 'i-ri-shield-user-line',
      label: t('market.detailDialog.provider'),
      value: p.providerName ? `${p.providerName} (${p.providerType})` : p.providerId
    })

    meta.push({
      icon: 'i-ri-barcode-line',
      label: t('market.detailDialog.pluginId'),
      value: p.id
    })
    return meta
  })

  return {
    detailMeta
  }
}
