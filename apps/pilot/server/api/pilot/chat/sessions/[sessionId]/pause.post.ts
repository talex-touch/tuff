import type { SessionRecord } from '@talex-touch/tuff-intelligence'
import { requirePilotAuth } from '../../../../../utils/auth'
import { requireSessionId } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../../utils/pilot-store'

const ALLOWED_REASONS: Array<SessionRecord['pauseReason']> = [
  'client_disconnect',
  'heartbeat_timeout',
  'manual_pause',
  'system_preempted',
]

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<{ reason?: string }>(event)

  const reason = ALLOWED_REASONS.includes(body?.reason as SessionRecord['pauseReason'])
    ? (body?.reason as SessionRecord['pauseReason'])
    : 'manual_pause'

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  await store.runtime.pauseSession(sessionId, reason)

  return {
    ok: true,
    sessionId,
    reason,
  }
})
