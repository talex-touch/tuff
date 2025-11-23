import type { SupportedLanguage } from '~/modules/lang'
import { computed } from 'vue'
import { appSetting } from '~/modules/channel/storage'
import { SUPPORTED_LANGUAGES, useLanguage } from '~/modules/lang'

/**
 * 语言设置相关的 hooks
 */
export function useLanguageSettings() {
  const { currentLanguage, switchLanguage, setFollowSystemLanguage } = useLanguage()
  const options = appSetting

  const followSystem = computed({
    get: () => {
      return options.lang?.followSystem || false
    },
    set: async (value: boolean) => {
      try {
        if (options.lang) {
          options.lang.followSystem = value
        }
        await setFollowSystemLanguage(value)
      } catch (error) {
        console.error('[useLanguageSettings] Failed to update followSystem:', error)
      }
    }
  })

  const selectedLanguage = computed({
    get: () => {
      console.debug('[useLanguageSettings] Getting selectedLanguage:', currentLanguage.value)
      return currentLanguage.value
    },
    set: async (value: string) => {
      console.log('[useLanguageSettings] Setting selectedLanguage to:', value)
      try {
        await switchLanguage(value as SupportedLanguage)
      } catch (error) {
        console.error('[useLanguageSettings] Failed to update selectedLanguage:', error)
      }
    }
  })

  const handleLanguageChange = async (lang: string) => {
    try {
      await switchLanguage(lang as SupportedLanguage)
      console.debug(`[useLanguageSettings] Language changed to: ${lang}`)
    } catch (error) {
      console.error('[useLanguageSettings] Failed to change language:', error)
    }
  }

  const handleFollowSystemChange = async (follow: boolean) => {
    try {
      await setFollowSystemLanguage(follow)
      console.debug(`[useLanguageSettings] Follow system language: ${follow}`)
    } catch (error) {
      console.error('[useLanguageSettings] Failed to change follow system setting:', error)
    }
  }

  return {
    currentLanguage,
    followSystem,
    selectedLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,

    handleLanguageChange,
    handleFollowSystemChange,
    switchLanguage,
    setFollowSystemLanguage
  }
}
