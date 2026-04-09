export type PlatformCapabilityScope = 'system' | 'plugin' | 'ai'

export type PlatformCapabilityStatus = 'alpha' | 'beta' | 'stable'
export type PlatformCapabilitySupportLevel = 'supported' | 'best_effort' | 'unsupported'

export interface PlatformCapability {
  id: string
  name: string
  description: string
  scope: PlatformCapabilityScope
  status: PlatformCapabilityStatus
  supportLevel?: PlatformCapabilitySupportLevel
  limitations?: string[]
  sensitive?: boolean
}
