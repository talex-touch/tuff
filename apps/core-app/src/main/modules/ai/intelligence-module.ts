import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceProviderConfig,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { IntelligenceCapabilityType, IntelligenceProviderType } from '@talex-touch/utils'
import { getTuffTransportMain, type HandlerContext } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { genTouchApp } from '../../core'
import { createLogger } from '../../utils/logger'
import { safeApiHandler, withPermissionSafeApi, type ApiResponse } from '../../utils/safe-handler'
import { BaseModule } from '../abstract-base-module'
import { capabilityTesterRegistry } from './capability-testers'
import { aiCapabilityRegistry } from './intelligence-capability-registry'
import {
  debugPrintConfig,
  ensureAiConfigLoaded,
  getCapabilityOptions,
  setupConfigUpdateListener
} from './intelligence-config'
import { ai, setIntelligenceProviderManager } from './intelligence-sdk'
import { fetchProviderModels } from './provider-models'
import { AnthropicProvider } from './providers/anthropic-provider'
import { DeepSeekProvider } from './providers/deepseek-provider'
import { LocalProvider } from './providers/local-provider'
import { OpenAIProvider } from './providers/openai-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import type { QuotaConfig } from './intelligence-quota-manager'
import { IntelligenceProviderManager } from './runtime/provider-manager'

const intelligenceLog = createLogger('Intelligence')

type IntelligenceInvokePayload = {
  capabilityId: string
  payload: unknown
  options?: IntelligenceInvokeOptions
}

