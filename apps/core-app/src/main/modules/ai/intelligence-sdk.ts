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
  IntelligenceProviderManagerAdapter,
  IntelligenceRAGQueryPayload,
  IntelligenceRAGQueryResult,
  IntelligenceRerankPayload,
  IntelligenceRerankResult,
  IntelligenceRewritePayload,
  IntelligenceSDKConfig,
  IntelligenceSemanticSearchPayload,
  IntelligenceSemanticSearchResult,
  IntelligenceSentimentAnalyzePayload,
  IntelligenceSentimentAnalyzeResult,
  IntelligenceStreamChunk,
  IntelligenceSummarizePayload,
  IntelligenceTranslatePayload,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
} from '@talex-touch/utils'
import type { IntelligenceAuditLogEntry } from './intelligence-audit-logger'
import { stdout } from 'node:process'
import { format } from 'node:util'
import { PromptTemplate } from '@langchain/core/prompts'
import chalk from 'chalk'
import { intelligenceAuditLogger } from './intelligence-audit-logger'
import { aiCapabilityRegistry } from './intelligence-capability-registry'
import { intelligenceQuotaManager } from './intelligence-quota-manager'
import { strategyManager } from './intelligence-strategy-manager'

const INTELLIGENCE_TAG = chalk.hex('#1e88e5').bold('[Intelligence]')
const logInfo = (...args: any[]) => stdout.write(`${format(INTELLIGENCE_TAG, ...args)}\n`)
const logWarn = (...args: any[]) => console.warn(INTELLIGENCE_TAG, ...args)
const logError = (...args: any[]) => console.error(INTELLIGENCE_TAG, ...args)

const MAX_EMBEDDING_TOTAL_CHARS = 32_000
const EMBEDDING_CHUNK_CHARS = 2_000
const MAX_EMBEDDING_CHUNKS = 16

function normalizeEmbeddingText(input: string | string[]): string {
  if (Array.isArray(input)) {
    return input.filter(Boolean).join('\n')
  }
  return input
}

function chunkText(text: string): { chunks: string[], truncated: boolean } {
  const normalized = text.trim()
  const limited = normalized.length > MAX_EMBEDDING_TOTAL_CHARS
    ? normalized.slice(0, MAX_EMBEDDING_TOTAL_CHARS)
    : normalized

  const chunks: string[] = []
  for (let i = 0; i < limited.length; i += EMBEDDING_CHUNK_CHARS) {
    chunks.push(limited.slice(i, i + EMBEDDING_CHUNK_CHARS))
    if (chunks.length >= MAX_EMBEDDING_CHUNKS)
      break
  }

  const truncated = limited.length !== normalized.length || chunks.join('').length !== limited.length
  return { chunks: chunks.length > 0 ? chunks : [''], truncated }
}

function averageEmbeddings(vectors: number[][], weights: number[]): number[] {
  if (vectors.length === 0)
    return []

  const dim = vectors[0]?.length ?? 0
  if (dim === 0)
    return []

  const sum = Array.from({ length: dim }, () => 0)
  let weightSum = 0
  for (let i = 0; i < vectors.length; i++) {
    const vec = vectors[i]
    const w = weights[i] ?? 1
    if (!vec || vec.length !== dim)
      throw new Error('[Intelligence] Embedding vectors dimension mismatch')
    for (let j = 0; j < dim; j++) {
      sum[j] += (vec[j] ?? 0) * w
    }
    weightSum += w
  }

  if (weightSum <= 0)
    return sum

  for (let j = 0; j < dim; j++) {
    sum[j] /= weightSum
  }
  return sum
}

function extractMustacheVariables(template: string): string[] {
  const vars = new Set<string>()
  const regex = /\{\{\s*([\w.]+)\s*\}\}/g
  while (true) {
    const match = regex.exec(template)
    if (!match)
      break
    if (match[1])
      vars.add(match[1])
  }
  return Array.from(vars)
}

