import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { readonly, ref, watch } from 'vue'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import { devLog } from '~/utils/dev-log'
import { getGlobalI18nInstance, loadLocaleMessages, setI18nLanguage } from './i18n'
import {
  readLegacyLanguagePreferenceSnapshot,
  resolveInitialLanguagePreference,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage
} from './language-preferences'

const languageLog = createRendererLogger('useLanguage')

// 语言设置状态
const currentLanguage = ref<SupportedLanguage>('zh-CN')
const followSystemLanguage = ref(false)
let initialStateResolved = false

function resolveInitialState(): void {
  if (initialStateResolved) {
    return
  }
  initialStateResolved = true

  const legacy = readLegacyLanguagePreferenceSnapshot()
  const preference = resolveInitialLanguagePreference({
    settingLocale: appSetting?.lang?.locale,
    settingFollowSystem: appSetting?.lang?.followSystem,
    legacyLocale: legacy.locale,
    legacyFollowSystem: legacy.followSystem,
    browserLanguage: hasNavigator() ? navigator.language : null,
    intlLocale: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : null
  })

  currentLanguage.value = preference.locale
  followSystemLanguage.value = preference.followSystem
}

function getSystemLanguage(): SupportedLanguage {
  const preference = resolveInitialLanguagePreference({
    settingLocale: appSetting?.lang?.locale,
    settingFollowSystem: true,
    browserLanguage: hasNavigator() ? navigator.language : null,
    intlLocale: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : null
  })
  return preference.locale
}

function persistLanguagePreference(lang: SupportedLanguage, followSystem: boolean): void {
  if (appSetting?.lang) {
    appSetting.lang.locale = lang
    appSetting.lang.followSystem = followSystem
  }
}

function clearLegacyLanguageSnapshot(): void {
  if (!hasWindow()) {
    return
  }
  localStorage.removeItem('app-language')
  localStorage.removeItem('app-follow-system-language')
}

/**
 * 语言管理 composable
 */
export function useLanguage() {
  resolveInitialState()
  /**
   * 获取全局 i18n 实例
   */
  function getI18nInstance() {
    const i18n = getGlobalI18nInstance()
    if (!i18n) {
      throw new Error(
        '[useLanguage] i18n instance not initialized. Make sure setupI18n is called before using useLanguage.'
      )
    }
    return i18n
  }

  /**
   * 切换语言
   */
  async function switchLanguage(lang: SupportedLanguage) {
    try {
      const i18n = getI18nInstance()

      await loadLocaleMessages(i18n, lang)

      setI18nLanguage(i18n, lang)
      currentLanguage.value = lang
      persistLanguagePreference(lang, followSystemLanguage.value)

      if (!followSystemLanguage.value) {
        clearLegacyLanguageSnapshot()
      }

      devLog(`[useLanguage] Language switched to: ${lang}`)
    } catch (error) {
      languageLog.error('Failed to switch language', error)
      throw error
    }
  }

  /**
   * 设置是否跟随系统语言
   */
  async function setFollowSystemLanguage(follow: boolean) {
    followSystemLanguage.value = follow
    persistLanguagePreference(currentLanguage.value, follow)

    if (follow) {
      const systemLang = getSystemLanguage()
      await switchLanguage(systemLang)
      return
    }

    clearLegacyLanguageSnapshot()
  }

  /**
   * 初始化语言设置
   */
  async function initializeLanguage() {
    await appSettings.whenHydrated()

    const legacy = readLegacyLanguagePreferenceSnapshot()
    const preference = resolveInitialLanguagePreference({
      settingLocale: appSetting?.lang?.locale,
      settingFollowSystem: appSetting?.lang?.followSystem,
      legacyLocale: legacy.locale,
      legacyFollowSystem: legacy.followSystem,
      browserLanguage: hasNavigator() ? navigator.language : null,
      intlLocale:
        typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : null
    })

    followSystemLanguage.value = preference.followSystem
    persistLanguagePreference(preference.locale, preference.followSystem)

    if (preference.shouldMigrateLegacy) {
      clearLegacyLanguageSnapshot()
    }

    await switchLanguage(preference.locale)
  }

  // 监听系统语言变化（如果启用了跟随系统）
  watch(
    () => followSystemLanguage.value,
    async (follow) => {
      if (follow) {
        const systemLang = getSystemLanguage()
        if (systemLang !== currentLanguage.value) {
          await switchLanguage(systemLang)
        }
      }
    }
  )

  return {
    currentLanguage: readonly(currentLanguage),
    followSystemLanguage: readonly(followSystemLanguage),
    supportedLanguages: SUPPORTED_LANGUAGES,
    switchLanguage,
    setFollowSystemLanguage,
    initializeLanguage,
    getSystemLanguage
  }
}
