import { watch } from 'vue'

import { fetchCurrentUserProfile, patchCurrentUserProfile } from '~/composables/useCurrentUserApi'
import { normalizeLocale } from '~/composables/useLocaleOrchestrator'
const LOCALE_STORAGE_KEY = 'tuff_locale_sync'

export function useUserLocale() {
  const { locale } = useI18n()
  const { status } = useAuth()
  const { setLocaleSerial, persistLocale } = useLocaleOrchestrator()

  const getSavedLocale = (): string | null => {
    if (import.meta.server)
      return null
    return window.localStorage.getItem(LOCALE_STORAGE_KEY)
  }

  const persistLocal = (value: string) => {
    if (import.meta.client)
      window.localStorage.setItem(LOCALE_STORAGE_KEY, value)
  }

  const pullRemoteLocale = async () => {
    if (status.value !== 'authenticated')
      return
    try {
      const me = await fetchCurrentUserProfile()
      const rawLocale = typeof me?.locale === 'string' ? me.locale : null
      const remoteLocale = normalizeLocale(rawLocale)
      if (!remoteLocale) {
        if (rawLocale)
          console.warn('[useUserLocale] Ignore invalid remote locale:', rawLocale)
        return
      }
      persistLocal(remoteLocale)
      persistLocale(remoteLocale, 'profile')
      if (remoteLocale !== locale.value)
        await setLocaleSerial(remoteLocale, 'profile')
    }
    catch (error) {
      console.error('[useUserLocale] Failed to pull locale:', error)
    }
  }

  const saveUserLocale = async (newLocale: string) => {
    const normalized = normalizeLocale(newLocale)
    if (!normalized) {
      console.warn('[useUserLocale] Ignore invalid locale update:', newLocale)
      return
    }
    persistLocal(normalized)
    persistLocale(normalized, 'manual')
    if (status.value !== 'authenticated')
      return
    try {
      await patchCurrentUserProfile({ locale: normalized })
    }
    catch (error) {
      console.error('[useUserLocale] Failed to save locale:', error)
    }
  }

  const syncLocaleChanges = () => {
    if (import.meta.server)
      return

    watch(
      () => status.value,
      (value) => {
        if (value === 'authenticated')
          void pullRemoteLocale()
      },
      { immediate: true },
    )

    watch(locale, (newLocale) => {
      const normalized = normalizeLocale(newLocale)
      if (!normalized)
        return
      const savedLocale = getSavedLocale()
      if (normalized === savedLocale)
        return
      void saveUserLocale(normalized)
    })
  }

  return {
    getSavedLocale,
    saveUserLocale,
    syncLocaleChanges,
  }
}
