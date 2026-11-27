import type { TelemetryMessageInput } from '../../utils/messageStore'
import { createError, getHeader, readBody } from 'h3'
import { DEFAULT_USER_PRIVACY_SETTINGS, getUserById, type UserPrivacySettings } from '../../utils/authStore'
import { guardTelemetryIp } from '../../utils/ipSecurityStore'
import { recordTelemetryMessagesAtomic } from '../../utils/messageStore'
import { resolveTelemetryUserId } from '../../utils/telemetryIdentity'
import { normalizeTelemetryIdempotencyKey } from '../../utils/telemetryStore'

const MAX_MESSAGE_BATCH_SIZE = 100

async function resolvePrivacySettings(
  event: Parameters<typeof getUserById>[0],
  userId: string | null,
): Promise<UserPrivacySettings | null> {
  if (!userId) return null
  const user = await getUserById(event, userId)
  return user?.privacySettings ?? DEFAULT_USER_PRIVACY_SETTINGS
}

function isMessageAllowedByPrivacy(
  message: TelemetryMessageInput,
  settings: UserPrivacySettings | null,
): boolean {
  if (!settings) return true
  if (!settings.analytics) return false
  if (message.severity === 'error') return settings.crashReports
  return settings.usageData
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const allMessages = normalizeMessages(body)
  if (!allMessages.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const rawIdempotencyHeader = getHeader(event, 'x-idempotency-key')
  const idempotencyKey = rawIdempotencyHeader !== undefined && String(rawIdempotencyHeader).trim() !== ''
    ? normalizeTelemetryIdempotencyKey(rawIdempotencyHeader)
    : null
  if (rawIdempotencyHeader !== undefined && String(rawIdempotencyHeader).trim() !== '' && !idempotencyKey) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid X-Idempotency-Key header' })
  }

  const messages = allMessages.slice(0, MAX_MESSAGE_BATCH_SIZE)
  const dropped = Math.max(0, allMessages.length - MAX_MESSAGE_BATCH_SIZE)

  await guardTelemetryIp(event, { weight: messages.length, action: 'telemetry.messages' })

  const resolvedUserId = await resolveTelemetryUserId(event)
  const privacySettings = await resolvePrivacySettings(event, resolvedUserId)

  const allowedMessages: TelemetryMessageInput[] = []
  let privacyRejected = 0
  for (const message of messages) {
    if (!isMessageAllowedByPrivacy(message, privacySettings)) {
      privacyRejected += 1
      continue
    }
    allowedMessages.push(message)
  }

  return await recordTelemetryMessagesAtomic(event, allowedMessages, {
    idempotencyKey,
    callerUserId: resolvedUserId,
    dropped,
    preRejected: privacyRejected,
  })
})

function normalizeMessages(body: any): TelemetryMessageInput[] {
  if (!body)
    return []

  if (Array.isArray(body.messages)) {
    return body.messages.filter(Boolean)
  }

  if (Array.isArray(body)) {
    return body.filter(Boolean)
  }

  if (typeof body === 'object') {
    return [body as TelemetryMessageInput]
  }

  return []
}
