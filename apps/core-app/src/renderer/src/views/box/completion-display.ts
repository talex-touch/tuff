import { isI18nMessage, parseI18nMessage } from '@talex-touch/utils/i18n'
import type { Translate } from '~/modules/lang/useI18nText'

export function resolveCoreBoxCompletionDisplay(
  rawCompletion: string,
  query: string,
  t: Translate
): string {
  const completion = resolveCompletionText(rawCompletion, t)
  if (!query || !completion) return completion

  return completion.startsWith(query) ? completion.substring(query.length) : completion
}

function resolveCompletionText(value: string, t: Translate): string {
  if (!value || !isI18nMessage(value)) return value
  const parsed = parseI18nMessage(value)
  if (!parsed) return value
  return t(parsed.key, parsed.params ?? {})
}
