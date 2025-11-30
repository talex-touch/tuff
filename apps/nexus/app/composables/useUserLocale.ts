import { useUser } from '@clerk/vue'
import { watch } from 'vue'

/**
 * Composable for managing user locale preferences stored in Clerk metadata.
 * Syncs user's language preference across devices and sessions.
 * 
 * @returns Object containing locale management functions
 */
export function useUserLocale() {
  const { user } = useUser()
  const { locale, setLocale } = useI18n()
  
  /**
   * Get user's saved locale from Clerk metadata
   * @returns Saved locale string or null if not set
   */
  const getSavedLocale = (): string | null => {
    if (!user.value)
      return null
    
    return user.value.publicMetadata?.locale as string | null
  }

  /**
   * Save user's locale preference to Clerk metadata
   * @param newLocale - Locale to save (e.g., 'zh', 'en')
   */
  const saveUserLocale = async (newLocale: string) => {
    if (!user.value)
      return

    try {
      await user.value.update({
        publicMetadata: {
          ...user.value.publicMetadata,
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
    const savedLocale = getSavedLocale()
    if (savedLocale && savedLocale !== locale.value) {
      setLocale(savedLocale)
    }
  }

  /**
   * Watch for locale changes and auto-save to Clerk
   * This enables automatic synchronization when user changes language
   */
  const syncLocaleChanges = () => {
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
