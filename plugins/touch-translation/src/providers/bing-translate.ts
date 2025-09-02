import type { TranslationProvider, TranslationResult, TranslationProviderRequest } from '../types/translation'

export class BingTranslateProvider implements TranslationProvider {
  name = 'Bing 翻译'
  id = 'bing'
  type = 'web' as const
  enabled = false
  config = {
    apiKey: '', // 需要用户配置 Azure Cognitive Services key
    region: 'global',
    apiUrl: 'https://api.cognitive.microsofttranslator.com/translate'
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'zh-Hans', sourceLanguage: sourceLang = 'auto' } = request
    try {

      const params = new URLSearchParams({
        'api-version': '3.0',
        'to': targetLang
      })

      if (sourceLang !== 'auto') {
        params.append('from', sourceLang)
      }

      const response = await fetch(`${this.config.apiUrl}?${params}`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.config.apiKey,
          'Ocp-Apim-Subscription-Region': this.config.region,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{ text }])
      })

      if (!response.ok) {
        throw new Error(`Bing Translate API error: ${response.status}`)
      }

      const data = await response.json()
      const translation = data[0]?.translations[0]

      return {
        text: translation?.text || text,
        sourceLanguage: data[0]?.detectedLanguage?.language || sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('Bing Translate error:', error)
      throw new Error(`Bing 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setApiKey(apiKey: string, region = 'global') {
    this.config.apiKey = apiKey
    this.config.region = region
  }
}