import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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
