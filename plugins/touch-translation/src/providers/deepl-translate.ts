import type { TranslationProvider, TranslationResult } from '../types/translation'

export class DeepLTranslateProvider implements TranslationProvider {
  name = 'DeepL'
  id = 'deepl'
  type = 'ai' as const
  enabled = true
  config = {
    apiKey: '', // 需要用户配置
    apiUrl: 'https://api-free.deepl.com/v2/translate' // 免费版 API
  }

  async translate(text: string, targetLang = 'ZH', sourceLang = 'auto'): Promise<TranslationResult> {
    try {
      // 如果没有 API Key，使用模拟翻译
      if (!this.config.apiKey) {
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400))
        return {
          text: `[DeepL AI 翻译] ${text}`,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: this.name,
          timestamp: Date.now()
        }
      }

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: [text],
          target_lang: targetLang,
          source_lang: sourceLang === 'auto' ? undefined : sourceLang
        })
      })

      if (!response.ok) {
        throw new Error(`DeepL API error: ${response.status}`)
      }

      const data = await response.json()
      
      return {
        text: data.translations[0]?.text || text,
        sourceLanguage: data.translations[0]?.detected_source_language || sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('DeepL Translate error:', error)
      throw new Error(`DeepL 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setApiKey(apiKey: string) {
    this.config.apiKey = apiKey
  }
}