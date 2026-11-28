import { defineEventHandler, readBody } from 'h3'
import { ingestTelemetryEvents } from '../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await ingestTelemetryEvents(event, body, { scope: 'ingest' })
})
