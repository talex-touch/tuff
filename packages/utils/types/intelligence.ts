import { NEXUS_BASE_URL } from '../env'

/**
 * Supported intelligence provider types.
 */
export enum IntelligenceProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom',
}

/**
 * Intelligence capability types for various AI operations.
 */
export enum IntelligenceCapabilityType {
  // Text capabilities
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  SUMMARIZE = 'summarize',
  TRANSLATE = 'translate',
  REWRITE = 'rewrite',
  GRAMMAR_CHECK = 'grammar-check',
  // Code capabilities
  CODE_GENERATE = 'code-generate',
  CODE_EXPLAIN = 'code-explain',
  CODE_REVIEW = 'code-review',
  CODE_REFACTOR = 'code-refactor',
  CODE_DEBUG = 'code-debug',
  // Analysis capabilities
  INTENT_DETECT = 'intent-detect',
  SENTIMENT_ANALYZE = 'sentiment-analyze',
  CONTENT_EXTRACT = 'content-extract',
  KEYWORDS_EXTRACT = 'keywords-extract',
  CLASSIFICATION = 'classification',
  // Audio capabilities
  TTS = 'tts',
  STT = 'stt',
  AUDIO_TRANSCRIBE = 'audio-transcribe',
  // Vision capabilities
  VISION = 'vision',
  VISION_OCR = 'vision-ocr',
  IMAGE_CAPTION = 'image-caption',
  IMAGE_ANALYZE = 'image-analyze',
  IMAGE_GENERATE = 'image-generate',
  IMAGE_EDIT = 'image-edit',
  // RAG & Search capabilities
  RAG_QUERY = 'rag-query',
  SEMANTIC_SEARCH = 'semantic-search',
  RERANK = 'rerank',
  // Workflow capabilities
  WORKFLOW = 'workflow',
  AGENT = 'agent',
}

/**
 * Rate limit configuration for an intelligence provider.
 */
export interface IntelligenceProviderRateLimit {
  /** Maximum requests allowed per minute. */
  requestsPerMinute?: number
  /** Maximum requests allowed per day. */
  requestsPerDay?: number
  /** Maximum tokens allowed per minute. */
  tokensPerMinute?: number
  /** Maximum tokens allowed per day. */
  tokensPerDay?: number
}

/**
 * Image source configuration for vision capabilities.
 */
export interface IntelligenceVisionImageSource {
  /** Source type: data URL, file path, or base64 encoded. */
  type: 'data-url' | 'file' | 'base64'
  /** Data URL of the image. */
  dataUrl?: string
  /** File path to the image. */
  filePath?: string
  /** Base64 encoded image data. */
  base64?: string
}

/**
 * OCR text block detected in an image.
 */
export interface IntelligenceVisionOcrBlock {
  /** Unique identifier for the block. */
  id?: string
  /** Detected text content. */
  text: string
  /** Detected language of the text. */
  language?: string
  /** Confidence score (0-1). */
  confidence?: number
  /** Bounding box coordinates [x, y, width, height]. */
  boundingBox?: [number, number, number, number]
  /** Polygon points for non-rectangular regions. */
  polygon?: Array<[number, number]>
  /** Block type classification. */
  type?: 'word' | 'line' | 'paragraph' | 'region'
  /** Nested child blocks. */
  children?: IntelligenceVisionOcrBlock[]
}

/**
 * Result from OCR vision capability.
 */
export interface IntelligenceVisionOcrResult {
  /** Full extracted text. */
  text: string
  /** Overall confidence score. */
  confidence?: number
  /** Detected primary language. */
  language?: string
  /** Extracted keywords for search. */
  keywords?: string[]
  /** Suggested search terms. */
  suggestions?: string[]
  /** Structured text blocks. */
  blocks?: IntelligenceVisionOcrBlock[]
  /** OCR engine identifier. */
  engine?: 'apple-vision' | 'windows-ocr' | 'cloud'
  /** OCR execution latency in milliseconds. */
  durationMs?: number
  /** Raw provider response. */
  raw?: any
}

/**
 * Payload for OCR vision capability.
 */
export interface IntelligenceVisionOcrPayload {
  /** Image source configuration. */
  source: IntelligenceVisionImageSource
  /** Expected language hint. */
  language?: string
  /** Custom prompt for OCR. */
  prompt?: string
  /** Additional metadata. */
  metadata?: Record<string, any>
  /** Include layout information. */
  includeLayout?: boolean
  /** Extract keywords from text. */
  includeKeywords?: boolean
}

/**
 * Configuration for an intelligence provider.
 */
export interface IntelligenceProviderConfig {
  /** Unique provider identifier. */
  id: string
  /** Provider type. */
  type: IntelligenceProviderType
  /** Display name. */
  name: string
  /** Whether the provider is enabled. */
  enabled: boolean
  /** API key for authentication. */
  apiKey?: string
  /** Base URL for API requests. */
  baseUrl?: string
  /** Rate limit configuration. */
  rateLimit?: IntelligenceProviderRateLimit
  /** Available models. */
  models?: string[]
  /** Default model to use. */
  defaultModel?: string
  /** System instructions. */
  instructions?: string
  /** Request timeout in milliseconds. */
  timeout?: number
  /** Provider priority for selection. */
  priority?: number
  /** Supported capability IDs. */
  capabilities?: string[]
  /** Additional metadata. */
  metadata?: Record<string, any>
}

/**
 * Chat message structure.
 */
export interface IntelligenceMessage {
  /** Message role. */
  role: 'system' | 'user' | 'assistant'
  /** Message content. */
  content: string
  /** Optional sender name. */
  name?: string
}

/**
 * Options for invoking an intelligence capability.
 */
export interface IntelligenceInvokeOptions {
  /** Strategy ID for provider selection. */
  strategy?: string
  /** Preferred models in order. */
  modelPreference?: string[]
  /** Maximum cost ceiling. */
  costCeiling?: number
  /** Target latency in milliseconds. */
  latencyTarget?: number
  /** Request timeout in milliseconds. */
  timeout?: number
  /** Enable streaming response. */
  stream?: boolean
  /** Preferred provider ID. */
  preferredProviderId?: string
  /** Allowed provider IDs. */
  allowedProviderIds?: string[]
  /** Additional metadata. */
  metadata?: Record<string, any>
  /** Mark as test run. */
  testRun?: boolean
}

/**
 * Context information for an invocation.
 */
export interface IntelligenceInvokeContext {
  /** Request source identifier. */
  source?: string
  /** User locale. */
  locale?: string
  /** User identifier. */
  userId?: string
  /** Session identifier. */
  sessionId?: string
}

/**
 * Token usage information.
 */
export interface IntelligenceUsageInfo {
  /** Tokens used in prompt. */
  promptTokens: number
  /** Tokens used in completion. */
  completionTokens: number
  /** Total tokens used. */
  totalTokens: number
  /** Estimated cost. */
  cost?: number
}

/**
 * Result from an intelligence invocation.
 * @template T - Result data type.
 */
export interface IntelligenceInvokeResult<T = any> {
  /** The result data. */
  result: T
  /** Token usage information. */
  usage: IntelligenceUsageInfo
  /** Model used for the request. */
  model: string
  /** Request latency in milliseconds. */
  latency: number
  /** Unique trace identifier. */
  traceId: string
  /** Provider that handled the request. */
  provider: string
}

