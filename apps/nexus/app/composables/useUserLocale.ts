import { watch } from 'vue'

/**
 * Composable for managing user locale preferences stored in Clerk metadata.
 * Syncs user's language preference across devices and sessions.
 * SSR-safe: all Clerk operations are deferred to client-side only.
 *
 * @returns Object containing locale management functions
 */
export function useUserLocale() {
  const { locale, setLocale } = useI18n()

  const getClerkUser = () => {
    if (import.meta.server)
      return null
    try {
      // Dynamic import to avoid SSR issues
      const clerk = (window as any)?.__clerk_frontend_api || (window as any)?.Clerk
      return clerk?.user ?? null
    }
    catch {
      return null
    }
  }

  /**
   * Get user's saved locale from Clerk metadata
   * @returns Saved locale string or null if not set
   */
  const getSavedLocale = (): string | null => {
    const user = getClerkUser()
    if (!user)
      return null

    // Use unsafeMetadata for client-side writable locale preference
    return (user.unsafeMetadata?.locale as string) ?? null
  }

  /**
   * Save user's locale preference to Clerk metadata
   * @param newLocale - Locale to save (e.g., 'zh', 'en')
   */
  const saveUserLocale = async (newLocale: string) => {
    const user = getClerkUser()
    if (!user?.update)
      return

    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          locale: newLocale,
        },
      })
    }
    catch (error) {
      console.error('[useUserLocale] Failed to save locale:', error)
    }
  }

  /**
   * Initialize user's locale from Clerk metadata on mount
   * Falls back to browser locale if not set in Clerk
   */
  const initializeLocale = () => {
    if (import.meta.server)
      return

    const savedLocale = getSavedLocale()
    if (savedLocale && savedLocale !== locale.value) {
      setLocale(savedLocale as 'en' | 'zh')
    }
  }

  /**
   * Watch for locale changes and auto-save to Clerk
   * This enables automatic synchronization when user changes language
   */
  const syncLocaleChanges = () => {
    if (import.meta.server)
      return

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
    initializeLocale,
    syncLocaleChanges,
  }
}
