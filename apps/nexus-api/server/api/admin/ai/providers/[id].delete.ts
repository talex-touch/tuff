import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { deleteProviderCredential } from '../../../../utils/providerCredentialStore'
import { deleteProviderRegistryEntry, getProviderRegistryEntry } from '../../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Provider id is required.' })

  const existing = await getProviderRegistryEntry(event, id)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })

  await deleteProviderRegistryEntry(event, id)
  if (existing.authRef)
    await deleteProviderCredential(event, existing.authRef).catch(() => {})

  return { ok: true, id }
})
