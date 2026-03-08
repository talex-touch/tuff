import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { createPilotBridgeTicket, getUserById } from '../../../utils/authStore'

const DEFAULT_BRIDGE_TTL_MS = 60_000

interface BridgeTicketBody {
  ttlSeconds?: number
}

function resolveTtlMs(ttlSeconds: unknown): number {
  const parsed = Number(ttlSeconds)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BRIDGE_TTL_MS
  }
  return Math.min(Math.max(Math.floor(parsed), 10), 300) * 1000
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const user = await getUserById(event, userId)
  if (!user || user.status !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
  }

  let body: BridgeTicketBody = {}
  try {
    body = await readBody<BridgeTicketBody>(event)
  }
  catch {
    body = {}
  }
  const ttlMs = resolveTtlMs(body?.ttlSeconds)
  const ticket = await createPilotBridgeTicket(event, user.id, ttlMs)

  return {
    ticketId: ticket.ticketId,
    userId: ticket.userId,
    expiresAt: ticket.expiresAt,
  }
})
