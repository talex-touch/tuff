export interface ServerI18nContext {
  messages?: Record<string, Record<string, unknown>>
  trackMap?: Record<string, Set<string>>
}

/**
 * Interactive keys that may be used on first click before the reader navigates to a second
 * page (when `@nuxtjs/i18n`'s `beforeResolve` loads the full immutable locale JSON).
 */
export const CLIENT_INTERACTIVE_KEYS = [
  'common.copy',
  'common.copied',
  'common.close',
  'common.loading',
  'docs.demo.showCode',
  'docs.demo.hideCode',
  'docs.demo.reset',
  'docs.demo.loading',
  'docs.demo.loadFailed',
  'docs.demo.notFound',
  'docs.aside.copyPrompt',
  'docs.aside.copyPromptDone',
  'docs.aside.copyPromptFailed',
  'search.placeholder',
  'search.empty',
  'search.loading',
  'search.unavailable',
]

export function resolveI18nLocaleFromPath(path: string | undefined): 'en' | 'zh' {
  if (!path)
    return 'en'
  const clean = path.replace(/^\/tuffex(?=\/|$)/i, '') || '/'
  return /^\/zh(?:\/|$)/i.test(clean) ? 'zh' : 'en'
}

function getNestedValue(source: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = source
  for (const part of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor))
      return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!
    const next = cursor[part]
    if (!next || typeof next !== 'object' || Array.isArray(next))
      cursor[part] = {}
    cursor = cursor[part] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]!] = value
}

export function pickTrackedLocaleMessages(
  localeMessages: Record<string, unknown>,
  trackedKeys: Iterable<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of trackedKeys) {
    if (!key)
      continue
    const value = getNestedValue(localeMessages, key)
    if (value !== undefined)
      setNestedValue(result, key, value)
  }
  return result
}

export function trimServerI18nContext(i18nCtx: ServerI18nContext | undefined, path: string | undefined): void {
  if (!i18nCtx?.messages)
    return

  const activeLocale = resolveI18nLocaleFromPath(path)
  const activeMessages = i18nCtx.messages[activeLocale]
  if (!activeMessages || typeof activeMessages !== 'object')
    return

  const tracked = i18nCtx.trackMap?.[activeLocale]
  const keys = tracked && tracked.size > 0
    ? new Set([...tracked, ...CLIENT_INTERACTIVE_KEYS])
    : new Set(CLIENT_INTERACTIVE_KEYS)
  const trimmedLocaleMessages = pickTrackedLocaleMessages(activeMessages, keys)

  i18nCtx.messages = {
    [activeLocale]: trimmedLocaleMessages,
  }
}
