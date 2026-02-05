import type { ComputedRef } from 'vue'
import type { MarketPluginListItem } from './useMarketData'
import type { PluginVersionStatus } from './usePluginVersionStatus'
import {
  CURRENT_SDK_VERSION,
  SUPPORTED_SDK_VERSIONS,
  isValidSdkVersion,
  parseSdkVersion
} from '@talex-touch/utils/plugin'
import { computed } from 'vue'

interface DetailMetaItem {
  icon: string
  label: string
  value: string
  /** Highlight style for special states like upgrade available */
  highlight?: 'upgrade' | 'installed' | 'info'
}

function normalizeSdkapi(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseSdkVersion(value)
  return undefined
}

export function useMarketDetail(
  plugin: ComputedRef<MarketPluginListItem | null>,
  t: (key: string) => string,
  versionStatus?: ComputedRef<PluginVersionStatus>
) {
  const formatTimestamp = (timestamp: string | number | Date | null | undefined): string => {
    if (!timestamp) return ''
    const date =
      timestamp instanceof Date
        ? timestamp
        : typeof timestamp === 'number'
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
    if (p.author) {
      meta.push({
        icon: 'i-ri-user-line',
        label: t('market.detailDialog.author'),
        value: p.author
      })
    }
    if (p.version) {
      const status = versionStatus?.value
      // Show upgrade info: "v1.0.0 → v1.1.0" or just "v1.0.0"
      let versionValue = `v${p.version}`
      let highlight: DetailMetaItem['highlight']

      if (status?.hasUpgrade && status.installedVersion) {
        versionValue = `v${status.installedVersion} → v${p.version}`
        highlight = 'upgrade'
      } else if (status?.isInstalled && !status.hasUpgrade) {
        highlight = 'installed'
      }

      meta.push({
        icon: status?.hasUpgrade ? 'i-ri-arrow-up-circle-line' : 'i-ri-price-tag-3-line',
        label: t('market.detailDialog.version'),
        value: versionValue,
        highlight
      })
    }

    const time = formatTimestamp(p.timestamp)
    if (time)
      meta.push({ icon: 'i-ri-time-line', label: t('market.detailDialog.updateTime'), value: time })

    const sdkapiRaw = p.sdkapi
    const sdkapiValue = normalizeSdkapi(sdkapiRaw)
    const sdkapiValid = sdkapiValue !== undefined && isValidSdkVersion(sdkapiValue)
    const sdkapiSupported = sdkapiValid && SUPPORTED_SDK_VERSIONS.includes(sdkapiValue as number)

    let sdkapiDisplay = t('market.detailDialog.sdkapiMissing')
    if (sdkapiValue) {
      sdkapiDisplay = `${sdkapiValue}`
    } else if (sdkapiRaw !== undefined && sdkapiRaw !== null) {
      sdkapiDisplay = String(sdkapiRaw)
    }
    let sdkapiHighlight: DetailMetaItem['highlight']

    if (!sdkapiValid || !sdkapiSupported) {
      sdkapiHighlight = 'upgrade'
    } else if (sdkapiValue && sdkapiValue > CURRENT_SDK_VERSION) {
      sdkapiHighlight = 'upgrade'
    } else if (sdkapiValue && sdkapiValue < CURRENT_SDK_VERSION) {
      sdkapiHighlight = 'info'
    }

    meta.push({
      icon: 'i-ri-code-line',
      label: t('market.detailDialog.sdkapi'),
      value: sdkapiDisplay,
      highlight: sdkapiHighlight
    })

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
