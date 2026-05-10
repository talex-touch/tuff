import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { createSceneRegistryEntry } from '../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  const scene = await createSceneRegistryEntry(event, {
    id: body?.id,
    displayName: body?.displayName,
    owner: body?.owner,
    ownerScope: body?.ownerScope,
    ownerId: body?.ownerId,
    status: body?.status,
    requiredCapabilities: body?.requiredCapabilities,
    strategyMode: body?.strategyMode,
    fallback: body?.fallback,
    meteringPolicy: body?.meteringPolicy,
    auditPolicy: body?.auditPolicy,
    metadata: body?.metadata,
    bindings: body?.bindings,
  }, userId)

  return { scene }
})