type IntelligenceChatLangchainPayload = {
  messages: IntelligenceMessage[]
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

type IntelligenceTestProviderPayload = { provider: IntelligenceProviderConfig }

type IntelligenceGetCapabilityTestMetaPayload = { capabilityId: string }

type IntelligenceTestCapabilityPayload = {
  capabilityId: string
  providerId?: string
  userInput?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, unknown>
} & Record<string, unknown>

type IntelligenceFetchModelsPayload = { provider: IntelligenceProviderConfig }

type IntelligenceAuditLogQuery = {
  caller?: string
  capabilityId?: string
  startTime?: number
  endTime?: number
  limit?: number
}

type IntelligenceStatsPayload = { callerId?: string }

type IntelligenceUsageStatsPayload = {
  callerId: string
  periodType: 'day' | 'month'
  startPeriod?: string
  endPeriod?: string
}

type QuotaLookupPayload = { callerId?: string; callerType?: QuotaConfig['callerType'] }

type QuotaCheckPayload = QuotaLookupPayload & { estimatedTokens?: number }

const intelligenceInvokeEvent = defineRawEvent<
  IntelligenceInvokePayload,
  ApiResponse<IntelligenceInvokeResult<unknown>>
>('intelligence:invoke')
const intelligenceChatLangchainEvent = defineRawEvent<
  IntelligenceChatLangchainPayload,
  ApiResponse<IntelligenceInvokeResult<string>>
>('intelligence:chat-langchain')
const intelligenceTestProviderEvent = defineRawEvent<
  IntelligenceTestProviderPayload,
  ApiResponse<unknown>
>('intelligence:test-provider')
const intelligenceGetCapabilityTestMetaEvent = defineRawEvent<
  IntelligenceGetCapabilityTestMetaPayload,
  ApiResponse<{ requiresUserInput: boolean; inputHint: string }>
>('intelligence:get-capability-test-meta')
const intelligenceTestCapabilityEvent = defineRawEvent<
  IntelligenceTestCapabilityPayload,
  ApiResponse<unknown>
>('intelligence:test-capability')
const intelligenceFetchModelsEvent = defineRawEvent<
  IntelligenceFetchModelsPayload,
  ApiResponse<{ success: boolean; models?: string[]; message?: string }>
>('intelligence:fetch-models')
const intelligenceGetAuditLogsEvent = defineRawEvent<
  IntelligenceAuditLogQuery | undefined,
  ApiResponse<unknown>
>('intelligence:get-audit-logs')
const intelligenceGetTodayStatsEvent = defineRawEvent<
  IntelligenceStatsPayload | undefined,
  ApiResponse<unknown>
>('intelligence:get-today-stats')
const intelligenceGetMonthStatsEvent = defineRawEvent<
  IntelligenceStatsPayload | undefined,
  ApiResponse<unknown>
>('intelligence:get-month-stats')
const intelligenceGetUsageStatsEvent = defineRawEvent<
  IntelligenceUsageStatsPayload,
  ApiResponse<unknown>
>('intelligence:get-usage-stats')
const intelligenceGetQuotaEvent = defineRawEvent<QuotaLookupPayload, ApiResponse<unknown>>(
  'intelligence:get-quota'
)
const intelligenceSetQuotaEvent = defineRawEvent<QuotaConfig, ApiResponse<unknown>>(
  'intelligence:set-quota'
)
const intelligenceDeleteQuotaEvent = defineRawEvent<QuotaLookupPayload, ApiResponse<unknown>>(
  'intelligence:delete-quota'
)
const intelligenceGetAllQuotasEvent = defineRawEvent<void, ApiResponse<unknown>>(
  'intelligence:get-all-quotas'
)
const intelligenceCheckQuotaEvent = defineRawEvent<QuotaCheckPayload, ApiResponse<unknown>>(
  'intelligence:check-quota'
)
const intelligenceGetCurrentUsageEvent = defineRawEvent<QuotaLookupPayload, ApiResponse<unknown>>(
  'intelligence:get-current-usage'
)

/**
 * Intelligence Module - Manages AI capabilities and providers.
 *
 * Supports two provider types:
 * 1. Builtin Providers - Natively supported (OpenAI, Anthropic, DeepSeek, etc.)
 * 2. Custom Providers - OpenAI-compatible custom endpoints
 */
export class IntelligenceModule extends BaseModule<TalexEvents> {
  static readonly key: symbol = Symbol.for('Intelligence')
  name: ModuleKey = IntelligenceModule.key

  private manager: IntelligenceProviderManager | null = null
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  constructor() {
    super(IntelligenceModule.key)
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    // 在 onInit 阶段获取已初始化的 transport
    const channel = genTouchApp().channel
    if (!channel) {
      throw new Error('[Intelligence] Touch channel not ready')
    }
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    intelligenceLog.info('Initializing Intelligence module')

    // 创建 Provider Manager
    this.manager = new IntelligenceProviderManager()

    // 注册 Builtin Provider Factories
    this.registerBuiltinProviders()

    // 注册 Custom Provider Factory (OpenAI-compatible)
    this.registerCustomProvider()

    // 注册能力
    this.registerCapabilities()

    // 设置全局 Provider Manager
    setIntelligenceProviderManager(this.manager)
    intelligenceLog.info('Provider manager injected')

    // 注册 IPC 通道
    this.registerChannels()

    // 设置配置更新监听器
    setupConfigUpdateListener()

    // 打印配置文件内容（调试用）
    debugPrintConfig()

    // 强制加载初始配置（force=true 确保即使 signature 相同也会重新加载）
    ensureAiConfigLoaded(true)

    intelligenceLog.success('Intelligence module initialized')
  }

  async onDestroy(): Promise<void> {
    intelligenceLog.info('Destroying Intelligence module')
    this.manager?.clear()
    this.manager = null
  }

  /**
   * 注册内置 Provider Factories
   */
  private registerBuiltinProviders(): void {
    if (!this.manager) return

    intelligenceLog.info('Registering builtin provider factories')

    this.manager.registerFactory(
      IntelligenceProviderType.OPENAI,
      (config) => new OpenAIProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.ANTHROPIC,
      (config) => new AnthropicProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.DEEPSEEK,
      (config) => new DeepSeekProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.SILICONFLOW,
      (config) => new SiliconflowProvider(config)
    )
    this.manager.registerFactory(
      IntelligenceProviderType.LOCAL,
      (config) => new LocalProvider(config)
    )

    intelligenceLog.success('Builtin provider factories registered')
  }

  /**
   * 注册自定义 Provider Factory (OpenAI-compatible)
   */
  private registerCustomProvider(): void {
    if (!this.manager) return

    intelligenceLog.info('Registering custom provider factory')

    // Custom provider 使用 OpenAI-compatible 接口
    this.manager.registerFactory(IntelligenceProviderType.CUSTOM, (config) => {
      intelligenceLog.info(`Creating custom provider: ${config.id}`)
      return new OpenAIProvider(config)
    })

    intelligenceLog.success('Custom provider factory registered')
  }

  /**
   * 注册 AI 能力
   */
  private registerCapabilities(): void {
    intelligenceLog.info('Registering capabilities')

    const ALL_PROVIDERS = [
      IntelligenceProviderType.OPENAI,
      IntelligenceProviderType.ANTHROPIC,
      IntelligenceProviderType.DEEPSEEK,
      IntelligenceProviderType.SILICONFLOW,
      IntelligenceProviderType.LOCAL,
      IntelligenceProviderType.CUSTOM
    ]

    const VISION_PROVIDERS = [
      IntelligenceProviderType.OPENAI,
      IntelligenceProviderType.ANTHROPIC,
      IntelligenceProviderType.SILICONFLOW,
      IntelligenceProviderType.LOCAL,
      IntelligenceProviderType.CUSTOM
    ]

    // ========================================================================
    // Core Text Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Text Chat',
      description: 'General-purpose text chat capability',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'text.translate',
      type: IntelligenceCapabilityType.TRANSLATE,
      name: 'Translation',
      description: 'Multi-language text translation',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'text.summarize',
      type: IntelligenceCapabilityType.SUMMARIZE,
      name: 'Summarization',
      description: 'Generate concise summaries of text content',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'text.rewrite',
      type: IntelligenceCapabilityType.REWRITE,
      name: 'Text Rewrite',
      description: 'Rewrite text with different styles and tones',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'text.grammar',
      type: IntelligenceCapabilityType.GRAMMAR_CHECK,
      name: 'Grammar Check',
      description: 'Check and correct grammar, spelling, and style',
      supportedProviders: ALL_PROVIDERS
    })

    // ========================================================================
    // Embedding Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Generate Embeddings',
      description: 'Generate text embeddings for semantic search',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.DEEPSEEK,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.LOCAL,
        IntelligenceProviderType.CUSTOM
      ]
    })

    // ========================================================================
    // Code Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'code.generate',
      type: IntelligenceCapabilityType.CODE_GENERATE,
      name: 'Code Generation',
      description: 'Generate code from natural language descriptions',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'code.explain',
      type: IntelligenceCapabilityType.CODE_EXPLAIN,
      name: 'Code Explanation',
      description: 'Explain code functionality and logic',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'code.review',
      type: IntelligenceCapabilityType.CODE_REVIEW,
      name: 'Code Review',
      description: 'Review code for issues, security, and best practices',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'code.refactor',
      type: IntelligenceCapabilityType.CODE_REFACTOR,
      name: 'Code Refactoring',
      description: 'Refactor code for better readability and maintainability',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'code.debug',
      type: IntelligenceCapabilityType.CODE_DEBUG,
      name: 'Code Debugging',
      description: 'Analyze and fix code bugs',
      supportedProviders: ALL_PROVIDERS
    })

    // ========================================================================
    // Analysis Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'intent.detect',
      type: IntelligenceCapabilityType.INTENT_DETECT,
      name: 'Intent Detection',
      description: 'Detect user intent from text input',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'sentiment.analyze',
      type: IntelligenceCapabilityType.SENTIMENT_ANALYZE,
      name: 'Sentiment Analysis',
      description: 'Analyze sentiment and emotions in text',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'content.extract',
      type: IntelligenceCapabilityType.CONTENT_EXTRACT,
      name: 'Content Extraction',
      description: 'Extract entities and key information from text',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'keywords.extract',
      type: IntelligenceCapabilityType.KEYWORDS_EXTRACT,
      name: 'Keyword Extraction',
      description: 'Extract keywords and key phrases from text',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'text.classify',
      type: IntelligenceCapabilityType.CLASSIFICATION,
      name: 'Text Classification',
      description: 'Classify text into predefined categories',
      supportedProviders: ALL_PROVIDERS
    })

    // ========================================================================
    // Vision Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'vision.ocr',
      type: IntelligenceCapabilityType.VISION_OCR,
      name: 'Vision OCR',
      description: 'Optical character recognition from images',
      supportedProviders: VISION_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'image.caption',
      type: IntelligenceCapabilityType.IMAGE_CAPTION,
      name: 'Image Captioning',
      description: 'Generate descriptive captions for images',
      supportedProviders: VISION_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'image.analyze',
      type: IntelligenceCapabilityType.IMAGE_ANALYZE,
      name: 'Image Analysis',
      description: 'Analyze image content, objects, and scenes',
      supportedProviders: VISION_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'image.generate',
      type: IntelligenceCapabilityType.IMAGE_GENERATE,
      name: 'Image Generation',
      description: 'Generate images from text prompts',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    aiCapabilityRegistry.register({
      id: 'image.edit',
      type: IntelligenceCapabilityType.IMAGE_EDIT,
      name: 'Image Editing',
      description: 'Edit and modify images with AI',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.CUSTOM]
    })

    // ========================================================================
    // Audio Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'audio.tts',
      type: IntelligenceCapabilityType.TTS,
      name: 'Text-to-Speech',
      description: 'Convert text to natural speech',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    aiCapabilityRegistry.register({
      id: 'audio.stt',
      type: IntelligenceCapabilityType.STT,
      name: 'Speech-to-Text',
      description: 'Convert speech to text',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    aiCapabilityRegistry.register({
      id: 'audio.transcribe',
      type: IntelligenceCapabilityType.AUDIO_TRANSCRIBE,
      name: 'Audio Transcription',
      description: 'Transcribe audio with timestamps and speaker detection',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    // ========================================================================
    // RAG & Search Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'rag.query',
      type: IntelligenceCapabilityType.RAG_QUERY,
      name: 'RAG Query',
      description: 'Query documents with retrieval-augmented generation',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'Search documents by semantic similarity',
      supportedProviders: [
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.SILICONFLOW,
        IntelligenceProviderType.CUSTOM
      ]
    })

    aiCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Document Reranking',
      description: 'Rerank search results by relevance',
      supportedProviders: [IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM]
    })

    // ========================================================================
    // Workflow & Agent Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'workflow.execute',
      type: IntelligenceCapabilityType.WORKFLOW,
      name: 'Workflow Execution',
      description: 'Execute multi-step prompt workflows',
      supportedProviders: ALL_PROVIDERS
    })

    aiCapabilityRegistry.register({
      id: 'agent.run',
      type: IntelligenceCapabilityType.AGENT,
      name: 'Agent Execution',
      description: 'Run autonomous AI agents with tool access',
      supportedProviders: ALL_PROVIDERS
    })

    intelligenceLog.success(`Registered ${aiCapabilityRegistry.size()} capabilities`)
  }

  /**
   * 注册 IPC 通道处理器
   */
  private registerChannels(): void {
    if (!this.transport) return

    intelligenceLog.info('Registering IPC channels')

    const { registerSafe, registerProtectedSafe } = this.createChannelRegistrars(this.transport)

    this.registerInvokeChannels(registerProtectedSafe)
    this.registerCapabilityChannels(registerSafe)
    this.registerStatsChannels(registerSafe)
    this.registerQuotaChannels(registerSafe)

    intelligenceLog.success('IPC channels registered')
  }

  private createChannelRegistrars(transport: NonNullable<IntelligenceModule['transport']>) {
    const createErrorLogger = (action: string) => {
      return (error: unknown) => {
        intelligenceLog.error(`${action} failed:`, { error })
      }
    }

    const registerSafe = <TRes>(
      event: { toEventName: () => string },
      action: string,
      handler: (payload: any, context: HandlerContext) => Promise<TRes> | TRes
    ) => {
      transport.on(
        event as any,
        safeApiHandler<any, TRes>(handler, {
          onError: (error) => createErrorLogger(action)(error)
        })
      )
    }

    const registerProtectedSafe = <TRes>(
      event: { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: any, context: HandlerContext) => Promise<TRes> | TRes
    ) => {
      transport.on(
        event as any,
        withPermissionSafeApi({ permissionId }, handler, {
          onError: (error) => createErrorLogger(action)(error)
        })
      )
    }

    return {
      registerSafe,
      registerProtectedSafe
    }
  }

  private registerInvokeChannels(
    registerProtectedSafe: <TRes>(
      event: { toEventName: () => string },
      action: string,
      permissionId: string,
      handler: (payload: any, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerProtectedSafe(
      intelligenceInvokeEvent,
      'Invoke capability',
      'ai.basic',
      async (data) => {
        if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
          throw new Error('Invalid invoke payload')
        }

        const { capabilityId, payload, options } = data
        ensureAiConfigLoaded()
        intelligenceLog.info(`Invoking capability: ${capabilityId}`)
        const result = await ai.invoke(capabilityId, payload, options)
        intelligenceLog.success(
          `Capability ${capabilityId} completed via ${result.provider} (${result.model})`
        )
        return result
      }
    )

    registerProtectedSafe(
      intelligenceChatLangchainEvent,
      'LangChain chat',
      'ai.basic',
      async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.messages)) {
          throw new Error('Invalid chat payload')
        }

        const { messages, providerId, model, promptTemplate, promptVariables, metadata } = data

        ensureAiConfigLoaded()

        const result = await ai.invoke<string>(
          'text.chat',
          { messages },
          {
            preferredProviderId: providerId,
            modelPreference: model ? [model] : undefined,
            metadata: {
              ...metadata,
              promptTemplate,
              promptVariables
            }
          }
        )

        return result
      }
    )
  }

  private registerCapabilityChannels(
    registerSafe: <TRes>(
      event: { toEventName: () => string },
      action: string,
      handler: (payload: any, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(intelligenceTestProviderEvent, 'Provider test', async (data) => {
      if (!data || typeof data !== 'object' || !data.provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data
      ensureAiConfigLoaded()
      intelligenceLog.info(`Testing provider: ${provider.id}`)
      const result = await ai.testProvider(provider)
      intelligenceLog.success(`Provider ${provider.id} test success`)
      return result
    })

    registerSafe(
      intelligenceGetCapabilityTestMetaEvent,
      'Get capability test metadata',
      async (data) => {
        if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
          throw new Error('Invalid capability ID')
        }

        const { capabilityId } = data
        const tester = capabilityTesterRegistry.get(capabilityId)

        if (!tester) {
          return {
            requiresUserInput: false,
            inputHint: ''
          }
        }

        return {
          requiresUserInput: tester.requiresUserInput(),
          inputHint: tester.getDefaultInputHint()
        }
      }
    )

    registerSafe(intelligenceTestCapabilityEvent, 'Capability test', async (data) => {
      if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
        throw new Error('Invalid capability test payload')
      }

      const {
        capabilityId,
        providerId,
        userInput,
        model,
        promptTemplate,
        promptVariables,
        ...rest
      } = data

      const capability = aiCapabilityRegistry.get(capabilityId)
      if (!capability) {
        throw new Error(`Capability ${capabilityId} not registered`)
      }

      const tester = capabilityTesterRegistry.get(capabilityId)
      if (!tester) {
        throw new Error(`No tester registered for capability ${capabilityId}`)
      }

      ensureAiConfigLoaded()
      const options = getCapabilityOptions(capabilityId)
      const allowedProviderIds = providerId ? [providerId] : options.allowedProviderIds

      intelligenceLog.info(`Testing capability: ${capabilityId}`)
      const payload = await tester.generateTestPayload({ providerId, userInput, ...rest })

      const result = await ai.invoke(capabilityId, payload, {
        modelPreference: model ? [model] : options.modelPreference,
        allowedProviderIds,
        metadata: {
          promptTemplate,
          promptVariables,
          caller: 'system'
        }
      })

      const formattedResult = tester.formatTestResult(result)

      intelligenceLog.success(
        `Capability ${capabilityId} test success via ${result.provider} (${result.model})`
      )

      return formattedResult
    })

    registerSafe(intelligenceFetchModelsEvent, 'Fetch provider models', async (data) => {
      if (!data || typeof data !== 'object' || !data.provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data
      ensureAiConfigLoaded()
      intelligenceLog.info(`Fetching models for provider: ${provider.id}`)

      const models = await fetchProviderModels(provider)
      intelligenceLog.success(`Loaded ${models.length} models for provider ${provider.id}`)

      return {
        success: true,
        models
      }
    })
  }

  private registerStatsChannels(
    registerSafe: <TRes>(
      event: { toEventName: () => string },
      action: string,
      handler: (payload: any, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(intelligenceGetAuditLogsEvent, 'Get audit logs', async (data) => {
      const options = data ?? {}
      return await ai.queryAuditLogs(options)
    })

    registerSafe(intelligenceGetTodayStatsEvent, 'Get today stats', async (data) => {
      const { callerId } = data ?? {}
      return await ai.getTodayStats(callerId)
    })

    registerSafe(intelligenceGetMonthStatsEvent, 'Get month stats', async (data) => {
      const { callerId } = data ?? {}
      return await ai.getMonthStats(callerId)
    })

    registerSafe(intelligenceGetUsageStatsEvent, 'Get usage stats', async (data) => {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid payload')
      }
      const { callerId, periodType, startPeriod, endPeriod } = data
      return await ai.getUsageStats(callerId, periodType, startPeriod, endPeriod)
    })
  }

  private registerQuotaChannels(
    registerSafe: <TRes>(
      event: { toEventName: () => string },
      action: string,
      handler: (payload: any, context: HandlerContext) => Promise<TRes> | TRes
    ) => void
  ): void {
    registerSafe(intelligenceGetQuotaEvent, 'Get quota', async (data) => {
      const { callerId, callerType } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.getQuota(callerId, callerType || 'plugin')
    })

    registerSafe(intelligenceSetQuotaEvent, 'Set quota', async (data) => {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid quota config')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      await intelligenceQuotaManager.setQuota(data)
    })

    registerSafe(intelligenceDeleteQuotaEvent, 'Delete quota', async (data) => {
      const { callerId, callerType } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      await intelligenceQuotaManager.deleteQuota(callerId, callerType || 'plugin')
    })

    registerSafe(intelligenceGetAllQuotasEvent, 'Get all quotas', async () => {
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.getAllQuotas()
    })

    registerSafe(intelligenceCheckQuotaEvent, 'Check quota', async (data) => {
      const { callerId, callerType, estimatedTokens } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.checkQuota(
        callerId,
        callerType || 'plugin',
        estimatedTokens || 0
      )
    })

    registerSafe(intelligenceGetCurrentUsageEvent, 'Get current usage', async (data) => {
      const { callerId, callerType } = data
      if (!callerId) {
        throw new Error('callerId is required')
      }
      const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
      return await intelligenceQuotaManager.getCurrentUsage(callerId, callerType || 'plugin')
    })
  }
}

export const intelligenceModule = new IntelligenceModule()
