import { computed } from 'vue'
import type { Composer } from 'vue-i18n'
import { useI18n } from 'vue-i18n'

export const I18N_TITLE_PREFIX = '$I18n:'

export function resolveI18nLabel(value: unknown, t: Composer['t'], fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback
  }

  if (!value) {
    return fallback
  }

  if (!value.startsWith(I18N_TITLE_PREFIX)) {
    return value
  }

  const key = value.slice(I18N_TITLE_PREFIX.length).trim()
  if (!key) {
    return fallback || value
  }

  const translated = t(key)
  return translated === key && fallback ? fallback : translated
}

/**
 * Returns a computed that resolves the i18n key,
 * falling back to `fallback` when the key is missing (returned as-is by vue-i18n).
 */
export function useSafeT() {
  const { t } = useI18n()

  function safeT(key: string, fallback: string) {
    return computed(() => {
      const value = t(key)
      return value === key ? fallback : value
    })
  }

  return { t, safeT }
}
