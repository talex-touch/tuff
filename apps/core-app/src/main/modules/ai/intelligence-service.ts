import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { intelligenceApiEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { createLogger } from '../../utils/logger'
import { capabilityTesterRegistry } from './capability-testers'
import type { CapabilityTestPayload } from './capability-testers/base-tester'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import {
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  setupConfigUpdateListener
} from './intelligence-config'
import { setIntelligenceProviderManager, tuffIntelligence } from './intelligence-sdk'
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

type ApiResponse<T = undefined> = { ok: true; result?: T } | { ok: false; error: string }

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
const ok = <T>(result?: T): ApiResponse<T> => ({ ok: true, result })
const fail = (error: unknown): ApiResponse<never> => ({ ok: false, error: toErrorMessage(error) })

let initialized = false
let runtimeTransport: ReturnType<typeof getTuffTransportMain> | null = null

export function setIntelligenceServiceTransport(
  transport: ReturnType<typeof getTuffTransportMain>
): void {
  runtimeTransport = transport
}

export function initIntelligenceSdkService(): void {
  if (initialized) {
    return
  }
  const transport = runtimeTransport
  if (!transport) {
    throw new Error('[Intelligence] Touch channel not ready')
  }
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
  ensureIntelligenceConfigLoaded()

  transport.on(intelligenceApiEvents.invoke, async (data, _context) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
        throw new Error('Invalid invoke payload')
      }

      const { capabilityId, payload, options } = data

      ensureIntelligenceConfigLoaded()
      logInfo(`Invoking capability ${capabilityId}`)
      const result = await tuffIntelligence.invoke(capabilityId, payload, options)
      logInfo(
        `Capability ${capabilityId} completed via provider ${result.provider} (${result.model})`
      )
      return ok(result)
    } catch (error) {
      logError('Invoke failed:', error)
      return fail(error)
    }
  })

  transport.on(intelligenceApiEvents.testProvider, async (data, _context) => {
    try {
      if (!data || typeof data !== 'object' || !data.provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data
      ensureIntelligenceConfigLoaded()
      // logInfo(`Testing provider ${provider.id}`) // Remove to reduce noise
      const result = await tuffIntelligence.testProvider(provider)
      logInfo(`Provider ${provider.id} test success`)

      return ok(result)
    } catch (error) {
      logError('Provider test failed:', error)
      return fail(error)
    }
  })

  transport.on(intelligenceApiEvents.testCapability, async (data, _context) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
        throw new Error('Invalid capability test payload')
      }

      const { capabilityId, providerId, userInput, ...rest } = data

      const capability = intelligenceCapabilityRegistry.get(capabilityId)
      if (!capability) {
        throw new Error(`Capability ${capabilityId} not registered`)
      }

      const tester = capabilityTesterRegistry.get(capabilityId)
      if (!tester) {
        throw new Error(`No tester registered for capability ${capabilityId}`)
      }

      ensureIntelligenceConfigLoaded()
      const options = getCapabilityOptions(capabilityId)
      let allowedProviderIds = options.allowedProviderIds
      if (typeof providerId === 'string') {
        allowedProviderIds = [providerId]
      }

      logInfo(`Testing capability ${capabilityId}`)

      // 使用测试器生成 payload
      const payload = await tester.generateTestPayload({
        ...rest,
        providerId,
        userInput
      } as CapabilityTestPayload)

      // 执行测试
      const result = await tuffIntelligence.invoke(capabilityId, payload, {
        modelPreference: options.modelPreference,
        allowedProviderIds: isStringArray(allowedProviderIds) ? allowedProviderIds : undefined
      })

      // 格式化结果
      const formattedResult = tester.formatTestResult(result)

      logInfo(
        `Capability ${capabilityId} test success via provider ${result.provider} (${result.model})`
      )

      return ok(formattedResult)
    } catch (error) {
      logError('Capability test failed:', error)
      return fail(error)
    }
  })

  transport.on(intelligenceApiEvents.fetchModels, async (data, _context) => {
    try {
      if (!data || typeof data !== 'object' || !data.provider) {
        throw new Error('Missing provider payload')
      }

      const { provider } = data
      ensureIntelligenceConfigLoaded()
      logInfo(`Fetching models for provider ${provider.id}`)
      const models = await fetchProviderModels(provider)
      return ok({
        success: true,
        models
      })
    } catch (error) {
      logError('Fetch models failed:', error)
      return fail(error)
    }
  })

  transport.on(intelligenceApiEvents.reloadConfig, async () => {
    try {
      logInfo('Reloading config on demand')
      ensureIntelligenceConfigLoaded(true)
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
