import { requireAdmin } from '../../../../utils/auth'
import {
  reflectIntelligenceLab,
  sanitizeExecutionResults,
  sanitizeLabActions,
} from '../../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    objective?: string
    actions?: unknown
    results?: unknown
    notes?: string
    providerId?: string
    model?: string
    timeoutMs?: number
  }>(event)

  const objective = String(body?.objective || '').trim()
  if (!objective) {
    throw createError({
      statusCode: 400,
      statusMessage: 'objective is required',
    })
  }

  const actions = sanitizeLabActions(body?.actions)
  const results = sanitizeExecutionResults(body?.results)

  return await reflectIntelligenceLab(event, userId, {
    objective,
    actions,
    results,
    notes: typeof body?.notes === 'string' ? body.notes : undefined,
    providerId: typeof body?.providerId === 'string' ? body.providerId : undefined,
    model: typeof body?.model === 'string' ? body.model : undefined,
    timeoutMs: typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined,
  })
})
