import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'
import { tuffIntelligenceTranslate } from '../../shared/tuffintelligence'

export class TuffIntelligenceTranslateProvider implements TranslationProvider {
  name = 'Tuff Intelligence'
  id = 'tuffintelligence'
  type = 'ai' as const
  enabled = true

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'zh', sourceLanguage: sourceLang = 'auto' } = request

    try {
      const response = await tuffIntelligenceTranslate({
        text,
        targetLang,
        sourceLang: sourceLang && sourceLang !== 'auto' ? sourceLang : undefined,
      })

      const translatedText = response?.text
      if (typeof translatedText !== 'string') throw new Error('Invalid intelligence translate result')

      const provider = response?.provider || 'Unknown'
      const model = response?.model || 'Unknown'

      return {
        text: translatedText.trim() || text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        provider: `${this.name} (${provider}/${model})`,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error(`Tuff Intelligence 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}
