import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { readonly, ref, watch } from 'vue'
import { appSetting, appSettingStore } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import { devLog } from '~/utils/dev-log'
import { getGlobalI18nInstance, loadLocaleMessages, setI18nLanguage } from './i18n'
import {
  BOOT_LANGUAGE_PREFERENCE,
  resolveInitialLanguagePreference,
  resolveSupportedLocale,
  SUPPORTED_LANGUAGES,
  type InitialLanguagePreference,
  type SupportedLanguage
} from './language-preferences'

const languageLog = createRendererLogger('useLanguage')

// 语言设置状态
const currentLanguage = ref<SupportedLanguage>('zh-CN')
const followSystemLanguage = ref(false)
let initialStateResolved = false

/**
 * The language this window should show right now.
 *
 * `appSetting.lang` answers with the origin default (`followSystem: true`) until the settings
 * store's first reply lands. Resolving that default boots the window in the OS language, which is
 * how a CoreBox opened before the storage reply showed an English UI - and English CoreBox results
 * on a machine whose app language is 简体中文. Until the stored preference is here, the product
 * default is the honest answer; {@link setupLanguageFollow} re-resolves from the real setting as
 * soon as it lands.
 */
export function readLanguagePreference(): InitialLanguagePreference {
  if (!appSettingStore.isHydrated()) {
    return BOOT_LANGUAGE_PREFERENCE
  }

  return resolveInitialLanguagePreference({
    settingLocale: appSetting?.lang?.locale,
    settingFollowSystem: appSetting?.lang?.followSystem,
    browserLanguage: hasNavigator() ? navigator.language : null,
    intlLocale: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : null
  })
}

function resolveInitialState(): void {
  if (initialStateResolved) {
    return
  }
  initialStateResolved = true

  const preference = readLanguagePreference()

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

  /**
   * This window may have booted on {@link BOOT_LANGUAGE_PREFERENCE}, which is what a storage reply
   * slower than the boot's soft wait leaves behind. Recompute from the stored setting once it
   * lands: a follower must end on the system language even when the origin default and the stored
   * value look identical, so the watch above cannot be relied on to fire.
   */
  void appSettings.whenHydrated().then(async () => {
    const preference = readLanguagePreference()
    followSystemLanguage.value = preference.followSystem
    if (preference.locale === currentLanguage.value) {
      return
    }
    try {
      await applyLanguage(preference.locale)
    } catch (error) {
      languageLog.error('Failed to apply the stored language after hydration', error)
    }
  })
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
