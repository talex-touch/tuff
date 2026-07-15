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
  IntelligenceProviderAdapter,
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
  IntelligenceStreamChunk,
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceSummarizePayload,
  IntelligenceTranslatePayload,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

import { enterPerfContext } from '../../../utils/perf-context'

function asImageRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function readImageString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readImageStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map(readImageString).filter((item): item is string => Boolean(item))
  return items.length > 0 ? items : undefined
}

function readImageConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined
}

function readImageBoundingBox(value: unknown): [number, number, number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    return undefined
  }
  return [value[0], value[1], value[2], value[3]]
}

function normalizeImageAnalyzeRecord(
  record: Record<string, unknown>
): IntelligenceImageAnalyzeResult {
  const description = readImageString(record.description)
  if (!description) {
    throw new Error('Image analysis response is missing a description')
  }

  const objects: NonNullable<IntelligenceImageAnalyzeResult['objects']> | undefined = Array.isArray(
    record.objects
  )
    ? record.objects.flatMap((value) => {
        const item = asImageRecord(value)
        const name = readImageString(item.name)
        const confidence = readImageConfidence(item.confidence)
        if (!name || confidence === undefined) return []
        const boundingBox = readImageBoundingBox(item.boundingBox)
        return [{ name, confidence, ...(boundingBox ? { boundingBox } : {}) }]
      })
    : undefined
  const faces: NonNullable<IntelligenceImageAnalyzeResult['faces']> | undefined = Array.isArray(
    record.faces
  )
    ? record.faces.flatMap((value) => {
        const item = asImageRecord(value)
        const age = typeof item.age === 'number' && Number.isFinite(item.age) ? item.age : undefined
        const gender = readImageString(item.gender)
        const emotion = readImageString(item.emotion)
        const boundingBox = readImageBoundingBox(item.boundingBox)
        if (age === undefined && !gender && !emotion && !boundingBox) return []
        return [
          {
            ...(age === undefined ? {} : { age }),
            ...(gender ? { gender } : {}),
            ...(emotion ? { emotion } : {}),
            ...(boundingBox ? { boundingBox } : {})
          }
        ]
      })
    : undefined
  const colors: NonNullable<IntelligenceImageAnalyzeResult['colors']> | undefined = Array.isArray(
    record.colors
  )
    ? record.colors.flatMap((value) => {
        const item = asImageRecord(value)
        const color = readImageString(item.color)
        const percentage =
          typeof item.percentage === 'number' && Number.isFinite(item.percentage)
            ? item.percentage
            : undefined
        if (!color || percentage === undefined) return []
        const hex = readImageString(item.hex)
        return [{ color, percentage, ...(hex ? { hex } : {}) }]
      })
    : undefined
  const sceneRecord = asImageRecord(record.scene)
  const sceneType = readImageString(sceneRecord.type)
  const sceneConfidence = readImageConfidence(sceneRecord.confidence)
  const attributes = asImageRecord(sceneRecord.attributes)
  const text = readImageStringArray(record.text)
  const tags = readImageStringArray(record.tags)

  return {
    description,
    ...(objects?.length ? { objects } : {}),
    ...(faces?.length ? { faces } : {}),
    ...(colors?.length ? { colors } : {}),
    ...(sceneType && sceneConfidence !== undefined
      ? {
          scene: {
            type: sceneType,
            confidence: sceneConfidence,
            ...(Object.keys(attributes).length > 0 ? { attributes } : {})
          }
        }
      : {}),
    ...(text ? { text } : {}),
    ...(tags ? { tags } : {})
  }
}
export abstract class IntelligenceProvider implements IntelligenceProviderAdapter {
  abstract readonly type: IntelligenceProviderType
  protected config: IntelligenceProviderConfig

  constructor(config: IntelligenceProviderConfig) {
    this.config = config
  }

  getConfig(): IntelligenceProviderConfig {
    return this.config
  }