/**
 * Streaming response chunk.
 */
export interface IntelligenceStreamChunk {
  /** Content delta. */
  delta: string
  /** Whether streaming is complete. */
  done: boolean
  /** Final usage info (when done). */
  usage?: IntelligenceUsageInfo
}

/**
 * Descriptor for a registered capability.
 */
export interface IntelligenceCapabilityDescriptor {
  /** Unique capability identifier. */
  id: string
  /** Capability type. */
  type: IntelligenceCapabilityType
  /** Display name. */
  name: string
  /** Description of the capability. */
  description: string
  /** JSON schema for input validation. */
  inputSchema?: any
  /** JSON schema for output validation. */
  outputSchema?: any
  /** Default strategy for provider selection. */
  defaultStrategy?: string
  /** Providers that support this capability. */
  supportedProviders: IntelligenceProviderType[]
  /** Additional metadata. */
  metadata?: Record<string, any>
}

/**
 * Payload for chat capability.
 */
export interface IntelligenceChatPayload {
  /** Conversation messages. */
  messages: IntelligenceMessage[]
  /** Invocation context. */
  context?: IntelligenceInvokeContext
  /** Sampling temperature (0-2). */
  temperature?: number
  /** Maximum tokens to generate. */
  maxTokens?: number
  /** Top-p sampling parameter. */
  topP?: number
  /** Frequency penalty (-2 to 2). */
  frequencyPenalty?: number
  /** Presence penalty (-2 to 2). */
  presencePenalty?: number
  /** Stop sequences. */
  stop?: string[]
}

/**
 * Payload for embedding generation.
 */
export interface IntelligenceEmbeddingPayload {
  /** Text to embed (single or batch). */
  text: string | string[]
  /** Specific model to use. */
  model?: string
}

/**
 * Payload for translation capability.
 */
export interface IntelligenceTranslatePayload {
  /** Text to translate. */
  text: string
  /** Source language (auto-detect if omitted). */
  sourceLang?: string
  /** Target language. */
  targetLang: string
}

/**
 * Payload for summarization capability.
 */
export interface IntelligenceSummarizePayload {
  /** Text to summarize. */
  text: string
  /** Maximum summary length. */
  maxLength?: number
  /** Summary style. */
  style?: 'concise' | 'detailed' | 'bullet-points'
}

// Legacy aliases for backward compatibility
/** @deprecated Use IntelligenceProviderType instead. */
export type AiProviderType = IntelligenceProviderType
/** @deprecated Use IntelligenceCapabilityType instead. */
export type AiCapabilityType = IntelligenceCapabilityType
/** @deprecated Use IntelligenceProviderRateLimit instead. */
export type AiProviderRateLimit = IntelligenceProviderRateLimit
/** @deprecated Use IntelligenceVisionImageSource instead. */
export type AiVisionImageSource = IntelligenceVisionImageSource
/** @deprecated Use IntelligenceVisionOcrBlock instead. */
export type AiVisionOcrBlock = IntelligenceVisionOcrBlock
/** @deprecated Use IntelligenceVisionOcrResult instead. */
export type AiVisionOcrResult = IntelligenceVisionOcrResult
/** @deprecated Use IntelligenceVisionOcrPayload instead. */
export type AiVisionOcrPayload = IntelligenceVisionOcrPayload
/** @deprecated Use IntelligenceProviderConfig instead. */
export type AiProviderConfig = IntelligenceProviderConfig
/** @deprecated Use IntelligenceMessage instead. */
export type AiMessage = IntelligenceMessage
/** @deprecated Use IntelligenceInvokeOptions instead. */
export type AiInvokeOptions = IntelligenceInvokeOptions
/** @deprecated Use IntelligenceInvokeContext instead. */
export type AiInvokeContext = IntelligenceInvokeContext
/** @deprecated Use IntelligenceUsageInfo instead. */
export type AiUsageInfo = IntelligenceUsageInfo
/** @deprecated Use IntelligenceInvokeResult instead. */
export type AiInvokeResult<T = any> = IntelligenceInvokeResult<T>
/** @deprecated Use IntelligenceStreamChunk instead. */
export type AiStreamChunk = IntelligenceStreamChunk
/** @deprecated Use IntelligenceCapabilityDescriptor instead. */
export type AiCapabilityDescriptor = IntelligenceCapabilityDescriptor
/** @deprecated Use IntelligenceChatPayload instead. */
export type AiChatPayload = IntelligenceChatPayload
/** @deprecated Use IntelligenceEmbeddingPayload instead. */
export type AiEmbeddingPayload = IntelligenceEmbeddingPayload
/** @deprecated Use IntelligenceTranslatePayload instead. */
export type AiTranslatePayload = IntelligenceTranslatePayload
/** @deprecated Use IntelligenceSummarizePayload instead. */
export type AiSummarizePayload = IntelligenceSummarizePayload

// ============================================================================
// Extended Payload Types
// ============================================================================

/**
 * Payload for text rewriting capability.
 */
export interface IntelligenceRewritePayload {
  /** Text to rewrite. */
  text: string
  /** Writing style. */
  style?: 'formal' | 'casual' | 'professional' | 'creative' | 'simplified'
  /** Tone of voice. */
  tone?: 'neutral' | 'friendly' | 'authoritative' | 'humorous'
  /** Target audience description. */
  targetAudience?: string
  /** Keywords to preserve. */
  preserveKeywords?: string[]
}

/**
 * Payload for grammar checking capability.
 */
export interface IntelligenceGrammarCheckPayload {
  /** Text to check. */
  text: string
  /** Language of the text. */
  language?: string
  /** Types of issues to check. */
  checkTypes?: ('spelling' | 'grammar' | 'punctuation' | 'style')[]
  /** Strictness level. */
  strictness?: 'lenient' | 'standard' | 'strict'
}

/**
 * Result from grammar checking capability.
 */
export interface IntelligenceGrammarCheckResult {
  /** Corrected text. */
  correctedText: string
  /** List of issues found. */
  issues: Array<{
    type: 'spelling' | 'grammar' | 'punctuation' | 'style'
    original: string
    suggestion: string
    position: { start: number, end: number }
    explanation?: string
  }>
  /** Overall score (0-100). */
  score: number
}

/**
 * Payload for code generation capability.
 */
export interface IntelligenceCodeGeneratePayload {
  /** Description of code to generate. */
  description: string
  /** Target programming language. */
  language: string
  /** Framework to use. */
  framework?: string
  /** Additional context. */
  context?: string
  /** Include unit tests. */
  includeTests?: boolean
  /** Include code comments. */
  includeComments?: boolean
  /** Code style preference. */
  style?: 'minimal' | 'verbose' | 'production'
}

/**
 * Result from code generation capability.
 */
export interface IntelligenceCodeGenerateResult {
  /** Generated code. */
  code: string
  /** Programming language. */
  language: string
  /** Explanation of the code. */
  explanation?: string
  /** Required dependencies. */
  dependencies?: string[]
  /** Generated tests. */
  tests?: string
}

/**
 * Payload for code explanation capability.
 */
