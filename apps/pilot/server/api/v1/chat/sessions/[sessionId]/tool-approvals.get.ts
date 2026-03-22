import { getQuery } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import { requireSessionId } from '../../../../../utils/pilot-http'
import {
  listPilotToolApprovals,
} from '../../../../../utils/pilot-tool-approvals'

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const query = getQuery(event)
  const statusRaw = String(query.status || '').trim().toLowerCase()
  const status = statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected'
    ? statusRaw
    : undefined

  const approvals = await listPilotToolApprovals(event, {
    sessionId,
    userId,
    status,
    limit: 200,
  })

  return {
    session_id: sessionId,
    approvals,
  }
})
