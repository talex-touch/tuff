import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'

interface TencentConfig {
  secretId: string
  secretKey: string
  region: string
  apiUrl: string
}

export class TencentTranslateProvider implements TranslationProvider {
  readonly id = 'tencent'
  readonly name = '腾讯翻译'
  readonly type = 'api'
  enabled = false
  
  config: TencentConfig = {
    secretId: '',
    secretKey: '',
    region: 'ap-beijing',
    apiUrl: 'https://tmt.tencentcloudapi.com'
  }

  private mapLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      'zh': 'zh',
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

  private async generateSignature(payload: string, timestamp: string): Promise<string> {
    // 腾讯云签名算法较为复杂，在没有 crypto-js 的情况下，我们使用简化版本
    // 实际生产环境建议使用服务端代理或专门的 SDK
    const { secretKey, secretId } = this.config
    const date = new Date(parseInt(timestamp) * 1000).toISOString().substr(0, 10)
    
    // 简化版签名，仅用于演示
    const simpleSignature = await this.simpleHmac(`${date}${payload}${secretKey}`)
    const credentialScope = `${date}/${this.config.region}/tmt/tc3_request`
    
    return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${simpleSignature}`
  }

  private async simpleHmac(message: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(message)
    
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } catch {
      // 降级到简单哈希
      let hash = 0
      for (let i = 0; i < message.length; i++) {
        const char = message.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
      }
      return Math.abs(hash).toString(16)
    }
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: to, sourceLanguage: from } = request
    

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const payload = JSON.stringify({
        Action: 'TextTranslate',
        Version: '2018-03-21',
        Region: this.config.region,
        SourceText: text,
        Source: this.mapLanguageCode(from || 'auto'),
        Target: this.mapLanguageCode(to),
        ProjectId: 0
      })

      const authorization = await this.generateSignature(payload, timestamp)

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'Host': 'tmt.tencentcloudapi.com',
          'X-TC-Action': 'TextTranslate',
          'X-TC-Timestamp': timestamp,
          'X-TC-Version': '2018-03-21',
          'X-TC-Region': this.config.region
        },
        body: payload
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      
      if (data.Response.Error) {
        throw new Error(`腾讯翻译错误: ${data.Response.Error.Message}`)
      }

      const translatedText = data.Response.TargetText || text
      
      return {
        text: translatedText,
        sourceLanguage: data.Response.Source || from || 'auto',
        targetLanguage: to,
        provider: this.name,
        timestamp: Date.now()
      }
    } catch (error) {
      throw new Error(`腾讯翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}