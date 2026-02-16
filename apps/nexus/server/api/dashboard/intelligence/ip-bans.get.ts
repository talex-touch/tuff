import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listIpBans } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const limitRaw = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 10), 200) : 50

  const bans = await listIpBans(event, { limit })

  return { bans }
})
