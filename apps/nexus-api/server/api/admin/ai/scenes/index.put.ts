import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import {
  createSceneRegistryEntry,
  getSceneRegistryEntry,
  type CreateSceneRegistryInput,
  updateSceneRegistryEntry,
  withSceneRegistryReadiness,
} from '../../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<CreateSceneRegistryInput>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'Scene payload is required.' })
  }

  const sceneId = typeof body.id === 'string' ? body.id.trim() : ''
  if (!sceneId)
    throw createError({ statusCode: 400, statusMessage: 'Scene id is required.' })

  const existing = await getSceneRegistryEntry(event, sceneId)
  const saved = existing
    ? await updateSceneRegistryEntry(event, sceneId, body)
    : await createSceneRegistryEntry(event, body, userId)
  if (!saved)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save scene.' })

  return {
    scene: await withSceneRegistryReadiness(event, saved),
  }
})
