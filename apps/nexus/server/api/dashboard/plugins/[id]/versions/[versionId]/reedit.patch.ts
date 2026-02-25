import { createError, readFormData } from 'h3'
import { requireAuth } from '../../../../../../utils/auth'
import { getUserById } from '../../../../../../utils/authStore'
import { getPluginById, reeditPluginVersion } from '../../../../../../utils/pluginsStore'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id
  const versionId = event.context.params?.versionId

  if (!id || !versionId)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id and version id are required.' })

  const plugin = await getPluginById(event, id)
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'
  const isOwner = plugin.userId === userId
  if (!isAdmin && !isOwner)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const formData = await readFormData(event)
  const packageFile = formData.get('package')
  const changelog = formData.get('changelog')

  if (!isFile(packageFile))
    throw createError({ statusCode: 400, statusMessage: 'Package file is required.' })

  if (typeof changelog !== 'string' || !changelog.trim())
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const version = await reeditPluginVersion(event, {
    pluginId: id,
    versionId,
    packageFile,
    changelog: changelog.trim(),
    updatedBy: userId,
    canModerate: isAdmin,
  })

  return {
    version,
  }
})
