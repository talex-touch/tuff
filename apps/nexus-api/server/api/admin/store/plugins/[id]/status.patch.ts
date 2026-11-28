import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { getPluginById, setPluginStatus } from '../../../../../utils/pluginsStore'

const ALLOWED_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const body = await readBody<{ status?: string, reason?: string }>(event)
  const status = body?.status?.trim().toLowerCase()
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!status || !(ALLOWED_STATUSES as readonly string[]).includes(status))
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })

  const plugin = await getPluginById(event, id)
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const updated = await setPluginStatus(event, id, status as (typeof ALLOWED_STATUSES)[number], {
    actorId: userId,
    actorRole: 'admin',
    reason: status === 'rejected' ? (reason || null) : null,
  })

  return { plugin: updated }
})
