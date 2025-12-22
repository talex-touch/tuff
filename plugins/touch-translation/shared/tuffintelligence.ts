import type { IntelligenceTranslatePayload } from '@talex-touch/utils'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence'
import { intelligence } from '@talex-touch/utils/plugin/sdk'

export interface TuffIntelligenceTranslateResponse {
  text: string
  provider?: string
  model?: string
}

export async function tuffIntelligenceTranslate(payload: IntelligenceTranslatePayload): Promise<TuffIntelligenceTranslateResponse> {
  const hasRendererChannel = typeof window !== 'undefined' && Boolean((window as any)?.$channel)

  const response = hasRendererChannel
    ? await intelligence.invoke<string>('text.translate', payload)
    : await createIntelligenceClient().invoke<string>('text.translate', payload)

  return {
    text: response.result,
    provider: (response as any).provider,
    model: (response as any).model,
  }
}
