import type { VoiceProviderAdapter, VoiceProviderRegistry, VoiceRecognitionMode } from './contracts'
import { VoiceProviderError } from './contracts'

export * from './async'
export * from './contracts'
export * from './http'
export * from './node-ws'
export * from './protocol/bailian-paraformer'
export * from './protocol/doubao'
export * from './protocol/qwen-asr-realtime'
export * from './providers/bailian-paraformer'
export * from './providers/dashscope-qwen-asr-realtime'
export * from './providers/doubao'
export * from './socket-session'
export * from './upload-source'

export function createVoiceProviderRegistry(providers: readonly VoiceProviderAdapter[] = []): VoiceProviderRegistry {
  const entries = new Map<string, VoiceProviderAdapter>()
  for (const provider of providers) {
    if (entries.has(provider.id)) {
      throw new VoiceProviderError('VOICE_PROVIDER_DUPLICATE', `Voice provider id is duplicated: ${provider.id}`)
    }
    entries.set(provider.id, provider)
  }
  return {
    register(provider) {
      if (entries.has(provider.id)) {
        throw new VoiceProviderError('VOICE_PROVIDER_DUPLICATE', `Voice provider id is duplicated: ${provider.id}`)
      }
      entries.set(provider.id, provider)
    },
    get(id) {
      return entries.get(id)
    },
    list() {
      return [...entries.values()]
    },
    resolve(mode: VoiceRecognitionMode, preferredId?: string) {
      const provider = preferredId ? entries.get(preferredId) : undefined
      if (provider && supportsMode(provider, mode))
        return provider
      if (preferredId && !provider) {
        throw new VoiceProviderError('VOICE_PROVIDER_NOT_FOUND', `Voice provider is not configured: ${preferredId}`)
      }
      const fallback = [...entries.values()].find(entry => supportsMode(entry, mode))
      if (!fallback) {
        throw new VoiceProviderError('VOICE_PROVIDER_UNAVAILABLE', `No voice provider supports ${mode}.`)
      }
      return fallback
    },
  }
}

function supportsMode(provider: VoiceProviderAdapter, mode: VoiceRecognitionMode): boolean {
  return mode === 'upload' ? provider.capabilities.upload : provider.capabilities.stream
}
