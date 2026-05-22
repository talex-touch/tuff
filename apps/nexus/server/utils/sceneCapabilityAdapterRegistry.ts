import type { ProviderRegistryRecord } from './providerRegistryStore'

export interface SceneCapabilityAdapterRegistryReadiness {
  providerId: string
  vendor: string
  capability: string
  ready: boolean
  matchedKey: string | null
  fallbackKey: string | null
  reason: 'adapter-ready' | 'provider-capability-missing' | 'adapter-missing'
}

export interface SceneCapabilityAdapterRegistryEntry<TAdapter> {
  key: string
  adapter: TAdapter
}

export const DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS = [
  'tencent-cloud:text.translate',
  'tencent-cloud:image.translate',
  'tencent-cloud:image.translate.e2e',
  'openai:vision.ocr',
  'deepseek:vision.ocr',
  'custom:vision.ocr',
  'custom:overlay.render',
  'exchange-rate:fx.rate.latest',
  'exchange-rate:fx.convert',
] as const

const defaultAdapterKeySet = new Set<string>(DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS)
const sceneCapabilityAdapters = new Map<string, unknown>()
const sceneCapabilityAdapterKeys = new Set<string>(DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS)

function normalizeAdapterKey(key: string) {
  return key.trim().toLowerCase()
}

function resolveAdapterKeys(provider: ProviderRegistryRecord, capability: string) {
  return [
    `${provider.vendor}:${capability}`,
    `${provider.vendor}:*`,
    `*:${capability}`,
  ].map(normalizeAdapterKey)
}

function providerHasCapability(provider: ProviderRegistryRecord, capability: string) {
  return provider.capabilities.some(item => item.capability === capability)
}

export function registerKnownSceneCapabilityAdapterRegistryKey(key: string): () => void {
  const normalizedKey = normalizeAdapterKey(key)
  sceneCapabilityAdapterKeys.add(normalizedKey)
  return () => {
    if (!defaultAdapterKeySet.has(normalizedKey) && !sceneCapabilityAdapters.has(normalizedKey))
      sceneCapabilityAdapterKeys.delete(normalizedKey)
  }
}

export function registerSceneCapabilityAdapterRegistryEntry<TAdapter>(key: string, adapter: TAdapter): () => void {
  const normalizedKey = normalizeAdapterKey(key)
  sceneCapabilityAdapters.set(normalizedKey, adapter)
  sceneCapabilityAdapterKeys.add(normalizedKey)
  return () => {
    if (sceneCapabilityAdapters.get(normalizedKey) === adapter)
      sceneCapabilityAdapters.delete(normalizedKey)
    if (!defaultAdapterKeySet.has(normalizedKey) && !sceneCapabilityAdapters.has(normalizedKey))
      sceneCapabilityAdapterKeys.delete(normalizedKey)
  }
}

export function clearSceneCapabilityAdapterEntriesForTest() {
  sceneCapabilityAdapters.clear()
}

export function clearSceneCapabilityAdapterRegistryForTest() {
  sceneCapabilityAdapters.clear()
  sceneCapabilityAdapterKeys.clear()
}

export function resetSceneCapabilityAdapterReadinessForTest() {
  sceneCapabilityAdapterKeys.clear()
  for (const key of DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS)
    sceneCapabilityAdapterKeys.add(key)
}

export function resolveSceneCapabilityAdapterEntry<TAdapter>(
  provider: ProviderRegistryRecord,
  capability: string,
): SceneCapabilityAdapterRegistryEntry<TAdapter> | null {
  for (const key of resolveAdapterKeys(provider, capability)) {
    if (sceneCapabilityAdapters.has(key)) {
      return {
        key,
        adapter: sceneCapabilityAdapters.get(key) as TAdapter,
      }
    }
  }

  return null
}

function resolveKnownSceneCapabilityAdapterKey(provider: ProviderRegistryRecord, capability: string): string | null {
  for (const key of resolveAdapterKeys(provider, capability)) {
    if (sceneCapabilityAdapterKeys.has(key))
      return key
  }

  return null
}

export function resolveSceneCapabilityAdapterReadiness(
  provider: ProviderRegistryRecord,
  capability: string,
): SceneCapabilityAdapterRegistryReadiness {
  const normalizedCapability = capability.trim()
  if (!normalizedCapability || !providerHasCapability(provider, normalizedCapability)) {
    return {
      providerId: provider.id,
      vendor: provider.vendor,
      capability: normalizedCapability || capability,
      ready: false,
      matchedKey: null,
      fallbackKey: null,
      reason: 'provider-capability-missing',
    }
  }

  const exactKey = normalizeAdapterKey(`${provider.vendor}:${normalizedCapability}`)
  const matchedKey = resolveKnownSceneCapabilityAdapterKey(provider, normalizedCapability)
  if (!matchedKey) {
    return {
      providerId: provider.id,
      vendor: provider.vendor,
      capability: normalizedCapability,
      ready: false,
      matchedKey: null,
      fallbackKey: exactKey,
      reason: 'adapter-missing',
    }
  }

  return {
    providerId: provider.id,
    vendor: provider.vendor,
    capability: normalizedCapability,
    ready: true,
    matchedKey,
    fallbackKey: matchedKey === exactKey ? null : exactKey,
    reason: 'adapter-ready',
  }
}
