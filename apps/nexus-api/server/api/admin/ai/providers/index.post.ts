import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { storeProviderCredential } from '../../../../utils/providerCredentialStore'
import { extractProviderQuotaConfig } from '../../../../utils/providerQuota'
import {
  assertNoPlainProviderSecrets,
  createProviderRegistryEntry,
  type CreateProviderRegistryInput,
} from '../../../../utils/providerRegistryStore'

function toSlug(value: unknown): string {
  const base = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
  return (base || randomUUID().slice(0, 12)).slice(0, 60)
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const rawBody = await readBody<Record<string, unknown>>(event)
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object.' })
  }

  const { credentials, quota, protocol, baseUrl, models, ...rest } = rawBody
  const authType = typeof rest.authType === 'string' ? rest.authType.trim() : 'api_key'
  let authRef = typeof rest.authRef === 'string' && rest.authRef.trim() ? rest.authRef.trim() : undefined

  if (credentials !== undefined && authType !== 'none') {
    authRef ??= `secure://providers/${toSlug(rest.name)}-${randomUUID().slice(0, 6)}`
  }

  const baseMetadata = rest.metadata && typeof rest.metadata === 'object' && !Array.isArray(rest.metadata)
    ? { ...(rest.metadata as Record<string, unknown>) }
    : {}
  if (typeof protocol === 'string' && protocol.trim() && !baseMetadata.adapterKey)
    baseMetadata.adapterKey = protocol.trim()
  if (typeof baseUrl === 'string' && baseUrl.trim() && !baseMetadata.baseUrl)
    baseMetadata.baseUrl = baseUrl.trim()
  if (Array.isArray(models) && !baseMetadata.models)
    baseMetadata.models = models
  if (quota !== undefined) {
    baseMetadata.quota = quota
  }

  const sanitizedInput: CreateProviderRegistryInput = {
    ...(rest as unknown as CreateProviderRegistryInput),
    authRef,
    metadata: Object.keys(baseMetadata).length > 0 ? baseMetadata : rest.metadata,
  }

  // Ensure no plaintext secrets leak into provider_registry metadata or fields.
  assertNoPlainProviderSecrets(sanitizedInput)

  const created = await createProviderRegistryEntry(event, sanitizedInput, userId)

  let hasCredential = created.authType === 'none'
  if (credentials !== undefined && created.authType !== 'none' && created.authRef) {
    await storeProviderCredential(event, {
      authRef: created.authRef,
      authType: created.authType,
      credentials,
    }, userId)
    hasCredential = true
  }

  return {
    provider: {
      ...created,
      hasCredential,
      quota: extractProviderQuotaConfig(created.metadata),
    },
  }
})
