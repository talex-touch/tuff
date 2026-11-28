import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import {
  deleteProviderCredential,
  hasProviderCredential,
  storeProviderCredential,
} from '../../../../utils/providerCredentialStore'
import { extractProviderQuotaConfig } from '../../../../utils/providerQuota'
import {
  assertNoPlainProviderSecrets,
  getProviderRegistryEntry,
  updateProviderRegistryEntry,
  type UpdateProviderRegistryInput,
} from '../../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Provider id is required.' })

  const existing = await getProviderRegistryEntry(event, id)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })

  const rawBody = await readBody<Record<string, unknown>>(event)
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw createError({ statusCode: 400, statusMessage: 'Request body must be a JSON object.' })
  }

  const { credentials, clearCredentials, quota, protocol, baseUrl, models, ...rest } = rawBody
  const nextAuthType = typeof rest.authType === 'string' ? rest.authType.trim() : existing.authType
  let nextAuthRef = rest.authRef !== undefined
    ? (typeof rest.authRef === 'string' ? rest.authRef.trim() || null : null)
    : existing.authRef

  if (credentials !== undefined && nextAuthType !== 'none' && !nextAuthRef) {
    nextAuthRef = `secure://providers/${existing.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 48)}-${randomUUID().slice(0, 6)}`
  }

  let nextMetadata = rest.metadata
  if (quota !== undefined || protocol !== undefined || baseUrl !== undefined || models !== undefined) {
    const baseMeta = (rest.metadata !== undefined ? rest.metadata : existing.metadata)
    const metaObj = baseMeta && typeof baseMeta === 'object' && !Array.isArray(baseMeta)
      ? { ...(baseMeta as Record<string, unknown>) }
      : {}
    if (typeof protocol === 'string' && protocol.trim())
      metaObj.adapterKey = protocol.trim()
    if (typeof baseUrl === 'string' && baseUrl.trim())
      metaObj.baseUrl = baseUrl.trim()
    if (Array.isArray(models))
      metaObj.models = models
    if (quota === null)
      delete metaObj.quota
    else if (quota !== undefined)
      metaObj.quota = quota
    nextMetadata = metaObj
  }

  const patchInput: UpdateProviderRegistryInput = {
    ...(rest as UpdateProviderRegistryInput),
    ...(nextAuthRef !== existing.authRef ? { authRef: nextAuthRef } : {}),
    ...(nextMetadata !== undefined ? { metadata: nextMetadata } : {}),
  }

  assertNoPlainProviderSecrets(patchInput)

  const updated = await updateProviderRegistryEntry(event, id, patchInput)
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })

  if (clearCredentials === true && updated.authRef) {
    await deleteProviderCredential(event, updated.authRef).catch(() => {})
  }
  else if (credentials !== undefined && updated.authType !== 'none' && updated.authRef) {
    await storeProviderCredential(event, {
      authRef: updated.authRef,
      authType: updated.authType,
      credentials,
    }, userId)
  }

  const hasCredential = updated.authType === 'none'
    ? true
    : Boolean(updated.authRef && await hasProviderCredential(event, updated.authRef).catch(() => false))

  return {
    provider: {
      ...updated,
      hasCredential,
      quota: extractProviderQuotaConfig(updated.metadata),
    },
  }
})
