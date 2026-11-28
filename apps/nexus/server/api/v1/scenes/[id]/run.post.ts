import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { runSceneOrchestrator, type SceneRunResult } from '../../../../utils/sceneOrchestrator'

function sanitizeSceneRunForNonAdmin(run: SceneRunResult): SceneRunResult {
  return {
    ...run,
    selected: Array.isArray(run.selected)
      ? run.selected.map(({ authRef: _authRef, endpoint: _endpoint, region: _region, ...publicSelection }) => ({
          ...publicSelection,
          authRef: null,
          endpoint: null,
          region: null,
        }))
      : [],
    candidates: [],
    fallbackTrail: [],
    trace: [],
  }
}

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  const { userId } = auth
  const isAdmin = auth.user?.role === 'admin' && auth.user?.status === 'active'
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody(event)
  try {
    const run = await runSceneOrchestrator(event, id, {
      input: body?.input,
      capability: body?.capability,
      providerId: body?.providerId,
      dryRun: body?.dryRun,
      ownerId: userId,
    })

    return {
      run: isAdmin ? run : sanitizeSceneRunForNonAdmin(run),
    }
  }
  catch (error: any) {
    if (!isAdmin && error && typeof error === 'object' && error.data && typeof error.data === 'object' && error.data.run) {
      error.data = {
        ...error.data,
        run: sanitizeSceneRunForNonAdmin(error.data.run),
      }
    }
    throw error
  }
})
