import type { H3Event } from 'h3'
import { toRegistryCapabilityId, toRuntimeCapabilityId } from '@talex-touch/tuff-intelligence/light'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord, SceneStrategyBindingInput } from './sceneRegistryStore'
import { createProviderRegistryEntry, listProviderRegistryEntries, updateProviderRegistryEntry } from './providerRegistryStore'
import { createSceneRegistryEntry, getSceneRegistryEntry, updateSceneRegistryEntry } from './sceneRegistryStore'
import { readCloudflareBindings } from './cloudflare'
import {
  isKnownSceneCapabilityAdapterKey,
  normalizeSceneCapabilityAdapterKey,
  sceneCapabilityAdapterSupports,
} from './sceneCapabilityAdapterRegistry'

const SEED_CREATED_BY = 'system:nexus-provider-scene-seed'
const SEED_SOURCE = 'nexus-provider-scene-seed'
const OVERLAY_PROVIDER_NAME = 'custom-local-overlay'
const COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID = 'corebox.screenshot.translate'
const SCREENSHOT_TRANSLATE_REQUIRED_CAPABILITIES = ['vision.ocr', 'text.translate', 'overlay.render'] as const
const SCREENSHOT_TRANSLATE_DIRECT_CAPABILITIES = ['image.translate.e2e'] as const
const CANONICAL_CAPABILITY_PREFIXES = ['audio.', 'chat.', 'code.', 'content.', 'image.', 'intent.', 'keywords.', 'text.', 'vision.'] as const

interface ProviderSceneSeedResult {
  overlayProviderId: string | null
  createdOverlayProvider: boolean
  createdScreenshotScene: boolean
  updatedScreenshotScene: boolean
  createdCanonicalScenes: string[]
}

function hasCapability(provider: ProviderRegistryRecord, capability: string): boolean {
  return provider.capabilities.some(item => item.capability === capability)
}

function isSeedOverlayProvider(provider: ProviderRegistryRecord): boolean {
  if (!hasCapability(provider, 'overlay.render'))
    return false

  return provider.name === OVERLAY_PROVIDER_NAME
    || (
      provider.metadata?.source === SEED_SOURCE
      && provider.metadata?.seedId === OVERLAY_PROVIDER_NAME
    )
}

function isSeedManagedScene(scene: SceneRegistryRecord): boolean {
  return scene.metadata?.source === SEED_SOURCE
    && scene.metadata?.seedId === COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID
}

function providerPriority(provider: ProviderRegistryRecord, capability: string): number {
  const capabilityRecord = provider.capabilities.find(item => item.capability === capability)
  const capabilityPriority = capabilityRecord?.metadata?.priority
  const providerPriority = provider.metadata?.priority

  if (typeof capabilityPriority === 'number' && Number.isFinite(capabilityPriority))
    return capabilityPriority
  if (typeof providerPriority === 'number' && Number.isFinite(providerPriority))
    return providerPriority
  return 100
}

function providerModels(provider: ProviderRegistryRecord): string[] {
  const value = provider.metadata?.models
  return Array.isArray(value)
    ? value.filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    : []
}

function inferProviderAdapterKey(provider: ProviderRegistryRecord): string | null {
  const existing = normalizeSceneCapabilityAdapterKey(provider.metadata?.adapterKey)
    ?? normalizeSceneCapabilityAdapterKey(provider.metadata?.adapter)
  if (existing && isKnownSceneCapabilityAdapterKey(existing))
    return existing

  const transport = typeof provider.metadata?.transport === 'string' ? provider.metadata.transport : ''
  const candidate = provider.vendor === 'tencent-cloud'
    ? 'tencent-translation'
    : provider.vendor === 'exchange-rate'
      ? 'exchange-rate'
      : provider.vendor === 'dashscope'
        ? transport === 'filetrans' ? 'dashscope-filetrans-asr' : 'dashscope-qwen-audio-asr'
        : provider.vendor === 'custom' && hasCapability(provider, 'overlay.render')
          ? 'local-overlay'
          : transport === 'responses' ? 'openai-responses' : 'openai-compatible'
  return provider.capabilities.every(capability => sceneCapabilityAdapterSupports(candidate, capability.capability))
    ? candidate
    : null
}

