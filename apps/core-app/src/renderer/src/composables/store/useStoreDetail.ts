import type { ComputedRef } from 'vue'
import type { StorePluginListItem } from './useStoreData'
import type { PluginVersionStatus } from './usePluginVersionStatus'
import { CURRENT_SDK_VERSION, PERMISSION_ENFORCEMENT_MIN_VERSION } from '@talex-touch/utils/plugin'
import { computed } from 'vue'
import { useEnv } from '~/modules/hooks/env-hooks'

interface DetailMetaItem {
  icon: string
  label: string
  value: string
  /** Highlight style for special states like upgrade available */
  highlight?: 'upgrade' | 'installed'
  copyable?: boolean
}

export function useStoreDetail(
  plugin: ComputedRef<StorePluginListItem | null>,
  t: (key: string, params?: Record<string, string | number>) => string,
  versionStatus?: ComputedRef<PluginVersionStatus>
) {
  const { packageJson } = useEnv()
  const compatibilityHint = computed(() => {
    const sdkapi = plugin.value?.manifest?.sdkapi
    if (!plugin.value) return ''
    if (sdkapi === undefined) return t('store.detailDialog.sdkMissingHint')
    if (versionStatus?.value.isCompatible) return ''
    if (sdkapi > CURRENT_SDK_VERSION) {
      return t('store.detailDialog.sdkUpgradeHint', {
        required: sdkapi,
        current: CURRENT_SDK_VERSION
      })
    }
    if (sdkapi < PERMISSION_ENFORCEMENT_MIN_VERSION) {
      return t('store.detailDialog.sdkOutdatedHint', {
        minimum: PERMISSION_ENFORCEMENT_MIN_VERSION
      })
    }
    return t('store.detailDialog.sdkUnsupportedHint')
  })
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
        icon: 'i-carbon-user',
        label: t('store.detailDialog.author'),
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
        icon: status?.hasUpgrade ? 'i-carbon-upgrade' : 'i-carbon-tag',
        label: t('store.detailDialog.version'),
        value: versionValue,
        highlight
      })
    }

    const status = versionStatus?.value
    const sdkapi = p.manifest?.sdkapi
    meta.push(
      {
        icon: 'i-carbon-code',
        label: t('store.detailDialog.sdkRequirement'),
        value: sdkapi === undefined ? t('store.detailDialog.sdkUndeclared') : String(sdkapi)
      },
      {
        icon: 'i-carbon-information',
        label: t('store.detailDialog.currentClient'),
        value: packageJson.value?.version
          ? `v${packageJson.value.version}`
          : t('store.detailDialog.versionUnknown')
      },
      {
        icon: 'i-carbon-code',
        label: t('store.detailDialog.currentSdk'),
        value: String(CURRENT_SDK_VERSION)
      },
      {
        icon: 'i-carbon-security',
        label: t('store.detailDialog.sdkCompatibility'),
        value: t(
          sdkapi === undefined || !status
            ? 'store.detailDialog.compatibilityUnknown'
            : status.isCompatible
              ? 'store.detailDialog.compatible'
              : 'store.detailDialog.incompatible'
        ),
        highlight: status?.isCompatible && sdkapi !== undefined ? 'installed' : undefined
      }
    )
    if (status?.isBundledManaged) {
      meta.push({
        icon: 'i-carbon-security',
        label: t('store.detailDialog.installPolicy'),
        value: t('store.clientManaged')
      })
    }
    const time = formatTimestamp(p.timestamp)
    if (time)
      meta.push({ icon: 'i-carbon-time', label: t('store.detailDialog.updateTime'), value: time })

    meta.push({
      icon: 'i-carbon-security',
      label: t('store.detailDialog.provider'),
      value: p.providerName ? `${p.providerName} (${p.providerType})` : p.providerId
    })

    meta.push({
      icon: 'i-carbon-information',
      label: t('store.detailDialog.pluginId'),
      value: p.id,
      copyable: true
    })
    return meta
  })

  return {
    detailMeta,
    compatibilityHint
  }
}