async function renderPromptTemplate(template: string, variables?: Record<string, any>): Promise<string> {
  const inputVariables = extractMustacheVariables(template)
  if (inputVariables.length === 0) {
    return template
  }

  const prompt = new PromptTemplate({
    template,
    inputVariables,
    templateFormat: 'mustache' as any,
  })

  return await prompt.format(variables ?? {})
}

let providerManager: IntelligenceProviderManagerAdapter | null = null

export function setIntelligenceProviderManager(manager: IntelligenceProviderManagerAdapter): void {
  providerManager = manager
  logInfo('Provider manager injected')
}

function ensureProviderManager(): IntelligenceProviderManagerAdapter {
  if (!providerManager) {
    throw new Error('[Intelligence] Provider manager not initialized')
  }
  return providerManager
}

export class AiSDK {
  private config: IntelligenceSDKConfig = {
    providers: [],
    defaultStrategy: 'adaptive-default',
    enableAudit: true,
    enableCache: false,
    enableQuota: true,
    capabilities: {},
  }

  private cache = new Map<string, { result: any, timestamp: number }>()

  constructor(config?: Partial<IntelligenceSDKConfig>) {
    if (config) {
      this.updateConfig(config)
    }
  }

  updateConfig(config: Partial<IntelligenceSDKConfig>): void {
    const nextConfig: IntelligenceSDKConfig = { ...this.config, ...config }

    if (config.capabilities) {
      nextConfig.capabilities = {
        ...this.config.capabilities,
        ...config.capabilities,
      }
    }

    if (config.defaultStrategy) {
      nextConfig.defaultStrategy = normalizeStrategyId(config.defaultStrategy) || this.config.defaultStrategy
    }

    this.config = {
      ...nextConfig,
      defaultStrategy: normalizeStrategyId(nextConfig.defaultStrategy) || 'adaptive-default',
    }

    if (config.providers) {
      const manager = ensureProviderManager()
      manager.clear()
      config.providers.forEach((providerConfig) => {
        try {
          manager.registerFromConfig(providerConfig)
        }
        catch (error) {
          logError(`Failed to register provider ${providerConfig.id}:`, error)
        }
      })
    }

    if (this.config.defaultStrategy) {
      strategyManager.setDefaultStrategy(this.config.defaultStrategy)
    }

    logInfo('Configuration updated')
  }

