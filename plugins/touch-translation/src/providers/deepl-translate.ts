import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'
import { validateProviderApiUrl } from '../utils/url-validation'
import { getPluginNetworkClient } from './plugin-network-client'

export class DeepLTranslateProvider implements TranslationProvider {
  name = 'DeepL'
  id = 'deepl'
  type = 'ai' as const
  enabled = true
  config = {
    apiKey: '', // 需要用户配置
    apiUrl: 'https://api-free.deepl.com/v2/translate', // 免费版 API
  }

  private mapLanguageCode(lang: string): string {
    const normalized = lang.trim().toLowerCase()
    const map: Record<string, string> = {
      'zh': 'ZH',
      'zh-cn': 'ZH',
      'zh-hans': 'ZH',
      'zh-tw': 'ZH',
      'en': 'EN',
      'ja': 'JA',
      'ko': 'KO',
      'fr': 'FR',
      'de': 'DE',
      'es': 'ES',
      'ru': 'RU',
    }
    return map[normalized] || normalized.toUpperCase()
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'ZH', sourceLanguage: sourceLang = 'auto' } = request
    try {
      const urlCheck = validateProviderApiUrl(this.config.apiUrl)
      if (!urlCheck.valid || !urlCheck.normalized) {
        throw new Error(urlCheck.error || 'DeepL API URL 无效')
      }

      const payload: Record<string, unknown> = {
        text: [text],
        target_lang: this.mapLanguageCode(targetLang),
      }
      if (sourceLang && sourceLang.toLowerCase() !== 'auto') {
        payload.source_lang = this.mapLanguageCode(sourceLang)
      }

      const response = await getPluginNetworkClient().request<any>({
        method: 'POST',
        responseType: 'json',
        url: urlCheck.normalized,
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      })
      const data = response.data

      const translation = Array.isArray(data?.translations) ? data.translations[0] : null
      if (!translation || typeof translation.text !== 'string') {
        throw new Error(`DeepL API error: ${data?.message || 'Unexpected response format'}`)
      }

      return {
        text: translation.text,
        sourceLanguage: typeof translation.detected_source_language === 'string'
          ? translation.detected_source_language.toLowerCase()
          : sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error(`DeepL 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setApiKey(apiKey: string) {
    this.config.apiKey = apiKey
  }
}
