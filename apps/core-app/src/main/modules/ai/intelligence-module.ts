import type { AiProviderConfig, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { AiCapabilityType, AiProviderType } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../../core/channel-core'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
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

    this.manager.registerFactory(AiProviderType.OPENAI, config => new OpenAIProvider(config))
    this.manager.registerFactory(AiProviderType.ANTHROPIC, config => new AnthropicProvider(config))
    this.manager.registerFactory(AiProviderType.DEEPSEEK, config => new DeepSeekProvider(config))
    this.manager.registerFactory(
      AiProviderType.SILICONFLOW,
      config => new SiliconflowProvider(config),
    )
    this.manager.registerFactory(AiProviderType.LOCAL, config => new LocalProvider(config))

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
    this.manager.registerFactory(AiProviderType.CUSTOM, (config) => {
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

    // 注册文本聊天能力
    aiCapabilityRegistry.register({
      id: 'text.chat',
      type: AiCapabilityType.CHAT,
      name: 'Text Chat',
      description: 'General-purpose text chat capability',
      supportedProviders: [
        AiProviderType.OPENAI,
        AiProviderType.ANTHROPIC,
        AiProviderType.DEEPSEEK,
        AiProviderType.SILICONFLOW,
        AiProviderType.LOCAL,
        AiProviderType.CUSTOM,
      ],
    })

    // 注册 Embedding 能力
    aiCapabilityRegistry.register({
      id: 'embedding.generate',
      type: AiCapabilityType.EMBEDDING,
      name: 'Generate Embeddings',
      description: 'Generate text embeddings for semantic search',
      supportedProviders: [
        AiProviderType.OPENAI,
        AiProviderType.DEEPSEEK,
        AiProviderType.SILICONFLOW,
        AiProviderType.LOCAL,
        AiProviderType.CUSTOM,
      ],
    })

    // 注册 Vision OCR 能力
    aiCapabilityRegistry.register({
      id: 'vision.ocr',
      type: AiCapabilityType.VISION,
      name: 'Vision OCR',
      description: 'Optical character recognition from images',
      supportedProviders: [
        AiProviderType.OPENAI,
        AiProviderType.ANTHROPIC,
        AiProviderType.SILICONFLOW,
        AiProviderType.CUSTOM,
      ],
    })

    intelligenceLog.success('Capabilities registered')
  }

  /**
   * 注册 IPC 通道处理器
   */
  private registerChannels(): void {
    if (!this.channel)
      return

    intelligenceLog.info('Registering IPC channels')

    // 调用 AI 能力
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:invoke', async ({ data, reply }) => {
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
    })

    // 测试 Provider
    this.channel.regChannel(ChannelType.MAIN, 'intelligence:test-provider', async ({ data, reply }) => {
      try {
        if (!data || typeof data !== 'object' || !(data as any).provider) {
          throw new Error('Missing provider payload')
        }

        const { provider } = data as { provider: AiProviderConfig }
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

          const { capabilityId, providerId, userInput, ...rest } = data as {
            capabilityId: string
            providerId?: string
            userInput?: string
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
            modelPreference: options.modelPreference,
            allowedProviderIds,
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

        const { provider } = data as { provider: AiProviderConfig }
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

    intelligenceLog.success('IPC channels registered')
  }
}

export const intelligenceModule = new IntelligenceModule()
