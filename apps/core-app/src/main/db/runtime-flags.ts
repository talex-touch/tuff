import { getBooleanEnv } from '@talex-touch/utils/env'

const processStartAt = Date.now()

export const DB_AUX_ENABLED = getBooleanEnv('TUFF_DB_AUX_ENABLED', true)
// When enabled, the search-index worker gets its OWN sqlite file
// (`search-index.db`) instead of sharing `database.db` with the main process,
// so each file has a single writer connection and the two never contend for the
// WAL writer lock (issue #295). Default ON since 2026-08-05, validated by app
// runs (schema parity fixups, bootstrap reindex, 2d.3 write-path migration all
// landed; V2 run showed zero BUSY/FK). First launch with an empty search file
// triggers a one-time full reindex (search data is rebuildable).
// TUFF_DB_SEARCH_SPLIT_ENABLED=0 is the emergency kill switch back to the
// shared-file topology.
export const DB_SEARCH_SPLIT_ENABLED = getBooleanEnv('TUFF_DB_SEARCH_SPLIT_ENABLED', true)
export const DB_QOS_ENABLED = getBooleanEnv('TUFF_DB_QOS_ENABLED', true)
export const STARTUP_DEGRADE_ENABLED = getBooleanEnv('TUFF_STARTUP_DEGRADE_ENABLED', true)
export const STARTUP_DEGRADE_WINDOW_MS = 120_000

export function getProcessUptimeMs(): number {
  return Math.max(0, Date.now() - processStartAt)
}

export function isInStartupDegradeWindow(windowMs = STARTUP_DEGRADE_WINDOW_MS): boolean {
  if (!STARTUP_DEGRADE_ENABLED) return false
  return getProcessUptimeMs() < Math.max(0, windowMs)
}

/**
 * Milliseconds left in the startup degrade window (0 once the window has
 * passed or when `TUFF_STARTUP_DEGRADE_ENABLED=0`). Boot-time maintenance
 * writers use this to defer their first write past the startup write storm
 * (R4) instead of hand-rolling the same window arithmetic.
 */
export function getStartupDegradeWindowRemainingMs(windowMs = STARTUP_DEGRADE_WINDOW_MS): number {
  if (!STARTUP_DEGRADE_ENABLED) return 0
  return Math.max(0, Math.max(0, windowMs) - getProcessUptimeMs())
}
