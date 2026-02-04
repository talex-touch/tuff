import { createError, readBody } from 'h3'
import { requireAuth } from '../../../../../utils/auth'
import { getUserById } from '../../../../../utils/authStore'
import { getPluginById, setPluginVersionStatus } from '../../../../../utils/pluginsStore'

const ALLOWED_VERSION_STATUSES = ['pending', 'approved', 'rejected'] as const

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id
  const versionId = event.context.params?.versionId

  if (!id || !versionId)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id and version id are required.' })

  const body = await readBody<{ status?: string }>(event)
  const status = body?.status?.trim()

  if (!status || !(ALLOWED_VERSION_STATUSES as readonly string[]).includes(status))
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })

  const plugin = await getPluginById(event, id)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'

  if (!isAdmin)
    throw createError({ statusCode: 403, statusMessage: 'Only administrators can moderate versions.' })

  const version = await setPluginVersionStatus(event, id, versionId, status as (typeof ALLOWED_VERSION_STATUSES)[number])

  return {
    version,
  }
})
