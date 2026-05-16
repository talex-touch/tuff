import type { H3Event } from 'h3'
import type { IntelligenceProviderRecord } from './intelligenceStore'
import { getProviderApiKey, listProviders } from './intelligenceStore'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { createProviderRegistryEntry, deleteProviderRegistryEntry, listProviderRegistryEntries, updateProviderRegistryEntry } from './providerRegistryStore'
import { deleteProviderCredential, getProviderCredential, storeProviderCredential } from './providerCredentialStore'

const INTELLIGENCE_PROVIDER_SOURCE = 'intelligence'
const DEFAULT_AI_CAPABILITIES = ['chat.completion', 'text.summarize'] as const

const PROVIDER_TYPE_VENDOR: Record<string, 'openai' | 'deepseek' | 'custom'> = {
  openai: 'openai',
  deepseek: 'deepseek',
}

export interface SyncIntelligenceProviderRegistryOptions {
  apiKey?: string | null
}

export interface MigrateIntelligenceProviderRegistryOptions {
  dryRun?: boolean
  providerIds?: string[]
}

export interface IntelligenceProviderRegistryMigrationItem {
  providerId: string
  providerName: string
  action: 'would_create' | 'would_update' | 'created' | 'updated' | 'skipped' | 'failed'
  registryProviderId: string | null
  migratedApiKey: boolean
  reason: string | null
}

export interface IntelligenceProviderRegistryMigrationResult {
  dryRun: boolean
  total: number
  migrated: number
  skipped: number
  failed: number
  readyForRegistryPrimaryReads: boolean
  blockers: string[]
  items: IntelligenceProviderRegistryMigrationItem[]
}

function toProviderRegistryVendor(type: string) {
  return PROVIDER_TYPE_VENDOR[type] ?? 'custom'
}

function toProviderRegistryStatus(provider: Pick<IntelligenceProviderRecord, 'enabled'>) {
  return provider.enabled ? 'enabled' : 'disabled'
}

export function buildIntelligenceProviderAuthRef(providerId: string): string {
  return `secure://providers/intelligence-${providerId.replace(/[^a-z0-9._-]/gi, '-').toLowerCase()}`
}

function normalizeCapabilities(capabilities: string[] | null | undefined, type: string): string[] {
  const source = capabilities?.length ? capabilities : [...DEFAULT_AI_CAPABILITIES]
  const normalized = new Set<string>()

  for (const capability of source) {
    if (capability === 'text.chat') {
      normalized.add('chat.completion')
      continue
    }
    normalized.add(capability)
  }

  if (type === 'local')
    normalized.add('vision.ocr')

  return [...normalized].sort()
}

function buildCapabilityInput(capability: string) {
  return {
    capability,
    schemaRef: `nexus://schemas/provider/${capability.replace(/\./g, '-')}.v1`,
    metering: capability === 'vision.ocr'
      ? { unit: 'image' }
      : { unit: 'token' },
    metadata: {
      source: INTELLIGENCE_PROVIDER_SOURCE,
      originalCapability: capability === 'chat.completion' ? 'text.chat' : capability,
    },
  }
}

function readExistingProviderMetadata(existing: ProviderRegistryRecord | null): Record<string, unknown> {
  const metadata = existing?.metadata
  return metadata && typeof metadata === 'object' ? metadata : {}
}

function buildProviderMetadata(provider: IntelligenceProviderRecord, registryProviderId?: string, existing?: ProviderRegistryRecord | null) {
  const existingMetadata = readExistingProviderMetadata(existing ?? null)
  return {
    ...existingMetadata,
    source: INTELLIGENCE_PROVIDER_SOURCE,
    intelligenceProviderId: provider.id,
    providerRegistryId: registryProviderId ?? (typeof existingMetadata.providerRegistryId === 'string' ? existingMetadata.providerRegistryId : undefined),
    intelligenceType: provider.type,
    models: provider.models,
    defaultModel: provider.defaultModel,
    timeout: provider.timeout,
    priority: provider.priority,
    rateLimit: provider.rateLimit,
    hasApiKey: provider.hasApiKey,
    instructionsConfigured: Boolean(provider.instructions),
  }
}

