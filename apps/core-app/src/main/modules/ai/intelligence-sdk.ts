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
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceIntentDetectPayload,
  IntelligenceIntentDetectResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceKeywordsExtractPayload,
  IntelligenceKeywordsExtractResult,
  IntelligenceMessage,
  IntelligencePromptBinding,
  IntelligencePromptRecord,
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceProviderManagerAdapter,
  PromptWorkflow,
  PromptWorkflowExecution,
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
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceSummarizePayload,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
  IntelligenceTranslatePayload,
  IntelligenceVideoGeneratePayload,
  IntelligenceVideoGenerateResult,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import type { AgentTask } from '@talex-touch/utils'
import type { IntelligenceAuditLogEntry } from './intelligence-audit-logger'
import { stdout } from 'node:process'
import { format } from 'node:util'
import { PromptTemplate } from '@langchain/core/prompts'
import chalk from 'chalk'
import { intelligenceAuditLogger } from './intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { agentManager } from './agents'
import { intelligenceQuotaManager } from './intelligence-quota-manager'
import { strategyManager } from './intelligence-strategy-manager'
import { IntelligenceProvider } from './runtime/base-provider'
import { enterPerfContext } from '../../utils/perf-context'

const INTELLIGENCE_TAG = chalk.hex('#1e88e5').bold('[Intelligence]')
const logInfo = (...args: unknown[]) => stdout.write(`${format(INTELLIGENCE_TAG, ...args)}\n`)
const logWarn = (...args: unknown[]) => console.warn(INTELLIGENCE_TAG, ...args)
const logError = (...args: unknown[]) => console.error(INTELLIGENCE_TAG, ...args)

const MAX_EMBEDDING_TOTAL_CHARS = 32_000
const EMBEDDING_CHUNK_CHARS = 2_000
const MAX_EMBEDDING_CHUNKS = 16

function normalizeEmbeddingText(input: string | string[]): string {
  if (Array.isArray(input)) {
    return input.filter(Boolean).join('\n')
  }
  return input
}

function chunkText(text: string): { chunks: string[]; truncated: boolean } {
  const normalized = text.trim()
  const limited =
    normalized.length > MAX_EMBEDDING_TOTAL_CHARS
      ? normalized.slice(0, MAX_EMBEDDING_TOTAL_CHARS)
      : normalized

  const chunks: string[] = []
  for (let i = 0; i < limited.length; i += EMBEDDING_CHUNK_CHARS) {
    chunks.push(limited.slice(i, i + EMBEDDING_CHUNK_CHARS))
    if (chunks.length >= MAX_EMBEDDING_CHUNKS) break
  }

  const truncated =
    limited.length !== normalized.length || chunks.join('').length !== limited.length
  return { chunks: chunks.length > 0 ? chunks : [''], truncated }
}

function averageEmbeddings(vectors: number[][], weights: number[]): number[] {
  if (vectors.length === 0) return []

  const dim = vectors[0]?.length ?? 0
  if (dim === 0) return []

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

  if (weightSum <= 0) return sum

  for (let j = 0; j < dim; j++) {
    sum[j] /= weightSum
  }
  return sum
}

type CapabilityMethodName = keyof IntelligenceProviderAdapter

const CAPABILITY_METHOD_MAP: Record<
  string,
  { method: CapabilityMethodName; requiresOverride?: boolean }
> = {
  chat: { method: 'chat' },
  embedding: { method: 'embedding' },
  translate: { method: 'translate' },
  summarize: { method: 'summarize' },
  rewrite: { method: 'rewrite' },
  'grammar-check': { method: 'grammarCheck' },
  'code-generate': { method: 'codeGenerate' },
  'code-explain': { method: 'codeExplain' },
  'code-review': { method: 'codeReview' },
  'code-refactor': { method: 'codeRefactor' },
  'code-debug': { method: 'codeDebug' },
  'intent-detect': { method: 'intentDetect' },
  'sentiment-analyze': { method: 'sentimentAnalyze' },
  'content-extract': { method: 'contentExtract' },
  'keywords-extract': { method: 'keywordsExtract' },
  classification: { method: 'classification' },
  vision: { method: 'visionOcr', requiresOverride: true },
  'vision-ocr': { method: 'visionOcr', requiresOverride: true },
  'image-caption': { method: 'imageCaption', requiresOverride: true },
  'image-analyze': { method: 'imageAnalyze', requiresOverride: true },
  'image-generate': { method: 'imageGenerate', requiresOverride: true },
  'image-edit': { method: 'imageEdit', requiresOverride: true },
  'video-generate': { method: 'videoGenerate', requiresOverride: true },
  tts: { method: 'tts', requiresOverride: true },
  stt: { method: 'stt', requiresOverride: true },
  'audio-transcribe': { method: 'audioTranscribe', requiresOverride: true },
  'rag-query': { method: 'ragQuery', requiresOverride: true },
  'semantic-search': { method: 'semanticSearch', requiresOverride: true },
  rerank: { method: 'rerank', requiresOverride: true },
  workflow: { method: 'chat' },
  agent: { method: 'chat' }
}

interface WorkflowExecutionStepInput {
  id?: string
  name?: string
  description?: string
  capabilityId?: string
  input?: unknown
  agentId?: string
  type?: 'execute' | 'plan' | 'chat'
}

interface WorkflowCapabilityPayload {
  workflow?: PromptWorkflow
  steps?: WorkflowExecutionStepInput[]
  inputs?: Record<string, unknown>
  continueOnError?: boolean
}

function resolveCapabilityMethod(
  capabilityType: string,
  stream: boolean
): { method: CapabilityMethodName; requiresOverride?: boolean } | null {
  if (stream) {
    if (capabilityType !== 'chat') return null
    return { method: 'chatStream' }
  }
  return CAPABILITY_METHOD_MAP[capabilityType] ?? null
}

