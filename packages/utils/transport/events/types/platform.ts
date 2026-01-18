import type { PlatformCapability, PlatformCapabilityScope, PlatformCapabilityStatus } from '../../../types/platform'

export interface PlatformCapabilityListRequest {
  scope?: PlatformCapabilityScope
  status?: PlatformCapabilityStatus
}

export type PlatformCapabilityListResponse = PlatformCapability[]