export interface IntelligenceCodeExplainPayload {
  /** Code to explain. */
  code: string
  /** Programming language. */
  language?: string
  /** Explanation depth. */
  depth?: 'brief' | 'detailed' | 'comprehensive'
  /** Target audience level. */
  targetAudience?: 'beginner' | 'intermediate' | 'expert'
}

/**
 * Result from code explanation capability.
 */
export interface IntelligenceCodeExplainResult {
  /** Detailed explanation. */
  explanation: string
  /** Brief summary. */
  summary: string
  /** Key points. */
  keyPoints: string[]
  /** Complexity assessment. */
  complexity?: 'simple' | 'moderate' | 'complex'
  /** Programming concepts used. */
  concepts?: string[]
}

/**
 * Payload for code review capability.
 */
export interface IntelligenceCodeReviewPayload {
  /** Code to review. */
  code: string
  /** Programming language. */
  language?: string
  /** Additional context. */
  context?: string
  /** Areas to focus on. */
  focusAreas?: ('security' | 'performance' | 'style' | 'bugs' | 'best-practices')[]
}

/**
 * Result from code review capability.
 */
export interface IntelligenceCodeReviewResult {
  /** Review summary. */
  summary: string
  /** Overall score (0-100). */
  score: number
  /** Issues found. */
  issues: Array<{
    severity: 'critical' | 'warning' | 'info' | 'suggestion'
    type: string
    line?: number
    message: string
    suggestion?: string
  }>
  /** Suggested improvements. */
  improvements: string[]
}

/**
 * Payload for code refactoring capability.
 */
export interface IntelligenceCodeRefactorPayload {
  /** Code to refactor. */
  code: string
  /** Programming language. */
  language?: string
  /** Refactoring goals. */
  goals?: ('readability' | 'performance' | 'maintainability' | 'modularity')[]
  /** Preserve public interface. */
  preserveInterface?: boolean
}

/**
 * Result from code refactoring capability.
 */
export interface IntelligenceCodeRefactorResult {
  /** Refactored code. */
  refactoredCode: string
  /** List of changes made. */
  changes: Array<{
    type: string
    description: string
    before?: string
    after?: string
  }>
  /** Explanation of changes. */
  explanation: string
}

/**
 * Payload for code debugging capability.
 */
export interface IntelligenceCodeDebugPayload {
  /** Code with bug. */
  code: string
  /** Error message. */
  error?: string
  /** Programming language. */
  language?: string
  /** Additional context. */
  context?: string
  /** Stack trace. */
  stackTrace?: string
}

/**
 * Result from code debugging capability.
 */
export interface IntelligenceCodeDebugResult {
  /** Bug diagnosis. */
  diagnosis: string
  /** Root cause analysis. */
  rootCause: string
  /** Fixed code. */
  fixedCode: string
  /** Explanation of the fix. */
  explanation: string
  /** Tips to prevent similar bugs. */
  preventionTips?: string[]
}

/**
 * Payload for intent detection capability.
 */
export interface IntelligenceIntentDetectPayload {
  /** Text to analyze. */
  text: string
  /** Additional context. */
  context?: string
  /** Possible intents to consider. */
  possibleIntents?: string[]
  /** Language of the text. */
  language?: string
}

/**
 * Result from intent detection capability.
 */
export interface IntelligenceIntentDetectResult {
  /** Detected intent. */
  intent: string
  /** Confidence score (0-1). */
  confidence: number
  /** Extracted entities. */
  entities: Array<{
    type: string
    value: string
    position?: { start: number, end: number }
  }>
  /** Secondary intents. */
  subIntents?: Array<{ intent: string, confidence: number }>
}

/**
 * Payload for sentiment analysis capability.
 */
export interface IntelligenceSentimentAnalyzePayload {
  /** Text to analyze. */
  text: string
  /** Language of the text. */
  language?: string
  /** Analysis granularity. */
  granularity?: 'document' | 'sentence' | 'aspect'
  /** Aspects to analyze. */
  aspects?: string[]
}

/**
 * Result from sentiment analysis capability.
 */
export interface IntelligenceSentimentAnalyzeResult {
  /** Overall sentiment. */
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  /** Sentiment score (-1 to 1). */
  score: number
  /** Confidence score (0-1). */
  confidence: number
  /** Detected emotions. */
  emotions?: Array<{ emotion: string, score: number }>
  /** Aspect-based sentiments. */
  aspects?: Array<{ aspect: string, sentiment: string, score: number }>
  /** Sentiment keywords. */
  keywords?: string[]
}

/**
 * Payload for content extraction capability.
 */
export interface IntelligenceContentExtractPayload {
  /** Text to extract from. */
  text: string
  /** Types of entities to extract. */
  extractTypes?: ('dates' | 'people' | 'locations' | 'organizations' | 'events' | 'products' | 'urls' | 'emails' | 'phones')[]
  /** Language of the text. */
  language?: string
  /** Include surrounding context. */
  includeContext?: boolean
}

/**
 * Result from content extraction capability.
 */
export interface IntelligenceContentExtractResult {
  /** Extracted entities by type. */
  entities: Record<string, Array<{
    value: string
    confidence: number
    context?: string
    position?: { start: number, end: number }
  }>>
  /** Content summary. */
  summary?: string
}

/**
 * Payload for keyword extraction capability.
 */
export interface IntelligenceKeywordsExtractPayload {
  /** Text to extract keywords from. */
  text: string
  /** Maximum keywords to return. */
  maxKeywords?: number
  /** Language of the text. */
  language?: string
  /** Include relevance scores. */
  includeScores?: boolean
  /** Types of keywords to extract. */
  keywordTypes?: ('noun' | 'verb' | 'phrase' | 'entity')[]
}

/**
 * Result from keyword extraction capability.
 */
export interface IntelligenceKeywordsExtractResult {
  /** Extracted keywords. */
  keywords: Array<{
    term: string
    relevance: number
    frequency?: number
    type?: string
  }>
}

/**
 * Payload for text classification capability.
 */
export interface IntelligenceClassificationPayload {
  /** Text to classify. */
  text: string
  /** Available categories. */
  categories: string[]
  /** Allow multiple labels. */
  multiLabel?: boolean
  /** Confidence threshold. */
  threshold?: number
}

/**
 * Result from text classification capability.
 */
export interface IntelligenceClassificationResult {
  /** Classification predictions. */
  predictions: Array<{
    category: string
    confidence: number
  }>
  /** Classification explanation. */
  explanation?: string
}

