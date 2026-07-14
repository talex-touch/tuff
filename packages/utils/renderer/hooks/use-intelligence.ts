import type { Ref } from 'vue'
import type {
  IntelligenceAgentPayload,
  IntelligenceAgentResult,
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
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
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceImageTranslateE2ePayload,
  IntelligenceImageTranslateE2eResult,
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
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceSummarizePayload,
  IntelligenceTranslatePayload,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceTtsSpeakPayload,
  IntelligenceTtsSpeakResult,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
  PromptWorkflowExecution,
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
    grammar: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceGrammarCheckResult>>
    grammarCheck: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceGrammarCheckResult>>
    classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceClassificationResult>>
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

  // Legacy analysis aliases
  analysis: {
    detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceIntentDetectResult>>
    analyzeSentiment: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>>
    extractContent: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceContentExtractResult>>
    extractKeywords: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>>
    classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceClassificationResult>>
  }

  // Current analysis domain methods
  intent: {
    detect: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceIntentDetectResult>>
  }
  sentiment: {
    analyze: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>>
  }
  content: {
    extract: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceContentExtractResult>>
  }
  keywords: {
    extract: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>>
  }

  // Legacy vision aliases
  vision: {
    ocr: (payload: IntelligenceVisionOcrPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>>
    caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>>
    analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>>
    generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>>
  }

  // Current image domain methods
  image: {
    caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>>
    analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>>
    generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>>
    translateE2e: (payload: IntelligenceImageTranslateE2ePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageTranslateE2eResult>>
    edit: (payload: IntelligenceImageEditPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageEditResult>>
  }

  // Audio methods
  audio: {
    tts: (payload: IntelligenceTTSPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceTTSResult>>
    stt: (payload: IntelligenceSTTPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSTTResult>>
    transcribe: (payload: IntelligenceAudioTranscribePayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>>
    ttsSpeak: (payload: IntelligenceTtsSpeakPayload) => Promise<IntelligenceTtsSpeakResult>
  }

  // Legacy RAG aliases
  rag: {
    query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRAGQueryResult>>
    semanticSearch: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSemanticSearchResult>>
    rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRerankResult>>
  }

  // Current search domain methods
  search: {
    semantic: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSemanticSearchResult>>
    rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRerankResult>>
  }

  // Workflow methods
  workflow: {
    execute: (payload: unknown, options?: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<PromptWorkflowExecution>>
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
        withLoadingState(() => intelligenceSdk.text.chat(payload, options)),

      chatLangChain: params =>
        withLoadingState(() => intelligenceSdk.chatLangChain(params)),

      translate: (payload: IntelligenceTranslatePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.translate(payload, options)),

      summarize: (payload: IntelligenceSummarizePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.summarize(payload, options)),

      rewrite: (payload: IntelligenceRewritePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.rewrite(payload, options)),

      grammar: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.grammar(payload, options)),

      grammarCheck: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.grammar(payload, options)),

      classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.classify(payload, options)),
    },

    embedding: {
      generate: (payload: IntelligenceEmbeddingPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.embedding.generate(payload, options)),
    },

    code: {
      generate: (payload: IntelligenceCodeGeneratePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.code.generate(payload, options)),

      explain: (payload: IntelligenceCodeExplainPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.code.explain(payload, options)),

      review: (payload: IntelligenceCodeReviewPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.code.review(payload, options)),

      refactor: (payload: IntelligenceCodeRefactorPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.code.refactor(payload, options)),

      debug: (payload: IntelligenceCodeDebugPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.code.debug(payload, options)),
    },

    analysis: {
      detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.intent.detect(payload, options)),

      analyzeSentiment: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.sentiment.analyze(payload, options)),

      extractContent: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.content.extract(payload, options)),

      extractKeywords: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.keywords.extract(payload, options)),

      classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.text.classify(payload, options)),
    },

    intent: {
      detect: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.intent.detect(payload, options)),
    },

    sentiment: {
      analyze: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.sentiment.analyze(payload, options)),
    },

    content: {
      extract: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.content.extract(payload, options)),
    },

    keywords: {
      extract: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.keywords.extract(payload, options)),
    },

    vision: {
      ocr: (payload: IntelligenceVisionOcrPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.vision.ocr(payload, options)),

      caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.caption(payload, options)),

      analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.analyze(payload, options)),

      generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.generate(payload, options)),
    },

    image: {
      caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.caption(payload, options)),

      analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.analyze(payload, options)),

      generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.generate(payload, options)),

      translateE2e: (payload: IntelligenceImageTranslateE2ePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.translateE2e(payload, options)),

      edit: (payload: IntelligenceImageEditPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.image.edit(payload, options)),
    },

    audio: {
      tts: (payload: IntelligenceTTSPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.audio.tts(payload, options)),

      stt: (payload: IntelligenceSTTPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.audio.stt(payload, options)),

      transcribe: (payload: IntelligenceAudioTranscribePayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.audio.transcribe(payload, options)),

      ttsSpeak: (payload: IntelligenceTtsSpeakPayload) =>
        withLoadingState(() => intelligenceSdk.ttsSpeak(payload)),
    },

    rag: {
      query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.rag.query(payload, options)),

      semanticSearch: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.search.semantic(payload, options)),

      rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.search.rerank(payload, options)),
    },

    search: {
      semantic: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.search.semantic(payload, options)),

      rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.search.rerank(payload, options)),
    },

    workflow: {
      execute: (payload: unknown, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.workflow.execute(payload, options)),
    },

    agent: {
      run: (payload: IntelligenceAgentPayload, options?: IntelligenceInvokeOptions) =>
        withLoadingState(() => intelligenceSdk.agent.run(payload, options)),
    },

    isLoading,
    lastError,
  }
}
