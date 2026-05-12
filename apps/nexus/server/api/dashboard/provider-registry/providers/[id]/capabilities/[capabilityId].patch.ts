import type { ProviderCapabilityRecord } from '../../../../../../utils/providerRegistryStore'
import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../../utils/auth'
import { assertNoPlainProviderSecrets, updateProviderCapability } from '../../../../../../utils/providerRegistryStore'

interface ProviderCapabilityResponse {
  capability: ProviderCapabilityRecord
}

export default defineEventHandler(async (event): Promise<ProviderCapabilityResponse> => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  const capabilityId = String(getRouterParam(event, 'capabilityId') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }
  if (!capabilityId) {
    throw createError({ statusCode: 400, statusMessage: 'capabilityId is required.' })
  }

  const body = await readBody(event)
  assertNoPlainProviderSecrets(body)

  const capability = await updateProviderCapability(event, id, capabilityId, {
    capability: body?.capability,
    schemaRef: body?.schemaRef,
    metering: body?.metering,
    constraints: body?.constraints,
    metadata: body?.metadata,
  })

  if (!capability) {
    throw createError({ statusCode: 404, statusMessage: 'Provider capability not found.' })
  }

  return { capability }
})
