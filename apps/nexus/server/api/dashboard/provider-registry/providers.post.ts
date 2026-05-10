import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { assertNoPlainProviderSecrets, createProviderRegistryEntry } from '../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  assertNoPlainProviderSecrets(body)

  const provider = await createProviderRegistryEntry(event, {
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
  }, userId)

  return { provider }
})
