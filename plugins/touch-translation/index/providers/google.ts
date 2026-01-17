import type { TranslationProvider, TranslationResult } from '../types'

export class GoogleProvider implements TranslationProvider {
  id = 'google'
  name = 'Google Translate'

  async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
    const { http, URLSearchParams } = globalThis as any

    try {
      const params = new URLSearchParams({
        client: 'gtx',
        sl: from,
        tl: to,
        dt: 't',
        q: text,
      })

      const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`

      const response = await http.get(url, {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      const data = response.data || response

      if (!data || !Array.isArray(data) || !data[0]) {
        throw new Error('Invalid response format')
      }

      let translatedText = ''
      if (Array.isArray(data[0])) {
        translatedText = data[0].map((item: any) => (item && item[0] ? item[0] : '')).join('')
      }
      else {
        translatedText = data[0] || text
      }

      const detectedLang = data[2] || from

      return {
        text: translatedText.trim() || text,
        from: detectedLang,
        to,
        service: this.id,
      }
    }
    catch (error) {
      return {
        text: `[Translation Failed] ${text}`,
        from,
        to,
        service: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