function providerSupportsCapability(
  provider: IntelligenceProviderAdapter,
  capabilityId: string,
  capabilityType: string,
  stream: boolean
): boolean {
  const config = provider.getConfig()
  if (Array.isArray(config.capabilities) && config.capabilities.length > 0) {
    if (!config.capabilities.includes(capabilityId)) {
      return false
    }
  }

  const methodInfo = resolveCapabilityMethod(capabilityType, stream)
  if (!methodInfo) return false

  const providerRecord = provider as unknown as Record<string, unknown>
  const method = providerRecord[methodInfo.method]
  if (typeof method !== 'function') return false

  if (methodInfo.requiresOverride && provider instanceof IntelligenceProvider) {
    const baseRecord = IntelligenceProvider.prototype as unknown as Record<string, unknown>
    const baseMethod = baseRecord[methodInfo.method]
    if (method === baseMethod) {
      return false
    }
  }

  return true
}

function extractMustacheVariables(template: string): string[] {
  const vars = new Set<string>()
  const regex = /\{\{\s*([\w.]+)\s*\}\}/g
  while (true) {
    const match = regex.exec(template)
    if (!match) break
    if (match[1]) vars.add(match[1])
  }
  return Array.from(vars)
}

async function renderPromptTemplate(
  template: string,
  variables?: Record<string, unknown>
): Promise<string> {
  const inputVariables = extractMustacheVariables(template)
  if (inputVariables.length === 0) {
    return template
  }

  const prompt = new PromptTemplate({
    template,
    inputVariables,
    templateFormat: 'mustache'
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

export class TuffIntelligenceSDK {
  private config: IntelligenceSDKConfig = {
    providers: [],
    defaultStrategy: 'adaptive-default',
    enableAudit: true,
    enableCache: false,
    enableQuota: true,
    capabilities: {},
    promptRegistry: [],
    promptBindings: []
  }

  private cache = new Map<
    string,
    { result: IntelligenceInvokeResult<unknown>; timestamp: number }
  >()

  /**
   * Track repeated invoke failures per capability to suppress log noise.
   * Only the first failure and every Nth failure are logged at error level;
   * intermediate failures are logged as warn (single line) to reduce spam.
   */
  private invokeFailureCounts = new Map<string, number>()

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
        ...config.capabilities
      }
    }

    if (config.promptRegistry) {
      nextConfig.promptRegistry = [...config.promptRegistry]
    }

    if (config.promptBindings) {
      nextConfig.promptBindings = [...config.promptBindings]
    }

    if (config.defaultStrategy) {
      nextConfig.defaultStrategy =
        normalizeStrategyId(config.defaultStrategy) || this.config.defaultStrategy
    }

    this.config = {
      ...nextConfig,
      defaultStrategy: normalizeStrategyId(nextConfig.defaultStrategy) || 'adaptive-default'
    }

    if (config.providers) {
      const manager = ensureProviderManager()
      manager.clear()
      config.providers.forEach((providerConfig) => {
        try {
          manager.registerFromConfig(providerConfig)
        } catch (error) {
          logError(`Failed to register provider ${providerConfig.id}:`, error)
        }
      })
    }

    if (this.config.defaultStrategy) {
      strategyManager.setDefaultStrategy(this.config.defaultStrategy)
    }

    logInfo('Configuration updated')
  }

  async invoke<T = unknown>(
    capabilityId: string,
    payload: unknown,
    options: IntelligenceInvokeOptions = {}
  ): Promise<IntelligenceInvokeResult<T>> {
    const payloadRecord =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    const disposeInvoke = enterPerfContext('Intelligence.invoke', {
      capabilityId,
      payloadType: typeof payload,
      payloadTextLength:
        typeof payload === 'string'
          ? payload.length
          : typeof payloadRecord?.text === 'string'
            ? payloadRecord.text.length
            : undefined,
      messageCount: Array.isArray(payloadRecord?.messages)
        ? payloadRecord?.messages.length
        : undefined,
      stream: Boolean(options?.stream),
      caller: options.metadata?.caller
    })
    try {
      const capability = intelligenceCapabilityRegistry.get(capabilityId)
      if (!capability) {
        throw new Error(`[Intelligence] Capability ${capabilityId} not found`)
      }
      logInfo(`invoke -> ${capabilityId}`)

      const caller = options.metadata?.caller
      if (this.config.enableQuota && caller) {
        const quotaCheck = await this.checkQuota(caller)
        if (!quotaCheck.allowed) {
          throw new Error(`[Intelligence] Quota exceeded: ${quotaCheck.reason}`)
        }
      }

      const { runtimeOptions, promptTemplate, promptVariables } = this.prepareRuntimeOptions(
        capabilityId,
        options
      )

      const cacheKey = this.getCacheKey(capabilityId, payload, runtimeOptions)
      if (this.config.enableCache && !runtimeOptions.stream) {
        const cached = this.getFromCache<T>(cacheKey)
        if (cached) {
          logInfo(`Returning cached result for ${capabilityId}`)
          return cached
        }
      }

      const manager = ensureProviderManager()
      const availableProviders = this.resolveAvailableProviders(
        manager,
        capabilityId,
        capability.type,
        capability.supportedProviders,
        runtimeOptions,
        false
      )

      const strategyResult = await strategyManager.select({
        capabilityId,
        options: runtimeOptions,
        availableProviders
      })

      const provider = manager.get(strategyResult.selectedProvider.id)
      if (!provider) {
        throw new Error(`[Intelligence] Provider ${strategyResult.selectedProvider.id} not found`)
      }
      logInfo(`Selected provider ${strategyResult.selectedProvider.id} for ${capabilityId}`)

      this.applyModelPreference(runtimeOptions, strategyResult.selectedProvider, capabilityId)

      const startTime = Date.now()

      try {
        const result = await this.invokeByCapabilityType<T>(
          provider,
          capability.type,
          payload,
          runtimeOptions,
          promptTemplate,
          promptVariables
        )

        if (this.config.enableCache) {
          this.setToCache(cacheKey, result)
        }

        await this.writeSuccessAudit({
          result,
          startTime,
          capabilityId,
          caller: runtimeOptions.metadata?.caller,
          userId: runtimeOptions.metadata?.userId,
          promptTemplate,
          promptVariables
        })

        logInfo(
          `${capabilityId} success via ${result.provider} (${result.model}) latency=${result.latency}ms`
        )
        // Reset failure counter on success so the next failure gets full logging
        this.invokeFailureCounts.delete(capabilityId)
        return result
      } catch (error) {
        // Suppress repetitive error logging: only log full error on first
        // failure and every 10th failure; intermediate failures get a concise warn.
        const failCount = (this.invokeFailureCounts.get(capabilityId) ?? 0) + 1
        this.invokeFailureCounts.set(capabilityId, failCount)
        if (failCount === 1 || failCount % 10 === 0) {
          logWarn(
            `Invoke failed for ${capabilityId}` + (failCount > 1 ? ` (${failCount} failures)` : ''),
            error instanceof Error ? error.message : error
          )
        }

        await this.writeFailureAudit({
          error,
          startTime,
          capabilityId,
          providerId: strategyResult.selectedProvider.id,
          caller: runtimeOptions.metadata?.caller,
          userId: runtimeOptions.metadata?.userId,
          promptTemplate,
          promptVariables
        })

        const fallbackResult = await this.tryFallbackProviders<T>({
          capabilityId,
          capabilityType: capability.type,
          payload,
          runtimeOptions,
          manager,
          fallbackProviders: strategyResult.fallbackProviders
        })

        if (fallbackResult) {
          return fallbackResult
        }

        throw error
      }
    } finally {
      disposeInvoke()
    }
  }

  private resolvePromptRecord(
    binding: IntelligencePromptBinding
  ): IntelligencePromptRecord | undefined {
    const registry = this.config.promptRegistry ?? []
    const candidates = registry.filter((item) => {
      if (item.id !== binding.promptId) return false
      if (item.status !== 'active') return false
      if (binding.providerId && item.providerId && item.providerId !== binding.providerId) {
        return false
      }
      return true
    })

    if (candidates.length <= 0) {
      return undefined
    }

    if (binding.promptVersion) {
      return candidates.find((item) => item.version === binding.promptVersion)
    }

    return [...candidates].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
  }

  private normalizePromptBindingCapability(
    capabilityId: string,
    binding: IntelligencePromptBinding
  ): IntelligencePromptBinding {
    const { capabilityId: _ignored, ...rest } = binding
    return {
      capabilityId,
      ...rest
    }
  }

  private resolvePromptTemplateByBinding(
    capabilityId: string,
    metadataBinding?: IntelligencePromptBinding
  ): string | undefined {
    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const orderedBindings: IntelligencePromptBinding[] = []

    if (metadataBinding?.promptId) {
      orderedBindings.push(this.normalizePromptBindingCapability(capabilityId, metadataBinding))
    }
    if (capabilityRouting?.promptBinding?.promptId) {
      orderedBindings.push(
        this.normalizePromptBindingCapability(capabilityId, capabilityRouting.promptBinding)
      )
    }
    for (const binding of this.config.promptBindings ?? []) {
      if (binding.capabilityId === capabilityId) {
        orderedBindings.push(binding)
      }
    }

    for (const binding of orderedBindings) {
      const record = this.resolvePromptRecord(binding)
      if (record?.template) {
        return record.template
      }
    }

    return capabilityRouting?.promptTemplate
  }

  private prepareRuntimeOptions(
    capabilityId: string,
    options: IntelligenceInvokeOptions
  ): {
    runtimeOptions: IntelligenceInvokeOptions
    promptTemplate?: string
    promptVariables?: Record<string, unknown>
  } {
    const runtimeOptions: IntelligenceInvokeOptions = { ...options }
    runtimeOptions.metadata = {
      ...(runtimeOptions.metadata ?? {}),
      capabilityId
    }

    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const configuredProviders =
      capabilityRouting?.providers
        ?.filter((binding) => binding.enabled !== false)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map((binding) => binding.providerId) ?? []

    if (
      (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) &&
      configuredProviders.length > 0
    ) {
      runtimeOptions.allowedProviderIds = configuredProviders
    }

    if (
      (!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) &&
      capabilityRouting?.providers
    ) {
      const preferredModels = capabilityRouting.providers
        .filter(
          (binding) =>
            !runtimeOptions.allowedProviderIds ||
            runtimeOptions.allowedProviderIds.includes(binding.providerId)
        )
        .flatMap((binding) => binding.models ?? [])
        .filter((model): model is string => Boolean(model))
      if (preferredModels.length > 0) {
        runtimeOptions.modelPreference = preferredModels
      }
    }

    const metadataPromptBinding = options.metadata?.promptBinding as
      | IntelligencePromptBinding
      | undefined
    const promptTemplate =
      (options.metadata?.promptTemplate as string | undefined) ??
      this.resolvePromptTemplateByBinding(capabilityId, metadataPromptBinding)
    const promptVariables = options.metadata?.promptVariables as Record<string, unknown> | undefined

    return {
      runtimeOptions,
      promptTemplate,
      promptVariables
    }
  }

  private resolveAvailableProviders(
    manager: IntelligenceProviderManagerAdapter,
    capabilityId: string,
    capabilityType: string,
    supportedProviderTypes: Array<IntelligenceProviderConfig['type']>,
    runtimeOptions: IntelligenceInvokeOptions,
    stream: boolean
  ): IntelligenceProviderConfig[] {
    if (!resolveCapabilityMethod(capabilityType, stream)) {
      throw new Error(`[Intelligence] Capability type ${capabilityType} not supported`)
    }

    const enabledProviders = manager.getEnabled()
    const typeFilteredProviders = enabledProviders.filter((provider) =>
      supportedProviderTypes.includes(provider.getConfig().type)
    )

    const accessFilteredProviders = typeFilteredProviders.filter((provider) => {
      if (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) {
        return true
      }
      return runtimeOptions.allowedProviderIds.includes(provider.getConfig().id)
    })

    const capabilityFilteredProviders = accessFilteredProviders.filter((provider) =>
      providerSupportsCapability(provider, capabilityId, capabilityType, stream)
    )

    if (capabilityFilteredProviders.length === 0 && accessFilteredProviders.length > 0) {
      throw new Error(
        `[Intelligence] No enabled providers for ${capabilityId}: capability not supported`
      )
    }

    const missingKeyProviders = capabilityFilteredProviders
      .filter((provider) => provider.getConfig().type !== 'local' && !provider.getConfig().apiKey)
      .map((provider) => provider.getConfig().id)

    const availableProviders = capabilityFilteredProviders
      .filter(
        (provider) => !(provider.getConfig().type !== 'local' && !provider.getConfig().apiKey)
      )
      .map((provider) => provider.getConfig())

    if (availableProviders.length === 0) {
      if (missingKeyProviders.length > 0) {
        throw new Error(
          `[Intelligence] No enabled providers for ${capabilityId}: missing API key for ${missingKeyProviders.join(', ')}`
        )
      }
      throw new Error(`[Intelligence] No enabled providers for ${capabilityId}`)
    }

    return availableProviders
  }

  private applyModelPreference(
    runtimeOptions: IntelligenceInvokeOptions,
    selectedProvider: IntelligenceProviderConfig,
    capabilityId: string
  ): void {
    if (!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) {
      return
    }

    const providerModels = new Set<string>()
    const { defaultModel, models } = selectedProvider
    if (defaultModel) providerModels.add(defaultModel)
    if (Array.isArray(models)) {
      for (const model of models) {
        if (model) providerModels.add(model)
      }
    }

    if (providerModels.size === 0) {
      return
    }

    const filtered = runtimeOptions.modelPreference.filter((model) => providerModels.has(model))
    if (filtered.length === 0) {
      logWarn(
        `Model preference not supported by ${selectedProvider.id} for ${capabilityId}, fallback to provider default.`
      )
      runtimeOptions.modelPreference = undefined
      return
    }

    runtimeOptions.modelPreference = filtered
  }

  private applyPromptTemplate(
    messages: IntelligenceMessage[],
    template?: string
  ): IntelligenceMessage[] {
    if (!template) return messages
    const systemMsg: IntelligenceMessage = { role: 'system', content: template }
    const rest = messages ?? []
    return [systemMsg, ...rest]
  }

  private async invokeEmbeddingWithGovernance(
    embeddingProvider: {
      embedding: (
        payload: IntelligenceEmbeddingPayload,
        options: IntelligenceInvokeOptions
      ) => Promise<IntelligenceInvokeResult<number[]>>
    },
    payload: IntelligenceEmbeddingPayload,
    runtimeOptions: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>> {
    const rawText = normalizeEmbeddingText(payload.text)
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
          ...payload,
          text: chunk
        },
        runtimeOptions
      )

      vectors.push(res.result)
      weights.push(Math.max(1, chunk.length))
      usage = {
        promptTokens: usage.promptTokens + (res.usage?.promptTokens ?? 0),
        completionTokens: usage.completionTokens + (res.usage?.completionTokens ?? 0),
        totalTokens: usage.totalTokens + (res.usage?.totalTokens ?? 0)
      }
      latency += res.latency ?? 0
      if (!model) model = res.model
      if (!traceId) traceId = res.traceId
      if (!providerName) providerName = res.provider
    }

    const aggregated = averageEmbeddings(vectors, weights)

    return {
      result: aggregated,
      usage,
      model,
      latency,
      traceId: traceId
        ? `${traceId}-chunked-${chunks.length}${truncated ? '-truncated' : ''}`
        : intelligenceAuditLogger.generateTraceId(),
      provider: providerName
    }
  }

  private normalizeWorkflowPayload(payload: unknown): {
    steps: WorkflowExecutionStepInput[]
    continueOnError: boolean
  } {
    const data = (payload ?? {}) as WorkflowCapabilityPayload
    const continueOnError = Boolean(data.continueOnError)

    const simpleSteps = Array.isArray(data.steps)
      ? data.steps
          .map((step, index) => ({
            id: step.id || `step-${index + 1}`,
            name: step.name,
            description: step.description,
            capabilityId: step.capabilityId,
            input: step.input,
            agentId: step.agentId,
            type: step.type
          }))
          .filter((step) => Boolean(step.id))
      : []

    if (simpleSteps.length > 0) {
      return { steps: simpleSteps, continueOnError }
    }

    const workflow = data.workflow
    if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error('[Intelligence] workflow.execute requires non-empty steps')
    }

    const steps = workflow.steps.map((step, index) => {
      const promptInput =
        step.config.template ||
        step.config.variables ||
        step.config.body ||
        step.config.condition ||
        step.config.transform
      return {
        id: step.id || `step-${index + 1}`,
        name: step.name,
        description: step.name || step.type,
        capabilityId: step.config.capabilityId,
        input: promptInput
      }
    })

    return { steps, continueOnError }
  }

  private toTextPayload(value: unknown): string {
    if (typeof value === 'string') return value
    if (value === undefined || value === null) return ''
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  private toAgentResult(raw: unknown, fallbackText: string): IntelligenceAgentResult {
    const source = typeof raw === 'string' ? raw : this.toTextPayload(raw)
    let parsed: Partial<IntelligenceAgentResult> | null = null

    try {
      const data = JSON.parse(source) as Partial<IntelligenceAgentResult>
      if (data && typeof data === 'object') {
        parsed = data
      }
    } catch {
      parsed = null
    }

    const normalizedSteps = Array.isArray(parsed?.steps)
      ? parsed.steps.map((step) => ({
          thought: typeof step?.thought === 'string' ? step.thought : 'generated',
          action: typeof step?.action === 'string' ? step.action : undefined,
          actionInput: step?.actionInput,
          observation: typeof step?.observation === 'string' ? step.observation : undefined
        }))
      : []

    const normalizedToolCalls = Array.isArray(parsed?.toolCalls)
      ? parsed.toolCalls.map((call) => ({
          tool: typeof call?.tool === 'string' ? call.tool : 'unknown',
          input: call?.input,
          output: call?.output
        }))
      : []

    const resultText =
      typeof parsed?.result === 'string' && parsed.result.trim().length > 0
        ? parsed.result
        : fallbackText

    return {
      result: resultText,
      steps:
        normalizedSteps.length > 0
          ? normalizedSteps
          : [{ thought: 'processed', observation: resultText.slice(0, 500) }],
      toolCalls: normalizedToolCalls,
      iterations:
        typeof parsed?.iterations === 'number' && Number.isFinite(parsed.iterations)
          ? parsed.iterations
          : Math.max(1, normalizedSteps.length || 1)
    }
  }

  private async invokeAgentWithRuntime(
    provider: IntelligenceProviderAdapter,
    payload: IntelligenceAgentPayload,
    runtimeOptions: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceAgentResult>> {
    if (!payload.task || typeof payload.task !== 'string') {
      throw new Error('[Intelligence] agent.run requires a task string')
    }

    const start = Date.now()
    const agentId =
      typeof runtimeOptions.metadata?.agentId === 'string'
        ? runtimeOptions.metadata.agentId
        : undefined

    if (agentId && agentManager.isInitialized()) {
      const taskInput = runtimeOptions.metadata?.agentInput ?? {
        goal: payload.task,
        task: payload.task
      }

      const task: AgentTask = {
        agentId,
        type: 'execute',
        input: taskInput,
        context: {
          sessionId:
            typeof runtimeOptions.metadata?.sessionId === 'string'
              ? runtimeOptions.metadata.sessionId
              : undefined,
          workingDirectory:
            typeof runtimeOptions.metadata?.workingDirectory === 'string'
              ? runtimeOptions.metadata.workingDirectory
              : undefined,
          metadata: runtimeOptions.metadata
        }
      }

      const result = await agentManager.executeTaskImmediate(task)
      if (result.success) {
        const text = this.toTextPayload(result.output)
        return {
          result: {
            result: text,
            steps: [{ thought: `Delegated to ${agentId}`, observation: text.slice(0, 500) }],
            toolCalls: [],
            iterations: 1
          },
          usage: {
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            totalTokens: result.usage?.totalTokens ?? 0
          },
          model: 'tuffintelligence-agent-runtime',
          latency: Date.now() - start,
          traceId: result.taskId,
          provider: 'intelligence-runtime'
        }
      }
      throw new Error(result.error || `Agent ${agentId} execution failed`)
    }

    const response = await provider.chat(
      {
        messages: [
          {
            role: 'system',
            content:
              'You are TuffIntelligence Orchestrator. Return strict JSON: {"result":"...","steps":[{"thought":"...","action":"...","actionInput":{},"observation":"..."}],"toolCalls":[{"tool":"...","input":{},"output":{}}],"iterations":1}'
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: payload.task,
              context: payload.context,
              constraints: payload.constraints ?? [],
              tools: payload.tools ?? [],
              memory: payload.memory ?? []
            })
          }
        ]
      },
      runtimeOptions
    )

    const normalizedResult = this.toAgentResult(
      response.result,
      this.toTextPayload(response.result)
    )
    return {
      ...response,
      result: normalizedResult
    }
  }

  private async invokeWorkflowWithRuntime(
    provider: IntelligenceProviderAdapter,
    payload: unknown,
    runtimeOptions: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<PromptWorkflowExecution>> {
    const start = Date.now()
    const traceId = intelligenceAuditLogger.generateTraceId()
    const { steps, continueOnError } = this.normalizeWorkflowPayload(payload)

    if (
      steps.length > 0 &&
      steps.every((step) => typeof step.agentId === 'string' && step.agentId)
    ) {
      if (!agentManager.isInitialized()) {
        throw new Error('[Intelligence] Agent runtime not initialized')
      }
      const workflowTask: AgentTask = {
        agentId: 'builtin.workflow-agent',
        type: 'execute',
        input: {
          capability: 'workflow.run',
          steps: steps.map((step) => ({
            id: step.id,
            agentId: step.agentId!,
            type: step.type ?? 'execute',
            input: step.input ?? {}
          })),
          continueOnError
        },
        context: {
          sessionId:
            typeof runtimeOptions.metadata?.sessionId === 'string'
              ? runtimeOptions.metadata.sessionId
              : undefined,
          workingDirectory:
            typeof runtimeOptions.metadata?.workingDirectory === 'string'
              ? runtimeOptions.metadata.workingDirectory
              : undefined,
          metadata: runtimeOptions.metadata
        }
      }

      const workflowResult = await agentManager.executeTaskImmediate(workflowTask)
      if (!workflowResult.success) {
        throw new Error(workflowResult.error || 'Workflow execution failed')
      }

      const output = (workflowResult.output ?? {}) as {
        success?: boolean
        results?: Array<{ stepId?: string; success?: boolean; result?: unknown }>
      }

      const execution: PromptWorkflowExecution = {
        id: traceId,
        workflowId: 'builtin.workflow-agent',
        status: output.success === false ? 'failed' : 'completed',
        startedAt: start,
        completedAt: Date.now(),
        inputs: { steps },
        outputs: { result: output },
        steps: (output.results ?? []).map((item, index) => ({
          stepId: item.stepId || `step-${index + 1}`,
          status: item.success === false ? 'failed' : 'completed',
          startedAt: start,
          completedAt: Date.now(),
          output: item.result
        })),
        error: output.success === false ? 'workflow execution failed' : undefined
      }

      return {
        result: execution,
        usage: {
          promptTokens: workflowResult.usage?.promptTokens ?? 0,
          completionTokens: workflowResult.usage?.completionTokens ?? 0,
          totalTokens: workflowResult.usage?.totalTokens ?? 0
        },
        model: 'tuffintelligence-workflow-runtime',
        latency: Date.now() - start,
        traceId,
        provider: 'intelligence-runtime'
      }
    }

    const execution: PromptWorkflowExecution = {
      id: traceId,
      workflowId: 'inline.workflow',
      status: 'running',
      startedAt: start,
      inputs: {
        steps
      },
      steps: []
    }

    const outputs: Record<string, unknown> = {}
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let model = provider.getConfig().defaultModel || 'tuffintelligence-workflow-runtime'

    for (const step of steps) {
      const startedAt = Date.now()
      const stepState: PromptWorkflowExecution['steps'][number] = {
        stepId: step.id || `step-${execution.steps.length + 1}`,
        status: 'running',
        startedAt,
        input: step.input
      }
      execution.steps.push(stepState)

      try {
        let output: unknown
        if (step.capabilityId && step.capabilityId !== 'workflow.execute') {
          const invokeResult = await this.invoke(
            step.capabilityId,
            step.input ?? {},
            runtimeOptions
          )
          output = invokeResult.result
          usage = {
            promptTokens: usage.promptTokens + (invokeResult.usage?.promptTokens ?? 0),
            completionTokens: usage.completionTokens + (invokeResult.usage?.completionTokens ?? 0),
            totalTokens: usage.totalTokens + (invokeResult.usage?.totalTokens ?? 0)
          }
          model = invokeResult.model || model
        } else {
          const chatResult = await provider.chat(
            {
              messages: [
                {
                  role: 'user',
                  content:
                    step.description ||
                    this.toTextPayload(step.input) ||
                    `Execute workflow step ${step.id}`
                }
              ]
            },
            runtimeOptions
          )
          output = chatResult.result
          usage = {
            promptTokens: usage.promptTokens + (chatResult.usage?.promptTokens ?? 0),
            completionTokens: usage.completionTokens + (chatResult.usage?.completionTokens ?? 0),
            totalTokens: usage.totalTokens + (chatResult.usage?.totalTokens ?? 0)
          }
          model = chatResult.model || model
        }

        outputs[stepState.stepId] = output
        stepState.output = output
        stepState.status = 'completed'
        stepState.completedAt = Date.now()
      } catch (error) {
        stepState.status = 'failed'
        stepState.error = error instanceof Error ? error.message : String(error)
        stepState.completedAt = Date.now()
        if (!continueOnError) {
          execution.status = 'failed'
          execution.error = stepState.error
          break
        }
      }
    }

    if (execution.status !== 'failed') {
      execution.status = 'completed'
    }
    execution.completedAt = Date.now()
    execution.outputs = outputs

    return {
      result: execution,
      usage,
      model,
      latency: Date.now() - start,
      traceId,
      provider: provider.getConfig().id
    }
  }

  private async invokeByCapabilityType<T>(
    provider: IntelligenceProviderAdapter,
    capabilityType: string,
    payload: unknown,
    runtimeOptions: IntelligenceInvokeOptions,
    promptTemplate?: string,
    promptVariables?: Record<string, unknown>
  ): Promise<IntelligenceInvokeResult<T>> {
    switch (capabilityType) {
      case 'chat': {
        const chatPayload = payload as IntelligenceChatPayload
        let renderedTemplate = promptTemplate
        if (promptTemplate) {
          try {
            renderedTemplate = await renderPromptTemplate(promptTemplate, promptVariables)
          } catch (error) {
            logWarn('Failed to render prompt template, falling back to raw template', error)
          }
        }
        const promptAppliedMessages = this.applyPromptTemplate(
          chatPayload.messages ?? [],
          renderedTemplate
        )
        const nextPayload: IntelligenceChatPayload = {
          ...chatPayload,
          messages: promptAppliedMessages
        }
        return (await provider.chat(nextPayload, runtimeOptions)) as IntelligenceInvokeResult<T>
      }

      case 'embedding':
        return (await this.invokeEmbeddingWithGovernance(
          provider as {
            embedding: (
              p: IntelligenceEmbeddingPayload,
              o: IntelligenceInvokeOptions
            ) => Promise<IntelligenceInvokeResult<number[]>>
          },
          payload as IntelligenceEmbeddingPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'translate':
        return (await provider.translate(
          payload as IntelligenceTranslatePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'summarize':
        return (await provider.summarize!(
          payload as IntelligenceSummarizePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'rewrite':
        return (await provider.rewrite!(
          payload as IntelligenceRewritePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'grammar-check':
        return (await provider.grammarCheck!(
          payload as IntelligenceGrammarCheckPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      case 'code-generate':
        return (await provider.codeGenerate!(
          payload as IntelligenceCodeGeneratePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'code-explain':
        return (await provider.codeExplain!(
          payload as IntelligenceCodeExplainPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'code-review':
        return (await provider.codeReview!(
          payload as IntelligenceCodeReviewPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'code-refactor':
        return (await provider.codeRefactor!(
          payload as IntelligenceCodeRefactorPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'code-debug':
        return (await provider.codeDebug!(
          payload as IntelligenceCodeDebugPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      case 'intent-detect':
        return (await provider.intentDetect!(
          payload as IntelligenceIntentDetectPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'sentiment-analyze':
        return (await provider.sentimentAnalyze!(
          payload as IntelligenceSentimentAnalyzePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'content-extract':
        return (await provider.contentExtract!(
          payload as IntelligenceContentExtractPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'keywords-extract':
        return (await provider.keywordsExtract!(
          payload as IntelligenceKeywordsExtractPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'classification':
        return (await provider.classification!(
          payload as IntelligenceClassificationPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      case 'vision':
      case 'vision-ocr':
        return (await provider.visionOcr(
          payload as IntelligenceVisionOcrPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'image-caption':
        return (await provider.imageCaption!(
          payload as IntelligenceImageCaptionPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'image-analyze':
        return (await provider.imageAnalyze!(
          payload as IntelligenceImageAnalyzePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'image-generate':
        return (await provider.imageGenerate!(
          payload as IntelligenceImageGeneratePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'image-edit':
        return (await provider.imageEdit!(
          payload as IntelligenceImageEditPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'video-generate':
        return (await provider.videoGenerate!(
          payload as IntelligenceVideoGeneratePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'tts':
        return (await provider.tts!(
          payload as IntelligenceTTSPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'stt':
        return (await provider.stt!(
          payload as IntelligenceSTTPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'audio-transcribe':
        return (await provider.audioTranscribe!(
          payload as IntelligenceAudioTranscribePayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      case 'rag-query':
        return (await provider.ragQuery!(
          payload as IntelligenceRAGQueryPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'semantic-search':
        return (await provider.semanticSearch!(
          payload as IntelligenceSemanticSearchPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>
      case 'rerank':
        return (await provider.rerank!(
          payload as IntelligenceRerankPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      case 'workflow':
        return (await this.invokeWorkflowWithRuntime(
          provider,
          payload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      case 'agent':
        return (await this.invokeAgentWithRuntime(
          provider,
          payload as IntelligenceAgentPayload,
          runtimeOptions
        )) as IntelligenceInvokeResult<T>

      default:
        throw new Error(`[Intelligence] Capability type ${capabilityType} is unsupported`)
    }
  }

  private async invokeFallbackByCapabilityType<T>(
    provider: IntelligenceProviderAdapter,
    capabilityType: string,
    payload: unknown,
    runtimeOptions: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<T> | null> {
    return this.invokeByCapabilityType(provider, capabilityType, payload, runtimeOptions)
  }

  private async tryFallbackProviders<T>(params: {
    capabilityId: string
    capabilityType: string
    payload: unknown
    runtimeOptions: IntelligenceInvokeOptions
    manager: IntelligenceProviderManagerAdapter
    fallbackProviders: IntelligenceProviderConfig[]
  }): Promise<IntelligenceInvokeResult<T> | null> {
    const { capabilityId, capabilityType, payload, runtimeOptions, manager, fallbackProviders } =
      params

    if (fallbackProviders.length === 0) {
      return null
    }

    logWarn(`Attempting fallback providers for ${capabilityId}`)

    for (const fallbackConfig of fallbackProviders) {
      const fallbackProvider = manager.get(fallbackConfig.id)
      if (!fallbackProvider) continue

      try {
        const result = await this.invokeFallbackByCapabilityType<T>(
          fallbackProvider,
          capabilityType,
          payload,
          runtimeOptions
        )
        if (!result) continue

        logInfo(`Fallback successful with provider ${fallbackConfig.id}`)
        return result
      } catch (fallbackError) {
        // Downgrade to warn with concise message to reduce log noise.
        // Full error details are captured in the audit log.
        const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        logWarn(`Fallback provider ${fallbackConfig.id} failed: ${msg}`)
      }
    }

    return null
  }

  private getAuditMeta(
    promptTemplate?: string,
    promptVariables?: Record<string, unknown>
  ): { promptHash?: string; metadata?: Record<string, unknown> } {
    if (!promptTemplate) {
      return {}
    }

    return {
      promptHash: intelligenceAuditLogger.generatePromptHash(promptTemplate),
      metadata: { promptTemplate, promptVariables }
    }
  }

  private async writeSuccessAudit(params: {
    result: IntelligenceInvokeResult<unknown>
    startTime: number
    capabilityId: string
    caller?: string
    userId?: string
    promptTemplate?: string
    promptVariables?: Record<string, unknown>
  }): Promise<void> {
    if (!this.config.enableAudit) {
      return
    }

    const { result, startTime, capabilityId, caller, userId, promptTemplate, promptVariables } =
      params
    const auditMeta = this.getAuditMeta(promptTemplate, promptVariables)

    await this.logAudit({
      traceId: result.traceId,
      timestamp: startTime,
      capabilityId,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      latency: result.latency,
      success: true,
      caller,
      userId,
      ...auditMeta
    })
  }

  private async writeFailureAudit(params: {
    error: unknown
    startTime: number
    capabilityId: string
    providerId: string
    caller?: string
    userId?: string
    promptTemplate?: string
    promptVariables?: Record<string, unknown>
  }): Promise<void> {
    if (!this.config.enableAudit) {
      return
    }

    const {
      error,
      startTime,
      capabilityId,
      providerId,
      caller,
      userId,
      promptTemplate,
      promptVariables
    } = params
    const auditMeta = this.getAuditMeta(promptTemplate, promptVariables)

    await this.logAudit({
      traceId: intelligenceAuditLogger.generateTraceId(),
      timestamp: startTime,
      capabilityId,
      provider: providerId,
      model: 'unknown',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      caller,
      userId,
      ...auditMeta
    })
  }

  async *invokeStream(
    capabilityId: string,
    payload: unknown,
    options: IntelligenceInvokeOptions = {}
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const capability = intelligenceCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`[Intelligence] Capability ${capabilityId} not found`)
    }

    const runtimeOptions: IntelligenceInvokeOptions = { ...options, stream: true }
    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const configuredProviders =
      capabilityRouting?.providers
        ?.filter((binding) => binding.enabled !== false)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map((binding) => binding.providerId) ?? []

    if (
      (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) &&
      configuredProviders.length > 0
    ) {
      runtimeOptions.allowedProviderIds = configuredProviders
    }

    if (
      (!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) &&
      capabilityRouting?.providers
    ) {
      const preferredModels = capabilityRouting.providers
        .filter(
          (binding) =>
            !runtimeOptions.allowedProviderIds ||
            runtimeOptions.allowedProviderIds.includes(binding.providerId)
        )
        .flatMap((binding) => binding.models ?? [])
        .filter((model): model is string => Boolean(model))
      if (preferredModels.length > 0) {
        runtimeOptions.modelPreference = preferredModels
      }
    }

    if (capability.type !== 'chat') {
      throw new Error('[Intelligence] Stream is only supported for chat capability')
    }

    const manager = ensureProviderManager()

    if (!resolveCapabilityMethod(capability.type, true)) {
      throw new Error(`[Intelligence] Capability type ${capability.type} not supported`)
    }

    const enabledProviders = manager.getEnabled()
    const typeFilteredProviders = enabledProviders.filter((provider) =>
      capability.supportedProviders.includes(provider.getConfig().type)
    )

    const accessFilteredProviders = typeFilteredProviders.filter((provider) => {
      if (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) {
        return true
      }
      return runtimeOptions.allowedProviderIds.includes(provider.getConfig().id)
    })

    const capabilityFilteredProviders = accessFilteredProviders.filter((provider) =>
      providerSupportsCapability(provider, capabilityId, capability.type, true)
    )

    if (capabilityFilteredProviders.length === 0 && accessFilteredProviders.length > 0) {
      throw new Error(
        `[Intelligence] No enabled providers for ${capabilityId}: capability not supported`
      )
    }

    const missingKeyProviders = capabilityFilteredProviders
      .filter((provider) => provider.getConfig().type !== 'local' && !provider.getConfig().apiKey)
      .map((provider) => provider.getConfig().id)

    const availableProviders = capabilityFilteredProviders
      .filter(
        (provider) => !(provider.getConfig().type !== 'local' && !provider.getConfig().apiKey)
      )
      .map((provider) => provider.getConfig())

    if (availableProviders.length === 0) {
      if (missingKeyProviders.length > 0) {
        throw new Error(
          `[Intelligence] No enabled providers for ${capabilityId}: missing API key for ${missingKeyProviders.join(', ')}`
        )
      }
      throw new Error(`[Intelligence] No enabled providers for ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options: runtimeOptions,
      availableProviders
    })

    const provider = manager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[Intelligence] Provider ${strategyResult.selectedProvider.id} not found`)
    }

    yield* provider.chatStream(payload as IntelligenceChatPayload, runtimeOptions)
  }

  private getCacheKey(
    capabilityId: string,
    payload: unknown,
    options: IntelligenceInvokeOptions
  ): string {
    return `${capabilityId}:${JSON.stringify(payload)}:${JSON.stringify(options)}`
  }

  private getFromCache<T>(key: string): IntelligenceInvokeResult<T> | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const expiration = this.config.cacheExpiration || 1800
    if (Date.now() - cached.timestamp > expiration * 1000) {
      this.cache.delete(key)
      return null
    }

    return cached.result as IntelligenceInvokeResult<T>
  }

  private setToCache(key: string, result: IntelligenceInvokeResult<unknown>): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    })
  }

  private async logAudit(log: IntelligenceAuditLogEntry): Promise<void> {
    try {
      await intelligenceAuditLogger.log(log)
    } catch (error) {
      logError('Failed to log audit entry:', error)
    }
  }

  /**
   * Check quota before invoking a capability
   */
  async checkQuota(
    caller?: string,
    estimatedTokens: number = 0
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config.enableQuota || !caller) {
      return { allowed: true }
    }

    try {
      const result = await intelligenceQuotaManager.checkQuota(caller, 'plugin', estimatedTokens)
      return { allowed: result.allowed, reason: result.reason }
    } catch (error) {
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
  async queryAuditLogs(
    options: {
      caller?: string
      capabilityId?: string
      startTime?: number
      endTime?: number
      limit?: number
    } = {}
  ): Promise<IntelligenceAuditLogEntry[]> {
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
    endPeriod?: string
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
      'Error'
    ]

    const rows = logs.map((log) => [
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
      log.error || ''
    ])

    return [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
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
      this.invoke<IntelligenceGrammarCheckResult>('text.grammar', payload, options)
  }

  embedding = {
    generate: (payload: IntelligenceEmbeddingPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<number[]>('embedding.generate', payload, options)
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
      this.invoke<IntelligenceCodeDebugResult>('code.debug', payload, options)
  }

  analysis = {
    detectIntent: (payload: IntelligenceIntentDetectPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceIntentDetectResult>('intent.detect', payload, options),

    analyzeSentiment: (
      payload: IntelligenceSentimentAnalyzePayload,
      options?: IntelligenceInvokeOptions
    ) => this.invoke<IntelligenceSentimentAnalyzeResult>('sentiment.analyze', payload, options),

    extractContent: (
      payload: IntelligenceContentExtractPayload,
      options?: IntelligenceInvokeOptions
    ) => this.invoke<IntelligenceContentExtractResult>('content.extract', payload, options),

    extractKeywords: (
      payload: IntelligenceKeywordsExtractPayload,
      options?: IntelligenceInvokeOptions
    ) => this.invoke<IntelligenceKeywordsExtractResult>('keywords.extract', payload, options),

    classify: (payload: IntelligenceClassificationPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceClassificationResult>('text.classify', payload, options)
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

    edit: (payload: IntelligenceImageEditPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceImageEditResult>('image.edit', payload, options)
  }

  audio = {
    tts: (payload: IntelligenceTTSPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceTTSResult>('audio.tts', payload, options),

    stt: (payload: IntelligenceSTTPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceSTTResult>('audio.stt', payload, options),

    transcribe: (
      payload: IntelligenceAudioTranscribePayload,
      options?: IntelligenceInvokeOptions
    ) => this.invoke<IntelligenceAudioTranscribeResult>('audio.transcribe', payload, options)
  }

  video = {
    generate: (payload: IntelligenceVideoGeneratePayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceVideoGenerateResult>('video.generate', payload, options)
  }

  rag = {
    query: (payload: IntelligenceRAGQueryPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceRAGQueryResult>('rag.query', payload, options),

    semanticSearch: (
      payload: IntelligenceSemanticSearchPayload,
      options?: IntelligenceInvokeOptions
    ) => this.invoke<IntelligenceSemanticSearchResult>('search.semantic', payload, options),

    rerank: (payload: IntelligenceRerankPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceRerankResult>('search.rerank', payload, options)
  }

  agent = {
    run: (payload: IntelligenceAgentPayload, options?: IntelligenceInvokeOptions) =>
      this.invoke<IntelligenceAgentResult>('agent.run', payload, options)
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
          timestamp
        }
      }

      if (!providerConfig.apiKey && providerConfig.type !== 'local') {
        return {
          success: false,
          message: 'API key is required',
          timestamp
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
            content: 'Hello'
          }
        ],
        maxTokens: 10
      }

      const timeout = providerConfig.timeout || 30000

      // Test the provider with timeout
      const result = await Promise.race([
        provider.chat(testPayload, { timeout }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ])

      const latency = Date.now() - startTime

      return {
        success: true,
        message: `Connection successful. Model: ${result.model}`,
        latency,
        timestamp
      }
    } catch (error) {
      const latency = Date.now() - startTime
      let message = 'Connection failed'

      if (error instanceof Error) {
        // Parse common error messages
        if (error.message.includes('timeout')) {
          message = 'Request timeout - check your network connection'
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          message = 'Invalid API key'
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Access forbidden - check your API key permissions'
        } else if (error.message.includes('404')) {
          message = 'API endpoint not found - check your base URL'
        } else if (error.message.includes('429')) {
          message = 'Rate limit exceeded'
        } else if (
          error.message.includes('500') ||
          error.message.includes('502') ||
          error.message.includes('503')
        ) {
          message = 'Provider service error - try again later'
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          message = 'Network error - check your internet connection'
        } else {
          message = error.message
        }
      }

      return {
        success: false,
        message,
        latency,
        timestamp
      }
    }
  }
}

export const tuffIntelligence = new TuffIntelligenceSDK()
export const intelligence = tuffIntelligence

function normalizeStrategyId(id?: string): string | undefined {
  if (!id) return id
  if (id === 'priority') return 'rule-based-default'
  if (id === 'adaptive') return 'adaptive-default'
  return id
}
