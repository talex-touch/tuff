import { createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../../../utils/auth'
import { deleteProviderCapability } from '../../../../../../utils/providerRegistryStore'

interface DeleteProviderCapabilityResponse {
  success: true
}

export default defineEventHandler(async (event): Promise<DeleteProviderCapabilityResponse> => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  const capabilityId = String(getRouterParam(event, 'capabilityId') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }
  if (!capabilityId) {
    throw createError({ statusCode: 400, statusMessage: 'capabilityId is required.' })
  }

  const deleted = await deleteProviderCapability(event, id, capabilityId)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Provider capability not found.' })
  }

  return { success: true }
})
