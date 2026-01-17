import type { PluginChannel } from '../../../../utils/pluginsStore'
import { clerkClient } from '@clerk/nuxt/server'
import { createError, readFormData } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { publishPluginVersion } from '../../../../utils/pluginsStore'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
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

  if (typeof version !== 'string' || !version.trim())
    throw createError({ statusCode: 400, statusMessage: 'Version is required.' })

  if (typeof channel !== 'string' || !channel.trim())
    throw createError({ statusCode: 400, statusMessage: 'Channel is required.' })

  if (!isFile(packageFile))
    throw createError({ statusCode: 400, statusMessage: 'Package file is required.' })

  const changelog = typeof changelogField === 'string' ? changelogField.trim() : ''

  if (!changelog.length)
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const normalizedChannel = channel.toUpperCase() as PluginChannel

  let isAdmin = false
  try {
    const client = clerkClient(event)
    const user = await client.users.getUser(userId)
    isAdmin = user.publicMetadata?.role === 'admin'
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
    iconFile: iconFile ?? undefined,
    createdBy: userId,
    canModerate: isAdmin,
  })

  return {
    version: versionRecord,
  }
})
