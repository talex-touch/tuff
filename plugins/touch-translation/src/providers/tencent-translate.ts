import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'
import { validateProviderApiUrl } from '../utils/url-validation'
import { getPluginNetworkClient } from './plugin-network-client'

interface TencentConfig {
  secretId: string
  secretKey: string
  region: string
  apiUrl: string
}

const TENCENT_SERVICE = 'tmt'
const TENCENT_CONTENT_TYPE = 'application/json; charset=utf-8'
const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(view, byte => byte.toString(16).padStart(2, '0')).join('')
}

function requireSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle || typeof subtle.digest !== 'function' || typeof subtle.importKey !== 'function' || typeof subtle.sign !== 'function') {
    throw new Error('WebCrypto SubtleCrypto HMAC-SHA256 不可用，拒绝使用弱签名')
  }
  return subtle
}

async function sha256Hex(message: string): Promise<string> {
  const subtle = requireSubtleCrypto()
  const digest = await subtle.digest('SHA-256', encoder.encode(message))
  return toHex(digest)
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const subtle = requireSubtleCrypto()
  const keyBytes = Uint8Array.from(key)
  const cryptoKey = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return new Uint8Array(sig)
}

export async function signTencentTc3Request(params: {
  secretId: string
  secretKey: string
  host: string
  canonicalUri?: string
  payload: string
  timestamp: string
  service?: string
  contentType?: string
}): Promise<string> {
  const service = params.service || TENCENT_SERVICE
  const contentType = params.contentType || TENCENT_CONTENT_TYPE
  const canonicalUri = params.canonicalUri || '/'
  const date = new Date(Number.parseInt(params.timestamp, 10) * 1000).toISOString().slice(0, 10)

  const canonicalHeaders = `content-type:${contentType.toLowerCase()}\nhost:${params.host.toLowerCase()}\n`
  const signedHeaders = 'content-type;host'
  const hashedRequestPayload = await sha256Hex(params.payload)
  const canonicalRequest = [
    'POST',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = [
    'TC3-HMAC-SHA256',
    params.timestamp,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  const secretDate = await hmacSha256(encoder.encode(`TC3${params.secretKey}`), date)
  const secretService = await hmacSha256(secretDate, service)
  const secretSigning = await hmacSha256(secretService, 'tc3_request')
  const signature = toHex(await hmacSha256(secretSigning, stringToSign))

  return `TC3-HMAC-SHA256 Credential=${params.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
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
    apiUrl: 'https://tmt.tencentcloudapi.com',
  }

  private mapLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      zh: 'zh',
      en: 'en',
      ja: 'ja',
      ko: 'ko',
      fr: 'fr',
      de: 'de',
      es: 'es',
      ru: 'ru',
      auto: 'auto',
    }
    return langMap[lang] || lang
  }

  async translate(request: TranslationProviderRequest): Promise<TranslationResult> {
    const { text, targetLanguage: to, sourceLanguage: from } = request

    try {
      const urlCheck = validateProviderApiUrl(this.config.apiUrl)
      if (!urlCheck.valid || !urlCheck.normalized) {
        throw new Error(urlCheck.error || '腾讯翻译 API URL 无效')
      }

      const parsedUrl = new URL(urlCheck.normalized)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const payload = JSON.stringify({
        SourceText: text,
        Source: this.mapLanguageCode(from || 'auto'),
        Target: this.mapLanguageCode(to),
        ProjectId: 0,
      })

      const authorization = await signTencentTc3Request({
        secretId: this.config.secretId,
        secretKey: this.config.secretKey,
        host: parsedUrl.host,
        canonicalUri: parsedUrl.pathname || '/',
        payload,
        timestamp,
      })

      const response = await getPluginNetworkClient().request<any>({
        method: 'POST',
        url: urlCheck.normalized,
        headers: {
          'Authorization': authorization,
          'Content-Type': TENCENT_CONTENT_TYPE,
          'Host': parsedUrl.host,
          'X-TC-Action': 'TextTranslate',
          'X-TC-Timestamp': timestamp,
          'X-TC-Version': '2018-03-21',
          'X-TC-Region': this.config.region,
        },
        body: payload,
        responseType: 'json',
      })
      const data = response.data

      if (data?.Response?.Error) {
        throw new Error(`腾讯翻译错误: ${data.Response.Error.Message}`)
      }

      const translatedText = data?.Response?.TargetText || text

      return {
        text: translatedText,
        sourceLanguage: data?.Response?.Source || from || 'auto',
        targetLanguage: to,
        provider: this.name,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error(`腾讯翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}