function readStringMetadata(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumberMetadata(metadata: Record<string, unknown> | null | undefined, key: string, fallback: number): number {
  const value = metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBooleanMetadata(metadata: Record<string, unknown> | null | undefined, key: string): boolean {
  return metadata?.[key] === true
}

function readStringArrayMetadata(metadata: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = metadata?.[key]
  if (!Array.isArray(value))
    return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readRateLimitMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, number> | null {
  const value = metadata?.rateLimit
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const rateLimit: Record<string, number> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'number' && Number.isFinite(item))
      rateLimit[key] = item
  }
  return Object.keys(rateLimit).length > 0 ? rateLimit : null
}

function toLegacyCapability(capability: string): string {
  return capability === 'chat.completion' ? 'text.chat' : capability
}

function mapRegistryMirrorToIntelligenceProvider(entry: ProviderRegistryRecord): IntelligenceProviderRecord | null {
  const metadata = entry.metadata
  if (metadata?.source !== INTELLIGENCE_PROVIDER_SOURCE)
    return null

  const intelligenceProviderId = readStringMetadata(metadata, 'intelligenceProviderId')
  const intelligenceType = readStringMetadata(metadata, 'intelligenceType')
  if (!intelligenceProviderId || !intelligenceType)
    return null

  return {
    id: intelligenceProviderId,
    userId: entry.ownerId ?? '',
    type: intelligenceType,
    name: entry.displayName,
    enabled: entry.status === 'enabled',
    hasApiKey: entry.authType !== 'none' && Boolean(entry.authRef),
    baseUrl: entry.endpoint,
    models: readStringArrayMetadata(metadata, 'models'),
    defaultModel: readStringMetadata(metadata, 'defaultModel'),
    instructions: null,
    timeout: readNumberMetadata(metadata, 'timeout', 30000),
    priority: readNumberMetadata(metadata, 'priority', 1),
    rateLimit: readRateLimitMetadata(metadata),
    capabilities: entry.capabilities.length > 0
      ? entry.capabilities.map(item => toLegacyCapability(item.capability))
      : null,
    metadata: {
      ...(metadata ?? {}),
      providerRegistryId: entry.id,
      providerRegistryStatus: entry.status,
      instructionsConfigured: readBooleanMetadata(metadata, 'instructionsConfigured'),
    },
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

async function findRegistryProviderForIntelligenceProvider(event: H3Event, intelligenceProviderId: string) {
  const entries = await listProviderRegistryEntries(event)
  return entries.find(entry =>
    entry.metadata?.source === INTELLIGENCE_PROVIDER_SOURCE &&
    entry.metadata?.intelligenceProviderId === intelligenceProviderId,
  ) ?? null
}

export async function listIntelligenceProviderRegistryMirrors(
  event: H3Event,
  userId: string,
): Promise<IntelligenceProviderRecord[]> {
  const entries = await listProviderRegistryEntries(event, { ownerScope: 'user' })
  return entries
    .filter(entry => entry.ownerId === userId)
    .map(mapRegistryMirrorToIntelligenceProvider)
    .filter((provider): provider is IntelligenceProviderRecord => Boolean(provider))
}

export function mergeIntelligenceProvidersWithRegistryMirrors(
  providers: IntelligenceProviderRecord[],
  registryMirrors: IntelligenceProviderRecord[],
): IntelligenceProviderRecord[] {
  const merged = new Map<string, IntelligenceProviderRecord>()
  for (const provider of providers)
    merged.set(provider.id, provider)
  for (const provider of registryMirrors) {
    if (!merged.has(provider.id))
      merged.set(provider.id, provider)
  }
  return [...merged.values()].sort((a, b) => {
    const priorityDiff = a.priority - b.priority
    if (priorityDiff !== 0)
      return priorityDiff
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export async function getIntelligenceProviderRegistryMirror(
  event: H3Event,
  userId: string,
  providerId: string,
): Promise<IntelligenceProviderRecord | null> {
  const providers = await listIntelligenceProviderRegistryMirrors(event, userId)
  return providers.find(provider => provider.id === providerId) ?? null
}

export async function getIntelligenceProviderRegistryMirrorApiKey(
  event: H3Event,
  userId: string,
  providerId: string,
): Promise<string | null> {
  const existing = await findRegistryProviderForIntelligenceProvider(event, providerId)
  if (!existing || existing.ownerScope !== 'user' || existing.ownerId !== userId)
    return null
  if (existing.authType !== 'api_key' || !existing.authRef)
    return null

  const credential = await getProviderCredential(event, existing.authRef)
  return credential && 'apiKey' in credential ? credential.apiKey : null
}

export async function listIntelligenceProvidersWithRegistryMirrors(
  event: H3Event,
  userId: string,
): Promise<IntelligenceProviderRecord[]> {
  const [providers, registryMirrors] = await Promise.all([
    listProviders(event, userId),
    listIntelligenceProviderRegistryMirrors(event, userId),
  ])
  return mergeIntelligenceProvidersWithRegistryMirrors(providers, registryMirrors)
}

export async function getIntelligenceProviderApiKeyWithRegistryFallback(
  event: H3Event,
  userId: string,
  providerId: string,
): Promise<string | null> {
  return await getProviderApiKey(event, userId, providerId)
    ?? await getIntelligenceProviderRegistryMirrorApiKey(event, userId, providerId)
}

export async function syncIntelligenceProviderToRegistry(
  event: H3Event,
  provider: IntelligenceProviderRecord,
  createdBy: string,
  options: SyncIntelligenceProviderRegistryOptions = {},
) {
  const existing = await findRegistryProviderForIntelligenceProvider(event, provider.id)
  const authRef = buildIntelligenceProviderAuthRef(provider.id)
  const hasApiKeyInput = typeof options.apiKey === 'string' && options.apiKey.trim().length > 0
  const shouldClearApiKey = options.apiKey === null
  const authType = provider.hasApiKey || hasApiKeyInput ? 'api_key' : 'none'
  const metadata = buildProviderMetadata(provider, existing?.id, existing)
  const capabilities = normalizeCapabilities(provider.capabilities, provider.type).map(buildCapabilityInput)

  if (hasApiKeyInput) {
    await storeProviderCredential(event, {
      authRef,
      authType: 'api_key',
      credentials: { apiKey: options.apiKey?.trim() },
    }, createdBy)
  }
  else if (shouldClearApiKey) {
    await deleteProviderCredential(event, authRef)
  }

  const input = {
    name: provider.id,
    displayName: provider.name,
    vendor: toProviderRegistryVendor(provider.type),
    status: toProviderRegistryStatus(provider),
    authType,
    authRef: authType === 'none' ? null : authRef,
    ownerScope: 'user',
    ownerId: provider.userId,
    description: `Mirrored from Nexus Intelligence provider ${provider.name}`,
    endpoint: provider.baseUrl,
    metadata,
    capabilities,
  }

  if (existing)
    return await updateProviderRegistryEntry(event, existing.id, input)

  return await createProviderRegistryEntry(event, input, createdBy)
}

function normalizeProviderIdSet(providerIds: string[] | undefined): Set<string> | null {
  if (!providerIds?.length)
    return null
  const normalized = providerIds
    .map(item => item.trim())
    .filter(Boolean)
  return normalized.length > 0 ? new Set(normalized) : null
}

function createMigrationItem(
  provider: IntelligenceProviderRecord,
  input: Omit<IntelligenceProviderRegistryMigrationItem, 'providerId' | 'providerName'>,
): IntelligenceProviderRegistryMigrationItem {
  return {
    providerId: provider.id,
    providerName: provider.name,
    ...input,
  }
}

export async function migrateLegacyIntelligenceProvidersToRegistry(
  event: H3Event,
  userId: string,
  createdBy: string,
  options: MigrateIntelligenceProviderRegistryOptions = {},
): Promise<IntelligenceProviderRegistryMigrationResult> {
  const dryRun = options.dryRun !== false
  const providerIdSet = normalizeProviderIdSet(options.providerIds)
  const legacyProviders = (await listProviders(event, userId))
    .filter(provider => !providerIdSet || providerIdSet.has(provider.id))

  const items: IntelligenceProviderRegistryMigrationItem[] = []

  for (const provider of legacyProviders) {
    try {
      const existing = await findRegistryProviderForIntelligenceProvider(event, provider.id)
      if (dryRun) {
        items.push(createMigrationItem(provider, {
          action: existing ? 'would_update' : 'would_create',
          registryProviderId: existing?.id ?? null,
          migratedApiKey: false,
          reason: provider.hasApiKey ? 'legacy_api_key_would_move_to_secure_store' : null,
        }))
        continue
      }

      let apiKey: string | undefined
      if (provider.hasApiKey) {
        const decrypted = await getProviderApiKey(event, userId, provider.id)
        if (!decrypted) {
          items.push(createMigrationItem(provider, {
            action: 'failed',
            registryProviderId: existing?.id ?? null,
            migratedApiKey: false,
            reason: 'legacy_api_key_unavailable',
          }))
          continue
        }
        apiKey = decrypted
      }

      const migrated = await syncIntelligenceProviderToRegistry(event, provider, createdBy, {
        apiKey,
      })
      if (!migrated)
        throw new Error('registry_mirror_not_created')

      items.push(createMigrationItem(provider, {
        action: existing ? 'updated' : 'created',
        registryProviderId: migrated.id,
        migratedApiKey: Boolean(apiKey),
        reason: null,
      }))
    }
    catch (error) {
      items.push(createMigrationItem(provider, {
        action: 'failed',
        registryProviderId: null,
        migratedApiKey: false,
        reason: error instanceof Error ? error.message : 'migration_failed',
      }))
    }
  }

  const migrated = items.filter(item => item.action === 'created' || item.action === 'updated').length
  const failed = items.filter(item => item.action === 'failed').length
  const skipped = items.filter(item => item.action === 'skipped').length
  const pending = items.filter(item => item.action === 'would_create' || item.action === 'would_update').length
  const missingRegistryMirror = items.filter(item => !item.registryProviderId).length
  const blockers: string[] = []
  if (dryRun)
    blockers.push('migration_dry_run_only')
  if (failed > 0)
    blockers.push('migration_failed')
  if (pending > 0)
    blockers.push('migration_not_executed')
  if (!dryRun && missingRegistryMirror > 0)
    blockers.push('registry_mirror_missing')

  return {
    dryRun,
    total: legacyProviders.length,
    migrated,
    skipped,
    failed,
    readyForRegistryPrimaryReads: legacyProviders.length > 0
      ? blockers.length === 0
      : !dryRun,
    blockers,
    items,
  }
}

export async function deleteIntelligenceProviderRegistryMirror(event: H3Event, intelligenceProviderId: string) {
  const existing = await findRegistryProviderForIntelligenceProvider(event, intelligenceProviderId)
  if (!existing)
    return false

  await deleteProviderRegistryEntry(event, existing.id)
  await deleteProviderCredential(event, buildIntelligenceProviderAuthRef(intelligenceProviderId))
  return true
}
