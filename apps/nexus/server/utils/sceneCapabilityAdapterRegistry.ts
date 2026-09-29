import type { ProviderRegistryRecord } from './providerRegistryStore'

export interface SceneCapabilityAdapterRegistryReadiness {
  providerId: string
  vendor: string
  capability: string
  adapterKey: string | null
  ready: boolean
  matchedKey: string | null
  fallbackKey: string | null
  reason: 'adapter-ready' | 'provider-capability-missing' | 'adapter-key-missing' | 'adapter-missing'
}

export interface SceneCapabilityAdapterRegistryEntry<TAdapter> {
  key: string
  adapter: TAdapter
}

export interface SceneCapabilityAdapterCatalogEntry {
  key: string
  label: string
  capabilities: readonly string[]
  supportsStreaming: boolean
}

export const SCENE_CAPABILITY_ADAPTER_CATALOG = [
  {
    key: 'tencent-translation',
    label: 'Tencent Cloud Translation',
    capabilities: ['text.translate', 'image.translate', 'image.translate.e2e'],
    supportsStreaming: false,
  },
  {
    key: 'openai-compatible',
    label: 'OpenAI-compatible Chat Completions',
    capabilities: ['text.chat', 'chat.completion', 'text.translate', 'text.summarize', 'text.rewrite', 'content.extract', 'keywords.extract', 'intent.detect', 'code.explain', 'code.review', 'vision.ocr'],
    supportsStreaming: true,
  },
  {
    key: 'openai-responses',
    label: 'OpenAI Responses',
    capabilities: ['text.chat', 'chat.completion', 'text.translate', 'text.summarize', 'text.rewrite', 'content.extract', 'keywords.extract', 'intent.detect', 'code.explain', 'code.review', 'vision.ocr'],
    supportsStreaming: true,
  },
  {
    key: 'dashscope-filetrans-asr',
    label: 'DashScope Filetrans ASR',
    capabilities: ['audio.transcribe'],
    supportsStreaming: false,
  },
  {
    key: 'dashscope-qwen-audio-asr',
    label: 'DashScope Qwen Audio ASR',
    capabilities: ['audio.stt', 'audio.transcribe'],
    supportsStreaming: false,
  },
  {
    key: 'exchange-rate',
    label: 'Exchange Rate API',
    capabilities: ['fx.rate.latest', 'fx.convert'],
    supportsStreaming: false,
  },
  {
    key: 'local-overlay',
    label: 'Local Screenshot Overlay',
    capabilities: ['overlay.render'],
    supportsStreaming: false,
  },
] as const satisfies readonly SceneCapabilityAdapterCatalogEntry[]

export type SceneCapabilityAdapterKey = typeof SCENE_CAPABILITY_ADAPTER_CATALOG[number]['key']

function normalizeAdapterKey(key: string) {
  return key.trim().toLowerCase()
}
const adapterCatalogByKey: Record<string, SceneCapabilityAdapterCatalogEntry> = Object.fromEntries(
  SCENE_CAPABILITY_ADAPTER_CATALOG.map(entry => [entry.key, entry]),
)

export const DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS = SCENE_CAPABILITY_ADAPTER_CATALOG.flatMap(entry =>
  entry.capabilities.map(capability => `${entry.key}:${capability}`),
)

const defaultAdapterKeySet = new Set<string>(DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS)
const sceneCapabilityAdapters = new Map<string, unknown>()
const sceneCapabilityAdapterKeys = new Set<string>(DEFAULT_SCENE_CAPABILITY_ADAPTER_KEYS)

export function listSceneCapabilityAdapterCatalog(): SceneCapabilityAdapterCatalogEntry[] {
  return SCENE_CAPABILITY_ADAPTER_CATALOG.map(entry => ({
    ...entry,
    capabilities: [...entry.capabilities],
  }))
}

export function normalizeSceneCapabilityAdapterKey(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const normalized = normalizeAdapterKey(value)
  return normalized || null
}

