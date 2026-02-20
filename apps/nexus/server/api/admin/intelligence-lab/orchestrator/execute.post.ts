import { requireAdmin } from '../../../../utils/auth'
import {
  executeIntelligenceLab,
  sanitizeLabActions,
} from '../../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    objective?: string
    actions?: unknown
    providerId?: string
    model?: string
    timeoutMs?: number
    continueOnError?: boolean
  }>(event)

  const objective = String(body?.objective || '').trim()
  if (!objective) {
    throw createError({
      statusCode: 400,
      statusMessage: 'objective is required',
    })
  }

  const actions = sanitizeLabActions(body?.actions)
  if (actions.length <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'actions are required',
    })
  }

  return await executeIntelligenceLab(event, userId, {
    objective,
    actions,
    providerId: typeof body?.providerId === 'string' ? body.providerId : undefined,
    model: typeof body?.model === 'string' ? body.model : undefined,
    timeoutMs: typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined,
    continueOnError: Boolean(body?.continueOnError),
  })
})
