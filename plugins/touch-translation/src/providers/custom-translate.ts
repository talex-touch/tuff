import type { TranslationProvider, TranslationResult, TranslationProviderRequest } from '../types/translation'

export class CustomTranslateProvider implements TranslationProvider {
  name = '自定义翻译'
  id = 'custom'
  type = 'ai' as const
  enabled = true
  config = {
    apiUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo', // 默认模型
    prompt: '请将以下文本翻译成中文，只返回翻译结果：'
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'zh', sourceLanguage: sourceLang = 'auto' } = request
    try {

      // 构建翻译提示词
      const targetLanguageMap: Record<string, string> = {
        'zh': '中文',
        'en': '英文',
        'ja': '日文',
        'ko': '韩文',
        'fr': '法文',
        'de': '德文',
        'es': '西班牙文',
        'ru': '俄文'
      }

      const targetLanguageName = targetLanguageMap[targetLang] || '中文'
      const prompt = `请将以下文本翻译成${targetLanguageName}，只返回翻译结果，不要添加任何解释：\n\n${text}`

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      })

      if (!response.ok) {
        throw new Error(`Custom API error: ${response.status}`)
      }

      const data = await response.json()
      const translatedText = data.choices?.[0]?.message?.content?.trim() || text

      return {
        text: translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('Custom Translate error:', error)
      throw new Error(`自定义翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setConfig(config: Partial<typeof this.config>) {
    this.config = { ...this.config, ...config }
  }
}