import { clerkClient } from '@clerk/nuxt/server'
import { readFormData } from 'h3'
import { requireAuth } from '../../utils/auth'
import { createPlugin } from '../../utils/pluginsStore'
import { uploadImage } from '../../utils/imageStorage'

const ALLOWED_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const
const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const formData = await readFormData(event)

  const client = clerkClient(event)
  const user = await client.users.getUser(userId)
  const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
  const ownerOrgId = orgMemberships.data?.[0]?.organization.id ?? null

  const isAdmin = user.publicMetadata?.role === 'admin'

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
  let iconKey: string | null = null
  let iconUrl: string | null = null

  if (isFile(iconFile) && iconFile.size > 0) {
    const iconResult = await uploadImage(event, iconFile)
    iconKey = iconResult.key
    iconUrl = iconResult.url
  }

  const deriveAuthorName = () => {
    const fullName = user.fullName?.trim()
    if (fullName)
      return fullName

    const composed = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    if (composed)
      return composed

    const username = user.username?.trim()
    if (username)
      return username

    const primaryEmail = user.primaryEmailAddressId
      ? user.emailAddresses?.find(address => address.id === user.primaryEmailAddressId)?.emailAddress
      : undefined

    if (primaryEmail)
      return primaryEmail

    return user.emailAddresses?.[0]?.emailAddress ?? userId
  }

  const status = isAdmin && statusField && (ALLOWED_STATUSES as readonly string[]).includes(statusField)
    ? (statusField as (typeof ALLOWED_STATUSES)[number])
    : 'draft'

  const plugin = await createPlugin(event, {
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

  return {
    plugin,
  }
})
