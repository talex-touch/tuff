import { requireAdmin } from '../../../utils/auth'
import { listBlockedIps } from '../../../utils/ipSecurityStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const limit = query.limit ? Number(query.limit) : undefined

  const items = await listBlockedIps(event, { limit })

  return { items }
})

