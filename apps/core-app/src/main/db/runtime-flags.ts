const processStartAt = Date.now()

function parseEnvBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]
  if (typeof raw !== 'string') return defaultValue
  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return defaultValue
}

export const DB_AUX_ENABLED = parseEnvBoolean('TUFF_DB_AUX_ENABLED', true)
export const DB_QOS_ENABLED = parseEnvBoolean('TUFF_DB_QOS_ENABLED', true)
export const STARTUP_DEGRADE_ENABLED = parseEnvBoolean('TUFF_STARTUP_DEGRADE_ENABLED', true)
export const STARTUP_DEGRADE_WINDOW_MS = 120_000

export function getProcessUptimeMs(): number {
  return Math.max(0, Date.now() - processStartAt)
}

export function isInStartupDegradeWindow(windowMs = STARTUP_DEGRADE_WINDOW_MS): boolean {
  if (!STARTUP_DEGRADE_ENABLED) return false
  return getProcessUptimeMs() < Math.max(0, windowMs)
}
