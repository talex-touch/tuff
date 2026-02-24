import type { IntelligenceTranslatePayload } from '@talex-touch/utils'
import { hasWindow } from '@talex-touch/utils/env'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence'

export interface TuffIntelligenceTranslateResponse {
  text: string
  provider?: string
  model?: string
}

function withSdkApi(payload: unknown): unknown {
  if (!hasWindow()) {
    return payload
  }

  const sdkapi = (window as any)?.$plugin?.sdkapi
  if (typeof sdkapi !== 'number' || !payload || typeof payload !== 'object') {
    return payload
  }

  return {
    ...(payload as Record<string, unknown>),
    _sdkapi: sdkapi,
  }
}

let rendererIntelligenceClient: ReturnType<typeof createIntelligenceClient> | null = null
let runtimeIntelligenceClient: ReturnType<typeof createIntelligenceClient> | null = null

function getIntelligenceClient() {
  if (hasWindow()) {
    if (!rendererIntelligenceClient) {
      const channel = (window as any)?.$channel
      if (channel && typeof channel.send === 'function') {
        rendererIntelligenceClient = createIntelligenceClient({
          send: (eventName, payload) => channel.send(eventName, withSdkApi(payload)),
        })
      }
      else {
        rendererIntelligenceClient = createIntelligenceClient()
      }
    }
    return rendererIntelligenceClient
  }

  if (!runtimeIntelligenceClient) {
    runtimeIntelligenceClient = createIntelligenceClient()
  }
  return runtimeIntelligenceClient
}

export async function tuffIntelligenceTranslate(payload: IntelligenceTranslatePayload): Promise<TuffIntelligenceTranslateResponse> {
  const response = await getIntelligenceClient().invoke<string>('text.translate', payload)

  return {
    text: response.result,
    provider: (response as any).provider,
    model: (response as any).model,
  }
}
