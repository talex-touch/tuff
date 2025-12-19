import type { IntelligenceProviderConfig, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { IntelligenceCapabilityType, IntelligenceProviderType } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../../core/channel-core'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { withPermission } from '../permission/channel-guard'
import { capabilityTesterRegistry } from './capability-testers'
import { aiCapabilityRegistry } from './intelligence-capability-registry'
import { debugPrintConfig, ensureAiConfigLoaded, getCapabilityOptions, setupConfigUpdateListener } from './intelligence-config'
import { ai, setIntelligenceProviderManager } from './intelligence-sdk'
import { fetchProviderModels } from './provider-models'
import { AnthropicProvider } from './providers/anthropic-provider'
import { DeepSeekProvider } from './providers/deepseek-provider'
import { LocalProvider } from './providers/local-provider'
import { OpenAIProvider } from './providers/openai-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import { IntelligenceProviderManager } from './runtime/provider-manager'

const intelligenceLog = createLogger('Intelligence')

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
  private channel: ITouchChannel | null = null

  constructor() {
    super(IntelligenceModule.key)
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    // 在 onInit 阶段获取已初始化的 TouchChannel
    this.channel = genTouchChannel()

    if (!this.channel) {
      throw new Error('[Intelligence] Touch channel not ready')
    }

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
    if (!this.manager)
      return

    intelligenceLog.info('Registering builtin provider factories')

    this.manager.registerFactory(IntelligenceProviderType.OPENAI, config => new OpenAIProvider(config))
    this.manager.registerFactory(IntelligenceProviderType.ANTHROPIC, config => new AnthropicProvider(config))
    this.manager.registerFactory(IntelligenceProviderType.DEEPSEEK, config => new DeepSeekProvider(config))
    this.manager.registerFactory(
      IntelligenceProviderType.SILICONFLOW,
      config => new SiliconflowProvider(config),
    )
    this.manager.registerFactory(IntelligenceProviderType.LOCAL, config => new LocalProvider(config))

    intelligenceLog.success('Builtin provider factories registered')
  }

  /**
   * 注册自定义 Provider Factory (OpenAI-compatible)
   */
  private registerCustomProvider(): void {
    if (!this.manager)
      return

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
      IntelligenceProviderType.CUSTOM,
    ]

    const VISION_PROVIDERS = [
      IntelligenceProviderType.OPENAI,
      IntelligenceProviderType.ANTHROPIC,
      IntelligenceProviderType.SILICONFLOW,
      IntelligenceProviderType.CUSTOM,
    ]

    // ========================================================================
    // Core Text Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Text Chat',
      description: 'General-purpose text chat capability',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'text.translate',
      type: IntelligenceCapabilityType.TRANSLATE,
      name: 'Translation',
      description: 'Multi-language text translation',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'text.summarize',
      type: IntelligenceCapabilityType.SUMMARIZE,
      name: 'Summarization',
      description: 'Generate concise summaries of text content',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'text.rewrite',
      type: IntelligenceCapabilityType.REWRITE,
      name: 'Text Rewrite',
      description: 'Rewrite text with different styles and tones',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'text.grammar',
      type: IntelligenceCapabilityType.GRAMMAR_CHECK,
      name: 'Grammar Check',
      description: 'Check and correct grammar, spelling, and style',
      supportedProviders: ALL_PROVIDERS,
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
        IntelligenceProviderType.CUSTOM,
      ],
    })

    // ========================================================================
    // Code Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'code.generate',
      type: IntelligenceCapabilityType.CODE_GENERATE,
      name: 'Code Generation',
      description: 'Generate code from natural language descriptions',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'code.explain',
      type: IntelligenceCapabilityType.CODE_EXPLAIN,
      name: 'Code Explanation',
      description: 'Explain code functionality and logic',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'code.review',
      type: IntelligenceCapabilityType.CODE_REVIEW,
      name: 'Code Review',
      description: 'Review code for issues, security, and best practices',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'code.refactor',
      type: IntelligenceCapabilityType.CODE_REFACTOR,
      name: 'Code Refactoring',
      description: 'Refactor code for better readability and maintainability',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'code.debug',
      type: IntelligenceCapabilityType.CODE_DEBUG,
      name: 'Code Debugging',
      description: 'Analyze and fix code bugs',
      supportedProviders: ALL_PROVIDERS,
    })

    // ========================================================================
    // Analysis Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'intent.detect',
      type: IntelligenceCapabilityType.INTENT_DETECT,
      name: 'Intent Detection',
      description: 'Detect user intent from text input',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'sentiment.analyze',
      type: IntelligenceCapabilityType.SENTIMENT_ANALYZE,
      name: 'Sentiment Analysis',
      description: 'Analyze sentiment and emotions in text',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'content.extract',
      type: IntelligenceCapabilityType.CONTENT_EXTRACT,
      name: 'Content Extraction',
      description: 'Extract entities and key information from text',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'keywords.extract',
      type: IntelligenceCapabilityType.KEYWORDS_EXTRACT,
      name: 'Keyword Extraction',
      description: 'Extract keywords and key phrases from text',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'text.classify',
      type: IntelligenceCapabilityType.CLASSIFICATION,
      name: 'Text Classification',
      description: 'Classify text into predefined categories',
      supportedProviders: ALL_PROVIDERS,
    })

    // ========================================================================
    // Vision Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'vision.ocr',
      type: IntelligenceCapabilityType.VISION_OCR,
      name: 'Vision OCR',
      description: 'Optical character recognition from images',
      supportedProviders: VISION_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'image.caption',
      type: IntelligenceCapabilityType.IMAGE_CAPTION,
      name: 'Image Captioning',
      description: 'Generate descriptive captions for images',
      supportedProviders: VISION_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'image.analyze',
      type: IntelligenceCapabilityType.IMAGE_ANALYZE,
      name: 'Image Analysis',
      description: 'Analyze image content, objects, and scenes',
      supportedProviders: VISION_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'image.generate',
      type: IntelligenceCapabilityType.IMAGE_GENERATE,
      name: 'Image Generation',
      description: 'Generate images from text prompts',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM],
    })

    aiCapabilityRegistry.register({
      id: 'image.edit',
      type: IntelligenceCapabilityType.IMAGE_EDIT,
      name: 'Image Editing',
      description: 'Edit and modify images with AI',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.CUSTOM],
    })

    // ========================================================================
    // Audio Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'audio.tts',
      type: IntelligenceCapabilityType.TTS,
      name: 'Text-to-Speech',
      description: 'Convert text to natural speech',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM],
    })

    aiCapabilityRegistry.register({
      id: 'audio.stt',
      type: IntelligenceCapabilityType.STT,
      name: 'Speech-to-Text',
      description: 'Convert speech to text',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM],
    })

    aiCapabilityRegistry.register({
      id: 'audio.transcribe',
      type: IntelligenceCapabilityType.AUDIO_TRANSCRIBE,
      name: 'Audio Transcription',
      description: 'Transcribe audio with timestamps and speaker detection',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM],
    })

    // ========================================================================
    // RAG & Search Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'rag.query',
      type: IntelligenceCapabilityType.RAG_QUERY,
      name: 'RAG Query',
      description: 'Query documents with retrieval-augmented generation',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'Search documents by semantic similarity',
      supportedProviders: [IntelligenceProviderType.OPENAI, IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM],
    })

    aiCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Document Reranking',
      description: 'Rerank search results by relevance',
      supportedProviders: [IntelligenceProviderType.SILICONFLOW, IntelligenceProviderType.CUSTOM],
    })

    // ========================================================================
    // Workflow & Agent Capabilities
    // ========================================================================

    aiCapabilityRegistry.register({
      id: 'workflow.execute',
      type: IntelligenceCapabilityType.WORKFLOW,
      name: 'Workflow Execution',
      description: 'Execute multi-step prompt workflows',
      supportedProviders: ALL_PROVIDERS,
    })

    aiCapabilityRegistry.register({
      id: 'agent.run',
      type: IntelligenceCapabilityType.AGENT,
      name: 'Agent Execution',
      description: 'Run autonomous AI agents with tool access',
      supportedProviders: ALL_PROVIDERS,
    })

    intelligenceLog.success(`Registered ${aiCapabilityRegistry.size()} capabilities`)
  }

  /**
   * 注册 IPC 通道处理器
   */
  private registerChannels(): void {
    if (!this.channel)
      return

    intelligenceLog.info('Registering IPC channels')

    // 调用 AI 能力
    const invokeHandler = async ({ data, reply }: any) => {
      try {
        if (!data || typeof data !== 'object' || typeof (data as any).capabilityId !== 'string') {
          throw new Error('Invalid invoke payload')
        }

        const { capabilityId, payload, options } = data as {
          capabilityId: string
          payload: unknown
          options?: any
        }

        ensureAiConfigLoaded()
        intelligenceLog.info(`Invoking capability: ${capabilityId}`)
        const result = await ai.invoke(capabilityId, payload, options)
        intelligenceLog.success(
          `Capability ${capabilityId} completed via ${result.provider} (${result.model})`,
        )
        reply(DataCode.SUCCESS, { ok: true, result })
      }
      catch (error) {
        intelligenceLog.error('Invoke failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.channel.regChannel(ChannelType.MAIN, 'intelligence:invoke', invokeHandler)
    this.channel.regChannel(
      ChannelType.PLUGIN,
      'intelligence:invoke',
      withPermission({ permissionId: 'ai.basic' }, invokeHandler),
    )

    const chatHandler = async ({ data, reply }: any) => {
      try {
        if (!data || typeof data !== 'object' || !Array.isArray((data as any).messages)) {
          throw new Error('Invalid chat payload')
        }

        const {
          messages,
          providerId,
          model,
          promptTemplate,
          promptVariables,
          metadata,
        } = data as {
          messages: any[]
          providerId?: string
          model?: string
          promptTemplate?: string
          promptVariables?: Record<string, any>
          metadata?: Record<string, any>
        }

        ensureAiConfigLoaded()

        const result = await ai.invoke('text.chat', { messages }, {
          preferredProviderId: providerId,
          modelPreference: model ? [model] : undefined,
          metadata: {
            ...metadata,
            promptTemplate,
            promptVariables,
          },
        })

        reply(DataCode.SUCCESS, { ok: true, result })
      }
      catch (error) {
        intelligenceLog.error('LangChain chat failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.channel.regChannel(ChannelType.MAIN, 'intelligence:chat-langchain', chatHandler)
    this.channel.regChannel(
      ChannelType.PLUGIN,
      'intelligence:chat-langchain',
      withPermission({ permissionId: 'ai.basic' }, chatHandler),
    )

    // 测试 Provider
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:test-provider', async ({ data, reply }) => {
      try {
        if (!data || typeof data !== 'object' || !(data as any).provider) {
          throw new Error('Missing provider payload')
        }

        const { provider } = data as { provider: IntelligenceProviderConfig }
        ensureAiConfigLoaded()
        intelligenceLog.info(`Testing provider: ${provider.id}`)
        const result = await ai.testProvider(provider)
        intelligenceLog.success(`Provider ${provider.id} test success`)

        reply(DataCode.SUCCESS, {
          ok: true,
          result,
        })
      }
      catch (error) {
        intelligenceLog.error('Provider test failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 获取能力测试元数据
    this.channel.regChannel(
      ChannelType.MAIN,
      'intelligence:get-capability-test-meta',
      async ({ data, reply }) => {
        try {
          if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
            throw new Error('Invalid capability ID')
          }

          const { capabilityId } = data as { capabilityId: string }
          const tester = capabilityTesterRegistry.get(capabilityId)

          if (!tester) {
            reply(DataCode.SUCCESS, {
              ok: true,
              result: {
                requiresUserInput: false,
                inputHint: '',
              },
            })
            return
          }

          reply(DataCode.SUCCESS, {
            ok: true,
            result: {
              requiresUserInput: tester.requiresUserInput(),
              inputHint: tester.getDefaultInputHint(),
            },
          })
        }
        catch (error) {
          intelligenceLog.error('Get capability test meta failed:', { error })
          reply(DataCode.ERROR, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    )

    // 测试能力
    this.channel.regChannel(
      ChannelType.MAIN,
      'intelligence:test-capability',
      async ({ data, reply }) => {
        try {
          if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
            throw new Error('Invalid capability test payload')
          }

          const { capabilityId, providerId, userInput, model, promptTemplate, promptVariables, ...rest } = data as {
            capabilityId: string
            providerId?: string
            userInput?: string
            model?: string
            promptTemplate?: string
            promptVariables?: Record<string, any>
            [key: string]: any
          }

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

          // 使用测试器生成 payload
          const payload = await tester.generateTestPayload({ providerId, userInput, ...rest })

          // 执行测试
          const result = await ai.invoke(capabilityId, payload, {
            modelPreference: model ? [model] : options.modelPreference,
            allowedProviderIds,
            metadata: {
              promptTemplate,
              promptVariables,
              caller: 'system',
            },
          })

          // 格式化结果
          const formattedResult = tester.formatTestResult(result)

          intelligenceLog.success(
            `Capability ${capabilityId} test success via ${result.provider} (${result.model})`,
          )

          reply(DataCode.SUCCESS, {
            ok: true,
            result: formattedResult,
          })
        }
        catch (error) {
          intelligenceLog.error('Capability test failed:', { error })
          reply(DataCode.ERROR, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    )

    // 获取可用模型
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:fetch-models', async ({ data, reply }) => {
      try {
        if (!data || typeof data !== 'object' || !(data as any).provider) {
          throw new Error('Missing provider payload')
        }

        const { provider } = data as { provider: IntelligenceProviderConfig }
        ensureAiConfigLoaded()
        intelligenceLog.info(`Fetching models for provider: ${provider.id}`)

        const models = await fetchProviderModels(provider)
        intelligenceLog.success(`Loaded ${models.length} models for provider ${provider.id}`)

        reply(DataCode.SUCCESS, {
          ok: true,
          result: {
            success: true,
            models,
          },
        })
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        intelligenceLog.error('Fetch models failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: message,
        })
      }
    })

    // ========================================================================
    // Audit & Usage Statistics Channels
    // ========================================================================

    // 获取审计日志
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-audit-logs', async ({ data, reply }) => {
      try {
        const options = (data as any) || {}
        const logs = await ai.queryAuditLogs(options)
        reply(DataCode.SUCCESS, { ok: true, result: logs })
      }
      catch (error) {
        intelligenceLog.error('Get audit logs failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 获取今日统计
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-today-stats', async ({ data, reply }) => {
      try {
        const { callerId } = (data as any) || {}
        const stats = await ai.getTodayStats(callerId)
        reply(DataCode.SUCCESS, { ok: true, result: stats })
      }
      catch (error) {
        intelligenceLog.error('Get today stats failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 获取本月统计
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-month-stats', async ({ data, reply }) => {
      try {
        const { callerId } = (data as any) || {}
        const stats = await ai.getMonthStats(callerId)
        reply(DataCode.SUCCESS, { ok: true, result: stats })
      }
      catch (error) {
        intelligenceLog.error('Get month stats failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 获取用量统计
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-usage-stats', async ({ data, reply }) => {
      try {
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid payload')
        }
        const { callerId, periodType, startPeriod, endPeriod } = data as {
          callerId: string
          periodType: 'day' | 'month'
          startPeriod?: string
          endPeriod?: string
        }
        const stats = await ai.getUsageStats(callerId, periodType, startPeriod, endPeriod)
        reply(DataCode.SUCCESS, { ok: true, result: stats })
      }
      catch (error) {
        intelligenceLog.error('Get usage stats failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // ========================================================================
    // Quota Management Channels
    // ========================================================================

    // 获取配额
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-quota', async ({ data, reply }) => {
      try {
        const { callerId, callerType } = (data as any) || {}
        if (!callerId) {
          throw new Error('callerId is required')
        }
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        const quota = await intelligenceQuotaManager.getQuota(callerId, callerType || 'plugin')
        reply(DataCode.SUCCESS, { ok: true, result: quota })
      }
      catch (error) {
        intelligenceLog.error('Get quota failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 设置配额
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:set-quota', async ({ data, reply }) => {
      try {
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid quota config')
        }
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        await intelligenceQuotaManager.setQuota(data as any)
        reply(DataCode.SUCCESS, { ok: true })
      }
      catch (error) {
        intelligenceLog.error('Set quota failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 删除配额
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:delete-quota', async ({ data, reply }) => {
      try {
        const { callerId, callerType } = (data as any) || {}
        if (!callerId) {
          throw new Error('callerId is required')
        }
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        await intelligenceQuotaManager.deleteQuota(callerId, callerType || 'plugin')
        reply(DataCode.SUCCESS, { ok: true })
      }
      catch (error) {
        intelligenceLog.error('Delete quota failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 获取所有配额
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-all-quotas', async ({ reply }) => {
      try {
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        const quotas = await intelligenceQuotaManager.getAllQuotas()
        reply(DataCode.SUCCESS, { ok: true, result: quotas })
      }
      catch (error) {
        intelligenceLog.error('Get all quotas failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 检查配额
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:check-quota', async ({ data, reply }) => {
      try {
        const { callerId, callerType, estimatedTokens } = (data as any) || {}
        if (!callerId) {
          throw new Error('callerId is required')
        }
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        const result = await intelligenceQuotaManager.checkQuota(callerId, callerType || 'plugin', estimatedTokens || 0)
        reply(DataCode.SUCCESS, { ok: true, result })
      }
      catch (error) {
        intelligenceLog.error('Check quota failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    // 获取当前用量
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:get-current-usage', async ({ data, reply }) => {
      try {
        const { callerId, callerType } = (data as any) || {}
        if (!callerId) {
          throw new Error('callerId is required')
        }
        const { intelligenceQuotaManager } = await import('./intelligence-quota-manager')
        const usage = await intelligenceQuotaManager.getCurrentUsage(callerId, callerType || 'plugin')
        reply(DataCode.SUCCESS, { ok: true, result: usage })
      }
      catch (error) {
        intelligenceLog.error('Get current usage failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    intelligenceLog.success('IPC channels registered')
  }
}

export const intelligenceModule = new IntelligenceModule()
