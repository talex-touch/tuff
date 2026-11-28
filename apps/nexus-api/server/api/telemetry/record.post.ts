import { defineEventHandler, readBody } from 'h3'
import { ingestTelemetryEvents } from '../../utils/telemetryStore'

/**
 * Compatibility alias for legacy core-app clients calling `POST /api/telemetry/record`.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await ingestTelemetryEvents(event, body, { scope: 'record' })
})
