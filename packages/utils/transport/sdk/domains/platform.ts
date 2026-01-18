import type {
  PlatformCapabilityListRequest,
  PlatformCapabilityListResponse,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { PlatformEvents } from '../../events'

export interface PlatformSdk {
  listCapabilities: (
    payload?: PlatformCapabilityListRequest
  ) => Promise<PlatformCapabilityListResponse>
}

export function createPlatformSdk(transport: ITuffTransport): PlatformSdk {
  return {
    listCapabilities: payload =>
      transport.send(PlatformEvents.capabilities.list, payload ?? undefined),
  }
}
