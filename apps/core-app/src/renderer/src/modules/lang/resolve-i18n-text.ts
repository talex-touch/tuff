import { isI18nMessage, parseI18nMessage } from '@talex-touch/utils/i18n'
import type { Translate } from './useI18nText'

export function resolveI18nText(value: string, t: Translate): string {
  if (!value) return ''
  if (!isI18nMessage(value)) return value
  const parsed = parseI18nMessage(value)
  if (!parsed) return value
  return t(parsed.key, parsed.params ?? {})
}
