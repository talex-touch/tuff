import { clerkClient } from '@clerk/nuxt/server'
import { createError, readFormData } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { uploadImage } from '../../../utils/imageStorage'
import { getPluginById, updatePlugin } from '../../../utils/pluginsStore'

const ALLOWED_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const
const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const formData = await readFormData(event)

  const client = clerkClient(event)
  const user = await client.users.getUser(userId)
  const isAdmin = user.publicMetadata?.role === 'admin'

  const existing = await getPluginById(event, id)

  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (!isAdmin && existing.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const getString = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value.trim() : undefined
  }

  const name = getString('name')
  const summary = getString('summary')
  const category = getString('category')
  const homepage = getString('homepage')
  const badgesInput = getString('badges')
  const readmeField = formData.get('readme')
  const isOfficialField = getString('isOfficial')
  const statusField = getString('status')
  const removeIcon = getString('removeIcon') === 'true'

  let readmeMarkdown: string | undefined
  if (typeof readmeField === 'string')
    readmeMarkdown = readmeField.trim()
  else if (isFile(readmeField))
    readmeMarkdown = (await readmeField.text()).trim()

  const updates: Record<string, unknown> = {}

  if (name)
    updates.name = name
  if (summary)
    updates.summary = summary
  if (category)
    updates.category = category
  if (homepage !== undefined)
    updates.homepage = homepage.length ? homepage : null
  if (readmeMarkdown !== undefined)
    updates.readmeMarkdown = readmeMarkdown

  if (badgesInput !== undefined) {
    const parsed = badgesInput
      .split(',')
      .map(badge => badge.trim())
      .filter(Boolean)
    updates.badges = parsed
  }

  const iconFile = formData.get('icon')
  if (isFile(iconFile) && iconFile.size > 0) {
    const iconResult = await uploadImage(event, iconFile)
    updates.iconKey = iconResult.key
    updates.iconUrl = iconResult.url
  }
  else if (removeIcon) {
    updates.iconKey = null
    updates.iconUrl = null
  }

  if (isAdmin) {
    if (isOfficialField !== undefined)
      updates.isOfficial = isOfficialField === 'true' || isOfficialField === '1'

    if (statusField && (ALLOWED_STATUSES as readonly string[]).includes(statusField))
      updates.status = statusField
  }

  const plugin = await updatePlugin(event, id, updates)

  return {
    plugin,
  }
})
