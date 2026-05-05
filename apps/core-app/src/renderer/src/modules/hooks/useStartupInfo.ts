import type { StartupContext, StartupInfo } from '@talex-touch/utils'
import { getStartupContext, getStartupContextSnapshot } from '@talex-touch/utils/preload'
import { computed, shallowRef, triggerRef } from 'vue'

const startupContextRef = shallowRef<StartupContext | null>(resolveInitialStartupContext())
const startupInfoRef = computed<StartupInfo | null>(
  () => startupContextRef.value?.startupInfo ?? null
)
let startupContextPromise: Promise<StartupContext | null> | null = null

function resolveInitialStartupContext(): StartupContext | null {
  return getStartupContextSnapshot()
}

export function useStartupInfo() {
  const ensureStartupContext = async (): Promise<StartupContext | null> => {
    if (startupContextRef.value?.startupInfo) {
      return startupContextRef.value
    }

    if (!startupContextPromise) {
      startupContextPromise = getStartupContext()
        .then((context) => {
          startupContextRef.value = context
          return context
        })
        .catch((error) => {
          startupContextPromise = null
          throw error
        })
    }

    return startupContextPromise
  }

  const ensureStartupInfo = async (): Promise<StartupInfo | null> => {
    const context = await ensureStartupContext()
    return context?.startupInfo ?? null
  }

  const setAppUpdate = (value: boolean) => {
    if (startupContextRef.value?.startupInfo) {
      startupContextRef.value.startupInfo.appUpdate = value
      triggerRef(startupContextRef)
    }
  }

  if (!startupContextPromise) {
    void ensureStartupContext().catch(() => {})
  }

  return {
    startupContext: startupContextRef,
    startupInfo: startupInfoRef,
    ensureStartupContext,
    ensureStartupInfo,
    setAppUpdate
  }
}
