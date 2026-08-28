import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

export function isRiskControlFeatureEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return isFeatureFlagEnabled(config.riskControl?.enabled ?? config.public?.riskControl?.enabled, false)
}
