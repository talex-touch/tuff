import type { IntelligenceProviderConfig } from '@talex-touch/utils'
import { IntelligenceProviderType } from '@talex-touch/utils'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { genTouchApp } from '../../core'
import { createLogger } from '../../utils/logger'
import { capabilityTesterRegistry } from './capability-testers'
import { aiCapabilityRegistry } from './intelligence-capability-registry'
import {
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
import { IntelligenceProviderManager } from './runtime/provider-manager'

const intelligenceServiceLog = createLogger('Intelligence').child('Service')
const formatLogArgs = (args: unknown[]): string => args.map((arg) => String(arg)).join(' ')
const logInfo = (...args: unknown[]) => intelligenceServiceLog.info(formatLogArgs(args))
const logError = (...args: unknown[]) => intelligenceServiceLog.error(formatLogArgs(args))

const intelligenceInvokeEvent = defineRawEvent<any, any>('intelligence:invoke')
const intelligenceTestProviderEvent = defineRawEvent<any, any>('intelligence:test-provider')
const intelligenceTestCapabilityEvent = defineRawEvent<any, any>('intelligence:test-capability')
const intelligenceFetchModelsEvent = defineRawEvent<any, any>('intelligence:fetch-models')
const intelligenceReloadConfigEvent = defineRawEvent<void, { ok: boolean; error?: string }>(
  'intelligence:reload-config'
)

let initialized = false

export function initAiSdkService(): void {
  if (initialized) {
    return
  }
  const channel = genTouchApp().channel
  if (!channel) {
    throw new Error('[AISDK] Touch channel not ready')
  }
  const keyManager = (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
  const transport = getTuffTransportMain(channel as any, keyManager as any)
  initialized = true

  const manager = new IntelligenceProviderManager()
  manager.registerFactory(IntelligenceProviderType.OPENAI, (config) => new OpenAIProvider(config))
  manager.registerFactory(
    IntelligenceProviderType.DEEPSEEK,
    (config) => new DeepSeekProvider(config)
  )
  manager.registerFactory(
    IntelligenceProviderType.SILICONFLOW,
    (config) => new SiliconflowProvider(config)
  )
  manager.registerFactory(IntelligenceProviderType.LOCAL, (config) => new LocalProvider(config))
  manager.registerFactory(
    IntelligenceProviderType.ANTHROPIC,
    (config) => new AnthropicProvider(config)
  )
  setIntelligenceProviderManager(manager)
  logInfo('Provider factories registered')

  // Setup config update listener to reload when frontend saves config
  setupConfigUpdateListener()

  // Load initial config
  ensureAiConfigLoaded()

  transport.on(intelligenceInvokeEvent, async (data) => {
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
      logInfo(
        `Capability ${capabilityId} completed via provider ${result.provider} (${result.model})`
      )
      return { ok: true, result }
    } catch (error) {
      logError('Invoke failed:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  transport.on(intelligenceTestProviderEvent, async (data) => {
    try {
      if (!data || typeof data !== 'object' || !(data as any).provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data as { provider: IntelligenceProviderConfig }
      ensureAiConfigLoaded()
      // logInfo(`Testing provider ${provider.id}`) // Remove to reduce noise
      const result = await ai.testProvider(provider)
      logInfo(`Provider ${provider.id} test success`)

      return {
        ok: true,
        result
      }
    } catch (error) {
      logError('Provider test failed:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  transport.on(intelligenceTestCapabilityEvent, async (data) => {
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
        allowedProviderIds
      })

      // 格式化结果
      const formattedResult = tester.formatTestResult(result)

      logInfo(
        `Capability ${capabilityId} test success via provider ${result.provider} (${result.model})`
      )

      return {
        ok: true,
        result: formattedResult
      }
    } catch (error) {
      logError('Capability test failed:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  transport.on(intelligenceFetchModelsEvent, async (data) => {
    try {
      if (!data || typeof data !== 'object' || !(data as any).provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data as { provider: IntelligenceProviderConfig }
      ensureAiConfigLoaded()
      logInfo(`Fetching models for provider ${provider.id}`)
      const models = await fetchProviderModels(provider)
      return {
        ok: true,
        result: {
          success: true,
          models
        }
      }
    } catch (error) {
      logError('Fetch models failed:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  transport.on(intelligenceReloadConfigEvent, async () => {
    try {
      logInfo('Reloading config on demand')
      ensureAiConfigLoaded(true)
      return { ok: true }
    } catch (error) {
      logError('Reload config failed:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
