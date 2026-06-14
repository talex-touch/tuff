import type { TuffItem } from '@talex-touch/utils'

export function isPluginFooterItem(item: TuffItem | null | undefined): boolean {
  return item?.source?.type === 'plugin' || Boolean(item?.meta?.pluginName)
}

export function resolvePrimaryFooterHintVisible(item: TuffItem | null | undefined): boolean {
  if (!item) {
    return false
  }
  const explicit = item?.meta?.footerHints?.primary?.visible
  if (explicit !== undefined) {
    return explicit
  }
  return !isPluginFooterItem(item)
}

export function resolveSecondaryFooterHintVisible(item: TuffItem | null | undefined): boolean {
  if (!item) {
    return false
  }
  const explicit = item?.meta?.footerHints?.secondary?.visible
  if (explicit !== undefined) {
    return explicit
  }
  return !isPluginFooterItem(item)
}

export function resolveQuickSelectFooterHintVisible(
  item: TuffItem | null | undefined,
  fallbackVisible: boolean
): boolean {
  if (!item) {
    return false
  }
  const explicit = item?.meta?.footerHints?.quickSelect?.visible
  if (explicit !== undefined) {
    return explicit
  }
  return !isPluginFooterItem(item) && fallbackVisible
}

export function resolveCoreBoxFooterVisible(item: TuffItem | null | undefined): boolean {
  if (!item) {
    return false
  }
  if (!isPluginFooterItem(item)) {
    return true
  }

  return (
    item?.meta?.footerHints?.primary?.visible === true ||
    item?.meta?.footerHints?.secondary?.visible === true ||
    item?.meta?.footerHints?.quickSelect?.visible === true
  )
}
