import type { EverythingStatusResponse } from '../../../shared/events/everything'

export type PlatformEverythingStatusSnapshot = Pick<
  EverythingStatusResponse,
  'enabled' | 'available' | 'errorCode'
>

export interface PlatformEverythingPort {
  getStatusSnapshot(): PlatformEverythingStatusSnapshot
}

export interface PlatformPorts {
  everything: PlatformEverythingPort
}

export interface PlatformPortsPatch {
  everything?: Partial<PlatformEverythingPort>
}

function createDefaultPlatformPorts(): PlatformPorts {
  return {
    everything: {
      getStatusSnapshot: () => ({
        enabled: false,
        available: false,
        errorCode: 'EVERYTHING_UNAVAILABLE'
      })
    }
  }
}

let activePlatformPorts: PlatformPorts = createDefaultPlatformPorts()

export function getPlatformPorts(): Readonly<PlatformPorts> {
  return activePlatformPorts
}

export function registerPlatformPorts(patch: PlatformPortsPatch): () => void {
  const previous = activePlatformPorts
  const next: PlatformPorts = {
    everything: { ...previous.everything, ...patch.everything }
  }
  activePlatformPorts = next
  return () => {
    if (activePlatformPorts === next) {
      activePlatformPorts = previous
    }
  }
}

export function resetPlatformPorts(): void {
  activePlatformPorts = createDefaultPlatformPorts()
}
