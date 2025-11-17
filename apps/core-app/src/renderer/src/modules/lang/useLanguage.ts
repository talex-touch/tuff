import { ref, watch, readonly } from 'vue'
import { setI18nLanguage, loadLocaleMessages } from './i18n'
import { appSetting } from '~/modules/channel/storage'

export const SUPPORTED_LANGUAGES = [
  { key: 'zh-CN', name: '简体中文' },
  { key: 'en-US', name: 'English' }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['key']

/**
 * 根据传入 locale 匹配项目支持的语言
 */
function resolveSupportedLocale(locale?: string | null): SupportedLanguage | null {
  if (!locale) return null
  const normalized = locale.replace('_', '-').toLowerCase()
  const matched = SUPPORTED_LANGUAGES.find((lang) => {
    const langKey = lang.key.toLowerCase()
    return normalized === langKey || normalized.startsWith(langKey.split('-')[0])
  })
  return matched?.key ?? null
}

const initialLanguage = (() => {
  if (typeof window === 'undefined') {
    return resolveSupportedLocale(appSetting?.lang?.locale) ?? 'zh-CN'
  }

  const stored = resolveSupportedLocale(localStorage.getItem('app-language'))
  if (stored) {
    return stored
  }

  const fromSetting = resolveSupportedLocale(appSetting?.lang?.locale)
  return fromSetting ?? 'zh-CN'
})()

const initialFollowSystem = (() => {
  if (typeof window === 'undefined') {
    return Boolean(appSetting?.lang?.followSystem)
  }

  const stored = localStorage.getItem('app-follow-system-language')
  if (stored === 'true' || stored === 'false') {
    return stored === 'true'
  }

  if (appSetting?.lang?.followSystem !== undefined) {
    return Boolean(appSetting.lang.followSystem)
  }

  return false
})()

// 语言设置状态
const currentLanguage = ref<SupportedLanguage>(initialLanguage)
const followSystemLanguage = ref(initialFollowSystem)

/**
 * 获取系统语言（使用浏览器可见的 locale 以及本地设置作为回退）
 */
function getSystemLanguage(): SupportedLanguage {
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : undefined
  const intlLocale =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : undefined

  const candidates: Array<string | null | undefined> = [
    browserLanguage,
    intlLocale,
    appSetting?.lang?.locale
  ]

  for (const candidate of candidates) {
    const resolved = resolveSupportedLocale(candidate)
    if (resolved) {
      return resolved
    }
  }

  return 'en-US'
}

/**
 * 语言管理 composable
 */
export function useLanguage() {
  /**
   * 获取全局 i18n 实例
   */
  function getI18nInstance() {
    const i18n = (window as any).$i18n
    if (!i18n) {
      throw new Error(
        '[useLanguage] i18n instance not initialized. Make sure window.$i18n is set before using useLanguage.'
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

      localStorage.setItem('app-language', lang)
      if (appSetting?.lang) {
        appSetting.lang.locale = lang
      }

      if (!followSystemLanguage.value) {
        localStorage.setItem('app-follow-system-language', 'false')
      }

      console.debug(`[useLanguage] Language switched to: ${lang}`)
    } catch (error) {
      console.error('[useLanguage] Failed to switch language:', error)
    }
  }

  /**
   * 设置是否跟随系统语言
   */
  async function setFollowSystemLanguage(follow: boolean) {
    followSystemLanguage.value = follow
    localStorage.setItem('app-follow-system-language', follow.toString())
    if (appSetting?.lang) {
      appSetting.lang.followSystem = follow
    }

    if (follow) {
      const systemLang = getSystemLanguage()
      await switchLanguage(systemLang)
    }
  }

  /**
   * 初始化语言设置
   */
  async function initializeLanguage() {
    // 从本地存储读取设置
    const savedLanguage = localStorage.getItem('app-language') as SupportedLanguage
    const savedFollowSystem = localStorage.getItem('app-follow-system-language') === 'true'

    followSystemLanguage.value = savedFollowSystem

    if (savedFollowSystem) {
      const systemLang = getSystemLanguage()
      await switchLanguage(systemLang)
    } else if (savedLanguage && SUPPORTED_LANGUAGES.some((lang) => lang.key === savedLanguage)) {
      await switchLanguage(savedLanguage)
    } else {
      // 默认使用中文
      await switchLanguage('zh-CN')
    }
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
