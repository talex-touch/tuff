import type { TuffItem } from '@talex-touch/utils'
import { resolveI18nText } from '../../modules/lang/resolve-i18n-text'
import type { Translate } from '../../modules/lang/useI18nText'

export function resolveCoreBoxFooterTitle(item: TuffItem | null | undefined, t: Translate): string {
  return resolveI18nText(item?.render?.basic?.title || 'CoreBox', t)
}
