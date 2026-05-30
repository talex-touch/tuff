import type { AppSetting } from '@talex-touch/utils'
import type { TuffItem } from '@talex-touch/utils/core-box'
import type { SearchProviderUserConfig } from '@talex-touch/utils/search'
import { StorageList } from '@talex-touch/utils'
import { getMainConfig } from '../../storage'

export const SEARCH_PROVIDER_CONFIG_KEY = 'searchProviders'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeSearchProviderConfigEntry(
  value: unknown
): SearchProviderUserConfig | null {
  if (!isRecord(value)) return null
  const providerId = typeof value.providerId === 'string' ? value.providerId.trim() : ''
  const order = typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : null
  if (!providerId || order === null || typeof value.enabled !== 'boolean') return null
  return {
    providerId,
    enabled: value.enabled,
    order,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : undefined
  }
}

export function getSearchProviderUserConfigs(appSettings?: AppSetting): SearchProviderUserConfig[] {
  const resolvedSettings =
    appSettings ?? (getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined)
  const raw = resolvedSettings?.[SEARCH_PROVIDER_CONFIG_KEY]
  const providers = isRecord(raw) && Array.isArray(raw.providers) ? raw.providers : []
  return providers
    .map((entry) => normalizeSearchProviderConfigEntry(entry))
    .filter((entry): entry is SearchProviderUserConfig => entry !== null)
}

export function getSearchProviderConfigMap(
  appSettings?: AppSetting
): Map<string, SearchProviderUserConfig> {
  return new Map(
    getSearchProviderUserConfigs(appSettings).map((config) => [config.providerId, config])
  )
}

export function resolveTuffItemSearchProviderId(item: TuffItem): string | null {
  const providerId = item.meta?.searchProviderId
  if (typeof providerId === 'string' && providerId.trim()) {
    return providerId.trim()
  }
  return null
}

export function filterAndSortRootItemsByProviderConfig(
  items: TuffItem[],
  configs: SearchProviderUserConfig[] = getSearchProviderUserConfigs()
): TuffItem[] {
  if (configs.length === 0 || items.length === 0) return items

  const configById = new Map(configs.map((config) => [config.providerId, config]))
  const originalIndexById = new Map(items.map((item, index) => [item.id, index]))

  return items
    .filter((item) => {
      const providerId = resolveTuffItemSearchProviderId(item)
      if (!providerId) return true
      return configById.get(providerId)?.enabled === true
    })
    .sort((left, right) => {
      const leftProviderId = resolveTuffItemSearchProviderId(left)
      const rightProviderId = resolveTuffItemSearchProviderId(right)
      const leftOrder = leftProviderId ? configById.get(leftProviderId)?.order : undefined
      const rightOrder = rightProviderId ? configById.get(rightProviderId)?.order : undefined
      if (leftOrder === undefined && rightOrder === undefined) {
        return (originalIndexById.get(left.id) ?? 0) - (originalIndexById.get(right.id) ?? 0)
      }
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      return (
        leftOrder - rightOrder ||
        (originalIndexById.get(left.id) ?? 0) - (originalIndexById.get(right.id) ?? 0)
      )
    })
}
