import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'

interface MyMemoryConfig {
  apiUrl: string
  email?: string
}

export class MyMemoryTranslateProvider implements TranslationProvider {
  readonly id = 'mymemory'
  readonly name = 'MyMemory'
  readonly type = 'web'
  enabled = false
  
  config: MyMemoryConfig = {
    apiUrl: 'https://api.mymemory.translated.net/get',
    email: ''
  }

  private mapLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      'zh': 'zh-CN',
      'en': 'en',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'ru': 'ru',
      'auto': 'auto'
    }
    return langMap[lang] || lang
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: to, sourceLanguage: from } = request
    
    try {
      const params = new URLSearchParams({
        q: text,
        langpair: `${this.mapLanguageCode(from || 'auto')}|${this.mapLanguageCode(to)}`
      })

      // 如果配置了邮箱，添加到请求中以提高配额
      if (this.config.email) {
        params.append('de', this.config.email)
      }

      const response = await fetch(`${this.config.apiUrl}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      
      if (data.responseStatus !== 200) {
        throw new Error(`MyMemory 错误: ${data.responseDetails || '未知错误'}`)
      }

      const translatedText = data.responseData?.translatedText || text
      
      // 检查翻译质量
      const matches = data.matches || []
      const bestMatch = matches.find((match: any) => match.quality >= 70)
      const finalText = bestMatch?.translation || translatedText
      
      return {
        text: finalText,
        sourceLanguage: from || 'auto',
        targetLanguage: to,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      throw new Error(`MyMemory 翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}