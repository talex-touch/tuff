import type { Ref } from 'vue'
import type {
  AiChatPayload,
  AiEmbeddingPayload,
  AiInvokeOptions,
  AiInvokeResult,
  AiProviderConfig,
  AiVisionOcrPayload,
  AiVisionOcrResult,
} from '../../types/intelligence'
import { ref } from 'vue'
import { useChannel } from './use-channel'

interface UseIntelligenceOptions {
  // Reserved for future options
}

interface IntelligenceComposable {
  // Core invoke functions
  invoke: <T = any>(
    capabilityId: string,
    payload: any,
    options?: AiInvokeOptions,
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
    userInput?: string
    source?: any
  }) => Promise<{
    ok: boolean
    result: any
  }>

  // Get capability test metadata
  getCapabilityTestMeta: (params: {
    capabilityId: string
  }) => Promise<{
    requiresUserInput: boolean
    inputHint: string
  }>

  // Convenient text methods
  text: {
    chat: (payload: AiChatPayload, options?: AiInvokeOptions) => Promise<AiInvokeResult<string>>
    translate: (payload: { text: string, sourceLang?: string, targetLang: string }, options?: AiInvokeOptions) => Promise<AiInvokeResult<string>>
    summarize: (payload: { text: string, maxLength?: number, style?: 'concise' | 'detailed' | 'bullet-points' }, options?: AiInvokeOptions) => Promise<AiInvokeResult<string>>
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
 * Intelligence Composable for Vue components
 *
 * Provides a reactive interface to the Intelligence module through channel communication
 *
 * @example
 * ```ts
 * const { invoke, text, isLoading, lastError } = useIntelligence()
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
export function useIntelligence(_options: UseIntelligenceOptions = {}): IntelligenceComposable {
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
    payload: any,
  ): Promise<T> {
    const response = await channel.send<any, ChannelResponse<T>>(eventName, payload)
    if (!response?.ok) {
      throw new Error(response?.error || 'Intelligence request failed')
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
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      lastError.value = errorMessage
      throw error
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    // Core invoke
    invoke: <T = any>(capabilityId: string, payload: any, options?: AiInvokeOptions) =>
      withLoadingState(() =>
        sendChannelRequest<AiInvokeResult<T>>('intelligence:invoke', { capabilityId, payload, options }),
      ),

    // Provider testing
    testProvider: (config: AiProviderConfig) =>
      withLoadingState(() =>
        sendChannelRequest<{
          success: boolean
          message: string
          latency?: number
          timestamp: number
        }>('intelligence:test-provider', { provider: config }),
      ),

    // Capability testing
    testCapability: (params: { capabilityId: string, providerId?: string, userInput?: string, source?: any }) =>
      withLoadingState(() =>
        sendChannelRequest<{
          ok: boolean
          result: any
        }>('intelligence:test-capability', params),
      ),

    // Get capability test metadata
    getCapabilityTestMeta: (params: { capabilityId: string }) =>
      sendChannelRequest<{
        requiresUserInput: boolean
        inputHint: string
      }>('intelligence:get-capability-test-meta', params),

    // Convenient text methods
    text: {
      chat: (payload: AiChatPayload, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.chat',
            payload,
            options,
          }),
        ),

      translate: (payload: { text: string, sourceLang?: string, targetLang: string }, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.translate',
            payload,
            options,
          }),
        ),

      summarize: (payload: { text: string, maxLength?: number, style?: 'concise' | 'detailed' | 'bullet-points' }, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.summarize',
            payload,
            options,
          }),
        ),
    },

    // Convenient embedding methods
    embedding: {
      generate: (payload: AiEmbeddingPayload, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<number[]>>('intelligence:invoke', {
            capabilityId: 'embedding.generate',
            payload,
            options,
          }),
        ),
    },

    // Convenient vision methods
    vision: {
      ocr: (payload: AiVisionOcrPayload, options?: AiInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<AiInvokeResult<AiVisionOcrResult>>('intelligence:invoke', {
            capabilityId: 'vision.ocr',
            payload,
            options,
          }),
        ),
    },

    // Reactive state
    isLoading,
    lastError,
  }
}
