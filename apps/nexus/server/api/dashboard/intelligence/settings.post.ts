import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { updateSettings } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  const { defaultStrategy, enableAudit, enableCache, cacheExpiration } = body || {}

  if (defaultStrategy !== undefined && (typeof defaultStrategy !== 'string' || defaultStrategy.length < 1)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid default strategy.' })
  }

  if (cacheExpiration !== undefined && (typeof cacheExpiration !== 'number' || cacheExpiration < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Cache expiration must be a non-negative number.' })
  }

  const settings = await updateSettings(event, userId, {
    defaultStrategy: typeof defaultStrategy === 'string' ? defaultStrategy : undefined,
    enableAudit: typeof enableAudit === 'boolean' ? enableAudit : undefined,
    enableCache: typeof enableCache === 'boolean' ? enableCache : undefined,
    cacheExpiration: typeof cacheExpiration === 'number' ? cacheExpiration : undefined,
  })

  return { settings }
})
