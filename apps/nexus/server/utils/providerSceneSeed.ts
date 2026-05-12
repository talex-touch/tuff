import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord, SceneStrategyBindingInput } from './sceneRegistryStore'
import { createProviderRegistryEntry, listProviderRegistryEntries } from './providerRegistryStore'
import { createSceneRegistryEntry, getSceneRegistryEntry, updateSceneRegistryEntry } from './sceneRegistryStore'

const SEED_CREATED_BY = 'system:nexus-provider-scene-seed'
const SEED_SOURCE = 'nexus-provider-scene-seed'
const OVERLAY_PROVIDER_NAME = 'custom-local-overlay'
const COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID = 'corebox.screenshot.translate'
const SCREENSHOT_TRANSLATE_REQUIRED_CAPABILITIES = ['vision.ocr', 'text.translate', 'overlay.render'] as const
const SCREENSHOT_TRANSLATE_DIRECT_CAPABILITIES = ['image.translate.e2e'] as const

interface ProviderSceneSeedResult {
  overlayProviderId: string | null
  createdOverlayProvider: boolean
  createdScreenshotScene: boolean
  updatedScreenshotScene: boolean
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

export async function ensureDefaultProviderSceneSeed(event: H3Event): Promise<ProviderSceneSeedResult> {
  const providers = await listProviderRegistryEntries(event)
  const overlay = await ensureLocalOverlayProvider(event, providers)
  const effectiveProviders = overlay.created ? [overlay.provider, ...providers] : providers
  const scene = await ensureScreenshotTranslateScene(event, effectiveProviders, overlay.provider)

  return {
    overlayProviderId: overlay.provider.id,
    createdOverlayProvider: overlay.created,
    createdScreenshotScene: scene.created,
    updatedScreenshotScene: scene.updated,
  }
}
