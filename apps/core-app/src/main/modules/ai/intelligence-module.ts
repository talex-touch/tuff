import path from 'node:path'
import { readdirSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { AiCapabilityType, AiProviderType } from '@talex-touch/utils'
import type {
  AiProviderConfig,
  AiVisionOcrPayload,
  AiVisionOcrResult
} from '@talex-touch/utils'
import { aiCapabilityRegistry } from './ai-capability-registry'
import { ai, setIntelligenceProviderManager } from './ai-sdk'
import { genTouchChannel } from '../../core/channel-core'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import { ensureAiConfigLoaded, getCapabilityOptions, getCapabilityPrompt } from './ai-config'
import { OpenAIProvider } from './providers/openai-provider'
import { DeepSeekProvider } from './providers/deepseek-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import { LocalProvider } from './providers/local-provider'
import { AnthropicProvider } from './providers/anthropic-provider'
import { IntelligenceProviderManager } from './runtime/provider-manager'
import { BaseModule } from '../abstract-base-module'
import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { fetchProviderModels } from './provider-models'

const intelligenceLog = createLogger('Intelligence')

/**
 * Intelligence Module - 管理 AI 能力和提供商
 *
 * 支持两种 Provider 类型：
 * 1. Builtin Providers - 内置支持的提供商（OpenAI, Anthropic, DeepSeek 等）
 * 2. Custom Providers - OpenAI-compatible 兼容的自定义提供商
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

    this.manager.registerFactory(AiProviderType.OPENAI, (config) => new OpenAIProvider(config))
    this.manager.registerFactory(AiProviderType.ANTHROPIC, (config) => new AnthropicProvider(config))
    this.manager.registerFactory(AiProviderType.DEEPSEEK, (config) => new DeepSeekProvider(config))
    this.manager.registerFactory(
      AiProviderType.SILICONFLOW,
      (config) => new SiliconflowProvider(config)
    )
    this.manager.registerFactory(AiProviderType.LOCAL, (config) => new LocalProvider(config))

    intelligenceLog.success('Builtin provider factories registered')
  }

  /**
   * 注册自定义 Provider Factory (OpenAI-compatible)
   */
  private registerCustomProvider(): void {
    if (!this.manager) return

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
        AiProviderType.CUSTOM
      ]
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
        AiProviderType.CUSTOM
      ]
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
        AiProviderType.CUSTOM
      ]
    })

    intelligenceLog.success('Capabilities registered')
  }

  /**
   * 注册 IPC 通道处理器
   */
  private registerChannels(): void {
    if (!this.channel) return

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
          `Capability ${capabilityId} completed via ${result.provider} (${result.model})`
        )
        reply(DataCode.SUCCESS, { ok: true, result })
      } catch (error) {
        intelligenceLog.error('Invoke failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
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
          result
        })
      } catch (error) {
        intelligenceLog.error('Provider test failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })

    // 测试能力
    this.channel.regChannel(
      ChannelType.MAIN,
      'intelligence:test-capability',
      async ({ data, reply }) => {
        try {
          if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
            throw new Error('Invalid capability test payload')
          }

          const { capabilityId, providerId, source } = data as {
            capabilityId: string
            providerId?: string
            source?: AiVisionOcrPayload['source']
          }

          const capability = aiCapabilityRegistry.get(capabilityId)
          if (!capability) {
            throw new Error(`Capability ${capabilityId} not registered`)
          }

          ensureAiConfigLoaded()
          const options = getCapabilityOptions(capabilityId)
          const allowedProviderIds = providerId ? [providerId] : options.allowedProviderIds

          intelligenceLog.info(`Testing capability: ${capabilityId}`)
          switch (capability.type) {
            case AiCapabilityType.VISION: {
              if (capabilityId !== 'vision.ocr') {
                throw new Error(`Vision capability ${capabilityId} is not testable yet`)
              }

              const payload: AiVisionOcrPayload = {
                source: source ?? (await this.loadSampleImageSource('ocr')),
                prompt: getCapabilityPrompt(capabilityId),
                includeKeywords: true,
                includeLayout: true
              }

              const result = await ai.invoke<AiVisionOcrResult>('vision.ocr', payload, {
                modelPreference: options.modelPreference,
                allowedProviderIds
              })

              intelligenceLog.success(
                `Capability ${capabilityId} test success via ${result.provider}`
              )
              reply(DataCode.SUCCESS, {
                ok: true,
                result
              })
              break
            }
            default:
              throw new Error(`Capability type ${capability.type} not supported for testing`)
          }
        } catch (error) {
          intelligenceLog.error('Capability test failed:', { error })
          reply(DataCode.ERROR, {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
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
            models
          }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        intelligenceLog.error('Fetch models failed:', { error })
        reply(DataCode.ERROR, {
          ok: false,
          error: message
        })
      }
    })

    intelligenceLog.success('IPC channels registered')
  }

  /**
   * 加载测试图片
   */
  private async loadSampleImageSource(folder: string): Promise<AiVisionOcrPayload['source']> {
    const dir = this.resolveSampleDirectory(folder)
    if (!dir) {
      throw new Error('Sample image directory not found')
    }

    const files = readdirSync(dir).filter((file) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(file))

    if (files.length === 0) {
      throw new Error('Sample image folder is empty')
    }

    const fileName = files[Math.floor(Math.random() * files.length)]
    const filePath = path.join(dir, fileName)
    const buffer = await readFile(filePath)
    const mime = this.detectMime(fileName)

    return {
      type: 'data-url',
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
    }
  }

  private resolveSampleDirectory(folder: string): string | null {
    const guesses = [
      path.resolve(process.cwd(), 'apps/core-app/resources/intelligence/test-capability', folder),
      path.resolve(process.cwd(), 'resources/intelligence/test-capability', folder),
      path.resolve(process.resourcesPath, 'intelligence/test-capability', folder)
    ]

    for (const guess of guesses) {
      if (existsSync(guess)) {
        return guess
      }
    }

    intelligenceLog.warn('Sample folder not found in guesses:', { meta: { guesses: guesses.join(', ') } })
    return null
  }

  private detectMime(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase()
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.webp':
        return 'image/webp'
      case '.gif':
        return 'image/gif'
      case '.bmp':
        return 'image/bmp'
      default:
        return 'image/png'
    }
  }
}

export const intelligenceModule = new IntelligenceModule()
