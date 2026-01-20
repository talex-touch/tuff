import type { StartupInfo } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { shallowRef } from 'vue'

const startupInfoRef = shallowRef<StartupInfo | null>(resolveInitialStartupInfo())
let startupInfoPromise: Promise<StartupInfo | null> | null = null

function resolveInitialStartupInfo(): StartupInfo | null {
  const globalInfo = (globalThis as { $startupInfo?: StartupInfo }).$startupInfo
  return globalInfo ?? null
}

export function useStartupInfo() {
  const transport = useTuffTransport()

  const ensureStartupInfo = async (): Promise<StartupInfo | null> => {
    if (startupInfoRef.value) {
      return startupInfoRef.value
    }

    if (!startupInfoPromise) {
      startupInfoPromise = transport
        .send(AppEvents.system.startup, { rendererStartTime: performance.timeOrigin })
        .then((info) => {
          startupInfoRef.value = info
          return info
        })
        .catch((error) => {
          startupInfoPromise = null
          throw error
        })
    }

    return startupInfoPromise
  }

  const setAppUpdate = (value: boolean) => {
    if (startupInfoRef.value) {
      startupInfoRef.value.appUpdate = value
    }
  }

  return {
    startupInfo: startupInfoRef,
    ensureStartupInfo,
    setAppUpdate
  }
}
