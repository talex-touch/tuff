import { watch } from 'vue'

import { fetchCurrentUserProfile, patchCurrentUserProfile } from '~/composables/useCurrentUserApi'
const LOCALE_STORAGE_KEY = 'tuff_locale_sync'

export function useUserLocale() {
  const { locale, setLocale } = useI18n()
  const { status } = useAuth()

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
      const remoteLocale = typeof me?.locale === 'string' ? me.locale : null
      if (remoteLocale) {
        persistLocal(remoteLocale)
        if (remoteLocale !== locale.value)
          setLocale(remoteLocale as 'en' | 'zh')
      }
    }
    catch (error) {
      console.error('[useUserLocale] Failed to pull locale:', error)
    }
  }

  const saveUserLocale = async (newLocale: string) => {
    persistLocal(newLocale)
    if (status.value !== 'authenticated')
      return
    try {
      await patchCurrentUserProfile({ locale: newLocale })
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
          pullRemoteLocale()
      },
      { immediate: true },
    )

    watch(locale, (newLocale) => {
      const savedLocale = getSavedLocale()
      if (newLocale !== savedLocale) {
        saveUserLocale(newLocale)
      }
    })
  }

  return {
    getSavedLocale,
    saveUserLocale,
    syncLocaleChanges,
  }
}
