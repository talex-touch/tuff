import { ref, watch, readonly } from 'vue'
import { setI18nLanguage, loadLocaleMessages } from './i18n'

// 支持的语言列表
export const SUPPORTED_LANGUAGES = [
  { key: 'zh-CN', name: '简体中文' },
  { key: 'en-US', name: 'English' }
] as const

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['key']

// 语言设置状态
const currentLanguage = ref<SupportedLanguage>('zh-CN')
const followSystemLanguage = ref(false)

/**
 * 获取系统语言
 */
function getSystemLanguage(): SupportedLanguage {
  const systemLang = navigator.language || 'en-US'

  // 检查是否为支持的语言
  for (const lang of SUPPORTED_LANGUAGES) {
    if (systemLang.startsWith(lang.key.split('-')[0])) {
      return lang.key
    }
  }

  return 'en-US' // 默认返回英语
}

/**
 * 语言管理 composable
 */
export function useLanguage() {
  // 使用全局 i18n 实例而不是 composable，因为需要访问 i18n.global
  const i18n = (window as any).$i18n

  /**
   * 切换语言
   */
  async function switchLanguage(lang: SupportedLanguage) {
    try {
      // 加载语言包
      await loadLocaleMessages(i18n, lang)

      // 设置语言
      setI18nLanguage(i18n, lang)
      currentLanguage.value = lang

      // 保存到本地存储
      localStorage.setItem('app-language', lang)

      // 只有在手动切换语言时才关闭跟随系统
      if (!followSystemLanguage.value) {
        localStorage.setItem('app-follow-system-language', 'false')
      }

      console.log(`[useLanguage] Language switched to: ${lang}`)
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
    } else if (savedLanguage && SUPPORTED_LANGUAGES.some(lang => lang.key === savedLanguage)) {
      await switchLanguage(savedLanguage)
    } else {
      // 默认使用中文
      await switchLanguage('zh-CN')
    }
  }

  // 监听系统语言变化（如果启用了跟随系统）
  watch(() => followSystemLanguage.value, async (follow) => {
    if (follow) {
      const systemLang = getSystemLanguage()
      if (systemLang !== currentLanguage.value) {
        await switchLanguage(systemLang)
      }
    }
  })

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
