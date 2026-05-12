import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { migrateLegacyIntelligenceProvidersToRegistry } from '../../../../utils/intelligenceProviderRegistryBridge'

function normalizeProviderIds(value: unknown): string[] | undefined {
  if (value == null)
    return undefined
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'providerIds must be an array.' })
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)
  const migration = await migrateLegacyIntelligenceProvidersToRegistry(event, userId, userId, {
    dryRun: body?.dryRun !== false,
    providerIds: normalizeProviderIds(body?.providerIds),
  })

  return { migration }
})
