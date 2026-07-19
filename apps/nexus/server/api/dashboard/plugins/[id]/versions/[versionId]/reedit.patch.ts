import { createError, readFormData } from 'h3'
import { requireAuthOrApiKey } from '../../../../../../utils/auth'
import { getUserById } from '../../../../../../utils/authStore'
import { getPluginById, reeditPluginVersion } from '../../../../../../utils/pluginsStore'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:publish'])
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
  const publisherSignature = formData.get('publisherSignature')
  const publisherPublicKey = formData.get('publisherPublicKey')
  const publisherKeyValidFrom = formData.get('publisherKeyValidFrom')
  const publisherKeyValidUntil = formData.get('publisherKeyValidUntil')

  if (!isFile(packageFile))
    throw createError({ statusCode: 400, statusMessage: 'Package file is required.' })

  if (typeof publisherSignature !== 'string' || !publisherSignature.trim())
    throw createError({ statusCode: 400, statusMessage: 'Publisher signature is required.' })
  if (typeof publisherPublicKey !== 'string' || !publisherPublicKey.trim())
    throw createError({ statusCode: 400, statusMessage: 'Publisher public key is required.' })
  if (typeof publisherKeyValidFrom !== 'string' || !publisherKeyValidFrom.trim())
    throw createError({ statusCode: 400, statusMessage: 'Publisher key validFrom is required.' })

  if (typeof changelog !== 'string' || !changelog.trim())
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const version = await reeditPluginVersion(event, {
    pluginId: id,
    versionId,
    packageFile,
    publisherSignature,
    publisherPublicKey,
    publisherKeyValidFrom,
    ...(typeof publisherKeyValidUntil === 'string' && publisherKeyValidUntil.trim()
      ? { publisherKeyValidUntil: publisherKeyValidUntil.trim() }
      : {}),
    changelog: changelog.trim(),
    updatedBy: userId,
    canModerate: isAdmin,
  })

  return {
    version,
  }
})
