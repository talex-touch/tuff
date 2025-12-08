import type { Ref } from 'vue'
import type {
  IntelligenceAgentPayload,
  IntelligenceAgentResult,
  IntelligenceChatPayload,
  IntelligenceClassificationPayload,
  IntelligenceClassificationResult,
  IntelligenceCodeDebugPayload,
  IntelligenceCodeDebugResult,
  IntelligenceCodeExplainPayload,
  IntelligenceCodeExplainResult,
  IntelligenceCodeGeneratePayload,
  IntelligenceCodeGenerateResult,
  IntelligenceCodeRefactorPayload,
  IntelligenceCodeRefactorResult,
  IntelligenceCodeReviewPayload,
  IntelligenceCodeReviewResult,
  IntelligenceContentExtractPayload,
  IntelligenceContentExtractResult,
  IntelligenceEmbeddingPayload,
  IntelligenceGrammarCheckPayload,
  IntelligenceGrammarCheckResult,
  IntelligenceImageAnalyzePayload,
  IntelligenceImageAnalyzeResult,
  IntelligenceImageCaptionPayload,
  IntelligenceImageCaptionResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceIntentDetectPayload,
  IntelligenceIntentDetectResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceKeywordsExtractPayload,
  IntelligenceKeywordsExtractResult,
  IntelligenceProviderConfig,
  IntelligenceRAGQueryPayload,
  IntelligenceRAGQueryResult,
  IntelligenceRerankPayload,
  IntelligenceRerankResult,
  IntelligenceRewritePayload,
  IntelligenceSemanticSearchPayload,
  IntelligenceSemanticSearchResult,
  IntelligenceSentimentAnalyzePayload,
  IntelligenceSentimentAnalyzeResult,
  IntelligenceSummarizePayload,
  IntelligenceTranslatePayload,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
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
    options?: IntelligenceInvokeOptions,
  ) => Promise<IntelligenceInvokeResult<T>>

  // Provider testing
  testProvider: (config: IntelligenceProviderConfig) => Promise<{
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

  // Text methods
  text: {
    chat: (payload: IntelligenceChatPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
    translate: (payload: IntelligenceTranslatePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
    summarize: (payload: IntelligenceSummarizePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
    rewrite: (payload: IntelligenceRewritePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
    grammarCheck: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceGrammarCheckResult>>
  }

  // Embedding methods
  embedding: {
    generate: (payload: IntelligenceEmbeddingPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<number[]>>
  }

  // Code methods
  code: {
    generate: (payload: IntelligenceCodeGeneratePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeGenerateResult>>
    explain: (payload: IntelligenceCodeExplainPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeExplainResult>>
    review: (payload: IntelligenceCodeReviewPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeReviewResult>>
    refactor: (payload: IntelligenceCodeRefactorPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeRefactorResult>>
    debug: (payload: IntelligenceCodeDebugPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeDebugResult>>
  }

  // Analysis methods
  analysis: {
    detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceIntentDetectResult>>
    analyzeSentiment: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>>
    extractContent: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceContentExtractResult>>
    extractKeywords: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>>
    classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceClassificationResult>>
  }

  // Vision methods
  vision: {
    ocr: (payload: IntelligenceVisionOcrPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>>
    caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>>
    analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>>
    generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>>
  }

  // RAG methods
  rag: {
    query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRAGQueryResult>>
    semanticSearch: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSemanticSearchResult>>
    rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRerankResult>>
  }

  // Agent methods
  agent: {
    run: (payload: IntelligenceAgentPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceAgentResult>>
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
    invoke: <T = any>(capabilityId: string, payload: any, options?: IntelligenceInvokeOptions) =>
      withLoadingState(() =>
        sendChannelRequest<IntelligenceInvokeResult<T>>('intelligence:invoke', { capabilityId, payload, options }),
      ),

    // Provider testing
    testProvider: (config: IntelligenceProviderConfig) =>
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

    // Text methods
    text: {
      chat: (payload: IntelligenceChatPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.chat',
            payload,
            options,
          }),
        ),

      translate: (payload: IntelligenceTranslatePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.translate',
            payload,
            options,
          }),
        ),

      summarize: (payload: IntelligenceSummarizePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.summarize',
            payload,
            options,
          }),
        ),

      rewrite: (payload: IntelligenceRewritePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<string>>('intelligence:invoke', {
            capabilityId: 'text.rewrite',
            payload,
            options,
          }),
        ),

      grammarCheck: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceGrammarCheckResult>>('intelligence:invoke', {
            capabilityId: 'text.grammar',
            payload,
            options,
          }),
        ),
    },

    // Embedding methods
    embedding: {
      generate: (payload: IntelligenceEmbeddingPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<number[]>>('intelligence:invoke', {
            capabilityId: 'embedding.generate',
            payload,
            options,
          }),
        ),
    },

    // Code methods
    code: {
      generate: (payload: IntelligenceCodeGeneratePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceCodeGenerateResult>>('intelligence:invoke', {
            capabilityId: 'code.generate',
            payload,
            options,
          }),
        ),

      explain: (payload: IntelligenceCodeExplainPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceCodeExplainResult>>('intelligence:invoke', {
            capabilityId: 'code.explain',
            payload,
            options,
          }),
        ),

      review: (payload: IntelligenceCodeReviewPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceCodeReviewResult>>('intelligence:invoke', {
            capabilityId: 'code.review',
            payload,
            options,
          }),
        ),

      refactor: (payload: IntelligenceCodeRefactorPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceCodeRefactorResult>>('intelligence:invoke', {
            capabilityId: 'code.refactor',
            payload,
            options,
          }),
        ),

      debug: (payload: IntelligenceCodeDebugPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceCodeDebugResult>>('intelligence:invoke', {
            capabilityId: 'code.debug',
            payload,
            options,
          }),
        ),
    },

    // Analysis methods
    analysis: {
      detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceIntentDetectResult>>('intelligence:invoke', {
            capabilityId: 'intent.detect',
            payload,
            options,
          }),
        ),

      analyzeSentiment: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>>('intelligence:invoke', {
            capabilityId: 'sentiment.analyze',
            payload,
            options,
          }),
        ),

      extractContent: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceContentExtractResult>>('intelligence:invoke', {
            capabilityId: 'content.extract',
            payload,
            options,
          }),
        ),

      extractKeywords: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>>('intelligence:invoke', {
            capabilityId: 'keywords.extract',
            payload,
            options,
          }),
        ),

      classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceClassificationResult>>('intelligence:invoke', {
            capabilityId: 'text.classify',
            payload,
            options,
          }),
        ),
    },

    // Vision methods
    vision: {
      ocr: (payload: IntelligenceVisionOcrPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceVisionOcrResult>>('intelligence:invoke', {
            capabilityId: 'vision.ocr',
            payload,
            options,
          }),
        ),

      caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceImageCaptionResult>>('intelligence:invoke', {
            capabilityId: 'image.caption',
            payload,
            options,
          }),
        ),

      analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>>('intelligence:invoke', {
            capabilityId: 'image.analyze',
            payload,
            options,
          }),
        ),

      generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceImageGenerateResult>>('intelligence:invoke', {
            capabilityId: 'image.generate',
            payload,
            options,
          }),
        ),
    },

    // RAG methods
    rag: {
      query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceRAGQueryResult>>('intelligence:invoke', {
            capabilityId: 'rag.query',
            payload,
            options,
          }),
        ),

      semanticSearch: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceSemanticSearchResult>>('intelligence:invoke', {
            capabilityId: 'search.semantic',
            payload,
            options,
          }),
        ),

      rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceRerankResult>>('intelligence:invoke', {
            capabilityId: 'search.rerank',
            payload,
            options,
          }),
        ),
    },

    // Agent methods
    agent: {
      run: (payload: IntelligenceAgentPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() =>
          sendChannelRequest<IntelligenceInvokeResult<IntelligenceAgentResult>>('intelligence:invoke', {
            capabilityId: 'agent.run',
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