// Legacy aliases for extended payload types
/** @deprecated Use IntelligenceRewritePayload instead. */
export type AiRewritePayload = IntelligenceRewritePayload
/** @deprecated Use IntelligenceGrammarCheckPayload instead. */
export type AiGrammarCheckPayload = IntelligenceGrammarCheckPayload
/** @deprecated Use IntelligenceGrammarCheckResult instead. */
export type AiGrammarCheckResult = IntelligenceGrammarCheckResult
/** @deprecated Use IntelligenceCodeGeneratePayload instead. */
export type AiCodeGeneratePayload = IntelligenceCodeGeneratePayload
/** @deprecated Use IntelligenceCodeGenerateResult instead. */
export type AiCodeGenerateResult = IntelligenceCodeGenerateResult
/** @deprecated Use IntelligenceCodeExplainPayload instead. */
export type AiCodeExplainPayload = IntelligenceCodeExplainPayload
/** @deprecated Use IntelligenceCodeExplainResult instead. */
export type AiCodeExplainResult = IntelligenceCodeExplainResult
/** @deprecated Use IntelligenceCodeReviewPayload instead. */
export type AiCodeReviewPayload = IntelligenceCodeReviewPayload
/** @deprecated Use IntelligenceCodeReviewResult instead. */
export type AiCodeReviewResult = IntelligenceCodeReviewResult
/** @deprecated Use IntelligenceCodeRefactorPayload instead. */
export type AiCodeRefactorPayload = IntelligenceCodeRefactorPayload
/** @deprecated Use IntelligenceCodeRefactorResult instead. */
export type AiCodeRefactorResult = IntelligenceCodeRefactorResult
/** @deprecated Use IntelligenceCodeDebugPayload instead. */
export type AiCodeDebugPayload = IntelligenceCodeDebugPayload
/** @deprecated Use IntelligenceCodeDebugResult instead. */
export type AiCodeDebugResult = IntelligenceCodeDebugResult
/** @deprecated Use IntelligenceIntentDetectPayload instead. */
export type AiIntentDetectPayload = IntelligenceIntentDetectPayload
/** @deprecated Use IntelligenceIntentDetectResult instead. */
export type AiIntentDetectResult = IntelligenceIntentDetectResult
/** @deprecated Use IntelligenceSentimentAnalyzePayload instead. */
export type AiSentimentAnalyzePayload = IntelligenceSentimentAnalyzePayload
/** @deprecated Use IntelligenceSentimentAnalyzeResult instead. */
export type AiSentimentAnalyzeResult = IntelligenceSentimentAnalyzeResult
/** @deprecated Use IntelligenceContentExtractPayload instead. */
export type AiContentExtractPayload = IntelligenceContentExtractPayload
/** @deprecated Use IntelligenceContentExtractResult instead. */
export type AiContentExtractResult = IntelligenceContentExtractResult
/** @deprecated Use IntelligenceKeywordsExtractPayload instead. */
export type AiKeywordsExtractPayload = IntelligenceKeywordsExtractPayload
/** @deprecated Use IntelligenceKeywordsExtractResult instead. */
export type AiKeywordsExtractResult = IntelligenceKeywordsExtractResult
/** @deprecated Use IntelligenceClassificationPayload instead. */
export type AiClassificationPayload = IntelligenceClassificationPayload
/** @deprecated Use IntelligenceClassificationResult instead. */
export type AiClassificationResult = IntelligenceClassificationResult

// ============================================================================
// Audio Payload Types
// ============================================================================

/**
 * Payload for text-to-speech capability.
 */
export interface IntelligenceTTSPayload {
  /** Text to convert to speech. */
  text: string
  /** Voice identifier. */
  voice?: string
  /** Language code. */
  language?: string
  /** Speech speed multiplier. */
  speed?: number
  /** Voice pitch adjustment. */
  pitch?: number
  /** Output audio format. */
  format?: 'mp3' | 'wav' | 'ogg' | 'flac'
  /** Audio quality. */
  quality?: 'standard' | 'hd'
}

/**
 * Result from text-to-speech capability.
 */
export interface IntelligenceTTSResult {
  /** Audio data. */
  audio: ArrayBuffer | string
  /** Audio format. */
  format: string
  /** Duration in seconds. */
  duration?: number
  /** Sample rate in Hz. */
  sampleRate?: number
}

/**
 * Payload for speech-to-text capability.
 */
export interface IntelligenceSTTPayload {
  /** Audio data. */
  audio: ArrayBuffer | string
  /** Expected language. */
  language?: string
  /** Audio format. */
  format?: string
  /** Include word timestamps. */
  enableTimestamps?: boolean
  /** Enable speaker diarization. */
  enableSpeakerDiarization?: boolean
}

/**
 * Result from speech-to-text capability.
 */
export interface IntelligenceSTTResult {
  /** Transcribed text. */
  text: string
  /** Confidence score (0-1). */
  confidence: number
  /** Detected language. */
  language?: string
  /** Transcription segments. */
  segments?: Array<{
    text: string
    start: number
    end: number
    speaker?: string
    confidence?: number
  }>
}

/**
 * Payload for audio transcription capability.
 */
export interface IntelligenceAudioTranscribePayload {
  /** Audio data. */
  audio: ArrayBuffer | string
  /** Expected language. */
  language?: string
  /** Audio format. */
  format?: string
  /** Task type. */
  task?: 'transcribe' | 'translate'
  /** Include timestamps. */
  enableTimestamps?: boolean
  /** Context prompt. */
  prompt?: string
}

/**
 * Result from audio transcription capability.
 */
export interface IntelligenceAudioTranscribeResult {
  /** Transcribed text. */
  text: string
  /** Detected language. */
  language: string
  /** Audio duration in seconds. */
  duration: number
  /** Transcription segments. */
  segments?: Array<{
    id: number
    text: string
    start: number
    end: number
    confidence?: number
  }>
}

// Legacy aliases for audio types
/** @deprecated Use IntelligenceTTSPayload instead. */
export type AiTTSPayload = IntelligenceTTSPayload
/** @deprecated Use IntelligenceTTSResult instead. */
export type AiTTSResult = IntelligenceTTSResult
/** @deprecated Use IntelligenceSTTPayload instead. */
export type AiSTTPayload = IntelligenceSTTPayload
/** @deprecated Use IntelligenceSTTResult instead. */
export type AiSTTResult = IntelligenceSTTResult
/** @deprecated Use IntelligenceAudioTranscribePayload instead. */
export type AiAudioTranscribePayload = IntelligenceAudioTranscribePayload
/** @deprecated Use IntelligenceAudioTranscribeResult instead. */
export type AiAudioTranscribeResult = IntelligenceAudioTranscribeResult

// ============================================================================
// Vision Extended Payload Types
// ============================================================================

/**
 * Payload for image captioning capability.
 */
export interface IntelligenceImageCaptionPayload {
  /** Image source. */
  source: IntelligenceVisionImageSource
  /** Caption style. */
  style?: 'brief' | 'detailed' | 'creative'
  /** Output language. */
  language?: string
  /** Maximum caption length. */
  maxLength?: number
}

/**
 * Result from image captioning capability.
 */
export interface IntelligenceImageCaptionResult {
  /** Generated caption. */
  caption: string
  /** Alternative captions. */
  alternativeCaptions?: string[]
  /** Image tags. */
  tags?: string[]
  /** Confidence score (0-1). */
  confidence?: number
}

/**
 * Payload for image analysis capability.
 */
export interface IntelligenceImageAnalyzePayload {
  /** Image source. */
  source: IntelligenceVisionImageSource
  /** Types of analysis to perform. */
  analysisTypes?: ('objects' | 'faces' | 'text' | 'colors' | 'composition' | 'scene' | 'emotions')[]
  /** Output language. */
  language?: string
  /** Include detailed analysis. */
  detailed?: boolean
}

/**
 * Result from image analysis capability.
 */
