import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'
import { validateProviderApiUrl } from '../utils/url-validation'
import { getPluginNetworkClient } from './plugin-network-client'

export class CustomTranslateProvider implements TranslationProvider {
  name = '自定义翻译'
  id = 'custom'
  type = 'ai' as const
  enabled = true
  config = {
    apiUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo', // 默认模型
    prompt: '请将以下文本翻译成中文，只返回翻译结果：',
  }

  private buildPrompt(text: string, targetLang: string): string {
    const targetLanguageMap: Record<string, string> = {
      zh: '中文',
      en: '英文',
      ja: '日文',
      ko: '韩文',
      fr: '法文',
      de: '德文',
      es: '西班牙文',
      ru: '俄文',
    }
    const targetLanguageName = targetLanguageMap[targetLang] || targetLang || '中文'
    const configuredPrompt = typeof this.config.prompt === 'string' ? this.config.prompt.trim() : ''
    if (!configuredPrompt) {
      return `请将以下文本翻译成${targetLanguageName}，只返回翻译结果，不要添加任何解释：\n\n${text}`
    }

    const withLang = configuredPrompt.replace(
      /\{\{\s*(?:targetLang|targetLanguage|target)\s*\}\}|\{(?:targetLang|targetLanguage|target)\}/gi,
      () => targetLanguageName,
    )
    if (/\{\{\s*text\s*\}\}|\{text\}/i.test(withLang)) {
      return withLang.replace(/\{\{\s*text\s*\}\}|\{text\}/gi, () => text)
    }
    return `${withLang}\n\n${text}`
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: targetLang = 'zh', sourceLanguage: sourceLang = 'auto' } = request
    try {
      const urlCheck = validateProviderApiUrl(this.config.apiUrl)
      if (!urlCheck.valid || !urlCheck.normalized) {
        throw new Error(urlCheck.error || '自定义翻译 API URL 无效')
      }

      const prompt = this.buildPrompt(text, targetLang)

      const response = await getPluginNetworkClient().request<any>({
        method: 'POST',
        responseType: 'json',
        url: urlCheck.normalized,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: {
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        },
      })
      const data = response.data
      const translatedText = data.choices?.[0]?.message?.content?.trim() || text

      return {
        text: translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        provider: this.name,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error(`自定义翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  setConfig(config: Partial<typeof this.config>) {
    this.config = { ...this.config, ...config }
  }
}
