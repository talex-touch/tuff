import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true')
      return true
    if (normalized === 'false')
      return false
  }
  return fallback
}

export function isRiskControlEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return asBoolean(config.experimentalFeatures?.riskControlEnabled, false)
}

export function assertRiskControlEnabled(event: H3Event) {
  if (isRiskControlEnabled(event))
    return
  throw createError({
    statusCode: 404,
    statusMessage: 'Feature not found.',
  })
}

export function isWatermarkEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return asBoolean(config.experimentalFeatures?.watermarkEnabled, false)
}

export function assertWatermarkEnabled(event: H3Event) {
  if (isWatermarkEnabled(event))
    return
  throw createError({
    statusCode: 404,
    statusMessage: 'Feature not found.',
  })
}