export interface IntelligenceImageAnalyzeResult {
  /** Overall description. */
  description: string
  /** Detected objects. */
  objects?: Array<{
    name: string
    confidence: number
    boundingBox?: [number, number, number, number]
  }>
  /** Detected faces. */
  faces?: Array<{
    age?: number
    gender?: string
    emotion?: string
    boundingBox?: [number, number, number, number]
  }>
  /** Dominant colors. */
  colors?: Array<{
    color: string
    percentage: number
    hex?: string
  }>
  /** Scene classification. */
  scene?: {
    type: string
    confidence: number
    attributes?: Record<string, any>
  }
  /** Detected text. */
  text?: string[]
  /** Image tags. */
  tags?: string[]
}

/**
 * Payload for image generation capability.
 */
export interface IntelligenceImageGeneratePayload {
  /** Generation prompt. */
  prompt: string
  /** Negative prompt. */
  negativePrompt?: string
  /** Image width in pixels. */
  width?: number
  /** Image height in pixels. */
  height?: number
  /** Style preset. */
  style?: string
  /** Image quality. */
  quality?: 'standard' | 'hd'
  /** Number of images to generate. */
  count?: number
  /** Random seed for reproducibility. */
  seed?: number
}

/**
 * Result from image generation capability.
 */
export interface IntelligenceImageGenerateResult {
  /** Generated images. */
  images: Array<{
    url?: string
    base64?: string
    revisedPrompt?: string
  }>
  /** Seed used for generation. */
  seed?: number
}

/**
 * Payload for image editing capability.
 */
export interface IntelligenceImageEditPayload {
  /** Source image. */
  source: IntelligenceVisionImageSource
  /** Mask for inpainting. */
  mask?: IntelligenceVisionImageSource
  /** Edit prompt. */
  prompt: string
  /** Type of edit. */
  editType?: 'inpaint' | 'outpaint' | 'variation' | 'upscale'
}

/**
 * Result from image editing capability.
 */
export interface IntelligenceImageEditResult {
  /** Edited image. */
  image: {
    url?: string
    base64?: string
  }
  /** Revised prompt. */
  revisedPrompt?: string
}

// Legacy aliases for vision types
/** @deprecated Use IntelligenceImageCaptionPayload instead. */
export type AiImageCaptionPayload = IntelligenceImageCaptionPayload
/** @deprecated Use IntelligenceImageCaptionResult instead. */
export type AiImageCaptionResult = IntelligenceImageCaptionResult
/** @deprecated Use IntelligenceImageAnalyzePayload instead. */
export type AiImageAnalyzePayload = IntelligenceImageAnalyzePayload
/** @deprecated Use IntelligenceImageAnalyzeResult instead. */
export type AiImageAnalyzeResult = IntelligenceImageAnalyzeResult
/** @deprecated Use IntelligenceImageGeneratePayload instead. */
export type AiImageGeneratePayload = IntelligenceImageGeneratePayload
/** @deprecated Use IntelligenceImageGenerateResult instead. */
export type AiImageGenerateResult = IntelligenceImageGenerateResult
/** @deprecated Use IntelligenceImageEditPayload instead. */
export type AiImageEditPayload = IntelligenceImageEditPayload
/** @deprecated Use IntelligenceImageEditResult instead. */
export type AiImageEditResult = IntelligenceImageEditResult

// ============================================================================
// RAG & Search Payload Types
// ============================================================================

/**
 * Payload for RAG query capability.
 */
export interface IntelligenceRAGQueryPayload {
  /** Query text. */
  query: string
  /** Documents to search. */
  documents?: Array<{
    id: string
    content: string
    metadata?: Record<string, any>
  }>
  /** Number of top results. */
  topK?: number
  /** Relevance threshold. */
  threshold?: number
  /** Enable reranking. */
  rerank?: boolean
  /** Include context in response. */
  includeContext?: boolean
}

/**
 * Result from RAG query capability.
 */
export interface IntelligenceRAGQueryResult {
  /** Generated answer. */
  answer: string
  /** Source documents. */
  sources: Array<{
    id: string
    content: string
    relevance: number
    metadata?: Record<string, any>
  }>
  /** Confidence score (0-1). */
  confidence: number
}

/**
 * Payload for semantic search capability.
 */
export interface IntelligenceSemanticSearchPayload {
  /** Search query. */
  query: string
  /** Documents to search. */
  documents: Array<{
    id: string
    content: string
    embedding?: number[]
    metadata?: Record<string, any>
  }>
  /** Number of top results. */
  topK?: number
  /** Similarity threshold. */
  threshold?: number
}

/**
 * Result from semantic search capability.
 */
export interface IntelligenceSemanticSearchResult {
  /** Search results. */
  results: Array<{
    id: string
    content: string
    score: number
    metadata?: Record<string, any>
  }>
}

/**
 * Payload for document reranking capability.
 */
export interface IntelligenceRerankPayload {
  /** Query for relevance scoring. */
  query: string
  /** Documents to rerank. */
  documents: Array<{
    id: string
    content: string
    metadata?: Record<string, any>
  }>
  /** Number of top results. */
  topK?: number
}

/**
 * Result from document reranking capability.
 */
export interface IntelligenceRerankResult {
  /** Reranked results. */
  results: Array<{
    id: string
    content: string
    score: number
    originalRank: number
    metadata?: Record<string, any>
  }>
}

// Legacy aliases for RAG types
/** @deprecated Use IntelligenceRAGQueryPayload instead. */
export type AiRAGQueryPayload = IntelligenceRAGQueryPayload
/** @deprecated Use IntelligenceRAGQueryResult instead. */
export type AiRAGQueryResult = IntelligenceRAGQueryResult
/** @deprecated Use IntelligenceSemanticSearchPayload instead. */
export type AiSemanticSearchPayload = IntelligenceSemanticSearchPayload
/** @deprecated Use IntelligenceSemanticSearchResult instead. */
export type AiSemanticSearchResult = IntelligenceSemanticSearchResult
/** @deprecated Use IntelligenceRerankPayload instead. */
export type AiRerankPayload = IntelligenceRerankPayload
/** @deprecated Use IntelligenceRerankResult instead. */
export type AiRerankResult = IntelligenceRerankResult

// ============================================================================
// Prompt Workflow System
// ============================================================================

export type PromptVariableType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'file' | 'image'

export interface PromptVariable {
  name: string
  type: PromptVariableType
  description?: string
  required?: boolean
  default?: any
  validation?: {
    minLength?: number
    maxLength?: number
    pattern?: string
    enum?: any[]
    min?: number
    max?: number
  }
}

export interface PromptTemplate {
  id: string
  name: string
  description?: string
  template: string
  variables: PromptVariable[]
  category?: string
  tags?: string[]
  version?: string
  author?: string
  createdAt?: number
  updatedAt?: number
}

export interface PromptStep {
  id: string
  name: string
  type: 'prompt' | 'condition' | 'loop' | 'parallel' | 'transform' | 'api-call'
  config: PromptStepConfig
  next?: string | PromptStepCondition[]
  onError?: 'fail' | 'skip' | 'retry' | string
  retryConfig?: {
    maxRetries: number
    delay: number
    backoff?: 'linear' | 'exponential'
  }
}