async function migrateProviderRoutingMetadata(
  event: H3Event,
  providers: ProviderRegistryRecord[],
): Promise<ProviderRegistryRecord[]> {
  const migrated: ProviderRegistryRecord[] = []
  for (const provider of providers) {
    const adapterKey = inferProviderAdapterKey(provider)
    if (!adapterKey) {
      migrated.push(provider)
      continue
    }
    const models = providerModels(provider)
    const normalizedCapabilities = provider.capabilities.map(capability => ({
      capability: toRegistryCapabilityId(toRuntimeCapabilityId(capability.capability)),
      schemaRef: capability.schemaRef,
      metering: capability.metering,
      constraints: capability.constraints,
      metadata: capability.metadata,
    }))
    const capabilitiesChanged = normalizedCapabilities.some((capability, index) =>
      capability.capability !== provider.capabilities[index]?.capability)
    const configuredDefault = typeof provider.metadata?.defaultModel === 'string'
      ? provider.metadata.defaultModel.trim()
      : ''
    const defaultModel = configuredDefault && models.includes(configuredDefault)
      ? configuredDefault
      : models[0] ?? null
    const metadata: Record<string, unknown> = {
      ...(provider.metadata ?? {}),
      adapterKey,
      ...(models.length > 0 ? { models } : {}),
      ...(defaultModel ? { defaultModel } : {}),
    }
    if (typeof metadata.adapter === 'string')
      delete metadata.adapter
    const currentDefaultModel = typeof provider.metadata?.defaultModel === 'string'
      ? provider.metadata.defaultModel
      : null
    const hasLegacyMetadata = provider.metadata?.intelligenceProviderId !== undefined
      || provider.metadata?.source === 'intelligence'
    delete metadata.intelligenceProviderId
    if (metadata.source === 'intelligence')
      metadata.source = 'provider-registry'
    const unchanged = provider.metadata?.adapterKey === adapterKey
      && currentDefaultModel === defaultModel
      && provider.metadata?.adapter === undefined
      && !capabilitiesChanged
      && !hasLegacyMetadata
    if (unchanged) {
      migrated.push(provider)
      continue
    }
    migrated.push(await updateProviderRegistryEntry(event, provider.id, { metadata, capabilities: normalizedCapabilities }) ?? provider)
  }
  return migrated
}

