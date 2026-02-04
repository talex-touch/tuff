import { createError, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getPluginById, setPluginStatus } from '../../../../utils/pluginsStore'

const ALLOWED_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const body = await readBody<{ status?: string }>(event)
  const status = body?.status?.trim()

  if (!status || !(ALLOWED_STATUSES as readonly string[]).includes(status))
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })

  const plugin = await getPluginById(event, id)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'

  const isOwner = plugin.userId === userId

  if (!isAdmin && !isOwner)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  if (!isAdmin && !['draft', 'pending'].includes(status))
    throw createError({ statusCode: 403, statusMessage: 'You cannot set this status.' })

  const updated = await setPluginStatus(event, id, status as (typeof ALLOWED_STATUSES)[number])

  return {
    plugin: updated,
  }
})
