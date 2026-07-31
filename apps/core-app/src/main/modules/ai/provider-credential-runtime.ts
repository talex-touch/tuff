import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import type {
  ProviderCredentialDeleteRequest,
  ProviderCredentialSaveRequest,
  ProviderCredentialService,
  ProviderCredentialSurface
} from './provider-credential-service'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { and, eq } from 'drizzle-orm'
import { config } from '../../db/schema'
import { applySecureStoreBatch, getSecureStoreValueStrict } from '../../utils/secure-store'
import { databaseModule } from '../database'
import { operationalErrorService } from '../observability'
import { useMainStorage } from '../storage'
import {
  createProviderCredentialService,
  PROVIDER_SECURE_STORE_PURPOSE,
  providerCredentialSecureStoreKey,
  redactProviderConfigDocument
} from './provider-credential-service'

const providerCredentialLog = getLogger('provider-credential')
const LEGACY_DB_PROVIDER_KEY = 'intelligence/providers'
const LEGACY_DB_MISSING_REVISION = 'missing' as const
const LEGACY_DB_VALUE_REVISION_PREFIX = 'value:'

let productionService: ProviderCredentialService | null = null

function parseLegacyDbProviderDocument(value: string | null): Record<string, unknown> {
  if (!value) return { providers: [] }
  try {
    const providers = JSON.parse(value) as unknown
    if (!Array.isArray(providers)) throw new Error('PROVIDER_CREDENTIAL_CONFIG_INVALID')
    return { providers }
  } catch {
    throw new Error('PROVIDER_CREDENTIAL_CONFIG_INVALID')
  }
}

function createMainConfigSurface(): ProviderCredentialSurface {
  return {
    id: 'aisdk-config',
    async read() {
      const storage = useMainStorage()
      return {
        document: storage.getConfig(StorageList.IntelligenceConfig) as Record<string, unknown>,
        revision: storage.getVersion(StorageList.IntelligenceConfig)
      }
    },
    async write(document, expectedRevision) {
      if (expectedRevision !== undefined && typeof expectedRevision !== 'number') return false
      const result = await useMainStorage().saveConfigDurable(
        StorageList.IntelligenceConfig,
        redactProviderConfigDocument(document),
        { force: true, version: expectedRevision }
      )
      return result.success
    }
  }
}

function createLegacyDbSurface(): ProviderCredentialSurface {
  return {
    id: LEGACY_DB_PROVIDER_KEY,
    async read() {
      const rows = await databaseModule
        .getDb()
        .select({ value: config.value })
        .from(config)
        .where(eq(config.key, LEGACY_DB_PROVIDER_KEY))
        .limit(1)
      const rawValue = rows[0]?.value ?? null
      return {
        document: parseLegacyDbProviderDocument(rawValue),
        revision:
          rawValue === null
            ? LEGACY_DB_MISSING_REVISION
            : `${LEGACY_DB_VALUE_REVISION_PREFIX}${rawValue}`
      }
    },
    async write(document, expectedRevision) {
      if (!Array.isArray(document.providers) || typeof expectedRevision !== 'string') return false
      const nextValue = JSON.stringify(document.providers)
      try {
        if (expectedRevision === LEGACY_DB_MISSING_REVISION) {
          const inserted = await databaseModule
            .getDb()
            .insert(config)
            .values({ key: LEGACY_DB_PROVIDER_KEY, value: nextValue })
            .onConflictDoNothing({ target: config.key })
            .returning({ key: config.key })
          return inserted.length === 1
        }
        if (!expectedRevision.startsWith(LEGACY_DB_VALUE_REVISION_PREFIX)) return false
        const previousValue = expectedRevision.slice(LEGACY_DB_VALUE_REVISION_PREFIX.length)
        const updated = await databaseModule
          .getDb()
          .update(config)
          .set({ value: nextValue })
          .where(and(eq(config.key, LEGACY_DB_PROVIDER_KEY), eq(config.value, previousValue)))
          .returning({ key: config.key })
        return updated.length === 1
      } catch {
        return false
      }
    }
  }
}

function getProductionService(rootPath?: string): ProviderCredentialService {
  if (!productionService) {
    if (!rootPath) throw new Error('PROVIDER_CREDENTIAL_SERVICE_NOT_INITIALIZED')
    productionService = createProviderCredentialService({
      surfaces: [createMainConfigSurface(), createLegacyDbSurface()],
      vault: {
        get: (key) =>
          getSecureStoreValueStrict(rootPath, key, PROVIDER_SECURE_STORE_PURPOSE, () => undefined),
        apply: async (entries) =>
          await applySecureStoreBatch(
            rootPath,
            entries.map((entry) => ({
              ...entry,
              purpose: PROVIDER_SECURE_STORE_PURPOSE
            })),
            () => undefined
          )
      },
      report: (code, metadata) => {
        providerCredentialLog.warn(code, metadata)
        if (code.endsWith('_FAILED') || code.endsWith('_CONFLICT')) {
          operationalErrorService.report({
            domain: 'privacy',
            operation: 'provider-credential-lifecycle',
            code,
            error: new Error(code),
            severity: 'warning',
            retryable: true,
            userImpact: 'degraded'
          })
        }
      }
    })
  }
  return productionService
}

export async function initializeProviderCredentialLifecycle(): Promise<void> {
  try {
    const { innerRootPath } = await import('../../core/precore')
    await getProductionService(innerRootPath).initialize()
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PROVIDER_CREDENTIAL_MIGRATION_FAILED'
    providerCredentialLog.warn('Provider credential migration deferred', { error: code })
  }
}

export async function shutdownProviderCredentialLifecycle(): Promise<void> {
  const service = productionService
  productionService = null
  await service?.destroy()
}

export function resolveProviderCredential(
  provider: IntelligenceProviderConfig
): string | undefined {
  return productionService?.resolve(provider)
}

export function hasProviderCredential(providerId: string): boolean {
  return productionService?.has(providerId) ?? false
}

export async function saveProviderCredentialConfig(
  request: ProviderCredentialSaveRequest
): Promise<IntelligenceProviderConfig> {
  return await getProductionService().saveProvider(request)
}

export async function deleteProviderCredentialConfig(
  request: ProviderCredentialDeleteRequest
): Promise<{ deleted: boolean }> {
  return await getProductionService().deleteProvider(request)
}

export function projectIntelligenceConfigForRenderer(value: unknown): Record<string, unknown> {
  return redactProviderConfigDocument(value)
}

export function providerCredentialCatalogSecureStoreKey(providerId: string): string {
  return providerCredentialSecureStoreKey(providerId)
}
