import type { TuffItem } from '@talex-touch/utils'

export function isPluginFooterItem(item: TuffItem | null | undefined): boolean {
  return item?.source?.type === 'plugin' || Boolean(item?.meta?.pluginName)
}

function isPluginWidgetFooterItem(item: TuffItem | null | undefined): boolean {
  if (!isPluginFooterItem(item)) {
    return false
  }
  return item?.meta?.interaction?.type === 'widget' || item?.render?.mode === 'custom'
}

function hasExplicitVisibleFooterHint(item: TuffItem | null | undefined): boolean {
  return (
    item?.meta?.footerHints?.primary?.visible === true ||
    item?.meta?.footerHints?.secondary?.visible === true ||
    item?.meta?.footerHints?.quickSelect?.visible === true
  )
}

function hasExplicitHiddenFooterHints(item: TuffItem | null | undefined): boolean {
  return (
    item?.meta?.footerHints?.primary?.visible === false &&
    item?.meta?.footerHints?.secondary?.visible === false &&
    item?.meta?.footerHints?.quickSelect?.visible === false
  )
}

export function resolvePrimaryFooterHintVisible(item: TuffItem | null | undefined): boolean {
  if (!item) {
    return false
  }
  const explicit = item?.meta?.footerHints?.primary?.visible
  if (explicit !== undefined) {
    return explicit
  }
  return !isPluginWidgetFooterItem(item)
}

export function resolveSecondaryFooterHintVisible(item: TuffItem | null | undefined): boolean {
  if (!item) {
    return false
  }
  const explicit = item?.meta?.footerHints?.secondary?.visible
  if (explicit !== undefined) {
    return explicit
  }
  return !isPluginWidgetFooterItem(item)
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
  return !isPluginWidgetFooterItem(item) && fallbackVisible
}

export function resolveCoreBoxFooterVisible(item: TuffItem | null | undefined): boolean {
  if (!item) {
    return false
  }
  if (isPluginWidgetFooterItem(item)) {
    return hasExplicitVisibleFooterHint(item)
  }
  if (isPluginFooterItem(item) && hasExplicitHiddenFooterHints(item)) {
    return false
  }
  return true
}
