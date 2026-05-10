import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { updateSceneRegistryEntry } from '../../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody(event)
  const scene = await updateSceneRegistryEntry(event, id, {
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
  })

  if (!scene) {
    throw createError({ statusCode: 404, statusMessage: 'Scene registry entry not found.' })
  }

  return { scene }
})
