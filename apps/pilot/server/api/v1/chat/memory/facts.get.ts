import { requirePilotAuth } from '../../../../utils/auth'
import { listPilotMemoryFactsByUser } from '../../../../utils/pilot-memory-facts'
import { quotaOk } from '../../../../utils/quota-api'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function normalizeLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT
  }
  return Math.max(1, Math.min(Math.floor(parsed), MAX_LIMIT))
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const query = getQuery(event)
  const limit = normalizeLimit(query.limit)
  const items = await listPilotMemoryFactsByUser(event, auth.userId, {
    limit,
  })

  return quotaOk({
    items,
    limit,
  })
})
