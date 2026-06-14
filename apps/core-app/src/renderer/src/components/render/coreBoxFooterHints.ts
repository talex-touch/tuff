import type { TuffItem } from '@talex-touch/utils'

export function isPluginFooterItem(item: TuffItem | null | undefined): boolean {
  return item?.source?.type === 'plugin' || Boolean(item?.meta?.pluginName)
}

export function resolveSecondaryFooterHintVisible(item: TuffItem | null | undefined): boolean {
  const explicit = item?.meta?.footerHints?.secondary?.visible
  if (explicit !== undefined) {
    return explicit
  }
  return !isPluginFooterItem(item)
}
