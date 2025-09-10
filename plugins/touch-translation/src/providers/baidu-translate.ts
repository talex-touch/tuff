import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'

interface BaiduConfig {
  appId: string
  secretKey: string
  apiUrl: string
}

export class BaiduTranslateProvider implements TranslationProvider {
  readonly id = 'baidu'
  readonly name = '百度翻译'
  readonly type = 'api'
  enabled = false
  
  config: BaiduConfig = {
    appId: '',
    secretKey: '',
    apiUrl: 'https://fanyi-api.baidu.com/api/trans/vip/translate'
  }

  private async generateSign(query: string, salt: string): Promise<string> {
    const { appId, secretKey } = this.config
    const str = appId + query + salt + secretKey
    
    // 使用浏览器原生 crypto API 生成 MD5
    const encoder = new TextEncoder()
    const data = encoder.encode(str)
    const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => {
      // 如果 MD5 不支持，使用简单的哈希替代
      return this.simpleHash(str)
    })
    
    if (hashBuffer instanceof ArrayBuffer) {
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      return hashBuffer
    }
  }

  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  private mapLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      'zh': 'zh',
      'en': 'en',
      'ja': 'jp',
      'ko': 'kor',
      'fr': 'fra',
      'de': 'de',
      'es': 'spa',
      'ru': 'ru',
      'auto': 'auto'
    }
    return langMap[lang] || lang
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: to, sourceLanguage: from } = request
    

    try {
      const salt = Date.now().toString()
      const sign = await this.generateSign(text, salt)
      
      const params = new URLSearchParams({
        q: text,
        from: this.mapLanguageCode(from || 'auto'),
        to: this.mapLanguageCode(to),
        appid: this.config.appId,
        salt,
        sign
      })

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      
      if (data.error_code) {
        throw new Error(`百度翻译错误: ${data.error_msg || data.error_code}`)
      }

      const translatedText = data.trans_result?.[0]?.dst || text
      
      return {
        text: translatedText,
        sourceLanguage: data.from || from || 'auto',
        targetLanguage: to,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      throw new Error(`百度翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}