import { createError, getQuery, getRequestURL, sendRedirect } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { createPilotBridgeTicket, getUserById } from '../../../utils/authStore'

const DEFAULT_BRIDGE_TTL_MS = 60_000

function sanitizeReturnTo(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/')) {
    return '/'
  }
  if (raw.startsWith('//')) {
    return '/'
  }
  return raw
}

function parseCallbackUrl(value: unknown): URL {
  const raw = String(value || '').trim()
  if (!raw) {
    throw createError({
      statusCode: 400,
      statusMessage: 'callback is required.',
    })
  }

  let callbackUrl: URL
  try {
    callbackUrl = new URL(raw)
  }
  catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'callback must be an absolute URL.',
    })
  }

  if (callbackUrl.protocol !== 'http:' && callbackUrl.protocol !== 'https:') {
    throw createError({
      statusCode: 400,
      statusMessage: 'callback protocol is invalid.',
    })
  }

  return callbackUrl
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const callbackUrl = parseCallbackUrl(query.callback)
  const returnTo = sanitizeReturnTo(query.returnTo)

  let userId = ''
  try {
    const auth = await requireSessionAuth(event)
    userId = auth.userId
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode
    if (statusCode === 401) {
      const requestUrl = getRequestURL(event)
      const signinUrl = new URL('/api/auth/signin', requestUrl.origin)
      signinUrl.searchParams.set('callbackUrl', requestUrl.toString())
      return sendRedirect(event, signinUrl.toString(), 302)
    }
    throw error
  }

  const user = await getUserById(event, userId)
  if (!user || user.status !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Account disabled.',
    })
  }

  const ticket = await createPilotBridgeTicket(event, user.id, DEFAULT_BRIDGE_TTL_MS)
  callbackUrl.searchParams.set('ticket', ticket.ticketId)
  callbackUrl.searchParams.set('returnTo', returnTo)

  return sendRedirect(event, callbackUrl.toString(), 302)
})
