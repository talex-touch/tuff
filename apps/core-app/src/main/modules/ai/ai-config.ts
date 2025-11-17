import { ai } from './ai-sdk'
import type {
  AiCapabilityRoutingConfig,
  AiSDKPersistedConfig
} from '@talex-touch/utils'
import { storageModule } from '../storage'
import chalk from 'chalk'

let configSignature: string | null = null
let capabilityMap: Record<string, AiCapabilityRoutingConfig> = {}
const LOG = chalk.hex('#b388ff').bold('[Intelligence]')
const SUPPORTED_PROVIDER_TYPES = new Set(['openai', 'anthropic', 'deepseek', 'siliconflow', 'local'])

const normalizeStrategyId = (value?: string) => {
  if (!value) return undefined
  if (value === 'priority') return 'rule-based-default'
  if (value === 'adaptive') return 'adaptive-default'
  return value
}

export function ensureAiConfigLoaded(force = false): void {
  const stored = storageModule.getConfig('aisdk-config') as AiSDKPersistedConfig | undefined
  if (!stored) return

  const signature = JSON.stringify(stored)
  if (!force && signature === configSignature) {
    return
  }

  configSignature = signature
  capabilityMap = stored.capabilities ?? {}

  const normalizedStrategy =
    normalizeStrategyId(stored.globalConfig?.defaultStrategy) ?? 'adaptive-default'

  const providers = (stored.providers ?? []).filter((provider) => {
    if (!SUPPORTED_PROVIDER_TYPES.has(provider.type)) {
      console.warn(LOG, `Unsupported provider type ${provider.type}, skipping ${provider.id}`)
      return false
    }
    return true
  })

  ai.updateConfig({
    providers,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    cacheExpiration: stored.globalConfig?.cacheExpiration,
    capabilities: stored.capabilities ?? {}
  })
}

export function getCapabilityOptions(
  capabilityId: string
): {
  allowedProviderIds?: string[]
  modelPreference?: string[]
  promptTemplate?: string
} {
  const config = capabilityMap[capabilityId]
  if (!config) {
    return {}
  }

  const enabledBindings = config.providers?.filter((binding) => binding.enabled !== false) ?? []
  return {
    allowedProviderIds: enabledBindings.length ? enabledBindings.map((binding) => binding.providerId) : undefined,
    modelPreference: enabledBindings
      .flatMap((binding) => binding.models ?? [])
      .filter((model): model is string => Boolean(model)),
    promptTemplate: config.promptTemplate
  }
}

export function getCapabilityPrompt(capabilityId: string): string | undefined {
  return capabilityMap[capabilityId]?.promptTemplate
}

export function listCapabilities(): AiCapabilityRoutingConfig[] {
  return Object.values(capabilityMap)
}

export function getCapabilitiesMap(): Record<string, AiCapabilityRoutingConfig> {
  return capabilityMap
}
