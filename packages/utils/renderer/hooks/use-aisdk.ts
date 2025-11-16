import { ref, type Ref } from 'vue'
import type {
  AiInvokeOptions,
  AiInvokeResult,
  AiProviderConfig,
  AiChatPayload,
  AiEmbeddingPayload,
  AiVisionOcrPayload,
  AiVisionOcrResult
} from '../../types/aisdk'
import { useChannel } from './use-channel'

interface UseAiSDKOptions {
  // Reserved for future options
}

interface AiSDKComposable {
  // Core invoke functions
  invoke: <T = any>(
    capabilityId: string,
    payload: any,
    options?: AiInvokeOptions
  ) => Promise<AiInvokeResult<T>>

  // Provider testing
  testProvider: (config: AiProviderConfig) => Promise<{
    success: boolean
    message: string
    latency?: number
    timestamp: number
  }>

  // Capability testing
  testCapability: (params: {
    capabilityId: string
    providerId?: string
    source?: any
  }) => Promise<{
    ok: boolean
    result: any
  }>

  // Convenient text methods
  text: {
    chat: (payload: AiChatPayload, options?: AiInvokeOptions) => Promise<AiInvokeResult<string>>
    translate: (payload: { text: string; sourceLang?: string; targetLang: string }, options?: AiInvokeOptions) => Promise<AiInvokeResult<string>>
    summarize: (payload: { text: string; maxLength?: number; style?: 'concise' | 'detailed' | 'bullet-points' }, options?: AiInvokeOptions) => Promise<AiInvokeResult<string>>
  }

  // Convenient embedding methods
  embedding: {
    generate: (payload: AiEmbeddingPayload, options?: AiInvokeOptions) => Promise<AiInvokeResult<number[]>>
  }

  // Convenient vision methods
  vision: {
    ocr: (payload: AiVisionOcrPayload, options?: AiInvokeOptions) => Promise<AiInvokeResult<AiVisionOcrResult>>
  }

  // Loading state
  isLoading: Ref<boolean>
  lastError: Ref<string | null>
}

/**
 * AI SDK Composable for Vue components
 *
 * Provides a reactive interface to the Intelligence module through channel communication
 *
 * @example
 * ```ts
 * const { invoke, text, isLoading, lastError } = useAiSDK()
 *
 * // Basic invoke
 * const result = await invoke('text.chat', {
 *   messages: [{ role: 'user', content: 'Hello' }]
 * })
 *
 * // Convenient text chat
 * const chatResult = await text.chat({
 *   messages: [{ role: 'user', content: 'Hello' }]
 * })
 *
 * // With loading state
 * watch(isLoading, (loading) => {
 *   if (loading) console.log('AI request in progress...')
 * })
 * ```
 */
export function useAiSDK(_options: UseAiSDKOptions = {}): AiSDKComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  // Get the TouchChannel instance
  const channel = useChannel()

  // Helper for consistent response handling
  interface ChannelResponse<T> {
    ok: boolean
    result?: T
    error?: string
  }

  async function sendChannelRequest<T>(
    eventName: string,
    payload: any
  ): Promise<T> {
    const response = await channel.send<any, ChannelResponse<T>>(eventName, payload)
    if (!response?.ok) {
      throw new Error(response?.error || 'AI SDK request failed')
    }
    return response.result as T
  }

  // Wrapper function that handles loading state and errors
  async function withLoadingState<T>(operation: () => Promise<T>): Promise<T> {
    isLoading.value = true
    lastError.value = null

    try {
      const result = await operation()
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      lastError.value = errorMessage
      throw error
    } finally {
      isLoading.value = false
    }
  }

  return {
    // Core invoke
    invoke: <T = any>(capabilityId: string, payload: any, options?: AiInvokeOptions) =>
      withLoadingState(() =>
        sendChannelRequest<AiInvokeResult<T>>('aisdk:invoke', { capabilityId, payload, options })
      ),

    // Provider testing
    testProvider: (config: AiProviderConfig) =>
      withLoadingState(() =>
        sendChannelRequest<{
          success: boolean
          message: string
          latency?: number
          timestamp: number
        }>('aisdk:test-provider', { provider: config })
      ),

    // Capability testing
    testCapability: (params: { capabilityId: string; providerId?: string; source?: any }) =>
      withLoadingState(() =>
        sendChannelRequest<{
          ok: boolean
          result: any
        }>('aisdk:test-capability', params)
      ),

    // Convenient text methods
    text: {
      chat: (payload: AiChatPayload, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<string>>('aisdk:invoke', {
            capabilityId: 'text.chat',
            payload,
            options
          })
        ),

      translate: (payload: { text: string; sourceLang?: string; targetLang: string }, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<string>>('aisdk:invoke', {
            capabilityId: 'text.translate',
            payload,
            options
          })
        ),

      summarize: (payload: { text: string; maxLength?: number; style?: 'concise' | 'detailed' | 'bullet-points' }, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<string>>('aisdk:invoke', {
            capabilityId: 'text.summarize',
            payload,
            options
          })
        )
    },

    // Convenient embedding methods
    embedding: {
      generate: (payload: AiEmbeddingPayload, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<number[]>>('aisdk:invoke', {
            capabilityId: 'embedding.generate',
            payload,
            options
          })
        )
    },

    // Convenient vision methods
    vision: {
      ocr: (payload: AiVisionOcrPayload, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<AiVisionOcrResult>>('aisdk:invoke', {
            capabilityId: 'vision.ocr',
            payload,
            options
          })
        )
    },

    // Reactive state
    isLoading,
    lastError
  }
}