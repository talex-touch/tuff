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
  IntelligenceMessage,
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
import { useIntelligenceSdk } from './use-intelligence-sdk'

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
    chatLangChain: (params: {
      messages: IntelligenceMessage[]
      providerId?: string
      model?: string
      promptTemplate?: string
      promptVariables?: Record<string, any>
      metadata?: Record<string, any>
    }) => Promise<IntelligenceInvokeResult<string>>
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
/**
 * @deprecated 请优先使用 useIntelligenceSdk() 直接调用 domain SDK。
 */
export function useIntelligence(_options: UseIntelligenceOptions = {}): IntelligenceComposable {
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const intelligenceSdk = useIntelligenceSdk()

  async function withLoadingState<T>(operation: () => Promise<T>): Promise<T> {
    isLoading.value = true
    lastError.value = null

    try {
      return await operation()
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

  const invokeCapability = <T = unknown>(
    capabilityId: string,
    payload: unknown,
    options?: IntelligenceInvokeOptions,
  ) => withLoadingState(() => intelligenceSdk.invoke<T>(capabilityId, payload, options))

  return {
    invoke: <T = any>(capabilityId: string, payload: any, options?: IntelligenceInvokeOptions) =>
      withLoadingState(() => intelligenceSdk.invoke<T>(capabilityId, payload, options)),

    testProvider: (config: IntelligenceProviderConfig) =>
      withLoadingState(() =>
        intelligenceSdk.testProvider(config) as Promise<{
          success: boolean
          message: string
          latency?: number
          timestamp: number
        }>,
      ),

    testCapability: (params: { capabilityId: string, providerId?: string, userInput?: string, source?: any }) =>
      withLoadingState(() =>
        intelligenceSdk.testCapability(params) as Promise<{
          ok: boolean
          result: any
        }>,
      ),

    getCapabilityTestMeta: (params: { capabilityId: string }) =>
      intelligenceSdk.getCapabilityTestMeta(params) as Promise<{
        requiresUserInput: boolean
        inputHint: string
      }>,

    text: {
      chat: (payload: IntelligenceChatPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<string>('text.chat', payload, options),

      chatLangChain: params =>
        withLoadingState(() => intelligenceSdk.chatLangChain(params)),

      translate: (payload: IntelligenceTranslatePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<string>('text.translate', payload, options),

      summarize: (payload: IntelligenceSummarizePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<string>('text.summarize', payload, options),

      rewrite: (payload: IntelligenceRewritePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<string>('text.rewrite', payload, options),

      grammarCheck: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceGrammarCheckResult>('text.grammar', payload, options),
    },

    embedding: {
      generate: (payload: IntelligenceEmbeddingPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<number[]>('embedding.generate', payload, options),
    },

    code: {
      generate: (payload: IntelligenceCodeGeneratePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceCodeGenerateResult>('code.generate', payload, options),

      explain: (payload: IntelligenceCodeExplainPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceCodeExplainResult>('code.explain', payload, options),

      review: (payload: IntelligenceCodeReviewPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceCodeReviewResult>('code.review', payload, options),

      refactor: (payload: IntelligenceCodeRefactorPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceCodeRefactorResult>('code.refactor', payload, options),

      debug: (payload: IntelligenceCodeDebugPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceCodeDebugResult>('code.debug', payload, options),
    },

    analysis: {
      detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceIntentDetectResult>('intent.detect', payload, options),

      analyzeSentiment: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceSentimentAnalyzeResult>('sentiment.analyze', payload, options),

      extractContent: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceContentExtractResult>('content.extract', payload, options),

      extractKeywords: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceKeywordsExtractResult>('keywords.extract', payload, options),

      classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceClassificationResult>('text.classify', payload, options),
    },

    vision: {
      ocr: (payload: IntelligenceVisionOcrPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceVisionOcrResult>('vision.ocr', payload, options),

      caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceImageCaptionResult>('image.caption', payload, options),

      analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceImageAnalyzeResult>('image.analyze', payload, options),

      generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceImageGenerateResult>('image.generate', payload, options),
    },

    rag: {
      query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceRAGQueryResult>('rag.query', payload, options),

      semanticSearch: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceSemanticSearchResult>('search.semantic', payload, options),

      rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceRerankResult>('search.rerank', payload, options),
    },

    agent: {
      run: (payload: IntelligenceAgentPayload, options?: IntelligenceInvokeOptions) =>
        invokeCapability<IntelligenceAgentResult>('agent.run', payload, options),
    },

    isLoading,
    lastError,
  }
}
