import type { PluginChannel } from '../../../../utils/pluginsStore'
import { createError, readFormData } from 'h3'
import { requireAuthOrApiKey } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { publishPluginVersion } from '../../../../utils/pluginsStore'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:publish'])
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const formData = await readFormData(event)

  const version = formData.get('version')
  const channel = formData.get('channel')
  const changelogField = formData.get('changelog') ?? formData.get('notes')
  const homepage = formData.get('homepage')
  const packageFile = formData.get('package')
  const iconField = formData.get('icon')
  const iconFile = isFile(iconField) ? iconField : null
  const publisherSignature = formData.get('publisherSignature')
  const publisherPublicKey = formData.get('publisherPublicKey')
  const publisherKeyValidFrom = formData.get('publisherKeyValidFrom')
  const publisherKeyValidUntil = formData.get('publisherKeyValidUntil')

  if (typeof version !== 'string' || !version.trim())
    throw createError({ statusCode: 400, statusMessage: 'Version is required.' })

  if (typeof channel !== 'string' || !channel.trim())
    throw createError({ statusCode: 400, statusMessage: 'Channel is required.' })

  if (!isFile(packageFile))
    throw createError({ statusCode: 400, statusMessage: 'Package file is required.' })

  if (typeof publisherSignature !== 'string' || !publisherSignature.trim())
    throw createError({ statusCode: 400, statusMessage: 'Publisher signature is required.' })
  if (typeof publisherPublicKey !== 'string' || !publisherPublicKey.trim())
    throw createError({ statusCode: 400, statusMessage: 'Publisher public key is required.' })
  if (typeof publisherKeyValidFrom !== 'string' || !publisherKeyValidFrom.trim())
    throw createError({ statusCode: 400, statusMessage: 'Publisher key validFrom is required.' })

  const changelog = typeof changelogField === 'string' ? changelogField.trim() : ''

  if (!changelog.length)
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const normalizedChannel = channel.toUpperCase() as PluginChannel

  let isAdmin = false
  try {
    const user = await getUserById(event, userId)
    isAdmin = user?.role === 'admin'
  }
  catch (error) {
    console.warn('Failed to fetch user metadata for admin check:', error)
  }

  const versionRecord = await publishPluginVersion(event, {
    pluginId: id,
    channel: normalizedChannel,
    version: version.trim(),
    changelog,
    homepage: typeof homepage === 'string' ? homepage.trim() || null : null,
    packageFile,
    publisherSignature,
    publisherPublicKey,
    publisherKeyValidFrom,
    ...(typeof publisherKeyValidUntil === 'string' && publisherKeyValidUntil.trim()
      ? { publisherKeyValidUntil: publisherKeyValidUntil.trim() }
      : {}),
    iconFile: iconFile ?? undefined,
    createdBy: userId,
    canModerate: isAdmin,
  })

  return {
    version: versionRecord,
  }
})
