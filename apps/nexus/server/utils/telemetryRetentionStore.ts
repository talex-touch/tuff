import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  runTelemetryRetentionForDatabase,
  type TelemetryRetentionInput,
  type TelemetryRetentionResult,
} from './telemetryRetentionCore'

export type { RetentionTableResult, TelemetryRetentionInput, TelemetryRetentionResult } from './telemetryRetentionCore'

export async function runTelemetryRetention(
  event: H3Event,
  input: TelemetryRetentionInput = {},
): Promise<TelemetryRetentionResult> {
  const db = readCloudflareBindings(event)?.DB
  if (!db)
    throw createError({ statusCode: 503, statusMessage: 'D1 database is not available.' })

  return runTelemetryRetentionForDatabase(db, input)
}
