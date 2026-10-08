import { StorageList } from '@talex-touch/utils'
import { getMainConfig } from '../storage'

/**
 * The user's telemetry consent, as stored in `sentry-config.json`.
 *
 * One switch gates every upload to Nexus: the Sentry/Nexus event outbox, the startup report and
 * the diagnostic message report. The latter two used to read only their own env flags, so turning
 * telemetry off in Settings left them uploading (2026-10-08 telemetry audit). Everything that
 * writes an upload queue must read this instead.
 */
export interface TelemetryConsent {
  /** Upload enabled. Missing config means the documented default: on. */
  enabled: boolean
  /** Do not associate the signed-in account with uploads. Only meaningful while signed in. */
  anonymous: boolean
}

export function resolveTelemetryConsent(raw: unknown): TelemetryConsent {
  const config = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
    anonymous: config.anonymous === true
  }
}

/** Reads the stored consent; a storage failure keeps the documented default rather than throwing. */
export function readTelemetryConsent(): TelemetryConsent {
  try {
    return resolveTelemetryConsent(getMainConfig(StorageList.SENTRY_CONFIG))
  } catch {
    return resolveTelemetryConsent(undefined)
  }
}
