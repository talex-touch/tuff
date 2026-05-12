import type { ProviderCapabilityRecord } from '../../../../../utils/providerRegistryStore'
import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { assertNoPlainProviderSecrets, createProviderCapability } from '../../../../../utils/providerRegistryStore'

interface ProviderCapabilityResponse {
  capability: ProviderCapabilityRecord
}

export default defineEventHandler(async (event): Promise<ProviderCapabilityResponse> => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody(event)
  assertNoPlainProviderSecrets(body)

  const capability = await createProviderCapability(event, id, {
    capability: body?.capability,
    schemaRef: body?.schemaRef,
    metering: body?.metering,
    constraints: body?.constraints,
    metadata: body?.metadata,
  })

  if (!capability) {
    throw createError({ statusCode: 404, statusMessage: 'Provider registry entry not found.' })
  }

  return { capability }
})
