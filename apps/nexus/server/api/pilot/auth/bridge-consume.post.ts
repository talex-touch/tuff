import { useRuntimeConfig } from '#imports'
import { createError, getHeader, readBody } from 'h3'
import { consumePilotBridgeTicket, getUserById } from '../../../utils/authStore'

interface BridgeConsumeBody {
  ticketId?: string
}

function resolveBridgeSecret(): string {
  const runtimeConfig = useRuntimeConfig()
  const secret = String(runtimeConfig.pilot?.bridgeSecret || '').trim()
  return secret
}

export default defineEventHandler(async (event) => {
  const configuredSecret = resolveBridgeSecret()
  if (!configuredSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Pilot bridge is not configured.',
    })
  }

  const providedSecret = String(getHeader(event, 'x-pilot-bridge-secret') || '').trim()
  if (!providedSecret || providedSecret !== configuredSecret) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized.',
    })
  }

  const body = await readBody<BridgeConsumeBody>(event)
  const ticketId = String(body?.ticketId || '').trim()
  if (!ticketId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ticketId is required.',
    })
  }

  const ticket = await consumePilotBridgeTicket(event, ticketId)
  if (!ticket) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired ticket.',
    })
  }

  const user = await getUserById(event, ticket.userId)
  if (!user || user.status !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
  }

  return {
    ticketId: ticket.ticketId,
    userId: user.id,
    expiresAt: ticket.expiresAt,
    consumedAt: ticket.consumedAt,
  }
})
