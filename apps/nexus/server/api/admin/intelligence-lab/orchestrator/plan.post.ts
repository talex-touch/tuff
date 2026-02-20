import { requireAdmin } from '../../../../utils/auth'
import { planIntelligenceLab } from '../../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<{
    objective?: string
    context?: Record<string, unknown>
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

  return await planIntelligenceLab(event, userId, {
    objective,
    context: body?.context,
    providerId: typeof body?.providerId === 'string' ? body.providerId : undefined,
    model: typeof body?.model === 'string' ? body.model : undefined,
    timeoutMs: typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined,
  })
})
