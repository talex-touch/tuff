import type { TranslationProvider, TranslationResult } from '../types'
import { tuffIntelligenceTranslate } from '../../shared/tuffintelligence'

export class TuffIntelligenceProvider implements TranslationProvider {
  id = 'tuffintelligence'
  name = 'Tuff Intelligence'

  async translate(text: string, from: string, to: string): Promise<TranslationResult> {
    try {
      const response = await tuffIntelligenceTranslate({
        text,
        targetLang: to,
        sourceLang: from && from !== 'auto' ? from : undefined,
      })

      return {
        text: response.text?.trim() || text,
        from,
        to,
        service: this.id,
        provider: response.provider,
        model: response.model,
      }
    } catch (error) {
      return {
        text: `[TuffIntelligence Failed] ${text}`,
        from,
        to,
        service: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
