import { recordTelemetryMessages, type TelemetryMessageInput } from '../../utils/messageStore'
import { guardTelemetryIp } from '../../utils/ipSecurityStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const messages = normalizeMessages(body).slice(0, 100)
  if (!messages.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  await guardTelemetryIp(event, { weight: messages.length, action: 'telemetry.messages' })

  const processed = await recordTelemetryMessages(event, messages)

  return {
    success: true,
    processed,
    dropped: Math.max(0, messages.length - processed),
  }
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
