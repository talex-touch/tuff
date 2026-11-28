import type { TranslationProvider, TranslationProviderRequest, TranslationResult } from '../types/translation'
import { validateProviderApiUrl } from '../utils/url-validation'
import { getPluginNetworkClient } from './plugin-network-client'

interface BaiduConfig {
  appId: string
  secretKey: string
  apiUrl: string
}

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const

const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0)

function leftRotate32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

/**
 * Pure-JS RFC 1321 MD5 implementation over UTF-8 bytes.
 * Required by Baidu Translate API signing because WebCrypto forbids MD5.
 */
export function md5Hex(input: string): string {
  const utf8 = new TextEncoder().encode(input)
  const bitLen = utf8.length * 8
  const paddedLen = (((utf8.length + 8) >> 6) + 1) << 6
  const buffer = new Uint8Array(paddedLen)
  buffer.set(utf8)
  buffer[utf8.length] = 0x80

  const view = new DataView(buffer.buffer)
  view.setUint32(paddedLen - 8, bitLen >>> 0, true)
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true)

  let a0 = 0x67452301
  let b0 = 0xEFCDAB89
  let c0 = 0x98BADCFE
  let d0 = 0x10325476

  const words = new Uint32Array(16)
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let j = 0; j < 16; j += 1) {
      words[j] = view.getUint32(offset + j * 4, true)
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i += 1) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      }
      else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      }
      else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      }
      else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }

      const nextD = d
      d = c
      c = b
      const sum = (a + f + (MD5_K[i] ?? 0) + (words[g] ?? 0)) >>> 0
      b = (b + leftRotate32(sum, MD5_SHIFTS[i] ?? 0)) >>> 0
      a = nextD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const digest = new Uint8Array(16)
  const digestView = new DataView(digest.buffer)
  digestView.setUint32(0, a0, true)
  digestView.setUint32(4, b0, true)
  digestView.setUint32(8, c0, true)
  digestView.setUint32(12, d0, true)

  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

export class BaiduTranslateProvider implements TranslationProvider {
  readonly id = 'baidu'
  readonly name = '百度翻译'
  readonly type = 'api'
  enabled = false

  config: BaiduConfig = {
    appId: '',
    secretKey: '',
    apiUrl: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
  }

  private generateSign(query: string, salt: string): string {
    const { appId, secretKey } = this.config
    return md5Hex(`${appId}${query}${salt}${secretKey}`)
  }

  private mapLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      zh: 'zh',
      en: 'en',
      ja: 'jp',
      ko: 'kor',
      fr: 'fra',
      de: 'de',
      es: 'spa',
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
        throw new Error(urlCheck.error || '百度翻译 API URL 无效')
      }

      const salt = Date.now().toString()
      const sign = this.generateSign(text, salt)

      const params = new URLSearchParams({
        q: text,
        from: this.mapLanguageCode(from || 'auto'),
        to: this.mapLanguageCode(to),
        appid: this.config.appId,
        salt,
        sign,
      })

      const response = await getPluginNetworkClient().request<any>({
        method: 'POST',
        url: urlCheck.normalized,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        responseType: 'json',
      })
      const data = response.data

      if (data.error_code) {
        throw new Error(`百度翻译错误: ${data.error_msg || data.error_code}`)
      }

      const translatedText = data.trans_result?.[0]?.dst || text

      return {
        text: translatedText,
        sourceLanguage: data.from || from || 'auto',
        targetLanguage: to,
        provider: this.name,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error(`百度翻译失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
}
