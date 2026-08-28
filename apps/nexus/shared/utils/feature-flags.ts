/**
 * Deployments set flags like NUXT_PUBLIC_RISK_CONTROL_ENABLED to values such as
 * "1", and Nitro's env override coerces that to the number 1 before it reaches
 * runtime config. A strict `=== true` reader then disagrees with the server's
 * normalizing reader: the API serves the feature while the UI redirects away
 * from it. Every boolean-ish flag read — client or server — goes through here.
 */
export function isFeatureFlagEnabled(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'number')
    return value === 1
  if (typeof value !== 'string')
    return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off')
    return false
  return fallback
}
