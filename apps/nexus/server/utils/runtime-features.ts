import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'

function asBoolean(value: unknown, fallback = false): boolean {
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

export function isWatermarkFeatureEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return asBoolean(config.watermark?.enabled ?? config.public?.watermark?.enabled, false)
}

export function isRiskControlFeatureEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return asBoolean(config.riskControl?.enabled ?? config.public?.riskControl?.enabled, false)
}