export function isKnownSceneCapabilityAdapterKey(value: unknown): value is SceneCapabilityAdapterKey {
  const normalized = normalizeSceneCapabilityAdapterKey(value)
  return Boolean(normalized && Object.hasOwn(adapterCatalogByKey, normalized))
}

export function sceneCapabilityAdapterSupports(adapterKey: string, capability: string): boolean {
  const entry = adapterCatalogByKey[normalizeAdapterKey(adapterKey)]
  return Boolean(entry?.capabilities.some(item => item === capability))
}

export function resolveProviderSceneAdapterKey(provider: ProviderRegistryRecord): string | null {
  const explicit = normalizeSceneCapabilityAdapterKey(provider.metadata?.adapterKey)
    ?? normalizeSceneCapabilityAdapterKey(provider.metadata?.adapter)
  if (explicit)
    return explicit

  const transport = typeof provider.metadata?.transport === 'string' ? provider.metadata.transport : ''
  const inferred = provider.vendor === 'tencent-cloud'
    ? 'tencent-translation'
    : provider.vendor === 'exchange-rate'
      ? 'exchange-rate'
      : provider.vendor === 'dashscope'
        ? transport === 'filetrans' ? 'dashscope-filetrans-asr' : 'dashscope-qwen-audio-asr'
        : provider.vendor === 'custom' && providerHasCapability(provider, 'overlay.render')
          ? 'local-overlay'
          : transport === 'responses' ? 'openai-responses' : 'openai-compatible'
  return provider.capabilities.every(capability => sceneCapabilityAdapterSupports(inferred, capability.capability))
    ? inferred
    : null
}

function resolveAdapterKeys(provider: ProviderRegistryRecord, capability: string) {
  const configuredAdapterKey = normalizeSceneCapabilityAdapterKey(provider.metadata?.adapterKey)
    ?? normalizeSceneCapabilityAdapterKey(provider.metadata?.adapter)
  const resolvedAdapterKey = resolveProviderSceneAdapterKey(provider)
  const configuredKeys = configuredAdapterKey
    ? [`${configuredAdapterKey}:${capability}`, `${configuredAdapterKey}:*`]
    : []
  const inferredKeys = !configuredAdapterKey && resolvedAdapterKey
    ? [`${resolvedAdapterKey}:${capability}`, `${resolvedAdapterKey}:*`]
    : []
  return [
    ...configuredKeys,
    // Read-only migration fallbacks for registry rows and test adapters created
    // before adapterKey became mandatory.
    `${provider.vendor}:${capability}`,
    `${provider.vendor}:*`,
    `*:${capability}`,
    ...inferredKeys,
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
  const adapterKey = resolveProviderSceneAdapterKey(provider)
  if (!normalizedCapability || !providerHasCapability(provider, normalizedCapability)) {
    return {
      providerId: provider.id,
      vendor: provider.vendor,
      capability: normalizedCapability || capability,
      adapterKey,
      ready: false,
      matchedKey: null,
      fallbackKey: null,
      reason: 'provider-capability-missing',
    }
  }

  if (!adapterKey) {
    return {
      providerId: provider.id,
      vendor: provider.vendor,
      capability: normalizedCapability,
      adapterKey: null,
      ready: false,
      matchedKey: null,
      fallbackKey: null,
      reason: 'adapter-key-missing',
    }
  }

  const exactKey = normalizeAdapterKey(`${adapterKey}:${normalizedCapability}`)
  const matchedKey = resolveKnownSceneCapabilityAdapterKey(provider, normalizedCapability)
  if (!matchedKey) {
    return {
      providerId: provider.id,
      vendor: provider.vendor,
      capability: normalizedCapability,
      adapterKey,
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
    adapterKey,
    ready: true,
    matchedKey,
    fallbackKey: matchedKey === exactKey ? null : exactKey,
    reason: 'adapter-ready',
  }
}
