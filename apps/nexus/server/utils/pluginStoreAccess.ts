import type { PluginReleaseAudience } from './pluginReleaseEligibility'
import type { H3Event } from 'h3'
import { createError, getQuery } from 'h3'
import { requireAdminOrApiKey } from './auth'

export async function resolvePluginStoreAudience(event: H3Event): Promise<PluginReleaseAudience> {
  const rawChannel = getQuery(event).channel
  const channel = (Array.isArray(rawChannel) ? rawChannel[0] : rawChannel)
    ?.toString()
    .trim()
    .toUpperCase()

  if (!channel || channel === 'RELEASE')
    return 'public'

  if (channel !== 'BETA')
    throw createError({ statusCode: 400, statusMessage: 'Unsupported plugin Store channel.' })

  await requireAdminOrApiKey(event, ['plugin:moderate'])
  return 'beta'
}
