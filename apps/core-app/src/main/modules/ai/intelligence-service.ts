import type { AiProviderConfig } from '@talex-touch/utils'
import { AiProviderType } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import chalk from 'chalk'
import { genTouchChannel } from '../../core/channel-core'
import { capabilityTesterRegistry } from './capability-testers'
import { aiCapabilityRegistry } from './intelligence-capability-registry'
import { ensureAiConfigLoaded, getCapabilityOptions, setupConfigUpdateListener } from './intelligence-config'
import { ai, setIntelligenceProviderManager } from './intelligence-sdk'
import { fetchProviderModels } from './provider-models'
import { AnthropicProvider } from './providers/anthropic-provider'
import { DeepSeekProvider } from './providers/deepseek-provider'
import { LocalProvider } from './providers/local-provider'
import { OpenAIProvider } from './providers/openai-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import { IntelligenceProviderManager } from './runtime/provider-manager'

const LOG = chalk.hex('#1e88e5').bold('[Intelligence]')
const logInfo = (...args: any[]) => console.log(LOG, ...args)
const logError = (...args: any[]) => console.error(LOG, ...args)

let initialized = false

export function initAiSdkService(): void {
  if (initialized) {
    return
  }
  const channel = genTouchChannel()
  if (!channel) {
    throw new Error('[AISDK] Touch channel not ready')
  }
  initialized = true

  const manager = new IntelligenceProviderManager()
  manager.registerFactory(AiProviderType.OPENAI, config => new OpenAIProvider(config))
  manager.registerFactory(AiProviderType.DEEPSEEK, config => new DeepSeekProvider(config))
  manager.registerFactory(AiProviderType.SILICONFLOW, config => new SiliconflowProvider(config))
  manager.registerFactory(AiProviderType.LOCAL, config => new LocalProvider(config))
  manager.registerFactory(AiProviderType.ANTHROPIC, config => new AnthropicProvider(config))
  setIntelligenceProviderManager(manager)
  logInfo('Provider factories registered')

  // Setup config update listener to reload when frontend saves config
  setupConfigUpdateListener()

  // Load initial config
  ensureAiConfigLoaded()

  channel.regChannel(ChannelType.MAIN, 'intelligence:invoke', async ({ data, reply }) => {
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
      logInfo(`Invoking capability ${capabilityId}`)
      const result = await ai.invoke(capabilityId, payload, options)
      logInfo(`Capability ${capabilityId} completed via provider ${result.provider} (${result.model})`)
      reply(DataCode.SUCCESS, { ok: true, result })
    }
    catch (error) {
      logError('Invoke failed:', error)
      reply(DataCode.ERROR, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  channel.regChannel(ChannelType.MAIN, 'intelligence:test-provider', async ({ data, reply }) => {
    try {
      if (!data || typeof data !== 'object' || !(data as any).provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data as { provider: AiProviderConfig }
      ensureAiConfigLoaded()
      logInfo(`Testing provider ${provider.id}`)
      const result = await ai.testProvider(provider)
      logInfo(`Provider ${provider.id} test success`)

      reply(DataCode.SUCCESS, {
        ok: true,
        result,
      })
    }
    catch (error) {
      logError('Provider test failed:', error)
      reply(DataCode.ERROR, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  channel.regChannel(ChannelType.MAIN, 'intelligence:test-capability', async ({ data, reply }) => {
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

      logInfo(`Testing capability ${capabilityId}`)

      // 使用测试器生成 payload
      const payload = await tester.generateTestPayload({ providerId, userInput, ...rest })

      // 执行测试
      const result = await ai.invoke(capabilityId, payload, {
        modelPreference: options.modelPreference,
        allowedProviderIds,
      })

      // 格式化结果
      const formattedResult = tester.formatTestResult(result)

      logInfo(`Capability ${capabilityId} test success via provider ${result.provider} (${result.model})`)

      reply(DataCode.SUCCESS, {
        ok: true,
        result: formattedResult,
      })
    }
    catch (error) {
      logError('Capability test failed:', error)
      reply(DataCode.ERROR, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  channel.regChannel(ChannelType.MAIN, 'intelligence:fetch-models', async ({ data, reply }) => {
    try {
      if (!data || typeof data !== 'object' || !(data as any).provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data as { provider: AiProviderConfig }
      ensureAiConfigLoaded()
      logInfo(`Fetching models for provider ${provider.id}`)
      const models = await fetchProviderModels(provider)
      reply(DataCode.SUCCESS, {
        ok: true,
        result: {
          success: true,
          models,
        },
      })
    }
    catch (error) {
      logError('Fetch models failed:', error)
      reply(DataCode.ERROR, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  channel.regChannel(ChannelType.MAIN, 'intelligence:reload-config', async ({ reply }) => {
    try {
      logInfo('Reloading config on demand')
      ensureAiConfigLoaded(true)
      reply(DataCode.SUCCESS, { ok: true })
    }
    catch (error) {
      logError('Reload config failed:', error)
      reply(DataCode.ERROR, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
