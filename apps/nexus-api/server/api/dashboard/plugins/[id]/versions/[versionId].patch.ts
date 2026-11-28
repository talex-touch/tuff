import { createError, defineEventHandler, readBody } from 'h3'
import { requireAuthOrApiKey } from '../../../../../utils/auth'
import { getUserById } from '../../../../../utils/authStore'
import { getPluginById, setPluginVersionStatus } from '../../../../../utils/pluginsStore'

const ALLOWED_VERSION_STATUSES = ['pending', 'approved', 'rejected'] as const

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:moderate'])
  const id = event.context.params?.id
  const versionId = event.context.params?.versionId

  if (!id || !versionId)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id and version id are required.' })

  const body = await readBody<{ status?: string, reason?: string }>(event)
  const status = body?.status?.trim()
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

  if (!status || !(ALLOWED_VERSION_STATUSES as readonly string[]).includes(status))
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })

  const plugin = await getPluginById(event, id)
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const user = await getUserById(event, userId)
  if (user?.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Only administrators can moderate versions.' })

  const version = await setPluginVersionStatus(event, id, versionId, status as (typeof ALLOWED_VERSION_STATUSES)[number], {
    actorId: userId,
    actorRole: 'admin',
    reason: status === 'rejected' ? (reason || null) : null,
  })

  return { version }
})
