import type {
  AiCapabilityProviderBinding,
  AiProviderConfig
} from '~/types/aisdk'

/**
 * Capability binding enriched with provider metadata for UI rendering.
 */
export interface CapabilityBinding extends AiCapabilityProviderBinding {
  provider?: AiProviderConfig
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
