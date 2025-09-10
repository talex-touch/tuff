import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'

export class DeepLTranslateProvider implements TranslationProvider {
  name = 'DeepL'
  id = 'deepl'
  type = 'ai' as const
  enabled = true
  config = {
    apiKey: '', // 需要用户配置
    apiUrl: 'https://api-free.deepl.com/v2/translate', // 免费版 API
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'ZH', sourceLanguage: sourceLang = 'auto' } = request
    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          source_lang: sourceLang === 'auto' ? 'auto' : sourceLang,
          target_lang: targetLang,
        }),
      })

      if (!response.ok) {
        throw new Error(`DeepL API error: ${response.status}`)
      }

      const data = await response.json()

      if (data.code !== 200) {
        throw new Error(`DeepL API error: ${data.message || 'Unknown error'}`)
      }

      return {
        text: data.data || text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      console.error('DeepL Translate error:', error)
      throw new Error(`DeepL 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setApiKey(apiKey: string) {
    this.config.apiKey = apiKey
  }
}
