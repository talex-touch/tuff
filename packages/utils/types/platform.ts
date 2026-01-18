export type PlatformCapabilityScope = 'system' | 'plugin' | 'ai'

export type PlatformCapabilityStatus = 'alpha' | 'beta' | 'stable'

export interface PlatformCapability {
  id: string
  name: string
  description: string
  scope: PlatformCapabilityScope
  status: PlatformCapabilityStatus
  sensitive?: boolean
}