export interface PromptStepConfig {
  // For prompt type
  templateId?: string
  template?: string
  variables?: Record<string, any>
  capabilityId?: string
  modelPreference?: string[]
  // For condition type
  condition?: string
  // For loop type
  items?: string
  maxIterations?: number
  // For parallel type
  branches?: string[]
  // For transform type
  transform?: string
  // For api-call type
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: any
}

export interface PromptStepCondition {
  condition: string
  next: string
}

export interface PromptWorkflow {
  id: string
  name: string
  description?: string
  version?: string
  steps: PromptStep[]
  entryPoint: string
  variables: PromptVariable[]
  outputs?: string[]
  metadata?: Record<string, any>
  createdAt?: number
  updatedAt?: number
}

export interface PromptWorkflowExecution {
  id: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  completedAt?: number
  inputs: Record<string, any>
  outputs?: Record<string, any>
  steps: Array<{
    stepId: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    startedAt?: number
    completedAt?: number
    input?: any
    output?: any
    error?: string
  }>
  error?: string
}

export interface PromptWorkflowContext {
  execution: PromptWorkflowExecution
  variables: Record<string, any>
  stepResults: Record<string, any>
  currentStep?: string
}

// ============================================================================
// Agent System
// ============================================================================

/**
 * Tool definition for an AI agent.
 */
export interface IntelligenceAgentTool {
  /** Tool name. */
  name: string
  /** Tool description. */
  description: string
  /** Parameter schema. */
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      enum?: any[]
      required?: boolean
    }>
    required?: string[]
  }
  /** Handler function name. */
  handler?: string
}

/**
 * Payload for agent capability.
 */
export interface IntelligenceAgentPayload {
  /** Task description. */
  task: string
  /** Available tools. */
  tools?: IntelligenceAgentTool[]
  /** Additional context. */
  context?: string
  /** Maximum iterations. */
  maxIterations?: number
  /** Conversation memory. */
  memory?: Array<{ role: string, content: string }>
  /** Constraints for the agent. */
  constraints?: string[]
}

/**
 * Result from agent capability.
 */
export interface IntelligenceAgentResult {
  /** Final result. */
  result: string
  /** Reasoning steps. */
  steps: Array<{
    thought: string
    action?: string
    actionInput?: any
    observation?: string
  }>
  /** Tool call history. */
  toolCalls: Array<{
    tool: string
    input: any
    output: any
  }>
  /** Number of iterations. */
  iterations: number
}

// Legacy aliases for agent types
/** @deprecated Use IntelligenceAgentTool instead. */
export type AiAgentTool = IntelligenceAgentTool
/** @deprecated Use IntelligenceAgentPayload instead. */
export type AiAgentPayload = IntelligenceAgentPayload
/** @deprecated Use IntelligenceAgentResult instead. */
export type AiAgentResult = IntelligenceAgentResult

/**
 * SDK configuration.
 */
export interface IntelligenceSDKConfig {
  /** Provider configurations. */
  providers: IntelligenceProviderConfig[]
  /** Default strategy ID. */
  defaultStrategy: string
  /** Enable audit logging. */
  enableAudit: boolean
  /** Enable result caching. */
  enableCache: boolean
  /** Enable quota management. */
  enableQuota?: boolean
  /** Cache expiration in seconds. */
  cacheExpiration?: number
  /** Capability routing configurations. */
  capabilities?: Record<string, IntelligenceCapabilityRoutingConfig>
}

/**
 * Strategy configuration.
 */
export interface IntelligenceStrategyConfig {
  /** Strategy ID. */
  id: string
  /** Strategy name. */
  name: string
  /** Strategy type. */
  type: 'rule-based' | 'adaptive' | 'custom'
  /** Strategy rules. */
  rules?: any
  /** Strategy priority. */
  priority?: number
}

/**
 * Audit log entry.
 */
export interface IntelligenceAuditLog {
  /** Trace ID. */
  traceId: string
  /** Timestamp. */
  timestamp: number
  /** Capability ID. */
  capabilityId: string
  /** Provider ID. */
  provider: string
  /** Model used. */
  model: string
  /** Prompt hash. */
  promptHash?: string
  /** Caller identifier. */
  caller?: string
  /** Usage information. */
  usage: IntelligenceUsageInfo
  /** Latency in milliseconds. */
  latency: number
  /** Success status. */
  success: boolean
  /** Error message. */
  error?: string
}

/**
 * Provider binding for a capability.
 */
export interface IntelligenceCapabilityProviderBinding {
  /** Provider ID. */
  providerId: string
  /** Specific models to use. */
  models?: string[]
  /** Priority for selection. */
  priority?: number
  /** Whether binding is enabled. */
  enabled?: boolean
  /** Additional metadata. */
  metadata?: Record<string, any>
}

/**
 * Routing configuration for a capability.
 */
export interface IntelligenceCapabilityRoutingConfig {
  /** Display label. */
  label?: string
  /** Description. */
  description?: string
  /** Provider bindings. */
  providers: IntelligenceCapabilityProviderBinding[]
  /** Prompt template. */
  promptTemplate?: string
  /** Test resource directory. */
  testResourceDir?: string
  /** Additional metadata. */
  metadata?: Record<string, any>
}

/**
 * Persisted SDK configuration.
 */
export interface IntelligenceSDKPersistedConfig {
  /** Provider configurations. */
  providers: IntelligenceProviderConfig[]
  /** Global configuration. */
  globalConfig: {
    defaultStrategy: string
    enableAudit: boolean
    enableCache: boolean
    cacheExpiration?: number
  }
  /** Capability configurations. */
  capabilities?: Record<string, IntelligenceCapabilityRoutingConfig>
  /** Configuration version. */
  version: number
}

// Legacy aliases for SDK types
/** @deprecated Use IntelligenceSDKConfig instead. */
export type AiSDKConfig = IntelligenceSDKConfig
/** @deprecated Use IntelligenceStrategyConfig instead. */
export type AiStrategyConfig = IntelligenceStrategyConfig
/** @deprecated Use IntelligenceAuditLog instead. */
export type AiAuditLog = IntelligenceAuditLog
/** @deprecated Use IntelligenceCapabilityProviderBinding instead. */
export type AiCapabilityProviderBinding = IntelligenceCapabilityProviderBinding
/** @deprecated Use IntelligenceCapabilityRoutingConfig instead. */
export type AiCapabilityRoutingConfig = IntelligenceCapabilityRoutingConfig
/** @deprecated Use IntelligenceSDKPersistedConfig instead. */
export type AiSDKPersistedConfig = IntelligenceSDKPersistedConfig

/**
 * Provider adapter interface.
 */
export interface IntelligenceProviderAdapter {
  /** Provider type. */
  readonly type: IntelligenceProviderType
  /** Get provider configuration. */
  getConfig: () => IntelligenceProviderConfig
  /** Update provider configuration. */
  updateConfig: (config: Partial<IntelligenceProviderConfig>) => void
  /** Check if provider is enabled. */
  isEnabled: () => boolean