  async invoke<T = any>(
    capabilityId: string,
    payload: any,
    options: IntelligenceInvokeOptions = {},
  ): Promise<IntelligenceInvokeResult<T>> {
    const capability = aiCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`[Intelligence] Capability ${capabilityId} not found`)
    }
    logInfo(`invoke -> ${capabilityId}`)

    // Check quota if caller is specified
    const caller = options.metadata?.caller
    if (this.config.enableQuota && caller) {
      const quotaCheck = await this.checkQuota(caller)
      if (!quotaCheck.allowed) {
        throw new Error(`[Intelligence] Quota exceeded: ${quotaCheck.reason}`)
      }
    }

    const runtimeOptions: IntelligenceInvokeOptions = { ...options }
    runtimeOptions.metadata = {
      ...(runtimeOptions.metadata ?? {}),
      capabilityId,
    }
    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const configuredProviders
      = capabilityRouting?.providers
        ?.filter(binding => binding.enabled !== false)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map(binding => binding.providerId) ?? []

    if ((!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) && configuredProviders.length > 0) {
      runtimeOptions.allowedProviderIds = configuredProviders
    }

    if ((!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) && capabilityRouting?.providers) {
      const preferredModels = capabilityRouting.providers
        .filter(binding => !runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.includes(binding.providerId))
        .flatMap(binding => binding.models ?? [])
        .filter((model): model is string => Boolean(model))
      if (preferredModels.length > 0) {
        runtimeOptions.modelPreference = preferredModels
      }
    }

    const cacheKey = this.getCacheKey(capabilityId, payload, runtimeOptions)
    if (this.config.enableCache && !runtimeOptions.stream) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        logInfo(`Returning cached result for ${capabilityId}`)
        return cached
      }
    }

    const manager = ensureProviderManager()

    const enabledProviders = manager.getEnabled().map(p => p.getConfig())
    const typeFilteredProviders = enabledProviders.filter(config =>
      capability.supportedProviders.includes(config.type),
    )

    const accessFilteredProviders = typeFilteredProviders.filter((config) => {
      if (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) {
        return true
      }
      return runtimeOptions.allowedProviderIds.includes(config.id)
    })

    const missingKeyProviders = accessFilteredProviders
      .filter(config => config.type !== 'local' && !config.apiKey)
      .map(config => config.id)

    const availableProviders = accessFilteredProviders.filter(config => !(config.type !== 'local' && !config.apiKey))

    if (availableProviders.length === 0) {
      if (missingKeyProviders.length > 0) {
        throw new Error(
          `[Intelligence] No enabled providers for ${capabilityId}: missing API key for ${missingKeyProviders.join(', ')}`,
        )
      }
      throw new Error(`[Intelligence] No enabled providers for ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options: runtimeOptions,
      availableProviders,
    })

    const provider = manager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[Intelligence] Provider ${strategyResult.selectedProvider.id} not found`)
    }
    logInfo(`Selected provider ${strategyResult.selectedProvider.id} for ${capabilityId}`)

    let result: IntelligenceInvokeResult<T>
    const startTime = Date.now()

    const invokeEmbeddingWithGovernance = async (
      embeddingProvider: { embedding: (p: IntelligenceEmbeddingPayload, o: IntelligenceInvokeOptions) => Promise<IntelligenceInvokeResult<number[]>> },
    ): Promise<IntelligenceInvokeResult<number[]>> => {
      const embeddingPayload = payload as IntelligenceEmbeddingPayload
      const rawText = normalizeEmbeddingText(embeddingPayload.text)
      if (!rawText || !rawText.trim()) {
        throw new Error('[Intelligence] Embedding text is required')
      }

      const { chunks, truncated } = chunkText(rawText)
      const vectors: number[][] = []
      const weights: number[] = []
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      let latency = 0
      let model = ''
      let traceId = ''
      let providerName = ''

      for (const chunk of chunks) {
        const res = await embeddingProvider.embedding(
          {
            ...embeddingPayload,
            text: chunk,
          },
          runtimeOptions,
        )
        vectors.push(res.result)
        weights.push(Math.max(1, chunk.length))
        usage = {
          promptTokens: usage.promptTokens + (res.usage?.promptTokens ?? 0),
          completionTokens: usage.completionTokens + (res.usage?.completionTokens ?? 0),
          totalTokens: usage.totalTokens + (res.usage?.totalTokens ?? 0),
        }
        latency += res.latency ?? 0
        if (!model)
          model = res.model
        if (!traceId)
          traceId = res.traceId
        if (!providerName)
          providerName = res.provider
      }

      const aggregated = averageEmbeddings(vectors, weights)
      return {
        result: aggregated,
        usage,
        model,
        latency,
        traceId: traceId ? `${traceId}-chunked-${chunks.length}${truncated ? '-truncated' : ''}` : intelligenceAuditLogger.generateTraceId(),
        provider: providerName,
      }
    }

    const promptTemplate = (options.metadata?.promptTemplate as string | undefined) ?? capabilityRouting?.promptTemplate
    const promptVariables = options.metadata?.promptVariables as Record<string, any> | undefined
    const applyPromptTemplate = (messages: IntelligenceMessage[], template?: string) => {
      if (!template)
        return messages
      const systemMsg: IntelligenceMessage = { role: 'system', content: template }
      const rest = messages ?? []
      return [systemMsg, ...rest]
    }

    try {
      switch (capability.type) {
        // Core text capabilities
        case 'chat':
          {
            const chatPayload = payload as IntelligenceChatPayload
            let renderedTemplate = promptTemplate
            if (promptTemplate) {
              try {
                renderedTemplate = await renderPromptTemplate(promptTemplate, promptVariables)
              }
              catch (error) {
                logWarn('Failed to render prompt template, falling back to raw template', error)
              }
            }
            const promptAppliedMessages = applyPromptTemplate(chatPayload.messages ?? [], renderedTemplate)
            const nextPayload: IntelligenceChatPayload = {
              ...chatPayload,
              messages: promptAppliedMessages,
            }
            result = await provider.chat(nextPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          }
          break
        case 'embedding':
          result = await invokeEmbeddingWithGovernance(provider as any) as IntelligenceInvokeResult<T>
          break
        case 'translate':
          result = await provider.translate(payload as IntelligenceTranslatePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'summarize':
          result = await provider.summarize!(payload as IntelligenceSummarizePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'rewrite':
          result = await provider.rewrite!(payload as IntelligenceRewritePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'grammar-check':
          result = await provider.grammarCheck!(payload as IntelligenceGrammarCheckPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break

        // Code capabilities
        case 'code-generate':
          result = await provider.codeGenerate!(payload as IntelligenceCodeGeneratePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'code-explain':
          result = await provider.codeExplain!(payload as IntelligenceCodeExplainPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'code-review':
          result = await provider.codeReview!(payload as IntelligenceCodeReviewPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'code-refactor':
          result = await provider.codeRefactor!(payload as IntelligenceCodeRefactorPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'code-debug':
          result = await provider.codeDebug!(payload as IntelligenceCodeDebugPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break

        // Analysis capabilities
        case 'intent-detect':
          result = await provider.intentDetect!(payload as IntelligenceIntentDetectPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'sentiment-analyze':
          result = await provider.sentimentAnalyze!(payload as IntelligenceSentimentAnalyzePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'content-extract':
          result = await provider.contentExtract!(payload as IntelligenceContentExtractPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'keywords-extract':
          result = await provider.keywordsExtract!(payload as IntelligenceKeywordsExtractPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'classification':
          result = await provider.classification!(payload as IntelligenceClassificationPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break

        // Vision capabilities
        case 'vision':
        case 'vision-ocr':
          result = await provider.visionOcr(payload as IntelligenceVisionOcrPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'image-caption':
          result = await provider.imageCaption!(payload as IntelligenceImageCaptionPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'image-analyze':
          result = await provider.imageAnalyze!(payload as IntelligenceImageAnalyzePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'image-generate':
          result = await provider.imageGenerate!(payload as IntelligenceImageGeneratePayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break

        // RAG & Search capabilities
        case 'rag-query':
          result = await provider.ragQuery!(payload as IntelligenceRAGQueryPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'semantic-search':
          result = await provider.semanticSearch!(payload as IntelligenceSemanticSearchPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break
        case 'rerank':
          result = await provider.rerank!(payload as IntelligenceRerankPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break

        // Agent capabilities
        case 'agent':
          result = await provider.agent!(payload as IntelligenceAgentPayload, runtimeOptions) as IntelligenceInvokeResult<T>
          break

        default:
          throw new Error(`[Intelligence] Capability type ${capability.type} not implemented`)
      }

      if (this.config.enableCache) {
        this.setToCache(cacheKey, result)
      }

      if (this.config.enableAudit) {
        await this.logAudit({
          traceId: result.traceId,
          timestamp: startTime,
          capabilityId,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          latency: result.latency,
          success: true,
          caller: runtimeOptions.metadata?.caller,
          userId: runtimeOptions.metadata?.userId,
          promptHash: promptTemplate ? intelligenceAuditLogger.generatePromptHash(promptTemplate) : undefined,
          metadata: promptTemplate ? { promptTemplate, promptVariables } : undefined,
        })
      }

      logInfo(`${capabilityId} success via ${result.provider} (${result.model}) latency=${result.latency}ms`)
      return result
    }
    catch (error) {
      logError(`Invoke error for ${capabilityId}`, error)

      if (this.config.enableAudit) {
        await this.logAudit({
          traceId: intelligenceAuditLogger.generateTraceId(),
          timestamp: startTime,
          capabilityId,
          provider: strategyResult.selectedProvider.id,
          model: 'unknown',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latency: Date.now() - startTime,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          caller: runtimeOptions.metadata?.caller,
          userId: runtimeOptions.metadata?.userId,
          promptHash: promptTemplate ? intelligenceAuditLogger.generatePromptHash(promptTemplate) : undefined,
          metadata: promptTemplate ? { promptTemplate, promptVariables } : undefined,
        })
      }

      if (strategyResult.fallbackProviders.length > 0) {
        logWarn(`Attempting fallback providers for ${capabilityId}`)
        for (const fallbackConfig of strategyResult.fallbackProviders) {
          const fallbackProvider = manager.get(fallbackConfig.id)
          if (!fallbackProvider)
            continue

          try {
            switch (capability.type) {
              case 'chat':
                result = await fallbackProvider.chat(payload as IntelligenceChatPayload, runtimeOptions) as IntelligenceInvokeResult<T>
                break
              case 'embedding':
                result = await invokeEmbeddingWithGovernance(fallbackProvider as any) as IntelligenceInvokeResult<T>
                break
              case 'translate':
                result = await fallbackProvider.translate(payload as IntelligenceTranslatePayload, runtimeOptions) as IntelligenceInvokeResult<T>
                break
              case 'vision':
                result = await fallbackProvider.visionOcr(payload as IntelligenceVisionOcrPayload, runtimeOptions) as IntelligenceInvokeResult<T>
                break
              default:
                continue
            }

            logInfo(`Fallback successful with provider ${fallbackConfig.id}`)
            return result
          }
          catch (fallbackError) {
            logError(`Fallback provider ${fallbackConfig.id} failed`, fallbackError)
          }
        }
      }

      throw error
    }
  }

  async* invokeStream(
    capabilityId: string,
    payload: any,
    options: IntelligenceInvokeOptions = {},
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const capability = aiCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`[Intelligence] Capability ${capabilityId} not found`)
    }

    const runtimeOptions: IntelligenceInvokeOptions = { ...options, stream: true }
    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const configuredProviders
      = capabilityRouting?.providers
        ?.filter(binding => binding.enabled !== false)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map(binding => binding.providerId) ?? []

    if ((!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) && configuredProviders.length > 0) {
      runtimeOptions.allowedProviderIds = configuredProviders
    }

    if ((!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) && capabilityRouting?.providers) {
      const preferredModels = capabilityRouting.providers
        .filter(binding => !runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.includes(binding.providerId))
        .flatMap(binding => binding.models ?? [])
        .filter((model): model is string => Boolean(model))
      if (preferredModels.length > 0) {
        runtimeOptions.modelPreference = preferredModels
      }
    }

    const manager = ensureProviderManager()

    const enabledProviders = manager.getEnabled().map(p => p.getConfig())
    const typeFilteredProviders = enabledProviders.filter(config =>
      capability.supportedProviders.includes(config.type),
    )

    const availableProviders = typeFilteredProviders.filter((config) => {
      if (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) {
        return true
      }
      return runtimeOptions.allowedProviderIds.includes(config.id)
    })

    if (availableProviders.length === 0) {
      throw new Error(`[Intelligence] No enabled providers for ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options: runtimeOptions,
      availableProviders,
    })

    const provider = manager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[Intelligence] Provider ${strategyResult.selectedProvider.id} not found`)
    }

    if (capability.type !== 'chat') {
      throw new Error('[Intelligence] Stream is only supported for chat capability')
    }

    yield* provider.chatStream(payload as IntelligenceChatPayload, runtimeOptions)
  }

  private getCacheKey(capabilityId: string, payload: any, options: IntelligenceInvokeOptions): string {
    return `${capabilityId}:${JSON.stringify(payload)}:${JSON.stringify(options)}`
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key)
    if (!cached)
      return null

    const expiration = this.config.cacheExpiration || 1800
    if (Date.now() - cached.timestamp > expiration * 1000) {
      this.cache.delete(key)
      return null
    }

    return cached.result
  }

  private setToCache(key: string, result: any): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    })
  }

  private async logAudit(log: IntelligenceAuditLogEntry): Promise<void> {
    try {
      await intelligenceAuditLogger.log(log)
    }
    catch (error) {
      logError('Failed to log audit entry:', error)
    }
  }

  /**
   * Check quota before invoking a capability
   */
  async checkQuota(
    caller?: string,
    estimatedTokens: number = 0,
  ): Promise<{ allowed: boolean, reason?: string }> {
    if (!this.config.enableQuota || !caller) {
      return { allowed: true }
    }

    try {
      const result = await intelligenceQuotaManager.checkQuota(caller, 'plugin', estimatedTokens)
      return { allowed: result.allowed, reason: result.reason }
    }
    catch (error) {
      logError('Failed to check quota:', error)
      return { allowed: true } // Fail open on quota check errors
    }
  }

  /**
   * Get recent audit logs (from memory cache)
   */
  getRecentAuditLogs(limit: number = 100): IntelligenceAuditLogEntry[] {
    return intelligenceAuditLogger.getRecentLogs(limit)
  }

  /**
   * Query audit logs from database
   */
  async queryAuditLogs(options: {
    caller?: string
    capabilityId?: string
    startTime?: number
    endTime?: number
    limit?: number
  } = {}): Promise<IntelligenceAuditLogEntry[]> {
    return intelligenceAuditLogger.queryLogs(options)
  }

  /**
   * Get usage statistics for today
   */
  async getTodayStats(callerId?: string) {
    return intelligenceAuditLogger.getTodayStats(callerId)
  }

  /**
   * Get usage statistics for this month
   */
  async getMonthStats(callerId?: string) {
    return intelligenceAuditLogger.getMonthStats(callerId)
  }

  /**
   * Get usage statistics for a period
   */
  async getUsageStats(
    callerId: string,
    periodType: 'day' | 'month',
    startPeriod?: string,
    endPeriod?: string,
  ) {
    return intelligenceAuditLogger.getUsageStats(callerId, periodType, startPeriod, endPeriod)
  }

  clearCache(): void {
    this.cache.clear()
    logInfo('Cache cleared')
  }

  /**
   * Export audit logs to CSV format
   */
  exportLogsToCSV(logs: IntelligenceAuditLogEntry[]): string {
    const headers = [
      'Trace ID',
      'Timestamp',
      'Capability',
      'Provider',
      'Model',
      'Caller',
      'Prompt Tokens',
      'Completion Tokens',
      'Total Tokens',
      'Estimated Cost',
      'Latency (ms)',
      'Success',
      'Error',
    ]

    const rows = logs.map(log => [
      log.traceId,
      new Date(log.timestamp).toISOString(),
      log.capabilityId,
      log.provider,
      log.model,
      log.caller || '',
      log.usage.promptTokens,
      log.usage.completionTokens,
      log.usage.totalTokens,
      log.estimatedCost?.toFixed(6) || '',
      log.latency,
      log.success ? 'Yes' : 'No',
      log.error || '',
    ])

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
  }

  /**
   * Export audit logs to JSON format
   */
  exportLogsToJSON(logs: IntelligenceAuditLogEntry[]): string {
    return JSON.stringify(logs, null, 2)
  }

  /**
   * Cleanup old audit logs (retention policy)
   */
  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    return intelligenceAuditLogger.cleanupOldLogs(retentionDays)
  }

  text = {
    chat: (payload: IntelligenceChatPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<string>('text.chat', payload, options),

    chatStream: (payload: IntelligenceChatPayload, options?: IntelligenceInvokeOptions) =>
      this.invokeStream('text.chat', payload, options),

    translate: (payload: IntelligenceTranslatePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<string>('text.translate', payload, options),

    summarize: (payload: IntelligenceSummarizePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<string>('text.summarize', payload, options),

    rewrite: (payload: IntelligenceRewritePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<string>('text.rewrite', payload, options),

    grammarCheck: (payload: IntelligenceGrammarCheckPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceGrammarCheckResult>('text.grammar', payload, options),
  }

  embedding = {
    generate: (payload: IntelligenceEmbeddingPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<number[]>('embedding.generate', payload, options),
  }

  code = {
    generate: (payload: IntelligenceCodeGeneratePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceCodeGenerateResult>('code.generate', payload, options),

    explain: (payload: IntelligenceCodeExplainPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceCodeExplainResult>('code.explain', payload, options),

    review: (payload: IntelligenceCodeReviewPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceCodeReviewResult>('code.review', payload, options),

    refactor: (payload: IntelligenceCodeRefactorPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceCodeRefactorResult>('code.refactor', payload, options),

    debug: (payload: IntelligenceCodeDebugPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceCodeDebugResult>('code.debug', payload, options),
  }

  analysis = {
    detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceIntentDetectResult>('intent.detect', payload, options),

    analyzeSentiment: (payload: IntelligenceSentimentAnalyzePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceSentimentAnalyzeResult>('sentiment.analyze', payload, options),

    extractContent: (payload: IntelligenceContentExtractPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceContentExtractResult>('content.extract', payload, options),

    extractKeywords: (payload: IntelligenceKeywordsExtractPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceKeywordsExtractResult>('keywords.extract', payload, options),

    classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceClassificationResult>('text.classify', payload, options),
  }

  vision = {
    ocr: (payload: IntelligenceVisionOcrPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceVisionOcrResult>('vision.ocr', payload, options),

    caption: (payload: IntelligenceImageCaptionPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceImageCaptionResult>('image.caption', payload, options),

    analyze: (payload: IntelligenceImageAnalyzePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceImageAnalyzeResult>('image.analyze', payload, options),

    generate: (payload: IntelligenceImageGeneratePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceImageGenerateResult>('image.generate', payload, options),
  }

  rag = {
    query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceRAGQueryResult>('rag.query', payload, options),

    semanticSearch: (payload: IntelligenceSemanticSearchPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceSemanticSearchResult>('search.semantic', payload, options),

    rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceRerankResult>('search.rerank', payload, options),
  }

  agent = {
    run: (payload: IntelligenceAgentPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceAgentResult>('agent.run', payload, options),
  }

  /**
   * Test a provider connection
   * @param providerConfig - Provider configuration to test
   * @returns Test result with success status, message, and latency
   */
  async testProvider(providerConfig: IntelligenceProviderConfig): Promise<{
    success: boolean
    message: string
    latency?: number
    timestamp: number
  }> {
    const startTime = Date.now()
    const timestamp = Date.now()

    try {
      // Validate provider configuration
      if (!providerConfig.enabled) {
        return {
          success: false,
          message: 'Provider is disabled',
          timestamp,
        }
      }

      if (!providerConfig.apiKey && providerConfig.type !== 'local') {
        return {
          success: false,
          message: 'API key is required',
          timestamp,
        }
      }

      // Create a temporary provider instance for testing
      const manager = ensureProviderManager()
      const provider = manager.createProviderInstance(providerConfig)

      // Use a simple test payload
      const testPayload: IntelligenceChatPayload = {
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        maxTokens: 10,
      }

      const timeout = providerConfig.timeout || 30000

      // Test the provider with timeout
      const result = await Promise.race([
        provider.chat(testPayload, { timeout }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout),
        ),
      ])

      const latency = Date.now() - startTime

      return {
        success: true,
        message: `Connection successful. Model: ${result.model}`,
        latency,
        timestamp,
      }
    }
    catch (error) {
      const latency = Date.now() - startTime
      let message = 'Connection failed'

      if (error instanceof Error) {
        // Parse common error messages
        if (error.message.includes('timeout')) {
          message = 'Request timeout - check your network connection'
        }
        else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          message = 'Invalid API key'
        }
        else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Access forbidden - check your API key permissions'
        }
        else if (error.message.includes('404')) {
          message = 'API endpoint not found - check your base URL'
        }
        else if (error.message.includes('429')) {
          message = 'Rate limit exceeded'
        }
        else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          message = 'Provider service error - try again later'
        }
        else if (error.message.includes('network') || error.message.includes('fetch')) {
          message = 'Network error - check your internet connection'
        }
        else {
          message = error.message
        }
      }

      return {
        success: false,
        message,
        latency,
        timestamp,
      }
    }
  }
}

export const ai = new AiSDK()

function normalizeStrategyId(id?: string): string | undefined {
  if (!id)
    return id
  if (id === 'priority')
    return 'rule-based-default'
  if (id === 'adaptive')
    return 'adaptive-default'
  return id
}
