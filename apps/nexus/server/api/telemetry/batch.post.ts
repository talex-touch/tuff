import { guardTelemetryIp } from '../../utils/ipSecurityStore'
import { recordTelemetryEvent } from '../../utils/telemetryStore'
import { resolveTelemetryUserId } from '../../utils/telemetryIdentity'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body || !Array.isArray(body.events)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body - events array required' })
  }

  const events = body.events as Array<{
    eventType: 'search' | 'visit' | 'error' | 'feature_use' | 'performance'
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
  }>

  // Limit batch size to prevent abuse
  const maxBatchSize = 100
  const eventsToProcess = events.slice(0, maxBatchSize)

  await guardTelemetryIp(event, { weight: eventsToProcess.length, action: 'telemetry.batch' })

  // Resolved once for the request, not per event: the credentials belong to the connection,
  // so a batch cannot attribute different events to different people. A body userId is
  // ignored here for the same reason as in record.post.ts — this route is unauthenticated,
  // and at up to 100 events per request it was the cheaper way to fabricate history (#901).
  const resolvedUserId = await resolveTelemetryUserId(event)

  // Process all events (fire and forget for performance)
  const promises = eventsToProcess.map(async (e) => {
    if (!e.eventType || !['search', 'visit', 'error', 'feature_use', 'performance'].includes(e.eventType)) {
      return // Skip invalid events
    }

    try {
      await recordTelemetryEvent(event, {
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
      })
    }
    catch {
      // Silently ignore individual event errors
    }
  })

  await Promise.all(promises)

  return {
    success: true,
    processed: eventsToProcess.length,
    dropped: Math.max(0, events.length - maxBatchSize),
  }
})
