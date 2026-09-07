import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { readonly, ref, watch } from 'vue'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import { devLog } from '~/utils/dev-log'
import { getGlobalI18nInstance, loadLocaleMessages, setI18nLanguage } from './i18n'
import {
  resolveInitialLanguagePreference,
  resolveSupportedLocale,
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

  const preference = resolveInitialLanguagePreference({
    settingLocale: appSetting?.lang?.locale,
    settingFollowSystem: appSetting?.lang?.followSystem,
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

function clearRetiredLanguageSnapshot(): void {
  if (!hasWindow()) {
    return
  }
  localStorage.removeItem('app-language')
  localStorage.removeItem('app-follow-system-language')
}

function requireI18nInstance() {
  const i18n = getGlobalI18nInstance()
  if (!i18n) {
    throw new Error(
      '[useLanguage] i18n instance not initialized. Make sure setupI18n is called before using useLanguage.'
    )
  }
  return i18n
}

/** Put this window's i18n on `lang`. Persisting is the caller's decision. */
async function applyLanguage(lang: SupportedLanguage): Promise<void> {
  const i18n = requireI18nInstance()
  await loadLocaleMessages(i18n, lang)
  setI18nLanguage(i18n, lang)
  currentLanguage.value = lang
}

let languageFollowStarted = false

/**
 * Keep this window's locale on the persisted setting.
 *
 * Only the main window owns the language UI. Every other window (CoreBox, division boxes) boots
 * from `appSetting.lang` and, until this ran, never heard about a later switch: the storage
 * broadcast did update `appSetting.lang` in that window, but nothing applied it, so CoreBox kept
 * the language it was opened with. Apply only — a follower that persisted would echo its own
 * stale `followSystem` back over the value the main window just wrote.
 */
export function setupLanguageFollow(): void {
  if (languageFollowStarted) {
    return
  }
  languageFollowStarted = true
  resolveInitialState()

  watch(
    () => [appSetting?.lang?.locale, appSetting?.lang?.followSystem] as const,
    async ([locale, followSystem]) => {
      if (typeof followSystem === 'boolean') {
        followSystemLanguage.value = followSystem
      }
      const resolved = resolveSupportedLocale(locale)
      if (!resolved || resolved === currentLanguage.value) {
        return
      }
      try {
        await applyLanguage(resolved)
      } catch (error) {
        languageLog.error('Failed to follow language setting', error)
      }
    }
  )
}

/**
 * 语言管理 composable
 */
export function useLanguage() {
  resolveInitialState()
  /**
   * 切换语言
   */
  async function switchLanguage(lang: SupportedLanguage) {
    try {
      await applyLanguage(lang)
      persistLanguagePreference(lang, followSystemLanguage.value)

      if (!followSystemLanguage.value) {
        clearRetiredLanguageSnapshot()
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

    clearRetiredLanguageSnapshot()
  }

  /**
   * 初始化语言设置
   */
  async function initializeLanguage() {
    await appSettings.whenHydrated()

    const preference = resolveInitialLanguagePreference({
      settingLocale: appSetting?.lang?.locale,
      settingFollowSystem: appSetting?.lang?.followSystem,
      browserLanguage: hasNavigator() ? navigator.language : null,
      intlLocale:
        typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : null
    })

    followSystemLanguage.value = preference.followSystem
    currentLanguage.value = preference.locale
    persistLanguagePreference(preference.locale, preference.followSystem)
    clearRetiredLanguageSnapshot()

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
