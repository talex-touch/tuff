import type { PluginReleaseAudience } from './pluginReleaseEligibility'
import type { H3Event } from 'h3'
import { createError, getQuery } from 'h3'
import { requireAuthOrApiKey } from './auth'
import { getUserById } from './authStore'

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

  const auth = await requireAuthOrApiKey(event, ['plugin:moderate'])
  if (auth.authType !== 'apiKey') {
    const user = await getUserById(event, auth.userId)
    if (user?.role !== 'admin') {
      throw createError({ statusCode: 403, statusMessage: 'Admin permission required.' })
    }
  }

  return 'beta'
}