  // Core text capabilities
  chat: (payload: IntelligenceChatPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
  chatStream: (payload: IntelligenceChatPayload, options: IntelligenceInvokeOptions) => AsyncGenerator<IntelligenceStreamChunk>
  embedding: (payload: IntelligenceEmbeddingPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<number[]>>
  translate: (payload: IntelligenceTranslatePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
  summarize?: (payload: IntelligenceSummarizePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
  rewrite?: (payload: IntelligenceRewritePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<string>>
  grammarCheck?: (payload: IntelligenceGrammarCheckPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceGrammarCheckResult>>

  // Code capabilities
  codeGenerate?: (payload: IntelligenceCodeGeneratePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeGenerateResult>>
  codeExplain?: (payload: IntelligenceCodeExplainPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeExplainResult>>
  codeReview?: (payload: IntelligenceCodeReviewPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeReviewResult>>
  codeRefactor?: (payload: IntelligenceCodeRefactorPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeRefactorResult>>
  codeDebug?: (payload: IntelligenceCodeDebugPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceCodeDebugResult>>

  // Analysis capabilities
  intentDetect?: (payload: IntelligenceIntentDetectPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceIntentDetectResult>>
  sentimentAnalyze?: (payload: IntelligenceSentimentAnalyzePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>>
  contentExtract?: (payload: IntelligenceContentExtractPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceContentExtractResult>>
  keywordsExtract?: (payload: IntelligenceKeywordsExtractPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>>
  classification?: (payload: IntelligenceClassificationPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceClassificationResult>>

  // Vision capabilities
  visionOcr: (payload: IntelligenceVisionOcrPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>>
  imageCaption?: (payload: IntelligenceImageCaptionPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>>
  imageAnalyze?: (payload: IntelligenceImageAnalyzePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>>
  imageGenerate?: (payload: IntelligenceImageGeneratePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>>
  imageEdit?: (payload: IntelligenceImageEditPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceImageEditResult>>

  // Audio capabilities
  tts?: (payload: IntelligenceTTSPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceTTSResult>>
  stt?: (payload: IntelligenceSTTPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSTTResult>>
  audioTranscribe?: (payload: IntelligenceAudioTranscribePayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>>

  // RAG & Search capabilities
  ragQuery?: (payload: IntelligenceRAGQueryPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRAGQueryResult>>
  semanticSearch?: (payload: IntelligenceSemanticSearchPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceSemanticSearchResult>>
  rerank?: (payload: IntelligenceRerankPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceRerankResult>>

  // Agent capabilities
  agent?: (payload: IntelligenceAgentPayload, options: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<IntelligenceAgentResult>>
}

/** @deprecated Use IntelligenceProviderAdapter instead. */
export type AiProviderAdapter = IntelligenceProviderAdapter

/**
 * Provider manager adapter interface.
 */
export interface IntelligenceProviderManagerAdapter {
  /** Clear all providers. */
  clear: () => void
  /** Register provider from configuration. */
  registerFromConfig: (config: IntelligenceProviderConfig) => IntelligenceProviderAdapter
  /** Get all enabled providers. */
  getEnabled: () => IntelligenceProviderAdapter[]
  /** Get provider by ID. */
  get: (providerId: string) => IntelligenceProviderAdapter | undefined
  /** Create provider instance. */
  createProviderInstance: (config: IntelligenceProviderConfig) => IntelligenceProviderAdapter
}

/** @deprecated Use IntelligenceProviderManagerAdapter instead. */
export type ProviderManagerAdapter = IntelligenceProviderManagerAdapter

/**
 * Global SDK configuration.
 */
export interface IntelligenceGlobalConfig {
  /** Default strategy ID. */
  defaultStrategy: string
  /** Enable audit logging. */
  enableAudit: boolean
  /** Enable result caching. */
  enableCache: boolean
  /** Cache expiration in seconds. */
  cacheExpiration?: number
  /** Maximum retry attempts. */
  maxRetries?: number
  /** Default timeout in milliseconds. */
  defaultTimeout?: number
  /** Enable logging. */
  enableLogging?: boolean
  /** Log level. */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  /** Enable caching. */
  enableCaching?: boolean
  /** Cache size limit. */
  cacheSize?: number
  /** Fallback strategy. */
  fallbackStrategy?: 'next-available' | 'fail-fast' | 'round-robin'
  /** Allow parallel requests. */
  parallelRequests?: boolean
}

/** @deprecated Use IntelligenceGlobalConfig instead. */
export type AISDKGlobalConfig = IntelligenceGlobalConfig

/**
 * Test result structure.
 */
export interface IntelligenceTestResult {
  /** Whether test succeeded. */
  success: boolean
  /** Result message. */
  message?: string
  /** Latency in milliseconds. */
  latency?: number
  /** Test timestamp. */
  timestamp: number
}

/** @deprecated Use IntelligenceTestResult instead. */
export type TestResult = IntelligenceTestResult

/**
 * Capability configuration for SDK.
 */
export interface IntelligenceCapabilityConfig {
  /** Capability ID. */
  id: string
  /** Display label. */
  label: string
  /** Description. */
  description?: string
  /** Provider bindings. */
  providers: IntelligenceCapabilityProviderBinding[]
  /** Prompt template. */
  promptTemplate?: string
  /** Test resource directory. */
  testResourceDir?: string
  /** Additional metadata. */
  metadata?: Record<string, any>
}

/** @deprecated Use IntelligenceCapabilityConfig instead. */
export type AISDKCapabilityConfig = IntelligenceCapabilityConfig

/**
 * Storage data structure for SDK.
 */
export interface IntelligenceStorageData {
  /** Provider configurations. */
  providers: IntelligenceProviderConfig[]
  /** Global configuration. */
  globalConfig: IntelligenceGlobalConfig
  /** Capability configurations. */
  capabilities: Record<string, IntelligenceCapabilityConfig>
  /** Data version. */
  version: number
}

/** @deprecated Use IntelligenceStorageData instead. */
export type AISDKStorageData = IntelligenceStorageData

/**
 * Default provider configurations.
 */
export const DEFAULT_PROVIDERS: IntelligenceProviderConfig[] = [
  {
    id: 'openai-default',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI',
    enabled: false,
    priority: 1,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'anthropic-default',
    type: IntelligenceProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: false,
    priority: 2,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'deepseek-default',
    type: IntelligenceProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: false,
    priority: 2,
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'siliconflow-default',
    type: IntelligenceProviderType.SILICONFLOW,
    name: 'SiliconFlow',
    enabled: false,
    priority: 2,
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
      'tencent/Hunyuan-MT-7B',
      'TeleAI/TeleSpeechASR',
      'THUDM/GLM-4.1V-9B-Thinking',
      'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      'BAAI/bge-reranker-v2-m3',
      'netease-youdao/bce-embedding-base_v1',
      'Kwai-Kolors/Kolors',
      'BAAI/bge-m3',
    ],
    defaultModel: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'tuff-nexus-default',
    type: IntelligenceProviderType.CUSTOM,
    name: 'Tuff Nexus',
    enabled: false,
    priority: 1,
    baseUrl: `${NEXUS_BASE_URL}/v1`,
    models: ['gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {},
    metadata: {
      origin: 'tuff-nexus',
    },
  },
  {
    id: 'local-default',
    type: IntelligenceProviderType.LOCAL,
    name: 'Local Model',
    enabled: false,
    priority: 3,
    models: [],
    baseUrl: 'http://localhost:11434',
    timeout: 60000,
    rateLimit: {},
  },
]

export const DEFAULT_GLOBAL_CONFIG: AISDKGlobalConfig = {
  defaultStrategy: 'adaptive-default',
  enableAudit: false,
  enableCache: true,
  cacheExpiration: 3600,
}

export const DEFAULT_CAPABILITIES: Record<string, AISDKCapabilityConfig> = {
  'text.chat': {
    id: 'text.chat',
    label: '对话 / Chat',
    description: '通用对话、问答、助理类能力',
    providers: [
      { providerId: 'openai-default', priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: true },
      { providerId: 'deepseek-default', priority: 3, enabled: true },
      { providerId: 'siliconflow-default', priority: 4, enabled: true },
    ],
  },
  'embedding.generate': {
    id: 'embedding.generate',
    label: 'Embedding / 向量生成',
    description: '为向量检索/摘要生成 embedding',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['text-embedding-3-small', 'text-embedding-3-large'],
        priority: 2,
        enabled: false,
      },
    ],
  },
  'vision.ocr': {
    id: 'vision.ocr',
    label: '图像 OCR / Image Recognition',
    description: '识别截图、图片中的文字并生成关键词',
    promptTemplate:
      '你是 OCR 助手，识别图片所有文本，生成 keywords 数组（5 个以内）辅助搜索。',
    testResourceDir: 'intelligence/test-capability/ocr',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['deepseek-ai/DeepSeek-OCR', 'THUDM/GLM-4.1V-9B-Thinking'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['gpt-4o', 'gpt-4o-mini'],
        priority: 2,
        enabled: false,
      },
      {
        providerId: 'anthropic-default',
        models: ['claude-3-5-sonnet-20241022'],
        priority: 3,
        enabled: false,
      },
    ],
  },
  'text.translate': {
    id: 'text.translate',
    label: '翻译 / Translation',
    description: '多语言文本翻译',
    promptTemplate: '你是专业翻译助手。请将以下文本翻译成 {{targetLang}}，只返回译文，不要解释。',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
      { providerId: 'anthropic-default', priority: 3, enabled: false },
    ],
  },
  'text.summarize': {
    id: 'text.summarize',
    label: '摘要 / Summarization',
    description: '生成文本内容的简洁摘要',
    promptTemplate: '请用简洁的语言总结以下内容的核心要点，不超过 {{maxLength}} 字。',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
      { providerId: 'anthropic-default', priority: 3, enabled: false },
    ],
  },
  'intent.detect': {
    id: 'intent.detect',
    label: '意图识别 / Intent Detection',
    description: '识别用户查询的意图类型（搜索、打开、计算等）',
    promptTemplate: '分析用户输入的意图，返回 JSON 格式：{intent: string, confidence: number, entities: string[]}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'code.generate': {
    id: 'code.generate',
    label: '代码生成 / Code Generation',
    description: '根据需求生成代码片段',
    promptTemplate: '你是编程助手。根据需求生成 {{language}} 代码，包含注释说明。',
    providers: [
      { providerId: 'deepseek-default', models: ['deepseek-coder'], priority: 1, enabled: true },
      { providerId: 'openai-default', models: ['gpt-4o'], priority: 2, enabled: false },
    ],
  },
  'code.explain': {
    id: 'code.explain',
    label: '代码解释 / Code Explanation',
    description: '解释代码的功能和逻辑',
    promptTemplate: '你是编程导师。用通俗易懂的语言解释这段代码的功能、逻辑和关键点。',
    providers: [
      { providerId: 'deepseek-default', models: ['deepseek-coder'], priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: false },
    ],
  },
  'content.extract': {
    id: 'content.extract',
    label: '内容提取 / Content Extraction',
    description: '从文本中提取关键信息（日期、人名、地点等）',
    promptTemplate: '从文本中提取关键信息，返回 JSON 格式：{dates: [], people: [], locations: [], keywords: []}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'sentiment.analyze': {
    id: 'sentiment.analyze',
    label: '情感分析 / Sentiment Analysis',
    description: '分析文本的情感倾向（积极/消极/中性）',
    promptTemplate: '分析文本情感倾向，返回 JSON：{sentiment: "positive"|"negative"|"neutral", score: 0-1, keywords: []}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'code.review': {
    id: 'code.review',
    label: '代码审查 / Code Review',
    description: '审查代码，发现潜在问题、最佳实践和改进建议',
    promptTemplate: '作为资深代码审查员，审查以下代码。关注：1) 潜在bug 2) 性能问题 3) 安全隐患 4) 最佳实践 5) 可读性',
    providers: [
      { providerId: 'deepseek-default', models: ['deepseek-coder'], priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: false },
      { providerId: 'openai-default', models: ['gpt-4o'], priority: 3, enabled: false },
    ],
  },
  'keywords.extract': {
    id: 'keywords.extract',
    label: '关键词提取 / Keyword Extraction',
    description: '从文本中提取关键词和短语',
    promptTemplate: '从文本中提取最重要的关键词，返回 JSON 数组：{keywords: [{term: string, relevance: number}]}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'audio.transcribe': {
    id: 'audio.transcribe',
    label: '音频转录 / Audio Transcription',
    description: '将语音转换为文字（支持多语言）',
    providers: [
      {
        providerId: 'openai-default',
        models: ['whisper-1'],
        priority: 1,
        enabled: false,
      },
      {
        providerId: 'siliconflow-default',
        models: ['TeleAI/TeleSpeechASR'],
        priority: 2,
        enabled: true,
      },
    ],
  },
  'audio.tts': {
    id: 'audio.tts',
    label: '语音合成 / Text-to-Speech',
    description: '将文字转换为自然语音',
    providers: [
      {
        providerId: 'openai-default',
        models: ['tts-1', 'tts-1-hd'],
        priority: 1,
        enabled: false,
      },
    ],
  },
  'image.caption': {
    id: 'image.caption',
    label: '图像标题 / Image Captioning',
    description: '为图片生成描述性标题',
    promptTemplate: '生成简洁准确的图片描述（中英文），捕捉主要内容和氛围。',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['THUDM/GLM-4.1V-9B-Thinking'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['gpt-4o', 'gpt-4o-mini'],
        priority: 2,
        enabled: false,
      },
      {
        providerId: 'anthropic-default',
        models: ['claude-3-5-sonnet-20241022'],
        priority: 3,
        enabled: false,
      },
    ],
  },
  'image.analyze': {
    id: 'image.analyze',
    label: '图像分析 / Image Analysis',
    description: '深度分析图像内容、物体、场景和上下文',
    promptTemplate: '详细分析图片，包括：物体识别、场景理解、颜色分析、构图评估。返回结构化结果。',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['THUDM/GLM-4.1V-9B-Thinking'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['gpt-4o'],
        priority: 2,
        enabled: false,
      },
      {
        providerId: 'anthropic-default',
        models: ['claude-3-5-sonnet-20241022'],
        priority: 3,
        enabled: false,
      },
    ],
  },
}

export interface CapabilityTestResult {
  success: boolean
  message?: string
  latency?: number
  provider?: string
  model?: string
  textPreview?: string
  timestamp: number
}

export interface CapabilityBinding extends AiCapabilityProviderBinding {
  provider?: IntelligenceProviderConfig
}
