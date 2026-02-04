import { watch } from 'vue'

const LOCALE_STORAGE_KEY = 'tuff_locale_sync'
const LOCALE_SYNC_NAMESPACE = 'ui'
const LOCALE_SYNC_KEY = 'locale'

export function useUserLocale() {
  const { locale, setLocale } = useI18n()
  const { status } = useSession()
  const { deviceId } = useDeviceIdentity()

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
      const items = await $fetch<Array<{ namespace: string, key: string, value: unknown, updatedAt?: string }>>('/api/sync/pull')
      const localeItem = items.find(item => item.namespace === LOCALE_SYNC_NAMESPACE && item.key === LOCALE_SYNC_KEY)
      if (localeItem && typeof localeItem.value === 'string') {
        persistLocal(localeItem.value)
        if (localeItem.value !== locale.value)
          setLocale(localeItem.value as 'en' | 'zh')
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
      await $fetch('/api/sync/push', {
        method: 'POST',
        body: {
          items: [
            {
              namespace: LOCALE_SYNC_NAMESPACE,
              key: LOCALE_SYNC_KEY,
              value: newLocale,
              updatedAt: new Date().toISOString(),
              deviceId: deviceId.value ?? null,
            },
          ],
        },
      })
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
