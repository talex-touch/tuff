import { listTelemetryMessages } from '../../utils/messageStore'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const status = query.status as string | undefined
  const source = query.source as string | undefined
  const severity = query.severity as string | undefined
  const since = query.since ? Number(query.since) : undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  const messages = await listTelemetryMessages(event, {
    status,
    source,
    severity,
    since,
    limit,
  })

  return { messages }
})
