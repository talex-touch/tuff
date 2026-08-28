import { createError, getHeader, readBody } from 'h3'
import { guardTelemetryIp } from '../../utils/ipSecurityStore'
import {
  digestTelemetryBatchPayload,
  getTelemetryBatchReceipt,
  recordTelemetryEvent,
  storeTelemetryBatchReceipt,
} from '../../utils/telemetryStore'
import { DEFAULT_USER_PRIVACY_SETTINGS, getUserById, type UserPrivacySettings } from '../../utils/authStore'
import { resolveTelemetryUserId } from '../../utils/telemetryIdentity'

type TelemetryEventType = 'search' | 'visit' | 'error' | 'feature_use' | 'performance'

interface RawTelemetryEvent {
  eventType?: TelemetryEventType
  clientId?: string
  deviceFingerprint?: string
  platform?: string
  version?: string
  region?: string
  searchQuery?: string
  searchDurationMs?: number
  searchResultCount?: number
  providerTimings?: Record<string, number>
  inputTypes?: string[]
  metadata?: Record<string, unknown>
  isAnonymous?: boolean
}

interface TelemetryBatchAck extends Record<string, unknown> {
  success: true
  accepted: number
  rejected: number
  duplicate: boolean
  dropped: number
  processed: number
}

const TELEMETRY_BATCH_SCOPE = 'telemetry.batch'
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return IDEMPOTENCY_KEY_PATTERN.test(trimmed) ? trimmed : null
}

async function resolveTelemetryPrivacySettings(event: Parameters<typeof getUserById>[0], userId: string | null): Promise<UserPrivacySettings | null> {
  if (!userId) return null
  const user = await getUserById(event, userId)
  return user?.privacySettings ?? DEFAULT_USER_PRIVACY_SETTINGS
}

function isTelemetryAllowedByPrivacy(eventType: TelemetryEventType, settings: UserPrivacySettings | null): boolean {
  if (!settings) return true
  if (!settings.analytics) return false
  if (eventType === 'error') return settings.crashReports
  return settings.usageData
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body || !Array.isArray(body.events)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body - events array required' })
  }

  const events = body.events as RawTelemetryEvent[]

  // Limit batch size to prevent abuse
  const maxBatchSize = 100
  const eventsToProcess = events.slice(0, maxBatchSize)
  const dropped = Math.max(0, events.length - maxBatchSize)
  const idempotencyKey = normalizeIdempotencyKey(getHeader(event, 'x-idempotency-key'))

  if (!idempotencyKey) {
    throw createError({ statusCode: 400, statusMessage: 'X-Idempotency-Key header required' })
  }

  await guardTelemetryIp(event, { weight: eventsToProcess.length, action: 'telemetry.batch' })

  // Resolved once for the request, not per event: the credentials belong to the connection,
  // so a batch cannot attribute different events to different people. A body userId is
  // ignored here for the same reason as in record.post.ts — this route is unauthenticated,
  // and at up to 100 events per request it was the cheaper way to fabricate history (#901).
  const resolvedUserId = await resolveTelemetryUserId(event)
  const privacySettings = await resolveTelemetryPrivacySettings(event, resolvedUserId)
  const payloadHash = digestTelemetryBatchPayload({ dropped, events: eventsToProcess })
  const receipt = await getTelemetryBatchReceipt<TelemetryBatchAck>(
    event,
    TELEMETRY_BATCH_SCOPE,
    idempotencyKey,
  )
  if (receipt) {
    if (receipt.payloadHash !== payloadHash) {
      throw createError({ statusCode: 409, statusMessage: 'Idempotency key reused with different telemetry payload' })
    }

    return {
      ...receipt.response,
      duplicate: true,
    }
  }

  let accepted = 0
  let rejected = 0

  const payloads = eventsToProcess.map((e) => {
    if (!e.eventType || !['search', 'visit', 'error', 'feature_use', 'performance'].includes(e.eventType)) {
      rejected += 1
      return null
    }

    if (!isTelemetryAllowedByPrivacy(e.eventType, privacySettings)) {
      rejected += 1
      return null
    }

    return {
      eventType: e.eventType,
      userId: resolvedUserId || undefined,
      clientId: e.clientId || undefined,
      deviceFingerprint: e.deviceFingerprint || undefined,
      platform: e.platform || undefined,
      version: e.version || undefined,
      region: e.region || undefined,
      searchQuery: e.searchQuery || undefined,
      searchDurationMs: typeof e.searchDurationMs === 'number' ? e.searchDurationMs : undefined,
      searchResultCount: typeof e.searchResultCount === 'number' ? e.searchResultCount : undefined,
      providerTimings: e.providerTimings || undefined,
      inputTypes: Array.isArray(e.inputTypes) ? e.inputTypes : undefined,
      metadata: e.metadata || undefined,
      isAnonymous: resolvedUserId ? e.isAnonymous !== false : true,
    }
  })

  for (const payload of payloads) {
    if (!payload)
      continue
    const result = await recordTelemetryEvent(event, payload)
    if (result.status === 'accepted') {
      accepted += 1
    }
    else if (result.status === 'quarantined') {
      rejected += 1
    }
    else {
      throw createError({ statusCode: 503, statusMessage: 'Telemetry database not available' })
    }
  }

  const response: TelemetryBatchAck = {
    success: true,
    accepted,
    rejected,
    duplicate: false,
    dropped,
    processed: accepted,
  }
  await storeTelemetryBatchReceipt(event, {
    scope: TELEMETRY_BATCH_SCOPE,
    idempotencyKey,
    payloadHash,
    response,
  })

  return response
})
