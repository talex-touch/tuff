import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { runSceneOrchestrator } from '../../../../utils/sceneOrchestrator'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody(event)
  const run = await runSceneOrchestrator(event, id, {
    input: body?.input,
    capability: body?.capability,
    providerId: body?.providerId,
    dryRun: body?.dryRun,
  })

  return { run }
})
