import type { SupportedLanguage } from '~/modules/lang'
import { computed } from 'vue'
import { appSetting } from '~/modules/channel/storage'
import { SUPPORTED_LANGUAGES, useLanguage } from '~/modules/lang'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'

const languageSettingsLog = createRendererLogger('useLanguageSettings')

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
        languageSettingsLog.error('Failed to update followSystem', error)
      }
    }
  })

  const selectedLanguage = computed({
    get: () => {
      devLog('[useLanguageSettings] Getting selectedLanguage:', currentLanguage.value)
      return currentLanguage.value
    },
    set: async (value: string) => {
      devLog('[useLanguageSettings] Setting selectedLanguage to:', value)
      try {
        await switchLanguage(value as SupportedLanguage)
      } catch (error) {
        languageSettingsLog.error('Failed to update selectedLanguage', error)
      }
    }
  })

  const handleLanguageChange = async (lang: string) => {
    try {
      await switchLanguage(lang as SupportedLanguage)
      devLog(`[useLanguageSettings] Language changed to: ${lang}`)
    } catch (error) {
      languageSettingsLog.error('Failed to change language', error)
    }
  }

  const handleFollowSystemChange = async (follow: boolean) => {
    try {
      await setFollowSystemLanguage(follow)
      devLog(`[useLanguageSettings] Follow system language: ${follow}`)
    } catch (error) {
      languageSettingsLog.error('Failed to change follow system setting', error)
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
