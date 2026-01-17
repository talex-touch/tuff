import { guardTelemetryIp } from '../../utils/ipSecurityStore'
import { recordTelemetryEvent } from '../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body || !Array.isArray(body.events)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body - events array required' })
  }

  const events = body.events as Array<{
    eventType: 'search' | 'visit' | 'error' | 'feature_use' | 'performance'
    userId?: string
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

  // Process all events (fire and forget for performance)
  const promises = eventsToProcess.map(async (e) => {
    if (!e.eventType || !['search', 'visit', 'error', 'feature_use', 'performance'].includes(e.eventType)) {
      return // Skip invalid events
    }

    try {
      await recordTelemetryEvent(event, {
        eventType: e.eventType,
        userId: e.userId || undefined,
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
        isAnonymous: e.isAnonymous !== false,
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
