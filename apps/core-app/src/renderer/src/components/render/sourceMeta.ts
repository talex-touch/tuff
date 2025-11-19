import type { TuffItem } from '@talex-touch/utils'
import type { ComposerTranslation } from 'vue-i18n'

interface SourceMetaResult {
  icon: string
  label: string
  type: string
}

const SOURCE_ICON_MAP: Record<string, string> = {
  application: 'i-ri-apps-line',
  app: 'i-ri-apps-line',
  plugin: 'i-ri-puzzle-line',
  file: 'i-ri-file-3-line',
  command: 'i-ri-terminal-line',
  web: 'i-ri-global-line',
  data: 'i-ri-database-2-line',
  service: 'i-ri-cpu-line',
  feature: 'i-ri-star-line',
  system: 'i-ri-settings-3-line',
  default: 'i-ri-hashtag',
}

/**
 * Builds a display-friendly meta object for the badge area that shows
 * the origin of a search result (source type / plugin name).
 */
export function resolveSourceMeta(
  item: TuffItem | null | undefined,
  t: ComposerTranslation,
): SourceMetaResult | null {
  if (!item)
    return null

  const sourceType = item.source?.type
  if (!sourceType)
    return null

  const icon = SOURCE_ICON_MAP[sourceType] ?? SOURCE_ICON_MAP.default
  const translationKey = `coreBox.sourceTypes.${sourceType}`
  const fallbackLabel = item.source?.name || sourceType.toUpperCase()

  let label = t(translationKey)
  if (label === translationKey) {
    label = fallbackLabel
  }

  if (sourceType === 'plugin') {
    label = (item.meta?.pluginName as string) || label
  }

  return {
    icon,
    label,
    type: sourceType,
  }
}

export type { SourceMetaResult }
