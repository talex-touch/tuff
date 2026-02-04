import { Buffer } from 'node:buffer'
import { createError, readFormData } from 'h3'
import { requireAuth } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'
import { uploadImage, uploadImageFromBuffer } from '../../utils/imageStorage'
import { createPlugin } from '../../utils/pluginsStore'
import { extractTpexMetadata } from '../../utils/tpex'

const ALLOWED_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const
const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const formData = await readFormData(event)

  const user = await getUserById(event, userId)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  const ownerOrgId: string | null = null
  const isAdmin = user.role === 'admin'

  const getString = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value.trim() : undefined
  }

  const slug = getString('slug') ?? ''
  const name = getString('name') ?? ''
  const summary = getString('summary') ?? ''
  const category = getString('category') ?? ''
  const homepage = getString('homepage')
  const badgesInput = getString('badges')
  const readmeField = formData.get('readme')
  const statusField = getString('status')
  const isOfficialField = getString('isOfficial')

  let readmeMarkdown = ''
  if (typeof readmeField === 'string')
    readmeMarkdown = readmeField
  else if (isFile(readmeField))
    readmeMarkdown = await readmeField.text()

  readmeMarkdown = readmeMarkdown.trim()

  const badges = badgesInput
    ? badgesInput.split(',').map(badge => badge.trim()).filter(Boolean)
    : []

  const iconFile = formData.get('icon')
  const packageFile = formData.get('package')
  let iconKey: string | null = null
  let iconUrl: string | null = null

  // Priority 1: User-uploaded icon file
  if (isFile(iconFile) && iconFile.size > 0) {
    try {
      const iconResult = await uploadImage(event, iconFile)
      iconKey = iconResult.key
      iconUrl = iconResult.url
    }
    catch (err) {
      console.error('[plugins.post] Failed to upload icon:', err)
      throw createError({ statusCode: 500, statusMessage: 'Failed to upload plugin icon.' })
    }
  }

  // Priority 2: Extract icon from package file if no icon was uploaded
  if (!iconKey && isFile(packageFile) && packageFile.size > 0) {
    try {
      const buffer = Buffer.from(await packageFile.arrayBuffer())
      const metadata = await extractTpexMetadata(buffer)

      if (metadata.iconBuffer && metadata.iconFileName && metadata.iconMimeType) {
        const iconResult = await uploadImageFromBuffer(
          event,
          metadata.iconBuffer,
          metadata.iconFileName,
          metadata.iconMimeType,
        )
        iconKey = iconResult.key
        iconUrl = iconResult.url
        console.log('[plugins.post] Extracted and uploaded icon from package:', metadata.iconFileName)
      }
    }
    catch (err) {
      console.error('[plugins.post] Failed to extract icon from package:', err)
      // Don't throw - icon extraction from package is a fallback
    }
  }

  // Icon is required
  if (!iconKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Plugin icon is required. Please upload an icon or ensure your package contains an icon file (icon.svg, icon.png, etc.).',
    })
  }

  const deriveAuthorName = () => {
    if (user.name)
      return user.name
    if (user.email)
      return user.email
    return userId
  }

  const status = isAdmin && statusField && (ALLOWED_STATUSES as readonly string[]).includes(statusField)
    ? (statusField as (typeof ALLOWED_STATUSES)[number])
    : 'draft'

  let plugin
  try {
    plugin = await createPlugin(event, {
      userId,
      ownerOrgId,
      slug,
      name,
      summary,
      category,
      homepage,
      isOfficial: isAdmin ? isOfficialField === 'true' || isOfficialField === '1' : false,
      badges,
      author: { name: deriveAuthorName() },
      readmeMarkdown,
      iconKey,
      iconUrl,
      status,
    })
  }
  catch (err: unknown) {
    // Re-throw H3 errors (validation errors from createPlugin)
    if (err && typeof err === 'object' && 'statusCode' in err)
      throw err

    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : undefined
    console.error('[plugins.post] Failed to create plugin:', {
      error: errorMessage,
      stack: errorStack,
      slug,
      userId,
    })
    throw createError({ statusCode: 500, statusMessage: `Failed to create plugin: ${errorMessage}` })
  }

  return {
    plugin,
  }
})