function sortProvidersBySeedPreference(capability: string, providers: ProviderRegistryRecord[]) {
  return [...providers].sort((a, b) => {
    const priorityDiff = providerPriority(a, capability) - providerPriority(b, capability)
    if (priorityDiff !== 0)
      return priorityDiff
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}

function findFirstSystemProviderWithCapability(
  providers: ProviderRegistryRecord[],
  capability: string,
): ProviderRegistryRecord | null {
  return sortProvidersBySeedPreference(
    capability,
    providers.filter(provider =>
      provider.status === 'enabled'
      && provider.ownerScope === 'system'
      && hasCapability(provider, capability),
    ),
  )[0] ?? null
}

function hasSystemProviderWithCapability(providers: ProviderRegistryRecord[], capability: string): boolean {
  return Boolean(findFirstSystemProviderWithCapability(providers, capability))
}

function resolveSeedRequiredCapabilities(
  providers: ProviderRegistryRecord[],
  overlayProvider: ProviderRegistryRecord,
): string[] {
  const hasComposedPath = overlayProvider.status === 'enabled'
    && hasSystemProviderWithCapability(providers, 'vision.ocr')
    && hasSystemProviderWithCapability(providers, 'text.translate')

  if (hasComposedPath)
    return [...SCREENSHOT_TRANSLATE_REQUIRED_CAPABILITIES]
  if (hasSystemProviderWithCapability(providers, 'image.translate.e2e'))
    return [...SCREENSHOT_TRANSLATE_DIRECT_CAPABILITIES]
  return [...SCREENSHOT_TRANSLATE_REQUIRED_CAPABILITIES]
}

function hasBinding(scene: SceneRegistryRecord, providerId: string, capability: string): boolean {
  return scene.bindings.some(binding => binding.providerId === providerId && binding.capability === capability)
}

function hasAnyBindingForCapability(scene: SceneRegistryRecord, capability: string): boolean {
  return scene.bindings.some(binding => binding.capability === capability)
}

function buildSystemBinding(
  providers: ProviderRegistryRecord[],
  capability: string,
  priority: number,
): SceneStrategyBindingInput | null {
  const provider = findFirstSystemProviderWithCapability(providers, capability)
  if (!provider)
    return null

  return {
    providerId: provider.id,
    capability,
    priority,
    model: providerModels(provider).includes(String(provider.metadata?.defaultModel ?? ''))
      ? String(provider.metadata?.defaultModel)
      : providerModels(provider)[0] ?? null,
    status: 'enabled',
    metadata: {
      source: SEED_SOURCE,
    },
  }
}

function buildSeedBindings(
  providers: ProviderRegistryRecord[],
  overlayProvider: ProviderRegistryRecord,
): SceneStrategyBindingInput[] {
  return [
    buildSystemBinding(providers, 'image.translate.e2e', 10),
    buildSystemBinding(providers, 'vision.ocr', 20),
    buildSystemBinding(providers, 'text.translate', 30),
    {
      providerId: overlayProvider.id,
      capability: 'overlay.render',
      priority: 40,
      status: overlayProvider.status === 'enabled' ? 'enabled' : 'disabled',
      metadata: {
        source: SEED_SOURCE,
      },
    },
  ].filter((binding): binding is SceneStrategyBindingInput => Boolean(binding))
}

function mergeSeedBindings(
  scene: SceneRegistryRecord,
  seedBindings: SceneStrategyBindingInput[],
): SceneStrategyBindingInput[] {
  const merged: SceneStrategyBindingInput[] = scene.bindings.map(binding => ({
    providerId: binding.providerId,
    capability: binding.capability,
    model: binding.model,
    priority: binding.priority,
    weight: binding.weight,
    status: binding.status,
    constraints: binding.constraints,
    metadata: binding.metadata,
  }))

  for (const binding of seedBindings) {
    const providerId = typeof binding.providerId === 'string' ? binding.providerId : ''
    const capability = typeof binding.capability === 'string' ? binding.capability : ''
    if (!providerId || !capability)
      continue
    if (hasBinding(scene, providerId, capability))
      continue
    if (hasAnyBindingForCapability(scene, capability))
      continue
    merged.push(binding)
  }

  return merged
}

async function ensureLocalOverlayProvider(
  event: H3Event,
  providers: ProviderRegistryRecord[],
): Promise<{ provider: ProviderRegistryRecord, created: boolean }> {
  const existing = providers.find(isSeedOverlayProvider)
  if (existing)
    return { provider: existing, created: false }

  const provider = await createProviderRegistryEntry(event, {
    name: OVERLAY_PROVIDER_NAME,
    displayName: 'Local Overlay Renderer',
    vendor: 'custom',
    status: 'enabled',
    authType: 'none',
    ownerScope: 'system',
    description: 'Local client overlay renderer for composed screenshot translation scenes.',
    metadata: {
      source: SEED_SOURCE,
      seedId: OVERLAY_PROVIDER_NAME,
      localOnly: true,
      adapterKey: 'local-overlay',
    },
    capabilities: [
      {
        capability: 'overlay.render',
        schemaRef: 'nexus://schemas/provider/overlay-render.v1',
        metering: {
          unit: 'image',
          billable: false,
        },
        metadata: {
          source: SEED_SOURCE,
          localOnly: true,
        },
      },
    ],
  }, SEED_CREATED_BY)

  return { provider, created: true }
}

async function ensureScreenshotTranslateScene(
  event: H3Event,
  providers: ProviderRegistryRecord[],
  overlayProvider: ProviderRegistryRecord,
): Promise<{ created: boolean, updated: boolean }> {
  const seedBindings = buildSeedBindings(providers, overlayProvider)
  const seedRequiredCapabilities = resolveSeedRequiredCapabilities(providers, overlayProvider)
  const existing = await getSceneRegistryEntry(event, COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID)

  if (!existing) {
    await createSceneRegistryEntry(event, {
      id: COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID,
      displayName: 'CoreBox Screenshot Translate',
      owner: 'core-app',
      ownerScope: 'system',
      status: 'enabled',
      requiredCapabilities: seedRequiredCapabilities,
      strategyMode: 'priority',
      fallback: 'enabled',
      meteringPolicy: {
        units: ['image', 'character'],
      },
      auditPolicy: {
        persistInput: false,
        persistOutput: false,
        persistTrace: true,
      },
      metadata: {
        source: SEED_SOURCE,
        seedId: COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID,
      },
      bindings: seedBindings,
    }, SEED_CREATED_BY)
    return { created: true, updated: false }
  }

  const mergedBindings = mergeSeedBindings(existing, seedBindings)
  const hasBindingChanges = mergedBindings.length !== existing.bindings.length
  const requiredCapabilities = isSeedManagedScene(existing)
    ? seedRequiredCapabilities
    : existing.requiredCapabilities
  const hasRequiredCapabilityChanges = requiredCapabilities.join('\n') !== existing.requiredCapabilities.join('\n')

  if (!hasBindingChanges && !hasRequiredCapabilityChanges)
    return { created: false, updated: false }

  await updateSceneRegistryEntry(event, existing.id, {
    displayName: existing.displayName,
    owner: existing.owner,
    ownerScope: existing.ownerScope,
    ownerId: existing.ownerId,
    status: existing.status,
    requiredCapabilities,
    strategyMode: existing.strategyMode,
    fallback: existing.fallback,
    meteringPolicy: existing.meteringPolicy,
    auditPolicy: existing.auditPolicy,
    metadata: existing.metadata,
    bindings: mergedBindings,
  })
  return { created: false, updated: true }
}

function isCanonicalCapability(capability: string): boolean {
  return CANONICAL_CAPABILITY_PREFIXES.some(prefix => capability.startsWith(prefix))
}

async function ensureCanonicalCapabilityScenes(
  event: H3Event,
  providers: ProviderRegistryRecord[],
): Promise<string[]> {
  const capabilities = [...new Set(
    providers
      .filter(provider => provider.status === 'enabled' && provider.ownerScope === 'system')
      .flatMap(provider => provider.capabilities.map(capability => capability.capability))
      .filter(isCanonicalCapability),
  )].sort()
  const created: string[] = []

  for (const capability of capabilities) {
    const sceneId = `nexus.intelligence.${capability}`
    if (await getSceneRegistryEntry(event, sceneId))
      continue
    const bindings = sortProvidersBySeedPreference(
      capability,
      providers.filter(provider =>
        provider.status === 'enabled'
        && provider.ownerScope === 'system'
        && hasCapability(provider, capability),
      ),
    ).map((provider, index) => ({
      providerId: provider.id,
      capability,
      model: providerModels(provider).includes(String(provider.metadata?.defaultModel ?? ''))
        ? String(provider.metadata?.defaultModel)
        : providerModels(provider)[0] ?? null,
      priority: (index + 1) * 10,
      status: 'enabled' as const,
      metadata: { source: SEED_SOURCE },
    }))
    if (bindings.length === 0)
      continue
    await createSceneRegistryEntry(event, {
      id: sceneId,
      displayName: `Nexus ${capability}`,
      owner: 'nexus',
      ownerScope: 'system',
      status: 'enabled',
      requiredCapabilities: [capability],
      strategyMode: 'priority',
      fallback: 'enabled',
      meteringPolicy: { source: 'credit-pricing' },
      auditPolicy: { persistInput: false, persistOutput: false, persistTrace: true },
      metadata: { source: SEED_SOURCE, seedId: sceneId, canonicalCapability: capability },
      bindings,
    }, SEED_CREATED_BY)
    created.push(sceneId)
  }
  return created
}

export async function ensureDefaultProviderSceneSeed(event: H3Event): Promise<ProviderSceneSeedResult> {
  const existingProviders = await listProviderRegistryEntries(event)
  const providers = await migrateProviderRoutingMetadata(event, existingProviders)
  const overlay = await ensureLocalOverlayProvider(event, providers)
  const effectiveProviders = overlay.created ? [overlay.provider, ...providers] : providers
  const scene = await ensureScreenshotTranslateScene(event, effectiveProviders, overlay.provider)
  const createdCanonicalScenes = await ensureCanonicalCapabilityScenes(event, effectiveProviders)

  return {
    overlayProviderId: overlay.provider.id,
    createdOverlayProvider: overlay.created,
    createdScreenshotScene: scene.created,
    updatedScreenshotScene: scene.updated,
    createdCanonicalScenes,
  }
}

/**
 * How long an isolate trusts the seed it last ran for a lookup that missed a scene: the registry
 * caches' window, within which other isolates see registry edits too.
 */
const SEED_FOR_MISS_INTERVAL_MS = 30_000

/** When the seed for a missed lookup last finished, per database. A run in flight does not count. */
const seedForMissFinishedAt = new WeakMap<object, number>()

/**
 * The seed, for a lookup that missed a `nexus.intelligence.*` scene, at most once per isolate within
 * `SEED_FOR_MISS_INTERVAL_MS`. A capability no system provider serves never gets a scene, so every
 * invoke for it re-ran the whole seed (the provider list, the screenshot scene, a lookup per
 * canonical capability) before answering 409. A provider added meanwhile gets its scene on the first
 * miss after the window, or at once through the dashboard's seed action.
 */
export async function ensureDefaultProviderSceneSeedForMiss(event: H3Event): Promise<void> {
  const db = readCloudflareBindings(event)?.DB
  const finishedAt = db ? seedForMissFinishedAt.get(db) : undefined
  if (finishedAt !== undefined && Date.now() - finishedAt < SEED_FOR_MISS_INTERVAL_MS)
    return
  await ensureDefaultProviderSceneSeed(event)
  if (db)
    seedForMissFinishedAt.set(db, Date.now())
}
