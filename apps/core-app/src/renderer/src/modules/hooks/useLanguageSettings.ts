import { computed } from 'vue'
import { useLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '~/modules/lang'
import { appSetting } from '~/modules/channel/storage'

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
        console.log('[useLanguageSettings] FollowSystem updated successfully')
      } catch (error) {
        console.error('[useLanguageSettings] Failed to update followSystem:', error)
      }
    }
  })

  const selectedLanguage = computed({
    get: () => {
      console.log('[useLanguageSettings] Getting selectedLanguage:', currentLanguage.value)
      return currentLanguage.value
    },
    set: async (value: string) => {
      console.log('[useLanguageSettings] Setting selectedLanguage to:', value)
      try {
        await switchLanguage(value as SupportedLanguage)
        console.log('[useLanguageSettings] SelectedLanguage updated successfully')
      } catch (error) {
        console.error('[useLanguageSettings] Failed to update selectedLanguage:', error)
      }
    }
  })

  const handleLanguageChange = async (lang: string) => {
    try {
      await switchLanguage(lang as SupportedLanguage)
      console.log(`[useLanguageSettings] Language changed to: ${lang}`)
    } catch (error) {
      console.error('[useLanguageSettings] Failed to change language:', error)
    }
  }

  // 处理跟随系统语言切换
  const handleFollowSystemChange = async (follow: boolean) => {
    try {
      await setFollowSystemLanguage(follow)
      console.log(`[useLanguageSettings] Follow system language: ${follow}`)
    } catch (error) {
      console.error('[useLanguageSettings] Failed to change follow system setting:', error)
    }
  }

  return {
    // 状态
    currentLanguage,
    followSystem,
    selectedLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,

    // 方法
    handleLanguageChange,
    handleFollowSystemChange,
    switchLanguage,
    setFollowSystemLanguage
  }
}
