import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import { getSentryService } from '../modules/sentry'

export type LegacyAliasTelemetryFamily = 'terminal' | 'sync' | 'auth' | 'core-box'
export type LegacyAliasTelemetryDirection =
  | 'renderer-to-main'
  | 'main-to-renderer'
  | 'main-to-plugin'

export interface LegacyAliasTelemetryRecord {
  family: LegacyAliasTelemetryFamily
  legacyEvent: string
  canonicalEvent: string
  direction: LegacyAliasTelemetryDirection
  timestamp: number
  sourceModule: string
}

export type LegacyAliasTelemetryReporter = (record: LegacyAliasTelemetryRecord) => void

type EventLike = Pick<TuffEvent<unknown, unknown>, 'toEventName'> | string

export interface LegacyAliasTelemetryOptions {
  family: LegacyAliasTelemetryFamily
  legacyEvent: EventLike
  canonicalEvent: EventLike
  direction: LegacyAliasTelemetryDirection
  sourceModule: string
  reporter?: LegacyAliasTelemetryReporter
}

function toEventName(event: EventLike): string {
  return typeof event === 'string' ? event : event.toEventName()
}

function defaultReporter(record: LegacyAliasTelemetryRecord): void {
  getSentryService().queueNexusTelemetry({
    eventType: 'feature_use',
    metadata: {
      action: 'legacy_alias_hit',
      family: record.family,
      legacyEvent: record.legacyEvent,
      canonicalEvent: record.canonicalEvent,
      direction: record.direction,
      sourceModule: record.sourceModule,
      timestamp: record.timestamp
    }
  })
}

export function recordLegacyAliasHit(
  options: LegacyAliasTelemetryOptions
): LegacyAliasTelemetryRecord {
  const record: LegacyAliasTelemetryRecord = {
    family: options.family,
    legacyEvent: toEventName(options.legacyEvent),
    canonicalEvent: toEventName(options.canonicalEvent),
    direction: options.direction,
    timestamp: Date.now(),
    sourceModule: options.sourceModule
  }

  try {
    ;(options.reporter ?? defaultReporter)(record)
  } catch {
    // Best-effort telemetry must never affect retained alias behavior.
  }

  return record
}

export function withLegacyAliasTelemetry<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
  options: LegacyAliasTelemetryOptions
): (...args: TArgs) => TResult {
  return (...args: TArgs) => {
    recordLegacyAliasHit(options)
    return handler(...args)
  }
}
