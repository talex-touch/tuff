import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'
import { networkClient } from '@talex-touch/utils/network'

export class BingTranslateProvider implements TranslationProvider {
  name = 'Bing 翻译'
  id = 'bing'
  type = 'web' as const
  enabled = false
  config = {
    apiKey: '', // 需要用户配置 Azure Cognitive Services key
    region: 'global',
    apiUrl: 'https://api.cognitive.microsofttranslator.com/translate',
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'zh-Hans', sourceLanguage: sourceLang = 'auto' } = request
    try {
      const params = new URLSearchParams({
        'api-version': '3.0',
        'to': targetLang,
      })

      if (sourceLang !== 'auto') {
        params.append('from', sourceLang)
      }

      const response = await networkClient.request<any>({
        method: 'POST',
        url: `${this.config.apiUrl}?${params}`,
        headers: {
          'Ocp-Apim-Subscription-Key': this.config.apiKey,
          'Ocp-Apim-Subscription-Region': this.config.region,
          'Content-Type': 'application/json',
        },
        body: [{ text }],
      })
      const data = response.data
      const translation = data[0]?.translations[0]

      return {
        text: translation?.text || text,
        sourceLanguage: data[0]?.detectedLanguage?.language || sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error(`Bing 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setApiKey(apiKey: string, region = 'global') {
    this.config.apiKey = apiKey
    this.config.region = region
  }
}
