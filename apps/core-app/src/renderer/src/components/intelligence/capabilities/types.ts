import type {
  AiCapabilityProviderBinding,
  IntelligenceProviderConfig,
} from '@talex-touch/utils/types/intelligence'

/**
 * Capability binding enriched with provider metadata for UI rendering.
 */
export interface CapabilityBinding extends AiCapabilityProviderBinding {
  provider?: IntelligenceProviderConfig
}

/**
 * Result of a capability smoke test.
 */
export interface CapabilityTestResult {
  success: boolean
  message?: string
  latency?: number
  provider?: string
  model?: string
  textPreview?: string
  timestamp: number
}
