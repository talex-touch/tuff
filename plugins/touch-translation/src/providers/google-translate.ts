import type { TranslationProvider, TranslationResult } from '../types/translation'

export class GoogleTranslateProvider implements TranslationProvider {
  name = 'Google 翻译'
  id = 'google'
  type = 'web' as const
  enabled = true

  async translate(text: string, targetLang = 'zh', sourceLang = 'auto'): Promise<TranslationResult> {
    try {
      // 使用 Google Translate 的免费 API
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`Google Translate API error: ${response.status}`)
      }

      const data = await response.json()
      
      // 解析 Google Translate 响应格式
      let translatedText = ''
      if (data[0]) {
        translatedText = data[0].map((item: any) => item[0]).join('')
      }

      return {
        text: translatedText || text,
        sourceLanguage: data[2] || sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('Google Translate error:', error)
      throw new Error(`Google 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}