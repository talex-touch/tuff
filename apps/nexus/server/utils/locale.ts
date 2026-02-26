export type SupportedLocaleCode = 'en' | 'zh'

export function isSupportedLocaleCode(value: unknown): value is SupportedLocaleCode {
  return value === 'en' || value === 'zh'
}

export function normalizeLocaleCode(value?: string | null): SupportedLocaleCode | null {
  if (typeof value !== 'string')
    return null

  const normalized = value.trim().toLowerCase()
  if (!normalized)
    return null

  if (normalized === 'zh' || normalized.startsWith('zh-') || normalized.startsWith('zh_'))
    return 'zh'
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_'))
    return 'en'
  return null
}
