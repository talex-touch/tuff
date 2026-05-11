import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { assertNoPlainProviderSecrets, updateProviderRegistryEntry } from '../../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody(event)
  assertNoPlainProviderSecrets(body)

  const provider = await updateProviderRegistryEntry(event, id, {
    name: body?.name,
    displayName: body?.displayName,
    vendor: body?.vendor,
    status: body?.status,
    authType: body?.authType,
    authRef: body?.authRef,
    ownerScope: body?.ownerScope,
    ownerId: body?.ownerId,
    description: body?.description,
    endpoint: body?.endpoint,
    region: body?.region,
    metadata: body?.metadata,
    capabilities: body?.capabilities,
  })

  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider registry entry not found.' })
  }

  return { provider }
})