  updateConfig(config: Partial<IntelligenceProviderConfig>): void {
    this.config = { ...this.config, ...config }
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  // ============================================================================
  // Core Text Capabilities (Abstract - must be implemented)
  // ============================================================================

  abstract chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>>
  abstract chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk>
  abstract embedding(
    payload: IntelligenceEmbeddingPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>>
  abstract translate(
    payload: IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>>

  // ============================================================================
  // Extended Text Capabilities (Optional - default implementations via chat)
  // ============================================================================

  async summarize(
    payload: IntelligenceSummarizePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const stylePrompts = {
      concise: 'Provide a brief, concise summary.',
      detailed: 'Provide a detailed, comprehensive summary.',
      'bullet-points': 'Provide a summary in bullet points.'
    }
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a summarization assistant. ${stylePrompts[payload.style || 'concise']} ${payload.maxLength ? `Keep it under ${payload.maxLength} characters.` : ''}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    return this.chat(chatPayload, options)
  }

  async rewrite(
    payload: IntelligenceRewritePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a writing assistant. Rewrite the following text in a ${payload.style || 'professional'} style with a ${payload.tone || 'neutral'} tone.${payload.targetAudience ? ` Target audience: ${payload.targetAudience}.` : ''}${payload.preserveKeywords?.length ? ` Preserve these keywords: ${payload.preserveKeywords.join(', ')}.` : ''} Return only the rewritten text.`
        },
        { role: 'user', content: payload.text }
      ]
    }
    return this.chat(chatPayload, options)
  }

  async grammarCheck(
    payload: IntelligenceGrammarCheckPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceGrammarCheckResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a grammar checker. Check the text for ${payload.checkTypes?.join(', ') || 'spelling, grammar, punctuation'} issues. Return JSON: {"correctedText": "...", "issues": [{"type": "...", "original": "...", "suggestion": "...", "position": {"start": 0, "end": 0}, "explanation": "..."}], "score": 0-100}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        correctedText: payload.text,
        issues: [],
        score: 100
      })
    }
  }

  // ============================================================================
  // Code Capabilities (Optional - default implementations via chat)
  // ============================================================================

  async codeGenerate(
    payload: IntelligenceCodeGeneratePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeGenerateResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a code generation assistant. Generate ${payload.language} code${payload.framework ? ` using ${payload.framework}` : ''}. ${payload.includeComments ? 'Include comments.' : ''} ${payload.includeTests ? 'Include unit tests.' : ''} Return JSON: {"code": "...", "language": "${payload.language}", "explanation": "...", "dependencies": [], "tests": "..."}`
        },
        { role: 'user', content: payload.description }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        code: result.result,
        language: payload.language
      })
    }
  }

  async codeExplain(
    payload: IntelligenceCodeExplainPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeExplainResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a code explanation assistant. Explain the code at a ${payload.targetAudience || 'intermediate'} level with ${payload.depth || 'detailed'} depth. Return JSON: {"explanation": "...", "summary": "...", "keyPoints": [], "complexity": "simple|moderate|complex", "concepts": []}`
        },
        { role: 'user', content: payload.code }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        explanation: result.result,
        summary: '',
        keyPoints: []
      })
    }
  }

  async codeReview(
    payload: IntelligenceCodeReviewPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeReviewResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a code reviewer. Review the code focusing on: ${payload.focusAreas?.join(', ') || 'security, performance, style, bugs, best-practices'}. Return JSON: {"summary": "...", "score": 0-100, "issues": [{"severity": "critical|warning|info|suggestion", "type": "...", "line": 0, "message": "...", "suggestion": "..."}], "improvements": []}`
        },
        { role: 'user', content: payload.code }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        summary: result.result,
        score: 0,
        issues: [],
        improvements: []
      })
    }
  }

  async codeRefactor(
    payload: IntelligenceCodeRefactorPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeRefactorResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a code refactoring assistant. Refactor the code to improve: ${payload.goals?.join(', ') || 'readability, maintainability'}. ${payload.preserveInterface ? 'Preserve the public interface.' : ''} Return JSON: {"refactoredCode": "...", "changes": [{"type": "...", "description": "...", "before": "...", "after": "..."}], "explanation": "..."}`
        },
        { role: 'user', content: payload.code }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        refactoredCode: payload.code,
        changes: [],
        explanation: ''
      })
    }
  }

  async codeDebug(
    payload: IntelligenceCodeDebugPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeDebugResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a debugging assistant. Analyze the code and error to find the bug. Return JSON: {"diagnosis": "...", "rootCause": "...", "fixedCode": "...", "explanation": "...", "preventionTips": []}`
        },
        {
          role: 'user',
          content: `Code:\n${payload.code}\n\nError: ${payload.error || 'Unknown'}\n${payload.stackTrace ? `Stack trace:\n${payload.stackTrace}` : ''}`
        }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        diagnosis: result.result,
        rootCause: '',
        fixedCode: payload.code,
        explanation: ''
      })
    }
  }

  // ============================================================================
  // Analysis Capabilities (Optional - default implementations via chat)
  // ============================================================================

  async intentDetect(
    payload: IntelligenceIntentDetectPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceIntentDetectResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are an intent detection assistant. Analyze the user input and detect the intent.${payload.possibleIntents?.length ? ` Possible intents: ${payload.possibleIntents.join(', ')}.` : ''} Return JSON: {"intent": "...", "confidence": 0-1, "entities": [{"type": "...", "value": "...", "position": {"start": 0, "end": 0}}], "subIntents": []}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, {
        intent: 'unknown',
        confidence: 0,
        entities: []
      })
    }
  }

  async sentimentAnalyze(
    payload: IntelligenceSentimentAnalyzePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceSentimentAnalyzeResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a sentiment analysis assistant. Analyze the sentiment at ${payload.granularity || 'document'} level.${payload.aspects?.length ? ` Focus on aspects: ${payload.aspects.join(', ')}.` : ''} Return JSON: {"sentiment": "positive|negative|neutral|mixed", "score": -1 to 1, "confidence": 0-1, "emotions": [{"emotion": "...", "score": 0-1}], "aspects": [], "keywords": []}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    const result = await this.chat(chatPayload, options)
    const fallback: IntelligenceSentimentAnalyzeResult = {
      sentiment: 'neutral',
      score: 0,
      confidence: 0
    }

    return {
      ...result,
      result: this.safeParseJsonResult(result.result, fallback)
    }
  }

  async contentExtract(
    payload: IntelligenceContentExtractPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceContentExtractResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a content extraction assistant. Extract: ${payload.extractTypes?.join(', ') || 'dates, people, locations, organizations, keywords'}. Return JSON: {"entities": {"dates": [], "people": [], "locations": [], ...}, "summary": "..."}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, { entities: {} })
    }
  }

  async keywordsExtract(
    payload: IntelligenceKeywordsExtractPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceKeywordsExtractResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a keyword extraction assistant. Extract up to ${payload.maxKeywords || 10} keywords. Return JSON: {"keywords": [{"term": "...", "relevance": 0-1, "frequency": 0, "type": "noun|verb|phrase|entity"}]}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, { keywords: [] })
    }
  }

  async classification(
    payload: IntelligenceClassificationPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceClassificationResult>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a text classification assistant. Classify the text into categories: ${payload.categories.join(', ')}. ${payload.multiLabel ? 'Multiple labels allowed.' : 'Single label only.'} Return JSON: {"predictions": [{"category": "...", "confidence": 0-1}], "explanation": "..."}`
        },
        { role: 'user', content: payload.text }
      ]
    }
    const result = await this.chat(chatPayload, options)
    return {
      ...result,
      result: this.safeParseJsonResult(result.result, { predictions: [] })
    }
  }

  protected deriveImageTags(text: string): string[] {
    return text
      .split(/[\s,.;，。；、]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
      .filter((token, index, all) => all.indexOf(token) === index)
      .slice(0, 10)
  }

  protected normalizeImageCaptionResult(
    rawContent: string,
    maxLength?: number
  ): IntelligenceImageCaptionResult {
    const record = asImageRecord(this.safeParseJson(rawContent))
    const unboundedCaption = readImageString(record.caption) || rawContent.trim()
    if (!unboundedCaption) {
      throw new Error(`[${this.type}] Image caption response is empty`)
    }
    const limit =
      typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength > 0
        ? Math.floor(maxLength)
        : undefined
    const caption = limit ? unboundedCaption.slice(0, limit) : unboundedCaption
    const alternativeCaptions = readImageStringArray(record.alternativeCaptions)
    const tags = readImageStringArray(record.tags) || this.deriveImageTags(caption)
    const confidence = readImageConfidence(record.confidence)

    return {
      caption,
      ...(alternativeCaptions ? { alternativeCaptions } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(confidence === undefined ? {} : { confidence })
    }
  }

  protected normalizeImageAnalyzeResult(rawContent: string): IntelligenceImageAnalyzeResult {
    const parsed = this.safeParseJson(rawContent)
    const record = asImageRecord(parsed)
    if (Object.keys(record).length > 0) {
      return normalizeImageAnalyzeRecord(record)
    }

    const description = rawContent.trim()
    if (!description) {
      throw new Error(`[${this.type}] Image analysis response is empty`)
    }
    return { description }
  }

  // ============================================================================
  // Vision Capabilities (Optional - default unsupported)
  // ============================================================================

  visionOcr(
    _payload: IntelligenceVisionOcrPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
    return Promise.reject(new Error(`[${this.type}] Vision OCR capability is unsupported`))
  }

  imageCaption(
    _payload: IntelligenceImageCaptionPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>> {
    return Promise.reject(new Error(`[${this.type}] Image caption capability is unsupported`))
  }

  imageAnalyze(
    _payload: IntelligenceImageAnalyzePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>> {
    return Promise.reject(new Error(`[${this.type}] Image analyze capability is unsupported`))
  }

  imageTranslateE2e(
    _payload: IntelligenceImageTranslateE2ePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageTranslateE2eResult>> {
    return Promise.reject(new Error(`[${this.type}] Image translate capability is unsupported`))
  }

  imageGenerate(
    _payload: IntelligenceImageGeneratePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>> {
    return Promise.reject(new Error(`[${this.type}] Image generate capability is unsupported`))
  }

  imageEdit(
    _payload: IntelligenceImageEditPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageEditResult>> {
    return Promise.reject(new Error(`[${this.type}] Image edit capability is unsupported`))
  }

  // ============================================================================
  // Audio Capabilities (Optional - default unsupported)
  // ============================================================================

  tts(
    _payload: IntelligenceTTSPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    return Promise.reject(new Error(`[${this.type}] TTS capability is unsupported`))
  }

  stt(
    _payload: IntelligenceSTTPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceSTTResult>> {
    return Promise.reject(new Error(`[${this.type}] STT capability is unsupported`))
  }

  audioTranscribe(
    _payload: IntelligenceAudioTranscribePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>> {
    return Promise.reject(new Error(`[${this.type}] Audio transcribe capability is unsupported`))
  }

  // ============================================================================
  // RAG & Search Capabilities (Optional - default unsupported)
  // ============================================================================

  ragQuery(
    _payload: IntelligenceRAGQueryPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceRAGQueryResult>> {
    return Promise.reject(new Error(`[${this.type}] RAG query capability is unsupported`))
  }

  semanticSearch(
    _payload: IntelligenceSemanticSearchPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceSemanticSearchResult>> {
    return Promise.reject(new Error(`[${this.type}] Semantic search capability is unsupported`))
  }

  rerank(
    _payload: IntelligenceRerankPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceRerankResult>> {
    return Promise.reject(new Error(`[${this.type}] Rerank capability is unsupported`))
  }

  // ============================================================================
  // Agent Capabilities (Optional - default unsupported)
  // ============================================================================

  agent(
    _payload: IntelligenceAgentPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceAgentResult>> {
    return Promise.reject(new Error(`[${this.type}] Agent capability is unsupported`))
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  protected generateTraceId(): string {
    return `${this.type}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  protected async parseJsonResponse<T>(
    response: Response,
    context?: { endpoint?: string }
  ): Promise<T> {
    const rawBody = await response.text()
    const trimmedBody = rawBody.trim()
    const endpointHint = context?.endpoint ? ` ${context.endpoint}` : ''
    if (!trimmedBody) {
      throw new Error(
        `[${this.type}]${endpointHint} returned an empty response (status ${response.status}). Expecting JSON payload.`
      )
    }

    try {
      const disposeParse = enterPerfContext('Intelligence.parseJsonResponse', {
        provider: this.type,
        endpoint: context?.endpoint,
        size: trimmedBody.length
      })
      try {
        return JSON.parse(trimmedBody)
      } finally {
        disposeParse()
      }
    } catch {
      const normalized = trimmedBody.replace(/\s+/g, ' ')
      const snippet =
        normalized.length > 256
          ? `${normalized.slice(0, 256)}...`
          : normalized || '<unreadable response>'
      const contentType = response.headers.get('content-type') || 'unknown'
      const htmlHint =
        contentType.toLowerCase().includes('text/html') ||
        normalized.toLowerCase().includes('<!doctype html')
          ? ' Check provider baseUrl: it may point to a docs/web page instead of an OpenAI-compatible API endpoint.'
          : ''
      throw new Error(
        `[${this.type}]${endpointHint} expected JSON but received ${contentType} (status ${response.status}). Body snippet: ${snippet}${htmlHint}`
      )
    }
  }

  protected validateApiKey(): void {
    if (!this.config.apiKey) {
      throw new Error(`[${this.type}] API key is required but not configured`)
    }
  }

  protected validateModel(
    model: string,
    context?: { capabilityId?: string; endpoint?: string }
  ): void {
    const providerType = this.config.type
    const capabilityHint = context?.capabilityId ? ` capability=${context.capabilityId}` : ''
    const endpointHint = context?.endpoint ? ` endpoint=${context.endpoint}` : ''
    const hint = `${capabilityHint}${endpointHint}`

    if (
      providerType === IntelligenceProviderType.CUSTOM ||
      providerType === IntelligenceProviderType.LOCAL
    ) {
      return
    }

    const normalized = typeof model === 'string' ? model.trim() : ''
    if (!normalized) {
      throw new Error(`[${this.type}] Model is required but missing${hint ? `.${hint}` : ''}`)
    }

    if (providerType === IntelligenceProviderType.ANTHROPIC) {
      if (!normalized.startsWith('claude-')) {
        throw new Error(
          `[${this.type}] Incompatible model "${normalized}" for provider ${providerType}.${hint} Expected "claude-*". ` +
            `Fix by updating capability routing models or provider defaultModel.`
        )
      }
      return
    }

    if (providerType === IntelligenceProviderType.DEEPSEEK) {
      if (!normalized.startsWith('deepseek-')) {
        throw new Error(
          `[${this.type}] Incompatible model "${normalized}" for provider ${providerType}.${hint} Expected "deepseek-*". ` +
            `Fix by updating capability routing models or provider defaultModel.`
        )
      }
      return
    }

    if (providerType === IntelligenceProviderType.OPENAI) {
      if (normalized.startsWith('claude-') || normalized.startsWith('deepseek-')) {
        throw new Error(
          `[${this.type}] Incompatible model "${normalized}" for provider ${providerType}.${hint} ` +
            `Fix by selecting a provider matching this model family.`
        )
      }
      return
    }

    if (providerType === IntelligenceProviderType.SILICONFLOW) {
      if (normalized.startsWith('claude-')) {
        throw new Error(
          `[${this.type}] Incompatible model "${normalized}" for provider ${providerType}.${hint} ` +
            `Fix by selecting Anthropic provider for "claude-*" models.`
        )
      }
    }
  }

  protected safeParseJson(text: string): unknown {
    try {
      const cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }

  protected safeParseJsonResult<T extends object>(text: string, fallback: T): T {
    const parsed = this.safeParseJson(text)
    if (parsed && typeof parsed === 'object') {
      return { ...fallback, ...(parsed as Partial<T>) }
    }
    return fallback
  }
}
