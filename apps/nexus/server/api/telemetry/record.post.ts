import { createError, getHeader, readBody } from 'h3'
import { guardTelemetryIp } from '../../utils/ipSecurityStore'
import {
  buildTelemetryBatchReceiptStatement,
  commitTelemetryWrite,
  digestTelemetryBatchPayload,
  getTelemetryBatchReceipt,
  normalizeTelemetryIdempotencyKey,
  prepareTelemetryWrite,
  type TelemetryEventInput,
} from '../../utils/telemetryStore'
import { resolveTelemetryUserId } from '../../utils/telemetryIdentity'

interface TelemetryRecordAck extends Record<string, unknown> {
  success: true
  accepted: number
  rejected: number
  duplicate: boolean
}

const TELEMETRY_RECORD_SCOPE = 'telemetry.record'

/**
 * The key comes from the header; the startup report's `metadata.idempotencyKey` is honoured too,
 * because clients already in the field put it there and nothing read it, which is how one
 * startup report retried 32 times got counted as up to 32 visits.
 */
function resolveRecordIdempotencyKey(headerValue: unknown, metadata: unknown): string | null {
  const fromHeader = normalizeTelemetryIdempotencyKey(headerValue)
  if (fromHeader) return fromHeader
  const fromMetadata = metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>).idempotencyKey
    : undefined
  return normalizeTelemetryIdempotencyKey(fromMetadata)
}

export default defineEventHandler(async (event) => {
  await guardTelemetryIp(event, { weight: 1, action: 'telemetry.record' })

  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const {
    eventType,
    clientId,
    deviceFingerprint,
    platform,
    version,
    region,
    searchQuery,
    searchDurationMs,
    searchResultCount,
    providerTimings,
    inputTypes,
    metadata,
    isAnonymous = true,
  } = body

  if (!eventType || !['search', 'visit', 'error', 'feature_use', 'performance'].includes(eventType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid event type' })
  }

  // Deliberately not read from the body: this route is unauthenticated, so a body userId is a
  // claim anyone can make about anyone (#901). Null here means the event is anonymous.
  const resolvedUserId = await resolveTelemetryUserId(event)
  // An event with no proven owner is anonymous whatever the body claims, and an explicit
  // `isAnonymous: true` from a signed-in client is respected (anonymous mode).
  const anonymous = !resolvedUserId || isAnonymous !== false

  const payload: TelemetryEventInput = {
    eventType,
    userId: anonymous ? undefined : resolvedUserId || undefined,
    clientId: clientId || undefined,
    deviceFingerprint: deviceFingerprint || undefined,
    platform: platform || undefined,
    version: version || undefined,
    region: region || undefined,
    searchQuery: searchQuery || undefined,
    searchDurationMs: typeof searchDurationMs === 'number' ? searchDurationMs : undefined,
    searchResultCount: typeof searchResultCount === 'number' ? searchResultCount : undefined,
    providerTimings: providerTimings || undefined,
    inputTypes: Array.isArray(inputTypes) ? inputTypes : undefined,
    metadata: metadata || undefined,
    isAnonymous: anonymous,
  }

  const idempotencyKey = resolveRecordIdempotencyKey(getHeader(event, 'x-idempotency-key'), metadata)
  const payloadHash = idempotencyKey ? digestTelemetryBatchPayload(payload) : null
  if (idempotencyKey && payloadHash) {
    const receipt = await getTelemetryBatchReceipt<TelemetryRecordAck>(event, TELEMETRY_RECORD_SCOPE, idempotencyKey)
    if (receipt) {
      if (receipt.payloadHash !== payloadHash) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key reused with different telemetry payload' })
      }
      return { ...receipt.response, duplicate: true }
    }
  }

  const prepared = await prepareTelemetryWrite(event, [payload])
  const result = prepared.results[0]
  if (!prepared.db || !prepared.batch || !result || result.status === 'dropped') {
    // Previously this answered `success: true` with nothing stored, which the client took as
    // delivered and removed from its outbox.
    throw createError({ statusCode: 503, statusMessage: 'Telemetry database not available' })
  }

  const response: TelemetryRecordAck = {
    success: true,
    accepted: result.status === 'accepted' ? 1 : 0,
    rejected: result.status === 'accepted' ? 0 : 1,
    duplicate: false,
  }

  await commitTelemetryWrite(event, { db: prepared.db, batch: prepared.batch }, {
    extraStatements: idempotencyKey && payloadHash
      ? [buildTelemetryBatchReceiptStatement(prepared.db, {
          scope: TELEMETRY_RECORD_SCOPE,
          idempotencyKey,
          payloadHash,
          response,
        })]
      : [],
  })

  return response
})
